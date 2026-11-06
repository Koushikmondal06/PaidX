-- ==============================================================================
-- PaidX Multi-Asset Spending Limit Normalization Migration
-- Migration: 20261107000000_multi_asset_spending_normalization.sql
--
-- Introduces common USD-micro denomination ($10^-6 USD, 6 decimals) for policy evaluation.
-- Normalizes HBAR and USDC against USD-micro spending limits while preserving exact
-- raw atomic amounts for transaction construction and on-chain settlement.
-- ==============================================================================

-- 1. Add normalized USD-micro and price oracle metadata columns to agent_spending_reservations
ALTER TABLE public.agent_spending_reservations
  ADD COLUMN IF NOT EXISTS amount_usd_micro NUMERIC(78, 0),
  ADD COLUMN IF NOT EXISTS price_source TEXT,
  ADD COLUMN IF NOT EXISTS price_usd TEXT,
  ADD COLUMN IF NOT EXISTS price_timestamp TIMESTAMPTZ;

-- Backfill amount_usd_micro for existing reservations (which were USDC 6 decimals)
UPDATE public.agent_spending_reservations
SET amount_usd_micro = amount
WHERE amount_usd_micro IS NULL;

-- 2. Add normalized USD-micro and price oracle metadata columns to agent_payments
ALTER TABLE public.agent_payments
  ADD COLUMN IF NOT EXISTS amount_usd_micro NUMERIC(78, 0),
  ADD COLUMN IF NOT EXISTS price_source TEXT,
  ADD COLUMN IF NOT EXISTS price_usd TEXT,
  ADD COLUMN IF NOT EXISTS price_timestamp TIMESTAMPTZ;

-- Backfill amount_usd_micro for existing agent_payments
UPDATE public.agent_payments
SET amount_usd_micro = amount_atomic
WHERE amount_usd_micro IS NULL AND upper(asset) = 'USDC';

