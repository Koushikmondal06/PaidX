import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CHAIN_ID, PAYMENT_TOKEN_ADDRESS } from '@/lib/base';
import { getServerPublicClient } from '@/lib/chain';
import { getOfficial7702DeleGatorAddress } from '@/lib/eip7702';
import { getSessionAccountAddress } from '@/lib/server/sessionAccount';
import { isAddress, type Address, type Hash } from 'viem';

export const dynamic = 'force-dynamic';

async function authenticateUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      walletId,
      sessionAccountAddress,
      tokenAddress,
      periodSeconds,
      limitAmount,
      validAfter,
      validUntil,
      grantPayload,
    } = body;

    // Validate parameters
    if (!walletId || !sessionAccountAddress || !limitAmount || !periodSeconds || !validUntil) {
      return NextResponse.json(
        { error: 'Missing required permission parameters', code: 'MISSING_PARAMS' },
        { status: 400 }
      );
    }

    const periodSec = Number(periodSeconds);
    if (isNaN(periodSec) || periodSec <= 0) {
      return NextResponse.json({ error: 'periodSeconds must be a positive integer', code: 'INVALID_PERIOD' }, { status: 400 });
    }

    try {
      const amt = BigInt(limitAmount);
      if (amt <= 0n) throw new Error();
    } catch {
      return NextResponse.json({ error: 'limitAmount must be a positive integer string', code: 'INVALID_AMOUNT' }, { status: 400 });
    }

    const expectedSession = getSessionAccountAddress();
    if (expectedSession && sessionAccountAddress.toLowerCase() !== expectedSession.toLowerCase()) {
      return NextResponse.json({ error: 'Mismatched session account address', code: 'INVALID_SESSION_ACCOUNT' }, { status: 400 });
    }

    const expectedToken = PAYMENT_TOKEN_ADDRESS.toLowerCase();
    const providedToken = (tokenAddress || PAYMENT_TOKEN_ADDRESS).toLowerCase();
    if (providedToken !== expectedToken) {
      return NextResponse.json({ error: 'Unsupported token address. Only official Sepolia USDC is accepted.', code: 'UNSUPPORTED_TOKEN' }, { status: 400 });
    }

    const validUntilDate = new Date(validUntil);
    if (isNaN(validUntilDate.getTime()) || validUntilDate <= new Date()) {
      return NextResponse.json({ error: 'validUntil must be a valid timestamp in the future', code: 'INVALID_EXPIRY' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify wallet ownership
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, user_id, chain_id, address')
      .eq('id', walletId)
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found or not owned by user', code: 'WALLET_NOT_FOUND' },
        { status: 403 }
      );
    }

    // Verify on-chain approval receipt if provided
    if (grantPayload?.approvalTxHash) {
      try {
        const publicClient = getServerPublicClient();
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: grantPayload.approvalTxHash as Hash,
          confirmations: 1,
          timeout: 60_000,
        });
        if (receipt.status !== 'success') {
          return NextResponse.json({ error: 'On-chain allowance transaction reverted on Sepolia', code: 'APPROVAL_REVERTED' }, { status: 400 });
        }
      } catch (receiptErr) {
        console.warn('[Permissions] Allowance receipt verification notice:', receiptErr);
      }
    }

    // Supersede any existing active permissions for this user
    await supabase
      .from('permissions')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('status', 'active');

    // Insert active permission record
    const { data: permission, error: insertError } = await supabase
      .from('permissions')
      .insert({
        user_id: user.id,
        wallet_id: wallet.id,
        chain_id: wallet.chain_id || CHAIN_ID,
        session_account_address: sessionAccountAddress.toLowerCase(),
        token_address: providedToken,
        permission_type: 'erc20_periodic',
        period_seconds: periodSec,
        limit_per_period: limitAmount.toString(),
        remaining_in_period: limitAmount.toString(),
        current_period_start: new Date().toISOString(),
        valid_after: validAfter || new Date().toISOString(),
        valid_until: validUntil,
        status: 'active',
        grant_payload: grantPayload || {},
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, permission });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error creating permission';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
