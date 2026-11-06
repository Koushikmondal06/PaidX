import test from 'node:test';
import assert from 'node:assert';
import { PrivateKey, AccountId, TransferTransaction } from '@hiero-ledger/sdk';
import { DelegatedWalletSigningProvider } from '../../dashboard/lib/hedera/signing/delegatedSigner.ts';
import { setWalletSigningProvider, resetWalletSigningProvider } from '../../dashboard/lib/hedera/signing/registry.ts';
import { setTestMirrorMock } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { signRecipientPayment } from '../../dashboard/lib/hedera/signer.ts';
import { buildTransferTransaction } from '../../dashboard/lib/hedera/hts.ts';

test('Phase 2 / Test Cases 9 & 10: Wallet Signing Architecture & Key Structure Verification', async (t) => {
  const payerAccountId = '0.0.123456';
  const recipientAccountId = '0.0.654321';
  const testKey = PrivateKey.generateED25519();
  const testEcdsaKey = PrivateKey.generateECDSA();
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
    assert.strictEqual(pubKeyInfo.keyType, 'ED25519');
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
    const otherAccount = '0.0.777777';
    const tx = buildTransferTransaction({
      payerAccountId: otherAccount,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    await assert.rejects(
      async () => {
        await testProvider.signTransaction(payerAccountId, tx);
      },
      /Transaction payer mismatch/i
    );
  });

  await t.test('Signer Security: FAILS CLOSED when Mirror Node is unavailable or network fails', async () => {
    setTestMirrorMock({
      getAccount: async () => {
        throw new Error('ETIMEDOUT: Connection to Mirror Node timed out');
      },
    });

    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    await assert.rejects(
      async () => {
        await testProvider.signTransaction(payerAccountId, tx);
      },
      /Mirror Node verification failed/i
    );
  });

  await t.test('Signer Security: FAILS CLOSED when account is not found on Mirror Node', async () => {
    setTestMirrorMock({
      getAccount: async () => null,
    });

    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    await assert.rejects(
      async () => {
        await testProvider.signTransaction(payerAccountId, tx);
      },
      /could not be retrieved from Mirror Node/i
    );
  });

  await t.test('Signer Security: rejects signing if account is marked as deleted on Mirror Node', async () => {
    setTestMirrorMock({
      getAccount: async (accId) => ({
        account: accId,
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 0, timestamp: '1', tokens: [] },
        deleted: true, // Marked as deleted!
        evm_address: '0x0',
        key: { _type: 'ED25519', key: testKey.publicKey.toStringRaw() },
      }),
    });

    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    await assert.rejects(
      async () => {
        await testProvider.signTransaction(payerAccountId, tx);
      },
      /marked as deleted/i
    );
  });

  await t.test('Signer Security: rejects signing on key mismatch (strictly prevents substring false positives)', async () => {
    const mismatchedKey = PrivateKey.generateED25519();
    setTestMirrorMock({
      getAccount: async (accId) => ({
        account: accId,
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 1000000000, timestamp: '1', tokens: [] },
        deleted: false,
        evm_address: '0x0',
        key: { _type: 'ED25519', key: mismatchedKey.publicKey.toStringRaw() },
      }),
    });

    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    await assert.rejects(
      async () => {
        await testProvider.signTransaction(payerAccountId, tx);
      },
      /Signer public key mismatch/i
    );
  });

  await t.test('Signer Security: successfully verifies ECDSA_SECP256K1 key structures', async () => {
    const ecdsaAccountId = '0.0.222333';
    testProvider.registerAccountKey(ecdsaAccountId, testEcdsaKey.toStringDer());

    setTestMirrorMock({
      getAccount: async (accId) => ({
        account: accId,
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 1000000000, timestamp: '1', tokens: [] },
        deleted: false,
        evm_address: '0x0',
        key: { _type: 'ECDSA_SECP256K1', key: testEcdsaKey.publicKey.toStringRaw() },
      }),
    });

    const tx = buildTransferTransaction({
      payerAccountId: ecdsaAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    const signedTx = await testProvider.signTransaction(ecdsaAccountId, tx);
    assert.ok(signedTx);
  });

  await t.test('Signer Security: successfully verifies nested KeyList and ThresholdKey structures', async () => {
    const multisigAccountId = '0.0.888999';
    testProvider.registerAccountKey(multisigAccountId, testKey.toStringDer());

    // Account registered on Mirror Node with a ThresholdKey containing a KeyList
    setTestMirrorMock({
      getAccount: async (accId) => ({
        account: accId,
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 1000000000, timestamp: '1', tokens: [] },
        deleted: false,
        evm_address: '0x0',
        key: {
          _type: 'ThresholdKey',
          threshold: 2,
          keys: [
            { _type: 'ED25519', key: 'aabbcc112233' },
            {
              _type: 'KeyList',
              keys: [
                { _type: 'ED25519', key: testKey.publicKey.toStringRaw() },
              ],
            },
          ],
        },
      }),
    });

    const tx = buildTransferTransaction({
      payerAccountId: multisigAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    const signedTx = await testProvider.signTransaction(multisigAccountId, tx);
    assert.ok(signedTx);
  });

  await t.test('Signer Security: rejects signing after account key unregistration (revocation)', async () => {
    testProvider.unregisterAccountKey(payerAccountId);

    const tx = buildTransferTransaction({
      payerAccountId,
      recipientAccountId,
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    await assert.rejects(
      async () => {
        await testProvider.signTransaction(payerAccountId, tx);
      },
      /No signer configured for account/i
    );
  });
});
