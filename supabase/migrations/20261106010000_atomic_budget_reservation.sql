-- ==============================================================================
-- PaidX Hedera Agentic Wallet Migration: 20261106010000_atomic_budget_reservation.sql
-- Implements Atomic Budget Reservations, Concurrency Row Locks, and Idempotency
-- ==============================================================================

-- 1. Extend agent_payments status check constraint to include all required states
ALTER TABLE public.agent_payments DROP CONSTRAINT IF EXISTS agent_payments_status_check;
ALTER TABLE public.agent_payments ADD CONSTRAINT agent_payments_status_check
  CHECK (status IN (
    'pending',
    'reserved',
    'signing',
    'submitting',
    'submitted',
    'confirmed',
    'failed',
    'declined',
    'uncertain',
    'approval_required'
  ));

-- 2. Add hcs_status column to track asynchronous and retryable HCS audit publication
ALTER TABLE public.agent_payments
  ADD COLUMN IF NOT EXISTS hcs_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (hcs_status IN ('pending', 'published', 'pending_retry', 'failed'));

-- 3. Composite unique indexes for scoped idempotency per agent
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_spending_reservations_agent_idemp
  ON public.agent_spending_reservations(agent_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_payments_agent_idemp
  ON public.agent_payments(agent_id, idempotency_key);

-- ------------------------------------------------------------------------------
-- 4. Atomic Stored Procedure: reserve_agent_budget
-- Locks the agent policy row, validates limits/rollovers, and creates reservation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_agent_budget(
  p_agent_id UUID,
  p_idempotency_key TEXT,
  p_atomic_amount NUMERIC(78, 0),
  p_asset_symbol TEXT,
  p_network TEXT,
  p_recipient TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_agent public.agent_connections%ROWTYPE;
  v_policy public.agent_policies%ROWTYPE;
  v_existing_reservation public.agent_spending_reservations%ROWTYPE;
  v_today DATE := CURRENT_DATE;
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_policy_month DATE;
  v_spent_today NUMERIC(78, 0);
  v_spent_this_month NUMERIC(78, 0);
  v_active_reserved NUMERIC(78, 0) := 0;
  v_daily_remaining NUMERIC(78, 0);
  v_requires_approval BOOLEAN := FALSE;
  v_reservation_id UUID;
BEGIN
  -- 1. Check existing reservation for exact idempotency
  SELECT * INTO v_existing_reservation
  FROM public.agent_spending_reservations
  WHERE agent_id = p_agent_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing_reservation.status = 'reserved' THEN
      RETURN jsonb_build_object(
        'allowed', TRUE,
        'requires_human_approval', FALSE,
        'reservation_id', v_existing_reservation.id,
        'idempotent_replay', TRUE
      );
    ELSIF v_existing_reservation.status = 'settled' THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'requires_human_approval', FALSE,
        'code', 'ALREADY_SETTLED',
        'reason', 'This payment intent has already settled on-chain.'
      );
    END IF;
  END IF;

  -- 2. Verify agent status and expiration with row lock
  SELECT * INTO v_agent
  FROM public.agent_connections
  WHERE id = p_agent_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'code', 'AGENT_NOT_FOUND',
      'reason', 'Agent connection does not exist.'
    );
  END IF;

  IF v_agent.status <> 'active' THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'code', 'AGENT_REVOKED',
      'reason', 'Agent connection is ' || v_agent.status || '.'
    );
  END IF;

  IF v_agent.expires_at IS NOT NULL AND v_agent.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'code', 'AGENT_EXPIRED',
      'reason', 'Agent connection token has expired.'
    );
  END IF;

  -- 3. Lock agent policy row strictly FOR UPDATE
  SELECT * INTO v_policy
  FROM public.agent_policies
  WHERE agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'code', 'POLICY_NOT_FOUND',
      'reason', 'No spending policy configured for this agent.'
    );
  END IF;

  -- 4. Check Allowed Networks
  IF v_policy.allowed_networks IS NOT NULL AND array_length(v_policy.allowed_networks, 1) > 0 THEN
    IF NOT (lower(p_network) = ANY (SELECT lower(unnest(v_policy.allowed_networks)))) THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'code', 'NETWORK_NOT_ALLOWED',
        'reason', 'Network ' || p_network || ' is not in allowed networks: [' || array_to_string(v_policy.allowed_networks, ', ') || ']'
      );
    END IF;
  END IF;

  -- 5. Check Allowed Assets
  IF v_policy.allowed_assets IS NOT NULL AND array_length(v_policy.allowed_assets, 1) > 0 THEN
    IF NOT (upper(p_asset_symbol) = ANY (SELECT upper(unnest(v_policy.allowed_assets)))) THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'code', 'ASSET_NOT_ALLOWED',
        'reason', 'Asset ' || p_asset_symbol || ' is not in allowed assets: [' || array_to_string(v_policy.allowed_assets, ', ') || ']'
      );
    END IF;
  END IF;

  -- 6. Check Recipient Allowlist (if configured)
  IF v_policy.allowed_recipients IS NOT NULL AND array_length(v_policy.allowed_recipients, 1) > 0 THEN
    IF NOT (lower(p_recipient) = ANY (SELECT lower(unnest(v_policy.allowed_recipients)))) THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'requires_human_approval', TRUE,
        'code', 'RECIPIENT_NOT_ALLOWLISTED',
        'reason', 'Recipient ' || p_recipient || ' is not in the authorized allowlist.'
      );
    END IF;
  END IF;

  -- 7. Check Max Amount Per Transaction
  IF p_atomic_amount > v_policy.max_amount_per_tx THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'requires_human_approval', TRUE,
      'code', 'MAX_AMOUNT_EXCEEDED',
      'reason', 'Amount (' || p_atomic_amount || ') exceeds maximum per-transaction limit (' || v_policy.max_amount_per_tx || ')'
    );
  END IF;

  -- 8. Daily and Monthly Rollover Calculations
  v_spent_today := v_policy.spent_today;
  v_spent_this_month := v_policy.spent_this_month;
  v_policy_month := date_trunc('month', v_policy.period_start_date)::DATE;

  IF v_policy.period_start_date < v_today THEN
    v_spent_today := 0;
  END IF;

  IF v_policy_month < v_current_month THEN
    v_spent_this_month := 0;
  END IF;

  -- 9. Calculate outstanding active unexpired reservations
  SELECT COALESCE(SUM(amount), 0) INTO v_active_reserved
  FROM public.agent_spending_reservations
  WHERE agent_id = p_agent_id
    AND status = 'reserved'
    AND expires_at > NOW();

  -- 10. Check Daily Budget
  IF (v_spent_today + v_active_reserved + p_atomic_amount) > v_policy.daily_budget THEN
    v_daily_remaining := GREATEST(v_policy.daily_budget - (v_spent_today + v_active_reserved), 0);
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'requires_human_approval', TRUE,
      'code', 'DAILY_BUDGET_EXCEEDED',
      'reason', 'Transaction would exceed daily spending budget. Available: ' || v_daily_remaining,
      'daily_budget_remaining', v_daily_remaining::TEXT
    );
  END IF;

  -- 11. Check Monthly Budget
  IF (v_spent_this_month + v_active_reserved + p_atomic_amount) > v_policy.monthly_budget THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'requires_human_approval', TRUE,
      'code', 'MONTHLY_BUDGET_EXCEEDED',
      'reason', 'Transaction would exceed monthly spending budget.'
    );
  END IF;

  -- 12. Check Human Approval Requirements
  IF NOT v_policy.autonomous_payments_enabled THEN
    v_requires_approval := TRUE;
  ELSIF v_policy.require_approval_above IS NOT NULL AND p_atomic_amount > v_policy.require_approval_above THEN
    v_requires_approval := TRUE;
  END IF;

  IF v_requires_approval THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'requires_human_approval', TRUE,
      'code', 'APPROVAL_REQUIRED',
      'reason', 'Payment requires human approval per agent spending policy.'
    );
  END IF;

  -- 13. Create Atomic Spending Reservation
  INSERT INTO public.agent_spending_reservations (
    agent_id,
    idempotency_key,
    amount,
    asset,
    network,
    recipient,
    status,
    expires_at
  ) VALUES (
    p_agent_id,
    p_idempotency_key,
    p_atomic_amount,
    p_asset_symbol,
    p_network,
    p_recipient,
    'reserved',
    NOW() + INTERVAL '10 minutes'
  )
  RETURNING id INTO v_reservation_id;

  -- Update policy rollover state if needed
  IF v_policy.period_start_date < v_today THEN
    UPDATE public.agent_policies
    SET spent_today = 0,
        spent_this_month = v_spent_this_month,
        period_start_date = v_today,
        updated_at = NOW()
    WHERE agent_id = p_agent_id;
  END IF;

  v_daily_remaining := v_policy.daily_budget - (v_spent_today + v_active_reserved + p_atomic_amount);

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'requires_human_approval', FALSE,
    'reservation_id', v_reservation_id,
    'daily_budget_remaining', v_daily_remaining::TEXT
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Atomic Stored Procedure: commit_agent_reservation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_agent_reservation(
  p_agent_id UUID,
  p_reservation_id UUID,
  p_atomic_amount NUMERIC(78, 0)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_policy public.agent_policies%ROWTYPE;
  v_spent_today NUMERIC(78, 0);
  v_spent_this_month NUMERIC(78, 0);
BEGIN
  -- 1. Update reservation status to settled
  UPDATE public.agent_spending_reservations
  SET status = 'settled',
      updated_at = NOW()
  WHERE id = p_reservation_id
    AND agent_id = p_agent_id;

  -- 2. Lock and update policy spent amounts
  SELECT * INTO v_policy
  FROM public.agent_policies
  WHERE agent_id = p_agent_id
  FOR UPDATE;

  IF FOUND THEN
    v_spent_today := v_policy.spent_today;
    v_spent_this_month := v_policy.spent_this_month;

    IF v_policy.period_start_date < v_today THEN
      v_spent_today := 0;
    END IF;

    IF date_trunc('month', v_policy.period_start_date)::DATE < v_current_month THEN
      v_spent_this_month := 0;
    END IF;

    UPDATE public.agent_policies
    SET spent_today = v_spent_today + p_atomic_amount,
        spent_this_month = v_spent_this_month + p_atomic_amount,
        period_start_date = v_today,
        updated_at = NOW()
    WHERE agent_id = p_agent_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Atomic Stored Procedure: release_agent_reservation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_agent_reservation(
  p_reservation_id UUID,
  p_reason TEXT DEFAULT 'Payment execution aborted'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.agent_spending_reservations
  SET status = 'released',
      updated_at = NOW()
  WHERE id = p_reservation_id
    AND status = 'reserved';

  RETURN FOUND;
END;
$$;
