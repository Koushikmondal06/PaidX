import { NextRequest, NextResponse } from 'next/server';
import { defaultMpcEngine, defaultMpcSigner, type MpcShare } from '@/lib/hedera/signing/mpcSigner';
import { assertPasskeyAuthorization } from '@/lib/auth/passkey';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      accountId,
      userRecoveryShare,
      passkeyProof,
    } = body;

    if (!accountId || !userRecoveryShare) {
      return NextResponse.json(
        { success: false, error: 'Missing accountId or userRecoveryShare for wallet recovery.' },
        { status: 400 }
      );
    }

    // 1. Strict Security Invariant: Email or OAuth alone must NEVER authorize wallet recovery
    assertPasskeyAuthorization({
      hasPasskeyProof: Boolean(passkeyProof?.verified || passkeyProof?.credentialId),
      credentialId: passkeyProof?.credentialId,
      authMethod: passkeyProof?.authMethod || 'passkey',
    });

    // 2. Validate User Recovery Share (Must be Share 3)
    const recoveryShare = userRecoveryShare as MpcShare;
    if (recoveryShare.index !== 3) {
      return NextResponse.json(
        { success: false, error: 'Invalid recovery share index: Expected Share 3 (User Recovery Share).' },
        { status: 400 }
      );
    }

    // 3. Find registered threshold key
    const existingKey = defaultMpcSigner.getKey(accountId);
    if (!existingKey) {
      return NextResponse.json(
        { success: false, error: `No active MPC key configuration found for account "${accountId}".` },
        { status: 404 }
      );
    }

    // 4. Recover master key via Share 3 + Server Share 2 (Disaster Recovery Mode)
    defaultMpcEngine.recoverKeyWithUserShare(existingKey, recoveryShare);

    // 5. Proactive Secret Sharing (PSS): Rotate shares immediately upon recovery
    // Generates fresh Share 1, Share 2, Share 3 using a zero-constant polynomial.
    // The Hedera on-chain public key remains identical; all old/leaked shares become obsolete!
    const rotatedKey = defaultMpcEngine.rotateThresholdShares(existingKey);
    defaultMpcSigner.registerMpcKey(rotatedKey);

    // 6. Update database metadata
    try {
      const supabase = createServerSupabaseClient();
      await supabase
        .from('wallets')
        .update({
          verification_metadata: {
            signer_type: 'native_mpc',
            smart_account_upgraded: true,
            mpc_enrolled: true,
            passkey_enrolled: true,
            key_rotation_count: rotatedKey.keyRotationCount,
            last_recovered_at: new Date().toISOString(),
          },
        })
        .eq('address', accountId);
    } catch {}

    return NextResponse.json({
      success: true,
      accountId,
      status: 'active',
      publicKeyHex: rotatedKey.publicKeyHex,
      keyRotationCount: rotatedKey.keyRotationCount,
      newUserRecoveryShare: rotatedKey.userRecoveryShare, // Fresh Share 3
      message: 'Wallet recovered and rotated successfully. Previous session shares have been invalidated.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Wallet recovery failed';
    const isSecurityViolation = msg.includes('Security Invariant');
    return NextResponse.json(
      { success: false, error: msg },
      { status: isSecurityViolation ? 403 : 500 }
    );
  }
}
