import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServerPublicClient, CHAIN_ID } from '@/lib/chain';
import { getOfficial7702DeleGatorAddress } from '@/lib/eip7702';
import { isAddress, verifyMessage, type Address, type Hex } from 'viem';

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

    const { address, signature, challenge } = await req.json();

    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: 'Invalid or missing Ethereum address' }, { status: 400 });
    }

    const targetAddress = address.toLowerCase() as Address;

    // Optional / verified EIP-191 ownership proof check
    if (signature && challenge) {
      try {
        const isValid = await verifyMessage({
          address: targetAddress,
          message: challenge,
          signature: signature as Hex,
        });

        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid wallet ownership signature', code: 'INVALID_SIGNATURE' },
            { status: 401 }
          );
        }
      } catch (sigErr) {
        return NextResponse.json(
          { error: 'Signature verification failed', code: 'INVALID_SIGNATURE' },
          { status: 400 }
        );
      }
    }

    const supabase = createServerSupabaseClient();

    // Cross-user claim protection: 409 if address belongs to another user
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id, user_id, address')
      .eq('address', targetAddress)
      .maybeSingle();

    if (existingWallet && existingWallet.user_id !== user.id) {
      return NextResponse.json(
        { error: 'This wallet address is already linked to another user account', code: 'WALLET_CONFLICT' },
        { status: 409 }
      );
    }

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
      isUpgraded = false;
    }

    // Demote any existing primary wallets for this user first
    await supabase
      .from('wallets')
      .update({ is_primary: false })
      .eq('user_id', user.id);

    // Upsert target wallet as primary
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
