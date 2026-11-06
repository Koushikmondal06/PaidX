-- ==============================================================================
-- 01_permissions.sql
-- Run in Supabase SQL Editor to support ERC-7715 & On-Chain Spending Allowances
-- ==============================================================================

ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS limit_per_period NUMERIC(78, 0);
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS period_amount NUMERIC(78, 0);
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS remaining_in_period NUMERIC(78, 0);
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS valid_after TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS expiry TIMESTAMPTZ;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS grant_payload JSONB;
ALTER TABLE public.permissions ADD COLUMN IF NOT EXISTS revocation_tx_hash TEXT;

-- Auto-sync trigger between legacy and updated columns
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
CREATE INDEX IF NOT EXISTS idx_permissions_status ON public.permissions(status);

