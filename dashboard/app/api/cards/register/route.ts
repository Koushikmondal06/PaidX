import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeCardUidHash } from '@/lib/server/cardHash';
import { getServerPublicClient } from '@/lib/chain';
import type { Hash } from 'viem';

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

    // Check if card with this hash already registered
    const { data: existing } = await supabase
      .from('cards')
      .select('id, user_id, status')
      .eq('uid_hash', uidHash)
      .maybeSingle();

    if (existing) {
      if (existing.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Card UID is already registered to another account' },
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

    // Determine card status: active ONLY if on-chain receipt is verified
    let cardStatus: 'pending' | 'active' = 'pending';
    if (registrationTxHash) {
      try {
        const publicClient = getServerPublicClient();
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: registrationTxHash as Hash,
          confirmations: 1,
          timeout: 60_000,
        });
        if (receipt.status === 'success') {
          cardStatus = 'active';
        }
      } catch (receiptErr) {
        console.warn('[Card Register] On-chain receipt verification notice:', receiptErr);
      }
    }

    // Insert or update card record
    const { data: card, error: insertError } = await supabase
      .from('cards')
      .upsert({
        user_id: user.id,
        uid_hash: uidHash,
        status: cardStatus,
        registration_tx_hash: registrationTxHash || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'uid_hash' })
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

