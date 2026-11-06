import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServerPublicClient, CHAIN_ID } from '@/lib/chain';
import { getOfficial7702DeleGatorAddress } from '@/lib/eip7702';
import { isAddress, type Address } from 'viem';

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

    const { address } = await req.json();

    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: 'Invalid or missing Ethereum address' }, { status: 400 });
    }

    const targetAddress = address.toLowerCase() as Address;

    // Authoritative server-side bytecode check using RPC_URL_SERVER
    let isUpgraded = false;
    let upgradeWarning: string | undefined;

    try {
      const publicClient = getServerPublicClient();
      const code = await publicClient.getCode({ address: targetAddress });

      if (code && code !== '0x') {
        const lowerCode = code.toLowerCase();
        if (lowerCode.startsWith('0xef0100') && lowerCode.length >= 48) {
          const delegate = `0x${lowerCode.substring(8, 48)}`;
          const officialImpl = getOfficial7702DeleGatorAddress(CHAIN_ID).toLowerCase();

          if (delegate === officialImpl) {
            isUpgraded = true;
          } else {
            upgradeWarning = `Account delegated to foreign contract (${delegate})`;
          }
        }
      }
    } catch (rpcErr: unknown) {
      console.warn('[Server Wallet Bytecode Notice]:', rpcErr);
      // If RPC fails, do not trust client value; default to false
      isUpgraded = false;
    }

    const supabase = createServerSupabaseClient();

    const { data: wallet, error: dbError } = await supabase
      .from('wallets')
      .upsert(
        {
          user_id: user.id,
          address: targetAddress,
          chain_id: CHAIN_ID,
          kind: isUpgraded ? 'metamask_smart_account' : 'eoa',
          is_primary: true,
          smart_account_upgraded: isUpgraded,
        },
        { onConflict: 'chain_id, address' }
      )
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      wallet,
      isUpgraded,
      warning: upgradeWarning,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error saving wallet';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

