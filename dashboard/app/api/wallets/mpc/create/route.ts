import { NextRequest, NextResponse } from 'next/server';
import { defaultMpcEngine, defaultMpcSigner, type MpcCurve } from '@/lib/hedera/signing/mpcSigner';
import { createNativeHederaAccount } from '@/lib/hedera/nativeAccount';
import { assertPasskeyAuthorization } from '@/lib/auth/passkey';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId: reqUserId,
      curve = 'secp256k1',
      passkeyProof,
    } = body;

    // 1. Resolve Authenticated User ID
    let userId = reqUserId;
    const supabase = createServerSupabaseClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
      }
    } catch {}

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: User authentication required for native MPC wallet creation.' },
        { status: 401 }
      );
    }

    // 2. Strict Passkey Security Invariant Enforcement
    // Email or OAuth alone must NEVER authorize wallet recovery or payment signing/creation.
    assertPasskeyAuthorization({
      hasPasskeyProof: Boolean(passkeyProof?.verified || passkeyProof?.credentialId),
      credentialId: passkeyProof?.credentialId,
      authMethod: passkeyProof?.authMethod || 'passkey',
    });

    // 3. Distributed MPC Key Generation (2-of-3 Shamir Threshold Scheme)
    // Master scalar is split across 3 shares without being persisted in plaintext
    const selectedCurve: MpcCurve = curve === 'ed25519' ? 'ed25519' : 'secp256k1';
    const initialKey = defaultMpcEngine.generateThresholdKey('0.0.pending', selectedCurve);

    // 4. Create Native Hedera Testnet Account (No MetaMask / Browser Extension Required)
    const createdAccount = await createNativeHederaAccount({
      publicKeyHex: initialKey.publicKeyHex,
      curve: selectedCurve,
      initialBalanceHbar: 0.5,
    });

    // 5. Bind Account ID to Threshold Key & Register with MPC Signer Provider
    const finalKey = {
      ...initialKey,
      accountId: createdAccount.accountId,
    };
    defaultMpcSigner.registerMpcKey(finalKey);

    // 6. Persist Native MPC Wallet in Supabase Database
    try {
      // Clear any prior primary flag for this user
      await supabase
        .from('wallets')
        .update({ is_primary: false })
        .eq('user_id', userId);

      await supabase.from('wallets').insert({
        user_id: userId,
        address: createdAccount.accountId,
        evm_address: createdAccount.evmAddress,
        kind: 'hedera',
        network: 'hedera:testnet',
        public_key: finalKey.publicKeyHex,
        verified: true,
        is_primary: true,
        verification_metadata: {
          signer_type: 'native_mpc',
          smart_account_upgraded: true,
          mpc_enrolled: true,
          passkey_enrolled: true,
          curve: selectedCurve,
          threshold: '2-of-3',
          passkey_credential_id: passkeyProof?.credentialId,
          created_at: new Date().toISOString(),
        },
      });
    } catch (dbErr) {
      console.warn('[Native MPC Create] Supabase wallet persist notice:', dbErr);
    }

    // 7. Return Native Wallet Credentials (Exposing Share 3 to User for Recovery)
    return NextResponse.json({
      success: true,
      accountId: createdAccount.accountId,
      evmAddress: createdAccount.evmAddress,
      publicKeyHex: finalKey.publicKeyHex,
      threshold: finalKey.threshold,
      totalShares: finalKey.totalShares,
      userRecoveryShare: finalKey.userRecoveryShare, // Share 3
      status: 'active',
      signerType: 'native_mpc',
      network: 'hedera:testnet',
      chainId: 296,
      hashScanUrl: `https://hashscan.io/testnet/account/${createdAccount.accountId}`,
      notice: 'Native MPC Hedera Wallet created successfully with Passkey protection. No browser extension required.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create native MPC wallet';
    const isSecurityViolation = msg.includes('Security Invariant');
    return NextResponse.json(
      { success: false, error: msg },
      { status: isSecurityViolation ? 403 : 500 }
    );
  }
}
