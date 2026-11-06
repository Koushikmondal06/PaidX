-- ==============================================================================
-- Migration: 20261106030000_metamask_hedera_wallet_linking.sql
-- Description: Adds single-use wallet ownership challenges for MetaMask Hedera Testnet linking
-- ==============================================================================

-- 1. Create table for server-issued, single-use, expiring wallet challenges
CREATE TABLE IF NOT EXISTS public.wallet_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'hedera:testnet',
  chain_id BIGINT NOT NULL DEFAULT 296,
  action TEXT NOT NULL DEFAULT 'link-metamask-hedera',
  challenge_text TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indices for single-use lookup and user scoping
CREATE INDEX IF NOT EXISTS idx_wallet_challenges_nonce 
  ON public.wallet_challenges(nonce);

CREATE INDEX IF NOT EXISTS idx_wallet_challenges_user_id 
  ON public.wallet_challenges(user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_challenges_address 
  ON public.wallet_challenges(wallet_address);

-- 3. Row-Level Security Policies
ALTER TABLE public.wallet_challenges ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_challenges' AND policyname = 'challenges_select_own') THEN
    CREATE POLICY challenges_select_own ON public.wallet_challenges FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_challenges' AND policyname = 'challenges_insert_own') THEN
    CREATE POLICY challenges_insert_own ON public.wallet_challenges FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_challenges' AND policyname = 'challenges_update_own') THEN
    CREATE POLICY challenges_update_own ON public.wallet_challenges FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;
