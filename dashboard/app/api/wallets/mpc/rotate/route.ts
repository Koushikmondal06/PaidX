import { NextRequest, NextResponse } from 'next/server';
import { defaultMpcEngine, defaultMpcSigner } from '@/lib/hedera/signing/mpcSigner';
import { assertPasskeyAuthorization } from '@/lib/auth/passkey';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, passkeyProof } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'Missing accountId for share rotation.' },
        { status: 400 }
      );
    }

    // Passkey verification required for share rotation
    assertPasskeyAuthorization({
      hasPasskeyProof: Boolean(passkeyProof?.verified || passkeyProof?.credentialId),
      credentialId: passkeyProof?.credentialId,
      authMethod: passkeyProof?.authMethod || 'passkey',
    });

    const key = defaultMpcSigner.getKey(accountId);
    if (!key) {
      return NextResponse.json(
        { success: false, error: `No active MPC key configuration found for account "${accountId}".` },
        { status: 404 }
      );
    }

    // Proactive Secret Sharing (PSS): Update shares with random zero-polynomial
    const rotatedKey = defaultMpcEngine.rotateThresholdShares(key);
    defaultMpcSigner.registerMpcKey(rotatedKey);

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
            last_rotated_at: new Date().toISOString(),
          },
        })
        .eq('address', accountId);
    } catch {}

    return NextResponse.json({
      success: true,
      accountId,
      publicKeyHex: rotatedKey.publicKeyHex,
      keyRotationCount: rotatedKey.keyRotationCount,
      newUserRecoveryShare: rotatedKey.userRecoveryShare,
      message: 'Proactive share rotation completed successfully. Old key shares are rendered obsolete.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Share rotation failed';
    const isSecurityViolation = msg.includes('Security Invariant');
    return NextResponse.json(
      { success: false, error: msg },
      { status: isSecurityViolation ? 403 : 500 }
    );
  }
}
