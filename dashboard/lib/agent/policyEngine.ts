import 'server-only';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  normalizeToUsdMicro,
  PriceOracleError,
  type PriceQuote,
} from './priceOracle';

export interface AgentContext {
  agentId: string;
  agentName: string;
  userId: string;
  walletId: string;
  walletAddress: string;
}

export interface PolicyCheckResult {
  allowed: boolean;
  requiresHumanApproval: boolean;
  reservationId?: string;
  reason?: string;
  code?: string;
  dailyBudgetRemaining?: string;
  normalizedAmountUsdMicro?: string;
  priceSource?: string;
  priceUsd?: string;
  priceTimestamp?: number;
}

/**
 * Computes SHA-256 hash of raw agent API token
 */
export function hashAgentToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Authenticates an agent request and returns the agent context and authorized wallet.
 * Scoped strictly to the authenticated agent token hash and active Hedera wallet.
 */
export async function authenticateAgentToken(rawToken: string): Promise<AgentContext | null> {
  if (!rawToken || typeof rawToken !== 'string') return null;

  const cleanToken = rawToken.replace(/^Bearer\s+/i, '').trim();
  if (!cleanToken || !cleanToken.startsWith('paidx_agt_')) {
    return null;
  }

  const tokenHash = hashAgentToken(cleanToken);
  const supabase = createServerSupabaseClient();

  const { data: connection, error } = await supabase
    .from('agent_connections')
    .select(`
      id,
      agent_name,
      user_id,
      wallet_id,
      status,
      expires_at,
      wallets (
        id,
        address,
        kind
      )
    `)
    .eq('api_key_hash', tokenHash)
    .maybeSingle();

  if (error || !connection) return null;
  if (connection.status !== 'active') return null;

  if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
    return null;
  }

  const wallet = (connection as any).wallets;
  if (!wallet || wallet.kind !== 'hedera' || !wallet.address) {
    return null;
  }

  return {
    agentId: connection.id,
    agentName: connection.agent_name,
    userId: connection.user_id,
    walletId: connection.wallet_id,
    walletAddress: wallet.address,
  };
}

/**
 * Checks agent spending policy and creates an atomic spending reservation
 * using the PostgreSQL stored procedure `reserve_agent_budget`.
 * Evaluates spending against limits using normalized USD-micro denomination ($10^-6 USD).
 * Strictly executes with row-level locks and fail-closed security.
 */
