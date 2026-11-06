import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/approvals/approve
 * Human user approves a payment request that exceeded autonomous agent limits.
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
      .select('*')
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (findError || !payment) {
      return NextResponse.json({ error: 'Payment request not found or unauthorized' }, { status: 404 });
    }

    if (payment.status !== 'approval_required') {
      return NextResponse.json(
        { error: `Payment cannot be approved: current status is "${payment.status}"` },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('agent_payments')
      .update({
        status: 'pending',
        failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Failed to approve payment' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      paymentId: updated.id,
      status: 'approved',
      message: 'Payment has been approved and is ready for execution.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
