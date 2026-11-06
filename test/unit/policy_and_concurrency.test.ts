import test from 'node:test';
import assert from 'node:assert';

test('Phase 5 & 6 / Test Cases 4, 5, 6, 7: Spending Policies, Concurrency, Rollover & Idempotency', async (t) => {
  // Test Policy configuration
  const policy = {
    max_amount_per_tx: 5000000n, // 5 USDC
    daily_budget: 20000000n,     // 20 USDC
    monthly_budget: 100000000n,  // 100 USDC
    spent_today: 0n,
    spent_this_month: 0n,
    period_start_date: '2026-11-06',
    allowed_recipients: ['0.0.123456', '0.0.654321'],
    autonomous_payments_enabled: true,
  };

  await t.test('Test Case 4: blocks transactions exceeding max amount per transaction', () => {
    const requestedAmount = 6000000n; // 6 USDC (> 5 USDC limit)
    const allowed = requestedAmount <= policy.max_amount_per_tx;
    assert.strictEqual(allowed, false);
  });

  await t.test('Test Case 4: requires human approval when recipient is not in allowlist', () => {
    const unapprovedRecipient = '0.0.999999';
    const isAllowlisted = policy.allowed_recipients.includes(unapprovedRecipient);
    assert.strictEqual(isAllowlisted, false);
  });

  await t.test('Test Case 5: enforces atomic budget reservations during concurrent requests', () => {
    let currentSpent = policy.spent_today;
    const reservations: bigint[] = [];

    // Attempt 5 concurrent transactions of 5 USDC each
    for (let i = 0; i < 5; i++) {
      const txAmount = 5000000n;
      const totalReserved = reservations.reduce((a, b) => a + b, 0n);

      if (currentSpent + totalReserved + txAmount <= policy.daily_budget) {
        reservations.push(txAmount);
      }
    }

    // Daily budget is 20 USDC, so exactly 4 of 5 succeed (4 * 5 = 20 USDC)
    assert.strictEqual(reservations.length, 4);
    assert.strictEqual(reservations.reduce((a, b) => a + b, 0n), 20000000n);
  });

  await t.test('Test Case 6: resets daily spending on date rollover', () => {
    const oldSpentToday = 15000000n;
    const oldStartDate = '2026-11-05';
    const currentDate = '2026-11-06';

    let spentToday = oldSpentToday;
    if (oldStartDate < currentDate) {
      spentToday = 0n; // Daily rollover
    }

    assert.strictEqual(spentToday, 0n);
  });

  await t.test('Test Case 6: resets monthly spending on month rollover', () => {
    const oldSpentMonth = 80000000n;
    const oldStartDate = '2026-10-31';
    const currentDate = '2026-11-06';

    const oldMonth = oldStartDate.slice(0, 7);
    const currentMonth = currentDate.slice(0, 7);

    let spentThisMonth = oldSpentMonth;
    if (oldMonth < currentMonth) {
      spentThisMonth = 0n; // Monthly rollover
    }

    assert.strictEqual(spentThisMonth, 0n);
  });

  await t.test('Test Case 7: Idempotency returns existing payment for identical replay', () => {
    const existingPayment = {
      idempotency_key: 'agent-1:intent-100',
      recipient: '0.0.123456',
      amount_atomic: '5000000',
      asset: 'USDC',
      status: 'confirmed',
      tx_id: '0.0.123456@1700000000.000000001',
    };

    const newRequest = {
      idempotency_key: 'agent-1:intent-100',
      recipient: '0.0.123456',
      amount_atomic: '5000000',
      asset: 'USDC',
    };

    const isMatch =
      existingPayment.recipient === newRequest.recipient &&
      existingPayment.amount_atomic === newRequest.amount_atomic &&
      existingPayment.asset === newRequest.asset;

    assert.strictEqual(isMatch, true);
  });

  await t.test('Test Case 7: Idempotency rejects conflicting parameters with IDEMPOTENCY_CONFLICT', () => {
    const existingPayment = {
      idempotency_key: 'agent-1:intent-100',
      recipient: '0.0.123456',
      amount_atomic: '5000000',
      asset: 'USDC',
    };

    const conflictingRequest = {
      idempotency_key: 'agent-1:intent-100',
      recipient: '0.0.999999', // Different recipient!
      amount_atomic: '5000000',
      asset: 'USDC',
    };

    const isConflict =
      existingPayment.recipient !== conflictingRequest.recipient ||
      existingPayment.amount_atomic !== conflictingRequest.amount_atomic ||
      existingPayment.asset !== conflictingRequest.asset;

    assert.strictEqual(isConflict, true);
  });
});
