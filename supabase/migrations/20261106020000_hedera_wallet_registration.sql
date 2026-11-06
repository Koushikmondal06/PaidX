-- ==============================================================================
-- PaidX Hedera Wallet Registration Migration: 20261106020000_hedera_wallet_registration.sql
-- Enables Hedera Testnet Wallet Registration, Mirror Node Verification & Key Ownership
-- ==============================================================================

-- 1. Add Hedera-specific metadata columns to wallets table
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS network TEXT DEFAULT 'hedera:testnet',
  ADD COLUMN IF NOT EXISTS public_key TEXT,
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verification_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evm_address TEXT;

-- 2. Ensure kind constraint permits 'hedera'
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_kind_check;
ALTER TABLE public.wallets ADD CONSTRAINT wallets_kind_check 
  CHECK (kind IN ('eoa', 'metamask_smart_account', 'hedera'));

-- 3. Composite index for fast lookup of a user's primary Hedera wallet
CREATE INDEX IF NOT EXISTS idx_wallets_user_kind_primary 
  ON public.wallets(user_id, kind, is_primary);

-- 4. Enable Row Level Security on wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Authenticated users can manage only their own wallets
DROP POLICY IF EXISTS "wallets_select_own" ON public.wallets;
CREATE POLICY "wallets_select_own"
  ON public.wallets FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "wallets_insert_own" ON public.wallets;
CREATE POLICY "wallets_insert_own"
  ON public.wallets FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "wallets_update_own" ON public.wallets;
CREATE POLICY "wallets_update_own"
  ON public.wallets FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
