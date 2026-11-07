import { createClient } from '@supabase/supabase-js';

/**
 * Creates an authoritative server-side Supabase client for API routes.
 * Uses SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY to perform privileged operations safely on the server.
 * Never loaded in client-side bundles.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '';

  if (!supabaseUrl || !secretKey) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase Server] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
    }
  }

  const isSbSecret = secretKey.startsWith('sb_secret_');
  const isJwt = secretKey.startsWith('eyJ');

  // Custom fetch to enforce correct headers based on key type
  const customFetch: typeof fetch = (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('apikey', secretKey);

    if (isSbSecret) {
      // sb_secret is not a JWT, strip Bearer if auto-attached
      const authHeader = headers.get('authorization');
      if (authHeader && authHeader.includes(secretKey)) {
        headers.delete('authorization');
      }
    } else if (isJwt && !headers.get('authorization')) {
      headers.set('authorization', `Bearer ${secretKey}`);
    }

    return fetch(input, {
      ...init,
      headers,
    });
  };

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: customFetch,
    },
  });
}
