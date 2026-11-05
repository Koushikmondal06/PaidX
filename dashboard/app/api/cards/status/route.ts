import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function authenticateUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cardId, status } = await req.json();

    if (!cardId || !['active', 'frozen', 'revoked'].includes(status)) {
      return NextResponse.json({ error: 'Invalid cardId or status' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify ownership
    const { data: existing, error: findError } = await supabase
      .from('cards')
      .select('id, user_id, status, uid_hash')
      .eq('id', cardId)
      .eq('user_id', user.id)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ error: 'Card not found or access denied' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('cards')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cardId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, card: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating card status';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

