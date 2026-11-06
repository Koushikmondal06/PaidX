import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { getMirrorTransaction } from '@/lib/hedera/mirrorNode';
import { commitSettledReservation, releaseFailedReservation } from '@/lib/agent/policyEngine';
import { publishHcsPaymentEvent } from '@/lib/hedera/hcs';

export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/reconcile
 * Reconciles payments with uncertain consensus status against the Hedera Mirror Node.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { paymentId } = body;

    const supabase = createServerSupabaseClient();
    let query = supabase
      .from('agent_payments')
      .select('*, agent_connections(*)')
      .eq('user_id', user.id)
      .in('status', ['uncertain', 'submitting', 'reserved']);

    if (paymentId) {
      query = query.eq('id', paymentId);
    }

    const { data: pendingPayments, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const reconciled = [];

    for (const payment of pendingPayments || []) {
      if (!payment.tx_id) {
        // Check if reservation expired
        const createdAt = new Date(payment.created_at).getTime();
        const tenMinutes = 10 * 60 * 1000;
        if (Date.now() - createdAt > tenMinutes) {
          await releaseFailedReservation(payment.reservation_id || undefined, 'Payment expired without transaction broadcast');
          await supabase
            .from('agent_payments')
            .update({
              status: 'failed',
              failure_reason: 'Transaction timed out before broadcast',
              updated_at: new Date().toISOString(),
            })
            .eq('id', payment.id);

          reconciled.push({ id: payment.id, status: 'failed', reason: 'Expired' });
        }
        continue;
      }

      // Query Mirror Node for transaction consensus
      const mirrorTx = await getMirrorTransaction(payment.tx_id);
      if (mirrorTx) {
        if (mirrorTx.result === 'SUCCESS') {
          // Transaction confirmed on-chain!
          await commitSettledReservation({
            agentId: payment.agent_id,
            reservationId: payment.reservation_id || undefined,
            atomicAmount: payment.amount_atomic,
          });

          // Check if HCS audit event was published
          let topicId = payment.hcs_topic_id;
          let seqNum = payment.hcs_sequence_number;
          if (!payment.hcs_sequence_number) {
            const hcsRes = await publishHcsPaymentEvent({
              paymentId: payment.id,
              event: {
                event: 'X402_WALLET_PAYMENT_SETTLED',
                agentId: payment.agent_id,
                payer: payment.agent_connections?.wallet_id || 'unknown',
                recipient: payment.recipient,
                amountAtomic: payment.amount_atomic,
                amountDisplay: payment.amount_display,
                asset: payment.asset,
                network: payment.network,
                transactionId: payment.tx_id,
                timestamp: new Date().toISOString(),
              },
            });
            topicId = hcsRes.topicId;
            seqNum = hcsRes.sequenceNumber || null;
          }

          await supabase
            .from('agent_payments')
            .update({
              status: 'confirmed',
              hcs_topic_id: topicId || payment.hcs_topic_id,
              hcs_sequence_number: seqNum || payment.hcs_sequence_number,
              hcs_status: 'published',
              confirmed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', payment.id);

          reconciled.push({ id: payment.id, status: 'confirmed', tx_id: payment.tx_id });
        } else {
          // Transaction failed on-chain
          await releaseFailedReservation(payment.reservation_id || undefined, `Mirror Node result: ${mirrorTx.result}`);
          await supabase
            .from('agent_payments')
            .update({
              status: 'failed',
              failure_reason: `On-chain consensus failure: ${mirrorTx.result}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', payment.id);

          reconciled.push({ id: payment.id, status: 'failed', reason: mirrorTx.result });
        }
      }
    }

    return NextResponse.json({ success: true, count: reconciled.length, reconciled });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