export async function evaluateAndReserveBudget({
  agentId,
  atomicAmount,
  assetSymbol,
  network,
  recipient,
  idempotencyKey,
  normalizedAmountUsdMicro,
  priceQuote,
}: {
  agentId: string;
  atomicAmount: string;
  assetSymbol: string;
  network: string;
  recipient: string;
  idempotencyKey: string;
  normalizedAmountUsdMicro?: string;
  priceQuote?: PriceQuote;
}): Promise<PolicyCheckResult> {
  // 1. Normalize amount into USD-micro denomination if not pre-computed
  let effectiveNormalized = normalizedAmountUsdMicro;
  let effectiveQuote = priceQuote;

  if (!effectiveNormalized) {
    try {
      const normalized = await normalizeToUsdMicro({
        rawAtomicAmount: atomicAmount,
        assetSymbol,
        priceOverride: priceQuote,
      });
      effectiveNormalized = normalized.normalizedAmountUsdMicro;
      effectiveQuote = normalized.priceQuote;
    } catch (err: unknown) {
      const code = err instanceof PriceOracleError ? err.code : 'PRICE_ORACLE_UNAVAILABLE';
      const msg = err instanceof Error ? err.message : String(err);
      return {
        allowed: false,
        requiresHumanApproval: false,
        code,
        reason: `Spending limit evaluation failed closed: ${msg}`,
      };
    }
  }

  const supabase = createServerSupabaseClient();

  // 2. Execute atomic PostgreSQL stored procedure with normalized USD-micro parameters
  // Parameter order strictly matches PostgreSQL function declaration
  const priceTimestampIso = effectiveQuote?.timestamp
    ? new Date(effectiveQuote.timestamp).toISOString()
    : null;

  const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
    'reserve_agent_budget',
    {
      p_agent_id: agentId,
      p_idempotency_key: idempotencyKey,
      p_atomic_amount: atomicAmount,
      p_asset_symbol: assetSymbol,
      p_network: network,
      p_recipient: recipient,
      p_amount_usd_micro: effectiveNormalized,
      p_price_source: effectiveQuote?.source || null,
      p_price_usd: effectiveQuote?.priceUsd || null,
      p_price_timestamp: priceTimestampIso,
    }
  );

  // Check the returned Supabase RPC error object explicitly
  if (rpcError) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: `Atomic budget reservation RPC failed: ${rpcError.message || JSON.stringify(rpcError)}`,
      code: 'RPC_EXECUTION_ERROR',
    };
  }

  if (!rpcResult) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: 'Atomic budget reservation RPC returned null. Payment rejected.',
      code: 'NULL_RESERVATION_RESULT',
    };
  }

  const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;

  return {
    allowed: Boolean(parsed.allowed),
    requiresHumanApproval: Boolean(parsed.requires_human_approval),
    reservationId: parsed.reservation_id,
    reason: parsed.reason,
    code: parsed.code,
    dailyBudgetRemaining: parsed.daily_budget_remaining,
    normalizedAmountUsdMicro: parsed.normalized_amount_usd_micro || effectiveNormalized,
    priceSource: effectiveQuote?.source,
    priceUsd: effectiveQuote?.priceUsd,
    priceTimestamp: effectiveQuote?.timestamp,
  };
}

/**
 * Finalizes budget deduction upon successful on-chain settlement.
 * Invokes the atomic PostgreSQL stored procedure `commit_agent_reservation`.
 * Enforces strict transitions from 'reserved' to 'settled' and idempotent commits.
 */
export async function commitSettledReservation({
  agentId,
  reservationId,
  atomicAmount,
}: {
  agentId: string;
  reservationId?: string;
  atomicAmount: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!reservationId) {
    return { success: false, error: 'Cannot commit budget: Missing reservationId' };
  }

  const supabase = createServerSupabaseClient();

  const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
    'commit_agent_reservation',
    {
      p_agent_id: agentId,
      p_reservation_id: reservationId,
      p_atomic_amount: atomicAmount,
    }
  );

  if (rpcError) {
    const msg = `commit_agent_reservation RPC failed: ${rpcError.message || JSON.stringify(rpcError)}`;
    console.error(`[Policy Engine Error] ${msg}`);
    return { success: false, error: msg };
  }

  const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
  if (parsed && parsed.success === false) {
    const msg = parsed.reason || parsed.code || 'Commit reservation rejected by database procedure';
    console.error(`[Policy Engine Error] ${msg}`);
    return { success: false, error: msg };
  }

  return { success: true };
}

/**
 * Releases reservation if payment execution failed definitively.
 * NEVER call this if the transaction may have reached consensus.
 * Invokes the atomic PostgreSQL stored procedure `release_agent_reservation`.
 */
export async function releaseFailedReservation(
  reservationId?: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  if (!reservationId) {
    return { success: true }; // Nothing to release
  }

  const supabase = createServerSupabaseClient();

  const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
    'release_agent_reservation',
    {
      p_reservation_id: reservationId,
      p_reason: reason || 'Payment execution failed',
    }
  );

  if (rpcError) {
    const msg = `release_agent_reservation RPC failed: ${rpcError.message || JSON.stringify(rpcError)}`;
    console.warn(`[Policy Engine Warning] ${msg}`);
    return { success: false, error: msg };
  }

  return { success: true };
}

