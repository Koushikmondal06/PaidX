-- ==============================================================================
-- 04_merchants.sql
-- Run in Supabase SQL Editor to configure Merchant Registry & Apex Retail (#001)
-- ==============================================================================

ALTER TABLE public.merchants ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS receiving_address TEXT;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS chain_id BIGINT DEFAULT 11155111;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.merchants ADD COLUMN IF NOT EXISTS register_tx_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_merchants_slug ON public.merchants(slug);
CREATE INDEX IF NOT EXISTS idx_merchants_payout_address ON public.merchants(lower(payout_address));

-- Seed Default Retail Merchant (#001 - Apex Retail)
INSERT INTO public.merchants (
  id,
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
  payout_address = '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  receiving_address = '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  status = 'active',
  is_active = TRUE,
  updated_at = NOW();
