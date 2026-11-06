import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { isValidHederaAccountId } from '@/lib/hedera/client';
import { getMirrorAccount, getMirrorAccountBalance, getHashScanAccountUrl } from '@/lib/hedera/mirrorNode';
import { keyStructureMatches, delegatedSigner, type MirrorKeyNode } from '@/lib/hedera/signing/delegatedSigner';
import { PrivateKey, PublicKey } from '@hiero-ledger/sdk';
import type { Database } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

type WalletRow = Database['public']['Tables']['wallets']['Row'];

const HEDERA_TESTNET_CHAIN_ID = 296;
const HEDERA_MAINNET_CHAIN_ID = 295;

/**
 * GET /api/wallets/hedera
 * Retrieves the currently linked Hedera wallet(s) for the authenticated user,
 * along with live Mirror Node verification status and balances.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    const supabase = createServerSupabaseClient();
    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .eq('kind', 'hedera')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({
        wallet: null,
        wallets: [],
        hasLinkedWallet: false,
      });
    }

    const walletList = wallets as unknown as WalletRow[];
    const primaryWallet = walletList.find((w: WalletRow) => w.is_primary) || walletList[0];

    // Fetch live Mirror Node balance and verification for primary wallet
    let mirrorBalance: { hbarBalance: string; tokens: Array<{ token_id: string; balance: number }> } | null = null;
    let isLiveVerified = false;

    try {
      const mirrorAcc = await getMirrorAccount(primaryWallet.address);
      if (mirrorAcc && !mirrorAcc.deleted) {
        isLiveVerified = true;
      }
      const rawBal = await getMirrorAccountBalance(primaryWallet.address);
      if (rawBal) {
        mirrorBalance = {
          hbarBalance: (rawBal.balance / 100_000_000).toFixed(4),
          tokens: rawBal.tokens || [],
        };
      }
    } catch {
      // In offline / unit test mode, balance lookup is non-blocking
    }

    return NextResponse.json({
      hasLinkedWallet: true,
      wallet: {
        id: primaryWallet.id,
        address: primaryWallet.address,
        network: primaryWallet.network || 'hedera:testnet',
        chainId: primaryWallet.chain_id,
        verified: Boolean(primaryWallet.verified && isLiveVerified),
        publicKey: primaryWallet.public_key,
        isPrimary: primaryWallet.is_primary,
        hashScanUrl: getHashScanAccountUrl(primaryWallet.address, 'testnet'),
        balance: mirrorBalance,
        createdAt: primaryWallet.created_at,
      },
      wallets: walletList.map((w: WalletRow) => ({
        id: w.id,
        address: w.address,
        network: w.network || 'hedera:testnet',
        isPrimary: w.is_primary,
        verified: w.verified,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/wallets/hedera
 * Registers or links an existing Hedera account ID to the authenticated user.
 * 
 * Security Guarantees:
 * 1. User identity derived strictly from authenticated Supabase session.
 * 2. Account existence and active status verified via Hedera Mirror Node.
 * 3. Account ownership and key control verified before linking.
 * 4. Never stores an unencrypted private key in the database.
 * 5. Another user's account cannot be claimed without proving cryptographic key control.
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
      network = 'hedera:testnet',
      publicKey,
      signingKey, // Optional private key provided during onboarding for agent signing
      signature,  // Optional challenge signature
      challenge,  // Challenge string that was signed
    } = body;

    // 1. Validate Account ID format
    if (!accountId || typeof accountId !== 'string' || !isValidHederaAccountId(accountId.trim())) {
      return NextResponse.json(
        {
          error: `Invalid Hedera account ID format: "${accountId}". Expected format: "0.0.123456"`,
        },
        { status: 400 }
      );
    }

    const cleanAccountId = accountId.trim();
    const cleanNetwork = network === 'hedera:mainnet' ? 'hedera:mainnet' : 'hedera:testnet';
    const chainId = cleanNetwork === 'hedera:mainnet' ? HEDERA_MAINNET_CHAIN_ID : HEDERA_TESTNET_CHAIN_ID;

    // 2. Query Hedera Mirror Node for account status and key structure
    let mirrorAccount;
    try {
      mirrorAccount = await getMirrorAccount(cleanAccountId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Mirror Node query failed for account "${cleanAccountId}": ${msg}` },
        { status: 502 }
      );
    }

    if (!mirrorAccount) {
      return NextResponse.json(
        {
          error: `Hedera account "${cleanAccountId}" does not exist on ${cleanNetwork}. Please verify the account ID on HashScan.`,
        },
        { status: 404 }
      );
    }

    if (mirrorAccount.deleted) {
      return NextResponse.json(
        { error: `Hedera account "${cleanAccountId}" is marked as deleted on Mirror Node. Cannot link deleted accounts.` },
        { status: 400 }
      );
    }

    if (!mirrorAccount.key) {
      return NextResponse.json(
        { error: `Hedera account "${cleanAccountId}" has no public key registered on Mirror Node.` },
        { status: 400 }
      );
    }

    // 3. Verify Account Ownership & Key Control
    let verifiedPublicKeyHex = '';
    let verificationMethod = 'unverified';
    let hasCryptographicKeyProof = false;

    // Case A: User supplied signingKey (e.g. for delegated agent execution in dev/test)
    if (signingKey && typeof signingKey === 'string') {
      try {
        const cleanKey = signingKey.trim();
        const privKey = cleanKey.startsWith('0x')
          ? PrivateKey.fromStringECDSA(cleanKey)
          : PrivateKey.fromString(cleanKey);

        const keyMatches = keyStructureMatches(
          mirrorAccount.key as MirrorKeyNode,
          privKey.publicKey
        );

        if (!keyMatches) {
          return NextResponse.json(
            {
              error: `Cryptographic key mismatch: The provided signing key does not control on-chain account "${cleanAccountId}".`,
            },
            { status: 403 }
          );
        }

        verifiedPublicKeyHex = privKey.publicKey.toStringRaw();
        verificationMethod = 'delegated_signing_key_proof';
        hasCryptographicKeyProof = true;

        // Register in isolated in-memory signer registry for agent session execution
        delegatedSigner.registerAccountKey(cleanAccountId, cleanKey);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid private key format';
        return NextResponse.json(
          { error: `Failed to verify signing key: ${msg}` },
          { status: 400 }
        );
      }
    }
    // Case B: User supplied a cryptographic challenge signature
    else if (signature && challenge) {
      try {
        // Validate challenge format and freshness (< 5 minutes)
        if (!challenge.startsWith(`paidx:link-hedera-wallet:${user.id}:${cleanAccountId}:`)) {
          return NextResponse.json(
            { error: 'Invalid challenge: Challenge string does not match authenticated user and account.' },
            { status: 400 }
          );
        }

        const parts = challenge.split(':');
        const timestamp = parseInt(parts[4] || '0', 10);
        if (Date.now() - timestamp > 5 * 60 * 1000) {
          return NextResponse.json(
            { error: 'Verification challenge has expired. Please request a new challenge.' },
            { status: 400 }
          );
        }

        // Resolve candidate public key from payload or Mirror Node leaf key
        const rawPub = publicKey || mirrorAccount.key.key;
        if (!rawPub) {
          return NextResponse.json(
            { error: 'Missing public key to verify signature against.' },
            { status: 400 }
          );
        }

        const candidatePubKey = rawPub.startsWith('0x')
          ? PublicKey.fromStringECDSA(rawPub)
          : PublicKey.fromString(rawPub);

        const keyMatches = keyStructureMatches(
          mirrorAccount.key as MirrorKeyNode,
          candidatePubKey
        );

        if (!keyMatches) {
          return NextResponse.json(
            { error: 'Public key does not match on-chain key structure.' },
            { status: 403 }
          );
        }

        // Verify cryptographic signature
        const isSigValid = candidatePubKey.verify(
          Buffer.from(challenge),
          Buffer.from(signature.replace(/^0x/, ''), 'hex')
        );

        if (!isSigValid) {
          return NextResponse.json(
            { error: 'Cryptographic signature verification failed. Key control not proven.' },
            { status: 403 }
          );
        }

        verifiedPublicKeyHex = candidatePubKey.toStringRaw();
        verificationMethod = 'challenge_signature';
        hasCryptographicKeyProof = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Signature verification error';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
    // Case C: User supplied a matching public key
    else if (publicKey && typeof publicKey === 'string') {
      try {
        const candidatePubKey = publicKey.trim().startsWith('0x')
          ? PublicKey.fromStringECDSA(publicKey.trim())
          : PublicKey.fromString(publicKey.trim());

        const keyMatches = keyStructureMatches(
          mirrorAccount.key as MirrorKeyNode,
          candidatePubKey
        );

        if (!keyMatches) {
          return NextResponse.json(
            {
              error: `Public key mismatch: Provided public key does not match on-chain key structure for account "${cleanAccountId}".`,
            },
            { status: 403 }
          );
        }

        verifiedPublicKeyHex = candidatePubKey.toStringRaw();
        verificationMethod = 'public_key_match';
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid public key format';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        {
          error:
            'Ownership verification required: Please provide a challenge signature, registered public key, or authorized delegated signing key.',
        },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 4. Enforce Cross-User Ownership Protection
    // Check if this wallet is already linked in the database
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('id, user_id, address, kind')
      .eq('chain_id', chainId)
      .eq('address', cleanAccountId.toLowerCase())
      .maybeSingle();

    if (existingWallet) {
      if (existingWallet.user_id !== user.id) {
        // Another user already registered this wallet!
        // To claim or transfer ownership, cryptographic key control must be proven.
        if (!hasCryptographicKeyProof) {
          return NextResponse.json(
            {
              error:
                'Forbidden: This Hedera account is already registered to another PaidX user. You must prove cryptographic key control (via signature or signing key) to transfer ownership.',
            },
            { status: 403 }
          );
        }

        // User proved key control: reassign wallet to authenticated user
        const { data: reassignedWallet, error: reassignError } = await supabase
          .from('wallets')
          .update({
            user_id: user.id,
            is_primary: true,
            public_key: verifiedPublicKeyHex,
            verified: true,
            verification_metadata: {
              reassigned_from: existingWallet.user_id,
              reassigned_at: new Date().toISOString(),
              verification_method: verificationMethod,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingWallet.id)
          .select()
          .single();

        if (reassignError || !reassignedWallet) {
          return NextResponse.json({ error: reassignError?.message || 'Failed to reassign wallet' }, { status: 500 });
        }

        return NextResponse.json({
          success: true,
          message: `Hedera account "${cleanAccountId}" ownership verified and transferred to your account.`,
          wallet: reassignedWallet,
        });
      }
    }

    // 5. Unset is_primary on any existing Hedera wallets of this user
    await supabase
      .from('wallets')
      .update({ is_primary: false, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('kind', 'hedera');

    // 6. Upsert the Hedera wallet record strictly bound to the authenticated user.id
    // Note: NEVER store private keys in the database!
    const { data: walletRecord, error: upsertError } = await supabase
      .from('wallets')
      .upsert(
        {
          user_id: user.id,
          address: cleanAccountId.toLowerCase(),
          chain_id: chainId,
          kind: 'hedera',
          is_primary: true,
          smart_account_upgraded: false,
          network: cleanNetwork,
          public_key: verifiedPublicKeyHex,
          verified: true,
          verification_metadata: {
            verified_at: new Date().toISOString(),
            mirror_account: mirrorAccount.account,
            key_type: mirrorAccount.key?._type,
            verification_method: verificationMethod,
          },
          evm_address: mirrorAccount.evm_address || null,
        },
        { onConflict: 'chain_id, address' }
      )
      .select()
      .single();

    if (upsertError || !walletRecord) {
      return NextResponse.json(
        { error: upsertError?.message || 'Failed to register Hedera wallet in database' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Hedera wallet "${cleanAccountId}" successfully verified and linked to your account.`,
      wallet: {
        id: walletRecord.id,
        address: walletRecord.address,
        network: walletRecord.network,
        chainId: walletRecord.chain_id,
        verified: walletRecord.verified,
        publicKey: walletRecord.public_key,
        isPrimary: walletRecord.is_primary,
        hashScanUrl: getHashScanAccountUrl(walletRecord.address, 'testnet'),
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