export interface AgentSpendingLimitsSummary {
  spendingLimitDenomination: 'USD_MICRO';
  perTransactionLimitUsdMicro: string;
  dailyBudgetUsdMicro: string;
  dailySpentUsdMicro: string;
  dailyReservedUsdMicro: string;
  remainingDailyBudgetUsdMicro: string;
  monthlyBudgetUsdMicro: string;
  monthlySpentUsdMicro: string;
  remainingMonthlyBudgetUsdMicro: string;
  autonomousPaymentsEnabled: boolean;
  requireApprovalAboveUsdMicro: string | null;
  allowedNetworks: string[] | null;
  allowedAssets: string[] | null;
  allowedRecipients: string[] | null;
  periodStartDate: string | null;
}

/**
 * Authoritatively queries agent spending limits, daily/monthly budgets, and reserves
 * from the database in uniform USD-micro denomination ($10^-6 USD).
 */
export async function getAgentSpendingLimitsSummary(
  agentId: string
): Promise<AgentSpendingLimitsSummary | null> {
  const supabase = createServerSupabaseClient();
  const { data: policy, error: policyError } = await supabase
    .from('agent_policies')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (policyError || !policy) {
    return null;
  }

  // Rollover calculations
  const todayStr = new Date().toISOString().split('T')[0];
  const policyDateStr = policy.period_start_date
    ? new Date(policy.period_start_date).toISOString().split('T')[0]
    : todayStr;
  const isRolloverToday = policyDateStr < todayStr;
  const dailySpentBig = isRolloverToday ? 0n : BigInt(policy.spent_today || '0');

  const currentMonthStr = todayStr.substring(0, 7);
  const policyMonthStr = policyDateStr.substring(0, 7);
  const isRolloverMonth = policyMonthStr < currentMonthStr;
  const monthlySpentBig = isRolloverMonth ? 0n : BigInt(policy.spent_this_month || '0');

  // Active unexpired reservations in USD-micro
  let dailyReservedBig = 0n;
  try {
    const { data: resvs } = await supabase
      .from('agent_spending_reservations')
      .select('amount_usd_micro, amount, expires_at')
      .eq('agent_id', agentId)
      .eq('status', 'reserved');

    if (resvs && Array.isArray(resvs)) {
      const now = Date.now();
      dailyReservedBig = resvs
        .filter((r: any) => !r.expires_at || new Date(r.expires_at).getTime() > now)
        .reduce((sum: bigint, r: any) => sum + BigInt(r.amount_usd_micro || r.amount || '0'), 0n);
    }
  } catch (resvErr) {
    console.warn('[Policy Engine] Failed to fetch active reservations:', resvErr);
  }

  const dailyBudgetBig = BigInt(policy.daily_budget || '0');
  const remainingDailyBig = dailyBudgetBig > (dailySpentBig + dailyReservedBig)
    ? dailyBudgetBig - (dailySpentBig + dailyReservedBig)
    : 0n;

  const monthlyBudgetBig = BigInt(policy.monthly_budget || '0');
  const remainingMonthlyBig = monthlyBudgetBig > (monthlySpentBig + dailyReservedBig)
    ? monthlyBudgetBig - (monthlySpentBig + dailyReservedBig)
    : 0n;

  return {
    spendingLimitDenomination: 'USD_MICRO',
    perTransactionLimitUsdMicro: String(policy.max_amount_per_tx || '0'),
    dailyBudgetUsdMicro: String(policy.daily_budget || '0'),
    dailySpentUsdMicro: dailySpentBig.toString(),
    dailyReservedUsdMicro: dailyReservedBig.toString(),
    remainingDailyBudgetUsdMicro: remainingDailyBig.toString(),
    monthlyBudgetUsdMicro: String(policy.monthly_budget || '0'),
    monthlySpentUsdMicro: monthlySpentBig.toString(),
    remainingMonthlyBudgetUsdMicro: remainingMonthlyBig.toString(),
    autonomousPaymentsEnabled: Boolean(policy.autonomous_payments_enabled),
    requireApprovalAboveUsdMicro: policy.require_approval_above || null,
    allowedNetworks: policy.allowed_networks || null,
    allowedAssets: policy.allowed_assets || null,
    allowedRecipients: policy.allowed_recipients || null,
    periodStartDate: policy.period_start_date || null,
  };
}
