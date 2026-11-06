import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CHAIN_ID, PAYMENT_TOKEN_ADDRESS } from '@/lib/base';
import { getServerPublicClient } from '@/lib/chain';
import { getOfficial7702DeleGatorAddress } from '@/lib/eip7702';
import type { Address } from 'viem';

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
      .select('id, user_id, chain_id, address')
      .eq('id', walletId)
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found or not owned by user' },
        { status: 403 }
      );
    }

    // Authoritative server-side verification of smart account upgrade status
    try {
      if (wallet.address) {
        const publicClient = getServerPublicClient();
        const code = await publicClient.getCode({ address: wallet.address as Address });
        if (code && code.toLowerCase().startsWith('0xef0100') && code.length >= 48) {
          const delegate = `0x${code.substring(8, 48)}`.toLowerCase();
          const official = getOfficial7702DeleGatorAddress(CHAIN_ID).toLowerCase();
          if (delegate === official) {
            await supabase
              .from('wallets')
              .update({ smart_account_upgraded: true, kind: 'metamask_smart_account' })
              .eq('id', wallet.id);
          }
        }
      }
    } catch (checkErr) {
      console.warn('[Permissions] Server upgrade verification notice:', checkErr);
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

