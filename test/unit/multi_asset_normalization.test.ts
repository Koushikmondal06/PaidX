import test from 'node:test';
import assert from 'node:assert';
import {
  normalizeToUsdMicro,
  convertTinybarsToUsdMicro,
  computeHbarPriceFromCentRate,
  computePriceMicroUsdFromUsd,
  setTestPriceOracleMock,
  resetTestPriceOracleMock,
  validatePriceFreshness,
  PriceOracleError,
  type PriceQuote,
} from '../../dashboard/lib/agent/priceOracle.ts';
import {
  evaluateAndReserveBudget,
  commitSettledReservation,
  releaseFailedReservation,
} from '../../dashboard/lib/agent/policyEngine.ts';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import { PAIDX_MCP_TOOLS } from '../../dashboard/lib/mcp/tools.ts';

test('PaidX Multi-Asset Spending Limit Normalization Test Suite', async (t) => {
  // Configured Agent Policy (stored in USDC atomic units / USD-micro, 6 decimals)
  // Per-tx: 5 USDC ($5.00), Daily: 20 USDC ($20.00), Monthly: 100 USDC ($100.00)
  const POLICY = {
    max_amount_per_tx: 5_000_000n, // $5.00 USD
    daily_budget: 20_000_000n,     // $20.00 USD
    monthly_budget: 100_000_000n,  // $100.00 USD
  };

  const CONTROLLED_HBAR_PRICE_USD = '0.080000';
  const CONTROLLED_HBAR_PRICE_MICRO = 80_000n; // 80,000 micro-USD per HBAR ($0.08)

  const mockContext = {
    agentId: '00000000-0000-0000-0000-000000000001',
    agentName: 'Trading-Agent-1',
    userId: '11111111-1111-1111-1111-111111111111',
    walletId: '22222222-2222-2222-2222-222222222222',
    walletAddress: '0.0.5449200',
  };

  t.afterEach(() => {
    resetTestPriceOracleMock();
    setTestSupabaseClient(null);
  });

  // --------------------------------------------------------------------------
  // Test Case 1: 1 USDC against a $5 limit
  // --------------------------------------------------------------------------
  await t.test('1: 1 USDC against a $5 limit (1:1 USD-micro mapping)', async () => {
    // 1 USDC = 1,000,000 atomic units (6 decimals)
    const rawAtomic = '1000000';
    const normalized = await normalizeToUsdMicro({
      rawAtomicAmount: rawAtomic,
      assetSymbol: 'USDC',
    });

    assert.strictEqual(normalized.assetSymbol, 'USDC');
    assert.strictEqual(normalized.rawAtomicAmount, '1000000');
    assert.strictEqual(normalized.normalizedAmountUsdMicro, '1000000'); // 1,000,000 micro-USD = $1.00
    assert.strictEqual(normalized.conversionDecimals, 6);
    assert.strictEqual(normalized.priceQuote.source, 'pegged_usd_stablecoin');
    assert.strictEqual(normalized.priceQuote.priceUsd, '1.000000');

    // Policy comparison: 1,000,000 micro-USD <= 5,000,000 micro-USD ($5.00 limit)
    const isAllowed = BigInt(normalized.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx;
    assert.strictEqual(isAllowed, true, '1 USDC ($1.00) must be within $5.00 limit');

    // 5 USDC = 5,000,000 atomic units exactly equal to $5.00 limit
    const fiveUsdc = await normalizeToUsdMicro({
      rawAtomicAmount: '5000000',
      assetSymbol: 'USDC',
    });
    assert.strictEqual(fiveUsdc.normalizedAmountUsdMicro, '5000000');
    assert.strictEqual(BigInt(fiveUsdc.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx, true);

    // 6 USDC = 6,000,000 atomic units strictly exceeds $5.00 limit
    const sixUsdc = await normalizeToUsdMicro({
      rawAtomicAmount: '6000000',
      assetSymbol: 'USDC',
    });
    assert.strictEqual(sixUsdc.normalizedAmountUsdMicro, '6000000');
    assert.strictEqual(BigInt(sixUsdc.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx, false);
  });

  // --------------------------------------------------------------------------
  // Test Case 2: 1 HBAR against a $5 limit using a controlled test exchange rate
  // --------------------------------------------------------------------------
  await t.test('2: 1 HBAR against a $5 limit using a controlled test exchange rate ($0.08/HBAR)', async () => {
    setTestPriceOracleMock((asset) => {
      if (asset === 'HBAR') {
        return {
          assetSymbol: 'HBAR',
          priceUsd: CONTROLLED_HBAR_PRICE_USD,
          priceMicroUsd: CONTROLLED_HBAR_PRICE_MICRO,
          source: 'test_controlled_oracle',
          timestamp: Date.now(),
          decimals: 6,
        };
      }
      return null;
    });

    // 1 HBAR = 100,000,000 tinybars (8 decimals)
    const rawOneHbar = '100000000';
    const normalized = await normalizeToUsdMicro({
      rawAtomicAmount: rawOneHbar,
      assetSymbol: 'HBAR',
    });

    assert.strictEqual(normalized.assetSymbol, 'HBAR');
    assert.strictEqual(normalized.rawAtomicAmount, '100000000');
    // At $0.08 per HBAR, 1 HBAR = 80,000 micro-USD ($0.08)
    assert.strictEqual(normalized.normalizedAmountUsdMicro, '80000');
    assert.strictEqual(normalized.priceQuote.source, 'test_controlled_oracle');
    assert.strictEqual(normalized.priceQuote.priceUsd, '0.080000');

    // Verification against $5.00 limit:
    // 80,000 micro-USD <= 5,000,000 micro-USD ($5 limit) -> ALLOWED!
    const isAllowed = BigInt(normalized.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx;
    assert.strictEqual(
      isAllowed,
      true,
      '1 HBAR ($0.08 = 80,000 micro-USD) must be well within $5.00 limit (5,000,000 micro-USD)'
    );
  });

  // --------------------------------------------------------------------------
  // Test Case 3: HBAR payment below the limit
  // --------------------------------------------------------------------------
  await t.test('3: HBAR payment below the limit (0.5 HBAR @ $0.08 = $0.04; 50 HBAR @ $0.08 = $4.00)', async () => {
    setTestPriceOracleMock((asset) => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_HBAR_PRICE_USD,
      priceMicroUsd: CONTROLLED_HBAR_PRICE_MICRO,
      source: 'test_controlled_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Subcase A: 0.5 HBAR = 50,000,000 tinybars -> 40,000 micro-USD ($0.04)
    const halfHbar = await normalizeToUsdMicro({
      rawAtomicAmount: '50000000',
      assetSymbol: 'HBAR',
    });
    assert.strictEqual(halfHbar.normalizedAmountUsdMicro, '40000');
    assert.strictEqual(BigInt(halfHbar.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx, true);

    // Subcase B: 50 HBAR = 5,000,000,000 tinybars -> 4,000,000 micro-USD ($4.00)
    const fiftyHbar = await normalizeToUsdMicro({
      rawAtomicAmount: '5000000000',
      assetSymbol: 'HBAR',
    });
    assert.strictEqual(fiftyHbar.normalizedAmountUsdMicro, '4000000');
    assert.strictEqual(BigInt(fiftyHbar.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx, true);

    // Subcase C: 62.5 HBAR = 6,250,000,000 tinybars -> exactly 5,000,000 micro-USD ($5.00)
    const limitHbar = await normalizeToUsdMicro({
      rawAtomicAmount: '6250000000',
      assetSymbol: 'HBAR',
    });
    assert.strictEqual(limitHbar.normalizedAmountUsdMicro, '5000000');
    assert.strictEqual(BigInt(limitHbar.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx, true);
  });

  // --------------------------------------------------------------------------
  // Test Case 4: HBAR payment above the limit
  // --------------------------------------------------------------------------
  await t.test('4: HBAR payment above the limit (100 HBAR @ $0.08 = $8.00 > $5.00 limit)', async () => {
    setTestPriceOracleMock((asset) => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_HBAR_PRICE_USD,
      priceMicroUsd: CONTROLLED_HBAR_PRICE_MICRO,
      source: 'test_controlled_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // 100 HBAR = 10,000,000,000 tinybars -> 8,000,000 micro-USD ($8.00)
    const hundredHbar = await normalizeToUsdMicro({
      rawAtomicAmount: '10000000000',
      assetSymbol: 'HBAR',
    });

    assert.strictEqual(hundredHbar.normalizedAmountUsdMicro, '8000000');
    const exceedsLimit = BigInt(hundredHbar.normalizedAmountUsdMicro) > POLICY.max_amount_per_tx;
    assert.strictEqual(exceedsLimit, true, '100 HBAR ($8.00 = 8,000,000 micro-USD) must exceed $5.00 limit');

    // 63 HBAR = 6,300,000,000 tinybars -> 5,040,000 micro-USD ($5.04) > 5,000,000 limit
    const sixtyThreeHbar = await normalizeToUsdMicro({
      rawAtomicAmount: '6300000000',
      assetSymbol: 'HBAR',
    });
    assert.strictEqual(sixtyThreeHbar.normalizedAmountUsdMicro, '5040000');
    assert.strictEqual(BigInt(sixtyThreeHbar.normalizedAmountUsdMicro) > POLICY.max_amount_per_tx, true);
  });

  // --------------------------------------------------------------------------
  // Test Case 5: Daily and monthly budget exhaustion across mixed assets
  // --------------------------------------------------------------------------
  await t.test('5: Daily and monthly budget exhaustion across mixed assets (USDC and HBAR)', async () => {
    setTestPriceOracleMock((asset) => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_HBAR_PRICE_USD,
      priceMicroUsd: CONTROLLED_HBAR_PRICE_MICRO,
      source: 'test_controlled_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Simulated ledger state in common USD-micro units
    let spentTodayUsdMicro = 0n;
    let spentThisMonthUsdMicro = 0n;
    const activeReservations = new Map<string, { rawAmount: string; usdMicro: bigint; asset: string }>();

    function evaluateMixedSpend(
      intentId: string,
      rawAmount: string,
      asset: string,
      normalizedUsdMicro: bigint
    ): { allowed: boolean; code?: string; remainingDaily: bigint } {
      const activeTotal = Array.from(activeReservations.values()).reduce(
        (sum, r) => sum + r.usdMicro,
        0n
      );

      // Check per-transaction limit
      if (normalizedUsdMicro > POLICY.max_amount_per_tx) {
        return {
          allowed: false,
          code: 'MAX_AMOUNT_EXCEEDED',
          remainingDaily: POLICY.daily_budget - (spentTodayUsdMicro + activeTotal),
        };
      }

      // Check daily budget
      if (spentTodayUsdMicro + activeTotal + normalizedUsdMicro > POLICY.daily_budget) {
        const remaining = POLICY.daily_budget - (spentTodayUsdMicro + activeTotal);
        return {
          allowed: false,
          code: 'DAILY_BUDGET_EXCEEDED',
          remainingDaily: remaining > 0n ? remaining : 0n,
        };
      }

      // Check monthly budget
      if (spentThisMonthUsdMicro + activeTotal + normalizedUsdMicro > POLICY.monthly_budget) {
        return {
          allowed: false,
          code: 'MONTHLY_BUDGET_EXCEEDED',
          remainingDaily: POLICY.daily_budget - (spentTodayUsdMicro + activeTotal),
        };
      }

      // Reserve
      activeReservations.set(intentId, { rawAmount, usdMicro: normalizedUsdMicro, asset });
      const remainingDaily = POLICY.daily_budget - (spentTodayUsdMicro + activeTotal + normalizedUsdMicro);
      return { allowed: true, remainingDaily };
    }

    function settleReservation(intentId: string) {
      const res = activeReservations.get(intentId);
      if (!res) throw new Error('Reservation not found');
      activeReservations.delete(intentId);
      spentTodayUsdMicro += res.usdMicro;
      spentThisMonthUsdMicro += res.usdMicro;
    }

    // Step A: Spend 15 USDC (15,000,000 micro-USD) through three 5-USDC payments
    // 5 USDC = 5,000,000 micro-USD
    for (let i = 1; i <= 3; i++) {
      const norm = await normalizeToUsdMicro({ rawAtomicAmount: '5000000', assetSymbol: 'USDC' });
      const res = evaluateMixedSpend(`usdc-${i}`, '5000000', 'USDC', BigInt(norm.normalizedAmountUsdMicro));
      assert.strictEqual(res.allowed, true);
      settleReservation(`usdc-${i}`);
    }

    assert.strictEqual(spentTodayUsdMicro, 15_000_000n, 'Spent today must be 15 USDC ($15.00)');
    const remainingDailyAfterUsdc = POLICY.daily_budget - spentTodayUsdMicro;
    assert.strictEqual(remainingDailyAfterUsdc, 5_000_000n, 'Remaining daily budget must be $5.00');

    // Step B: Spend 50 HBAR @ $0.08 = $4.00 (4,000,000 micro-USD)
    // 50 HBAR = 5,000,000,000 tinybars
    const normHbar = await normalizeToUsdMicro({ rawAtomicAmount: '5000000000', assetSymbol: 'HBAR' });
    assert.strictEqual(normHbar.normalizedAmountUsdMicro, '4000000');
    const hbarSpend = evaluateMixedSpend('hbar-1', '5000000000', 'HBAR', BigInt(normHbar.normalizedAmountUsdMicro));
    assert.strictEqual(hbarSpend.allowed, true);
    assert.strictEqual(hbarSpend.remainingDaily, 1_000_000n, 'After 50 HBAR ($4), exactly $1.00 remains');
    settleReservation('hbar-1');

    assert.strictEqual(spentTodayUsdMicro, 19_000_000n, 'Total mixed spend is $19.00 USD');

    // Step C: Attempt to spend 20 HBAR @ $0.08 = $1.60 (1,600,000 micro-USD)
    // Available is only 1,000,000 micro-USD ($1.00). Must be strictly rejected!
    const normOverHbar = await normalizeToUsdMicro({ rawAtomicAmount: '2000000000', assetSymbol: 'HBAR' });
    assert.strictEqual(normOverHbar.normalizedAmountUsdMicro, '1600000');
    const overSpend = evaluateMixedSpend('hbar-2', '2000000000', 'HBAR', BigInt(normOverHbar.normalizedAmountUsdMicro));
    assert.strictEqual(overSpend.allowed, false);
    assert.strictEqual(overSpend.code, 'DAILY_BUDGET_EXCEEDED');
    assert.strictEqual(overSpend.remainingDaily, 1_000_000n);

    // Step D: Spend remaining $1.00 exactly using 12.5 HBAR @ $0.08 = $1.00 (1,000,000 micro-USD)
    const normExact = await normalizeToUsdMicro({ rawAtomicAmount: '1250000000', assetSymbol: 'HBAR' });
    assert.strictEqual(normExact.normalizedAmountUsdMicro, '1000000');
    const exactSpend = evaluateMixedSpend('hbar-exact', '1250000000', 'HBAR', BigInt(normExact.normalizedAmountUsdMicro));
    assert.strictEqual(exactSpend.allowed, true);
    assert.strictEqual(exactSpend.remainingDaily, 0n);
    settleReservation('hbar-exact');

    assert.strictEqual(spentTodayUsdMicro, 20_000_000n, 'Daily budget fully exhausted to 0');

    // Step E: Any further spend (even 1 tinybar or 1 micro-USDC) must be rejected
    const tinyHbar = await normalizeToUsdMicro({ rawAtomicAmount: '1', assetSymbol: 'HBAR' });
    const tinyAttempt = evaluateMixedSpend('hbar-tiny', '1', 'HBAR', BigInt(tinyHbar.normalizedAmountUsdMicro));
    assert.strictEqual(tinyAttempt.allowed, false);
    assert.strictEqual(tinyAttempt.code, 'DAILY_BUDGET_EXCEEDED');
  });

  // --------------------------------------------------------------------------
  // Test Case 6: Concurrent reservations involving HBAR and USDC
  // --------------------------------------------------------------------------
  await t.test('6: Concurrent reservations involving HBAR and USDC with atomic serialization', async () => {
    setTestPriceOracleMock((asset) => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_HBAR_PRICE_USD,
      priceMicroUsd: CONTROLLED_HBAR_PRICE_MICRO,
      source: 'test_controlled_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Simulates PostgreSQL reserve_agent_budget row-level FOR UPDATE lock on agent_policies
    let spentToday = 0n;
    const activeReservations = new Map<string, bigint>();
    let isRowLocked = false;

    async function simulateAtomicMultiAssetReservation(
      intentId: string,
      rawAmount: string,
      asset: string
    ): Promise<{ allowed: boolean; code?: string; reservationId?: string }> {
      // Normalize outside lock
      const normalized = await normalizeToUsdMicro({ rawAtomicAmount: rawAmount, assetSymbol: asset });
      const normUsdMicro = BigInt(normalized.normalizedAmountUsdMicro);

      // Acquire simulated row-level lock
      while (isRowLocked) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      isRowLocked = true;

      try {
        const totalActiveReserved = Array.from(activeReservations.values()).reduce((a, b) => a + b, 0n);

        if (normUsdMicro > POLICY.max_amount_per_tx) {
          return { allowed: false, code: 'MAX_AMOUNT_EXCEEDED' };
        }

        if (spentToday + totalActiveReserved + normUsdMicro > POLICY.daily_budget) {
          return { allowed: false, code: 'DAILY_BUDGET_EXCEEDED' };
        }

        activeReservations.set(intentId, normUsdMicro);
        return { allowed: true, reservationId: `res-${intentId}` };
      } finally {
        isRowLocked = false;
      }
    }

    // Launch 10 concurrent requests:
    // 5 requests in USDC of $3.00 each (3,000,000 micro-USD) -> $15.00
    // 5 requests in HBAR of 37.5 HBAR each (3,750,000,000 tinybars @ $0.08 = $3.00) -> $15.00
    // Total attempted spend: $30.00 against $20.00 daily budget.
    const concurrentRequests: Promise<{ allowed: boolean; code?: string }>[] = [];
    for (let i = 0; i < 5; i++) {
      concurrentRequests.push(
        simulateAtomicMultiAssetReservation(`usdc-concurrent-${i}`, '3000000', 'USDC')
      );
      concurrentRequests.push(
        simulateAtomicMultiAssetReservation(`hbar-concurrent-${i}`, '3750000000', 'HBAR')
      );
    }

    const results = await Promise.all(concurrentRequests);
    const approved = results.filter((r) => r.allowed);
    const rejected = results.filter((r) => !r.allowed);

    // Each request is $3.00.
    // In a $20.00 daily budget, floor(20 / 3) = exactly 6 requests succeed ($18.00 reserved).
    // The remaining 4 requests are rejected with DAILY_BUDGET_EXCEEDED.
    assert.strictEqual(approved.length, 6, 'Exactly 6 requests ($18.00) must be approved');
    assert.strictEqual(rejected.length, 4, 'Exactly 4 requests must be rejected');
    for (const rej of rejected) {
      assert.strictEqual(rej.code, 'DAILY_BUDGET_EXCEEDED');
    }

    const totalReserved = Array.from(activeReservations.values()).reduce((a, b) => a + b, 0n);
    assert.strictEqual(totalReserved, 18_000_000n, 'Total active reserved must be exactly 18,000,000 micro-USD ($18.00)');
    assert.strictEqual(totalReserved <= POLICY.daily_budget, true, 'Active reservations must never breach daily budget');
  });

  // --------------------------------------------------------------------------
  // Test Case 7: Missing and stale price data (Fail Closed)
  // --------------------------------------------------------------------------
  await t.test('7: Missing and stale price data must fail closed (PRICE_ORACLE_UNAVAILABLE / STALE)', async () => {
    // A: Price Oracle returns null (unavailable)
    setTestPriceOracleMock(() => null);

    await assert.rejects(
      async () => {
        await normalizeToUsdMicro({ rawAtomicAmount: '100000000', assetSymbol: 'HBAR' });
      },
      (err: any) => {
        assert.strictEqual(err.code, 'PRICE_ORACLE_UNAVAILABLE');
        return true;
      }
    );

    // B: Price Oracle returns zero or negative price
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.000000',
      priceMicroUsd: 0n,
      source: 'bad_feed',
      timestamp: Date.now(),
      decimals: 6,
    }));

    await assert.rejects(
      async () => {
        await normalizeToUsdMicro({ rawAtomicAmount: '100000000', assetSymbol: 'HBAR' });
      },
      (err: any) => {
        assert.strictEqual(err.code, 'PRICE_ORACLE_UNAVAILABLE');
        return true;
      }
    );

    // C: Stale price quote (timestamp older than 300 seconds / 5 minutes)
    const sixMinutesAgo = Date.now() - 360 * 1000;
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80_000n,
      source: 'stale_feed',
      timestamp: sixMinutesAgo,
      decimals: 6,
    }));

    await assert.rejects(
      async () => {
        await normalizeToUsdMicro({ rawAtomicAmount: '100000000', assetSymbol: 'HBAR' });
      },
      (err: any) => {
        assert.strictEqual(err.code, 'PRICE_ORACLE_STALE');
        assert.match(err.message, /stale/i);
        return true;
      }
    );

    // D: Clock skew guard: price timestamp in the future by > 60 seconds
    const futureTime = Date.now() + 120 * 1000;
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80_000n,
      source: 'future_feed',
      timestamp: futureTime,
      decimals: 6,
    }));

    await assert.rejects(
      async () => {
        await normalizeToUsdMicro({ rawAtomicAmount: '100000000', assetSymbol: 'HBAR' });
      },
      (err: any) => {
        assert.strictEqual(err.code, 'PRICE_ORACLE_STALE');
        assert.match(err.message, /ahead of current server time/i);
        return true;
      }
    );

    // E: evaluateAndReserveBudget catches PriceOracleError and returns fail-closed result
    setTestPriceOracleMock(() => {
      throw new PriceOracleError('PRICE_ORACLE_UNAVAILABLE', 'Network connection refused');
    });

    const budgetResult = await evaluateAndReserveBudget({
      agentId: mockContext.agentId,
      atomicAmount: '100000000',
      assetSymbol: 'HBAR',
      network: 'hedera:testnet',
      recipient: '0.0.123456',
      idempotencyKey: 'test-stale-fail-closed',
    });

    assert.strictEqual(budgetResult.allowed, false);
    assert.strictEqual(budgetResult.requiresHumanApproval, false);
    assert.strictEqual(budgetResult.code, 'PRICE_ORACLE_UNAVAILABLE');
    assert.match(budgetResult.reason || '', /Spending limit evaluation failed closed/);
  });

  // --------------------------------------------------------------------------
  // Test Case 8: Approval enforcement when autonomous payments are disabled
  // --------------------------------------------------------------------------
  await t.test('8: Approval enforcement when autonomous payments are disabled or threshold exceeded', async () => {
    // Mock Supabase to return policy with autonomous_payments_enabled = false
    const mockSupabase = {
      rpc: async (fn: string, params: any) => {
        if (fn === 'reserve_agent_budget') {
          // Autonomous payments disabled requires human approval
          return {
            data: {
              allowed: false,
              requires_human_approval: true,
              code: 'APPROVAL_REQUIRED',
              reason: 'Payment requires human approval per agent spending policy.',
            },
            error: null,
          };
        }
        return { data: null, error: { message: 'Unexpected RPC' } };
      },
    };
    setTestSupabaseClient(mockSupabase);

    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_HBAR_PRICE_USD,
      priceMicroUsd: CONTROLLED_HBAR_PRICE_MICRO,
      source: 'test_controlled_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Even 1 HBAR ($0.08) well below the $5.00 limit must require human approval
    const result = await evaluateAndReserveBudget({
      agentId: mockContext.agentId,
      atomicAmount: '100000000', // 1 HBAR
      assetSymbol: 'HBAR',
      network: 'hedera:testnet',
      recipient: '0.0.123456',
      idempotencyKey: 'test-approval-enforced',
    });

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.requiresHumanApproval, true);
    assert.strictEqual(result.code, 'APPROVAL_REQUIRED');
    assert.strictEqual(result.normalizedAmountUsdMicro, '80000');
    assert.strictEqual(result.priceSource, 'test_controlled_oracle');
  });

  // --------------------------------------------------------------------------
  // Test Case 9: Ceiling rounding protects against micro-dust fractional evasion
  // --------------------------------------------------------------------------
  await t.test('9: Ceiling rounding protects against fractional evasion on odd amounts', () => {
    // Convert 1 tinybar (0.00000001 HBAR) at $0.08 ($80,000 micro-USD)
    // 1 * 80,000 / 100,000,000 = 0.0008 micro-USD.
    // Standard integer division truncates to 0 micro-USD (which would allow free transactions!)
    // Ceiling division strictly rounds to 1 micro-USD.
    const oneTinybarUsdMicro = convertTinybarsToUsdMicro(1n, 80_000n);
    assert.strictEqual(
      oneTinybarUsdMicro,
      1n,
      'Ceiling rounding must round 0.0008 micro-USD up to 1 micro-USD'
    );

    // 0 tinybars must remain 0
    assert.strictEqual(convertTinybarsToUsdMicro(0n, 80_000n), 0n);

    // Exactly 1,250 tinybars @ $0.08:
    // 1,250 * 80,000 = 100,000,000 -> exactly 1 micro-USD
    assert.strictEqual(convertTinybarsToUsdMicro(1250n, 80_000n), 1n);

    // 1,251 tinybars @ $0.08:
    // 1,251 * 80,000 = 100,080,000 -> ceil rounds up to 2 micro-USD
    assert.strictEqual(convertTinybarsToUsdMicro(1251n, 80_000n), 2n);
  });

  // --------------------------------------------------------------------------
  // Test Case 10: MCP Tool prepare_wallet_payment includes normalization metadata
  // --------------------------------------------------------------------------
  await t.test('10: MCP prepare_wallet_payment returns normalized USD-micro and price metadata', async () => {
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80_000n,
      source: 'test_controlled_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const prepareTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'prepare_wallet_payment');
    assert.ok(prepareTool);

    const res = await prepareTool.handler(mockContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.atomicAmount, '100000000');
    assert.strictEqual(res.normalizedAmountUsdMicro, '80000');
    assert.strictEqual(res.estimatedUsdValue, '$0.08');
    assert.strictEqual(res.priceConversion.priceUsd, '0.080000');
    assert.strictEqual(res.priceConversion.source, 'test_controlled_oracle');
    assert.strictEqual(res.priceConversion.precision, 'USD_MICRO_6_DECIMALS');
  });
});
