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
 * Rejects execution of unapproved 'approval_required' records.
 * Uses the exact existing payment record and preserves original payment intent.
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

    // STRICT GUARD: Do not allow execution of an unapproved approval_required record
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

    // Calculate display amount from atomic units
    const isHbar = payment.asset?.toUpperCase() === 'HBAR' || payment.asset_id === '0.0.0';
    const decimals = isHbar ? 8 : 6;
    const displayAmount = fromAtomicUnits(payment.amount_atomic, decimals);

    // Extract original intent key from scoped idempotency_key
    const originalIntentKey = payment.idempotency_key
      ? payment.idempotency_key.replace(`${agent.id}:`, '')
      : `approved-${payment.id}`;

    // Execute payment reusing existing payment record and preserving original intent
    const result = await orchestrateAgentPayment(agentContext, {
      recipient: payment.recipient,
      amount: displayAmount,
      asset: payment.asset,
      network: payment.network as any,
      idempotencyKey: originalIntentKey,
      existingPaymentId: payment.id,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
