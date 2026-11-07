import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { parseUnits, type Address } from 'viem';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeCardUidHash } from '@/lib/server/cardHash';
import { executeDelegationRedemption } from '@/lib/server/paymentExecutor';
import { getServerPublicClient, CHAIN_ID, PAYMENT_TOKEN_ADDRESS } from '@/lib/chain';
import { ERC20_ABI } from '@/lib/contracts';
import { getSessionAccount } from '@/lib/server/sessionAccount';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawIdempotencyKey =
      req.headers.get('idempotency-key') ||
      req.headers.get('x-idempotency-key');

    const body = await req.json().catch(() => ({}));
    const {
      merchantId: bodyMerchantId,
      rawCardUid: bodyRawCardUid,
      cardUid: bodyCardUid,
      cardUidHash: providedCardUidHash,
      amount: amountStr,
      clientSaleId,
      idempotencyKey: bodyIdempotencyKey,
    } = body;

    const idempotencyKey = (rawIdempotencyKey || clientSaleId || bodyIdempotencyKey || '').trim();

    // Idempotency Key is strictly required
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Missing required Idempotency-Key header', code: 'MISSING_IDEMPOTENCY_KEY' },
        { status: 400 }
      );
    }

    const rawCardUid = bodyRawCardUid || bodyCardUid;
    const supabase = createServerSupabaseClient();

    // Check if idempotency key was already processed
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingPayment) {
      return NextResponse.json({
        success: existingPayment.status === 'confirmed',
        txHash: existingPayment.tx_hash || null,
        explorerUrl: existingPayment.tx_hash ? `https://sepolia.etherscan.io/tx/${existingPayment.tx_hash}` : null,
        payment: existingPayment,
        isIdempotentReplay: true,
      });
    }

    // 1. Authenticate Hardware Terminal or Web Merchant Session
    const deviceTokenHeader = req.headers.get('x-device-token');
    const authHeader = req.headers.get('authorization');
    const deviceUuidHeader = req.headers.get('x-device-uuid') || req.headers.get('x-merchant-id') || bodyMerchantId || '#001';

    let resolvedMerchant: any = null;

    if (deviceTokenHeader || (authHeader && authHeader.startsWith('Bearer psk_'))) {
      // Hardware POS Device Token authentication
      const rawToken = deviceTokenHeader || authHeader?.replace('Bearer ', '').trim();
      if (!rawToken) {
        return NextResponse.json(
          { error: 'Missing device authentication token', code: 'UNAUTHORIZED' },
          { status: 401 }
        );
      }

      const incomingHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      let posDevice: any = null;
      try {
        const { data: dbDevice, error: devError } = await supabase
          .from('pos_devices')
          .select('*')
          .eq('device_uuid', deviceUuidHeader)
          .maybeSingle();

        if (dbDevice && !devError) {
          posDevice = dbDevice;
        }
      } catch (err) {
        console.warn('[Payments] pos_devices query warning:', err);
      }

      // Default fallback for physical POS Terminal #001 (PSK verified via constant-time SHA-256)
      if (!posDevice && (deviceUuidHeader === '#001' || !deviceUuidHeader)) {
        posDevice = {
          device_uuid: '#001',
          token_hash: '408d906df7b0ccabe274dda9d3ba17acc313df0a304335242190383bdd1df842',
          merchant_id: '#001',
          status: 'active',
        };
      }

      if (!posDevice) {
        return NextResponse.json(
          { error: `Unauthorized POS device "${deviceUuidHeader}"`, code: 'UNAUTHORIZED_DEVICE' },
          { status: 401 }
        );
      }

      // Constant-time timingSafeEqual hash comparison
      const expectedHash = posDevice.token_hash || posDevice.device_token_hash;
      const storedBuffer = Buffer.from(expectedHash || '', 'utf8');
      const incomingBuffer = Buffer.from(incomingHash, 'utf8');

      if (
        storedBuffer.length !== incomingBuffer.length ||
        !crypto.timingSafeEqual(storedBuffer, incomingBuffer)
      ) {
        return NextResponse.json(
          { error: 'Invalid device token', code: 'INVALID_DEVICE_TOKEN' },
          { status: 401 }
        );
      }

      if (posDevice.status !== 'active') {
        return NextResponse.json(
          { error: `POS device is ${posDevice.status}`, code: 'DEVICE_INACTIVE' },
          { status: 403 }
        );
      }

      // Resolve merchant strictly from verified device association
      const isDeviceMerchantUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(posDevice.merchant_id || '');
      const merchantQuery = supabase.from('merchants').select('*');
      const { data: mData, error: mError } = isDeviceMerchantUuid
        ? await merchantQuery.eq('id', posDevice.merchant_id).maybeSingle()
        : await merchantQuery.eq('slug', posDevice.merchant_id || '#001').maybeSingle();

      if (mError || !mData) {
        if (posDevice.merchant_id === '#001' || !posDevice.merchant_id) {
          resolvedMerchant = {
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Apex Retail',
            payout_address: '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
            receiving_address: '0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6',
            status: 'active',
          };
        } else {
          return NextResponse.json(
            { error: 'Associated merchant not found in registry', code: 'MERCHANT_NOT_FOUND' },
            { status: 404 }
          );
        }
      } else {
        resolvedMerchant = mData;
      }
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      // Authenticated Web Merchant User Session
      const userToken = authHeader.replace('Bearer ', '').trim();
      const { data: { user }, error: userError } = await supabase.auth.getUser(userToken);
      if (userError || !user) {
        return NextResponse.json({ error: 'Unauthorized user session', code: 'UNAUTHORIZED' }, { status: 401 });
      }

      const { data: userMerchant } = await supabase
        .from('merchants')
        .select('*')
        .eq('owner_user_id', user.id)
        .maybeSingle();

      if (!userMerchant) {
        return NextResponse.json({ error: 'No merchant profile linked to current user', code: 'MERCHANT_NOT_FOUND' }, { status: 404 });
      }
      resolvedMerchant = userMerchant;
    } else {
      // Default to checking if deviceUuidHeader has an active record in merchants table
      const { data: fallbackMerchant } = await supabase
        .from('merchants')
        .select('*')
        .or(`slug.eq.${deviceUuidHeader},payout_address.ilike.${deviceUuidHeader}`)
        .maybeSingle();

      if (fallbackMerchant && fallbackMerchant.status === 'active') {
        resolvedMerchant = fallbackMerchant;
      } else {
        return NextResponse.json(
          { error: 'Missing authentication credentials (X-Device-Token or Bearer token)', code: 'UNAUTHORIZED' },
          { status: 401 }
        );
      }
    }

    if (resolvedMerchant.status !== 'active') {
      return NextResponse.json(
        { error: `Merchant "${resolvedMerchant.name}" is ${resolvedMerchant.status}`, code: 'MERCHANT_INACTIVE' },
        { status: 403 }
      );
    }

    if (!resolvedMerchant.payout_address || !resolvedMerchant.payout_address.startsWith('0x')) {
      return NextResponse.json(
        { error: `Merchant "${resolvedMerchant.name}" has no valid payout address configured`, code: 'INVALID_MERCHANT_PAYOUT' },
        { status: 400 }
      );
    }

    // 2. Resolve Card Hash (raw UID is never stored)
    let cardHash = providedCardUidHash;
    if (!cardHash && rawCardUid) {
      cardHash = computeCardUidHash(rawCardUid);
    }

    if (!cardHash) {
      return NextResponse.json(
        { error: 'Card identifier (rawCardUid or cardUidHash) is required', code: 'CARD_NOT_FOUND' },
        { status: 400 }
      );
    }

    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('*')
      .eq('uid_hash', cardHash)
      .maybeSingle();

    if (cardError || !card) {
      return NextResponse.json(
        { error: 'Card not registered in system', code: 'CARD_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (card.status !== 'active') {
      return NextResponse.json(
        { error: `Card is currently ${card.status}`, code: 'CARD_INACTIVE' },
        { status: 403 }
      );
    }

    // 3. Resolve Active User Permission
    const { data: permission, error: permError } = await supabase
      .from('permissions')
      .select('*')
      .eq('user_id', card.user_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (permError || !permission) {
      return NextResponse.json(
        { error: 'No active spending allowance found for cardholder', code: 'PERMISSION_NOT_FOUND' },
        { status: 404 }
      );
    }

    const { data: userWallet } = await supabase
      .from('wallets')
      .select('address')
      .eq('user_id', card.user_id)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Check validity timestamps
    const now = new Date();
    const validAfter = new Date(permission.valid_after || permission.created_at);
    const validUntil = new Date(permission.valid_until || permission.expiry || '2099-01-01');

    if (now < validAfter || now > validUntil) {
      return NextResponse.json(
        { error: 'Spending allowance has expired', code: 'PERMISSION_EXPIRED' },
        { status: 403 }
      );
    }

    // 4. Strict Amount Parsing: ^\d+(\.\d{1,6})?$
    const amtClean = typeof amountStr === 'string' ? amountStr.trim() : String(amountStr || '');
    if (!/^\d+(\.\d{1,6})?$/.test(amtClean)) {
      return NextResponse.json(
        { error: 'Invalid amount format. Must be positive decimal with up to 6 decimals (e.g. 1.50)', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    let requestedAmount: bigint;
    try {
      requestedAmount = parseUnits(amtClean, 6);
    } catch {
      return NextResponse.json(
        { error: 'Invalid amount format', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    if (requestedAmount <= 0n) {
      return NextResponse.json(
        { error: 'Payment amount must be greater than zero', code: 'INVALID_AMOUNT' },
        { status: 400 }
      );
    }

    // 5. Period Rollover & Limit Check
    const periodStart = new Date(permission.current_period_start || permission.created_at);
    const periodSeconds = Number(permission.period_seconds || 86400);
    let remainingInPeriod = BigInt(permission.remaining_in_period ?? permission.limit_per_period ?? 0);

    if (now.getTime() >= periodStart.getTime() + periodSeconds * 1000) {
      // Period has rolled over: reset remaining limit to full period limit
      remainingInPeriod = BigInt(permission.limit_per_period || permission.period_amount || 0);
      await supabase
        .from('permissions')
        .update({
          remaining_in_period: remainingInPeriod.toString(),
          current_period_start: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', permission.id);
    }

    if (requestedAmount > remainingInPeriod) {
      return NextResponse.json(
        {
          error: 'Transaction amount exceeds available daily spending limit',
          code: 'LIMIT_EXCEEDED',
          remaining: remainingInPeriod.toString(),
          requested: requestedAmount.toString(),
        },
        { status: 422 }
      );
    }

    // 6. Server-Side On-Chain Allowance Verification
    const resolvedPayer = (userWallet?.address || (permission.grant_payload as any)?.payerAddress) as Address;
    if (!resolvedPayer) {
      return NextResponse.json(
        { error: 'Customer wallet address is missing from permission record', code: 'MISSING_PAYER' },
        { status: 400 }
      );
    }

    try {
      const publicClient = getServerPublicClient();
      const sessionAccount = getSessionAccount();
      const tokenAddr = (permission.token_address || PAYMENT_TOKEN_ADDRESS) as Address;

      const currentAllowance = (await publicClient.readContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [resolvedPayer, sessionAccount.address],
      })) as bigint;

      if (currentAllowance < requestedAmount) {
        return NextResponse.json(
          {
            error: `On-chain allowance insufficient for this settlement (${currentAllowance} < ${requestedAmount})`,
            code: 'INSUFFICIENT_ALLOWANCE',
          },
          { status: 422 }
        );
      }
    } catch (allowanceErr: unknown) {
      const msg = allowanceErr instanceof Error ? allowanceErr.message : 'Allowance check error';
      console.warn('[Payments] On-chain allowance check warning:', msg);
    }

    // Ensure merchant_id is a valid UUID for the payments foreign key constraint
    const isMerchantIdUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedMerchant.id || '');
    const validMerchantUuid = isMerchantIdUuid ? resolvedMerchant.id : '00000000-0000-0000-0000-000000000001';

    // 7. Insert Payment record with status 'created'
    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        idempotency_key: idempotencyKey,
        merchant_id: validMerchantUuid,
        user_id: card.user_id,
        card_id: card.id,
        permission_id: permission.id,
        amount: requestedAmount.toString(),
        token_address: permission.token_address || PAYMENT_TOKEN_ADDRESS,
        chain_id: permission.chain_id || CHAIN_ID,
        status: 'created',
      })
      .select()
      .single();

    if (insertError || !payment) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to initialize payment record', code: 'DATABASE_ERROR' },
        { status: 500 }
      );
    }

    // Update to 'submitted'
    await supabase
      .from('payments')
      .update({ status: 'submitted' })
      .eq('id', payment.id);

    // 8. Execute on-chain settlement via Session Relayer
    const executionResult = await executeDelegationRedemption({
      tokenAddress: payment.token_address,
      recipientAddress: resolvedMerchant.payout_address,
      amount: requestedAmount,
      grantPayload: permission.grant_payload,
      payerAddress: resolvedPayer,
    });

    if (executionResult.success) {
      // Confirmed only after real receipt verified on Sepolia
      const newRemaining = (remainingInPeriod - requestedAmount).toString();

      await supabase
        .from('permissions')
        .update({
          remaining_in_period: newRemaining,
          updated_at: new Date().toISOString(),
        })
        .eq('id', permission.id);

      const confirmedAt = new Date().toISOString();

      const { data: confirmedPayment } = await supabase
        .from('payments')
        .update({
          status: 'confirmed',
          tx_hash: executionResult.txHash || null,
          user_op_hash: executionResult.userOpHash || null,
          block_number: executionResult.blockNumber || null,
          confirmed_at: confirmedAt,
          updated_at: confirmedAt,
        })
        .eq('id', payment.id)
        .select()
        .single();

      const txHash = executionResult.txHash || confirmedPayment?.tx_hash || null;
      const explorerUrl = txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : null;

      return NextResponse.json({
        success: true,
        txHash,
        explorerUrl,
        payment: confirmedPayment,
      });
    } else {
      const { data: failedPayment } = await supabase
        .from('payments')
        .update({
          status: 'failed',
          failure_reason: executionResult.failureReason || 'Transaction execution failed',
          tx_hash: executionResult.txHash || null,
          user_op_hash: executionResult.userOpHash || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payment.id)
        .select()
        .single();

      return NextResponse.json(
        {
          success: false,
          error: executionResult.failureReason || 'Payment failed',
          code: executionResult.errorCode || 'TRANSACTION_FAILED',
          payment: failedPayment,
        },
        { status: 502 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal payment error';
    return NextResponse.json(
      { error: msg, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
