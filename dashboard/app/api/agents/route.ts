import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { hashAgentToken } from '@/lib/agent/policyEngine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents
 * Retrieves all agent connections for the authenticated Supabase user.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const supabase = createServerSupabaseClient();

    // Query scoped strictly to the authenticated user's ID
    const { data: agents, error } = await supabase
      .from('agent_connections')
      .select(`
        id,
        agent_name,
        api_key_prefix,
        status,
        created_at,
        wallets (
          id,
          address,
          kind
        ),
        agent_policies (
          max_amount_per_tx,
          daily_budget,
          spent_today,
          monthly_budget,
          autonomous_payments_enabled,
          allowed_networks,
          allowed_assets
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agents: agents || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/agents
 * Registers a new agent connection and spending policy for the authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const body = await req.json();
    const {
      agentName,
      walletId,
      maxAmountPerTx = '5000000', // 5 USDC (6 decimals)
      dailyBudget = '20000000',   // 20 USDC
      monthlyBudget = '100000000', // 100 USDC
      autonomousPaymentsEnabled = true,
      allowedNetworks = ['hedera:testnet'],
      allowedAssets = ['USDC', 'HBAR'],
    } = body;

    if (!agentName || typeof agentName !== 'string' || !agentName.trim()) {
      return NextResponse.json({ error: 'Valid agentName is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Resolve and verify wallet ownership and kind
    let targetWalletId = walletId;
    if (targetWalletId) {
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('id, user_id, kind, address')
        .eq('id', targetWalletId)
        .maybeSingle();

      if (walletError || !wallet) {
        return NextResponse.json(
          { error: 'Specified wallet not found' },
          { status: 404 }
        );
      }

      if (wallet.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Forbidden: Wallet does not belong to authenticated user' },
          { status: 403 }
        );
      }

      if (wallet.kind !== 'hedera') {
        return NextResponse.json(
          { error: 'Invalid wallet kind: Hedera agent payments require wallet.kind to be "hedera"' },
          { status: 400 }
        );
      }
    } else {
      // Find user's existing Hedera wallet
      const { data: existingHederaWallet, error: findError } = await supabase
        .from('wallets')
        .select('id, kind')
        .eq('user_id', user.id)
        .eq('kind', 'hedera')
        .maybeSingle();

      if (findError) {
        return NextResponse.json({ error: findError.message }, { status: 500 });
      }

      if (!existingHederaWallet) {
        return NextResponse.json(
          {
            error:
              'No Hedera wallet linked to your account. Please link or register a Hedera wallet before connecting an agent.',
          },
          { status: 400 }
        );
      }

      targetWalletId = existingHederaWallet.id;
    }

    // 2. Generate raw Agent Bearer Token
    const rawSecret = crypto.randomBytes(24).toString('hex');
    const rawToken = `paidx_agt_${rawSecret}`;
    const tokenHash = hashAgentToken(rawToken);
    const tokenPrefix = `paidx_agt_${rawSecret.slice(0, 6)}...`;

    // 3. Insert agent_connections record scoped strictly to authenticated user.id
    const { data: connection, error: connError } = await supabase
      .from('agent_connections')
      .insert({
        user_id: user.id,
        wallet_id: targetWalletId,
        agent_name: agentName.trim(),
        api_key_hash: tokenHash,
        api_key_prefix: tokenPrefix,
        status: 'active',
      })
      .select()
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { error: connError?.message || 'Failed to create agent connection' },
        { status: 500 }
      );
    }

    // 4. Insert agent_policies record
    const { error: policyError } = await supabase.from('agent_policies').insert({
      agent_id: connection.id,
      max_amount_per_tx: maxAmountPerTx.toString(),
      daily_budget: dailyBudget.toString(),
      monthly_budget: monthlyBudget.toString(),
      spent_today: '0',
      spent_this_month: '0',
      autonomous_payments_enabled: Boolean(autonomousPaymentsEnabled),
      allowed_networks: allowedNetworks,
      allowed_assets: allowedAssets,
    });

    if (policyError) {
      // Rollback connection if policy insert fails
      await supabase.from('agent_connections').delete().eq('id', connection.id);
      return NextResponse.json({ error: policyError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      agentId: connection.id,
      agentName: connection.agent_name,
      token: rawToken, // Displayed once to the user
      prefix: tokenPrefix,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
