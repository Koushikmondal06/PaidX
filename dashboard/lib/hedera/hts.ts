import 'server-only';
import {
  TransferTransaction,
  TokenId,
  AccountId,
  Hbar,
  TransactionId,
} from '@hiero-ledger/sdk';
import { getHederaClient } from './client';
import { getMirrorAccountBalance, getMirrorTokenInfo } from './mirrorNode';
import { SUPPORTED_HEDERA_ASSETS, type HtsTokenConfig } from './types';

/**
 * Returns supported HTS asset configuration
 */
export function getHtsAssetConfig(assetSymbolOrId: string): HtsTokenConfig {
  const upper = assetSymbolOrId.trim().toUpperCase();
  if (SUPPORTED_HEDERA_ASSETS[upper]) {
    return SUPPORTED_HEDERA_ASSETS[upper];
  }

  // Check if direct token ID provided
  return {
    tokenId: assetSymbolOrId,
    symbol: assetSymbolOrId,
    name: `Hedera Token ${assetSymbolOrId}`,
    decimals: 6,
  };
}

/**
 * Converts human readable amount (e.g. "5" or "5.5") to atomic integer string for the given token decimals
 */
export function toAtomicUnits(amountStr: string | number, decimals: number): string {
  const [whole, fraction = ''] = amountStr.toString().split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const combined = `${whole}${paddedFraction}`.replace(/^0+/, '');
  return combined === '' ? '0' : combined;
}

/**
 * Converts atomic integer units to formatted human-readable display string
 */
export function fromAtomicUnits(atomicStr: string | bigint | number, decimals: number): string {
  const str = atomicStr.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, str.length - decimals);
  const fraction = str.slice(str.length - decimals).replace(/0+$/, '');
  return fraction.length > 0 ? `${whole}.${fraction}` : whole;
}

/**
 * Inspect balance and token associations for a Hedera account
 */
export async function getAccountBalances(accountId: string): Promise<{
  hbarBalance: string;
  tokens: Record<string, string>;
}> {
  const mirrorData = await getMirrorAccountBalance(accountId);
  if (!mirrorData) {
    return {
      hbarBalance: '0',
      tokens: {},
    };
  }

  const hbarFormatted = (mirrorData.balance / 100_000_000).toFixed(4);
  const tokenMap: Record<string, string> = {};

  for (const t of mirrorData.tokens) {
    tokenMap[t.token_id] = t.balance.toString();
  }

  return {
    hbarBalance: hbarFormatted,
    tokens: tokenMap,
  };
}

/**
 * Constructs an HTS TransferTransaction for Hedera x402 payment
 */
export function buildTransferTransaction({
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
}): TransferTransaction {
  const client = getHederaClient();
  const tx = new TransferTransaction();

  const payer = AccountId.fromString(payerAccountId.trim());
  const recipient = AccountId.fromString(recipientAccountId.trim());
  const amountBigInt = BigInt(atomicAmount);

  if (assetId === '0.0.0' || assetId.toLowerCase() === 'hbar') {
    // Native HBAR transfer
    const amountHbar = Hbar.fromTinybars(amountBigInt.toString());
    const negAmountHbar = Hbar.fromTinybars((-amountBigInt).toString());

    tx.addHbarTransfer(payer, negAmountHbar)
      .addHbarTransfer(recipient, amountHbar);
  } else {
    // HTS Fungible Token transfer (e.g. USDC)
    const token = TokenId.fromString(assetId.trim());
    tx.addTokenTransfer(token, payer, -Number(amountBigInt))
      .addTokenTransfer(token, recipient, Number(amountBigInt));
  }

  // Set designated fee payer (the x402 Facilitator sponsoring the gas fees)
  if (feePayerAccountId && feePayerAccountId.trim().startsWith('0.0.')) {
    const feePayer = AccountId.fromString(feePayerAccountId.trim());
    tx.setTransactionId(TransactionId.generate(feePayer));
  } else {
    tx.setTransactionId(TransactionId.generate(payer));
  }

  tx.freezeWith(client);
  return tx;
}
