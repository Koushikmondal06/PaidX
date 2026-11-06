-- ==============================================================================
-- 03_pos_devices.sql
-- Run in Supabase SQL Editor to provision Hardware POS Terminal #001
-- ==============================================================================

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
