import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CHAIN_ID, PAYMENT_TOKEN_ADDRESS } from '@/lib/base';

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

    if (!walletId || !sessionAccountAddress || !limitAmount || !periodSeconds || !validUntil) {
      return NextResponse.json(
        { error: 'Missing required permission parameters' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify wallet ownership
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('id, user_id, chain_id')
      .eq('id', walletId)
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found or not owned by user' },
        { status: 403 }
      );
    }

    // Insert active permission record
    const { data: permission, error: insertError } = await supabase
      .from('permissions')
      .insert({
        user_id: user.id,
        wallet_id: wallet.id,
        chain_id: wallet.chain_id || CHAIN_ID,
        session_account_address: sessionAccountAddress.toLowerCase(),
        token_address: (tokenAddress || PAYMENT_TOKEN_ADDRESS).toLowerCase(),
        permission_type: 'erc20_periodic',
        period_seconds: Number(periodSeconds),
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
