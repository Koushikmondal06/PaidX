import { createClient } from '@supabase/supabase-js';

let browserClient: ReturnType<typeof createClient> | null = null;

/**
 * Creates or returns a singleton client-side Supabase client using the new publishable key.
 * Hard Rule: Client key MUST start with 'sb_publishable_'.
 * FORBIDDEN: Legacy anon key or JWT tokens starting with 'eyJ'.
 */
export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  if (!supabaseUrl || !publishableKey) {
    // Return dummy client or warn when env is unset during build
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    }
  }

  if (publishableKey && !publishableKey.startsWith('sb_publishable_')) {
    throw new Error(
      `[Supabase Security Violation] Invalid client key format: client key must start with 'sb_publishable_'. Legacy anon JWT keys are strictly forbidden.`
    );
  }

  browserClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        apikey: publishableKey,
      },
    },
  });

  return browserClient;
}

