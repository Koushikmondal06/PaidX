import test from 'node:test';
import assert from 'node:assert';
import { PrivateKey, AccountId, TokenId, TransferTransaction, Hbar } from '@hiero-ledger/sdk';
import {
  validateTransactionBytesAgainstRequirements,
  checkFacilitatorCapabilities,
  setTestFacilitatorMock,
  verifyPaymentPayload,
  settlePaymentPayload,
} from '../../dashboard/lib/hedera/x402/facilitator.ts';
import { buildTransferTransaction } from '../../dashboard/lib/hedera/hts.ts';
import { setTestMirrorMock, pollTransactionConsensus } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { closeHederaClient } from '../../dashboard/lib/hedera/client.ts';
import type { X402PaymentRequirements, X402PaymentPayload } from '../../dashboard/lib/hedera/types.ts';

test('Phase 3 / Test Cases 11, 12, 13, 19: x402 Protocol, Verification, Settlement & Mirror Node', async (t) => {
  const payerAccountId = '0.0.123456';
  const recipientAccountId = '0.0.654321';
  const assetId = '0.0.5449156'; // USDC Token
  const requiredAmount = '5000000'; // 5 USDC
  const testKey = PrivateKey.generateED25519();

  const validRequirements: X402PaymentRequirements = {
    scheme: 'exact',
    network: 'hedera:testnet',
    amount: requiredAmount,
    asset: assetId,
    payTo: recipientAccountId,
    maxTimeoutSeconds: 180,
  };

  function createSignedPayload(tx: TransferTransaction): X402PaymentPayload {
    testKey.signTransaction(tx);
    return {
      scheme: 'exact',
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'),
    };
  }

  t.afterEach(() => {
    setTestFacilitatorMock(null);
    setTestMirrorMock(null);
  });

  t.after(() => {
    closeHederaClient();
  });

  await t.test('Test Case 11: verifies valid payload matching exact requirements', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: requiredAmount,
    });

    const payload = createSignedPayload(tx);

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.details?.payer, payerAccountId);
    assert.strictEqual(result.details?.recipient, recipientAccountId);
    assert.strictEqual(result.details?.amount, requiredAmount);
  });

  await t.test('Test Case 11: rejects unsigned payload (fails closed on missing signature structure)', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: requiredAmount,
    });

    const payload: X402PaymentPayload = {
      scheme: 'exact',
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'), // NOT signed
    };

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /No cryptographic signatures/i);
  });

  await t.test('Test Case 11: rejects payload with amount mismatch (greater amount)', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: '6000000', // 6 USDC instead of 5
    });

    const payload = createSignedPayload(tx);

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /Exact amount mismatch/i);
  });

  await t.test('Test Case 11: rejects payload with amount mismatch (lesser amount)', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: '4000000', // 4 USDC instead of 5
    });

    const payload = createSignedPayload(tx);

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /Exact amount mismatch/i);
  });

  await t.test('Test Case 11: rejects payload with wrong recipient', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId: '0.0.999999', // Wrong recipient
      assetId,
      atomicAmount: requiredAmount,
    });

    const payload = createSignedPayload(tx);

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /no transfer of token/i);
  });

  await t.test('Test Case 11: rejects payload with wrong asset', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.777777', // Different token
      atomicAmount: requiredAmount,
    });

    const payload = createSignedPayload(tx);

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /does not transfer required token asset/i);
  });

  await t.test('Security Zero-Tolerance: rejects extra transfers to third-party accounts', () => {
    const tx = new TransferTransaction();
    const payer = AccountId.fromString(payerAccountId);
    const rec = AccountId.fromString(recipientAccountId);
    const hacker = AccountId.fromString('0.0.666666');
    const token = TokenId.fromString(assetId);

    // Adds unauthorized 3rd party transfer
    tx.setTransactionId(require('@hiero-ledger/sdk').TransactionId.generate(payer));
    tx.addTokenTransfer(token, payer, -6000000n);
    tx.addTokenTransfer(token, rec, 5000000n);
    tx.addTokenTransfer(token, hacker, 1000000n); // Extra unauthorized transfer!
    tx.setNodeAccountIds([AccountId.fromString('0.0.3')]);
    tx.freeze();

    const payload = createSignedPayload(tx);

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /Expected exactly 2 token transfer entries/i);
  });

  await t.test('Security Zero-Tolerance: rejects unauthorized HBAR transfer inside token payment', () => {
    const payer = AccountId.fromString(payerAccountId);
    const rec = AccountId.fromString(recipientAccountId);
    const token = TokenId.fromString(assetId);

    const tx = new TransferTransaction()
      .setTransactionId(require('@hiero-ledger/sdk').TransactionId.generate(payer))
      .addTokenTransfer(token, payer, -5000000n)
      .addTokenTransfer(token, rec, 5000000n)
      .addHbarTransfer(payer, Hbar.fromTinybars(-100))
      .addHbarTransfer(AccountId.fromString('0.0.666666'), Hbar.fromTinybars(100))
      .setNodeAccountIds([AccountId.fromString('0.0.3')])
      .freeze();

    const payload = createSignedPayload(tx);

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /unauthorized HBAR transfers in a token payment/i);
  });

  await t.test('Facilitator Capabilities: rejects unsupported network, scheme, or asset', async () => {
    setTestFacilitatorMock({
      supported: async () => ({
        networks: ['hedera:mainnet'], // Only mainnet supported
        schemes: ['exact'],
        assets: ['0.0.5449156'],
        methods: ['cryptoTransfer'],
      }),
    });

    await assert.rejects(
      async () => {
        await checkFacilitatorCapabilities(undefined, {
          network: 'hedera:testnet', // Requests testnet
          scheme: 'exact',
          asset: '0.0.5449156',
        });
      },
      /does not support network "hedera:testnet"/i
    );
  });

  await t.test('Facilitator Verification: requires facilitator response valid === true', async () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: requiredAmount,
    });
    const payload = createSignedPayload(tx);

    setTestFacilitatorMock({
      verify: async () => ({
        valid: false,
        error: 'Facilitator rejected: Signature verification failed on facilitator node',
      }),
    });

    const result = await verifyPaymentPayload(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /Signature verification failed/i);
  });

  await t.test('Facilitator Verification: FAILS CLOSED when facilitator is unavailable', async () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: requiredAmount,
    });
    const payload = createSignedPayload(tx);

    // Clear facilitator URL to simulate missing facilitator
    const prevUrl = process.env.HEDERA_FACILITATOR_URL;
    delete process.env.HEDERA_FACILITATOR_URL;

    try {
      const result = await verifyPaymentPayload(payload, validRequirements);
      assert.strictEqual(result.valid, false);
      assert.match(result.error || '', /facilitator is required/i);
    } finally {
      if (prevUrl) process.env.HEDERA_FACILITATOR_URL = prevUrl;
    }
  });

  await t.test('Facilitator Settlement: captures network timeouts without fake settlement', async () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: requiredAmount,
    });
    const payload = createSignedPayload(tx);

    setTestFacilitatorMock({
      settle: async () => ({
        success: false,
        error: 'Facilitator settlement network error: fetch failed ETIMEDOUT',
      }),
    });

    const result = await settlePaymentPayload(payload, validRequirements);
    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /network error.*ETIMEDOUT/i);
  });

  await t.test('Mirror Node Polling: polls and returns transaction when SUCCESS reached', async () => {
    const expectedTxId = `${payerAccountId}@1700000000.123456789`;

    setTestMirrorMock({
      getTransaction: async (txId) => {
        if (txId === expectedTxId) {
          return {
            transaction_id: expectedTxId,
            consensus_timestamp: '1700000000.123456789',
            result: 'SUCCESS',
            charged_tx_fee: 100000,
            transfers: [],
            token_transfers: [
              { token_id: assetId, account: recipientAccountId, amount: 5000000 },
              { token_id: assetId, account: payerAccountId, amount: -5000000 },
            ],
          };
        }
        return null;
      },
    });

    const tx = await pollTransactionConsensus(expectedTxId, 2, 50);
    assert.ok(tx);
    assert.strictEqual(tx.result, 'SUCCESS');
    assert.strictEqual(tx.transaction_id, expectedTxId);
  });

  await t.test('Mirror Node Polling: returns null when transaction not yet indexed', async () => {
    setTestMirrorMock({
      getTransaction: async () => null,
    });

    const tx = await pollTransactionConsensus('0.0.123456@9999999999.000000000', 2, 50);
    assert.strictEqual(tx, null);
  });
});
