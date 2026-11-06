-- ==============================================================================
-- Migration: 20261106190000_schema_drift_and_pos_devices.sql
-- Fixes schema drift across cards, permissions, chain_events, and indexer_cursors.
-- Adds pos_devices table for authenticating hardware POS terminals.
-- ==============================================================================

-- 1. Cards: column alignment
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'register_tx_hash'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cards' AND column_name = 'registration_tx_hash'
  ) THEN
    ALTER TABLE public.cards RENAME COLUMN register_tx_hash TO registration_tx_hash;
  END IF;
END $$;

ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS registration_tx_hash TEXT;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS registered_at_block BIGINT;
ALTER TABLE public.cards ALTER COLUMN wallet_id DROP NOT NULL;

-- 2. Permissions: route-expected columns
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS limit_per_period NUMERIC(78, 0);
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS remaining_in_period NUMERIC(78, 0);
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS valid_after TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS grant_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS revocation_tx_hash TEXT;

-- Sync legacy permissions fields if populated
UPDATE public.permissions 
SET limit_per_period = period_amount 
WHERE limit_per_period IS NULL AND period_amount IS NOT NULL;

UPDATE public.permissions 
SET remaining_in_period = period_amount 
WHERE remaining_in_period IS NULL AND period_amount IS NOT NULL;

UPDATE public.permissions 
SET valid_until = expiry 
WHERE valid_until IS NULL AND expiry IS NOT NULL;

ALTER TABLE public.permissions ALTER COLUMN period_amount DROP NOT NULL;
ALTER TABLE public.permissions ALTER COLUMN expiry DROP NOT NULL;

-- 3. Merchants: alias registration_tx_hash
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS registration_tx_hash TEXT;
UPDATE public.merchants 
SET registration_tx_hash = register_tx_hash 
WHERE registration_tx_hash IS NULL AND register_tx_hash IS NOT NULL;

-- 4. Indexer Cursors: support cursor_name and optional contract_address
ALTER TABLE public.indexer_cursors ADD COLUMN IF NOT EXISTS cursor_name TEXT;
ALTER TABLE public.indexer_cursors ALTER COLUMN contract_address DROP NOT NULL;

-- 5. Chain Events: ensure payload alias or args compatibility
ALTER TABLE public.chain_events ADD COLUMN IF NOT EXISTS payload JSONB;
UPDATE public.chain_events SET payload = args WHERE payload IS NULL AND args IS NOT NULL;

-- 6. POS Devices table for hardware terminal authentication
CREATE TABLE IF NOT EXISTS public.pos_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid TEXT NOT NULL UNIQUE,
  device_token_hash TEXT NOT NULL,
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users / service roles
CREATE POLICY "Allow service role full access on pos_devices" ON public.pos_devices
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);

-- Seed device #001 for Retail Terminal #001
-- Token PSK: psk_d6187915992b28f7acaf227169a211072b92a0d2b1989168
-- SHA-256: 408d906df7b0ccabe274dda9d3ba17acc313df0a304335242190383bdd1df842
INSERT INTO public.pos_devices (device_uuid, device_token_hash, merchant_id, status)
VALUES (
  '#001',
  '408d906df7b0ccabe274dda9d3ba17acc313df0a304335242190383bdd1df842',
  '00000000-0000-0000-0000-000000000001',
  'active'
)
ON CONFLICT (device_uuid) DO UPDATE SET
  device_token_hash = '408d906df7b0ccabe274dda9d3ba17acc313df0a304335242190383bdd1df842',
  merchant_id = '00000000-0000-0000-0000-000000000001',
  status = 'active',
  updated_at = NOW();

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

