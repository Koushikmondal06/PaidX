-- ==============================================================================
-- PaidX Complete Production Migration for Supabase SQL Editor
-- Target: Ethereum Sepolia (Chain ID 11155111) & PaidX Dashboard
-- Instructions: Copy and paste this ENTIRE file into your Supabase Dashboard
--               SQL Editor (https://supabase.com/dashboard/project/_/sql) and run it.
-- ==============================================================================

-- 1. Helper function for automated updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Profiles Table & Auth Integration
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure role check allows modern roles
DO $$
BEGIN
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('user', 'merchant', 'admin', 'payer', 'normal_user', 'super_admin'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Drop and re-create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on Supabase auth signup
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
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
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
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  chain_id BIGINT NOT NULL DEFAULT 11155111,
  kind TEXT NOT NULL DEFAULT 'eoa',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  smart_account_upgraded BOOLEAN NOT NULL DEFAULT FALSE,
  network TEXT DEFAULT 'sepolia',
  public_key TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verification_metadata JSONB,
  evm_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clean up and add case-insensitive constraint
DO $$
BEGIN
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS chain_id BIGINT NOT NULL DEFAULT 11155111;
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'eoa';
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS smart_account_upgraded BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'sepolia';
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS public_key TEXT;
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS verification_metadata JSONB;
  ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS evm_address TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON public.wallets(lower(address));

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 4. Merchants Table & System Hardware Merchant (#001)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  business_name TEXT,
  slug TEXT,
  payout_address TEXT NOT NULL,
  receiving_address TEXT,
  chain_id BIGINT NOT NULL DEFAULT 11155111,
  status TEXT NOT NULL DEFAULT 'pending',
  is_active BOOLEAN DEFAULT TRUE,
  register_tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns and loosen owner constraint for system hardware merchants
DO $$
BEGIN
  ALTER TABLE public.merchants ALTER COLUMN owner_user_id DROP NOT NULL;
  ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS business_name TEXT;
  ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS slug TEXT;
  ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS receiving_address TEXT;
  ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS chain_id BIGINT DEFAULT 11155111;
  ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
  ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS register_tx_hash TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchants_owner_user_id ON public.merchants(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_merchants_slug ON public.merchants(slug);
CREATE INDEX IF NOT EXISTS idx_merchants_payout_address ON public.merchants(lower(payout_address));

DROP TRIGGER IF EXISTS trg_merchants_updated_at ON public.merchants;
CREATE TRIGGER trg_merchants_updated_at
  BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed Default Retail Merchant (#001 - Apex Retail)
INSERT INTO public.merchants (
  id,
  owner_user_id,
  name,
  business_name,
  slug,
  payout_address,
  receiving_address,
  chain_id,
  status,
  is_active
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'Apex Retail',
  'Apex Retail',
  '#001',
  '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  11155111,
  'active',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET
  name = 'Apex Retail',
  business_name = 'Apex Retail',
  slug = '#001',
  payout_address = '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  receiving_address = '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  status = 'active',
  is_active = TRUE,
  updated_at = NOW();

-- ------------------------------------------------------------------------------
-- 5. POS Devices Table & Hardware Terminal (#001)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid TEXT UNIQUE NOT NULL,
  token_hash TEXT NOT NULL,
  device_token_hash TEXT,
  merchant_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'POS Terminal',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Terminal #001 (PSK: psk_d6187915992b28f7acaf227169a211072b92a0d2b1989168)
INSERT INTO public.pos_devices (
  device_uuid,
  token_hash,
  device_token_hash,
  merchant_id,
  label,
  status
)
VALUES (
  '#001',
  '408d906df7b0ccabe274dda9d3ba17acc313df0a304335242190383bdd1df842',
  '408d906df7b0ccabe274dda9d3ba17acc313df0a304335242190383bdd1df842',
  '#001',
  'Terminal #001',
  'active'
)
ON CONFLICT (device_uuid) DO UPDATE SET
  token_hash = EXCLUDED.token_hash,
  device_token_hash = EXCLUDED.device_token_hash,
  merchant_id = EXCLUDED.merchant_id,
  status = 'active',
  updated_at = NOW();

DROP TRIGGER IF EXISTS trg_pos_devices_updated_at ON public.pos_devices;
CREATE TRIGGER trg_pos_devices_updated_at
  BEFORE UPDATE ON public.pos_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 6. Cards Table (Physical NFC Authenticators)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  uid_hash TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL DEFAULT 'PaidX Card',
  status TEXT NOT NULL DEFAULT 'active',
  registration_tx_hash TEXT,
  register_tx_hash TEXT,
  registered_at_block BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.cards ALTER COLUMN wallet_id DROP NOT NULL;
  ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS registration_tx_hash TEXT;
  ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS register_tx_hash TEXT;
  ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS registered_at_block BIGINT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Automated column sync trigger for register_tx_hash <-> registration_tx_hash
CREATE OR REPLACE FUNCTION public.sync_cards_tx_hash()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.registration_tx_hash IS NOT NULL AND NEW.register_tx_hash IS NULL THEN
    NEW.register_tx_hash = NEW.registration_tx_hash;
  ELSIF NEW.register_tx_hash IS NOT NULL AND NEW.registration_tx_hash IS NULL THEN
    NEW.registration_tx_hash = NEW.register_tx_hash;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_cards_tx_hash ON public.cards;
CREATE TRIGGER trg_sync_cards_tx_hash
  BEFORE INSERT OR UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.sync_cards_tx_hash();

CREATE INDEX IF NOT EXISTS idx_cards_user_id ON public.cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_uid_hash ON public.cards(uid_hash);

DROP TRIGGER IF EXISTS trg_cards_updated_at ON public.cards;
CREATE TRIGGER trg_cards_updated_at
  BEFORE UPDATE ON public.cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. Permissions Table (ERC-7715 & On-Chain Allowances)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
  chain_id BIGINT NOT NULL DEFAULT 11155111,
  session_account_address TEXT NOT NULL,
  token_address TEXT NOT NULL DEFAULT '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  permission_type TEXT NOT NULL DEFAULT 'native_token_recurring_allowance',
  limit_per_period NUMERIC(78, 0),
  period_amount NUMERIC(78, 0),
  remaining_in_period NUMERIC(78, 0),
  period_seconds INT NOT NULL DEFAULT 86400,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  expiry TIMESTAMPTZ,
  permissions_context TEXT,
  delegation_manager TEXT,
  grant_payload JSONB,
  revocation_tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS limit_per_period NUMERIC(78, 0);
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS period_amount NUMERIC(78, 0);
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS remaining_in_period NUMERIC(78, 0);
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS valid_after TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS expiry TIMESTAMPTZ;
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS grant_payload JSONB;
  ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS revocation_tx_hash TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Automated column sync trigger for permissions
CREATE OR REPLACE FUNCTION public.sync_permissions_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.limit_per_period IS NOT NULL AND NEW.period_amount IS NULL THEN
    NEW.period_amount = NEW.limit_per_period;
  ELSIF NEW.period_amount IS NOT NULL AND NEW.limit_per_period IS NULL THEN
    NEW.limit_per_period = NEW.period_amount;
  END IF;

  IF NEW.remaining_in_period IS NULL AND NEW.limit_per_period IS NOT NULL THEN
    NEW.remaining_in_period = NEW.limit_per_period;
  END IF;

  IF NEW.valid_until IS NOT NULL AND NEW.expiry IS NULL THEN
    NEW.expiry = NEW.valid_until;
  ELSIF NEW.expiry IS NOT NULL AND NEW.valid_until IS NULL THEN
    NEW.valid_until = NEW.expiry;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_permissions_columns ON public.permissions;
CREATE TRIGGER trg_sync_permissions_columns
  BEFORE INSERT OR UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_permissions_columns();

CREATE INDEX IF NOT EXISTS idx_permissions_user_id ON public.permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_permissions_wallet_id ON public.permissions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_permissions_status ON public.permissions(status);

DROP TRIGGER IF EXISTS trg_permissions_updated_at ON public.permissions;
CREATE TRIGGER trg_permissions_updated_at
  BEFORE UPDATE ON public.permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 8. Payments Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  merchant_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  permission_id UUID REFERENCES public.permissions(id) ON DELETE SET NULL,
  chain_id BIGINT NOT NULL DEFAULT 11155111,
  token_address TEXT NOT NULL DEFAULT '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  amount NUMERIC(78, 0) NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  tx_hash TEXT,
  user_op_hash TEXT,
  block_number BIGINT,
  failure_reason TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_op_hash TEXT;
  ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_id ON public.payments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payments_card_id ON public.payments(card_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON public.payments(idempotency_key);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------------------
-- 9. Indexer & Chain Telemetry
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.indexer_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL DEFAULT 11155111,
  contract_address TEXT,
  cursor_name TEXT,
  last_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.indexer_cursors ADD COLUMN IF NOT EXISTS cursor_name TEXT;
  ALTER TABLE public.indexer_cursors ADD COLUMN IF NOT EXISTS contract_address TEXT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_indexer_cursors_chain_contract 
  ON public.indexer_cursors(chain_id, COALESCE(contract_address, cursor_name, 'default'));

CREATE TABLE IF NOT EXISTS public.chain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id BIGINT NOT NULL DEFAULT 11155111,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  args JSONB,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chain_events_tx_hash ON public.chain_events(tx_hash);
CREATE INDEX IF NOT EXISTS idx_chain_events_event_name ON public.chain_events(event_name);

-- ------------------------------------------------------------------------------
-- 10. Row-Level Security (RLS) & Access Policies
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexer_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_events ENABLE ROW LEVEL SECURITY;

-- Grant broad schema privileges to authenticated and service_role
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;

-- Public / Authenticated read policies
DROP POLICY IF EXISTS "Public profiles read" ON public.profiles;
CREATE POLICY "Public profiles read" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can read own wallets" ON public.wallets;
CREATE POLICY "Users can read own wallets" ON public.wallets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own wallets" ON public.wallets;
CREATE POLICY "Users can manage own wallets" ON public.wallets FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view active merchants" ON public.merchants;
CREATE POLICY "Public can view active merchants" ON public.merchants FOR SELECT USING (status = 'active' OR is_active = true);

DROP POLICY IF EXISTS "Merchants can manage own records" ON public.merchants;
CREATE POLICY "Merchants can manage own records" ON public.merchants FOR ALL USING (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS "Users can manage own cards" ON public.cards;
CREATE POLICY "Users can manage own cards" ON public.cards FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own permissions" ON public.permissions;
CREATE POLICY "Users can manage own permissions" ON public.permissions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.merchants m WHERE m.id::text = payments.merchant_id AND m.owner_user_id = auth.uid())
);

DROP POLICY IF EXISTS "Service role can manage pos_devices" ON public.pos_devices;
CREATE POLICY "Service role can manage pos_devices" ON public.pos_devices FOR ALL USING (true);

-- Success verification notice
DO $$
BEGIN
  RAISE NOTICE 'PaidX Supabase Schema successfully migrated! POS Terminal #001 & Apex Retail merchant configured.';
END $$;
