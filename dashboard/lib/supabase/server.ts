import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { getNeonDatabaseClient } from '@/lib/db/neonAdapter';

// Hard runtime guard against bundling in client context
if (typeof window !== 'undefined') {
  throw new Error('[Security Exception] Server Supabase client cannot be loaded on the client.');
}

let testSupabaseClient: any = null;

export function setTestSupabaseClient(mock: any) {
  testSupabaseClient = mock;
}

/**
 * Creates an authoritative server-only database client.
 * 
 * When DATABASE_URL is configured (via Neon Postgres), queries run directly
 * against Neon Postgres using '@neondatabase/serverless'.
 * 
 * If testSupabaseClient is active (in unit tests), the mock is returned.
 */
export function createServerSupabaseClient() {
  if (testSupabaseClient) {
    return testSupabaseClient;
  }

  // Only use Neon Postgres if explicitly enabled via USE_NEON_DB='true'
  if (process.env.USE_NEON_DB === 'true' && (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED)) {
    return getNeonDatabaseClient();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'sb_secret_placeholder_for_build';

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    if (process.env.NODE_ENV === 'production' && process.env.USE_NEON_DB !== 'true') {
      throw new Error('[Supabase Server] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in production.');
    }
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Supabase Server] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY');
    }
  }

  const isSbSecret = secretKey.startsWith('sb_secret_');
  const isJwt = secretKey.startsWith('eyJ');

  if (secretKey && !isSbSecret && !isJwt && process.env.NODE_ENV === 'production') {
    throw new Error(
      `[Supabase Security Error] Invalid server key format: key must start with 'sb_secret_' or be a valid service_role JWT.`
    );
  }

  // Custom fetch to enforce correct headers based on key type
  const customFetch: typeof fetch = (input, init = {}) => {
    const urlStr =
      typeof input === 'string'
        ? input
        : typeof (input as any)?.url === 'string'
          ? (input as any).url
          : typeof (input as any)?.href === 'string'
            ? (input as any).href
            : String(input || '');

    if (urlStr.includes('placeholder.supabase.co')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ message: 'Placeholder Supabase URL is not configured.', hint: '', code: 'PGRST_PLACEHOLDER' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }

    const headers = new Headers(init.headers);
    headers.set('apikey', secretKey);

    if (isSbSecret) {
      // sb_secret is not a JWT, strip Bearer if auto-attached
      const authHeader = headers.get('authorization');
      if (authHeader && authHeader.includes(secretKey)) {
        headers.delete('authorization');
      }
    } else if (isJwt && !headers.get('authorization')) {
      // Standard JWT service_role key requires Authorization header
      headers.set('authorization', `Bearer ${secretKey}`);
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

