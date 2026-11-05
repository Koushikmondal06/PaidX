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

    const { permissionId, revocationTxHash } = await req.json();

    if (!permissionId) {
      return NextResponse.json({ error: 'Missing permissionId' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify permission belongs to user
    const { data: existing, error: findError } = await supabase
      .from('permissions')
      .select('id, user_id, status')
      .eq('id', permissionId)
      .eq('user_id', user.id)
      .single();

    if (findError || !existing) {
      return NextResponse.json({ error: 'Permission not found' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('permissions')
      .update({
        status: 'revoked',
        revocation_tx_hash: revocationTxHash || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', permissionId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, permission: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error revoking permission';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

