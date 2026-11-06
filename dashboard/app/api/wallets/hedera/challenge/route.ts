import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isAddress } from 'viem';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { isValidHederaAccountId } from '@/lib/hedera/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { HEDERA_TESTNET_CHAIN_ID } from '@/lib/hedera/chain';
import { memoryChallengeRegistry, type ChallengeRecord } from '@/lib/hedera/challenges';

export const dynamic = 'force-dynamic';

/**
 * POST /api/wallets/hedera/challenge
 * Generates a server-issued, single-use, expiring wallet ownership challenge.
 * Binds: authenticated user, wallet address, network, chainId, action, and nonce.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const body = await req.json().catch(() => ({}));
    const {
      accountId,
      evmAddress,
      network = 'hedera:testnet',
      chainId = HEDERA_TESTNET_CHAIN_ID,
      action = evmAddress ? 'link-metamask-hedera' : 'link-hedera-wallet',
    } = body;

    // 1. Validate Chain ID & Network
    const numericChainId = typeof chainId === 'string' ? parseInt(chainId, 10) : Number(chainId);
    if (numericChainId !== HEDERA_TESTNET_CHAIN_ID) {
      return NextResponse.json(
        {
          error: `Invalid chain ID: ${chainId}. Only Hedera Testnet (chain ID ${HEDERA_TESTNET_CHAIN_ID}) is supported for Hedera wallet linking.`,
        },
        { status: 400 }
      );
    }

    if (network !== 'hedera:testnet') {
      return NextResponse.json(
        {
          error: `Invalid network: "${network}". Expected "hedera:testnet".`,
        },
        { status: 400 }
      );
    }

    // 2. Validate Address
    let cleanAddress = '';
    let isEvm = false;

    if (evmAddress && typeof evmAddress === 'string') {
      if (!isAddress(evmAddress.trim())) {
        return NextResponse.json(
          { error: `Invalid EVM address format: "${evmAddress}". Expected "0x..." 40-character hex address.` },
          { status: 400 }
        );
      }
      cleanAddress = evmAddress.trim().toLowerCase();
      isEvm = true;
    } else if (accountId && typeof accountId === 'string') {
      if (!isValidHederaAccountId(accountId.trim())) {
        return NextResponse.json(
          { error: `Invalid Hedera account ID format: "${accountId}". Expected "0.0.123456"` },
          { status: 400 }
        );
      }
      cleanAddress = accountId.trim();
      isEvm = false;
    } else {
      return NextResponse.json(
        { error: 'Missing wallet identifier: please provide either "evmAddress" or "accountId".' },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const expiresInSeconds = 300; // 5 minutes validity
    const expiresAt = timestamp + expiresInSeconds * 1000;
    const nonce = crypto.randomBytes(16).toString('hex');

    // 3. Construct canonical challenge message
    let challengeText: string;
    if (isEvm) {
      // Human-readable, strictly bound challenge message for MetaMask personal_sign
      challengeText = [
        'PaidX Hedera Testnet Wallet Ownership Verification',
        '',
        'Sign this message to link your MetaMask wallet to PaidX.',
        `User ID: ${user.id}`,
        `Wallet: ${cleanAddress}`,
        `Network: hedera:testnet (Chain ID: ${HEDERA_TESTNET_CHAIN_ID})`,
        `Action: ${action}`,
        `Nonce: ${nonce}`,
        `Issued At: ${new Date(timestamp).toISOString()}`,
      ].join('\n');
    } else {
      // Compact string format for native Hedera key challenge
      challengeText = `paidx:${action}:${user.id}:${cleanAddress}:${timestamp}:${nonce}`;
    }

    // 4. Save to in-memory single-use registry
    const challengeData: ChallengeRecord = {
      nonce,
      userId: user.id,
      walletAddress: cleanAddress,
      network: 'hedera:testnet',
      chainId: HEDERA_TESTNET_CHAIN_ID,
      action,
      challengeText,
      used: false,
      issuedAt: timestamp,
      expiresAt,
    };
    memoryChallengeRegistry.set(nonce, challengeData);

    // 5. Attempt persistence in Supabase wallet_challenges (non-blocking if table not migrated)
    try {
      const supabase = createServerSupabaseClient();
      await supabase.from('wallet_challenges').insert({
        user_id: user.id,
        wallet_address: cleanAddress,
        network: 'hedera:testnet',
        chain_id: HEDERA_TESTNET_CHAIN_ID,
        action,
        challenge_text: challengeText,
        nonce,
        used: false,
        expires_at: new Date(expiresAt).toISOString(),
      });
    } catch {
      // In-memory registry provides complete resilience
    }

    return NextResponse.json({
      success: true,
      walletAddress: cleanAddress,
      action,
      network: 'hedera:testnet',
      chainId: HEDERA_TESTNET_CHAIN_ID,
      challenge: challengeText,
      nonce,
      timestamp,
      expiresInSeconds,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
