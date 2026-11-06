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
 * using the PostgreSQL stored procedure `reserve_agent_budget`.
 * Strictly executes with row-level locks and fail-closed security.
 * Non-atomic application-level fallback logic is completely removed.
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

  // Execute atomic PostgreSQL stored procedure
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
