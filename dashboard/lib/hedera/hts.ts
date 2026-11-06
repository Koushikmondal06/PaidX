import 'server-only';
import {
  TransferTransaction,
  TokenId,
  AccountId,
  Hbar,
  TransactionId,
} from '@hiero-ledger/sdk';
import { getHederaClient } from './client';
import { getMirrorAccountBalance } from './mirrorNode';
import { SUPPORTED_HEDERA_ASSETS, type HtsTokenConfig } from './types';
import {
  parseToAtomicUnits,
  formatAtomicUnits,
  validateDecimalString,
  isValidHederaTokenId,
} from './decimal';

/**
 * Returns supported HTS asset configuration
 */
export function getHtsAssetConfig(assetSymbolOrId: string): HtsTokenConfig {
  const upper = assetSymbolOrId.trim().toUpperCase();
  if (SUPPORTED_HEDERA_ASSETS[upper]) {
    return SUPPORTED_HEDERA_ASSETS[upper];
  }

  // Check by Token ID
  for (const asset of Object.values(SUPPORTED_HEDERA_ASSETS)) {
    if (asset.tokenId === assetSymbolOrId.trim()) {
      return asset;
    }
  }

  if (!isValidHederaTokenId(assetSymbolOrId)) {
    throw new Error(`Invalid Hedera asset identifier: "${assetSymbolOrId}"`);
  }

  return {
    tokenId: assetSymbolOrId.trim(),
    symbol: assetSymbolOrId.trim(),
    name: `Hedera Token ${assetSymbolOrId.trim()}`,
    decimals: 6,
  };
}

/**
 * Converts decimal amount string to atomic BigInt integer string
 */
export function toAtomicUnits(amountStr: string | number, decimals: number): string {
  const str = typeof amountStr === 'number' ? amountStr.toString() : amountStr;
  return parseToAtomicUnits(str, decimals).toString();
}

/**
 * Converts atomic integer units to formatted decimal string
 */
export function fromAtomicUnits(atomicStr: string | bigint | number, decimals: number): string {
  return formatAtomicUnits(atomicStr.toString(), decimals);
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
 * Constructs an HTS or HBAR TransferTransaction for Hedera x402 payment
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

  if (amountBigInt <= 0n) {
    throw new Error(`Transfer atomic amount must be strictly positive. Received: ${amountBigInt.toString()}`);
  }

  // Set explicit transaction ID with payer account
  tx.setTransactionId(TransactionId.generate(payer));

  // Determine native HBAR vs HTS Token
  const isHbar = assetId.trim() === '0.0.0' || assetId.trim().toUpperCase() === 'HBAR';

  if (isHbar) {
    const tinybars = amountBigInt;
    tx.addHbarTransfer(payer, Hbar.fromTinybars((-tinybars).toString()));
    tx.addHbarTransfer(recipient, Hbar.fromTinybars(tinybars.toString()));
  } else {
    const token = TokenId.fromString(assetId.trim());
    tx.addTokenTransfer(token, payer, -amountBigInt);
    tx.addTokenTransfer(token, recipient, amountBigInt);
  }

  // Freeze transaction with client so bytes can be serialized and signed
  tx.freezeWith(client);

  return tx;
}
