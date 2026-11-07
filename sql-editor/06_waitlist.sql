-- ==============================================================================
-- PaidX Waitlist Subscribers (Run in Supabase Dashboard SQL Editor)
-- https://supabase.com/dashboard/project/pzsholmpzganlpmmgyrv/sql
-- ==============================================================================

-- 1. Create waitlist_subscribers table
CREATE TABLE IF NOT EXISTS public.waitlist_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT 'landing_page',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  CONSTRAINT waitlist_subscribers_email_check CHECK (
    email = lower(trim(email)) AND position('@' in email) > 1 AND length(email) <= 255
  ),
  CONSTRAINT waitlist_subscribers_status_check CHECK (
    status IN ('pending', 'approved', 'invited', 'rejected')
  )
);

-- 2. Enforce strict uniqueness on email at database level
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_subscribers_email_uidx
  ON public.waitlist_subscribers (email);

-- 3. Analytics and query performance index
CREATE INDEX IF NOT EXISTS waitlist_subscribers_created_at_idx
  ON public.waitlist_subscribers (created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.waitlist_subscribers ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Allow anyone (public / anonymous) to register their email for the waitlist
DROP POLICY IF EXISTS "Allow public waitlist registration" ON public.waitlist_subscribers;
CREATE POLICY "Allow public waitlist registration"
  ON public.waitlist_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow backend service role to view, update, and manage subscribers
DROP POLICY IF EXISTS "Allow service_role full management on waitlist" ON public.waitlist_subscribers;
CREATE POLICY "Allow service_role full management on waitlist"
  ON public.waitlist_subscribers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- NOTE: No public SELECT policy is granted on the waitlist_subscribers table.
-- Anonymous and standard users cannot read, list, or scrape emails from the table.

-- 6. Secure Aggregate Count Function (Security Definer)
-- Allows frontend/backend to securely fetch the total subscriber count without exposing emails.
CREATE OR REPLACE FUNCTION public.get_waitlist_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.waitlist_subscribers;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.get_waitlist_count() TO anon, authenticated, service_role;
