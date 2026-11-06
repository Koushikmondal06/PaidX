import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAccountBalances, getHtsAssetConfig, fromAtomicUnits } from '../hedera/hts';
import {
  parseToAtomicUnits,
  validateDecimalString,
  isValidHederaTokenId,
} from '../hedera/decimal';
import {
  getMirrorTransaction,
  getMirrorTopicMessages,
  getMirrorTopicMessageBySequence,
  getHashScanTxUrl,
} from '../hedera/mirrorNode';
import { createRecipientPaymentRequirements } from '../hedera/x402/requirements';
import { orchestrateAgentPayment } from '../agent/orchestrator';
import { normalizeToUsdMicro, PriceOracleError } from '../agent/priceOracle';
import { SUPPORTED_HEDERA_ASSETS } from '../hedera/types';
import { isValidHederaAccountId } from '../hedera/client';
import type { AgentContext } from '../agent/policyEngine';

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (agentContext: AgentContext, args: any) => Promise<any>;
}

export const PAIDX_MCP_TOOLS: McpToolDefinition[] = [
  // ==========================================
  // 1. WALLET TOOLS
  // ==========================================
  {
    name: 'get_connected_wallet',
    description: 'Retrieves metadata about the currently connected PaidX wallet authorized for this AI agent.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      return {
        walletId: ctx.walletId,
        walletAddress: ctx.walletAddress,
        network: 'hedera:testnet',
        agentName: ctx.agentName,
        status: 'connected',
      };
    },
  },
  {
    name: 'get_wallet_address',
    description: 'Returns the Hedera Account ID (e.g. 0.0.123456) of the connected PaidX wallet.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      return {
        address: ctx.walletAddress,
        network: 'hedera:testnet',
      };
    },
  },
  {
    name: 'get_wallet_balance',
    description: 'Queries the current on-chain HBAR and token balances (such as USDC) for the connected PaidX wallet.',
    parameters: {
      type: 'object',
      properties: {
        asset: { type: 'string', description: 'Optional token symbol (e.g. USDC, HBAR) or token ID.' },
      },
    },
    handler: async (ctx, args) => {
      const balances = await getAccountBalances(ctx.walletAddress);
      if (args?.asset && typeof args.asset === 'string') {
        const symbol = args.asset.toUpperCase();
        const config = getHtsAssetConfig(symbol);
        const tokenRaw = balances.tokens[config.tokenId] || '0';
        return {
          account: ctx.walletAddress,
          asset: config.symbol,
          tokenId: config.tokenId,
          balance: config.isNativeHbar
            ? balances.hbarBalance
            : fromAtomicUnits(tokenRaw, config.decimals),
        };
      }
      return {
        account: ctx.walletAddress,
        hbarBalance: balances.hbarBalance,
        tokenBalances: balances.tokens,
      };
    },
  },
  {
    name: 'get_supported_assets',
    description: 'Returns the list of assets supported by the PaidX Hedera x402 payment facilitator (USDC, HBAR).',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      return {
        assets: Object.values(SUPPORTED_HEDERA_ASSETS).map((a) => ({
          symbol: a.symbol,
          name: a.name,
          tokenId: a.tokenId,
          decimals: a.decimals,
          isNativeHbar: !!a.isNativeHbar,
        })),
      };
    },
  },
  {
    name: 'get_supported_networks',
    description: 'Returns the blockchain networks supported for agent payments.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      return {
        networks: [
          {
            id: 'hedera:testnet',
            name: 'Hedera Testnet',
            type: 'hedera',
            chainId: 296,
            explorer: 'https://hashscan.io/testnet',
          },
        ],
      };
    },
  },

  // ==========================================
  // 2. PAYMENT TOOLS
  // ==========================================
  {
    name: 'prepare_wallet_payment',
    description:
      'Prepares a recipient-directed Hedera x402 payment estimate, validating recipient address, atomic amount, and payment requirements before execution.',
    parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient Hedera Account ID (e.g. 0.0.123456)' },
        amount: { type: 'string', description: 'Amount to send (e.g. "5" or "5.00")' },
        asset: { type: 'string', description: 'Asset symbol (e.g. USDC, HBAR). Defaults to USDC.' },
      },
      required: ['recipient', 'amount'],
    },
    handler: async (ctx, args) => {
      const recipient = args?.recipient?.trim();
      if (!recipient || !isValidHederaAccountId(recipient)) {
        throw new Error(`Invalid recipient account ID: "${recipient}"`);
      }

      const asset = args?.asset || 'USDC';
      const tokenConfig = getHtsAssetConfig(asset);
      validateDecimalString(String(args?.amount || ''), tokenConfig.decimals);
      const atomicAmount = parseToAtomicUnits(String(args.amount), tokenConfig.decimals).toString();

      const { requirements } = createRecipientPaymentRequirements({
        recipient,
        amount: String(args.amount),
        assetSymbolOrId: tokenConfig.tokenId,
      });

      // Normalize amount to common USD-micro denomination via price oracle
      let normalized;
      try {
        normalized = await normalizeToUsdMicro({
          rawAtomicAmount: atomicAmount,
          assetSymbol: tokenConfig.symbol,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof PriceOracleError ? err.code : 'PRICE_ORACLE_UNAVAILABLE';
        return {
          valid: false,
          recipient,
          amountDisplay: `${args.amount} ${tokenConfig.symbol}`,
          atomicAmount,
          asset: tokenConfig.symbol,
          error: `Price conversion failed closed: ${msg}`,
          code,
        };
      }

      return {
        valid: true,
        recipient,
        amountDisplay: `${args.amount} ${tokenConfig.symbol}`,
        atomicAmount,
        asset: tokenConfig.symbol,
        tokenId: tokenConfig.tokenId,
        network: requirements.network,
        scheme: requirements.scheme,
        feePayer: requirements.extra?.feePayer || 'facilitator (sponsored)',
        estimatedNetworkFee: tokenConfig.isNativeHbar ? '0.001 HBAR' : '0.001 HBAR (facilitator sponsored)',
        estimatedFeeTinybars: '100000',
        feeModel: 'sponsored_x402',
        feeNote: 'Hedera network transaction fees are sponsored by the PaidX x402 facilitator. The recipient receives the exact requested amount.',
        authorizationStatus: 'prepared_only_not_authorized',
        policyNotice: 'Preparation validates transaction format, recipient address, and atomic units only. Spending limits, daily/monthly budgets, and autonomous payment approvals are strictly verified and enforced at execution time.',
        normalizedAmountUsdMicro: normalized.normalizedAmountUsdMicro,
        estimatedUsdValue: `$${(Number(normalized.normalizedAmountUsdMicro) / 1_000_000).toFixed(2)}`,
        priceConversion: {
          priceUsd: normalized.priceQuote.priceUsd,
          source: normalized.priceQuote.source,
          timestamp: normalized.priceQuote.timestamp,
          precision: normalized.conversionPrecision,
        },
      };
    },
  },
  {
    name: 'execute_wallet_payment',
    description:
      'Executes a real recipient-directed payment using the connected PaidX wallet via the Hedera x402 payment protocol. The recipient receives exactly the requested amount.',
    parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient Hedera Account ID (e.g. 0.0.123456)' },
        amount: { type: 'string', description: 'Amount to send (e.g. "5" for 5 USDC)' },
        asset: { type: 'string', description: 'Asset symbol (e.g. "USDC" or "HBAR"). Defaults to "USDC".' },
        network: { type: 'string', description: 'Blockchain network ("hedera:testnet").' },
        paymentReference: { type: 'string', description: 'Optional client payment reference or memo.' },
      },
      required: ['recipient', 'amount'],
    },
    handler: async (ctx, args) => {
      if (!args?.recipient || !args?.amount) {
        throw new Error('Missing required arguments: recipient and amount');
      }

      return orchestrateAgentPayment(ctx, {
        recipient: String(args.recipient).trim(),
        amount: String(args.amount).trim(),
        asset: args.asset || 'USDC',
        network: args.network || 'hedera:testnet',
        paymentReference: args.paymentReference,
      });
    },
  },
  {
    name: 'get_payment_status',
    description: 'Retrieves the current status of an agent payment by payment ID or transaction ID scoped to this agent.',
    parameters: {
      type: 'object',
      properties: {
        paymentId: { type: 'string', description: 'PaidX Payment UUID' },
        transactionId: { type: 'string', description: 'Hedera Transaction ID' },
      },
    },
    handler: async (ctx, args) => {
      const supabase = createServerSupabaseClient();
      // Strictly scope payment query to the authenticated agentId
      let query = supabase
        .from('agent_payments')
        .select('*')
        .eq('agent_id', ctx.agentId);

      if (args?.paymentId) {
        query = query.eq('id', args.paymentId);
      } else if (args?.transactionId) {
        query = query.eq('tx_id', args.transactionId);
      } else {
        return { error: 'Provide either paymentId or transactionId' };
      }

      const { data: payment } = await query.maybeSingle();
      if (!payment) return { found: false, message: 'Payment record not found for this agent.' };

      return {
        found: true,
        paymentId: payment.id,
        status: payment.status,
        recipient: payment.recipient,
        amountDisplay: payment.amount_display,
        txId: payment.tx_id,
        hashScanUrl: payment.hashscan_url,
        hcsTopicId: payment.hcs_topic_id,
        hcsSequenceNumber: payment.hcs_sequence_number,
        hcsStatus: payment.hcs_status,
        confirmedAt: payment.confirmed_at,
      };
    },
  },
  {
    name: 'get_transaction_details',
    description: 'Fetches on-chain settlement details for a Hedera transaction from the Mirror Node.',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Hedera Transaction ID (e.g. 0.0.123456@1700000000.000000000)' },
      },
      required: ['transactionId'],
    },
    handler: async (ctx, args) => {
      if (!args?.transactionId) throw new Error('transactionId is required');

      const tx = await getMirrorTransaction(args.transactionId);
      if (!tx) {
        return {
          found: false,
          transactionId: args.transactionId,
          hashScanUrl: getHashScanTxUrl(args.transactionId),
        };
      }

      return {
        found: true,
        transactionId: args.transactionId,
        status: tx.result,
        consensusTimestamp: tx.consensus_timestamp,
        chargedFeeTinybars: tx.charged_tx_fee,
        tokenTransfers: tx.token_transfers,
        hbarTransfers: tx.transfers,
        hashScanUrl: getHashScanTxUrl(args.transactionId),
      };
    },
  },
  {
    name: 'get_payment_history',
    description: 'Returns historical payments settled by this connected AI agent.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum records to return (default: 10)' },
      },
    },
    handler: async (ctx, args) => {
      const limit = Math.min(Math.max(Number(args?.limit) || 10, 1), 50);
      const supabase = createServerSupabaseClient();
      const { data: payments } = await supabase
        .from('agent_payments')
        .select('*')
        .eq('agent_id', ctx.agentId)
        .order('created_at', { ascending: false })
        .limit(limit);

      return {
        payments: payments || [],
      };
    },
  },

  // ==========================================
  // 3. AGENT POLICY TOOLS
  // ==========================================
  {
    name: 'get_agent_permissions',
    description: 'Returns the permissions and capability flags configured for this connected agent.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      const supabase = createServerSupabaseClient();
      const { data: policy } = await supabase
        .from('agent_policies')
        .select('*')
        .eq('agent_id', ctx.agentId)
        .maybeSingle();

      return {
        agentId: ctx.agentId,
        agentName: ctx.agentName,
        autonomousPaymentsEnabled: policy?.autonomous_payments_enabled ?? true,
        allowedNetworks: policy?.allowed_networks || ['hedera:testnet'],
        allowedAssets: policy?.allowed_assets || ['USDC', 'HBAR'],
        recipientAllowlist: policy?.allowed_recipients || 'Any valid recipient',
      };
    },
  },
  {
    name: 'get_agent_spending_limit',
    description: 'Returns the spending limits, daily budget, monthly budget, and remaining allowance for this agent.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      const supabase = createServerSupabaseClient();
      const { data: policy } = await supabase
        .from('agent_policies')
        .select('*')
        .eq('agent_id', ctx.agentId)
        .maybeSingle();

      if (!policy) {
        return { error: 'No policy configured for this agent' };
      }

      const maxPerTx = BigInt(policy.max_amount_per_tx || '0');
      const dailyBudget = BigInt(policy.daily_budget || '0');
      const spentToday = BigInt(policy.spent_today || '0');
      const remainingToday = dailyBudget > spentToday ? dailyBudget - spentToday : 0n;
      const monthlyBudget = BigInt(policy.monthly_budget || '0');
      const spentThisMonth = BigInt(policy.spent_this_month || '0');
      const POLICY_DECIMALS = 6;

      return {
        // Raw atomic limits (stored in database)
        maxPerTransaction: policy.max_amount_per_tx,
        dailyBudget: policy.daily_budget,
        spentToday: policy.spent_today,
        remainingToday: remainingToday.toString(),
        monthlyBudget: policy.monthly_budget,
        spentThisMonth: policy.spent_this_month,

        // Explicit Denomination & Precision Metadata
        denomination: 'USDC_ATOMIC',
        unit: 'micro-units (6 decimal places)',
        baseAsset: 'USDC',
        decimals: POLICY_DECIMALS,

        // Human-Readable Formatted Displays
        maxPerTransactionDisplay: `${fromAtomicUnits(maxPerTx.toString(), POLICY_DECIMALS)} USDC`,
        dailyBudgetDisplay: `${fromAtomicUnits(dailyBudget.toString(), POLICY_DECIMALS)} USDC`,
        spentTodayDisplay: `${fromAtomicUnits(spentToday.toString(), POLICY_DECIMALS)} USDC`,
        remainingTodayDisplay: `${fromAtomicUnits(remainingToday.toString(), POLICY_DECIMALS)} USDC`,
        monthlyBudgetDisplay: `${fromAtomicUnits(monthlyBudget.toString(), POLICY_DECIMALS)} USDC`,
        spentThisMonthDisplay: `${fromAtomicUnits(spentThisMonth.toString(), POLICY_DECIMALS)} USDC`,

        // Asset Conversion & Precision Reference
        assetConversionReference: {
          USDC: { decimals: 6, atomicUnitsPerToken: '1000000', atomicUnitName: 'micro-USDC' },
          HBAR: { decimals: 8, atomicUnitsPerToken: '100000000', atomicUnitName: 'tinybar' },
          note: 'Spending policy limits are configured in 6-decimal atomic units ($10^6 = 1.00 USDC / USD). HBAR uses 8 decimal places (100,000,000 tinybars = 1 HBAR). When evaluating HBAR payments against raw atomic limits, 1 HBAR is 100,000,000 tinybars.',
        },

        // Policy Flags
        autonomousPaymentsEnabled: policy.autonomous_payments_enabled,
        periodStartDate: policy.period_start_date,
      };
    },
  },
  {
    name: 'get_agent_spending_history',
    description: 'Returns active spending reservations and recent budget deductions for this agent.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      const supabase = createServerSupabaseClient();
      const { data: reservations } = await supabase
        .from('agent_spending_reservations')
        .select('*')
        .eq('agent_id', ctx.agentId)
        .order('created_at', { ascending: false })
        .limit(10);

      return {
        recentReservations: reservations || [],
      };
    },
  },
  {
    name: 'request_payment_approval',
    description:
      'Creates a pending payment request requiring explicit human authorization when spending limits or autonomous policy requires user review.',
    parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient Hedera Account ID' },
        amount: { type: 'string', description: 'Payment amount' },
        asset: { type: 'string', description: 'Payment asset (e.g. USDC)' },
        reason: { type: 'string', description: 'Reason human approval is required' },
      },
      required: ['recipient', 'amount', 'reason'],
    },
    handler: async (ctx, args) => {
      const recipient = args?.recipient?.trim();
      if (!recipient || !isValidHederaAccountId(recipient)) {
        throw new Error(`Invalid recipient account ID: "${recipient}"`);
      }

      const assetSymbol = (args?.asset || 'USDC').trim().toUpperCase();
      const tokenConfig = getHtsAssetConfig(assetSymbol);
      validateDecimalString(String(args?.amount || ''), tokenConfig.decimals);
      const atomicAmount = parseToAtomicUnits(String(args.amount), tokenConfig.decimals).toString();

      // Normalize amount into common USD-micro denomination
      const normalized = await normalizeToUsdMicro({
        rawAtomicAmount: atomicAmount,
        assetSymbol: tokenConfig.symbol,
      });

      const supabase = createServerSupabaseClient();
      const { data: payment, error } = await supabase
        .from('agent_payments')
        .insert({
          agent_id: ctx.agentId,
          user_id: ctx.userId,
          wallet_id: ctx.walletId,
          recipient,
          amount_atomic: atomicAmount,
          amount_display: `${args.amount} ${tokenConfig.symbol}`,
          asset: tokenConfig.symbol,
          asset_id: tokenConfig.tokenId,
          network: 'hedera:testnet',
          status: 'approval_required',
          idempotency_key: `${ctx.agentId}:approval-${Date.now()}`,
          failure_reason: `Pending human review: ${args.reason}`,
          amount_usd_micro: normalized.normalizedAmountUsdMicro,
          price_source: normalized.priceQuote.source,
          price_usd: normalized.priceQuote.priceUsd,
          price_timestamp: new Date(normalized.priceQuote.timestamp).toISOString(),
        })
        .select()
        .single();

      if (error || !payment) {
        throw new Error(`Failed to queue approval request: ${error?.message || 'Database error'}`);
      }

      return {
        approvalRequested: true,
        paymentId: payment.id,
        recipient,
        amount: args.amount,
        atomicAmount,
        asset: tokenConfig.symbol,
        status: 'approval_required',
        message: 'Payment request queued. The user must approve this payment in their PaidX Console before execution.',
        normalizedAmountUsdMicro: normalized.normalizedAmountUsdMicro,
        estimatedUsdValue: `$${(Number(normalized.normalizedAmountUsdMicro) / 1_000_000).toFixed(2)}`,
        priceConversion: {
          priceUsd: normalized.priceQuote.priceUsd,
          source: normalized.priceQuote.source,
          timestamp: normalized.priceQuote.timestamp,
        },
      };
    },
  },

  // ==========================================
  // 4. AUDIT TOOLS (Hedera Native Services Track)
  // ==========================================
  {
    name: 'get_hedera_payment_audit',
    description:
      'Retrieves immutable audit messages published to the PaidX Hedera Consensus Service (HCS) topic.',
    parameters: {
      type: 'object',
      properties: {
        topicId: { type: 'string', description: 'Optional HCS Topic ID. Defaults to configured PaidX audit topic.' },
        limit: { type: 'number', description: 'Maximum messages to return (default: 5)' },
      },
    },
    handler: async (ctx, args) => {
      const topicId = args?.topicId || process.env.HEDERA_HCS_TOPIC_ID;
      if (!topicId) {
        return { error: 'No HCS Topic ID configured or provided.' };
      }

      const limit = Math.min(Math.max(Number(args?.limit) || 5, 1), 25);
      const messages = await getMirrorTopicMessages(topicId, limit);

      const parsed = messages.map((m) => {
        let content: any = null;
        try {
          content = JSON.parse(Buffer.from(m.message, 'base64').toString('utf8'));
        } catch {
          content = m.message;
        }
        return {
          sequenceNumber: m.sequence_number,
          consensusTimestamp: m.consensus_timestamp,
          runningHash: m.running_hash,
          payload: content,
        };
      });

      return {
        topicId,
        messages: parsed,
      };
    },
  },
  {
    name: 'verify_hedera_payment',
    description:
      'Cross-verifies an x402 payment settlement against both the Hedera Mirror Node and the HCS audit trail.',
    parameters: {
      type: 'object',
      properties: {
        transactionId: { type: 'string', description: 'Hedera Transaction ID to verify' },
      },
      required: ['transactionId'],
    },
    handler: async (ctx, args) => {
      if (!args?.transactionId) throw new Error('transactionId is required');

      const tx = await getMirrorTransaction(args.transactionId);
      const isSettled = tx && tx.result === 'SUCCESS';

      // Query associated payment record from database
      const supabase = createServerSupabaseClient();
      const { data: paymentRecord } = await supabase
        .from('agent_payments')
        .select('*')
        .eq('tx_id', args.transactionId)
        .eq('agent_id', ctx.agentId)
        .maybeSingle();

      let hcsAuditVerified = false;
      let hcsVerifiedEvent: any = null;

      // Independent HCS verification: fetch actual message from Hedera Mirror Node
      if (paymentRecord?.hcs_topic_id && paymentRecord?.hcs_sequence_number) {
        const topicId = paymentRecord.hcs_topic_id;
        const seqNum = Number(paymentRecord.hcs_sequence_number);
        const mirrorMsg = await getMirrorTopicMessageBySequence(topicId, seqNum);

        if (mirrorMsg && mirrorMsg.message) {
          try {
            const decodedJson = Buffer.from(mirrorMsg.message, 'base64').toString('utf8');
            const parsedEvent = JSON.parse(decodedJson);
            hcsVerifiedEvent = parsedEvent;

            // Verify topic ID, sequence number, payment ID, transaction ID, and event payload
            const matchesTopic = mirrorMsg.topic_id === topicId;
            const matchesSeq = Number(mirrorMsg.sequence_number) === seqNum;
            const matchesPaymentId = parsedEvent.paymentId === paymentRecord.id;
            const matchesTxId = parsedEvent.transactionId === args.transactionId;
            const matchesRecipient = parsedEvent.recipient === paymentRecord.recipient;
            const matchesAmount = parsedEvent.amountAtomic === paymentRecord.amount_atomic;

            if (
              matchesTopic &&
              matchesSeq &&
              matchesPaymentId &&
              matchesTxId &&
              matchesRecipient &&
              matchesAmount
            ) {
              hcsAuditVerified = true;
            }
          } catch {
            hcsAuditVerified = false;
          }
        }
      }

      return {
        transactionId: args.transactionId,
        isVerifiedOnHedera: !!isSettled,
        consensusTimestamp: tx?.consensus_timestamp || null,
        hashScanUrl: getHashScanTxUrl(args.transactionId),
        chargedFeeTinybars: tx?.charged_tx_fee || 0,
        result: tx?.result || 'PENDING_OR_NOT_FOUND',
        hcsAuditVerified,
        hcsTopicId: paymentRecord?.hcs_topic_id || null,
        hcsSequenceNumber: paymentRecord?.hcs_sequence_number || null,
        hcsEvent: hcsAuditVerified ? hcsVerifiedEvent : null,
      };
    },
  },
];