-- ------------------------------------------------------------------------------
-- 3. Atomic Stored Procedure: reserve_agent_budget
-- Enforces multi-asset spending limits evaluated in common USD-micro denomination.
-- Locks the agent policy row FOR UPDATE to prevent concurrency race conditions.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_agent_budget(
  p_agent_id UUID,
  p_idempotency_key TEXT,
  p_atomic_amount NUMERIC(78, 0),
  p_asset_symbol TEXT,
  p_network TEXT,
  p_recipient TEXT,
  p_amount_usd_micro NUMERIC(78, 0) DEFAULT NULL,
  p_price_source TEXT DEFAULT NULL,
  p_price_usd TEXT DEFAULT NULL,
  p_price_timestamp TIMESTAMPTZ DEFAULT NULL
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
  v_normalized_amount NUMERIC(78, 0);
  v_requires_approval BOOLEAN := FALSE;
  v_reservation_id UUID;
BEGIN
  -- 1. Check existing reservation for exact idempotency and parameter binding
  SELECT * INTO v_existing_reservation
  FROM public.agent_spending_reservations
  WHERE agent_id = p_agent_id AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    -- Bind idempotency key strictly to atomic amount, recipient, asset, and network
    IF v_existing_reservation.amount <> p_atomic_amount OR
       v_existing_reservation.recipient <> p_recipient OR
       upper(v_existing_reservation.asset) <> upper(p_asset_symbol) OR
       lower(v_existing_reservation.network) <> lower(p_network) THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'code', 'IDEMPOTENCY_CONFLICT',
        'reason', 'Idempotency key was previously used with different payment parameters (amount, recipient, asset, or network).'
      );
    END IF;

    IF v_existing_reservation.status = 'reserved' THEN
      RETURN jsonb_build_object(
        'allowed', TRUE,
        'requires_human_approval', FALSE,
        'reservation_id', v_existing_reservation.id,
        'idempotent_replay', TRUE,
        'normalized_amount_usd_micro', COALESCE(v_existing_reservation.amount_usd_micro, v_existing_reservation.amount)::TEXT
      );
    ELSIF v_existing_reservation.status = 'settled' THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'requires_human_approval', FALSE,
        'code', 'ALREADY_SETTLED',
        'reason', 'This payment intent has already settled on-chain.'
      );
    ELSIF v_existing_reservation.status = 'released' THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'requires_human_approval', FALSE,
        'code', 'ALREADY_RELEASED',
        'reason', 'This payment intent was previously released.'
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

  -- 3. Lock agent policy row strictly FOR UPDATE to serialize concurrent reservations
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

  -- 7. Determine Normalized USD-Micro Amount for Policy Evaluation
  -- If p_amount_usd_micro is provided, use it. Otherwise fall back to p_atomic_amount (USDC 6 decimals).
  v_normalized_amount := COALESCE(p_amount_usd_micro, p_atomic_amount);

  -- 8. Check Max Amount Per Transaction (in USD-micro)
  IF v_normalized_amount > v_policy.max_amount_per_tx THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'requires_human_approval', TRUE,
      'code', 'MAX_AMOUNT_EXCEEDED',
      'reason', 'Normalized amount (' || v_normalized_amount || ' micro-USD) exceeds maximum per-transaction limit (' || v_policy.max_amount_per_tx || ' micro-USD)'
    );
  END IF;

  -- 9. Daily and Monthly Rollover Calculations
  v_spent_today := v_policy.spent_today;
  v_spent_this_month := v_policy.spent_this_month;
  v_policy_month := date_trunc('month', v_policy.period_start_date)::DATE;

  IF v_policy.period_start_date < v_today THEN
    v_spent_today := 0;
  END IF;

  IF v_policy_month < v_current_month THEN
    v_spent_this_month := 0;
  END IF;

  -- 10. Calculate outstanding active unexpired reservations in USD-micro units
  SELECT COALESCE(SUM(COALESCE(amount_usd_micro, amount)), 0) INTO v_active_reserved
  FROM public.agent_spending_reservations
  WHERE agent_id = p_agent_id
    AND status = 'reserved'
    AND expires_at > NOW();

  -- 11. Check Daily Budget (in USD-micro)
  IF (v_spent_today + v_active_reserved + v_normalized_amount) > v_policy.daily_budget THEN
    v_daily_remaining := GREATEST(v_policy.daily_budget - (v_spent_today + v_active_reserved), 0);
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'requires_human_approval', TRUE,
      'code', 'DAILY_BUDGET_EXCEEDED',
      'reason', 'Transaction would exceed daily spending budget. Available: ' || v_daily_remaining || ' micro-USD',
      'daily_budget_remaining', v_daily_remaining::TEXT
    );
  END IF;

  -- 12. Check Monthly Budget (in USD-micro)
  IF (v_spent_this_month + v_active_reserved + v_normalized_amount) > v_policy.monthly_budget THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'requires_human_approval', TRUE,
      'code', 'MONTHLY_BUDGET_EXCEEDED',
      'reason', 'Transaction would exceed monthly spending budget.'
    );
  END IF;

  -- 13. Check Human Approval Requirements
  IF NOT v_policy.autonomous_payments_enabled THEN
    v_requires_approval := TRUE;
  ELSIF v_policy.require_approval_above IS NOT NULL AND v_normalized_amount > v_policy.require_approval_above THEN
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

  -- 14. Create Atomic Spending Reservation storing both raw atomic amount and normalized USD-micro
  INSERT INTO public.agent_spending_reservations (
    agent_id,
    idempotency_key,
    amount,
    amount_usd_micro,
    asset,
    network,
    recipient,
    price_source,
    price_usd,
    price_timestamp,
    status,
    expires_at
  ) VALUES (
    p_agent_id,
    p_idempotency_key,
    p_atomic_amount,
    v_normalized_amount,
    p_asset_symbol,
    p_network,
    p_recipient,
    p_price_source,
    p_price_usd,
    p_price_timestamp,
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

  v_daily_remaining := v_policy.daily_budget - (v_spent_today + v_active_reserved + v_normalized_amount);

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'requires_human_approval', FALSE,
    'reservation_id', v_reservation_id,
    'daily_budget_remaining', v_daily_remaining::TEXT,
    'normalized_amount_usd_micro', v_normalized_amount::TEXT
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Atomic Stored Procedure: commit_agent_reservation
-- Deducts normalized USD-micro budget from agent policy upon on-chain settlement.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_agent_reservation(
  p_agent_id UUID,
  p_reservation_id UUID,
  p_atomic_amount NUMERIC(78, 0)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_policy public.agent_policies%ROWTYPE;
  v_reservation public.agent_spending_reservations%ROWTYPE;
  v_spent_today NUMERIC(78, 0);
  v_spent_this_month NUMERIC(78, 0);
  v_deduct_amount NUMERIC(78, 0);
BEGIN
  -- 1. Lock and verify the reservation row strictly FOR UPDATE
  SELECT * INTO v_reservation
  FROM public.agent_spending_reservations
  WHERE id = p_reservation_id AND agent_id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'code', 'RESERVATION_NOT_FOUND',
      'reason', 'Spending reservation does not exist for this agent.'
    );
  END IF;

  -- 2. Make commit idempotent: If already settled, return success without incrementing counters again!
  IF v_reservation.status = 'settled' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'idempotent', TRUE,
      'status', 'already_settled'
    );
  END IF;

  -- 3. Strict transition requirement: Must transition ONLY from 'reserved' to 'settled'
  IF v_reservation.status <> 'reserved' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'code', 'INVALID_RESERVATION_STATUS',
      'reason', 'Cannot commit reservation with status: ' || v_reservation.status
    );
  END IF;

  -- 4. Transition reservation status to settled
  UPDATE public.agent_spending_reservations
  SET status = 'settled',
      updated_at = NOW()
  WHERE id = p_reservation_id;

  -- 5. Determine normalized deduct amount (prefer stored amount_usd_micro)
  v_deduct_amount := COALESCE(v_reservation.amount_usd_micro, p_atomic_amount);

  -- 6. Lock and update policy spent amounts
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
    SET spent_today = v_spent_today + v_deduct_amount,
        spent_this_month = v_spent_this_month + v_deduct_amount,
        period_start_date = v_today,
        updated_at = NOW()
    WHERE agent_id = p_agent_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'idempotent', FALSE,
    'status', 'settled',
    'deducted_amount_usd_micro', v_deduct_amount::TEXT
  );
END;
$$;
