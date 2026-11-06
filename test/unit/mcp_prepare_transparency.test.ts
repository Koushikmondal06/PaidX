import test from 'node:test';
import assert from 'node:assert';
import { PAIDX_MCP_TOOLS } from '../../dashboard/lib/mcp/tools.ts';
import { setTestPriceOracleMock, resetTestPriceOracleMock } from '../../dashboard/lib/agent/priceOracle.ts';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import { setTestMirrorMock } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { resolveAndVerifyRecipientAccount } from '../../dashboard/lib/hedera/recipientResolution.ts';

test('PaidX MCP Payment Preparation & Policy Transparency Test Suite', async (t) => {
  const mockAgentContext = {
    agentId: '33333333-3333-3333-3333-333333333333',
    agentName: 'Transparency-Audit-Agent',
    userId: '44444444-4444-4444-4444-444444444444',
    walletId: '55555555-5555-5555-5555-555555555555',
    walletAddress: '0.0.11335334',
  };

  const defaultPolicy = {
    agent_id: mockAgentContext.agentId,
    max_amount_per_tx: '5000000',     // $5.00 USD-micro
    daily_budget: '20000000',         // $20.00 USD-micro
    monthly_budget: '100000000',      // $100.00 USD-micro
    spent_today: '0',
    spent_this_month: '0',
    period_start_date: new Date().toISOString(),
    autonomous_payments_enabled: true,
    require_approval_above: null,
    allowed_networks: ['hedera:testnet'],
    allowed_assets: ['USDC', 'HBAR'],
    allowed_recipients: null,
  };

  t.afterEach(() => {
    resetTestPriceOracleMock();
    setTestSupabaseClient(null);
    setTestMirrorMock(null);
  });

  const prepareTool = PAIDX_MCP_TOOLS.find((tool) => tool.name === 'prepare_wallet_payment')!;
  const spendingLimitTool = PAIDX_MCP_TOOLS.find((tool) => tool.name === 'get_agent_spending_limit')!;
  assert.ok(prepareTool, 'prepare_wallet_payment MCP tool must exist');
  assert.ok(spendingLimitTool, 'get_agent_spending_limit MCP tool must exist');

  // Helper to mock policy & reservations in Supabase
  function setupMockDatabase(policyOverrides = {}, reservations: any[] = []) {
    const policyRow = { ...defaultPolicy, ...policyOverrides };
    setTestSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: (col1: string, val1: any) => ({
            eq: (col2: string, val2: any) => {
              if (table === 'agent_spending_reservations') {
                return Promise.resolve({ data: reservations, error: null });
              }
              return {
                maybeSingle: async () => ({ data: policyRow, error: null }),
              };
            },
            maybeSingle: async () => {
              if (table === 'agent_policies') {
                return { data: policyRow, error: null };
              }
              return { data: null, error: null };
            },
            then: (onFulfilled: any) => {
              if (table === 'agent_spending_reservations') {
                return Promise.resolve({ data: reservations, error: null }).then(onFulfilled);
              }
              return Promise.resolve({ data: policyRow, error: null }).then(onFulfilled);
            },
          }),
        }),
      }),
    });
  }

  // --------------------------------------------------------------------------
  // Test 1: Valid Hedera native account ID
  // --------------------------------------------------------------------------
  await t.test('1: Valid Hedera native account ID verified via Mirror Node', async () => {
    setupMockDatabase();
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'test_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Real testnet mirror node account
    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
      network: 'hedera:testnet',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.status, 'prepared');
    assert.strictEqual(res.recipient, '0.0.11334921');
    assert.strictEqual(res.recipientVerified, true);
    assert.strictEqual(res.recipientVerificationSource, 'hedera_mirror_node');
    assert.strictEqual(res.amount, '1');
    assert.strictEqual(res.amountAtomic, '100000000');
    assert.strictEqual(res.asset, 'HBAR');
    assert.strictEqual(res.network, 'hedera:testnet');
    assert.strictEqual(res.estimatedUsdValue, '$0.08');
    assert.strictEqual(res.normalizedAmountUsdMicro, '80000');
    assert.strictEqual(res.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(res.perTransactionLimitUsdMicro, '5000000');
    assert.strictEqual(res.remainingDailyBudgetUsdMicro, '20000000');
    assert.strictEqual(res.estimatedNetworkFee, '0.001 HBAR');
    assert.strictEqual(res.feePayer, 'facilitator (sponsored)');
    assert.strictEqual(res.requiresHumanApproval, false);
    assert.strictEqual(res.approvalStatus, 'not_requested');
    assert.strictEqual(res.executionStatus, 'not_executed');
  });

  // --------------------------------------------------------------------------
  // Test 2: EVM-to-Hedera account resolution
  // --------------------------------------------------------------------------
  await t.test('2: EVM-to-Hedera account resolution authoritatively queries Mirror Node', async () => {
    setupMockDatabase();
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'test_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Real testnet EVM address for 0.0.11334921
    const evmAddress = '0x9f5aEA90e65bAb8fbC49385F5076391A6a26eD28';

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: evmAddress,
      amount: '2.5',
      asset: 'HBAR',
      network: 'hedera:testnet',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.status, 'prepared');
    assert.strictEqual(res.recipient, '0.0.11334921', 'Must resolve EVM address to native Hedera account ID');
    assert.strictEqual(res.recipientVerified, true);
    assert.strictEqual(res.recipientVerificationSource, 'hedera_mirror_node');
    assert.strictEqual(res.originalRecipient, evmAddress);
    assert.strictEqual(res.isEvmAddress, true);
    assert.strictEqual(res.amount, '2.5');
    assert.strictEqual(res.amountAtomic, '250000000');
    assert.strictEqual(res.normalizedAmountUsdMicro, '200000'); // 2.5 * 80,000 = 200,000 micro-USD ($0.20)
    assert.strictEqual(res.estimatedUsdValue, '$0.20');
    assert.strictEqual(res.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(res.executionStatus, 'not_executed');
  });

  // --------------------------------------------------------------------------
  // Test 3: Invalid and deleted accounts
  // --------------------------------------------------------------------------
  await t.test('3: Invalid and deleted accounts fail closed with recipientVerified=false', async () => {
    setupMockDatabase();

    // 3a. Malformed address format
    const resMalformed = await prepareTool.handler(mockAgentContext, {
      recipient: 'not-a-valid-hedera-account',
      amount: '1',
      asset: 'USDC',
    });
    assert.strictEqual(resMalformed.valid, false);
    assert.strictEqual(resMalformed.recipientVerified, false);
    assert.strictEqual(resMalformed.recipientVerificationSource, null);
    assert.strictEqual(resMalformed.executionStatus, 'not_executed');
    assert.ok(resMalformed.error?.includes('Invalid recipient address format'));

    // 3b. Non-existent native account ID
    const resNotFound = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.999999999',
      amount: '1',
      asset: 'USDC',
    });
    assert.strictEqual(resNotFound.valid, false);
    assert.strictEqual(resNotFound.recipientVerified, false);
    assert.strictEqual(resNotFound.recipientVerificationSource, null);
    assert.strictEqual(resNotFound.executionStatus, 'not_executed');
    assert.ok(resNotFound.error?.includes('does not exist on Hedera network'));

    // 3c. Non-existent EVM address
    const resEvmNotFound = await prepareTool.handler(mockAgentContext, {
      recipient: '0x9999999999999999999999999999999999999999',
      amount: '1',
      asset: 'USDC',
    });
    assert.strictEqual(resEvmNotFound.valid, false);
    assert.strictEqual(resEvmNotFound.recipientVerified, false);
    assert.strictEqual(resEvmNotFound.recipientVerificationSource, null);
    assert.strictEqual(resEvmNotFound.executionStatus, 'not_executed');
    assert.ok(resEvmNotFound.error?.includes('does not exist on Hedera network'));

    // 3d. Deleted native account
    setTestMirrorMock({
      getAccount: async () => ({
        account: '0.0.555555',
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 0, timestamp: '', tokens: [] },
        deleted: true, // Marked as deleted!
        evm_address: '',
        key: null,
      }),
    });

    const resDeleted = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.555555',
      amount: '1',
      asset: 'USDC',
    });
    assert.strictEqual(resDeleted.valid, false);
    assert.strictEqual(resDeleted.recipientVerified, false);
    assert.strictEqual(resDeleted.executionStatus, 'not_executed');
    assert.ok(resDeleted.error?.includes('has been deleted on Hedera network'));

    // 3e. Deleted EVM address
    setTestMirrorMock({
      getAccountByEvmAddress: async () => ({
        account: '0.0.666666',
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 0, timestamp: '', tokens: [] },
        deleted: true, // Marked as deleted!
        evm_address: '0x1234567890123456789012345678901234567890',
        key: null,
      }),
    });

    const resEvmDeleted = await prepareTool.handler(mockAgentContext, {
      recipient: '0x1234567890123456789012345678901234567890',
      amount: '1',
      asset: 'USDC',
    });
    assert.strictEqual(resEvmDeleted.valid, false);
    assert.strictEqual(resEvmDeleted.recipientVerified, false);
    assert.strictEqual(resEvmDeleted.executionStatus, 'not_executed');
    assert.ok(resEvmDeleted.error?.includes('has been deleted on Hedera network'));
  });

  // --------------------------------------------------------------------------
  // Test 4: Wrong network
  // --------------------------------------------------------------------------
  await t.test('4: Unsupported network is rejected immediately without network queries', async () => {
    setupMockDatabase();

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'USDC',
      network: 'ethereum:mainnet',
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.recipientVerified, false);
    assert.strictEqual(res.recipientVerificationSource, null);
    assert.strictEqual(res.executionStatus, 'not_executed');
    assert.ok(res.error?.includes('Unsupported network "ethereum:mainnet"'));
  });

  // --------------------------------------------------------------------------
  // Test 5: USD-micro spending limit response in get_agent_spending_limit & prepare
  // --------------------------------------------------------------------------
  await t.test('5: USD-micro spending limit response transparency across policy tools', async () => {
    setupMockDatabase();

    // 5a. get_agent_spending_limit explicitly returns USD_MICRO
    const limitRes = await spendingLimitTool.handler(mockAgentContext, {});
    assert.strictEqual(limitRes.denomination, 'USD_MICRO');
    assert.strictEqual(limitRes.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(limitRes.perTransactionLimitUsdMicro, '5000000');
    assert.strictEqual(limitRes.dailyBudgetUsdMicro, '20000000');
    assert.strictEqual(limitRes.dailySpentUsdMicro, '0');
    assert.strictEqual(limitRes.dailyReservedUsdMicro, '0');
    assert.strictEqual(limitRes.remainingDailyBudgetUsdMicro, '20000000');
    assert.strictEqual(limitRes.monthlyBudgetUsdMicro, '100000000');
    assert.strictEqual(limitRes.monthlySpentUsdMicro, '0');
    assert.strictEqual(limitRes.remainingMonthlyBudgetUsdMicro, '100000000');

    // Displays in formatted USD
    assert.strictEqual(limitRes.maxPerTransactionDisplay, '$5.00 USD');
    assert.strictEqual(limitRes.dailyBudgetDisplay, '$20.00 USD');

    // 5b. prepare_wallet_payment includes USD-micro spending limit fields
    const prepRes = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'USDC',
    });
    assert.strictEqual(prepRes.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(prepRes.perTransactionLimitUsdMicro, '5000000');
    assert.strictEqual(prepRes.remainingDailyBudgetUsdMicro, '20000000');
  });

  // --------------------------------------------------------------------------
  // Test 6: Daily remaining budget calculation
  // --------------------------------------------------------------------------
  await t.test('6: Daily remaining budget accurately calculates spent + active reservations in USD-micro', async () => {
    // Daily budget: 20,000,000 ($20.00)
    // Spent today: 7,000,000 ($7.00)
    // Active reservation: 3,000,000 ($3.00)
    // Remaining daily: 20,000,000 - 7,000,000 - 3,000,000 = 10,000,000 ($10.00)
    const policyWithSpent = {
      ...defaultPolicy,
      spent_today: '7000000',
      period_start_date: new Date().toISOString(),
    };

    const mockReservations = [
      {
        id: 'res-active-1',
        agent_id: mockAgentContext.agentId,
        amount_usd_micro: '3000000',
        status: 'reserved',
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      },
    ];

    setupMockDatabase(
      {
        spent_today: '7000000',
        period_start_date: new Date().toISOString(),
      },
      mockReservations
    );

    const prepRes = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'USDC',
    });

    assert.strictEqual(prepRes.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(prepRes.dailyBudgetUsdMicro, '20000000');
    assert.strictEqual(prepRes.dailySpentUsdMicro, '7000000');
    assert.strictEqual(prepRes.dailyReservedUsdMicro, '3000000');
    assert.strictEqual(prepRes.remainingDailyBudgetUsdMicro, '10000000', 'Remaining budget must be exactly 10,000,000 micro-USD ($10.00)');
  });

  // --------------------------------------------------------------------------
  // Test 7: Autonomous payments disabled transparency
  // --------------------------------------------------------------------------
  await t.test('7: When autonomous_payments_enabled=false, preparation returns requiresHumanApproval=true, approvalStatus=not_requested', async () => {
    let insertCalls = 0;

    const disabledPolicy = {
      ...defaultPolicy,
      autonomous_payments_enabled: false, // Autonomous disabled!
    };

    setTestSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: disabledPolicy, error: null }),
            }),
            maybeSingle: async () => ({ data: disabledPolicy, error: null }),
          }),
        }),
        insert: () => {
          insertCalls++;
          return { select: () => ({ single: async () => ({ data: { id: 'new-pay' }, error: null }) }) };
        },
      }),
    });

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'USDC',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.status, 'approval_required');
    assert.strictEqual(res.requiresHumanApproval, true, 'Must require human approval');
    assert.strictEqual(res.approvalStatus, 'not_requested', 'Approval status must be not_requested');
    assert.strictEqual(res.executionStatus, 'not_executed', 'Execution status must be not_executed');
    assert.strictEqual(insertCalls, 0, 'Preparation must never create an approval record or payment row in database');
  });

  // --------------------------------------------------------------------------
  // Test 8: Sponsored fee separation
  // --------------------------------------------------------------------------
  await t.test('8: Facilitator fee (0.001 HBAR) is separated from recipient transfer amount', async () => {
    setupMockDatabase();
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'test_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
    });

    // 1 HBAR recipient transfer amount
    assert.strictEqual(res.amount, '1');
    assert.strictEqual(res.amountAtomic, '100000000');
    assert.strictEqual(res.normalizedAmountUsdMicro, '80000'); // $0.08 for transfer

    // Separate sponsored fee
    assert.strictEqual(res.estimatedNetworkFee, '0.001 HBAR');
    assert.strictEqual(res.estimatedFeeTinybars, '100000');
    assert.strictEqual(res.feePayer, 'facilitator (sponsored)');
    assert.strictEqual(res.feeStatus, 'sponsored_by_facilitator');
    assert.strictEqual(res.feeModel, 'sponsored_x402');
  });

  // --------------------------------------------------------------------------
  // Test 9: Missing or stale exchange rate fails closed
  // --------------------------------------------------------------------------
  await t.test('9: Missing or stale exchange rate fails closed during preparation', async () => {
    setupMockDatabase();

    // 9a. Missing oracle
    setTestPriceOracleMock(() => null);
    const resMissing = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
    });
    assert.strictEqual(resMissing.valid, false);
    assert.strictEqual(resMissing.status, 'price_oracle_unavailable');
    assert.strictEqual(resMissing.executionStatus, 'not_executed');
    assert.ok(resMissing.error?.includes('Price conversion failed closed'));

    // 9b. Stale oracle (> 300s old)
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'stale_test',
      timestamp: Date.now() - 400_000,
      decimals: 6,
    }));

    const resStale = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
    });
    assert.strictEqual(resStale.valid, false);
    assert.strictEqual(resStale.status, 'price_oracle_unavailable');
    assert.strictEqual(resStale.executionStatus, 'not_executed');
    assert.ok(resStale.error?.includes('Price conversion failed closed'));
  });

  // --------------------------------------------------------------------------
  // Test 10: Preparation never executes or broadcasts a payment
  // --------------------------------------------------------------------------
  await t.test('10: Preparation never executes or broadcasts a payment', async () => {
    let anyWriteOperationOccurred = false;

    setTestSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: defaultPolicy, error: null }),
            }),
            maybeSingle: async () => ({ data: defaultPolicy, error: null }),
          }),
        }),
        insert: () => {
          anyWriteOperationOccurred = true;
          throw new Error('ILLEGAL_MUTATION: insert called during preparation');
        },
        update: () => {
          anyWriteOperationOccurred = true;
          throw new Error('ILLEGAL_MUTATION: update called during preparation');
        },
        delete: () => {
          anyWriteOperationOccurred = true;
          throw new Error('ILLEGAL_MUTATION: delete called during preparation');
        },
      }),
      rpc: () => {
        anyWriteOperationOccurred = true;
        throw new Error('ILLEGAL_MUTATION: rpc called during preparation');
      },
    });

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '5',
      asset: 'USDC',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.executionStatus, 'not_executed');
    assert.strictEqual(res.approvalStatus, 'not_requested');
    assert.strictEqual((res as any).transactionId, undefined);
    assert.strictEqual((res as any).paymentId, undefined);
    assert.strictEqual(anyWriteOperationOccurred, false, 'No database mutation or payment execution may occur during preparation');
  });

  // --------------------------------------------------------------------------
  // Test 11: 0.01 HBAR evaluates to 686 USD-micro with sub-cent formatting $0.000686
  // --------------------------------------------------------------------------
  await t.test('11: 0.01 HBAR at $0.068597 evaluates to 686 USD-micro and formats as $0.000686 (never $0.00)', async () => {
    setupMockDatabase();
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.068597',
      priceMicroUsd: 68597n,
      source: 'hedera_exchange_rate_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '0.01',
      asset: 'HBAR',
      network: 'hedera:testnet',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.amount, '0.01');
    assert.strictEqual(res.amountAtomic, '1000000'); // 1,000,000 tinybars
    assert.strictEqual(res.asset, 'HBAR');
    // Math: ceil(1,000,000 * 68,597 / 100,000,000) = ceil(685.97) = 686 micro-USD
    assert.strictEqual(res.normalizedAmountUsdMicro, '686');
    assert.strictEqual(res.estimatedUsdValue, '$0.000686', 'Sub-cent amount must display as $0.000686, never rounded to $0.00');
    assert.strictEqual(res.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(res.requiresHumanApproval, false);
    assert.strictEqual(res.executionStatus, 'not_executed');
  });

  // --------------------------------------------------------------------------
  // Test 12: 1 HBAR at $0.068597 is evaluated as 68,597 USD-micro, NOT 100,000,000 tinybars
  // --------------------------------------------------------------------------
  await t.test('12: 1 HBAR at $0.068597 is evaluated as 68,597 USD-micro (not 100,000,000 tinybars)', async () => {
    setupMockDatabase();
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.068597',
      priceMicroUsd: 68597n,
      source: 'hedera_exchange_rate_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
      network: 'hedera:testnet',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.amount, '1');
    assert.strictEqual(res.amountAtomic, '100000000'); // 100,000,000 tinybars
    assert.strictEqual(res.asset, 'HBAR');
    // Crucial check: Policy evaluates against 68,597 USD-micro, NOT 100,000,000 tinybars!
    assert.strictEqual(res.normalizedAmountUsdMicro, '68597');
    assert.notStrictEqual(res.normalizedAmountUsdMicro, '100000000', 'Must NEVER use raw tinybars for spending limit evaluation');
    assert.strictEqual(res.estimatedUsdValue, '$0.07');
    assert.strictEqual(res.requiresHumanApproval, false, '1 HBAR ($0.068597) is well below the $5.00 limit');
    assert.strictEqual(res.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(res.executionStatus, 'not_executed');
  });

  // --------------------------------------------------------------------------
  // Test 13: 100 HBAR at $0.068597 evaluates to 6,859,700 USD-micro and exceeds $5.00 limit
  // --------------------------------------------------------------------------
  await t.test('13: 100 HBAR at $0.068597 evaluates to 6,859,700 USD-micro and requires human approval (> $5.00)', async () => {
    setupMockDatabase();
    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.068597',
      priceMicroUsd: 68597n,
      source: 'hedera_exchange_rate_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '100',
      asset: 'HBAR',
      network: 'hedera:testnet',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.status, 'approval_required');
    assert.strictEqual(res.amount, '100');
    assert.strictEqual(res.amountAtomic, '10000000000');
    assert.strictEqual(res.normalizedAmountUsdMicro, '6859700'); // ~$6.86 USD
    assert.strictEqual(res.estimatedUsdValue, '$6.86');
    assert.strictEqual(res.requiresHumanApproval, true, 'Amount ($6.86) exceeds $5.00 transaction limit');
    assert.ok(res.approvalReason?.includes('exceeds per-transaction limit'));
    assert.strictEqual(res.approvalStatus, 'not_requested');
    assert.strictEqual(res.executionStatus, 'not_executed');
  });

  // --------------------------------------------------------------------------
  // Test 14: 5 USDC evaluates to 5,000,000 USD-micro at boundary ($5.00 limit)
  // --------------------------------------------------------------------------
  await t.test('14: 5 USDC evaluates to exactly 5,000,000 USD-micro at per-transaction boundary ($5.00 limit)', async () => {
    setupMockDatabase();

    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '5',
      asset: 'USDC',
      network: 'hedera:testnet',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.status, 'prepared');
    assert.strictEqual(res.amount, '5');
    assert.strictEqual(res.amountAtomic, '5000000');
    assert.strictEqual(res.asset, 'USDC');
    assert.strictEqual(res.normalizedAmountUsdMicro, '5000000'); // 1:1 mapping
    assert.strictEqual(res.estimatedUsdValue, '$5.00');
    assert.strictEqual(res.perTransactionLimitUsdMicro, '5000000');
    assert.strictEqual(res.requiresHumanApproval, false, '5 USDC is within the <= $5.00 limit');
    assert.strictEqual(res.executionStatus, 'not_executed');
  });

  // --------------------------------------------------------------------------
  // Test 15: Mixed budget exhaustion across USDC and HBAR enforces daily limits in USD-micro
  // --------------------------------------------------------------------------
  await t.test('15: Mixed budget exhaustion across USDC and HBAR enforces daily limits in USD-micro', async () => {
    // Policy: Daily budget = $20.00 (20,000,000 USD-micro)
    // Already spent today: $18.00 USDC (18,000,000 USD-micro)
    // Remaining daily: $2.00 (2,000,000 USD-micro)
    setupMockDatabase({
      spent_today: '18000000',
      period_start_date: new Date().toISOString(),
    });

    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'hedera_exchange_rate_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Attempt 30 HBAR @ $0.08/HBAR = $2.40 USD (2,400,000 USD-micro)
    // 2,400,000 > 2,000,000 remaining daily budget!
    const res = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '30',
      asset: 'HBAR',
      network: 'hedera:testnet',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.status, 'approval_required');
    assert.strictEqual(res.normalizedAmountUsdMicro, '2400000');
    assert.strictEqual(res.remainingDailyBudgetUsdMicro, '2000000');
    assert.strictEqual(res.requiresHumanApproval, true, 'Must require human approval because $2.40 HBAR exceeds remaining daily budget $2.00');
    assert.ok(res.approvalReason?.includes('exceeds remaining daily budget'));
    assert.strictEqual(res.approvalStatus, 'not_requested');
    assert.strictEqual(res.executionStatus, 'not_executed');
  });

  // --------------------------------------------------------------------------
  // Test 16: Execution bypass prevention (execute_wallet_payment respects policy)
  // --------------------------------------------------------------------------
  await t.test('16: Execution bypass prevention: execute_wallet_payment cannot bypass spending limits', async () => {
    const executeTool = PAIDX_MCP_TOOLS.find((tool) => tool.name === 'execute_wallet_payment')!;
    assert.ok(executeTool, 'execute_wallet_payment tool must exist');

    setTestPriceOracleMock(() => ({
      assetSymbol: 'HBAR',
      priceUsd: '0.080000',
      priceMicroUsd: 80000n,
      source: 'test_oracle',
      timestamp: Date.now(),
      decimals: 6,
    }));

    // Mock policy where autonomous payments are disabled
    const disabledPolicy = {
      ...defaultPolicy,
      autonomous_payments_enabled: false,
    };

    setTestSupabaseClient({
      from: (table: string) => ({
        select: () => ({
          eq: (col1: string, val1: any) => ({
            eq: (col2: string, val2: any) => ({
              maybeSingle: async () => {
                if (table === 'agent_policies') {
                  return { data: disabledPolicy, error: null };
                }
                return { data: null, error: null };
              },
            }),
            maybeSingle: async () => {
              if (table === 'agent_policies') {
                return { data: disabledPolicy, error: null };
              }
              return { data: null, error: null };
            },
          }),
        }),
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({
              data: { id: 'blocked-pay-123' },
              error: null,
            }),
          }),
        }),
      }),
      rpc: (fnName: string) => {
        if (fnName === 'reserve_agent_budget') {
          return Promise.resolve({
            data: {
              allowed: false,
              requires_human_approval: true,
              reason: 'Autonomous payments disabled. Human approval required.',
            },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    });

    const res = await executeTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1',
      asset: 'HBAR',
    });

    assert.strictEqual(res.success, false, 'Direct execution without approval must fail');
    assert.strictEqual(res.status, 'approval_required');
    assert.strictEqual(res.requiresHumanApproval, true);
    assert.ok(res.error?.includes('Human approval required'));
  });
});
