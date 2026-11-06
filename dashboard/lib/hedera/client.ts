import 'server-only';
import {
  Client,
  AccountId,
  PrivateKey,
} from '@hiero-ledger/sdk';

let hederaClientInstance: Client | null = null;

/**
 * Returns a configured Hedera Testnet Client using @hiero-ledger/sdk.
 * Reads operator credentials from environment variables:
 * - HEDERA_OPERATOR_ID (e.g. "0.0.123456")
 * - HEDERA_OPERATOR_KEY (DER or hex private key)
 */
export function getHederaClient(): Client {
  if (hederaClientInstance) {
    return hederaClientInstance;
  }

  const client = Client.forTestnet();

  const operatorIdStr = process.env.HEDERA_OPERATOR_ID;
  const operatorKeyStr = process.env.HEDERA_OPERATOR_KEY;

  if (operatorIdStr && operatorKeyStr) {
    try {
      const operatorId = AccountId.fromString(operatorIdStr);
      let operatorKey: PrivateKey;

      if (operatorKeyStr.startsWith('0x')) {
        operatorKey = PrivateKey.fromStringECDSA(operatorKeyStr);
      } else {
        operatorKey = PrivateKey.fromString(operatorKeyStr);
      }

      client.setOperator(operatorId, operatorKey);
    } catch (err) {
      console.warn('[Hedera Client] Failed to set operator credentials:', err);
    }
  }

  hederaClientInstance = client;
  return hederaClientInstance;
}

/**
 * Validates whether a given string is a valid Hedera Account ID (0.0.x)
 */
export function isValidHederaAccountId(address: string): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  const pattern = /^0\.0\.[1-9][0-9]*$/;
  return pattern.test(trimmed);
}

/**
 * Validates whether a given string is a valid Hedera Token ID (0.0.x)
 */
export function isValidHederaTokenId(tokenId: string): boolean {
  if (!tokenId) return false;
  const trimmed = tokenId.trim();
  const pattern = /^0\.0\.[1-9][0-9]*$/;
  return pattern.test(trimmed);
}
