-- ==============================================================================
-- 02_cards.sql
-- Run in Supabase SQL Editor to support NFC Card Issuance & On-Chain Registrations
-- ==============================================================================

ALTER TABLE public.cards ALTER COLUMN wallet_id DROP NOT NULL;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS registration_tx_hash TEXT;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS register_tx_hash TEXT;
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS registered_at_block BIGINT;

-- Auto-sync trigger for register_tx_hash <-> registration_tx_hash
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

