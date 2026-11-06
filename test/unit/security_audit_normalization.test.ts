import test from 'node:test';
import assert from 'node:assert';
import {
  normalizeToUsdMicro,
  convertTinybarsToUsdMicro,
  convertTinybarsFromCentRate,
  computeHbarPriceFromCentRate,
  fetchHederaMirrorExchangeRate,
  setTestPriceOracleMock,
  resetTestPriceOracleMock,
  validatePriceFreshness,
  PriceOracleError,
} from '../../dashboard/lib/agent/priceOracle.ts';
import {
  evaluateAndReserveBudget,
  commitSettledReservation,
  releaseFailedReservation,
} from '../../dashboard/lib/agent/policyEngine.ts';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import { PAIDX_MCP_TOOLS } from '../../dashboard/lib/mcp/tools.ts';
import { orchestrateAgentPayment } from '../../dashboard/lib/agent/orchestrator.ts';

test('PaidX Final Security Audit: Multi-Asset Spending Normalization Suite', async (t) => {
  const POLICY = {
    max_amount_per_tx: 5_000_000n, // $5.00 USD (micro-USD)
    daily_budget: 20_000_000n,     // $20.00 USD (micro-USD)
    monthly_budget: 100_000_000n,  // $100.00 USD (micro-USD)
  };

  const CONTROLLED_RATE_USD = '0.080000';
  const CONTROLLED_RATE_MICRO = 80_000n; // $0.08 USD

  const mockCtx = {
    agentId: '00000000-0000-0000-0000-000000000001',
    agentName: 'Audit-Agent',
    userId: '11111111-1111-1111-1111-111111111111',
    walletId: '22222222-2222-2222-2222-222222222222',
    walletAddress: '0.0.11335334',
  };

  t.afterEach(() => {
    resetTestPriceOracleMock();
    setTestSupabaseClient(null);
  });

  // ==========================================================================
  // SECTION 1: Exchange-Rate Rounding and Precision
  // ==========================================================================
  await t.test('Section 1.1: Live Hedera Mirror Node exchange-rate semantics (File 0.0.112)', async () => {
    const liveQuote = await fetchHederaMirrorExchangeRate();
    assert.strictEqual(liveQuote.assetSymbol, 'HBAR');
    assert.strictEqual(liveQuote.source, 'hedera_mirror_node');
    assert.strictEqual(liveQuote.decimals, 6);
    assert.ok(liveQuote.priceMicroUsd > 0n, 'Price in micro-USD must be positive');
    assert.ok(Number(liveQuote.priceUsd) > 0, 'Price in USD must be positive');
    assert.ok(liveQuote.timestamp > 0, 'Timestamp must be valid epoch ms');

    if (liveQuote.expirationTime) {
      assert.ok(liveQuote.expirationTime > 0, 'Expiration time must be valid');
    }
  });

  await t.test('Section 1.2: Exact integer ceiling division on 205409 / 30000 rate prevents downward truncation', async () => {
    // Exact rate: 205409 * 10000 / 30000 = 68469.6666...
    // Truncation would yield 68469. Ceiling rounding must strictly produce 68470.
    const rate = computeHbarPriceFromCentRate(205409, 30000);
    assert.strictEqual(rate.priceMicroUsd, 68470n, 'Derived priceMicroUsd must be 68470n (ceiling), not 68469n (truncated)');
    assert.strictEqual(rate.priceUsd, '0.068470');

    // 1 HBAR (100,000,000 tinybars) via exact one-step ceiling conversion
    const hbarExact = convertTinybarsFromCentRate(100_000_000n, 205409, 30000);
    assert.strictEqual(hbarExact, 68470n, '1 HBAR must convert to exactly 68470 micro-USD');

    // 1 tinybar via exact one-step ceiling conversion (must ceil to 1 micro-USD, never 0)
    const tinybarExact = convertTinybarsFromCentRate(1n, 205409, 30000);
    assert.strictEqual(tinybarExact, 1n, '1 tinybar must ceiling-round to 1 micro-USD to prevent dust evasion');

    // 0 tinybar converts to 0
    assert.strictEqual(convertTinybarsFromCentRate(0n, 205409, 30000), 0n);

    // Negative tinybar throws error
    assert.throws(() => convertTinybarsFromCentRate(-1n, 205409, 30000), /negative/);
  });

  await t.test('Section 1.3: Boundary amounts near spending limit ($5.00 limit)', async () => {
    // Under 205409/30000 rate:
    // Limit is 5,000,000 micro-USD ($5.00)
    // 73.0246 HBAR = 7,302,460,000 tinybars -> ceil(7302460000 * 205409 / 300000000) = 4,999,971 micro-USD (UNDER $5.00)
    // 73.0252 HBAR = 7,302,520,000 tinybars -> ceil(7302520000 * 205409 / 300000000) = 5,000,013 micro-USD (OVER $5.00)
    const justUnder = convertTinybarsFromCentRate(7_302_460_000n, 205409, 30000);
    assert.strictEqual(justUnder, 4_999_971n);
    assert.ok(justUnder <= POLICY.max_amount_per_tx, '73.0246 HBAR is strictly under $5.00 limit');

    const justOver = convertTinybarsFromCentRate(7_302_520_000n, 205409, 30000);
    assert.strictEqual(justOver, 5_000_012n);
    assert.ok(justOver > POLICY.max_amount_per_tx, '73.0252 HBAR strictly exceeds $5.00 limit');
  });

  // ==========================================================================
  // SECTION 2: Consistent Quote Freshness & Fail-Closed Behavior
  // ==========================================================================
  await t.test('Section 2.1: 300-second maximum age is enforced unconditionally even if expirationTime is in future', () => {
    const now = Date.now();
    // Quote created 350 seconds ago, but protocol claims valid for 1 hour
    const staleProtocolQuote = {
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'hedera_mirror_node',
      timestamp: now - 350_000, // 350s old (> 300s)
      decimals: 6,
      expirationTime: Math.floor(now / 1000) + 1800, // 30 mins in future
    };

    assert.throws(
      () => validatePriceFreshness(staleProtocolQuote),
      (err: any) => err.code === 'PRICE_ORACLE_STALE' && err.message.includes('exceeds maximum allowed freshness')
    );
  });

  await t.test('Section 2.2: Forward clock skew (> 60s ahead) is rejected', () => {
    const now = Date.now();
    const futureQuote = {
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'test',
      timestamp: now + 70_000, // 70s in the future
      decimals: 6,
    };

    assert.throws(
      () => validatePriceFreshness(futureQuote),
      (err: any) => err.code === 'PRICE_ORACLE_STALE' && err.message.includes('ahead of current server time')
    );
  });

  await t.test('Section 2.3: Zero and negative prices are rejected', () => {
    assert.throws(
      () => validatePriceFreshness({
        assetSymbol: 'HBAR',
        priceUsd: '0.000000',
        priceMicroUsd: 0n,
        source: 'test',
        timestamp: Date.now(),
        decimals: 6,
      }),
      (err: any) => err.code === 'PRICE_ORACLE_UNAVAILABLE'
    );
  });

  await t.test('Section 2.4: Expired protocol expiration timestamp is rejected', () => {
    const now = Date.now();
    const expiredQuote = {
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'hedera_mirror_node',
      timestamp: now - 10_000, // 10s old (fresh query)
      decimals: 6,
      expirationTime: Math.floor(now / 1000) - 5, // expired 5 seconds ago
    };

    assert.throws(
      () => validatePriceFreshness(expiredQuote),
      (err: any) => err.code === 'PRICE_ORACLE_STALE' && err.message.includes('expired')
    );
  });

  // ==========================================================================
  // SECTION 3: Approval Binding & Tampering Protection
  // ==========================================================================
  await t.test('Section 3.1: Approval binding rejects tampered parameters', async () => {
    const validApproval = {
      id: 'pay-appr-001',
      agent_id: mockCtx.agentId,
      recipient: '0.0.11334921',
      amount_atomic: '100000000', // 1 HBAR
      amount_display: '1 HBAR',
      asset: 'HBAR',
      network: 'hedera-testnet',
      status: 'approved',
      amount_usd_micro: '80000',
      price_source: 'test_oracle',
      price_usd: '0.080000',
      price_timestamp: new Date().toISOString(),
      reservation_id: 'res-appr-001',
    };

    const validReservation = {
      id: 'res-appr-001',
      agent_id: mockCtx.agentId,
      status: 'reserved',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    };

    // Helper mock db generator
    const makeMockDb = (approvalOverrides = {}, reservationOverrides = {}) => {
      const appr = { ...validApproval, ...approvalOverrides };
      const resv = { ...validReservation, ...reservationOverrides };
      return {
        from: (table: string) => ({
          select: () => ({
            eq: (col1: string, val1: any) => ({
              eq: (col2: string, val2: any) => ({
                maybeSingle: async () => {
                  if (table === 'agent_spending_reservations' && val1 === resv.id && val2 === mockCtx.agentId) {
                    return { data: resv, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
              maybeSingle: async () => {
                if (table === 'agent_payments' && val1 === appr.id) {
                  return { data: appr, error: null };
                }
                if (table === 'agent_spending_reservations' && val1 === resv.id) {
                  return { data: resv, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: appr, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    };

    // 1. Tampered Recipient
    setTestSupabaseClient(makeMockDb());
    const resTamperRecipient = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-appr-001',
      recipient: '0.0.99999999', // Tampered!
      amount: '1',
      asset: 'HBAR',
      network: 'hedera-testnet',
    });
    assert.strictEqual(resTamperRecipient.success, false);
    assert.ok(resTamperRecipient.error?.includes('APPROVAL_BINDING_MISMATCH: Recipient'));

    // 2. Tampered Amount
    const resTamperAmount = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-appr-001',
      recipient: '0.0.11334921',
      amount: '5', // Tampered (5 HBAR instead of 1)!
      asset: 'HBAR',
      network: 'hedera-testnet',
    });
    assert.strictEqual(resTamperAmount.success, false);
    assert.ok(resTamperAmount.error?.includes('APPROVAL_BINDING_MISMATCH: Atomic amount'));

    // 3. Tampered Asset
    const resTamperAsset = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-appr-001',
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'USDC', // Tampered!
      network: 'hedera-testnet',
    });
    assert.strictEqual(resTamperAsset.success, false);
    assert.ok(resTamperAsset.error?.includes('APPROVAL_BINDING_MISMATCH: Asset'));

    // 4. Tampered Network
    const resTamperNetwork = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-appr-001',
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
      network: 'hedera-mainnet', // Tampered!
    });
    assert.strictEqual(resTamperNetwork.success, false);
    assert.ok(resTamperNetwork.error?.includes('APPROVAL_BINDING_MISMATCH: Network'));

    // 5. Tampered Agent ID
    const resTamperAgent = await orchestrateAgentPayment(
      { ...mockCtx, agentId: '00000000-0000-0000-0000-999999999999' },
      {
        existingPaymentId: 'pay-appr-001',
        recipient: '0.0.11334921',
        amount: '1',
        asset: 'HBAR',
        network: 'hedera-testnet',
      }
    );
    assert.strictEqual(resTamperAgent.success, false);
    assert.ok(resTamperAgent.error?.includes('APPROVAL_BINDING_MISMATCH: Agent ID'));
  });

  await t.test('Section 3.2: Replay protection rejects already settled or confirmed approvals', async () => {
    const settledApproval = {
      id: 'pay-settled-001',
      agent_id: mockCtx.agentId,
      recipient: '0.0.11334921',
      amount_atomic: '100000000',
      asset: 'HBAR',
      network: 'hedera-testnet',
      status: 'confirmed', // Already confirmed!
    };

    setTestSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: settledApproval, error: null }),
          }),
        }),
      }),
      rpc: async () => ({ data: { success: true }, error: null }),
    });

    const res = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-settled-001',
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
      network: 'hedera-testnet',
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('ALREADY_SETTLED'), 'Must reject replay of settled payment');
  });

  await t.test('Section 3.3: Rejects approval when price quote expired (> 300s) while awaiting human approval', async () => {
    const expiredQuoteApproval = {
      id: 'pay-stale-quote-001',
      agent_id: mockCtx.agentId,
      recipient: '0.0.11334921',
      amount_atomic: '100000000',
      asset: 'HBAR',
      network: 'hedera-testnet',
      status: 'approved',
      price_timestamp: new Date(Date.now() - 350_000).toISOString(), // 350s old (> 300s)
    };

    setTestSupabaseClient({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: expiredQuoteApproval, error: null }),
          }),
        }),
      }),
      rpc: async () => ({ data: { success: true }, error: null }),
    });

    const res = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-stale-quote-001',
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
      network: 'hedera-testnet',
    });

    assert.strictEqual(res.success, false);
    assert.ok(res.error?.includes('PRICE_QUOTE_EXPIRED'), 'Must fail-closed when quote expired during human approval wait');
  });

  await t.test('Section 3.4: Rejects approval execution when reservation was released or expired', async () => {
    // 1. Released reservation
    const releasedApproval = {
      id: 'pay-resv-rel-001',
      agent_id: mockCtx.agentId,
      recipient: '0.0.11334921',
      amount_atomic: '100000000',
      asset: 'HBAR',
      network: 'hedera-testnet',
      status: 'approved',
      reservation_id: 'res-rel-001',
      price_timestamp: new Date().toISOString(),
    };

    setTestSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: (col1: string, val1: any) => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'agent_spending_reservations') {
                  return { data: { id: 'res-rel-001', agent_id: mockCtx.agentId, status: 'released' }, error: null };
                }
                return { data: null, error: null };
              },
            }),
            maybeSingle: async () => {
              if (table === 'agent_payments') {
                return { data: releasedApproval, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
      rpc: async () => ({ data: { success: true }, error: null }),
    });

    const resReleased = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-resv-rel-001',
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
      network: 'hedera-testnet',
    });
    assert.strictEqual(resReleased.success, false);
    assert.ok(resReleased.error?.includes('RESERVATION_RELEASED'));

    // 2. Expired reservation
    setTestSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: (col1: string, val1: any) => ({
            eq: () => ({
              maybeSingle: async () => {
                if (table === 'agent_spending_reservations') {
                  return {
                    data: {
                      id: 'res-rel-001',
                      agent_id: mockCtx.agentId,
                      status: 'reserved',
                      expires_at: new Date(Date.now() - 10_000).toISOString(), // expired in past
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            }),
            maybeSingle: async () => {
              if (table === 'agent_payments') {
                return { data: releasedApproval, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
      }),
      rpc: async () => ({ data: { success: true }, error: null }),
    });

    const resExpired = await orchestrateAgentPayment(mockCtx, {
      existingPaymentId: 'pay-resv-rel-001',
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
      network: 'hedera-testnet',
    });
    assert.strictEqual(resExpired.success, false);
    assert.ok(resExpired.error?.includes('RESERVATION_EXPIRED'));
  });

  // ==========================================================================
  // SECTION 4: Concurrency & Lifecycle Edge Cases
  // ==========================================================================
  await t.test('Section 4.1: Two simultaneous commit calls for the same reservation (idempotency)', async () => {
    let commitCount = 0;
    let reservationStatus = 'reserved';

    const mockDb = {
      rpc: async (fn: string) => {
        if (fn === 'commit_agent_reservation') {
          if (reservationStatus === 'settled') {
            return { data: { success: true, idempotent: true, status: 'already_settled' }, error: null };
          }
          reservationStatus = 'settled';
          commitCount++;
          return { data: { success: true, idempotent: false, status: 'settled', deducted_amount_usd_micro: '80000' }, error: null };
        }
        return { data: null, error: { message: 'Unknown RPC' } };
      },
    };
    setTestSupabaseClient(mockDb);

    // Call commitSettledReservation simultaneously
    const [c1, c2] = await Promise.all([
      commitSettledReservation({
        agentId: mockCtx.agentId,
        reservationId: 'res-simul-001',
        atomicAmount: '100000000',
      }),
      commitSettledReservation({
        agentId: mockCtx.agentId,
        reservationId: 'res-simul-001',
        atomicAmount: '100000000',
      }),
    ]);

    assert.strictEqual(c1.success, true);
    assert.strictEqual(c2.success, true);
    assert.strictEqual(commitCount, 1, 'Counters must be incremented exactly once even under simultaneous commits');
  });

  await t.test('Section 4.2: Two simultaneous execution attempts for the same approval (atomic CAS claim)', async () => {
    let currentStatus = 'approved';

    const approvalData = {
      id: 'pay-race-001',
      agent_id: mockCtx.agentId,
      recipient: '0.0.11334921',
      amount_atomic: '100000000',
      amount_display: '1 HBAR',
      asset: 'HBAR',
      network: 'hedera-testnet',
      status: 'approved',
      amount_usd_micro: '80000',
      price_timestamp: new Date().toISOString(),
      reservation_id: 'res-race-001',
    };

    const reservationData = {
      id: 'res-race-001',
      agent_id: mockCtx.agentId,
      status: 'reserved',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    };

    setTestSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: (col1: string, val1: any) => ({
            eq: () => ({
              maybeSingle: async () => ({ data: reservationData, error: null }),
            }),
            maybeSingle: async () => ({ data: { ...approvalData, status: currentStatus }, error: null }),
          }),
        }),
        update: (updates: any) => ({
          eq: (col1: string, val1: any) => ({
            eq: (col2: string, val2: any) => ({
              select: () => ({
                maybeSingle: async () => {
                  // Atomic compare-and-swap simulation:
                  // Only succeeds if currentStatus matches val2 ('approved')
                  if (col2 === 'status' && val2 === 'approved') {
                    if (currentStatus === 'approved') {
                      currentStatus = updates.status || 'submitting';
                      return { data: { ...approvalData, status: currentStatus }, error: null };
                    }
                    return { data: null, error: null }; // 0 rows updated
                  }
                  return { data: { ...approvalData, ...updates }, error: null };
                },
              }),
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: { success: true }, error: null }),
    });

    // Launch two simultaneous executions for the same approval ID
    const [exec1, exec2] = await Promise.all([
      orchestrateAgentPayment(mockCtx, {
        existingPaymentId: 'pay-race-001',
        recipient: '0.0.11334921',
        amount: '1',
        asset: 'HBAR',
        network: 'hedera-testnet',
      }),
      orchestrateAgentPayment(mockCtx, {
        existingPaymentId: 'pay-race-001',
        recipient: '0.0.11334921',
        amount: '1',
        asset: 'HBAR',
        network: 'hedera-testnet',
      }),
    ]);

    // One of them must be rejected with CONCURRENT_EXECUTION (409 Conflict)
    const results = [exec1, exec2];
    const conflict = results.find((r) => r.error?.includes('CONCURRENT_EXECUTION'));
    assert.ok(conflict, 'One simultaneous execution attempt must be rejected with CONCURRENT_EXECUTION');
  });

  await t.test('Section 4.3: Failed transaction lifecycle releases reservation, allowing clean retry', async () => {
    let releasedReservationId: string | null = null;
    let releaseReason: string | null = null;

    setTestSupabaseClient({
      rpc: async (fn: string, params: any) => {
        if (fn === 'release_agent_reservation') {
          releasedReservationId = params.p_reservation_id;
          releaseReason = params.p_reason;
          return { data: { success: true, status: 'released' }, error: null };
        }
        return { data: null, error: null };
      },
    });

    // Simulate releaseFailedReservation
    const res = await releaseFailedReservation('res-fail-001', 'Network timeout during facilitator verification');
    assert.strictEqual(res.success, true);
    assert.strictEqual(releasedReservationId, 'res-fail-001');
    assert.strictEqual(releaseReason, 'Network timeout during facilitator verification');
  });

  // ==========================================================================
  // SECTION 5: Multi-Asset Spending Normalization & Policy Guarantees
  // ==========================================================================
  await t.test('Section 5.1: 1 HBAR under $5 limit with controlled mock ($0.08/HBAR)', async () => {
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_RATE_USD,
      priceMicroUsd: CONTROLLED_RATE_MICRO,
      source: 'controlled_test_mock',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const norm = await normalizeToUsdMicro({
      rawAtomicAmount: '100000000',
      assetSymbol: 'HBAR',
    });

    assert.strictEqual(norm.normalizedAmountUsdMicro, '80000'); // $0.08
    assert.ok(BigInt(norm.normalizedAmountUsdMicro) <= POLICY.max_amount_per_tx);
  });

  await t.test('Section 5.2: 100 HBAR above $5 limit at $0.08/HBAR is rejected', async () => {
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_RATE_USD,
      priceMicroUsd: CONTROLLED_RATE_MICRO,
      source: 'controlled_test_mock',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const norm = await normalizeToUsdMicro({
      rawAtomicAmount: '10000000000',
      assetSymbol: 'HBAR',
    });

    assert.strictEqual(norm.normalizedAmountUsdMicro, '8000000'); // $8.00
    assert.ok(BigInt(norm.normalizedAmountUsdMicro) > POLICY.max_amount_per_tx);
  });

  await t.test('Section 5.3: Mixed HBAR and USDC daily budget exhaustion across lifecycle', async () => {
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_RATE_USD,
      priceMicroUsd: CONTROLLED_RATE_MICRO,
      source: 'controlled_test_mock',
      timestamp: Date.now(),
      decimals: 6,
    }));

    let spentToday = 0n;
    const activeReservations = new Map<string, bigint>();

    function tryReserve(intentId: string, normUsdMicro: bigint): boolean {
      const active = Array.from(activeReservations.values()).reduce((a, b) => a + b, 0n);
      if (spentToday + active + normUsdMicro > POLICY.daily_budget) {
        return false;
      }
      activeReservations.set(intentId, normUsdMicro);
      return true;
    }

    function settle(intentId: string) {
      const amount = activeReservations.get(intentId)!;
      activeReservations.delete(intentId);
      spentToday += amount;
    }

    // 10 USDC = 10,000,000 micro-USD ($10.00)
    const usdc1 = await normalizeToUsdMicro({ rawAtomicAmount: '10000000', assetSymbol: 'USDC' });
    assert.strictEqual(tryReserve('usdc-1', BigInt(usdc1.normalizedAmountUsdMicro)), true);
    settle('usdc-1');
    assert.strictEqual(spentToday, 10_000_000n);

    // 60 HBAR @ $0.08 = $4.80 (4,800,000 micro-USD)
    const hbar1 = await normalizeToUsdMicro({ rawAtomicAmount: '6000000000', assetSymbol: 'HBAR' });
    assert.strictEqual(hbar1.normalizedAmountUsdMicro, '4800000');
    assert.strictEqual(tryReserve('hbar-1', BigInt(hbar1.normalizedAmountUsdMicro)), true);
    settle('hbar-1');
    assert.strictEqual(spentToday, 14_800_000n);

    // 5 USDC = 5,000,000 micro-USD -> total spent becomes 19,800,000 micro-USD ($19.80)
    const usdc2 = await normalizeToUsdMicro({ rawAtomicAmount: '5000000', assetSymbol: 'USDC' });
    assert.strictEqual(tryReserve('usdc-2', BigInt(usdc2.normalizedAmountUsdMicro)), true);
    settle('usdc-2');
    assert.strictEqual(spentToday, 19_800_000n);

    // Remaining daily budget is exactly $0.20 (200,000 micro-USD)
    const remaining = POLICY.daily_budget - spentToday;
    assert.strictEqual(remaining, 200_000n);

    // Try 5 HBAR @ $0.08 = $0.40 (400,000 micro-USD) -> REJECTED
    const hbarFail = await normalizeToUsdMicro({ rawAtomicAmount: '500000000', assetSymbol: 'HBAR' });
    assert.strictEqual(tryReserve('hbar-fail', BigInt(hbarFail.normalizedAmountUsdMicro)), false);

    // 2.5 HBAR @ $0.08 = $0.20 (200,000 micro-USD) -> ALLOWED
    const hbarExact = await normalizeToUsdMicro({ rawAtomicAmount: '250000000', assetSymbol: 'HBAR' });
    assert.strictEqual(tryReserve('hbar-exact', BigInt(hbarExact.normalizedAmountUsdMicro)), true);
    settle('hbar-exact');
    assert.strictEqual(spentToday, 20_000_000n);
  });

  await t.test('Section 5.4: Facilitator fee (0.001 HBAR) is not counted in transfer amount or budget deduction', async () => {
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: CONTROLLED_RATE_USD,
      priceMicroUsd: CONTROLLED_RATE_MICRO,
      source: 'controlled_test_mock',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const prepareTool = PAIDX_MCP_TOOLS.find((tool) => tool.name === 'prepare_wallet_payment')!;
    const res = await prepareTool.handler(mockCtx, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.atomicAmount, '100000000', 'Transfer amount is strictly 100,000,000 tinybars (1 HBAR)');
    assert.strictEqual(res.estimatedFeeTinybars, '100000', 'Fee is 100,000 tinybars (0.001 HBAR)');
    assert.strictEqual(res.feePayer, 'facilitator (sponsored)', 'Facilitator pays network fee');
    assert.strictEqual(res.normalizedAmountUsdMicro, '80000', 'Budget deduction is based strictly on 1 HBAR transfer, not fee');
  });
});
