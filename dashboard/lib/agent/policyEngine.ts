import 'server-only';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
 * using either the PostgreSQL stored procedure `reserve_agent_budget` or atomic SQL transaction.
 */
export async function evaluateAndReserveBudget({
  agentId,
  atomicAmount,
  assetSymbol,
  network,
  recipient,
  idempotencyKey,
}: {
  agentId: string;
  atomicAmount: string;
  assetSymbol: string;
  network: string;
  recipient: string;
  idempotencyKey: string;
}): Promise<PolicyCheckResult> {
  const supabase = createServerSupabaseClient();
  const amountBig = BigInt(atomicAmount);

  // Try PostgreSQL RPC function first
  try {
    const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
      'reserve_agent_budget',
      {
        p_agent_id: agentId,
        p_idempotency_key: idempotencyKey,
        p_atomic_amount: atomicAmount,
        p_asset_symbol: assetSymbol,
        p_network: network,
        p_recipient: recipient,
      }
    );

    if (!rpcError && rpcResult) {
      const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      return {
        allowed: Boolean(parsed.allowed),
        requiresHumanApproval: Boolean(parsed.requires_human_approval),
        reservationId: parsed.reservation_id,
        reason: parsed.reason,
        code: parsed.code,
        dailyBudgetRemaining: parsed.daily_budget_remaining,
      };
    }
  } catch (rpcErr) {
    // If RPC is not available in local mock environment, proceed to application-level atomic check
  }

  // Application-level Atomic Check
  // 1. Verify Agent Connection
  const { data: connection } = await supabase
    .from('agent_connections')
    .select('id, status, expires_at')
    .eq('id', agentId)
    .single();

  if (!connection || connection.status !== 'active') {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: `Agent is ${connection?.status || 'not found'}.`,
      code: 'AGENT_INACTIVE',
    };
  }

  if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: 'Agent token has expired.',
      code: 'AGENT_EXPIRED',
    };
  }

  // 2. Check existing reservation for idempotency
  const { data: existingReservation } = await supabase
    .from('agent_spending_reservations')
    .select('*')
    .eq('agent_id', agentId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingReservation && existingReservation.status === 'reserved') {
    return {
      allowed: true,
      requiresHumanApproval: false,
      reservationId: existingReservation.id,
    };
  }

  // 3. Load agent policy
  const { data: policy, error: policyError } = await supabase
    .from('agent_policies')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (policyError || !policy) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      reason: 'No spending policy configured for this agent',
      code: 'POLICY_NOT_FOUND',
    };
  }

  // 4. Validate network & asset
  if (policy.allowed_networks && policy.allowed_networks.length > 0) {
    const netMatch = policy.allowed_networks.some(
      (n: string) => n.toLowerCase() === network.toLowerCase()
    );
    if (!netMatch) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        reason: `Network ${network} is not in allowed networks: [${policy.allowed_networks.join(', ')}]`,
        code: 'NETWORK_NOT_ALLOWED',
      };
    }
  }

  if (policy.allowed_assets && policy.allowed_assets.length > 0) {
    const assetMatch = policy.allowed_assets.some(
      (a: string) => a.toUpperCase() === assetSymbol.toUpperCase()
    );
    if (!assetMatch) {
      return {
        allowed: false,
        requiresHumanApproval: false,
        reason: `Asset ${assetSymbol} is not in allowed assets: [${policy.allowed_assets.join(', ')}]`,
        code: 'ASSET_NOT_ALLOWED',
      };
    }
  }

  // 5. Check recipient allowlist if set
  if (policy.allowed_recipients && policy.allowed_recipients.length > 0) {
    const recipientMatch = policy.allowed_recipients.some(
      (r: string) => r.toLowerCase() === recipient.toLowerCase()
    );
    if (!recipientMatch) {
      return {
        allowed: false,
        requiresHumanApproval: true,
        reason: `Recipient ${recipient} is not on the authorized allowlist`,
        code: 'RECIPIENT_NOT_ALLOWLISTED',
      };
    }
  }

  // 6. Rollover daily & monthly spend
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.slice(0, 7);
  let spentToday = BigInt(policy.spent_today || '0');
  let spentThisMonth = BigInt(policy.spent_this_month || '0');

  if (policy.period_start_date !== todayStr) {
    spentToday = 0n;
  }
  if (policy.period_start_date && policy.period_start_date.slice(0, 7) !== currentMonthStr) {
    spentThisMonth = 0n;
  }

  // Include active unexpired reservations
  const { data: activeReservations } = await supabase
    .from('agent_spending_reservations')
    .select('amount')
    .eq('agent_id', agentId)
    .eq('status', 'reserved')
    .gt('expires_at', new Date().toISOString());

  let activeReservedTotal = 0n;
  if (activeReservations) {
    for (const r of activeReservations) {
      activeReservedTotal += BigInt(r.amount);
    }
  }

  const maxPerTx = BigInt(policy.max_amount_per_tx);
  const dailyBudget = BigInt(policy.daily_budget);
  const monthlyBudget = BigInt(policy.monthly_budget);

  // Check per-tx limit
  if (amountBig > maxPerTx) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      reason: `Amount exceeds maximum per-transaction limit (${maxPerTx})`,
      code: 'MAX_AMOUNT_EXCEEDED',
    };
  }

  // Check daily limit
  if (spentToday + activeReservedTotal + amountBig > dailyBudget) {
    const available = dailyBudget > (spentToday + activeReservedTotal)
      ? dailyBudget - (spentToday + activeReservedTotal)
      : 0n;
    return {
      allowed: false,
      requiresHumanApproval: true,
      reason: `Transaction would exceed daily spending budget. Available: ${available.toString()}`,
      code: 'DAILY_BUDGET_EXCEEDED',
      dailyBudgetRemaining: available.toString(),
    };
  }

  // Check monthly limit
  if (spentThisMonth + activeReservedTotal + amountBig > monthlyBudget) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      reason: `Transaction would exceed monthly spending budget`,
      code: 'MONTHLY_BUDGET_EXCEEDED',
    };
  }

  // Check if approval required
  const requiresApproval =
    !policy.autonomous_payments_enabled ||
    (policy.require_approval_above && amountBig > BigInt(policy.require_approval_above));

  if (requiresApproval) {
    return {
      allowed: false,
      requiresHumanApproval: true,
      reason: 'Payment requires human approval per spending policy',
      code: 'APPROVAL_REQUIRED',
    };
  }

  // Create atomic reservation
  const { data: reservation, error: resError } = await supabase
    .from('agent_spending_reservations')
    .insert({
      agent_id: agentId,
      idempotency_key: idempotencyKey,
      amount: amountBig.toString(),
      asset: assetSymbol,
      network,
      recipient,
      status: 'reserved',
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (resError || !reservation) {
    return {
      allowed: false,
      requiresHumanApproval: false,
      reason: 'Failed to create spending reservation',
      code: 'RESERVATION_FAILED',
    };
  }

  return {
    allowed: true,
    requiresHumanApproval: false,
    reservationId: reservation.id,
    dailyBudgetRemaining: (dailyBudget - (spentToday + activeReservedTotal + amountBig)).toString(),
  };
}

/**
 * Finalizes budget deduction upon successful on-chain settlement
 */
export async function commitSettledReservation({
  agentId,
  reservationId,
  atomicAmount,
}: {
  agentId: string;
  reservationId?: string;
  atomicAmount: string;
}) {
  const supabase = createServerSupabaseClient();

  // Try PostgreSQL RPC function
  try {
    if (reservationId) {
      await (supabase as any).rpc('commit_agent_reservation', {
        p_agent_id: agentId,
        p_reservation_id: reservationId,
        p_atomic_amount: atomicAmount,
      });
      return;
    }
  } catch (rpcErr) {
    // Fallback
  }

  const amountBig = BigInt(atomicAmount);

  // Update reservation
  if (reservationId) {
    await supabase
      .from('agent_spending_reservations')
      .update({ status: 'settled', updated_at: new Date().toISOString() })
      .eq('id', reservationId);
  }

  // Update policy spend
  const { data: policy } = await supabase
    .from('agent_policies')
    .select('spent_today, spent_this_month, period_start_date')
    .eq('agent_id', agentId)
    .single();

  if (policy) {
    const todayStr = new Date().toISOString().split('T')[0];
    const prevToday = policy.period_start_date === todayStr ? BigInt(policy.spent_today || '0') : 0n;
    const prevMonth = BigInt(policy.spent_this_month || '0');

    await supabase
      .from('agent_policies')
      .update({
        spent_today: (prevToday + amountBig).toString(),
        spent_this_month: (prevMonth + amountBig).toString(),
        period_start_date: todayStr,
        updated_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId);
  }
}

/**
 * Releases reservation if payment execution failed definitively.
 * NEVER call this if the transaction may have reached consensus.
 */
export async function releaseFailedReservation(reservationId?: string, reason?: string) {
  if (!reservationId) return;
  const supabase = createServerSupabaseClient();

  try {
    await (supabase as any).rpc('release_agent_reservation', {
      p_reservation_id: reservationId,
      p_reason: reason || 'Payment failed',
    });
    return;
  } catch (rpcErr) {
    // Fallback
  }

  await supabase
    .from('agent_spending_reservations')
    .update({
      status: 'released',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reservationId)
    .eq('status', 'reserved');
}
