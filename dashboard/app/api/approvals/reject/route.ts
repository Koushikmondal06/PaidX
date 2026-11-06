import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { releaseFailedReservation } from '@/lib/agent/policyEngine';

export const dynamic = 'force-dynamic';

/**
 * POST /api/approvals/reject
 * Human user rejects a payment request that required approval.
 * Performs conditional status update first, and releases any associated reservation only on success.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) return auth.errorResponse;
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const { paymentId, reason } = body;

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

    if (payment.status === 'declined') {
      return NextResponse.json({
        success: true,
        paymentId: payment.id,
        status: 'declined',
        message: 'Payment was already declined.',
      });
    }

    if (payment.status !== 'approval_required' && payment.status !== 'approved') {
      return NextResponse.json(
        { error: `Payment cannot be rejected: current status is "${payment.status}"` },
        { status: 400 }
      );
    }

    // 1. Conditional status update first
    const { data: updated, error: updateError } = await supabase
      .from('agent_payments')
      .update({
        status: 'declined',
        failure_reason: reason || 'Payment rejected by human approver',
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .in('status', ['approval_required', 'approved'])
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message || 'Failed to reject payment' }, { status: 500 });
    }

    // 2. Release reservation only on successful status update
    if (payment.reservation_id) {
      try {
        await releaseFailedReservation(payment.reservation_id, reason || 'Rejected by human approver');
      } catch (relErr) {
        console.warn('[Approvals Reject] Reservation release warning:', relErr);
      }
    }

    return NextResponse.json({
      success: true,
      paymentId: updated.id,
      status: 'declined',
      message: 'Payment has been declined.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
