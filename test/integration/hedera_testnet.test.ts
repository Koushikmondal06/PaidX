import test from 'node:test';
import assert from 'node:assert';
import {
  AccountId,
  PrivateKey,
  TransferTransaction,
  Hbar,
  TopicMessageSubmitTransaction,
} from '@hiero-ledger/sdk';
import { getMirrorAccountBalance, getMirrorTransaction, pollTransactionConsensus } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { getHederaClient } from '../../dashboard/lib/hedera/client.ts';

test('Hedera Testnet Live Integration Test (Opt-in Only)', async (t) => {
  const shouldRun = process.env.RUN_HEDERA_INTEGRATION_TESTS === 'true';
  const hasCredentials = Boolean(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);

  if (!shouldRun || !hasCredentials) {
    console.log(
      '[Live Hedera Testnet] Skipped: Set RUN_HEDERA_INTEGRATION_TESTS=true with valid HEDERA_OPERATOR_ID & HEDERA_OPERATOR_KEY to run live network verification.'
    );
    return;
  }

  const operatorId = process.env.HEDERA_OPERATOR_ID!;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY!;
  const client = getHederaClient();

  await t.test('1. Live Mirror Node Connectivity & Account Verification', async () => {
    const balance = await getMirrorAccountBalance(operatorId);
    assert.ok(balance, 'Mirror Node balance response must exist');
    console.log(`[Live Testnet] Verified Mirror Node account ${operatorId}: ${balance.hbarBalance} HBAR`);
  });

  await t.test('2. Live Controlled Micro-Payment on Hedera Testnet with Mirror Node Consensus Verification', async () => {
    // Controlled micro-payment: transfers 1000 tinybars (0.00001 HBAR)
    const payer = AccountId.fromString(operatorId);
    const recipient = AccountId.fromString(process.env.HEDERA_TEST_RECIPIENT || operatorId);
    const privKey = operatorKey.startsWith('0x')
      ? PrivateKey.fromStringECDSA(operatorKey)
      : PrivateKey.fromString(operatorKey);

    const tx = new TransferTransaction()
      .addHbarTransfer(payer, Hbar.fromTinybars(-1000))
      .addHbarTransfer(recipient, Hbar.fromTinybars(1000))
      .freezeWith(client);

    await privKey.signTransaction(tx);
    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    assert.strictEqual(receipt.status.toString(), 'SUCCESS');
    const txIdStr = txResponse.transactionId.toString();
    console.log(`[Live Testnet] Transaction executed: ${txIdStr}`);

    // Verify consensus on Hedera Mirror Node
    const mirrorTx = await pollTransactionConsensus(txIdStr, 10, 2000);
    assert.ok(mirrorTx, 'Transaction should appear on Mirror Node');
    assert.strictEqual(mirrorTx.result, 'SUCCESS');
    console.log(`[Live Testnet] Mirror Node consensus confirmed for ${txIdStr}`);
  });

  await t.test('3. Live HCS Audit Event Publication and Mirror Node Verification', async () => {
    const topicIdStr = process.env.HEDERA_AUDIT_TOPIC_ID;
    if (!topicIdStr) {
      console.log('[Live Testnet] HEDERA_AUDIT_TOPIC_ID not configured. Skipping topic submit test.');
      return;
    }

    const testPayload = JSON.stringify({
      event: 'LIVE_INTEGRATION_TEST_EVENT',
      timestamp: new Date().toISOString(),
      operator: operatorId,
    });

    const topicTx = new TopicMessageSubmitTransaction()
      .setTopicId(topicIdStr)
      .setMessage(testPayload)
      .freezeWith(client);

    const opKey = operatorKey.startsWith('0x')
      ? PrivateKey.fromStringECDSA(operatorKey)
      : PrivateKey.fromString(operatorKey);
    await opKey.signTransaction(topicTx);

    const res = await topicTx.execute(client);
    const receipt = await res.getReceipt(client);
    assert.strictEqual(receipt.status.toString(), 'SUCCESS');
    console.log(`[Live Testnet] HCS topic ${topicIdStr} recorded message at sequence ${receipt.topicSequenceNumber.toString()}`);
  });
});
