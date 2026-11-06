import 'server-only';
import {
  TransferTransaction,
  PrivateKey,
  AccountId,
} from '@hiero-ledger/sdk';
import { buildTransferTransaction } from './hts';

/**
 * Hedera Wallet Signer Service
 * Safely signs exact x402 payment transactions without exposing private keys to the LLM.
 */
export async function signRecipientPayment({
  payerAccountId,
  recipientAccountId,
  assetId,
  atomicAmount,
  feePayerAccountId,
  signingKeyHexOrDer,
}: {
  payerAccountId: string;
  recipientAccountId: string;
  assetId: string;
  atomicAmount: string | bigint;
  feePayerAccountId?: string;
  signingKeyHexOrDer?: string;
}): Promise<{
  transactionBytesBase64: string;
  transactionId: string;
}> {
  // Resolve key from parameter or environment fallback
  const rawKey =
    signingKeyHexOrDer ||
    process.env.HEDERA_OPERATOR_KEY ||
    process.env.SESSION_ACCOUNT_PRIVATE_KEY;

  if (!rawKey) {
    throw new Error('[Wallet Signer] Missing signing key for Hedera wallet.');
  }

  let privateKey: PrivateKey;
  if (rawKey.startsWith('0x')) {
    privateKey = PrivateKey.fromStringECDSA(rawKey);
  } else {
    privateKey = PrivateKey.fromString(rawKey);
  }

  // Construct TransferTransaction with exact parameters
  const tx = buildTransferTransaction({
    payerAccountId,
    recipientAccountId,
    assetId,
    atomicAmount,
    feePayerAccountId,
  });

  // Sign with authorized wallet private key
  await tx.sign(privateKey);

  const txBytes = tx.toBytes();
  const txBytesBase64 = Buffer.from(txBytes).toString('base64');
  const transactionId = tx.transactionId?.toString() || '';

  return {
    transactionBytesBase64: txBytesBase64,
    transactionId,
  };
}
