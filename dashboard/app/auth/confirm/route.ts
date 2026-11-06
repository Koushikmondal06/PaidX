import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/base';

export const dynamic = 'force-dynamic';

/**
 * Server-side Token-Hash verification route.
 * Works seamlessly across devices (e.g. signup on laptop, email opened on phone).
 * Does not depend on browser session or client-side PKCE code verifier.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = (searchParams.get('type') || 'email') as EmailOtpType;

  if (token_hash && type) {
    try {
      const supabase = createServerSupabaseClient();
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });

      if (!error) {
        return NextResponse.redirect(`${APP_URL}/auth/confirmed`);
      }
      console.warn('[Auth Confirm] verifyOtp error:', error.message);
    } catch (err) {
      console.error('[Auth Confirm] Unexpected error during verification:', err);
    }
  }

  return NextResponse.redirect(`${APP_URL}/auth/confirmed?status=error`);
}

