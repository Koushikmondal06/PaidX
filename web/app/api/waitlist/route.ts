import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Strict RFC 5322 compliant email regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Helper to fetch live subscriber count across waitlist_subscribers or audit_log.
 */
async function fetchCurrentCount(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<number> {
  // 1. Try waitlist_subscribers table
  const { count: tableCount, error: tableErr } = await supabase
    .from('waitlist_subscribers')
    .select('*', { count: 'exact', head: true });

  if (!tableErr && typeof tableCount === 'number') {
    return tableCount;
  }

  // 2. Fallback to audit_log waitlist entries
  const { count: auditCount, error: auditErr } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('entity', 'waitlist');

  if (!auditErr && typeof auditCount === 'number') {
    return auditCount;
  }

  return 0;
}

/**
 * GET /api/waitlist
 * Returns the live subscriber count from Supabase.
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const count = await fetchCurrentCount(supabase);
    return NextResponse.json({ count }, { status: 200 });
  } catch (err: unknown) {
    console.error('[Waitlist GET Error]:', err);
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}

/**
 * POST /api/waitlist
 * Validates, checks for duplicates, saves to Supabase, and returns the updated live count.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = body.email;

    // 1. Presence & type check
    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    // 2. Normalization
    const normalizedEmail = rawEmail.trim().toLowerCase();

    // 3. Format validation
    if (normalizedEmail.length > 255 || !EMAIL_REGEX.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address (e.g. name@domain.com).' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const registeredAt = new Date().toISOString();

    // 4. Try waitlist_subscribers table first
    const { error: insertError } = await supabase
      .from('waitlist_subscribers')
      .insert({
        email: normalizedEmail,
        status: 'pending',
        source: 'landing_page',
        metadata: { userAgent, registeredAt },
      });

    if (!insertError) {
      const count = await fetchCurrentCount(supabase);
      return NextResponse.json(
        {
          status: 'success',
          message: 'Spot reserved! Welcome to the PaidX beta waitlist.',
          count,
        },
        { status: 201 }
      );
    }

    // Check if error was duplicate key on waitlist_subscribers
    const isDuplicate =
      insertError.code === '23505' ||
      insertError.message?.toLowerCase().includes('duplicate') ||
      insertError.message?.toLowerCase().includes('unique');

    if (isDuplicate) {
      return NextResponse.json({
        status: 'already_subscribed',
        message: "You're already on the beta waitlist! We'll notify you as soon as your spot opens up.",
      });
    }

    // 5. Fallback to audit_log table
    // Duplicate check in audit_log
    const { data: existingAudit } = await supabase
      .from('audit_log')
      .select('id')
      .eq('entity', 'waitlist')
      .contains('meta', { email: normalizedEmail });

    if (existingAudit && existingAudit.length > 0) {
      return NextResponse.json({
        status: 'already_subscribed',
        message: "You're already on the beta waitlist! We'll notify you as soon as your spot opens up.",
      });
    }

    // Insert new registration into audit_log
    const { error: auditInsertErr } = await supabase.from('audit_log').insert({
      action: 'waitlist_signup',
      entity: 'waitlist',
      meta: {
        email: normalizedEmail,
        source: 'landing_page',
        userAgent,
        registeredAt,
      },
    });

    if (auditInsertErr) {
      console.error('[Waitlist Supabase Error]:', auditInsertErr);
      return NextResponse.json(
        { error: 'Failed to reserve spot. Please try again later.' },
        { status: 500 }
      );
    }

    const count = await fetchCurrentCount(supabase);

    return NextResponse.json(
      {
        status: 'success',
        message: 'Spot reserved! Welcome to the PaidX beta waitlist.',
        count,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error('[Waitlist API Error]:', err);
    return NextResponse.json(
      { error: 'Internal server error while reserving your spot. Please try again.' },
      { status: 500 }
    );
  }
}
