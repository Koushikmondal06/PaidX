import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getServerPublicClient } from '@/lib/chain';
import { MERCHANT_REGISTRY_ABI, getMerchantRegistryAddress } from '@/lib/contracts';
import { parseEventLogs, type Hash, type Address } from 'viem';

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

    // Verify merchant exists
    const { data: existingMerchant } = await supabase
      .from('merchants')
      .select('*')
      .eq('id', merchantId)
      .maybeSingle();

    if (!existingMerchant) {
      return NextResponse.json({ error: 'Merchant not found', code: 'MERCHANT_NOT_FOUND' }, { status: 404 });
    }

    // Verify on-chain registration receipt if activating via txHash
    if (status === 'active' && txHash) {
      try {
        const publicClient = getServerPublicClient();
        const registryAddress = (getMerchantRegistryAddress() as Address).toLowerCase() as Address;

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash as Hash,
          confirmations: 1,
          timeout: 60_000,
        });

        if (receipt.status !== 'success') {
          return NextResponse.json(
            { error: 'Merchant registration transaction reverted on Sepolia', code: 'TRANSACTION_REVERTED' },
            { status: 400 }
          );
        }

        const logs = parseEventLogs({
          abi: MERCHANT_REGISTRY_ABI,
          eventName: 'MerchantRegistered',
          logs: receipt.logs,
        });

        const matchingLog = logs.find((l) => l.address.toLowerCase() === registryAddress);
        if (!matchingLog) {
          return NextResponse.json(
            {
              error: 'Receipt does not contain MerchantRegistered event from MerchantRegistry',
              code: 'INVALID_RECEIPT',
            },
            { status: 400 }
          );
        }
      } catch (receiptErr: unknown) {
        const msg = receiptErr instanceof Error ? receiptErr.message : 'On-chain verification error';
        return NextResponse.json({ error: msg, code: 'RECEIPT_VERIFICATION_FAILED' }, { status: 400 });
      }
    }

    const { data: merchant, error } = await supabase
      .from('merchants')
      .update({
        status,
        register_tx_hash: txHash || existingMerchant.register_tx_hash,
        registration_tx_hash: txHash || existingMerchant.register_tx_hash,
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
