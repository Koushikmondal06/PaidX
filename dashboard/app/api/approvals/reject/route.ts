import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/approvals/reject
 * Human user rejects an agent payment approval request.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await req.json();
    const { paymentId, reason = 'Declined by account owner' } = body;

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
        { error: `Payment cannot be rejected: current status is "${payment.status}"` },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('agent_payments')
      .update({
        status: 'declined',
        failure_reason: `Rejected by user: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Failed to reject payment' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      paymentId: updated.id,
      status: 'declined',
      message: 'Payment request has been rejected.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
