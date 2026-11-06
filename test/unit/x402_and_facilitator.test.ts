import test from 'node:test';
import assert from 'node:assert';
import {
  validateTransactionBytesAgainstRequirements,
  setTestFacilitatorMock,
  verifyPaymentPayload,
  settlePaymentPayload,
} from '../../dashboard/lib/hedera/x402/facilitator.ts';
import { buildTransferTransaction } from '../../dashboard/lib/hedera/hts.ts';
import { setTestMirrorMock, pollTransactionConsensus } from '../../dashboard/lib/hedera/mirrorNode.ts';
import type { X402PaymentRequirements, X402PaymentPayload } from '../../dashboard/lib/hedera/types.ts';

test('Phase 3 / Test Cases 11, 12, 13, 19: x402 Protocol, Verification, Settlement & Mirror Node', async (t) => {
  const payerAccountId = '0.0.123456';
  const recipientAccountId = '0.0.654321';
  const assetId = '0.0.5449156'; // USDC Token
  const requiredAmount = '5000000'; // 5 USDC

  const validRequirements: X402PaymentRequirements = {
    scheme: 'exact',
    network: 'hedera:testnet',
    amount: requiredAmount,
    asset: assetId,
    payTo: recipientAccountId,
    maxTimeoutSeconds: 180,
  };

  t.afterEach(() => {
    setTestFacilitatorMock(null);
    setTestMirrorMock(null);
  });

  await t.test('Test Case 11: verifies valid payload matching exact requirements', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: requiredAmount,
    });

    const payload: X402PaymentPayload = {
      scheme: 'exact',
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'),
    };

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.details?.payer, payerAccountId);
    assert.strictEqual(result.details?.recipient, recipientAccountId);
    assert.strictEqual(result.details?.amount, requiredAmount);
  });

  await t.test('Test Case 11: rejects payload with amount mismatch (greater amount)', () => {
    // Transaction pays 6 USDC instead of required 5 USDC
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: '6000000',
    });

    const payload: X402PaymentPayload = {
      scheme: 'exact',
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'),
    };

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /Exact amount mismatch/i);
  });

  await t.test('Test Case 11: rejects payload with amount mismatch (lesser amount)', () => {
    // Transaction pays 4 USDC instead of required 5 USDC
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: '4000000',
    });

    const payload: X402PaymentPayload = {
      scheme: 'exact',
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'),
    };

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

    const payload: X402PaymentPayload = {
      scheme: 'exact',
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'),
    };

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /no transfer of token/i);
  });

  await t.test('Test Case 11: rejects payload with wrong asset', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.888888', // Wrong token ID
      atomicAmount: requiredAmount,
    });

    const payload: X402PaymentPayload = {
      scheme: 'exact',
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'),
    };

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /does not transfer required token asset/i);
  });

  await t.test('Test Case 11: rejects non-exact scheme', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId,
      atomicAmount: requiredAmount,
    });

    const payload: X402PaymentPayload = {
      scheme: 'market' as any,
      network: 'hedera:testnet',
      transactionBytes: Buffer.from(tx.toBytes()).toString('base64'),
    };

    const result = validateTransactionBytesAgainstRequirements(payload, validRequirements);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /Invalid scheme/i);
  });

  await t.test('Test Case 12: facilitator settlement failure fails closed (never falls back to operator)', async () => {
    setTestFacilitatorMock({
      settle: async () => ({
        success: false,
        error: 'Facilitator out of gas / sponsor budget exhausted',
      }),
    });

    const res = await settlePaymentPayload(
      { scheme: 'exact', network: 'hedera:testnet', transactionBytes: 'AQID' },
      validRequirements
    );

    assert.strictEqual(res.success, false);
    assert.match(res.error || '', /sponsor budget exhausted/i);
  });

  await t.test('Test Case 13: Mirror Node confirmation verifies successful consensus', async () => {
    const txId = '0.0.123456@1700000000.000000001';
    setTestMirrorMock({
      getTransaction: async (id) => ({
        transaction_id: id,
        consensus_timestamp: '1700000000.123456789',
        result: 'SUCCESS',
        charged_tx_fee: 100000,
        transfers: [],
        token_transfers: [
          { token_id: assetId, account: recipientAccountId, amount: 5000000 },
          { token_id: assetId, account: payerAccountId, amount: -5000000 },
        ],
      }),
    });

    const tx = await pollTransactionConsensus(txId, 2, 10);
    assert.ok(tx);
    assert.strictEqual(tx.result, 'SUCCESS');
  });

  await t.test('Test Case 13: Mirror Node detects failed transaction result', async () => {
    const txId = '0.0.123456@1700000000.000000002';
    setTestMirrorMock({
      getTransaction: async (id) => ({
        transaction_id: id,
        consensus_timestamp: '1700000000.123456789',
        result: 'INSUFFICIENT_TOKEN_BALANCE',
        charged_tx_fee: 50000,
        transfers: [],
      }),
    });

    const tx = await pollTransactionConsensus(txId, 2, 10);
    assert.ok(tx);
    assert.strictEqual(tx.result, 'INSUFFICIENT_TOKEN_BALANCE');
  });

  await t.test('Test Case 19: Uncertain network outcomes handle timeout without premature release', async () => {
    setTestFacilitatorMock({
      settle: async () => ({
        success: false,
        error: 'Facilitator settlement network error: fetch failed (ETIMEDOUT)',
      }),
    });

    const res = await settlePaymentPayload(
      { scheme: 'exact', network: 'hedera:testnet', transactionBytes: 'AQID' },
      validRequirements
    );

    assert.strictEqual(res.success, false);
    assert.match(res.error || '', /network error/i);
  });
});
