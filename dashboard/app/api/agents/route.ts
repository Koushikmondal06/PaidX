import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hashAgentToken } from '@/lib/agent/policyEngine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const userId = req.headers.get('x-user-id');

    let query = supabase.from('agent_connections').select(`
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
    `);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: agents, error } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agents: agents || [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      agentName,
      walletId,
      maxAmountPerTx = '5000000', // 5 USDC (6 decimals)
      dailyBudget = '20000000',   // 20 USDC
      monthlyBudget = '100000000', // 100 USDC
      autonomousPaymentsEnabled = true,
      allowedNetworks = ['hedera:testnet'],
      allowedAssets = ['USDC', 'HBAR'],
    } = body;

    if (!userId || !agentName) {
      return NextResponse.json({ error: 'Missing userId or agentName' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Resolve or create Hedera wallet for user if walletId not provided
    let targetWalletId = walletId;
    if (!targetWalletId) {
      const { data: existingHederaWallet } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('kind', 'hedera')
        .maybeSingle();

      if (existingHederaWallet) {
        targetWalletId = existingHederaWallet.id;
      } else {
        // Create Hedera wallet linked to user
        const hederaAddress = process.env.HEDERA_OPERATOR_ID || '0.0.5449100';
        const { data: newWallet, error: walletError } = await supabase
          .from('wallets')
          .insert({
            user_id: userId,
            address: hederaAddress.toLowerCase(),
            chain_id: 296,
            kind: 'hedera',
            is_primary: false,
          })
          .select('id')
          .single();

        if (walletError || !newWallet) {
          return NextResponse.json({ error: 'Failed to link Hedera wallet to user' }, { status: 500 });
        }
        targetWalletId = newWallet.id;
      }
    }

    // 2. Generate raw Agent Bearer Token
    const rawSecret = crypto.randomBytes(24).toString('hex');
    const rawToken = `paidx_agt_${rawSecret}`;
    const tokenHash = hashAgentToken(rawToken);
    const tokenPrefix = `paidx_agt_${rawSecret.slice(0, 6)}...`;

    // 3. Insert agent_connections record
    const { data: connection, error: connError } = await supabase
      .from('agent_connections')
      .insert({
        user_id: userId,
        wallet_id: targetWalletId,
        agent_name: agentName,
        api_key_hash: tokenHash,
        api_key_prefix: tokenPrefix,
        status: 'active',
      })
      .select()
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: connError?.message || 'Failed to create connection' }, { status: 500 });
    }

    // 4. Insert agent_policies record
    await supabase.from('agent_policies').insert({
      agent_id: connection.id,
      max_amount_per_tx: maxAmountPerTx,
      daily_budget: dailyBudget,
      monthly_budget: monthlyBudget,
      spent_today: '0',
      spent_this_month: '0',
      autonomous_payments_enabled: autonomousPaymentsEnabled,
      allowed_networks: allowedNetworks,
      allowed_assets: allowedAssets,
    });

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
