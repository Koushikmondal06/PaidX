import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Extracts and verifies the authenticated Supabase user from the request's Authorization header.
 * Rejects forged or missing credentials.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<User | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return null;
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user;
  } catch (err) {
    console.warn('[Auth] Failed to authenticate user session:', err);
    return null;
  }
}

/**
 * Guard utility for route handlers requiring user authentication.
 * Returns the authenticated user or null.
 */
export async function requireAuthenticatedUser(
  req: NextRequest
): Promise<{ user: User; errorResponse?: never } | { user?: never; errorResponse: NextResponse }> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Valid Supabase session required.' },
        { status: 401 }
      ),
    };
  }
  return { user };
}
