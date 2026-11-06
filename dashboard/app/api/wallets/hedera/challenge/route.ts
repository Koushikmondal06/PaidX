import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { isValidHederaAccountId } from '@/lib/hedera/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallets/hedera/challenge
 * Generates a signed cryptographic ownership challenge nonce for a Hedera account.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const { accountId } = body;

    if (!accountId || !isValidHederaAccountId(accountId)) {
      return NextResponse.json(
        { error: `Invalid Hedera account ID format: "${accountId}". Expected "0.0.123456"` },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const challenge = `paidx:link-hedera-wallet:${user.id}:${accountId.trim()}:${timestamp}:${nonce}`;

    return NextResponse.json({
      success: true,
      accountId: accountId.trim(),
      challenge,
      timestamp,
      expiresInSeconds: 300,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
