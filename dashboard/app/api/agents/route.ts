import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { PrivateKey } from '@hiero-ledger/sdk';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { hashAgentToken } from '@/lib/agent/policyEngine';
import { delegatedSigner } from '@/lib/hedera/signing/delegatedSigner';
import { defaultMpcSigner, defaultMpcEngine } from '@/lib/hedera/signing/mpcSigner';
import { getHederaClient } from '@/lib/hedera/client';

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
      grantDelegatedSigning = false,
      allowedNetworks = ['hedera:testnet'],
      allowedAssets = ['USDC', 'HBAR'],
    } = body;

    if (!agentName || typeof agentName !== 'string' || !agentName.trim()) {
      return NextResponse.json({ error: 'Valid agentName is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Resolve and verify wallet ownership and kind
    let targetWalletId = walletId;
    let selectedWallet: any = null;

    if (targetWalletId) {
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('id, user_id, kind, address, verification_metadata')
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

      selectedWallet = wallet;
    } else {
      // Find user's existing primary or latest Hedera wallet
      const { data: existingHederaWallets, error: findError } = await supabase
        .from('wallets')
        .select('id, user_id, kind, address, is_primary, verification_metadata')
        .eq('user_id', user.id)
        .eq('kind', 'hedera')
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

      if (findError) {
        return NextResponse.json({ error: findError.message }, { status: 500 });
      }

      let existingHederaWallet = existingHederaWallets?.[0];

      // If user has no existing Hedera wallet, attempt Hedera SDK native account creation
      // if operator credentials are provided, avoiding forced EVM wallet connection
      if (!existingHederaWallet) {
        const operatorIdStr = process.env.HEDERA_OPERATOR_ID;
        const operatorKeyStr = process.env.HEDERA_OPERATOR_KEY;

        if (operatorIdStr && operatorKeyStr) {
          try {
            const { AccountCreateTransaction, Hbar } = await import('@hiero-ledger/sdk');
            const client = getHederaClient();
            const nativeKey = PrivateKey.generateED25519();
            const tx = await new AccountCreateTransaction()
              .setKey(nativeKey.publicKey)
              .setInitialBalance(new Hbar(2))
              .execute(client);

            const receipt = await tx.getReceipt(client);
            if (receipt.accountId) {
              const createdAccId = receipt.accountId.toString();
              const { data: newWallet } = await supabase
                .from('wallets')
                .insert({
                  user_id: user.id,
                  address: createdAccId,
                  chain_id: 296,
                  kind: 'hedera',
                  network: 'hedera:testnet',
                  is_primary: true,
                  smart_account_upgraded: false,
                  public_key: nativeKey.publicKey.toStringRaw(),
                  verified: true,
                  verification_metadata: {
                    signer_type: 'native_hedera_sdk',
                    created_via: 'autonomous_account_creation',
                  },
                })
                .select()
                .single();

              if (newWallet) {
                existingHederaWallet = newWallet;
                delegatedSigner.registerAccountKey(createdAccId, nativeKey.toStringDer());
              }
            }
          } catch (createErr) {
            console.warn('[Account Creation] Autonomous Hedera account creation failed:', createErr);
          }
        }
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
      selectedWallet = existingHederaWallet;
    }

    // Provision separate agent-controlled session key when user grants delegated signing
    let delegatedKeyDer: string | null = null;
    let sessionPubKeyHex: string | null = null;

    if (grantDelegatedSigning && autonomousPaymentsEnabled) {
      if (selectedWallet?.address) {
        if (!defaultMpcSigner.getKey(selectedWallet.address)) {
          const mpcKey = defaultMpcEngine.generateThresholdKey(selectedWallet.address, 'secp256k1');
          defaultMpcSigner.registerMpcKey(mpcKey);
          sessionPubKeyHex = mpcKey.publicKeyHex;
        } else {
          sessionPubKeyHex = defaultMpcSigner.getKey(selectedWallet.address)!.publicKeyHex;
        }
      }

      const agentSessionKey = PrivateKey.generateED25519();
      delegatedKeyDer = agentSessionKey.toStringDer();
      if (!sessionPubKeyHex) {
        sessionPubKeyHex = agentSessionKey.publicKey.toStringRaw();
      }
    }

    const metadata = selectedWallet?.verification_metadata as Record<string, any> | null;
    const isMetaMaskLinked =
      metadata?.signer_type === 'metamask_evm' || metadata?.verification_method === 'metamask_evm_signature';
    const hasDelegatedSigner = selectedWallet?.address
      ? (delegatedKeyDer !== null ||
          (await defaultMpcSigner.canSign(selectedWallet.address)) ||
          (await delegatedSigner.canSign(selectedWallet.address)))
      : false;
    const effectiveAutonomous = isMetaMaskLinked && !hasDelegatedSigner ? false : Boolean(autonomousPaymentsEnabled);

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

    // Register delegated session key for this agent if granted
    if (delegatedKeyDer && selectedWallet?.address) {
      delegatedSigner.registerAgentSessionKey(connection.id, selectedWallet.address, delegatedKeyDer);
    }

    // 4. Insert agent_policies record
    const { error: policyError } = await supabase.from('agent_policies').insert({
      agent_id: connection.id,
      max_amount_per_tx: maxAmountPerTx.toString(),
      daily_budget: dailyBudget.toString(),
      monthly_budget: monthlyBudget.toString(),
      spent_today: '0',
      spent_this_month: '0',
      autonomous_payments_enabled: effectiveAutonomous,
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
      autonomousPaymentsEnabled: effectiveAutonomous,
      sessionPublicKey: sessionPubKeyHex,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
