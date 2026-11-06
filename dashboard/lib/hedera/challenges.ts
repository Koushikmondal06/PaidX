/**
 * Single-Use Wallet Ownership Challenge Registry
 * Tracks server-issued nonces and enforces single-use replay protection with TTL.
 */

export interface ChallengeRecord {
  nonce: string;
  userId: string;
  walletAddress: string;
  network: string;
  chainId: number;
  action: string;
  challengeText: string;
  used: boolean;
  used_at?: number | null;
  expiresAt: number;
  issuedAt: number;
}

// In-memory single-use challenge registry with TTL
export const memoryChallengeRegistry = new Map<string, ChallengeRecord>();

export function markChallengeUsed(nonce: string): boolean {
  const record = memoryChallengeRegistry.get(nonce);
  if (!record) return false;
  if (record.used) return false;
  record.used = true;
  record.used_at = Date.now();
  return true;
}

export function getMemoryChallenge(nonce: string): ChallengeRecord | null {
  const record = memoryChallengeRegistry.get(nonce);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    memoryChallengeRegistry.delete(nonce);
    return null;
  }
  return record;
}

export function resetMemoryChallenges(): void {
  memoryChallengeRegistry.clear();
}
