import 'server-only';
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
} from '@hiero-ledger/sdk';
import { getHederaClient } from './client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { HcsAuditEvent } from './types';

let cachedTopicId: string | null = null;

// Test mock hook for unit testing
let testHcsMock: {
  publish?: (paymentId: string | undefined, event: HcsAuditEvent) => Promise<{
    success: boolean;
    topicId: string;
    sequenceNumber?: number;
    runningHash?: string;
    error?: string;
  }>;
} | null = null;

export function setTestHcsMock(mock: typeof testHcsMock) {
  testHcsMock = mock;
}

/**
 * Returns the configured HCS Topic ID for PaidX Agent Payment Audits.
 * Fails closed if not configured and cannot be created. Never substitutes a fake fallback topic.
 */
export async function getOrCreateAuditTopicId(): Promise<string> {
  if (cachedTopicId) return cachedTopicId;

  const envTopicId = process.env.HEDERA_HCS_TOPIC_ID;
  if (envTopicId && envTopicId.trim().startsWith('0.0.')) {
    cachedTopicId = envTopicId.trim();
    return cachedTopicId;
  }

  // Attempt creation if operator credentials are provided
  if (process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY) {
    try {
      const client = getHederaClient();
      const tx = new TopicCreateTransaction()
        .setTopicMemo('PaidX Agent Payment Audit Trail')
        .freezeWith(client);

      const txResponse = await tx.execute(client);
      const receipt = await txResponse.getReceipt(client);

      if (receipt.topicId) {
        cachedTopicId = receipt.topicId.toString();
        return cachedTopicId;
      }
    } catch (err) {
      console.warn('[HCS] Failed to create topic on Hedera Testnet:', err);
    }
  }

  throw new Error(
    '[HCS Audit Error] HEDERA_HCS_TOPIC_ID is not configured. Audit publication requires a valid Hedera topic.'
  );
}

/**
 * Publishes an immutable payment event to the Hedera Consensus Service (HCS).
 * Fails gracefully: If publication fails, payment settlement remains preserved,
 * and the audit status is marked as 'pending_retry'.
 */
export async function publishHcsPaymentEvent({
  paymentId,
  event,
}: {
  paymentId?: string;
  event: HcsAuditEvent;
}): Promise<{
  success: boolean;
  topicId: string;
  sequenceNumber?: number;
  runningHash?: string;
  error?: string;
}> {
  if (testHcsMock?.publish) {
    return testHcsMock.publish(paymentId, event);
  }

  let topicIdStr = '';
  try {
    topicIdStr = await getOrCreateAuditTopicId();
  } catch (topicErr: unknown) {
    const errorMsg = topicErr instanceof Error ? topicErr.message : 'Missing HCS Topic';

    // Mark as pending retry in database
    if (paymentId) {
      const supabase = createServerSupabaseClient();
      await supabase
        .from('agent_payments')
        .update({
          hcs_status: 'pending_retry',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
    }

    return {
      success: false,
      topicId: '',
      error: errorMsg,
    };
  }

  try {
    const client = getHederaClient();
    const payloadJson = JSON.stringify(event);

    const tx = new TopicMessageSubmitTransaction()
      .setTopicId(TopicId.fromString(topicIdStr))
      .setMessage(payloadJson);

    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    const sequenceNumber = receipt.topicSequenceNumber
      ? Number(receipt.topicSequenceNumber.toString())
      : undefined;

    const runningHash = receipt.topicRunningHash
      ? Buffer.from(receipt.topicRunningHash).toString('hex')
      : undefined;

    // Record verified event into Supabase hcs_audit_events table
    const supabase = createServerSupabaseClient();
    await supabase.from('hcs_audit_events').insert({
      payment_id: paymentId || null,
      topic_id: topicIdStr,
      sequence_number: sequenceNumber || 1,
      event_type: event.event,
      payload: event as any,
      running_hash: runningHash,
    });

    // Update payment record to published
    if (paymentId) {
      await supabase
        .from('agent_payments')
        .update({
          hcs_topic_id: topicIdStr,
          hcs_sequence_number: sequenceNumber || null,
          hcs_status: 'published',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
    }

    return {
      success: true,
      topicId: topicIdStr,
      sequenceNumber,
      runningHash,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'HCS submit failed';
    console.warn(`[HCS] Failed to submit message to topic ${topicIdStr}:`, msg);

    // Mark as pending retry in database so payment is preserved
    if (paymentId) {
      const supabase = createServerSupabaseClient();
      await supabase
        .from('agent_payments')
        .update({
          hcs_status: 'pending_retry',
          updated_at: new Date().toISOString(),
        })
        .eq('id', paymentId);
    }

    return {
      success: false,
      topicId: topicIdStr,
      error: msg,
    };
  }
}
