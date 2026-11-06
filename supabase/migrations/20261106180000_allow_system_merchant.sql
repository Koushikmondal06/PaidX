-- ==============================================================================
-- Migration: 20261106180000_allow_system_merchant.sql
-- Allows system-level POS merchants without interactive owner_user_id
-- Seeds default POS #001 merchant with destination 0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6
-- ==============================================================================

ALTER TABLE public.merchants
  ALTER COLUMN owner_user_id DROP NOT NULL;

INSERT INTO public.merchants (id, name, slug, payout_address, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'PaidX Retail Terminal #001',
  '#001',
  '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  payout_address = '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
  name = 'PaidX Retail Terminal #001',
  slug = '#001',
  status = 'active',
  updated_at = NOW();
