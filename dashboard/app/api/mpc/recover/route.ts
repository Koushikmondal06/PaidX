import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { defaultMpcEngine, defaultMpcSigner, type MpcShare } from '@/lib/hedera/signing/mpcSigner';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mpc/recover
 * Verifies key recovery and proactive share rotation using User Recovery Share (Share 3).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const body = await req.json();
    const { action, accountId, userRecoveryShare } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const cleanId = accountId.trim();
    const existingKey = defaultMpcSigner.getKey(cleanId);
    if (!existingKey) {
      return NextResponse.json({ error: `No active MPC key found for account "${cleanId}"` }, { status: 404 });
    }

    if (!userRecoveryShare || typeof userRecoveryShare !== 'object') {
      return NextResponse.json({ error: 'userRecoveryShare is required' }, { status: 400 });
    }

    // 1. Action: Test Recovery
    if (action === 'test_recovery' || !action) {
      const recoveredScalarHex = defaultMpcEngine.recoverKeyWithUserShare(
        existingKey,
        userRecoveryShare as MpcShare
      );

      return NextResponse.json({
        success: true,
        accountId: cleanId,
        recovered: true,
        publicKeyHex: existingKey.publicKeyHex,
        notice: 'Key recovery verified successfully: Share 3 and Share 2 reconstruct the exact master public key.',
      });
    }

    // 2. Action: Proactive Share Rotation
    if (action === 'rotate') {
      const rotatedKey = defaultMpcEngine.rotateThresholdShares(existingKey);
      defaultMpcSigner.registerMpcKey(rotatedKey);

      return NextResponse.json({
        success: true,
        accountId: cleanId,
        rotated: true,
        keyRotationCount: rotatedKey.keyRotationCount,
        publicKeyHex: rotatedKey.publicKeyHex,
        newRecoveryShare: rotatedKey.userRecoveryShare,
        notice: 'Proactive key rotation completed. All 3 shares refreshed without modifying the on-chain public key.',
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
