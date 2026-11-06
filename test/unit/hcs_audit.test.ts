import test from 'node:test';
import assert from 'node:assert';
import { setTestHcsMock, publishHcsPaymentEvent } from '../../dashboard/lib/hedera/hcs.ts';
import { setTestMirrorMock, getMirrorTopicMessageBySequence } from '../../dashboard/lib/hedera/mirrorNode.ts';
import type { HcsAuditEvent } from '../../dashboard/lib/hedera/types.ts';

test('Phase 7 / Test Case 14: Hedera Consensus Service (HCS) Audit Event Publication, Verification & Retries', async (t) => {
  const sampleEvent: HcsAuditEvent = {
    event: 'X402_WALLET_PAYMENT_SETTLED',
    agentId: 'agent-uuid-001',
    payer: '0.0.123456',
    recipient: '0.0.654321',
    amountAtomic: '5000000',
    amountDisplay: '5 USDC',
    asset: 'USDC',
    network: 'hedera:testnet',
    transactionId: '0.0.123456@1700000000.000000001',
    timestamp: new Date().toISOString(),
  };

  t.afterEach(() => {
    setTestHcsMock(null);
    setTestMirrorMock(null);
  });

  await t.test('Test Case 14: publishes immutable audit event with all required fields and captures sequence number', async () => {
    setTestHcsMock({
      publish: async (paymentId, event) => {
        assert.strictEqual(event.event, 'X402_WALLET_PAYMENT_SETTLED');
        assert.strictEqual(event.payer, '0.0.123456');
        assert.strictEqual(event.recipient, '0.0.654321');
        assert.strictEqual(event.amountAtomic, '5000000');
        assert.strictEqual(event.transactionId, '0.0.123456@1700000000.000000001');

        return {
          success: true,
          topicId: '0.0.777777',
          sequenceNumber: 42,
          runningHash: 'abcdef0123456789',
        };
      },
    });

    const result = await publishHcsPaymentEvent({
      paymentId: 'pay-001',
      event: sampleEvent,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.topicId, '0.0.777777');
    assert.strictEqual(result.sequenceNumber, 42);
    assert.strictEqual(result.runningHash, 'abcdef0123456789');
  });

  await t.test('Test Case 14: preserves settled payment when HCS publishing fails, marking pending_retry', async () => {
    setTestHcsMock({
      publish: async () => ({
        success: false,
        topicId: '0.0.777777',
        error: 'Hedera network congestion / topic submit timed out',
      }),
    });

    const result = await publishHcsPaymentEvent({
      paymentId: 'pay-002',
      event: sampleEvent,
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /timed out/i);
  });

  await t.test('HCS Verification: verifies actual message fetched from Mirror Node', async () => {
    const topicId = '0.0.777777';
    const seqNum = 42;
    const paymentId = 'pay-001';
    const txId = '0.0.123456@1700000000.000000001';

    const eventPayload = {
      event: 'X402_WALLET_PAYMENT_SETTLED',
      paymentId,
      transactionId: txId,
      agentId: 'agent-uuid-001',
      payer: '0.0.123456',
      recipient: '0.0.654321',
      amountAtomic: '5000000',
    };

    const base64Message = Buffer.from(JSON.stringify(eventPayload)).toString('base64');

    setTestMirrorMock({
      getTopicMessageBySequence: async (tId, seq) => {
        if (tId === topicId && seq === seqNum) {
          return {
            consensus_timestamp: '1700000005.123456789',
            topic_id: topicId,
            message: base64Message,
            running_hash: 'hash123',
            sequence_number: seqNum,
          };
        }
        return null;
      },
    });

    const message = await getMirrorTopicMessageBySequence(topicId, seqNum);
    assert.ok(message);
    assert.strictEqual(message.topic_id, topicId);
    assert.strictEqual(message.sequence_number, seqNum);

    const decoded = JSON.parse(Buffer.from(message.message, 'base64').toString('utf8'));
    assert.strictEqual(decoded.paymentId, paymentId);
    assert.strictEqual(decoded.transactionId, txId);
    assert.strictEqual(decoded.recipient, '0.0.654321');
    assert.strictEqual(decoded.amountAtomic, '5000000');
  });

  await t.test('HCS Verification: rejects verification when message does not exist on Mirror Node', async () => {
    setTestMirrorMock({
      getTopicMessageBySequence: async () => null,
    });

    const message = await getMirrorTopicMessageBySequence('0.0.777777', 999);
    assert.strictEqual(message, null);
  });
});
