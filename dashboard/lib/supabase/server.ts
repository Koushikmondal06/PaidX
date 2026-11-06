import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Hard runtime guard against bundling in client context
if (typeof window !== 'undefined') {
  throw new Error('[Security Exception] Server Supabase client cannot be loaded on the client.');
}

let testSupabaseClient: any = null;

export function setTestSupabaseClient(mock: any) {
  testSupabaseClient = mock;
}

/**
 * Creates an authoritative server-only Supabase client using the new secret key ('sb_secret_...').
 * 
 * HARD SECURITY RULES ENFORCED:
 * 1. Marked 'server-only' to prevent inclusion in client bundles.
 * 2. Secret key must start with 'sb_secret_'.
 * 3. The secret key is NOT a JWT: it is sent strictly via the 'apikey' header and NEVER as 'Authorization: Bearer'.
 * 4. Bypasses RLS for authoritative server-side ledger and state management.
 */
export function createServerSupabaseClient() {
  if (testSupabaseClient) {
    return testSupabaseClient;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const secretKey = process.env.SUPABASE_SECRET_KEY || 'sb_secret_placeholder_for_build';

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase Server] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
    }
  }

  if (secretKey && !secretKey.startsWith('sb_secret_')) {
    throw new Error(
      `[Supabase Security Violation] Invalid server key format: key must start with 'sb_secret_'. Legacy service_role JWT keys are strictly forbidden.`
    );
  }

  // Custom fetch to strictly enforce that the secret key is sent in 'apikey'
  // and NEVER sent as 'Authorization: Bearer <secretKey>' (since sb_secret is not a JWT).
  const customFetch: typeof fetch = (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('apikey', secretKey);

    // If an Authorization header was automatically attached with the secret key, strip it.
    const authHeader = headers.get('authorization');
    if (authHeader && authHeader.includes(secretKey)) {
      headers.delete('authorization');
    }

    return fetch(input, { ...init, headers });
  };

  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: customFetch,
      headers: {
        apikey: secretKey,
      },
    },
  });
}

