import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function authenticateAdmin(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Check profiles role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return null;
  }
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = await authenticateAdmin(req);
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const supabase = createServerSupabaseClient();
    const { data: merchants, error } = await supabase
      .from('merchants')
      .select('id, name, payout_address, status, register_tx_hash, created_at, owner_user_id')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, merchants });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching merchants';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await authenticateAdmin(req);
    if (!adminUser) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { merchantId, status, txHash } = body;

    if (!merchantId || !['active', 'suspended', 'pending'].includes(status)) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: merchant, error } = await supabase
      .from('merchants')
      .update({
        status,
        register_tx_hash: txHash || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', merchantId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, merchant });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error updating merchant';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

