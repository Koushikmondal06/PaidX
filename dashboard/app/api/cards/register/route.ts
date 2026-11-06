import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeCardUidHash } from '@/lib/server/cardHash';
import { getServerPublicClient } from '@/lib/chain';
import { CARD_REGISTRY_ABI, getCardRegistryAddress } from '@/lib/contracts';
import { parseEventLogs, type Hash, type Address } from 'viem';

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

    const { rawUid, registrationTxHash, prepareOnly } = await req.json();

    if (!rawUid || typeof rawUid !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing rawUid' }, { status: 400 });
    }

    // Compute cryptographic hash with server-side salt
    const uidHash = computeCardUidHash(rawUid);

    // If caller just wants the hash to construct the on-chain registerCard transaction
    if (prepareOnly) {
      return NextResponse.json({ success: true, uidHash });
    }

    const supabase = createServerSupabaseClient();

    // 1. Fetch user's primary wallet_id to avoid NOT NULL violation
    const { data: primaryWallet } = await supabase
      .from('wallets')
      .select('id, address')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

    const walletId = primaryWallet?.id || null;

    // 2. Check if card with this hash already registered
    const { data: existing } = await supabase
      .from('cards')
      .select('id, user_id, status, registration_tx_hash')
      .eq('uid_hash', uidHash)
      .maybeSingle();

    if (existing) {
      if (existing.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Card UID is already registered to another account', code: 'CARD_ALREADY_REGISTERED' },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        card: existing,
        uidHash,
        message: 'Card already registered to your account',
      });
    }

    // 3. Determine card status: active ONLY if on-chain receipt log OR on-chain storage confirms it
    let cardStatus: 'pending' | 'active' = 'pending';
    const publicClient = getServerPublicClient();
    const registryAddress = (getCardRegistryAddress() as Address).toLowerCase() as Address;

    // Check receipt logs if txHash provided
    if (registrationTxHash) {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: registrationTxHash as Hash,
          confirmations: 1,
          timeout: 60_000,
        });

        if (receipt.status === 'success') {
          const logs = parseEventLogs({
            abi: CARD_REGISTRY_ABI,
            eventName: 'CardRegistered',
            logs: receipt.logs,
          });

          const matchingLog = logs.find(
            (l) =>
              l.address.toLowerCase() === registryAddress &&
              (l.args as any)?.cardHash?.toLowerCase() === uidHash.toLowerCase()
          );

          if (matchingLog) {
            cardStatus = 'active';
          }
        }
      } catch (receiptErr) {
        console.warn('[Card Register] Receipt verification warning:', receiptErr);
      }
    }

    // Check on-chain CardRegistry directly to handle retry paths where tx already succeeded
    if (cardStatus !== 'active') {
      try {
        const cardRecord = (await publicClient.readContract({
          address: registryAddress,
          abi: CARD_REGISTRY_ABI,
          functionName: 'cards',
          args: [uidHash as `0x${string}`],
        })) as [Address, number, bigint, bigint];

        const [ownerAddr, onChainStatus] = cardRecord;
        if (
          ownerAddr &&
          ownerAddr !== '0x0000000000000000000000000000000000000000' &&
          primaryWallet?.address &&
          ownerAddr.toLowerCase() === primaryWallet.address.toLowerCase()
        ) {
          cardStatus = onChainStatus === 1 ? 'active' : 'pending';
        }
      } catch (readErr) {
        console.warn('[Card Register] On-chain read warning:', readErr);
      }
    }

    // 4. Insert or update card record
    const { data: card, error: insertError } = await supabase
      .from('cards')
      .upsert(
        {
          user_id: user.id,
          wallet_id: walletId,
          uid_hash: uidHash,
          status: cardStatus,
          registration_tx_hash: registrationTxHash || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'uid_hash' }
      )
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, card, uidHash });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error registering card';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
