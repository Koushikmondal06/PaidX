import { NextRequest, NextResponse } from 'next/server';
import { isAddress, verifyMessage, recoverMessageAddress } from 'viem';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { isValidHederaAccountId, getHederaClient } from '@/lib/hedera/client';
import {
  getMirrorAccount,
  getMirrorAccountByEvmAddress,
  getMirrorAccountBalance,
  getHashScanAccountUrl,
} from '@/lib/hedera/mirrorNode';
import { keyStructureMatches, delegatedSigner, type MirrorKeyNode } from '@/lib/hedera/signing/delegatedSigner';
import { PrivateKey, PublicKey } from '@hiero-ledger/sdk';
import type { Database } from '@/lib/supabase/types';
import { memoryChallengeRegistry } from '@/lib/hedera/challenges';
import { HEDERA_TESTNET_CHAIN_ID, HEDERA_MAINNET_CHAIN_ID } from '@/lib/hedera/chain';

export const dynamic = 'force-dynamic';

type WalletRow = Database['public']['Tables']['wallets']['Row'];

/**
 * GET /api/wallets/hedera
 * Retrieves the currently linked Hedera wallet(s) for the authenticated user,
 * along with live Mirror Node verification status and balances.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const supabase = createServerSupabaseClient();
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('kind', 'hedera')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({
        wallet: null,
        wallets: [],
        hasLinkedWallet: false,
      });
    }

    const walletList = wallets as unknown as WalletRow[];
    const primaryWallet = walletList.find((w: WalletRow) => w.is_primary) || walletList[0];

    // Fetch live Mirror Node balance and verification for primary wallet
    let mirrorBalance: { hbarBalance: string; tokens: Array<{ token_id: string; balance: number }> } | null = null;
    let isLiveVerified = false;

    try {
      const mirrorAcc = await getMirrorAccount(primaryWallet.address);
      if (mirrorAcc && !mirrorAcc.deleted) {
        isLiveVerified = true;
      }
      const rawBal = await getMirrorAccountBalance(primaryWallet.address);
      if (rawBal) {
        mirrorBalance = {
          hbarBalance: (rawBal.balance / 100_000_000).toFixed(4),
          tokens: rawBal.tokens || [],
        };
      }
    } catch {
      // In offline / unit test mode, balance lookup is non-blocking
    }

    const primaryMetadata = primaryWallet.verification_metadata as Record<string, any> | null;

    return NextResponse.json({
      hasLinkedWallet: true,
      wallet: {
        id: primaryWallet.id,
        address: primaryWallet.address,
        network: primaryWallet.network || 'hedera:testnet',
        chainId: primaryWallet.chain_id,
        verified: Boolean(primaryWallet.verified && isLiveVerified),
        publicKey: primaryWallet.public_key,
        evmAddress: primaryWallet.evm_address || null,
        signerType: primaryMetadata?.signer_type || 'native_hedera',
        smartAccountUpgraded: Boolean(primaryWallet.smart_account_upgraded || primaryMetadata?.mpc_enrolled),
        mpcEnrolled: Boolean(primaryMetadata?.mpc_enrolled),
        verificationMetadata: primaryMetadata || null,
        verificationMethod: primaryMetadata?.verification_method || 'manual',
        isPrimary: primaryWallet.is_primary,
        hashScanUrl: getHashScanAccountUrl(primaryWallet.address, 'testnet'),
        balance: mirrorBalance,
        createdAt: primaryWallet.created_at,
      },
      wallets: walletList.map((w: WalletRow) => ({
        id: w.id,
        address: w.address,
        evmAddress: w.evm_address || null,
        network: w.network || 'hedera:testnet',
        isPrimary: w.is_primary,
        verified: w.verified,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/wallets/hedera
 * Registers or links a Hedera account to the authenticated user.
 * Supports:
 *   1. MetaMask EVM wallet linking (chain ID 296, personal_sign challenge)
 *   2. Native Hedera account ID & key linking
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const {
      evmAddress,
      accountId,
      network = 'hedera:testnet',
      chainId = HEDERA_TESTNET_CHAIN_ID,
      action,
      nonce,
      publicKey,
      signingKey, // Optional private key provided during onboarding for native agent signing
      signature,  // Challenge signature
      challenge,  // Challenge string that was signed
    } = body;

    // Validate chain ID & network
    const cleanNetwork = network === 'hedera:mainnet' ? 'hedera:mainnet' : 'hedera:testnet';
    const cleanChainId = typeof chainId === 'string' ? parseInt(chainId, 10) : Number(chainId);

    if (cleanChainId !== HEDERA_TESTNET_CHAIN_ID && cleanChainId !== HEDERA_MAINNET_CHAIN_ID) {
      return NextResponse.json(
        {
          error: `Invalid chain ID: ${chainId}. Expected Hedera Testnet (${HEDERA_TESTNET_CHAIN_ID}).`,
        },
        { status: 400 }
      );
    }

    if (network !== 'hedera:testnet' && network !== 'hedera:mainnet') {
      return NextResponse.json(
        {
          error: `Invalid network: "${network}". Expected "hedera:testnet".`,
        },
        { status: 400 }
      );
    }

    // =========================================================================
    // BRANCH A: MetaMask EVM Wallet Linking
    // =========================================================================
    if (evmAddress && typeof evmAddress === 'string') {
      const cleanEvmAddress = evmAddress.trim().toLowerCase();

      if (!isAddress(cleanEvmAddress)) {
        return NextResponse.json(
          { error: `Invalid EVM address format: "${evmAddress}". Expected "0x..." 40-character hex address.` },
          { status: 400 }
        );
      }

      if (!signature || !challenge) {
        return NextResponse.json(
          { error: 'MetaMask wallet linking requires both "challenge" and "signature".' },
          { status: 400 }
        );
      }

      if (action && action !== 'link-metamask-hedera') {
        return NextResponse.json(
          { error: `Invalid action: "${action}". Expected "link-metamask-hedera".` },
          { status: 400 }
        );
      }

      // 1. Enforce single-use challenge & replay protection
      if (nonce && typeof nonce === 'string') {
        const memRecord = memoryChallengeRegistry.get(nonce);
        if (memRecord) {
          if (memRecord.used) {
            return NextResponse.json(
              { error: 'Replay detected: This challenge nonce has already been used. Please request a new challenge.' },
              { status: 403 }
            );
          }
          if (Date.now() > memRecord.expiresAt) {
            return NextResponse.json(
              { error: 'Verification challenge has expired. Please request a new challenge.' },
              { status: 400 }
            );
          }
          if (memRecord.userId !== user.id) {
            return NextResponse.json(
              { error: 'Challenge mismatch: Challenge was issued to a different user session.' },
              { status: 403 }
            );
          }
          if (memRecord.walletAddress.toLowerCase() !== cleanEvmAddress) {
            return NextResponse.json(
              { error: 'Challenge mismatch: Challenge was issued to a different EVM address.' },
              { status: 403 }
            );
          }
          // Mark single-use challenge as consumed
          memRecord.used = true;
          memRecord.used_at = Date.now();
        }
      }

      // Also verify binding inside the challenge text
      if (!challenge.toLowerCase().includes(user.id.toLowerCase())) {
        return NextResponse.json(
          { error: 'Challenge mismatch: Challenge message does not bind the authenticated user ID.' },
          { status: 403 }
        );
      }
      if (!challenge.toLowerCase().includes(cleanEvmAddress)) {
        return NextResponse.json(
          { error: 'Challenge mismatch: Challenge message does not bind the claimed EVM address.' },
          { status: 403 }
        );
      }

      // 2. Verify Cryptographic EVM Signature using viem
      let isSigValid = false;
      let recoveredAddress = '';

      try {
        isSigValid = await verifyMessage({
          address: cleanEvmAddress as `0x${string}`,
          message: challenge,
          signature: signature as `0x${string}`,
        });
        recoveredAddress = await recoverMessageAddress({
          message: challenge,
          signature: signature as `0x${string}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid signature format';
        return NextResponse.json(
          { error: `Cryptographic signature verification failed: ${msg}` },
          { status: 403 }
        );
      }

      if (!isSigValid || recoveredAddress.toLowerCase() !== cleanEvmAddress) {
        return NextResponse.json(
          {
            error: `Cryptographic signature verification failed: Recovered signer "${recoveredAddress}" does not match claimed address "${cleanEvmAddress}".`,
          },
          { status: 403 }
        );
      }

      // 3. Resolve MetaMask EVM address to Hedera Account via Mirror Node
      let mirrorAccount;
      try {
        mirrorAccount = await getMirrorAccountByEvmAddress(cleanEvmAddress);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: `Mirror Node query failed for EVM address "${cleanEvmAddress}": ${msg}` },
          { status: 502 }
        );
      }

      if (!mirrorAccount) {
        // Attempt automated on-chain activation if operator credentials are provided
        const operatorIdStr = process.env.HEDERA_OPERATOR_ID;
        const operatorKeyStr = process.env.HEDERA_OPERATOR_KEY;

        if (operatorIdStr && operatorKeyStr) {
          try {
            const { TransferTransaction, Hbar, AccountId } = await import('@hiero-ledger/sdk');
            const client = getHederaClient();
            const operatorId = AccountId.fromString(operatorIdStr);
            const evmAccountId = AccountId.fromEvmAddress(0, 0, cleanEvmAddress);

            // Transfer nominal 0.05 HBAR to EVM alias to trigger Hedera HIP-583 automatic account creation
            const tx = await new TransferTransaction()
              .addHbarTransfer(operatorId, new Hbar(-0.05))
              .addHbarTransfer(evmAccountId, new Hbar(0.05))
              .execute(client);

            const receipt = await tx.getReceipt(client);
            if (receipt.status.toString() === 'SUCCESS') {
              // Wait briefly for Mirror Node ingestion
              await new Promise((r) => setTimeout(r, 2000));
              mirrorAccount = await getMirrorAccountByEvmAddress(cleanEvmAddress);
            }
          } catch (autoErr) {
            console.warn('[Auto-activation] Sponsoring account creation failed:', autoErr);
          }
        }
      }

      if (!mirrorAccount) {
        return NextResponse.json(
          {
            error: `Hedera account not found for EVM address ${cleanEvmAddress}. On Hedera, an EVM address must be activated on-chain before it can be linked. Please fund your address with Hedera Testnet HBAR (e.g., via the Hedera Portal faucet at portal.hedera.com) to activate your account.`,
            evmAddress: cleanEvmAddress,
            requiresActivation: true,
            faucetUrl: 'https://portal.hedera.com',
            hashScanUrl: `https://hashscan.io/testnet/account/${cleanEvmAddress}`,
          },
          { status: 404 }
        );
      }

      if (mirrorAccount.deleted) {
        return NextResponse.json(
          { error: `Hedera account for EVM address "${cleanEvmAddress}" is marked as deleted on Mirror Node. Cannot link deleted accounts.` },
          { status: 400 }
        );
      }

      const resolvedAccountId = mirrorAccount.account;

      // 4. Verify Account Identity & Key-Control Compatibility (Requirement 8)
      if (mirrorAccount.evm_address && mirrorAccount.evm_address.toLowerCase() !== cleanEvmAddress) {
        return NextResponse.json(
          {
            error: `Key-control mismatch: Recovered EVM address "${cleanEvmAddress}" does not match on-chain Hedera account's EVM address "${mirrorAccount.evm_address}".`,
          },
          { status: 403 }
        );
      }

      if (mirrorAccount.key && mirrorAccount.key._type && mirrorAccount.key._type !== 'ECDSA_SECP256K1') {
        return NextResponse.json(
          {
            error: `Key-control incompatibility: Hedera account "${resolvedAccountId}" is governed by an incompatible key type (${mirrorAccount.key._type}). MetaMask EVM signatures can only verify ECDSA_SECP256K1 accounts.`,
          },
          { status: 403 }
        );
      }

      const supabase = createServerSupabaseClient();

      // 5. Cross-User Claim Protection
      const { data: existingWallet } = await supabase
        .from('wallets')
        .select('id, user_id, address, kind')
        .eq('chain_id', cleanChainId)
        .eq('address', resolvedAccountId.toLowerCase())
        .maybeSingle();

      if (existingWallet && existingWallet.user_id !== user.id) {
        // User proved key control through valid EVM signature: reassign wallet to authenticated user
        const { data: reassignedWallet, error: reassignError } = await supabase
          .from('wallets')
          .update({
            user_id: user.id,
            is_primary: true,
            public_key: mirrorAccount.key?.key || null,
            evm_address: cleanEvmAddress,
            verified: true,
            verification_metadata: {
              signer_type: 'metamask_evm',
              verification_method: 'metamask_evm_signature',
              evm_address: cleanEvmAddress,
              reassigned_from: existingWallet.user_id,
              reassigned_at: new Date().toISOString(),
              action: action || 'link-metamask-hedera',
              nonce: nonce || null,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingWallet.id)
          .select()
          .single();

        if (reassignError || !reassignedWallet) {
          return NextResponse.json({ error: reassignError?.message || 'Failed to reassign wallet' }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: `Hedera account "${resolvedAccountId}" (EVM: ${cleanEvmAddress}) ownership verified and transferred to your account via MetaMask.`,
          wallet: reassignedWallet,
        });
      }

      // 6. Unset is_primary on any existing Hedera wallets of this user
      await supabase
        .from('wallets')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('kind', 'hedera');

      // 7. Upsert the Hedera wallet record strictly bound to user.id
      const { data: walletRecord, error: upsertError } = await supabase
        .from('wallets')
        .upsert(
          {
            user_id: user.id,
            address: resolvedAccountId.toLowerCase(),
            chain_id: cleanChainId,
            kind: 'hedera',
            is_primary: true,
            smart_account_upgraded: false,
            network: cleanNetwork,
            public_key: mirrorAccount.key?.key || null,
            evm_address: cleanEvmAddress,
            verified: true,
            verification_metadata: {
              signer_type: 'metamask_evm',
              verification_method: 'metamask_evm_signature',
              evm_address: cleanEvmAddress,
              chain_id: cleanChainId,
              action: action || 'link-metamask-hedera',
              nonce: nonce || null,
              verified_at: new Date().toISOString(),
              key_type: mirrorAccount.key?._type,
              mirror_account: mirrorAccount.account,
            },
          },
          { onConflict: 'chain_id, address' }
        )
        .select()
        .single();

      if (upsertError || !walletRecord) {
        return NextResponse.json(
          { error: upsertError?.message || 'Failed to register Hedera wallet in database' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Hedera wallet "${resolvedAccountId}" (EVM: ${cleanEvmAddress}) successfully verified & linked via MetaMask.`,
        wallet: {
          id: walletRecord.id,
          address: walletRecord.address,
          evmAddress: walletRecord.evm_address,
          network: walletRecord.network,
          chainId: walletRecord.chain_id,
          verified: walletRecord.verified,
          publicKey: walletRecord.public_key,
          isPrimary: walletRecord.is_primary,
          signerType: 'metamask_evm',
          hashScanUrl: getHashScanAccountUrl(walletRecord.address, 'testnet'),
        },
      });
    }

    // =========================================================================
    // BRANCH B: Native Hedera Account ID & Key Linking
    // =========================================================================
    if (!accountId || typeof accountId !== 'string' || !isValidHederaAccountId(accountId.trim())) {
      return NextResponse.json(
        {
          error: `Invalid Hedera account ID format: "${accountId}". Expected format: "0.0.123456"`,
        },
        { status: 400 }
      );
    }

    const cleanAccountId = accountId.trim();

    // Query Hedera Mirror Node for account status and key structure
    let mirrorAccount;
    try {
      mirrorAccount = await getMirrorAccount(cleanAccountId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Mirror Node query failed for account "${cleanAccountId}": ${msg}` },
        { status: 502 }
      );
    }

    if (!mirrorAccount) {
      return NextResponse.json(
        {
          error: `Hedera account "${cleanAccountId}" does not exist on ${cleanNetwork}. Please verify the account ID on HashScan.`,
        },
        { status: 404 }
      );
    }

    if (mirrorAccount.deleted) {
      return NextResponse.json(
        { error: `Hedera account "${cleanAccountId}" is marked as deleted on Mirror Node. Cannot link deleted accounts.` },
        { status: 400 }
      );
    }

    if (!mirrorAccount.key) {
      return NextResponse.json(
        { error: `Hedera account "${cleanAccountId}" has no public key registered on Mirror Node.` },
        { status: 400 }
      );
    }

    // Verify Account Ownership & Key Control
    let verifiedPublicKeyHex = '';
    let verificationMethod = 'unverified';
    let hasCryptographicKeyProof = false;

    // Case A: User supplied signingKey (e.g. for delegated agent execution in dev/test)
    if (signingKey && typeof signingKey === 'string') {
      try {
        const cleanKey = signingKey.trim();
        const privKey = cleanKey.startsWith('0x')
          ? PrivateKey.fromStringECDSA(cleanKey)
          : PrivateKey.fromString(cleanKey);

        const keyMatches = keyStructureMatches(
          mirrorAccount.key as MirrorKeyNode,
          privKey.publicKey
        );

        if (!keyMatches) {
          return NextResponse.json(
            {
              error: `Cryptographic key mismatch: The provided signing key does not control on-chain account "${cleanAccountId}".`,
            },
            { status: 403 }
          );
        }

        verifiedPublicKeyHex = privKey.publicKey.toStringRaw();
        verificationMethod = 'delegated_signing_key_proof';
        hasCryptographicKeyProof = true;

        // Register in isolated in-memory signer registry for agent session execution
        delegatedSigner.registerAccountKey(cleanAccountId, cleanKey);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid private key format';
        return NextResponse.json(
          { error: `Failed to verify signing key: ${msg}` },
          { status: 400 }
        );
      }
    }
    // Case B: User supplied a cryptographic challenge signature
    else if (signature && challenge) {
      try {
        // Validate challenge format and freshness (< 5 minutes)
        if (!challenge.startsWith(`paidx:link-hedera-wallet:${user.id}:${cleanAccountId}:`)) {
          return NextResponse.json(
            { error: 'Invalid challenge: Challenge string does not match authenticated user and account.' },
            { status: 400 }
          );
        }

        const parts = challenge.split(':');
        const timestamp = parseInt(parts[4] || '0', 10);
        if (Date.now() - timestamp > 5 * 60 * 1000) {
          return NextResponse.json(
            { error: 'Verification challenge has expired. Please request a new challenge.' },
            { status: 400 }
          );
        }

        // Verify single-use nonce if provided
        if (nonce && typeof nonce === 'string') {
          const memRecord = memoryChallengeRegistry.get(nonce);
          if (memRecord) {
            if (memRecord.used) {
              return NextResponse.json(
                { error: 'Replay detected: Challenge nonce has already been used.' },
                { status: 403 }
              );
            }
            memRecord.used = true;
          }
        }

        // Resolve candidate public key from payload or Mirror Node leaf key
        const rawPub = publicKey || mirrorAccount.key.key;
        if (!rawPub) {
          return NextResponse.json(
            { error: 'Missing public key to verify signature against.' },
            { status: 400 }
          );
        }

        const candidatePubKey = rawPub.startsWith('0x')
          ? PublicKey.fromStringECDSA(rawPub)
          : PublicKey.fromString(rawPub);

        const keyMatches = keyStructureMatches(
          mirrorAccount.key as MirrorKeyNode,
          candidatePubKey
        );

        if (!keyMatches) {
          return NextResponse.json(
            { error: 'Public key does not match on-chain key structure.' },
            { status: 403 }
          );
        }

        // Verify cryptographic signature
        const isSigValid = candidatePubKey.verify(
          Buffer.from(challenge),
          Buffer.from(signature.replace(/^0x/, ''), 'hex')
        );

        if (!isSigValid) {
          return NextResponse.json(
            { error: 'Cryptographic signature verification failed. Key control not proven.' },
            { status: 403 }
          );
        }

        verifiedPublicKeyHex = candidatePubKey.toStringRaw();
        verificationMethod = 'challenge_signature';
        hasCryptographicKeyProof = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Signature verification error';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
    // Case C: User supplied a matching public key
    else if (publicKey && typeof publicKey === 'string') {
      try {
        const candidatePubKey = publicKey.trim().startsWith('0x')
          ? PublicKey.fromStringECDSA(publicKey.trim())
          : PublicKey.fromString(publicKey.trim());

        const keyMatches = keyStructureMatches(
          mirrorAccount.key as MirrorKeyNode,
          candidatePubKey
        );

        if (!keyMatches) {
          return NextResponse.json(
            {
              error: `Public key mismatch: Provided public key does not match on-chain key structure for account "${cleanAccountId}".`,
            },
            { status: 403 }
          );
        }

        verifiedPublicKeyHex = candidatePubKey.toStringRaw();
        verificationMethod = 'public_key_match';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid public key format';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        {
          error:
            'Ownership verification required: Please provide a challenge signature, registered public key, or authorized delegated signing key.',
        },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Cross-User Ownership Protection
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id, user_id, address, kind')
      .eq('chain_id', cleanChainId)
      .eq('address', cleanAccountId.toLowerCase())
      .maybeSingle();

    if (existingWallet) {
      if (existingWallet.user_id !== user.id) {
        if (!hasCryptographicKeyProof) {
          return NextResponse.json(
            {
              error:
                'Forbidden: This Hedera account is already registered to another PaidX user. You must prove cryptographic key control (via signature or signing key) to transfer ownership.',
            },
            { status: 403 }
          );
        }

        const { data: reassignedWallet, error: reassignError } = await supabase
          .from('wallets')
          .update({
            user_id: user.id,
            is_primary: true,
            public_key: verifiedPublicKeyHex,
            verified: true,
            verification_metadata: {
              signer_type: 'native_hedera',
              reassigned_from: existingWallet.user_id,
              reassigned_at: new Date().toISOString(),
              verification_method: verificationMethod,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingWallet.id)
          .select()
          .single();

        if (reassignError || !reassignedWallet) {
          return NextResponse.json({ error: reassignError?.message || 'Failed to reassign wallet' }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: `Hedera account "${cleanAccountId}" ownership verified and transferred to your account.`,
          wallet: reassignedWallet,
        });
      }
    }

    // Unset is_primary on any existing Hedera wallets of this user
    await supabase
      .from('wallets')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('kind', 'hedera');

    // Upsert the Hedera wallet record strictly bound to the authenticated user.id
    const { data: walletRecord, error: upsertError } = await supabase
      .from('wallets')
      .upsert(
        {
          user_id: user.id,
          address: cleanAccountId.toLowerCase(),
          chain_id: cleanChainId,
          kind: 'hedera',
          is_primary: true,
          smart_account_upgraded: false,
          network: cleanNetwork,
          public_key: verifiedPublicKeyHex,
          verified: true,
          verification_metadata: {
            signer_type: 'native_hedera',
            verified_at: new Date().toISOString(),
            mirror_account: mirrorAccount.account,
            key_type: mirrorAccount.key?._type,
            verification_method: verificationMethod,
          },
          evm_address: mirrorAccount.evm_address || null,
        },
        { onConflict: 'chain_id, address' }
      )
      .select()
      .single();

    if (upsertError || !walletRecord) {
      return NextResponse.json(
        { error: upsertError?.message || 'Failed to register Hedera wallet in database' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Hedera wallet "${cleanAccountId}" successfully verified and linked to your account.`,
      wallet: {
        id: walletRecord.id,
        address: walletRecord.address,
        network: walletRecord.network,
        chainId: walletRecord.chain_id,
        verified: walletRecord.verified,
        publicKey: walletRecord.public_key,
        isPrimary: walletRecord.is_primary,
        signerType: 'native_hedera',
        hashScanUrl: getHashScanAccountUrl(walletRecord.address, 'testnet'),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
