import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { orchestrateAgentPayment } from '@/lib/agent/orchestrator';
import { fromAtomicUnits } from '@/lib/hedera/hts';

export const dynamic = 'force-dynamic';

/**
 * POST /api/approvals/execute
 * Executes an approved payment request on behalf of the authorized wallet.
 * Strictly requires status === 'approved'.
 * Guards against double execution by transitioning approved -> submitting atomically.
 * Returns 502/400 when execution fails.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const { paymentId } = body;

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: payment, error: findError } = await supabase
      .from('agent_payments')
      .select('*, agent_connections(*, wallets(*))')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (findError || !payment) {
      return NextResponse.json({ error: 'Payment not found or unauthorized' }, { status: 404 });
    }

    if (payment.status === 'approval_required') {
      return NextResponse.json(
        {
          error:
            'Execution rejected: Payment is in "approval_required" status and has not been approved yet. Approve first before executing.',
        },
        { status: 400 }
      );
    }

    if (payment.status !== 'approved') {
      return NextResponse.json(
        { error: `Payment cannot be executed: current status is "${payment.status}". Expected status: "approved".` },
        { status: 400 }
      );
    }

    // Guard: approved -> submitting
    const { data: locked, error: lockErr } = await supabase
      .from('agent_payments')
      .update({ status: 'submitting', updated_at: new Date().toISOString() })
      .eq('id', payment.id)
      .eq('status', 'approved')
      .select()
      .maybeSingle();

    if (lockErr || !locked) {
      return NextResponse.json(
        { error: 'Payment is already being executed or not in approved state.' },
        { status: 409 }
      );
    }

    const agent = payment.agent_connections;
    const wallet = agent?.wallets;

    if (!wallet || !wallet.address) {
      return NextResponse.json({ error: 'Missing authorized Hedera wallet for this agent' }, { status: 400 });
    }

    const agentContext = {
      agentId: agent.id,
      agentName: agent.agent_name,
      userId: user.id,
      walletId: wallet.id,
      walletAddress: wallet.address,
    };

    const isHbar = payment.asset?.toUpperCase() === 'HBAR' || payment.asset_id === '0.0.0';
    const decimals = isHbar ? 8 : 6;
    const displayAmount = fromAtomicUnits(payment.amount_atomic, decimals);

    const originalIntentKey = payment.idempotency_key
      ? payment.idempotency_key.replace(`${agent.id}:`, '')
      : `approved-${payment.id}`;

    const result = await orchestrateAgentPayment(agentContext, {
      recipient: payment.recipient,
      amount: displayAmount,
      asset: payment.asset,
      network: payment.network as any,
      idempotencyKey: originalIntentKey,
      existingPaymentId: payment.id,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
