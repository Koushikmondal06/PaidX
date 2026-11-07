import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  prepareMpcAccountAuthorization,
  finalizeMpcAccountAuthorization,
} from '@/lib/hedera/signing/mpcEnrollment';

export const dynamic = 'force-dynamic';

/**
 * POST /api/mpc/enroll
 * Handles the secure enrollment of a user's MetaMask Hedera account into MPC threshold signing.
 *
 * Action "prepare":
 *   1. Verifies the user's connected Hedera account on Mirror Node.
 *   2. Generates MPC 2-of-3 threshold key.
 *   3. Constructs Hedera AccountUpdateTransaction setting KeyList([UserMetaMaskKey, MpcKey], threshold: 1).
 *   4. Returns unsigned transaction bytes for user explicit approval in MetaMask.
 *
 * Action "finalize":
 *   1. Receives user's signature from MetaMask.
 *   2. Attaches MPC co-signature (Share 1 + Share 2).
 *   3. Broadcasts AccountUpdateTransaction to Hedera Testnet.
 *   4. Verifies on-chain Mirror Node key structure.
 *   5. Returns enrollment status, on-chain verification, and User Recovery Share (Share 3).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const body = await req.json();
    const { action, walletId, accountId, curve, preparedUpdate, userSignatureHex, thresholdKey } = body;

    const supabase = createServerSupabaseClient();

    // 1. Resolve Target Wallet
    let targetAccountId = accountId;
    let targetEvmAddress = '';

    if (walletId) {
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !wallet) {
        return NextResponse.json({ error: 'Target wallet not found or unauthorized' }, { status: 404 });
      }
      targetAccountId = wallet.address;
      targetEvmAddress = wallet.evm_address || '';
    }

    if (!targetAccountId) {
      return NextResponse.json({ error: 'accountId or walletId is required' }, { status: 400 });
    }

    // -------------------------------------------------------------------------
    // Phase 1: Prepare AccountUpdateTransaction
    // -------------------------------------------------------------------------
    if (action === 'prepare' || !action) {
      const { thresholdKey: newKey, preparedUpdate: prep } = await prepareMpcAccountAuthorization({
        accountId: targetAccountId,
        evmAddress: targetEvmAddress,
        curve: curve || 'secp256k1',
      });

      return NextResponse.json({
        success: true,
        action: 'prepared',
        thresholdKey: newKey,
        preparedUpdate: prep,
      });
    }

    // -------------------------------------------------------------------------
    // Phase 2: Finalize AccountUpdateTransaction with User Signature
    // -------------------------------------------------------------------------
    if (action === 'finalize') {
      if (!thresholdKey || !preparedUpdate) {
        return NextResponse.json(
          { error: 'Missing thresholdKey or preparedUpdate required to finalize enrollment' },
          { status: 400 }
        );
      }

      const result = await finalizeMpcAccountAuthorization({
        thresholdKey,
        userSignatureHex,
        preparedUpdate,
      });

      // Update wallet verification metadata in database
      if (walletId) {
        await supabase
          .from('wallets')
          .update({
            smart_account_upgraded: true,
            public_key: result.mpcPublicKeyHex,
            verification_metadata: {
              signer_type: 'metamask_evm_mpc',
              verification_method: 'mpc_threshold_enrollment',
              mpc_enrolled: true,
              mpc_enrolled_at: new Date().toISOString(),
              mpc_public_key: result.mpcPublicKeyHex,
              threshold: 2,
              total_shares: 3,
              recovery_share_fingerprint: result.userRecoveryShare.fingerprint,
              on_chain_threshold_key: true,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', walletId)
          .eq('user_id', user.id);
      }

      return NextResponse.json({
        success: true,
        result,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
