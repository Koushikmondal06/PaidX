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

/**
 * Returns the configured HCS Topic ID for PaidX Agent Payment Audits.
 * If not configured in HEDERA_HCS_TOPIC_ID, creates a new public audit topic on Hedera Testnet.
 */
export async function getOrCreateAuditTopicId(): Promise<string> {
  if (cachedTopicId) return cachedTopicId;

  const envTopicId = process.env.HEDERA_HCS_TOPIC_ID;
  if (envTopicId && envTopicId.trim().startsWith('0.0.')) {
    cachedTopicId = envTopicId.trim();
    return cachedTopicId;
  }

  // Auto-create PaidX Agent Payment Audit Topic on Hedera Testnet
  const client = getHederaClient();
  console.log('[HCS] Creating dedicated PaidX Agent Payment Audit Topic on Hedera Testnet...');

  try {
    const tx = new TopicCreateTransaction()
      .setTopicMemo('PaidX Agent Payment Audit Trail')
      .freezeWith(client);

    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    if (!receipt.topicId) {
      throw new Error('Failed to retrieve topicId from receipt');
    }

    cachedTopicId = receipt.topicId.toString();
    console.log(`[HCS] Successfully created PaidX Audit Topic ID: ${cachedTopicId}`);
    return cachedTopicId;
  } catch (err) {
    console.warn('[HCS] Failed to create HCS topic on-chain, using fallback:', err);
    // Fallback topic if client is in read-only / unauthenticated mode
    return '0.0.5449200';
  }
}

/**
 * Publishes an immutable payment event to the Hedera Consensus Service (HCS).
 * Never fails or rolls back an already confirmed on-chain payment.
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
  const topicIdStr = await getOrCreateAuditTopicId();

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

    // Record event into Supabase hcs_audit_events table
    try {
      const supabase = createServerSupabaseClient();
      await supabase.from('hcs_audit_events').insert({
        payment_id: paymentId || null,
        topic_id: topicIdStr,
        sequence_number: sequenceNumber || 1,
        event_type: event.event,
        payload: event as any,
      });
    } catch (dbErr) {
      console.warn('[HCS] Failed to mirror event to Supabase database:', dbErr);
    }

    console.log(`[HCS] Audit event published: topic ${topicIdStr}, sequence #${sequenceNumber}`);

    return {
      success: true,
      topicId: topicIdStr,
      sequenceNumber,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown HCS error';
    console.warn(`[HCS] Warning: could not publish message to topic ${topicIdStr}:`, msg);

    // Record fallback audit entry in DB anyway
    try {
      const supabase = createServerSupabaseClient();
      await supabase.from('hcs_audit_events').insert({
        payment_id: paymentId || null,
        topic_id: topicIdStr,
        sequence_number: 0,
        event_type: event.event,
        payload: { ...event, publish_warning: msg } as any,
      });
    } catch {
      // Non-blocking
    }

    return {
      success: false,
      topicId: topicIdStr,
      error: msg,
    };
  }
}
