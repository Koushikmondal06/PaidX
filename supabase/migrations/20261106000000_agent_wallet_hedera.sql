-- ==============================================================================
-- PaidX Hedera Agentic Wallet Migration: 20261106000000_agent_wallet_hedera.sql
-- Enables AI Agent Connections, Spending Policies, x402 Sessions, and HCS Audit
-- ==============================================================================

-- 1. Extend wallets kind check constraint to include 'hedera'
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_kind_check;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_kind_check 
  CHECK (kind IN ('eoa', 'metamask_smart_account', 'hedera'));

-- ------------------------------------------------------------------------------
-- 2. Agent Connections Table
-- Stores authorized AI agents connected to a user's PaidX wallet
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  api_key_hash TEXT UNIQUE NOT NULL,
  api_key_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_connections_user_id ON public.agent_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_connections_wallet_id ON public.agent_connections(wallet_id);
CREATE INDEX IF NOT EXISTS idx_agent_connections_api_key_hash ON public.agent_connections(api_key_hash);

CREATE TRIGGER trg_agent_connections_updated_at
  BEFORE UPDATE ON public.agent_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 3. Agent Policies Table
-- Strict per-agent limits, budgets, allowed networks, and autonomous payment rules
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID UNIQUE NOT NULL REFERENCES public.agent_connections(id) ON DELETE CASCADE,
  max_amount_per_tx NUMERIC(78, 0) NOT NULL,
  daily_budget NUMERIC(78, 0) NOT NULL,
  monthly_budget NUMERIC(78, 0) NOT NULL,
  spent_today NUMERIC(78, 0) NOT NULL DEFAULT 0,
  spent_this_month NUMERIC(78, 0) NOT NULL DEFAULT 0,
  period_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  autonomous_payments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  require_approval_above NUMERIC(78, 0),
  allowed_networks TEXT[] NOT NULL DEFAULT ARRAY['hedera:testnet', 'hedera-testnet'],
  allowed_assets TEXT[] NOT NULL DEFAULT ARRAY['USDC', 'HBAR'],
  allowed_recipients TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_policies_agent_id ON public.agent_policies(agent_id);

CREATE TRIGGER trg_agent_policies_updated_at
  BEFORE UPDATE ON public.agent_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. Agent Spending Reservations Table
-- Atomic reservations preventing race conditions during concurrent agent payments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_spending_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agent_connections(id) ON DELETE CASCADE,
  idempotency_key TEXT UNIQUE NOT NULL,
  amount NUMERIC(78, 0) NOT NULL,
  asset TEXT NOT NULL,
  network TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_spending_reservations_agent_id ON public.agent_spending_reservations(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_spending_reservations_idempotency ON public.agent_spending_reservations(idempotency_key);

CREATE TRIGGER trg_agent_spending_reservations_updated_at
  BEFORE UPDATE ON public.agent_spending_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 5. Agent Payments Table
-- Complete historical ledger of conversational AI agent payments
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agent_connections(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
  reservation_id UUID REFERENCES public.agent_spending_reservations(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  amount_atomic NUMERIC(78, 0) NOT NULL,
  amount_display TEXT NOT NULL,
  asset TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'hedera:testnet',
  payment_scheme TEXT NOT NULL DEFAULT 'exact',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitting', 'confirmed', 'failed', 'declined')),
  idempotency_key TEXT UNIQUE NOT NULL,
  tx_id TEXT,
  hashscan_url TEXT,
  hcs_topic_id TEXT,
  hcs_sequence_number BIGINT,
  failure_reason TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_payments_agent_id ON public.agent_payments(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_payments_user_id ON public.agent_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_payments_wallet_id ON public.agent_payments(wallet_id);
CREATE INDEX IF NOT EXISTS idx_agent_payments_tx_id ON public.agent_payments(tx_id);
CREATE INDEX IF NOT EXISTS idx_agent_payments_idempotency_key ON public.agent_payments(idempotency_key);

CREATE TRIGGER trg_agent_payments_updated_at
  BEFORE UPDATE ON public.agent_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. HCS Audit Events Table
-- Mirror record of immutable events published to the Hedera Consensus Service topic
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hcs_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.agent_payments(id) ON DELETE SET NULL,
  topic_id TEXT NOT NULL,
  sequence_number BIGINT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  running_hash TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hcs_audit_events_payment_id ON public.hcs_audit_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_hcs_audit_events_topic_id ON public.hcs_audit_events(topic_id);

-- ------------------------------------------------------------------------------
-- 7. Security & Row Level Security (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.agent_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_spending_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hcs_audit_events ENABLE ROW LEVEL SECURITY;

-- Revoke anon role completely from new tables
REVOKE ALL ON public.agent_connections FROM anon;
REVOKE ALL ON public.agent_policies FROM anon;
REVOKE ALL ON public.agent_spending_reservations FROM anon;
REVOKE ALL ON public.agent_payments FROM anon;
REVOKE ALL ON public.hcs_audit_events FROM anon;

-- Authenticated Users Policies
CREATE POLICY "agent_connections_select_own"
  ON public.agent_connections FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "agent_connections_insert_own"
  ON public.agent_connections FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "agent_connections_update_own"
  ON public.agent_connections FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "agent_policies_select_own"
  ON public.agent_policies FOR SELECT
  TO authenticated
  USING (agent_id IN (
    SELECT id FROM public.agent_connections WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "agent_spending_reservations_select_own"
  ON public.agent_spending_reservations FOR SELECT
  TO authenticated
  USING (agent_id IN (
    SELECT id FROM public.agent_connections WHERE user_id = (SELECT auth.uid())
  ));

CREATE POLICY "agent_payments_select_own"
  ON public.agent_payments FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "hcs_audit_events_select_own"
  ON public.hcs_audit_events FOR SELECT
  TO authenticated
  USING (payment_id IN (
    SELECT id FROM public.agent_payments WHERE user_id = (SELECT auth.uid())
  ));
