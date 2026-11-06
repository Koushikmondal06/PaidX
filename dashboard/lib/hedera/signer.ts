import 'server-only';
import { TransferTransaction } from '@hiero-ledger/sdk';
import { buildTransferTransaction } from './hts';
import { getWalletSigningProvider } from './signing/registry';

export interface SignPaymentResult {
  transactionBytesBase64: string;
  transactionId: string;
}

/**
 * Hedera Wallet Signer Service
 * Safely signs exact x402 payment transactions using the configured IWalletSigningProvider
 * without exposing private keys to the LLM, browser, or API logs.
 */
export async function signRecipientPayment({
  payerAccountId,
  recipientAccountId,
  assetId,
  atomicAmount,
  feePayerAccountId,
}: {
  payerAccountId: string;
  recipientAccountId: string;
  assetId: string;
  atomicAmount: string | bigint;
  feePayerAccountId?: string;
}): Promise<SignPaymentResult> {
  const provider = getWalletSigningProvider();
  const cleanPayer = payerAccountId.trim();
  const cleanRecipient = recipientAccountId.trim();

  // 1. Verify that the provider can sign for the payer account
  const canSign = await provider.canSign(cleanPayer);
  if (!canSign) {
    throw new Error(
      `[Signing Error] No authorized signing key configured for connected wallet "${cleanPayer}". Operator fallback is strictly prohibited.`
    );
  }

  // 2. Construct TransferTransaction with exact parameters
  const tx = buildTransferTransaction({
    payerAccountId: cleanPayer,
    recipientAccountId: cleanRecipient,
    assetId,
    atomicAmount,
    feePayerAccountId,
  });

  // 3. Delegate signature to the provider (which enforces payer matching and Mirror Node key check)
  await provider.signTransaction(cleanPayer, tx);

  const txBytes = tx.toBytes();
  const txBytesBase64 = Buffer.from(txBytes).toString('base64');
  const transactionId = tx.transactionId?.toString() || '';

  return {
    transactionBytesBase64: txBytesBase64,
    transactionId,
  };
}
