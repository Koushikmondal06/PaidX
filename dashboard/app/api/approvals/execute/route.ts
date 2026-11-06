import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { orchestrateAgentPayment } from '@/lib/agent/orchestrator';
import { fromAtomicUnits } from '@/lib/hedera/hts';

export const dynamic = 'force-dynamic';

/**
 * POST /api/approvals/execute
 * Executes an approved payment request on behalf of the authorized wallet.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await req.json();
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

    if (payment.status !== 'pending' && payment.status !== 'approval_required') {
      return NextResponse.json(
        { error: `Payment cannot be executed: current status is "${payment.status}"` },
        { status: 400 }
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

    // Calculate display amount from atomic
    const displayAmount = fromAtomicUnits(payment.amount_atomic, 6);

    const result = await orchestrateAgentPayment(agentContext, {
      recipient: payment.recipient,
      amount: displayAmount,
      asset: payment.asset,
      network: payment.network as any,
      idempotencyKey: `exec-${payment.id}`,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
