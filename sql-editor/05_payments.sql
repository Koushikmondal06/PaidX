-- ==============================================================================
-- 05_payments.sql
-- Run in Supabase SQL Editor to track payments and on-chain settlement receipts
-- ==============================================================================

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_op_hash TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_id ON public.payments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payments_card_id ON public.payments(card_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON public.payments(idempotency_key);

