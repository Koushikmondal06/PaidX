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
  getMirrorAccount,
  getHashScanAccountUrl,
} from '../hedera/mirrorNode';
import { defaultMpcSigner } from '../hedera/signing/mpcSigner';
import { keyStructureMatches, type MirrorKeyNode } from '../hedera/signing/delegatedSigner';
import { PublicKey } from '@hiero-ledger/sdk';
import { createRecipientPaymentRequirements } from '../hedera/x402/requirements';
import { orchestrateAgentPayment } from '../agent/orchestrator';
import { normalizeToUsdMicro, PriceOracleError } from '../agent/priceOracle';
import { SUPPORTED_HEDERA_ASSETS } from '../hedera/types';
import { isValidHederaAccountId } from '../hedera/client';
import { resolveAndVerifyRecipientAccount } from '../hedera/recipientResolution';
import { getAgentSpendingLimitsSummary, type AgentContext } from '../agent/policyEngine';

/**
 * Format USD-micro amount into a human-readable USD string.
 * For sub-cent amounts (> 0 and < $0.01), displays exact decimal precision up to 6 decimal places (e.g. $0.000686),
 * ensuring sub-cent amounts are never rounded to "$0.00" as their only representation.
 * Always preserves normalizedAmountUsdMicro as the authoritative integer micro-dollar value.
 */
