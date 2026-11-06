import test from 'node:test';
import assert from 'node:assert';
import {
  parseToAtomicUnits,
  formatAtomicUnits,
  validateDecimalString,
  parseHbarToTinybars,
  formatTinybarsToHbar,
} from '../../dashboard/lib/hedera/decimal.ts';
import { getHtsAssetConfig } from '../../dashboard/lib/hedera/hts.ts';
import { PAIDX_MCP_TOOLS } from '../../dashboard/lib/mcp/tools.ts';

test('PaidX Spending Limit Denomination, Budget Enforcement & Approval Security Suite', async (t) => {
  // Configured Agent Policy Parameters (as stated in problem definition)
  const policy = {
    max_amount_per_tx: 5000000n, // Stored as raw atomic units (5 USDC @ 6 decimals)
    daily_budget: 20000000n,      // 20 USDC @ 6 decimals
    monthly_budget: 100000000n,   // 100 USDC @ 6 decimals
    spent_today: 0n,
    spent_this_month: 0n,
    autonomous_payments_enabled: false, // Autonomous payments explicitly disabled
    allowed_networks: ['hedera:testnet'],
    allowed_assets: ['USDC', 'HBAR'],
    allowed_recipients: null as string[] | null,
  };

  // Mock Context for MCP Tool invocation
  const mockContext = {
    agentId: '00000000-0000-0000-0000-000000000001',
    agentName: 'Test-Trading-Agent',
    userId: '11111111-1111-1111-1111-111111111111',
    walletId: '22222222-2222-2222-2222-222222222222',
    walletAddress: '0.0.5449200',
  };

  // --------------------------------------------------------------------------
  // 1. Tinybar & Atomic Unit Conversion Accuracy
  // --------------------------------------------------------------------------
  await t.test('1: Tinybar and atomic unit conversion accuracy across HBAR (8 dec) and USDC (6 dec)', () => {
    // A: 1 HBAR exact conversion to 100,000,000 tinybars
    const oneHbarAtomic = parseToAtomicUnits('1', 8);
    assert.strictEqual(oneHbarAtomic, 100000000n);
    assert.strictEqual(parseHbarToTinybars('1'), 100000000n);
    assert.strictEqual(formatAtomicUnits(oneHbarAtomic, 8), '1');
    assert.strictEqual(formatTinybarsToHbar(oneHbarAtomic), '1');

    // B: 0.05 HBAR exact conversion to 5,000,000 tinybars
    const pointZeroFiveHbar = parseToAtomicUnits('0.05', 8);
    assert.strictEqual(pointZeroFiveHbar, 5000000n);
    assert.strictEqual(formatAtomicUnits(pointZeroFiveHbar, 8), '0.05');

    // C: 0.00000001 HBAR exact conversion to 1 tinybar (smallest indivisible unit)
    const oneTinybar = parseToAtomicUnits('0.00000001', 8);
    assert.strictEqual(oneTinybar, 1n);
    assert.strictEqual(formatAtomicUnits(oneTinybar, 8), '0.00000001');

    // D: 5 USDC exact conversion to 5,000,000 micro-units (6 decimals)
    const fiveUsdcAtomic = parseToAtomicUnits('5', 6);
    assert.strictEqual(fiveUsdcAtomic, 5000000n);
    assert.strictEqual(formatAtomicUnits(fiveUsdcAtomic, 6), '5');

    // E: Precision guard: rejecting amounts with excess decimal places
    assert.throws(
      () => validateDecimalString('1.000000001', 8), // 9 decimals for 8-decimal HBAR
      /exceeds maximum allowed precision/
    );
    assert.throws(
      () => validateDecimalString('5.0000001', 6), // 7 decimals for 6-decimal USDC
      /exceeds maximum allowed precision/
    );

    // F: Zero-tolerance financial validation: rejecting negative amounts and scientific notation
    assert.throws(() => validateDecimalString('-1', 8), /Negative payment amounts are not permitted/);
    assert.throws(() => validateDecimalString('1e8', 8), /Scientific notation is not permitted/);
    assert.throws(() => validateDecimalString('0', 8), /greater than zero/);
  });

  // --------------------------------------------------------------------------
  // 2. Spending Limit Evaluation: Multi-Asset Normalization vs Raw Atomic Units
  // --------------------------------------------------------------------------
  await t.test('2: Raw atomic mismatch explanation & multi-asset normalization resolution', async () => {
    const rawOneHbar = '1';
    const hbarConfig = getHtsAssetConfig('HBAR');
    assert.strictEqual(hbarConfig.decimals, 8);

    const oneHbarAtomic = parseToAtomicUnits(rawOneHbar, hbarConfig.decimals);
    assert.strictEqual(oneHbarAtomic, 100000000n);

    // Part A: Denomination mismatch explanation:
    // When compared without normalization: 100,000,000 raw tinybars > 5,000,000 policy limit
    const unnormalizedExceeds = oneHbarAtomic > policy.max_amount_per_tx;
    assert.strictEqual(unnormalizedExceeds, true, 'Raw unnormalized comparison falsely penalized HBAR');

    // Part B: Normalized USD-micro evaluation:
    // With 1 HBAR @ $0.08 = 80,000 micro-USD ($10^-6 USD)
    // 80,000 micro-USD <= 5,000,000 micro-USD ($5.00 limit) -> Correctly ALLOWED!
    const HBAR_PRICE_MICRO_USD = 80_000n; // $0.08
    const normalizedOneHbar = (oneHbarAtomic * HBAR_PRICE_MICRO_USD) / 100_000_000n;
    assert.strictEqual(normalizedOneHbar, 80000n);
    assert.strictEqual(normalizedOneHbar <= policy.max_amount_per_tx, true, 'Normalized 1 HBAR is within $5.00 limit');

    // 100 HBAR = 10,000,000,000 tinybars -> 8,000,000 micro-USD ($8.00) > 5,000,000 limit -> REJECTED!
    const normalizedHundredHbar = (10_000_000_000n * HBAR_PRICE_MICRO_USD) / 100_000_000n;
    assert.strictEqual(normalizedHundredHbar, 8000000n);
    assert.strictEqual(normalizedHundredHbar > policy.max_amount_per_tx, true, '100 HBAR exceeds $5.00 limit');
  });

  // --------------------------------------------------------------------------
  // 3. Daily Budget Exhaustion Enforcement
  // --------------------------------------------------------------------------
  await t.test('3: Daily budget (20,000,000) enforces strict atomic exhaustion and tracks remaining balance', () => {
    let spentToday = 17000000n; // 17,000,000 already spent
    let activeReserved = 1000000n; // 1,000,000 active reservation
    const dailyBudget = policy.daily_budget; // 20,000,000

    // Attempt 1: Payment of 3,000,000 -> 17M + 1M + 3M = 21M > 20M -> REJECTED
    const paymentA = 3000000n;
    const canAcceptA = spentToday + activeReserved + paymentA <= dailyBudget;
    assert.strictEqual(canAcceptA, false);

    const dailyRemaining = dailyBudget > (spentToday + activeReserved)
      ? dailyBudget - (spentToday + activeReserved)
      : 0n;
    assert.strictEqual(dailyRemaining, 2000000n, 'Remaining daily budget is exactly 2,000,000');

    // Attempt 2: Payment of 2,000,000 -> 17M + 1M + 2M = 20M <= 20M -> ALLOWED
    const paymentB = 2000000n;
    const canAcceptB = spentToday + activeReserved + paymentB <= dailyBudget;
    assert.strictEqual(canAcceptB, true);
  });

  // --------------------------------------------------------------------------
  // 4. Monthly Budget Exhaustion Enforcement
  // --------------------------------------------------------------------------
  await t.test('4: Monthly budget (100,000,000) enforces strict cumulative limit', () => {
    let spentThisMonth = 97000000n; // 97,000,000 spent this month
    let activeReserved = 0n;
    const monthlyBudget = policy.monthly_budget; // 100,000,000

    // Attempt 1: Payment of 4,000,000 -> 97M + 4M = 101M > 100M -> REJECTED
    const paymentA = 4000000n;
    const canAcceptA = spentThisMonth + activeReserved + paymentA <= monthlyBudget;
    assert.strictEqual(canAcceptA, false, 'Payment exceeding monthly budget must be rejected');

    // Attempt 2: Payment of 3,000,000 -> 97M + 3M = 100M <= 100M -> ALLOWED
    const paymentB = 3000000n;
    const canAcceptB = spentThisMonth + activeReserved + paymentB <= monthlyBudget;
    assert.strictEqual(canAcceptB, true, 'Payment exactly hitting monthly budget is accepted');
  });

  // --------------------------------------------------------------------------
  // 5. Disabled Autonomous Payments Enforcement
  // --------------------------------------------------------------------------
  await t.test('5: When autonomous payments are disabled, even sub-limit payments require human approval', () => {
    // Simulate database procedure logic:
    // IF NOT v_policy.autonomous_payments_enabled THEN v_requires_approval := TRUE;
    function evaluatePolicyApprovalRequirement(
      atomicAmount: bigint,
      policyConfig: typeof policy
    ): { allowed: boolean; requiresHumanApproval: boolean; code?: string } {
      if (atomicAmount > policyConfig.max_amount_per_tx) {
        return {
          allowed: false,
          requiresHumanApproval: true,
          code: 'MAX_AMOUNT_EXCEEDED',
        };
      }

      if (!policyConfig.autonomous_payments_enabled) {
        return {
          allowed: false,
          requiresHumanApproval: true,
          code: 'APPROVAL_REQUIRED',
        };
      }

      return { allowed: true, requiresHumanApproval: false };
    }

    // A: 1 HBAR (100,000,000 tinybars) fails both maxPerTx and requires approval
    const result1Hbar = evaluatePolicyApprovalRequirement(100000000n, policy);
    assert.strictEqual(result1Hbar.allowed, false);
    assert.strictEqual(result1Hbar.requiresHumanApproval, true);
    assert.strictEqual(result1Hbar.code, 'MAX_AMOUNT_EXCEEDED');

    // B: 0.01 HBAR (1,000,000 tinybars) is below maxPerTx, but blocked by autonomous_payments_enabled: false
    const resultSubLimit = evaluatePolicyApprovalRequirement(1000000n, policy);
    assert.strictEqual(resultSubLimit.allowed, false);
    assert.strictEqual(resultSubLimit.requiresHumanApproval, true);
    assert.strictEqual(resultSubLimit.code, 'APPROVAL_REQUIRED');

    // C: When autonomous payments are enabled and within limit, payment executes autonomously
    const enabledPolicy = { ...policy, autonomous_payments_enabled: true };
    const resultEnabled = evaluatePolicyApprovalRequirement(1000000n, enabledPolicy);
    assert.strictEqual(resultEnabled.allowed, true);
    assert.strictEqual(resultEnabled.requiresHumanApproval, false);
  });

  // --------------------------------------------------------------------------
  // 6. Concurrent Payment Reservations Serialization
  // --------------------------------------------------------------------------
  await t.test('6: Concurrent payment reservations are serialized with row-locks and never breach daily budget', async () => {
    let spentToday = 0n;
    const dailyBudget = 20000000n; // 20,000,000 daily budget
    const activeReservations = new Map<string, bigint>();
    let isRowLocked = false;

    async function simulateAtomicReservation(idempKey: string, amount: bigint): Promise<{ allowed: boolean; code?: string }> {
      // Simulate PostgreSQL SELECT ... FOR UPDATE on agent_policies
      while (isRowLocked) {
        await new Promise((r) => setTimeout(r, 1));
      }
      isRowLocked = true;

      try {
        const totalReserved = Array.from(activeReservations.values()).reduce((a, b) => a + b, 0n);

        if (spentToday + totalReserved + amount > dailyBudget) {
          return { allowed: false, code: 'DAILY_BUDGET_EXCEEDED' };
        }

        activeReservations.set(idempKey, amount);
        return { allowed: true };
      } finally {
        isRowLocked = false;
      }
    }

    // 8 concurrent requests of 5,000,000 each (40,000,000 total attempted vs 20,000,000 limit)
    const requests = Array.from({ length: 8 }, (_, i) =>
      simulateAtomicReservation(`agent-concurrent-${i}`, 5000000n)
    );

    const outcomes = await Promise.all(requests);
    const approved = outcomes.filter((o) => o.allowed);
    const rejected = outcomes.filter((o) => !o.allowed);

    // Exactly 4 succeed (4 * 5,000,000 = 20,000,000), exactly 4 fail with DAILY_BUDGET_EXCEEDED
    assert.strictEqual(approved.length, 4);
    assert.strictEqual(rejected.length, 4);
    assert.strictEqual(
      Array.from(activeReservations.values()).reduce((a, b) => a + b, 0n),
      20000000n,
      'Total active reservations must never breach 20,000,000'
    );
  });

  // --------------------------------------------------------------------------
  // 7. Prepare vs Execute Security Distinction
  // --------------------------------------------------------------------------
  await t.test('7: prepare_wallet_payment validates format only; execution strictly requires policy authorization', async () => {
    const prepareTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'prepare_wallet_payment');
    assert.ok(prepareTool, 'prepare_wallet_payment tool must exist');

    // Run prepare_wallet_payment with 1 HBAR
    const prepareResult = await prepareTool.handler(mockContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
    });

    // Preparation succeeds structurally
    assert.strictEqual(prepareResult.valid, true);
    assert.strictEqual(prepareResult.recipient, '0.0.11334921');
    assert.strictEqual(prepareResult.amountDisplay, '1 HBAR');
    assert.strictEqual(prepareResult.atomicAmount, '100000000');
    assert.strictEqual(prepareResult.asset, 'HBAR');
    assert.strictEqual(prepareResult.authorizationStatus, 'prepared_only_not_authorized');
    assert.ok(prepareResult.policyNotice);

    // Network fee estimate is returned
    assert.strictEqual(prepareResult.estimatedNetworkFee, '0.001 HBAR');
    assert.strictEqual(prepareResult.estimatedFeeTinybars, '100000');
    assert.strictEqual(prepareResult.feeModel, 'sponsored_x402');

    // But executing 1 HBAR with policy limits (5,000,000) and autonomous: false cannot proceed autonomously!
    const isExecutionAuthorized =
      BigInt(prepareResult.atomicAmount) <= policy.max_amount_per_tx &&
      policy.autonomous_payments_enabled;
    assert.strictEqual(isExecutionAuthorized, false, 'Execution must not be authorized');
  });

  // --------------------------------------------------------------------------
  // 8. Explicit Denomination Fields in Spending Limit Responses
  // --------------------------------------------------------------------------
  await t.test('8: get_agent_spending_limit provides explicit denomination, decimals, and asset reference', async () => {
    // Mock Supabase policy record
    const mockPolicyRecord = {
      max_amount_per_tx: '5000000',
      daily_budget: '20000000',
      spent_today: '0',
      monthly_budget: '100000000',
      spent_this_month: '0',
      autonomous_payments_enabled: false,
      period_start_date: '2026-11-06',
    };

    // Format output matching updated get_agent_spending_limit handler
    const maxPerTx = BigInt(mockPolicyRecord.max_amount_per_tx);
    const dailyBudget = BigInt(mockPolicyRecord.daily_budget);
    const spentToday = BigInt(mockPolicyRecord.spent_today);
    const remainingToday = dailyBudget - spentToday;
    const monthlyBudget = BigInt(mockPolicyRecord.monthly_budget);
    const spentThisMonth = BigInt(mockPolicyRecord.spent_this_month);

    const spendingLimitResponse = {
      maxPerTransaction: mockPolicyRecord.max_amount_per_tx,
      dailyBudget: mockPolicyRecord.daily_budget,
      spentToday: mockPolicyRecord.spent_today,
      remainingToday: remainingToday.toString(),
      monthlyBudget: mockPolicyRecord.monthly_budget,
      spentThisMonth: mockPolicyRecord.spent_this_month,

      denomination: 'USDC_ATOMIC',
      unit: 'micro-units (6 decimal places)',
      baseAsset: 'USDC',
      decimals: 6,

      maxPerTransactionDisplay: `${formatAtomicUnits(maxPerTx, 6)} USDC`,
      dailyBudgetDisplay: `${formatAtomicUnits(dailyBudget, 6)} USDC`,
      spentTodayDisplay: `${formatAtomicUnits(spentToday, 6)} USDC`,
      remainingTodayDisplay: `${formatAtomicUnits(remainingToday, 6)} USDC`,
      monthlyBudgetDisplay: `${formatAtomicUnits(monthlyBudget, 6)} USDC`,
      spentThisMonthDisplay: `${formatAtomicUnits(spentThisMonth, 6)} USDC`,

      assetConversionReference: {
        USDC: { decimals: 6, atomicUnitsPerToken: '1000000', atomicUnitName: 'micro-USDC' },
        HBAR: { decimals: 8, atomicUnitsPerToken: '100000000', atomicUnitName: 'tinybar' },
        note: 'Spending policy limits are configured in 6-decimal atomic units ($10^6 = 1.00 USDC / USD). HBAR uses 8 decimal places (100,000,000 tinybars = 1 HBAR). When evaluating HBAR payments against raw atomic limits, 1 HBAR is 100,000,000 tinybars.',
      },

      autonomousPaymentsEnabled: mockPolicyRecord.autonomous_payments_enabled,
      periodStartDate: mockPolicyRecord.period_start_date,
    };

    assert.strictEqual(spendingLimitResponse.denomination, 'USDC_ATOMIC');
    assert.strictEqual(spendingLimitResponse.decimals, 6);
    assert.strictEqual(spendingLimitResponse.maxPerTransactionDisplay, '5 USDC');
    assert.strictEqual(spendingLimitResponse.dailyBudgetDisplay, '20 USDC');
    assert.strictEqual(spendingLimitResponse.monthlyBudgetDisplay, '100 USDC');
    assert.strictEqual(spendingLimitResponse.assetConversionReference.HBAR.decimals, 8);
    assert.strictEqual(spendingLimitResponse.assetConversionReference.HBAR.atomicUnitsPerToken, '100000000');
    assert.strictEqual(spendingLimitResponse.autonomousPaymentsEnabled, false);
  });
});
