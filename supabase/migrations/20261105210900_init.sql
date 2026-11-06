-- ==============================================================================
-- PaidX Base Schema Migration: 20261105210900_init.sql
-- Target Testnet Architecture: Ethereum Sepolia (Chain ID 11155111)
-- ==============================================================================

-- 1. Helper trigger function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Profiles Table & Trigger
-- ------------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'merchant', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup via SECURITY DEFINER trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    NEW.phone,
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 3. Wallets Table
-- ------------------------------------------------------------------------------
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address TEXT NOT NULL CHECK (address = lower(address)),
  chain_id BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('eoa', 'metamask_smart_account')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  smart_account_upgraded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, address)
);

CREATE INDEX idx_wallets_user_id ON public.wallets(user_id);

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. Permissions (ERC-7715 Grants) Table
-- ------------------------------------------------------------------------------
CREATE TABLE public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  chain_id BIGINT NOT NULL,
  session_account_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  permission_type TEXT NOT NULL,
  period_amount NUMERIC(78, 0) NOT NULL,
  period_seconds INT NOT NULL,
  expiry TIMESTAMPTZ NOT NULL,
  permissions_context TEXT,
  delegation_manager TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_user_id ON public.permissions(user_id);
CREATE INDEX idx_permissions_wallet_id ON public.permissions(wallet_id);

CREATE TRIGGER trg_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 5. Cards Table (NFC Authenticator Links)
-- ------------------------------------------------------------------------------
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  uid_hash TEXT UNIQUE NOT NULL CHECK (uid_hash ~* '^0x[0-9a-f]{64}$'),
  label TEXT NOT NULL DEFAULT 'PaidX Card',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'frozen', 'revoked')),
  register_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cards_user_id ON public.cards(user_id);
CREATE INDEX idx_cards_wallet_id ON public.cards(wallet_id);

CREATE TRIGGER trg_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. Merchants Table
-- ------------------------------------------------------------------------------
CREATE TABLE public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  payout_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  register_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_owner_user_id ON public.merchants(owner_user_id);

CREATE TRIGGER trg_merchants_updated_at
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. Payments Table (Settlement Tracking)
-- ------------------------------------------------------------------------------
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE SET NULL,
  chain_id BIGINT NOT NULL,
  token_address TEXT NOT NULL,
  amount NUMERIC(78, 0) NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'submitted', 'confirmed', 'failed')),
  idempotency_key TEXT UNIQUE NOT NULL,
  user_op_hash TEXT,
  tx_hash TEXT,
  block_number BIGINT,
  failure_reason TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_card_id ON public.payments(card_id);
CREATE INDEX idx_payments_user_id ON public.payments(user_id);
CREATE INDEX idx_payments_merchant_id ON public.payments(merchant_id);
CREATE INDEX idx_payments_permission_id ON public.payments(permission_id);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 8. Contract Deployments Table
-- ------------------------------------------------------------------------------
CREATE TABLE public.contract_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  deploy_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, name)
);

CREATE TRIGGER trg_contract_deployments_updated_at
  BEFORE UPDATE ON public.contract_deployments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 9. Chain Events Table
-- ------------------------------------------------------------------------------
CREATE TABLE public.chain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, tx_hash, log_index)
);

CREATE TRIGGER trg_chain_events_updated_at
  BEFORE UPDATE ON public.chain_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 10. Indexer Cursors Table
-- ------------------------------------------------------------------------------
CREATE TABLE public.indexer_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL,
  contract_address TEXT NOT NULL,
  last_block BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, contract_address)
);

CREATE TRIGGER trg_indexer_cursors_updated_at
  BEFORE UPDATE ON public.indexer_cursors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 11. Audit Log Table
-- ------------------------------------------------------------------------------
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor_id ON public.audit_log(actor_id);

CREATE TRIGGER trg_audit_log_updated_at
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==============================================================================
-- 12. Security: Revoke anon & Enable RLS on EVERY Table
-- ==============================================================================

-- Revoke all permissions from anon role
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Enable Row Level Security on all public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexer_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 13. RLS Policies (Users read own rows; merchants read own store rows)
-- Writes to permissions, cards, payments, chain_events, contract_deployments,
-- indexer_cursors, and audit_log are server-only via secret key (bypasses RLS).
-- ------------------------------------------------------------------------------

-- Profiles Policies
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Wallets Policies
CREATE POLICY "wallets_select_own"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "wallets_insert_own"
  ON public.wallets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "wallets_update_own"
  ON public.wallets FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Permissions Policies (Read own permissions; writes are server-only via secret key)
CREATE POLICY "permissions_select_own"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Cards Policies (Read own cards; writes are server-only via secret key)
CREATE POLICY "cards_select_own"
  ON public.cards FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Merchants Policies (Owner reads and edits their merchant store)
CREATE POLICY "merchants_select_own"
  ON public.merchants FOR SELECT
  TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "merchants_insert_own"
  ON public.merchants FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

CREATE POLICY "merchants_update_own"
  ON public.merchants FOR UPDATE
  TO authenticated
  USING (owner_user_id = (SELECT auth.uid()))
  WITH CHECK (owner_user_id = (SELECT auth.uid()));

-- Payments Policies (User reads own payments; Merchant owner reads their store payments)
CREATE POLICY "payments_select_user_or_merchant"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR merchant_id IN (
      SELECT id FROM public.merchants WHERE owner_user_id = (SELECT auth.uid())
    )
  );

-- Contract Deployments Policies (Public read for authenticated users)
CREATE POLICY "contract_deployments_select_authenticated"
  ON public.contract_deployments FOR SELECT
  TO authenticated
  USING (true);

-- Chain Events Policies (Read for authenticated users)
CREATE POLICY "chain_events_select_authenticated"
  ON public.chain_events FOR SELECT
  TO authenticated
  USING (true);

-- Audit Log Policies (User reads own audit events; writes are server-only via secret key)
CREATE POLICY "audit_log_select_own"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (actor_id = (SELECT auth.uid()));

