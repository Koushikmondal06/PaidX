import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isValidHederaAccountId } from '../hedera/client';
import { getHtsAssetConfig, toAtomicUnits, fromAtomicUnits } from '../hedera/hts';
import { createRecipientPaymentRequirements } from '../hedera/x402/requirements';
import { signRecipientPayment } from '../hedera/signer';
import { settlePaymentPayload } from '../hedera/x402/facilitator';
import { publishHcsPaymentEvent } from '../hedera/hcs';
import {
  evaluateAndReserveBudget,
  commitSettledReservation,
  releaseFailedReservation,
  type AgentContext,
} from './policyEngine';

export interface ExecutePaymentInput {
  recipient: string;
  amount: string | number;
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
  status: 'confirmed' | 'failed' | 'approval_required';
  error?: string;
  requiresHumanApproval?: boolean;
}

/**
 * Executes a recipient-directed payment from conversational instruction
 */
export async function orchestrateAgentPayment(
  agentContext: AgentContext,
  input: ExecutePaymentInput
): Promise<ExecutePaymentOutput> {
  const recipient = input.recipient?.trim();
  const rawAmount = input.amount;
  const assetSymbol = (input.asset || 'USDC').trim().toUpperCase();
  const network = input.network || 'hedera:testnet';
  const idempotencyKey =
    input.idempotencyKey ||
    input.paymentReference ||
    `paidx-${agentContext.agentId}-${Date.now()}`;

  // 1. Validate Recipient Address
  if (!recipient || !isValidHederaAccountId(recipient)) {
    return {
      success: false,
      status: 'failed',
      recipient: recipient || '',
      amount: rawAmount?.toString() || '0',
      amountDisplay: `${rawAmount} ${assetSymbol}`,
      asset: assetSymbol,
      network,
      error: `Invalid Hedera recipient address: "${recipient}". Expected format: "0.0.123456"`,
    };
  }

  // 2. Validate Amount
  const numAmount = parseFloat(rawAmount?.toString() || '0');
  if (isNaN(numAmount) || numAmount <= 0) {
    return {
      success: false,
      status: 'failed',
      recipient,
      amount: '0',
      amountDisplay: `0 ${assetSymbol}`,
      asset: assetSymbol,
      network,
      error: `Payment amount must be greater than zero. Received: "${rawAmount}"`,
    };
  }

  const tokenConfig = getHtsAssetConfig(assetSymbol);
  const atomicAmount = toAtomicUnits(rawAmount, tokenConfig.decimals);
  const amountDisplay = `${fromAtomicUnits(atomicAmount, tokenConfig.decimals)} ${tokenConfig.symbol}`;

  const supabase = createServerSupabaseClient();

  // 3. Idempotency Check
  const { data: existingPayment } = await supabase
    .from('agent_payments')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingPayment) {
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

  // 4. Policy Check & Budget Reservation
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

  // 5. Generate Recipient-Directed x402 Payment Requirements
  const { requirements } = createRecipientPaymentRequirements({
    recipient,
    amount: rawAmount,
    assetSymbolOrId: tokenConfig.tokenId,
    network,
    paymentReference: idempotencyKey,
  });

  // 6. Insert Initial Payment Record
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
      status: 'submitting',
      idempotency_key: idempotencyKey,
    })
    .select()
    .single();

  const paymentId = paymentRecord?.id;

  try {
    // 7. Sign Payment Transaction using Authorized Connected Wallet
    const { transactionBytesBase64, transactionId } = await signRecipientPayment({
      payerAccountId: agentContext.walletAddress,
      recipientAccountId: recipient,
      assetId: tokenConfig.tokenId,
      atomicAmount,
      feePayerAccountId: requirements.extra?.feePayer,
    });

    // 8. Facilitator Verification & Settlement
    const settleResult = await settlePaymentPayload(
      {
        scheme: requirements.scheme,
        network: requirements.network,
        transactionBytes: transactionBytesBase64,
        clientSaleId: idempotencyKey,
      },
      requirements
    );

    if (!settleResult.success || !settleResult.transactionId) {
      throw new Error(settleResult.error || 'Facilitator settlement failed');
    }

    const finalTxId = settleResult.transactionId;
    const finalHashScanUrl = settleResult.hashScanUrl;

    // 9. Commit Budget Reservation
    await commitSettledReservation({
      agentId: agentContext.agentId,
      reservationId,
      atomicAmount,
    });

    // 10. Publish Hedera Consensus Service (HCS) Immutable Audit Event
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

    // 11. Update Confirmed Payment Record
    if (paymentId) {
      await supabase
        .from('agent_payments')
        .update({
          status: 'confirmed',
          tx_id: finalTxId,
          hashscan_url: finalHashScanUrl,
          hcs_topic_id: hcsResult.topicId,
          hcs_sequence_number: hcsResult.sequenceNumber || null,
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

    // Release Budget Reservation
    await releaseFailedReservation(reservationId);

    // Update Failed Payment Record
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
