import test from 'node:test';
import assert from 'node:assert';
import { PrivateKey, AccountId, TransferTransaction } from '@hiero-ledger/sdk';
import { DelegatedWalletSigningProvider } from '../../dashboard/lib/hedera/signing/delegatedSigner.ts';
import { setWalletSigningProvider, resetWalletSigningProvider } from '../../dashboard/lib/hedera/signing/registry.ts';
import { setTestMirrorMock } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { signRecipientPayment } from '../../dashboard/lib/hedera/signer.ts';
import { buildTransferTransaction } from '../../dashboard/lib/hedera/hts.ts';

test('Phase 2 / Test Cases 9 & 10: Wallet Signing Architecture & Transaction Construction', async (t) => {
  const payerAccountId = '0.0.123456';
  const recipientAccountId = '0.0.654321';
  const testKey = PrivateKey.generateED25519();
  const testProvider = new DelegatedWalletSigningProvider();

  t.beforeEach(() => {
    setTestMirrorMock({
      getAccount: async (accId) => ({
        account: accId,
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 1000000000, timestamp: '1', tokens: [] },
        deleted: false,
        evm_address: '0x0',
        key: { _type: 'ED25519', key: testKey.publicKey.toStringRaw() },
      }),
    });
    testProvider.registerAccountKey(payerAccountId, testKey.toStringDer());
    setWalletSigningProvider(testProvider);
  });

  t.afterEach(() => {
    resetWalletSigningProvider();
    setTestMirrorMock(null);
  });

  await t.test('Test Case 9: builds exact HTS TransferTransaction with correct payer and recipient', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    assert.ok(tx instanceof TransferTransaction);
    assert.strictEqual(tx.transactionId?.accountId?.toString(), payerAccountId);

    const tokenMap = tx.tokenTransfers.get('0.0.5449156');
    assert.ok(tokenMap);
    assert.strictEqual(tokenMap.get(recipientAccountId)?.toBigInt(), 5000000n);
    assert.strictEqual(tokenMap.get(payerAccountId)?.toBigInt(), -5000000n);
  });

  await t.test('Test Case 9: builds exact native HBAR TransferTransaction with tinybars', () => {
    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.0',
      atomicAmount: '250000000', // 2.5 HBAR
    });

    assert.ok(tx instanceof TransferTransaction);
    assert.strictEqual(tx.hbarTransfers.get(recipientAccountId)?.toTinybars().toBigInt(), 250000000n);
    assert.strictEqual(tx.hbarTransfers.get(payerAccountId)?.toTinybars().toBigInt(), -250000000n);
  });

  await t.test('Test Case 10: retrieves public key matching registered private key', async () => {
    const pubKeyInfo = await testProvider.getPublicKey(payerAccountId);
    assert.strictEqual(pubKeyInfo.accountId, payerAccountId);
    assert.strictEqual(pubKeyInfo.publicKeyHex, testKey.publicKey.toStringRaw());
  });

  await t.test('Test Case 10: signs transaction successfully when payer matches signer', async () => {
    const result = await signRecipientPayment({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    assert.ok(result.transactionBytesBase64);
    assert.ok(result.transactionId.startsWith(payerAccountId));
  });

  await t.test('Test Case 10: rejects signing when payer account has no registered signer (fails closed, no operator fallback)', async () => {
    const unconfiguredAccount = '0.0.999999';

    await assert.rejects(
      async () => {
        await signRecipientPayment({
          payerAccountId: unconfiguredAccount,
          recipientAccountId,
          assetId: '0.0.5449156',
          atomicAmount: '5000000',
        });
      },
      /No authorized signing key configured for connected wallet/i
    );
  });

  await t.test('Test Case 10: rejects transaction if transaction payer does not match signer account ID', async () => {
    // Manually construct transaction with different payer
    const tx = buildTransferTransaction({
      payerAccountId: '0.0.888888',
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    await assert.rejects(
      async () => {
        // Attempt to sign with payerAccountId (0.0.123456)
        await testProvider.signTransaction(payerAccountId, tx);
      },
      /Transaction payer mismatch/i
    );
  });
});
