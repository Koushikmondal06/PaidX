import { X402PaymentRequirements, HtsTokenConfig } from '../types';
import { getHtsAssetConfig, toAtomicUnits } from '../hts';

export interface CreatePaymentRequirementsParams {
  recipient: string; // e.g. "0.0.123456"
  amount: string | number; // e.g. "5"
  assetSymbolOrId: string; // e.g. "USDC" or "0.0.5449156"
  network?: 'hedera:testnet' | 'hedera:mainnet';
  facilitatorFeePayer?: string;
  paymentReference?: string;
}

/**
 * Creates recipient-directed Hedera x402 exact payment requirements.
 * The user-provided recipient becomes PaymentRequirements.payTo.
 * The amount is converted to exact atomic units based on token decimals.
 */
export function createRecipientPaymentRequirements({
  recipient,
  amount,
  assetSymbolOrId,
  network = 'hedera:testnet',
  facilitatorFeePayer,
  paymentReference,
}: CreatePaymentRequirementsParams): {
  requirements: X402PaymentRequirements;
  tokenConfig: HtsTokenConfig;
  atomicAmount: string;
} {
  const tokenConfig = getHtsAssetConfig(assetSymbolOrId);
  const atomicAmount = toAtomicUnits(amount, tokenConfig.decimals);

  const feePayer =
    facilitatorFeePayer ||
    process.env.HEDERA_FACILITATOR_ACCOUNT ||
    process.env.HEDERA_OPERATOR_ID ||
    '0.0.5449100';

  const requirements: X402PaymentRequirements = {
    scheme: 'exact',
    network,
    amount: atomicAmount,
    asset: tokenConfig.tokenId,
    payTo: recipient.trim(),
    maxTimeoutSeconds: 180,
    extra: {
      feePayer,
      paymentReference: paymentReference || `paidx-x402-${Date.now()}`,
    },
  };

  return {
    requirements,
    tokenConfig,
    atomicAmount,
  };
}
