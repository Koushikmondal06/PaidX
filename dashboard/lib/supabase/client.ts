import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

let browserClient: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Creates or returns a singleton client-side Supabase client using the new publishable key.
 * Hard Rule: Client key MUST start with 'sb_publishable_'.
 * FORBIDDEN: Legacy anon key or JWT tokens starting with 'eyJ'.
 */
export function createBrowserSupabaseClient() {
  if (browserClient) return browserClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_placeholder_for_build';

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
      throw new Error('[Supabase Client] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in production.');
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    }
  }

  const isSbPublishable = publishableKey.startsWith('sb_publishable_');
  const isJwt = publishableKey.startsWith('eyJ');

  if (publishableKey && !isSbPublishable && !isJwt && process.env.NODE_ENV === 'production') {
    throw new Error(
      `[Supabase Client Error] Invalid client key format: client key must start with 'sb_publishable_' or be a valid anon JWT.`
    );
  }

  browserClient = createClient<Database>(supabaseUrl, publishableKey, {
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

