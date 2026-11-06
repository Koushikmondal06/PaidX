import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isValidHederaAccountId } from '../hedera/client';
import { getHtsAssetConfig, fromAtomicUnits } from '../hedera/hts';
import {
  parseToAtomicUnits,
  validateDecimalString,
} from '../hedera/decimal';
import { createRecipientPaymentRequirements } from '../hedera/x402/requirements';
import { signRecipientPayment } from '../hedera/signer';
import { verifyPaymentPayload, settlePaymentPayload } from '../hedera/x402/facilitator';
import { publishHcsPaymentEvent } from '../hedera/hcs';
import { pollTransactionConsensus, getHashScanTxUrl } from '../hedera/mirrorNode';
import {
  evaluateAndReserveBudget,
  commitSettledReservation,
  releaseFailedReservation,
  type AgentContext,
} from './policyEngine';

export interface ExecutePaymentInput {
  recipient: string;
  amount: string;
  asset?: string; // Default: 'USDC'
  network?: 'hedera:testnet' | 'hedera:mainnet';
  paymentReference?: string;
  idempotencyKey?: string;
}

export interface ExecutePaymentOutput {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  hashScanUrl?: string;
  recipient: string;
  amount: string;
  amountDisplay: string;
  asset: string;
  network: string;
  hcsTopicId?: string;
  hcsSequenceNumber?: number;
  status:
    | 'pending'
    | 'reserved'
    | 'signing'
    | 'submitted'
    | 'confirmed'
    | 'failed'
    | 'uncertain'
    | 'approval_required';
  error?: string;
  requiresHumanApproval?: boolean;
}

/**
 * Executes a recipient-directed payment from conversational instruction
 * following the exact x402 verify-then-settle specification and Mirror Node confirmation.
 */
