import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { delegatedSigner } from '@/lib/hedera/signing/delegatedSigner';
import { defaultMpcSigner } from '@/lib/hedera/signing/mpcSigner';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/revoke
 * Revokes an agent connection belonging to the authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const body = await req.json();
    const { agentId } = body;

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Verify ownership: agent must belong to authenticated user
    const { data: existingAgent, error: findError } = await supabase
      .from('agent_connections')
      .select('id, user_id, status')
      .eq('id', agentId)
      .maybeSingle();

    if (findError || !existingAgent) {
      return NextResponse.json({ error: 'Agent connection not found' }, { status: 404 });
    }

    if (existingAgent.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Forbidden: You do not have permission to revoke this agent connection' },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('agent_connections')
      .update({
        status: 'revoked',
        revoked_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', agentId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to revoke agent' },
        { status: 500 }
      );
    }

    // Release any active reserved budget reservations for this agent
    await supabase
      .from('agent_spending_reservations')
      .update({
        status: 'released',
        release_reason: 'Agent revoked by user',
        updated_at: nowIso,
      })
      .eq('agent_id', agentId)
      .eq('status', 'reserved');

    // Instantly wipe delegated session key from in-memory signer (Requirement 8)
    delegatedSigner.unregisterAgentSessionKey(agentId);

    // If connected to a wallet, also purge active MPC signing credentials
    if (existingAgent.wallet_id) {
      const { data: w } = await supabase
        .from('wallets')
        .select('address')
        .eq('id', existingAgent.wallet_id)
        .maybeSingle();
      if (w?.address) {
        defaultMpcSigner.unregisterMpcKey(w.address);
      }
    }

    return NextResponse.json({
      success: true,
      agentId: updated.id,
      status: updated.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
