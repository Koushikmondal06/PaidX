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
import {
  checkFacilitatorCapabilities,
  verifyPaymentPayload,
  settlePaymentPayload,
} from '../hedera/x402/facilitator';
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
  existingPaymentId?: string; // Passed when executing an already approved payment record
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
    | 'approval_required'
    | 'approved';
  error?: string;
  requiresHumanApproval?: boolean;
  normalizedAmountUsdMicro?: string;
  priceSource?: string;
  priceUsd?: string;
  priceTimestamp?: number;
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
  const isHbar = tokenConfig.symbol.toUpperCase() === 'HBAR' || tokenConfig.tokenId === '0.0.0';

  const supabase = createServerSupabaseClient();

  // 4. Idempotency Check & Conflict Detection
  // (Skip conflict check if executing an existing approved record directly)
  if (!input.existingPaymentId) {
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
  }

  // 5. Policy Check & Atomic Budget Reservation
  let reservationId: string | undefined;
  let policyCheckDetails: {
    normalizedAmountUsdMicro?: string;
    priceSource?: string;
    priceUsd?: string;
    priceTimestamp?: number;
  } = {};

  if (input.existingPaymentId) {
    // Audit Requirement: Strict Approval Binding & State Verification
    const { data: approvedPayment, error: findError } = await supabase
      .from('agent_payments')
      .select('*')
      .eq('id', input.existingPaymentId)
      .maybeSingle();

    if (findError || !approvedPayment) {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `Approval record "${input.existingPaymentId}" not found.`,
      };
    }

    // 1. Agent ID binding
    if (approvedPayment.agent_id !== agentContext.agentId) {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `APPROVAL_BINDING_MISMATCH: Agent ID "${agentContext.agentId}" does not match approved payment agent "${approvedPayment.agent_id}".`,
      };
    }

    // 2. Recipient binding
    if (approvedPayment.recipient !== recipient) {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `APPROVAL_BINDING_MISMATCH: Recipient "${recipient}" does not match approved payment recipient "${approvedPayment.recipient}".`,
      };
    }

    // 3. Asset binding
    if (approvedPayment.asset.toUpperCase() !== tokenConfig.symbol.toUpperCase()) {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `APPROVAL_BINDING_MISMATCH: Asset "${tokenConfig.symbol}" does not match approved payment asset "${approvedPayment.asset}".`,
      };
    }

    // 4. Amount binding
    if (approvedPayment.amount_atomic !== atomicAmount) {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `APPROVAL_BINDING_MISMATCH: Atomic amount "${atomicAmount}" does not match approved payment amount "${approvedPayment.amount_atomic}".`,
      };
    }

    // 5. Network binding
    if (approvedPayment.network.toLowerCase() !== network.toLowerCase()) {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `APPROVAL_BINDING_MISMATCH: Network "${network}" does not match approved payment network "${approvedPayment.network}".`,
      };
    }

    // 6. Replay & Status Check
    if (approvedPayment.status === 'confirmed' || approvedPayment.status === 'settled') {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: 'ALREADY_SETTLED: Approved payment has already been executed and settled on-chain. Replay is forbidden.',
      };
    }

    if (approvedPayment.status === 'submitting' || approvedPayment.status === 'signing' || approvedPayment.status === 'submitted') {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: 'CONCURRENT_EXECUTION: Payment is already in-flight or being processed (409 Conflict).',
      };
    }

    if (approvedPayment.status !== 'approved') {
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `APPROVAL_STATUS_INVALID: Payment status is "${approvedPayment.status}". Expected "approved".`,
      };
    }

    // 7. Price Quote Expiry Check (reject if quote is older than 300 seconds)
    if (approvedPayment.price_timestamp) {
      const quoteAgeMs = Date.now() - new Date(approvedPayment.price_timestamp).getTime();
      const MAX_APPROVAL_QUOTE_AGE_MS = 300 * 1000;
      if (quoteAgeMs > MAX_APPROVAL_QUOTE_AGE_MS) {
        const ageSec = Math.round(quoteAgeMs / 1000);
        return {
          success: false,
          status: 'failed',
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          error: `PRICE_QUOTE_EXPIRED: Exchange rate quote expired while awaiting approval (age ${ageSec}s > 300s). For financial safety, a fresh quote and approval are required.`,
        };
      }
    }

    // 8. Reservation Verification & Binding
    if (approvedPayment.reservation_id) {
      const { data: resRow } = await supabase
        .from('agent_spending_reservations')
        .select('*')
        .eq('id', approvedPayment.reservation_id)
        .eq('agent_id', agentContext.agentId)
        .maybeSingle();

      if (!resRow) {
        return {
          success: false,
          status: 'failed',
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          error: `RESERVATION_NOT_FOUND: Spending reservation "${approvedPayment.reservation_id}" does not exist.`,
        };
      }

      if (resRow.status === 'released') {
        return {
          success: false,
          status: 'failed',
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          error: 'RESERVATION_RELEASED: Spending reservation was previously released. Execution is forbidden.',
        };
      }

      if (resRow.status === 'settled') {
        return {
          success: false,
          status: 'failed',
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          error: 'RESERVATION_ALREADY_SETTLED: Spending reservation was already settled. Replay is forbidden.',
        };
      }

      if (resRow.status !== 'reserved' || (resRow.expires_at && new Date(resRow.expires_at).getTime() <= Date.now())) {
        return {
          success: false,
          status: 'failed',
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          error: 'RESERVATION_EXPIRED: Spending reservation has expired. A new reservation is required.',
        };
      }

      reservationId = resRow.id;
    } else {
      // If approved payment record had no pre-existing reservation, reserve budget atomically now
      const policyResult = await evaluateAndReserveBudget({
        agentId: agentContext.agentId,
        atomicAmount,
        assetSymbol: tokenConfig.symbol,
        network,
        recipient,
        idempotencyKey: `approved-exec-${approvedPayment.id}`,
        normalizedAmountUsdMicro: approvedPayment.amount_usd_micro || undefined,
      });

      if (!policyResult.allowed) {
        return {
          success: false,
          status: 'failed',
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          error: `Budget reservation failed for approved payment: ${policyResult.reason || 'Limits exceeded'}`,
        };
      }

      reservationId = policyResult.reservationId;
    }

    policyCheckDetails = {
      normalizedAmountUsdMicro: approvedPayment.amount_usd_micro || undefined,
      priceSource: approvedPayment.price_source || undefined,
      priceUsd: approvedPayment.price_usd || undefined,
      priceTimestamp: approvedPayment.price_timestamp
        ? new Date(approvedPayment.price_timestamp).getTime()
        : undefined,
    };

    // 9. Atomic CAS (Compare-And-Swap) to claim execution and reject simultaneous concurrent executions
    const { data: claimedPayment, error: claimError } = await supabase
      .from('agent_payments')
      .update({ status: 'submitting', updated_at: new Date().toISOString() })
      .eq('id', input.existingPaymentId)
      .eq('status', 'approved')
      .select()
      .maybeSingle();

    if (claimError || !claimedPayment) {
      if (reservationId && !approvedPayment.reservation_id) {
        await releaseFailedReservation(reservationId, 'Concurrent execution conflict');
      }
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: 'CONCURRENT_EXECUTION: Payment is already in-flight or being processed (409 Conflict).',
      };
    }
  } else {
    const policyResult = await evaluateAndReserveBudget({
      agentId: agentContext.agentId,
      atomicAmount,
      assetSymbol: tokenConfig.symbol,
      network,
      recipient,
      idempotencyKey,
    });

    policyCheckDetails = {
      normalizedAmountUsdMicro: policyResult.normalizedAmountUsdMicro,
      priceSource: policyResult.priceSource,
      priceUsd: policyResult.priceUsd,
      priceTimestamp: policyResult.priceTimestamp,
    };

    if (!policyResult.allowed) {
      // If human approval is required, record payment in approval_required state
      if (policyResult.requiresHumanApproval) {
        const { data: approvalRecord } = await supabase
          .from('agent_payments')
          .insert({
            agent_id: agentContext.agentId,
            user_id: agentContext.userId,
            wallet_id: agentContext.walletId,
            recipient,
            amount_atomic: atomicAmount,
            amount_display: amountDisplay,
            asset: tokenConfig.symbol,
            asset_id: tokenConfig.tokenId,
            network,
            payment_scheme: 'exact',
            status: 'approval_required',
            failure_reason: policyResult.reason || 'Payment requires human approval',
            idempotency_key: idempotencyKey,
            amount_usd_micro: policyResult.normalizedAmountUsdMicro || null,
            price_source: policyResult.priceSource || null,
            price_usd: policyResult.priceUsd || null,
            price_timestamp: policyResult.priceTimestamp
              ? new Date(policyResult.priceTimestamp).toISOString()
              : null,
          })
          .select()
          .maybeSingle();

        return {
          success: false,
          status: 'approval_required',
          paymentId: approvalRecord?.id,
          recipient,
          amount: atomicAmount,
          amountDisplay,
          asset: tokenConfig.symbol,
          network,
          requiresHumanApproval: true,
          error: policyResult.reason || 'Payment declined by spending policy: Human approval required',
          normalizedAmountUsdMicro: policyResult.normalizedAmountUsdMicro,
          priceSource: policyResult.priceSource,
          priceUsd: policyResult.priceUsd,
          priceTimestamp: policyResult.priceTimestamp,
        };
      }

      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        requiresHumanApproval: false,
        error: policyResult.reason || 'Payment declined by spending policy',
        normalizedAmountUsdMicro: policyResult.normalizedAmountUsdMicro,
        priceSource: policyResult.priceSource,
        priceUsd: policyResult.priceUsd,
        priceTimestamp: policyResult.priceTimestamp,
      };
    }

    reservationId = policyResult.reservationId;
  }

  // 6. Verify Facilitator Capabilities (Fail closed if unavailable or unsupported)
  let advertisedFeePayer: string | undefined;
  try {
    const caps = await checkFacilitatorCapabilities(undefined, {
      network,
      scheme: 'exact',
      asset: tokenConfig.tokenId,
    });
    advertisedFeePayer = caps.feePayerAccount;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Facilitator capabilities check failed';
    if (reservationId) {
      await releaseFailedReservation(reservationId, msg);
    }
    return {
      success: false,
      status: 'failed',
      recipient,
      amount: atomicAmount,
      amountDisplay,
      asset: tokenConfig.symbol,
      network,
      error: `Facilitator check failed: ${msg}. Payment aborted.`,
    };
  }

  // 7. Generate Recipient-Directed x402 Payment Requirements
  const { requirements } = createRecipientPaymentRequirements({
    recipient,
    amount: rawAmount,
    assetSymbolOrId: tokenConfig.tokenId,
    network,
    facilitatorFeePayer: advertisedFeePayer,
    paymentReference: idempotencyKey,
  });

  // 8. Payment Persistence: Check initial agent_payments insert error
  let paymentId: string;

  if (input.existingPaymentId) {
    paymentId = input.existingPaymentId;
  } else {
    const { data: paymentRecord, error: insertError } = await supabase
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
        amount_usd_micro: policyCheckDetails.normalizedAmountUsdMicro || null,
        price_source: policyCheckDetails.priceSource || null,
        price_usd: policyCheckDetails.priceUsd || null,
        price_timestamp: policyCheckDetails.priceTimestamp
          ? new Date(policyCheckDetails.priceTimestamp).toISOString()
          : null,
      })
      .select()
      .single();

    if (insertError || !paymentRecord?.id) {
      // NEVER sign or broadcast if payment persistence fails!
      if (reservationId) {
        await releaseFailedReservation(
          reservationId,
          `Payment persistence failed: ${insertError?.message || 'Database error'}`
        );
      }
      return {
        success: false,
        status: 'failed',
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        error: `Database error: Failed to persist initial payment record (${insertError?.message || 'Unknown'}). Transaction aborted before signing.`,
      };
    }

    paymentId = paymentRecord.id;
  }

  let transactionId = '';

  try {
    // 9. Sign Payment Transaction using Authorized Connected Wallet
    await supabase
      .from('agent_payments')
      .update({ status: 'signing', updated_at: new Date().toISOString() })
      .eq('id', paymentId);

    const signResult = await signRecipientPayment({
      payerAccountId: agentContext.walletAddress,
      recipientAccountId: recipient,
      assetId: tokenConfig.tokenId,
      atomicAmount,
      feePayerAccountId: requirements.extra?.feePayer,
    });

    transactionId = signResult.transactionId;

    const paymentPayload = {
      scheme: requirements.scheme,
      network: requirements.network,
      transactionBytes: signResult.transactionBytesBase64,
      clientSaleId: idempotencyKey,
    };

    // 10. Facilitator Verification (Verify-Then-Settle)
    // Requires facilitator response to contain valid === true
    const verifyResult = await verifyPaymentPayload(paymentPayload, requirements);
    if (!verifyResult.valid) {
      throw new Error(`x402 Verification failed: ${verifyResult.error || 'Payment payload is invalid'}`);
    }

    // 11. Facilitator Settlement
    await supabase
      .from('agent_payments')
      .update({
        status: 'submitted',
        tx_id: transactionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    const settleResult = await settlePaymentPayload(paymentPayload, requirements);

    if (!settleResult.success || !settleResult.transactionId) {
      const errStr = (settleResult.error || '').toLowerCase();
      const isUncertain =
        errStr.includes('timeout') ||
        errStr.includes('network error') ||
        errStr.includes('unreachable') ||
        errStr.includes('connection');

      if (isUncertain) {
        // PRESERVE UNCERTAIN STATE: Never release a reservation while settlement is uncertain!
        await supabase
          .from('agent_payments')
          .update({
            status: 'uncertain',
            failure_reason: settleResult.error,
            updated_at: new Date().toISOString(),
          })
          .eq('id', paymentId);

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

    // 12. Independent Mirror Node Consensus Verification
    // Require Mirror Node transaction lookup to return a transaction
    const mirrorTx = await pollTransactionConsensus(finalTxId, 6, 1200);
    if (!mirrorTx) {
      // Transaction not yet indexed: preserve uncertain state
      await supabase
        .from('agent_payments')
        .update({
          status: 'uncertain',
          failure_reason: 'Mirror Node consensus polling timed out before transaction appeared.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      return {
        success: false,
        paymentId,
        transactionId: finalTxId,
        hashScanUrl: finalHashScanUrl,
        recipient,
        amount: atomicAmount,
        amountDisplay,
        asset: tokenConfig.symbol,
        network,
        status: 'uncertain',
        error: 'Mirror Node consensus pending: Transaction not yet indexed. Reservation preserved.',
      };
    }

    // Require result === SUCCESS
    if (mirrorTx.result !== 'SUCCESS') {
      throw new Error(`Mirror Node consensus failed: Transaction result is "${mirrorTx.result}"`);
    }

    // Verify actual token transfer or HBAR transfer: payer, recipient, asset, exact atomic amount
    if (isHbar) {
      const recTransfer = mirrorTx.transfers?.find((t) => t.account === recipient);
      if (!recTransfer || BigInt(recTransfer.amount) !== atomicAmountBig) {
        throw new Error(
          `Mirror Node verification failed: Recipient "${recipient}" did not receive exact atomic amount (${atomicAmountBig.toString()}). Received: ${recTransfer?.amount ?? 0}`
        );
      }
      const payerTransfer = mirrorTx.transfers?.find((t) => t.account === agentContext.walletAddress);
      if (!payerTransfer || BigInt(payerTransfer.amount) !== -atomicAmountBig) {
        throw new Error(
          `Mirror Node verification failed: Payer "${agentContext.walletAddress}" was not debited exact atomic amount (-${atomicAmountBig.toString()}). Debited: ${payerTransfer?.amount ?? 0}`
        );
      }
    } else {
      const recTokenTransfer = mirrorTx.token_transfers?.find(
        (t) => t.token_id === tokenConfig.tokenId && t.account === recipient
      );
      if (!recTokenTransfer || BigInt(recTokenTransfer.amount) !== atomicAmountBig) {
        throw new Error(
          `Mirror Node verification failed: Recipient "${recipient}" did not receive exact token amount (${atomicAmountBig.toString()} of ${tokenConfig.tokenId}). Received: ${recTokenTransfer?.amount ?? 0}`
        );
      }
      const payerTokenTransfer = mirrorTx.token_transfers?.find(
        (t) => t.token_id === tokenConfig.tokenId && t.account === agentContext.walletAddress
      );
      if (!payerTokenTransfer || BigInt(payerTokenTransfer.amount) !== -atomicAmountBig) {
        throw new Error(
          `Mirror Node verification failed: Payer "${agentContext.walletAddress}" was not debited exact token amount (-${atomicAmountBig.toString()} of ${tokenConfig.tokenId}). Debited: ${payerTokenTransfer?.amount ?? 0}`
        );
      }
    }

    // 13. Commit Budget Reservation ONLY AFTER independent confirmation
    if (reservationId) {
      await commitSettledReservation({
        agentId: agentContext.agentId,
        reservationId,
        atomicAmount,
      });
    }

    // 14. Publish Hedera Consensus Service (HCS) Audit Event
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

    // 15. Update Confirmed Payment Record
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
      normalizedAmountUsdMicro: policyCheckDetails.normalizedAmountUsdMicro,
      priceSource: policyCheckDetails.priceSource,
      priceUsd: policyCheckDetails.priceUsd,
      priceTimestamp: policyCheckDetails.priceTimestamp,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Payment execution failed';
    console.error('[Orchestrator Execution Error]:', err);

    // Release budget reservation ONLY when failure is definitive (never when uncertain)
    if (reservationId) {
      await releaseFailedReservation(reservationId, errorMsg);
    }

    await supabase
      .from('agent_payments')
      .update({
        status: 'failed',
        failure_reason: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

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