export async function orchestrateAgentPayment(
  agentContext: AgentContext,
  input: ExecutePaymentInput
): Promise<ExecutePaymentOutput> {
  const recipient = input.recipient?.trim();
  const rawAmount = typeof input.amount === 'string' ? input.amount.trim() : String(input.amount || '');
  const assetSymbol = (input.asset || 'USDC').trim().toUpperCase();
  const network = input.network || 'hedera:testnet';

  // 1. Scoped Idempotency Key
  const intentKey = input.idempotencyKey || input.paymentReference || `intent-${Date.now()}`;
  const idempotencyKey = `${agentContext.agentId}:${intentKey}`;

  // 2. Validate Recipient Address
  if (!recipient || !isValidHederaAccountId(recipient)) {
    return {
      success: false,
      status: 'failed',
      recipient: recipient || '',
      amount: '0',
      amountDisplay: `0 ${assetSymbol}`,
      asset: assetSymbol,
      network,
      error: `Invalid Hedera recipient address: "${recipient}". Expected format: "0.0.123456"`,
    };
  }

  // 3. Resolve Asset Configuration and Decimal-Safe Amount
  let tokenConfig;
  let atomicAmountBig: bigint;
  try {
    tokenConfig = getHtsAssetConfig(assetSymbol);
    validateDecimalString(rawAmount, tokenConfig.decimals);
    atomicAmountBig = parseToAtomicUnits(rawAmount, tokenConfig.decimals);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid payment amount';
    return {
      success: false,
      status: 'failed',
      recipient,
      amount: '0',
      amountDisplay: `${rawAmount} ${assetSymbol}`,
      asset: assetSymbol,
      network,
      error: msg,
    };
  }

  const atomicAmount = atomicAmountBig.toString();
  const amountDisplay = `${fromAtomicUnits(atomicAmount, tokenConfig.decimals)} ${tokenConfig.symbol}`;

  const supabase = createServerSupabaseClient();

  // 4. Idempotency Check & Conflict Detection
  const { data: existingPayment } = await supabase
    .from('agent_payments')
    .select('*')
    .eq('agent_id', agentContext.agentId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingPayment) {
    // Check if parameters conflict
    if (
      existingPayment.recipient !== recipient ||
      existingPayment.amount_atomic !== atomicAmount ||
      existingPayment.asset.toUpperCase() !== tokenConfig.symbol.toUpperCase()
    ) {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error:
          'IDEMPOTENCY_CONFLICT: This idempotency key has already been used with different payment parameters.',
      };
    }

    return {
      success: existingPayment.status === 'confirmed',
      paymentId: existingPayment.id,
      transactionId: existingPayment.tx_id || undefined,
      hashScanUrl: existingPayment.hashscan_url || undefined,
      recipient: existingPayment.recipient,
      amount: existingPayment.amount_atomic,
      amountDisplay: existingPayment.amount_display,
      asset: existingPayment.asset,
      network: existingPayment.network,
      hcsTopicId: existingPayment.hcs_topic_id || undefined,
      hcsSequenceNumber: existingPayment.hcs_sequence_number
        ? Number(existingPayment.hcs_sequence_number)
        : undefined,
      status: existingPayment.status as any,
    };
  }

  // 5. Policy Check & Atomic Budget Reservation
  const policyResult = await evaluateAndReserveBudget({
    agentId: agentContext.agentId,
    atomicAmount,
    assetSymbol: tokenConfig.symbol,
    network,
    recipient,
    idempotencyKey,
  });

  if (!policyResult.allowed) {
    return {
      success: false,
      status: policyResult.requiresHumanApproval ? 'approval_required' : 'failed',
      recipient,
      amount: atomicAmount,
      amountDisplay,
      asset: tokenConfig.symbol,
      network,
      requiresHumanApproval: policyResult.requiresHumanApproval,
      error: policyResult.reason || 'Payment declined by spending policy',
    };
  }

  const reservationId = policyResult.reservationId;

  // 6. Generate Recipient-Directed x402 Payment Requirements
  const { requirements } = createRecipientPaymentRequirements({
    recipient,
    amount: rawAmount,
    assetSymbolOrId: tokenConfig.tokenId,
    network,
    paymentReference: idempotencyKey,
  });

  // 7. Insert Initial Payment Record with status 'reserved'
  const { data: paymentRecord } = await supabase
    .from('agent_payments')
    .insert({
      agent_id: agentContext.agentId,
      user_id: agentContext.userId,
      wallet_id: agentContext.walletId,
      reservation_id: reservationId || null,
      recipient,
      amount_atomic: atomicAmount,
      amount_display: amountDisplay,
      asset: tokenConfig.symbol,
      asset_id: tokenConfig.tokenId,
      network,
      payment_scheme: requirements.scheme,
      status: 'reserved',
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  const paymentId = paymentRecord?.id;

  try {
    // 8. Sign Payment Transaction using Authorized Connected Wallet
    if (paymentId) {
      await supabase
        .from('agent_payments')
        .update({ status: 'signing', updated_at: new Date().toISOString() })
        .eq('id', paymentId);
    }

    const { transactionBytesBase64, transactionId } = await signRecipientPayment({
      payerAccountId: agentContext.walletAddress,
      recipientAccountId: recipient,
      assetId: tokenConfig.tokenId,
      atomicAmount,
      feePayerAccountId: requirements.extra?.feePayer,
    });

    const paymentPayload = {
      scheme: requirements.scheme,
      network: requirements.network,
      transactionBytes: transactionBytesBase64,
      clientSaleId: idempotencyKey,
    };

    // 9. Facilitator Verification (Verify-Then-Settle)
    const verifyResult = await verifyPaymentPayload(paymentPayload, requirements);
    if (!verifyResult.valid) {
      throw new Error(`x402 Verification failed: ${verifyResult.error || 'Payment payload is invalid'}`);
    }

    // 10. Facilitator Settlement
    if (paymentId) {
      await supabase
        .from('agent_payments')
        .update({
          status: 'submitted',
          tx_id: transactionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
    }

    const settleResult = await settlePaymentPayload(paymentPayload, requirements);

    if (!settleResult.success || !settleResult.transactionId) {
      // Check if network error occurred during settle call
      if (settleResult.error?.includes('network error') || settleResult.error?.includes('unreachable')) {
        // Mark status as 'uncertain' so reconciliation worker can resolve it without premature release
        if (paymentId) {
          await supabase
            .from('agent_payments')
            .update({
              status: 'uncertain',
              failure_reason: settleResult.error,
              updated_at: new Date().toISOString(),
            })
            .eq('id', paymentId);
        }

        return {
          success: false,
          paymentId,
          transactionId,
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          status: 'uncertain',
          error: `Settlement outcome uncertain: ${settleResult.error}. Reservation held pending Mirror Node reconciliation.`,
        };
      }

      throw new Error(settleResult.error || 'Facilitator settlement failed');
    }

    const finalTxId = settleResult.transactionId;
    const finalHashScanUrl = settleResult.hashScanUrl || getHashScanTxUrl(finalTxId);

    // 11. Independent Mirror Node Consensus Verification
    const mirrorTx = await pollTransactionConsensus(finalTxId, 4, 1000);
    if (mirrorTx && mirrorTx.result !== 'SUCCESS') {
      throw new Error(`Mirror Node consensus failed: Transaction result is "${mirrorTx.result}"`);
    }

    // 12. Commit Budget Reservation
    await commitSettledReservation({
      agentId: agentContext.agentId,
      reservationId,
      atomicAmount,
    });

    // 13. Publish Hedera Consensus Service (HCS) Audit Event
    const hcsResult = await publishHcsPaymentEvent({
      paymentId,
      event: {
        event: 'X402_WALLET_PAYMENT_SETTLED',
        agentId: agentContext.agentId,
        payer: agentContext.walletAddress,
        recipient,
        amountAtomic: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        transactionId: finalTxId,
        timestamp: new Date().toISOString(),
      },
    });

    // 14. Update Confirmed Payment Record
    if (paymentId) {
      await supabase
        .from('agent_payments')
        .update({
          status: 'confirmed',
          tx_id: finalTxId,
          hashscan_url: finalHashScanUrl,
          hcs_topic_id: hcsResult.topicId || null,
          hcs_sequence_number: hcsResult.sequenceNumber || null,
          hcs_status: hcsResult.success ? 'published' : 'pending_retry',
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
    }

    return {
      success: true,
      paymentId,
      transactionId: finalTxId,
      hashScanUrl: finalHashScanUrl,
      recipient,
      amount: atomicAmount,
      amountDisplay,
      asset: tokenConfig.symbol,
      network,
      hcsTopicId: hcsResult.topicId,
      hcsSequenceNumber: hcsResult.sequenceNumber,
      status: 'confirmed',
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Payment execution failed';
    console.error('[Orchestrator Execution Error]:', err);

    // Release budget reservation ONLY when failure is definitive
    await releaseFailedReservation(reservationId, errorMsg);

    // Update payment record to failed
    if (paymentId) {
      await supabase
        .from('agent_payments')
        .update({
          status: 'failed',
          failure_reason: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
    }

    return {
      success: false,
      paymentId,
      recipient,
      amount: atomicAmount,
      amountDisplay,
      asset: tokenConfig.symbol,
      network,
      status: 'failed',
      error: errorMsg,
    };
  }
}
