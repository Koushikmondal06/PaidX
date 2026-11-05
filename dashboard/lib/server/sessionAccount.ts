import 'server-only';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

/**
 * Returns the backend session account (relayer) used to submit redeemed ERC-7715 delegations.
 * The private key comes from the SESSION_ACCOUNT_PRIVATE_KEY env var.
 */
export function getSessionAccount() {
  const rawKey = process.env.SESSION_ACCOUNT_PRIVATE_KEY;
  if (!rawKey) {
    throw new Error('[Session Account] Missing SESSION_ACCOUNT_PRIVATE_KEY in environment variables.');
  }

  const hexKey: Hex = rawKey.startsWith('0x') ? (rawKey as Hex) : (`0x${rawKey}` as Hex);
  return privateKeyToAccount(hexKey);
}

export function getSessionAccountAddress(): string {
  try {
    const account = getSessionAccount();
    return account.address.toLowerCase();
  } catch (err) {
    return '';
  }
}
