import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAccountBalances, getHtsAssetConfig } from '../hedera/hts';
import { getMirrorTransaction, getMirrorTopicMessages, getHashScanTxUrl } from '../hedera/mirrorNode';
import { createRecipientPaymentRequirements } from '../hedera/x402/requirements';
import { orchestrateAgentPayment } from '../agent/orchestrator';
import { SUPPORTED_HEDERA_ASSETS } from '../hedera/types';
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
      if (args?.asset) {
        const symbol = args.asset.toUpperCase();
        const config = getHtsAssetConfig(symbol);
        const tokenRaw = balances.tokens[config.tokenId] || '0';
        return {
          account: ctx.walletAddress,
          asset: config.symbol,
          tokenId: config.tokenId,
          balance: config.isNativeHbar ? balances.hbarBalance : (Number(tokenRaw) / 10 ** config.decimals).toString(),
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
      const asset = args.asset || 'USDC';
      const { requirements, tokenConfig, atomicAmount } = createRecipientPaymentRequirements({
        recipient: args.recipient,
        amount: args.amount,
        assetSymbolOrId: asset,
      });

      return {
        valid: true,
        recipient: args.recipient,
        amountDisplay: `${args.amount} ${tokenConfig.symbol}`,
        atomicAmount,
        asset: tokenConfig.symbol,
        tokenId: tokenConfig.tokenId,
        network: requirements.network,
        scheme: requirements.scheme,
        feePayer: requirements.extra?.feePayer,
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
      const res = await orchestrateAgentPayment(ctx, {
        recipient: args.recipient,
        amount: args.amount,
        asset: args.asset || 'USDC',
        network: args.network || 'hedera:testnet',
        paymentReference: args.paymentReference,
      });

      return res;
    },
  },
  {
    name: 'get_payment_status',
    description: 'Retrieves the current status of an agent payment by payment ID or transaction ID.',
    parameters: {
      type: 'object',
      properties: {
        paymentId: { type: 'string', description: 'PaidX Payment UUID' },
        transactionId: { type: 'string', description: 'Hedera Transaction ID' },
      },
    },
    handler: async (ctx, args) => {
      const supabase = createServerSupabaseClient();
      let query = supabase.from('agent_payments').select('*');

      if (args.paymentId) {
        query = query.eq('id', args.paymentId);
      } else if (args.transactionId) {
        query = query.eq('tx_id', args.transactionId);
      } else {
        return { error: 'Provide either paymentId or transactionId' };
      }

      const { data: payment } = await query.maybeSingle();
      if (!payment) return { found: false };

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
      const limit = args.limit || 10;
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
        return { error: 'No policy configured' };
      }

      const dailyBudget = BigInt(policy.daily_budget || '0');
      const spentToday = BigInt(policy.spent_today || '0');
      const remainingToday = dailyBudget > spentToday ? dailyBudget - spentToday : 0n;

      return {
        maxPerTransaction: policy.max_amount_per_tx,
        dailyBudget: policy.daily_budget,
        spentToday: policy.spent_today,
        remainingToday: remainingToday.toString(),
        monthlyBudget: policy.monthly_budget,
        spentThisMonth: policy.spent_this_month,
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
      const supabase = createServerSupabaseClient();
      const { data: payment } = await supabase
        .from('agent_payments')
        .insert({
          agent_id: ctx.agentId,
          user_id: ctx.userId,
          wallet_id: ctx.walletId,
          recipient: args.recipient,
          amount_atomic: args.amount,
          amount_display: `${args.amount} ${args.asset || 'USDC'}`,
          asset: args.asset || 'USDC',
          asset_id: '0.0.5449156',
          status: 'pending',
          idempotency_key: `approval-${ctx.agentId}-${Date.now()}`,
          failure_reason: `Pending human review: ${args.reason}`,
        })
        .select()
        .single();

      return {
        approvalRequested: true,
        paymentId: payment?.id,
        recipient: args.recipient,
        amount: args.amount,
        status: 'pending_user_approval',
        message: 'Payment request queued. The user can approve this payment in their PaidX Console.',
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
      const topicId = args.topicId || process.env.HEDERA_HCS_TOPIC_ID || '0.0.5449200';
      const messages = await getMirrorTopicMessages(topicId, args.limit || 5);

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
      const tx = await getMirrorTransaction(args.transactionId);
      const isSettled = tx && tx.result === 'SUCCESS';

      return {
        transactionId: args.transactionId,
        isVerifiedOnHedera: !!isSettled,
        consensusTimestamp: tx?.consensus_timestamp || null,
        hashScanUrl: getHashScanTxUrl(args.transactionId),
        chargedFeeTinybars: tx?.charged_tx_fee || 0,
        result: tx?.result || 'PENDING_OR_NOT_FOUND',
      };
    },
  },
];
