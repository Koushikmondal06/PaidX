import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { computeCardUidHash } from '@/lib/server/cardHash';
import { executeDelegationRedemption } from '@/lib/server/paymentExecutor';
import { CHAIN_ID, PAYMENT_TOKEN_ADDRESS } from '@/lib/base';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Merchant
    const merchantIdHeader = req.headers.get('x-merchant-id');
    const authHeader = req.headers.get('authorization');
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

    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      req.headers.get('x-idempotency-key') ||
      clientSaleId ||
      bodyIdempotencyKey ||
      `pos-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const rawCardUid = bodyRawCardUid || bodyCardUid;

    const supabase = createServerSupabaseClient();

    // Check if idempotency key already processed
    const { data: existingPayment } = await supabase
      .from('payments')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingPayment) {
      // Idempotent return of existing payment record
      return NextResponse.json({
        success: existingPayment.status === 'confirmed',
        txHash: existingPayment.tx_hash || null,
        explorerUrl: existingPayment.tx_hash ? `https://sepolia.etherscan.io/tx/${existingPayment.tx_hash}` : null,
        payment: existingPayment,
        isIdempotentReplay: true,
      });
    }

    const targetMerchantId = merchantIdHeader || bodyMerchantId;
    if (!targetMerchantId) {
      return NextResponse.json(
        { error: 'Merchant ID is required', code: 'MERCHANT_NOT_FOUND' },
        { status: 400 }
      );
    }

    // Verify merchant in DB
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('*')
      .eq('id', targetMerchantId)
      .single();

    if (merchantError || !merchant) {
      return NextResponse.json(
        { error: 'Merchant not found', code: 'MERCHANT_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!merchant.is_active) {
      return NextResponse.json(
        { error: 'Merchant account is inactive or suspended', code: 'MERCHANT_INACTIVE' },
        { status: 403 }
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
        { error: 'No active spending permission found for cardholder', code: 'PERMISSION_NOT_FOUND' },
        { status: 404 }
      );
    }

    // Check validity timestamps
    const now = new Date();
    const validAfter = new Date(permission.valid_after);
    const validUntil = new Date(permission.valid_until);

    if (now < validAfter || now > validUntil) {
      return NextResponse.json(
        { error: 'Spending permission has expired', code: 'PERMISSION_EXPIRED' },
        { status: 403 }
      );
    }

    // Check period limit
    let requestedAmount: bigint;
    try {
      if (typeof amountStr === 'string' && amountStr.includes('.')) {
        // Parse decimal as USDC (6 decimals)
        const [whole, frac = ''] = amountStr.split('.');
        const paddedFrac = frac.padEnd(6, '0').slice(0, 6);
        requestedAmount = BigInt(whole) * 1_000_000n + BigInt(paddedFrac);
      } else {
        requestedAmount = BigInt(amountStr || '0');
      }
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

    const remainingInPeriod = BigInt(permission.remaining_in_period || '0');
    if (requestedAmount > remainingInPeriod) {
      return NextResponse.json(
        {
          error: 'Transaction amount exceeds available period limit',
          code: 'LIMIT_EXCEEDED',
          remaining: remainingInPeriod.toString(),
          requested: requestedAmount.toString(),
        },
        { status: 422 }
      );
    }

    // 4. Insert Payment record with status 'created'
    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        idempotency_key: idempotencyKey,
        merchant_id: merchant.id,
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

    // 5. Redeem Delegation on-chain using session account
    // Update to 'submitted'
    await supabase
      .from('payments')
      .update({ status: 'submitted' })
      .eq('id', payment.id);

    const executionResult = await executeDelegationRedemption({
      tokenAddress: payment.token_address,
      recipientAddress: merchant.payout_address,
      amount: requestedAmount,
      grantPayload: permission.grant_payload,
    });

    if (executionResult.success) {
      // 6. Confirmed only after real receipt verified
      const newRemaining = (remainingInPeriod - requestedAmount).toString();

      await supabase
        .from('permissions')
        .update({
          remaining_in_period: newRemaining,
          updated_at: new Date().toISOString(),
        })
        .eq('id', permission.id);

      const { data: confirmedPayment } = await supabase
        .from('payments')
        .update({
          status: 'confirmed',
          tx_hash: executionResult.txHash || null,
          user_op_hash: executionResult.userOpHash || null,
          block_number: executionResult.blockNumber || null,
          updated_at: new Date().toISOString(),
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
      // 7. Failed with clear reason from real receipt/error
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

