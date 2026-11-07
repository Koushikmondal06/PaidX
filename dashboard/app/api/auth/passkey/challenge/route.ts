import { NextRequest, NextResponse } from 'next/server';
import {
  generatePasskeyRegistrationOptions,
  generatePasskeyAuthenticationOptions,
} from '@/lib/auth/passkey';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, userId: reqUserId, email } = body;

    let userId = reqUserId;

    // If userId not explicitly provided, try to resolve from Supabase session
    if (!userId) {
      try {
        const supabase = createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          userId = user.id;
        }
      } catch {}
    }

    if (!userId) {
      // In guest or login registration flow before user creation
      userId = `guest-${Buffer.from(email || 'anonymous').toString('hex').slice(0, 16)}`;
    }

    if (action === 'register') {
      const options = generatePasskeyRegistrationOptions(userId, email || 'user@paidx.cc');
      return NextResponse.json({ success: true, options, userId });
    } else {
      const options = generatePasskeyAuthenticationOptions(userId);
      return NextResponse.json({ success: true, options, userId });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate passkey challenge';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
