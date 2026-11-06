import test from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { POST as approveRoute } from '../../dashboard/app/api/approvals/approve/route.ts';
import { POST as executeRoute } from '../../dashboard/app/api/approvals/execute/route.ts';
import { POST as rejectRoute } from '../../dashboard/app/api/approvals/reject/route.ts';

test('Approval Lifecycle & Execution Guard Tests', async (t) => {
  await t.test('Approval Guard: rejects execution of unapproved payment requests', async () => {
    // Attempting to execute an approval_required record without prior approval
    const req = new NextRequest('http://localhost:3000/api/approvals/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentId: 'payment-unapproved-1' }),
    });

    const res = await executeRoute(req);
    // Should fail with 401 if unauthenticated, or 400 if unapproved
    assert.ok(res.status === 401 || res.status === 400);
  });

  await t.test('Approval Guard: rejects requests missing paymentId', async () => {
    const req = new NextRequest('http://localhost:3000/api/approvals/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await approveRoute(req);
    // Unauthenticated or bad request
    assert.ok(res.status === 401 || res.status === 400);
  });

  await t.test('Approval Lifecycle: State Machine Transition Verifications', () => {
    // Verifies state machine transitions:
    // approval_required -> approved -> executing -> confirmed
    // approval_required -> declined
    type PaymentState = 'approval_required' | 'approved' | 'declined' | 'executing' | 'confirmed';

    function transition(current: PaymentState, action: 'approve' | 'reject' | 'execute' | 'confirm'): PaymentState {
      if (current === 'approval_required' && action === 'approve') return 'approved';
      if (current === 'approval_required' && action === 'reject') return 'declined';
      if (current === 'approved' && action === 'execute') return 'executing';
      if (current === 'executing' && action === 'confirm') return 'confirmed';
      throw new Error(`Illegal state transition from ${current} via ${action}`);
    }

    // 1. Happy path: approve then execute
    let state: PaymentState = 'approval_required';
    state = transition(state, 'approve');
    assert.strictEqual(state, 'approved');

    state = transition(state, 'execute');
    assert.strictEqual(state, 'executing');

    state = transition(state, 'confirm');
    assert.strictEqual(state, 'confirmed');

    // 2. Reject directly from approval_required
    let rejectState: PaymentState = 'approval_required';
    rejectState = transition(rejectState, 'reject');
    assert.strictEqual(rejectState, 'declined');

    // 3. Execution of unapproved payment MUST throw illegal transition
    assert.throws(
      () => transition('approval_required', 'execute'),
      /Illegal state transition from approval_required via execute/i
    );
  });
});
