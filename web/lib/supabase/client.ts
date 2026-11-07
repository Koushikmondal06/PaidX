import { createClient } from '@supabase/supabase-js';

let browserClient: ReturnType<typeof createClient> | null = null;

/**
 * Creates or returns a singleton client-side Supabase client for the web landing page.
 * Uses NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
 */
export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl || !publishableKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase Client] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    }
  }

  browserClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        apikey: publishableKey,
      },
    },
  });

  return browserClient;
}
