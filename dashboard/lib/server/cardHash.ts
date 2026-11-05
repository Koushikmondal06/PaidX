import 'server-only';
import { keccak256, toHex, stringToHex } from 'viem';

/**
 * Computes the bytes32 card hash from raw NFC UID and high-entropy secret CARD_UID_SALT.
 * HARD RULE: Raw NFC UID is NEVER stored in database or emitted in responses.
 */
export function computeCardUidHash(rawUid: string): `0x${string}` {
  const salt = process.env.CARD_UID_SALT;
  if (!salt) {
    throw new Error('[Card Security Violation] CARD_UID_SALT is not configured on server.');
  }

  // Normalize UID (remove colons, spaces, uppercase/lowercase)
  const normalizedUid = rawUid.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (normalizedUid.length < 8) {
    throw new Error('Invalid NFC UID format');
  }

  // keccak256 hash of normalized UID + salt
  const payload = `${normalizedUid}:${salt}`;
  return keccak256(stringToHex(payload));
}
