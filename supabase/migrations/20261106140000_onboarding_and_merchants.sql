-- ==============================================================================
-- Migration: 20261106140000_onboarding_and_merchants.sql
-- Adds onboarding_step to profiles for resumable stepper tracking
-- Adds slug and is_active computed column to merchants
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step INT NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 5);

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN GENERATED ALWAYS AS (status = 'active') STORED;

CREATE INDEX IF NOT EXISTS idx_merchants_status ON public.merchants(status);