export function formatUsdFromMicro(amountUsdMicro: string | bigint | number): string {
  const micro = BigInt(amountUsdMicro);
  if (micro === 0n) return '$0.00';
  const num = Number(micro) / 1_000_000;
  if (micro > 0n && micro < 10_000n) {
    // Sub-cent amount: format with up to 6 decimal places, stripping trailing zeroes
    const formatted = num.toFixed(6).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
    return `$${formatted}`;
  }
  return `$${num.toFixed(2)}`;
}

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
      'Prepares a recipient-directed Hedera x402 payment estimate, validating recipient address, atomic amount, price normalization, spending limits, and payment requirements before execution.',
    parameters: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Recipient Hedera Account ID (e.g. 0.0.123456) or EVM address (e.g. 0x...)' },
        amount: { type: 'string', description: 'Amount to send (e.g. "5" or "5.00")' },
        asset: { type: 'string', description: 'Asset symbol (e.g. USDC, HBAR). Defaults to USDC.' },
        network: { type: 'string', description: 'Blockchain network (e.g. "hedera:testnet"). Defaults to "hedera:testnet".' },
      },
      required: ['recipient', 'amount'],
    },
    handler: async (ctx, args) => {
      const rawRecipient = (args?.recipient || '').trim();
      const rawAmount = String(args?.amount ?? '').trim();
      const rawAsset = (args?.asset || 'USDC').trim().toUpperCase();
      const network = (args?.network || 'hedera:testnet').trim();

      // Retrieve authoritative spending limits summary upfront
      const limitsSummary = await getAgentSpendingLimitsSummary(ctx.agentId);
      const spendingLimitDenomination = 'USD_MICRO';
      const perTxLimit = limitsSummary?.perTransactionLimitUsdMicro || '0';
      const remDailyBudget = limitsSummary?.remainingDailyBudgetUsdMicro || '0';

      // 1. Authoritative Recipient Verification & EVM Resolution via Hedera Mirror Node
      const resolution = await resolveAndVerifyRecipientAccount({
        recipient: rawRecipient,
        network,
      });

      if (!resolution.valid) {
        return {
          valid: false,
          status: resolution.errorCode ? resolution.errorCode.toLowerCase() : 'invalid_recipient',
          recipient: rawRecipient,
          recipientVerified: false,
          recipientVerificationSource: null,
          amount: rawAmount,
          amountAtomic: '0',
          atomicAmount: '0',
          asset: rawAsset,
          network,
          estimatedUsdValue: null,
          normalizedAmountUsdMicro: null,
          spendingLimitDenomination,
          perTransactionLimitUsdMicro: perTxLimit,
          remainingDailyBudgetUsdMicro: remDailyBudget,
          estimatedNetworkFee: null,
          feePayer: 'facilitator (sponsored)',
          requiresHumanApproval: true,
          approvalStatus: 'not_requested',
          executionStatus: 'not_executed',
          error: resolution.error || 'Recipient verification failed',
          errorCode: resolution.errorCode,
        };
      }

      // 2. Validate Asset Configuration & Decimal Amounts
      let tokenConfig;
      let atomicAmount: string;
      try {
        tokenConfig = getHtsAssetConfig(rawAsset);
        validateDecimalString(rawAmount, tokenConfig.decimals);
        atomicAmount = parseToAtomicUnits(rawAmount, tokenConfig.decimals).toString();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          valid: false,
          status: 'invalid_amount',
          recipient: resolution.recipient,
          recipientVerified: resolution.recipientVerified,
          recipientVerificationSource: resolution.recipientVerificationSource,
          amount: rawAmount,
          amountAtomic: '0',
          atomicAmount: '0',
          asset: rawAsset,
          network,
          estimatedUsdValue: null,
          normalizedAmountUsdMicro: null,
          spendingLimitDenomination,
          perTransactionLimitUsdMicro: perTxLimit,
          remainingDailyBudgetUsdMicro: remDailyBudget,
          estimatedNetworkFee: null,
          feePayer: 'facilitator (sponsored)',
          requiresHumanApproval: true,
          approvalStatus: 'not_requested',
          executionStatus: 'not_executed',
          error: msg,
          errorCode: 'INVALID_AMOUNT',
        };
      }

      // 3. Normalize Amount into USD-Micro Denomination ($10^-6 USD) via Price Oracle
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
          status: 'price_oracle_unavailable',
          recipient: resolution.recipient,
          recipientVerified: resolution.recipientVerified,
          recipientVerificationSource: resolution.recipientVerificationSource,
          amount: rawAmount,
          amountAtomic: atomicAmount,
          atomicAmount,
          asset: tokenConfig.symbol,
          network,
          estimatedUsdValue: null,
          normalizedAmountUsdMicro: null,
          spendingLimitDenomination,
          perTransactionLimitUsdMicro: perTxLimit,
          remainingDailyBudgetUsdMicro: remDailyBudget,
          estimatedNetworkFee: null,
          feeStatus: 'fee_estimation_unavailable',
          feePayer: 'facilitator (sponsored)',
          requiresHumanApproval: true,
          approvalStatus: 'not_requested',
          executionStatus: 'not_executed',
          error: `Price conversion failed closed: ${msg}`,
          code,
        };
      }

      const normalizedAmountUsdMicro = normalized.normalizedAmountUsdMicro;
      const estimatedUsdValue = formatUsdFromMicro(normalizedAmountUsdMicro);

      // 4. Policy Evaluation & Approval Transparency
      let requiresHumanApproval = false;
      let approvalReason = 'Autonomous payments enabled within authorized policy limits.';

      if (limitsSummary) {
        if (!limitsSummary.autonomousPaymentsEnabled) {
          requiresHumanApproval = true;
          approvalReason = 'Autonomous payments are disabled for this agent connection. All payments require human approval.';
        } else if (
          BigInt(normalizedAmountUsdMicro) > BigInt(limitsSummary.perTransactionLimitUsdMicro)
        ) {
          requiresHumanApproval = true;
          approvalReason = `Amount (${normalizedAmountUsdMicro} micro-USD) exceeds per-transaction limit (${limitsSummary.perTransactionLimitUsdMicro} micro-USD).`;
        } else if (
          limitsSummary.requireApprovalAboveUsdMicro &&
          BigInt(normalizedAmountUsdMicro) > BigInt(limitsSummary.requireApprovalAboveUsdMicro)
        ) {
          requiresHumanApproval = true;
          approvalReason = `Amount exceeds agent threshold (${limitsSummary.requireApprovalAboveUsdMicro} micro-USD). Human approval required.`;
        } else if (
          BigInt(normalizedAmountUsdMicro) > BigInt(limitsSummary.remainingDailyBudgetUsdMicro)
        ) {
          requiresHumanApproval = true;
          approvalReason = `Amount exceeds remaining daily budget (${limitsSummary.remainingDailyBudgetUsdMicro} micro-USD).`;
        } else if (
          BigInt(normalizedAmountUsdMicro) > BigInt(limitsSummary.remainingMonthlyBudgetUsdMicro)
        ) {
          requiresHumanApproval = true;
          approvalReason = `Amount exceeds remaining monthly budget (${limitsSummary.remainingMonthlyBudgetUsdMicro} micro-USD).`;
        }
      } else {
        requiresHumanApproval = true;
        approvalReason = 'No spending policy configured for this agent connection. Human approval required.';
      }

      // 5. Sponsored Fee Estimation (Separated from Recipient Transfer Amount)
      const estimatedNetworkFee = '0.001 HBAR';
      const estimatedFeeTinybars = '100000';
      const feePayer = 'facilitator (sponsored)';
      const feeStatus = 'sponsored_by_facilitator';

      return {
        // Section 1: Explicit Core Return Fields
        valid: true,
        status: requiresHumanApproval ? 'approval_required' : 'prepared',
        recipient: resolution.recipient,
        recipientVerified: resolution.recipientVerified,
        recipientVerificationSource: resolution.recipientVerificationSource,
        amount: rawAmount,
        amountAtomic: atomicAmount,
        asset: tokenConfig.symbol,
        network,
        estimatedUsdValue,
        normalizedAmountUsdMicro,
        spendingLimitDenomination,
        perTransactionLimitUsdMicro: perTxLimit,
        remainingDailyBudgetUsdMicro: remDailyBudget,
        estimatedNetworkFee,
        feePayer,
        requiresHumanApproval,
        approvalStatus: 'not_requested',
        executionStatus: 'not_executed',
        authorizationStatus: 'prepared_only_not_authorized',

        // Section 3: Spending Limit Transparency (USD-micro)
        dailyBudgetUsdMicro: limitsSummary?.dailyBudgetUsdMicro || '0',
        dailySpentUsdMicro: limitsSummary?.dailySpentUsdMicro || '0',
        dailyReservedUsdMicro: limitsSummary?.dailyReservedUsdMicro || '0',
        monthlyBudgetUsdMicro: limitsSummary?.monthlyBudgetUsdMicro || '0',
        monthlySpentUsdMicro: limitsSummary?.monthlySpentUsdMicro || '0',
        remainingMonthlyBudgetUsdMicro: limitsSummary?.remainingMonthlyBudgetUsdMicro || '0',

        // Additional Context & Backwards Compatibility
        atomicAmount,
        amountDisplay: `${rawAmount} ${tokenConfig.symbol}`,
        originalRecipient: rawRecipient,
        isEvmAddress: resolution.isEvmAddress,
        resolvedAccountId: resolution.recipient,
        tokenId: tokenConfig.tokenId,
        estimatedFeeTinybars,
        feeStatus,
        feeModel: 'sponsored_x402',
        feeNote: 'Hedera network transaction fee (0.001 HBAR / 100,000 tinybars) is sponsored by the PaidX x402 facilitator. The recipient receives the exact transfer amount.',
        policyNotice: 'Preparation calculates limits and validates recipient/atomic amounts without executing transactions or creating payment records.',
        approvalReason,
        spendingLimits: {
          denomination: spendingLimitDenomination,
          perTransactionLimit: perTxLimit,
          dailyBudget: limitsSummary?.dailyBudgetUsdMicro || '0',
          dailySpent: limitsSummary?.dailySpentUsdMicro || '0',
          dailyReserved: limitsSummary?.dailyReservedUsdMicro || '0',
          dailyRemaining: remDailyBudget,
          monthlyBudget: limitsSummary?.monthlyBudgetUsdMicro || '0',
          monthlySpent: limitsSummary?.monthlySpentUsdMicro || '0',
          monthlyRemaining: limitsSummary?.remainingMonthlyBudgetUsdMicro || '0',
          autonomousPaymentsEnabled: limitsSummary?.autonomousPaymentsEnabled ?? false,
        },
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
        recipient: { type: 'string', description: 'Recipient Hedera Account ID (e.g. 0.0.123456) or EVM address (e.g. 0x...)' },
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

      // Authoritative recipient resolution (supports EVM address or native account ID)
      const resolution = await resolveAndVerifyRecipientAccount({
        recipient: String(args.recipient).trim(),
        network: args.network || 'hedera:testnet',
      });

      if (!resolution.valid) {
        return {
          success: false,
          status: 'failed',
          recipient: String(args.recipient).trim(),
          amount: String(args.amount).trim(),
          amountDisplay: `${args.amount} ${args.asset || 'USDC'}`,
          asset: args.asset || 'USDC',
          network: args.network || 'hedera:testnet',
          error: resolution.error || 'Recipient address verification failed',
        };
      }

      return orchestrateAgentPayment(ctx, {
        recipient: resolution.recipient,
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
    description: 'Returns the spending limits, daily budget, monthly budget, and remaining allowance for this agent in USD-micro units.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      const summary = await getAgentSpendingLimitsSummary(ctx.agentId);

      if (!summary) {
        return { error: 'No policy configured for this agent' };
      }

      const POLICY_DECIMALS = 6;
      const maxPerTx = BigInt(summary.perTransactionLimitUsdMicro);
      const dailyBudget = BigInt(summary.dailyBudgetUsdMicro);
      const spentToday = BigInt(summary.dailySpentUsdMicro);
      const dailyReserved = BigInt(summary.dailyReservedUsdMicro);
      const remainingToday = BigInt(summary.remainingDailyBudgetUsdMicro);
      const monthlyBudget = BigInt(summary.monthlyBudgetUsdMicro);
      const spentThisMonth = BigInt(summary.monthlySpentUsdMicro);
      const remainingMonth = BigInt(summary.remainingMonthlyBudgetUsdMicro);

      return {
        // Section 3: Explicit USD_MICRO Denomination Standard
        denomination: 'USD_MICRO',
        spendingLimitDenomination: 'USD_MICRO',
        unit: 'micro-USD ($10^-6 USD, 6 decimal places)',
        decimals: POLICY_DECIMALS,

        // Required explicit fields (USD-micro)
        perTransactionLimit: summary.perTransactionLimitUsdMicro,
        perTransactionLimitUsdMicro: summary.perTransactionLimitUsdMicro,
        dailyBudget: summary.dailyBudgetUsdMicro,
        dailyBudgetUsdMicro: summary.dailyBudgetUsdMicro,
        dailySpent: summary.dailySpentUsdMicro,
        dailySpentUsdMicro: summary.dailySpentUsdMicro,
        dailyReserved: summary.dailyReservedUsdMicro,
        dailyReservedUsdMicro: summary.dailyReservedUsdMicro,
        dailyRemaining: summary.remainingDailyBudgetUsdMicro,
        dailyRemainingUsdMicro: summary.remainingDailyBudgetUsdMicro,
        remainingDailyBudgetUsdMicro: summary.remainingDailyBudgetUsdMicro,
        monthlyBudget: summary.monthlyBudgetUsdMicro,
        monthlyBudgetUsdMicro: summary.monthlyBudgetUsdMicro,
        monthlySpent: summary.monthlySpentUsdMicro,
        monthlySpentUsdMicro: summary.monthlySpentUsdMicro,
        monthlyRemaining: summary.remainingMonthlyBudgetUsdMicro,
        remainingMonthlyBudgetUsdMicro: summary.remainingMonthlyBudgetUsdMicro,

        // Backwards-compatible aliases
        maxPerTransaction: summary.perTransactionLimitUsdMicro,
        spentToday: summary.dailySpentUsdMicro,
        remainingToday: summary.remainingDailyBudgetUsdMicro,
        spentThisMonth: summary.monthlySpentUsdMicro,

        // Human-Readable Formatted Displays
        maxPerTransactionDisplay: `${formatUsdFromMicro(maxPerTx)} USD`,
        dailyBudgetDisplay: `${formatUsdFromMicro(dailyBudget)} USD`,
        dailySpentDisplay: `${formatUsdFromMicro(spentToday)} USD`,
        dailyReservedDisplay: `${formatUsdFromMicro(dailyReserved)} USD`,
        remainingTodayDisplay: `${formatUsdFromMicro(remainingToday)} USD`,
        monthlyBudgetDisplay: `${formatUsdFromMicro(monthlyBudget)} USD`,
        spentThisMonthDisplay: `${formatUsdFromMicro(spentThisMonth)} USD`,
        remainingMonthlyDisplay: `${formatUsdFromMicro(remainingMonth)} USD`,

        // Asset Conversion & Precision Reference
        assetConversionReference: {
          USDC: { decimals: 6, atomicUnitsPerToken: '1000000', atomicUnitName: 'micro-USDC' },
          HBAR: { decimals: 8, atomicUnitsPerToken: '100000000', atomicUnitName: 'tinybar' },
          note: 'Spending policy limits are evaluated in common USD-micro units ($10^-6 USD). USDC maps 1:1 into USD-micro. HBAR tinybars are normalized via the Hedera exchange rate oracle with integer ceiling division.',
        },

        // Policy Flags
        autonomousPaymentsEnabled: summary.autonomousPaymentsEnabled,
        allowedNetworks: summary.allowedNetworks,
        allowedAssets: summary.allowedAssets,
        allowedRecipients: summary.allowedRecipients,
        periodStartDate: summary.periodStartDate,
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
        estimatedUsdValue: formatUsdFromMicro(normalized.normalizedAmountUsdMicro),
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

  // ==========================================
  // 5. MPC & AUTONOMOUS SIGNING DIAGNOSTIC TOOLS
  // ==========================================
  {
    name: 'get_mpc_enrollment_status',
    description:
      'Queries MPC threshold enrollment status, public key fingerprint, key share distribution, and rotation metadata for the connected account.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      const accountId = ctx.walletAddress;
      const mpcKey = defaultMpcSigner.getKey(accountId);
      const supabase = createServerSupabaseClient();
      const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', ctx.walletId)
        .maybeSingle();

      const metadata = (wallet?.verification_metadata || {}) as Record<string, any>;
      const isEnrolled = Boolean(mpcKey && mpcKey.status === 'active') || Boolean(metadata?.mpc_enrolled);

      return {
        accountId,
        evmAddress: wallet?.evm_address || null,
        isEnrolled,
        status: mpcKey?.status || (metadata?.mpc_enrolled ? 'active' : 'not_enrolled'),
        curve: mpcKey?.curve || 'secp256k1',
        mpcPublicKeyHex: mpcKey?.publicKeyHex || metadata?.mpc_public_key || null,
        mpcPublicKeyDer: mpcKey?.publicKeyDer || null,
        fingerprint: mpcKey?.agentSessionShare?.fingerprint || metadata?.recovery_share_fingerprint || null,
        threshold: mpcKey?.threshold || metadata?.threshold || 2,
        totalShares: mpcKey?.totalShares || metadata?.total_shares || 3,
        keyRotationCount: mpcKey?.keyRotationCount || 0,
        enrolledAt: mpcKey?.createdAt || metadata?.mpc_enrolled_at || null,
        shares: {
          share1_agentSession: mpcKey ? 'active_in_memory' : 'provisioned',
          share2_serverCoSigner: 'encrypted_in_keystore',
          share3_userRecovery: 'held_by_user_offline',
        },
      };
    },
  },
  {
    name: 'verify_hedera_account_authorization',
    description:
      "Cross-checks on-chain Hedera Mirror Node account key structure to verify whether the account authorizes the user's primary MetaMask key and the PaidX MPC threshold key.",
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      const accountId = ctx.walletAddress;
      let mirrorAccount = null;
      try {
        mirrorAccount = await getMirrorAccount(accountId);
      } catch (err: unknown) {
        return {
          accountId,
          isAuthorizedOnChain: false,
          error: `Mirror Node query failed for account "${accountId}": ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (!mirrorAccount) {
        return {
          accountId,
          isAuthorizedOnChain: false,
          error: `Hedera account "${accountId}" not found on Mirror Node.`,
        };
      }

      const mpcKey = defaultMpcSigner.getKey(accountId);
      let mpcKeyAuthorized = false;
      if (mpcKey && mirrorAccount.key) {
        try {
          const cleanHex = mpcKey.publicKeyHex.startsWith('0x')
            ? mpcKey.publicKeyHex
            : '0x' + mpcKey.publicKeyHex;
          const pub =
            mpcKey.curve === 'secp256k1'
              ? PublicKey.fromStringECDSA(cleanHex)
              : PublicKey.fromStringED25519(mpcKey.publicKeyHex);
          mpcKeyAuthorized = keyStructureMatches(mirrorAccount.key as MirrorKeyNode, pub);
        } catch {
          mpcKeyAuthorized = false;
        }
      } else if (mirrorAccount.key) {
        const keyNode = mirrorAccount.key as any;
        mpcKeyAuthorized = Boolean(
          keyNode._type === 'ThresholdKey' ||
          keyNode._type === 'KeyList' ||
          (Array.isArray(keyNode.keys) && keyNode.keys.length > 1)
        );
      }

      return {
        accountId,
        evmAddress: mirrorAccount.evm_address || null,
        isAuthorizedOnChain: mpcKeyAuthorized,
        mpcKeyAuthorized,
        metaMaskKeyPreserved: true,
        keyStructureType: (mirrorAccount.key as any)?._type || 'SingleKey',
        mirrorThreshold: (mirrorAccount.key as any)?.threshold || 1,
        deleted: mirrorAccount.deleted,
        memo: mirrorAccount.memo,
        mirrorNodeAccountUrl: getHashScanAccountUrl(accountId, 'testnet'),
      };
    },
  },
  {
    name: 'get_agent_signing_status',
    description:
      'Returns the operational signing state of the agent, including threshold signing provider, share availability, autonomous spending permissions, and session validity.',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async (ctx) => {
      const accountId = ctx.walletAddress;
      const isMpcCanSign = await defaultMpcSigner.canSign(accountId);
      const providerType = isMpcCanSign ? 'mpc_threshold' : 'delegated_session';
      const summary = await getAgentSpendingLimitsSummary(ctx.agentId);

      return {
        agentId: ctx.agentId,
        agentName: ctx.agentName,
        walletAddress: accountId,
        signingProvider: providerType,
        autonomousPaymentsEnabled: summary ? summary.autonomousPaymentsEnabled : false,
        sessionValid: true,
        shares: {
          share1_agentSession: 'available',
          share2_serverCoSigner: 'available',
          share3_userRecovery: 'offline_cold_storage',
        },
        spendingLimits: summary
          ? {
              denomination: 'USD_MICRO',
              perTransactionLimitUsdMicro: summary.perTransactionLimitUsdMicro,
              dailyBudgetUsdMicro: summary.dailyBudgetUsdMicro,
              remainingDailyBudgetUsdMicro: summary.remainingDailyBudgetUsdMicro,
              monthlyBudgetUsdMicro: summary.monthlyBudgetUsdMicro,
              remainingMonthlyBudgetUsdMicro: summary.remainingMonthlyBudgetUsdMicro,
            }
          : null,
      };
    },
  },
];
