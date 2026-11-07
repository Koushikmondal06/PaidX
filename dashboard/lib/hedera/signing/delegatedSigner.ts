import 'server-only';
import {
  TransferTransaction,
  PrivateKey,
  AccountId,
  PublicKey,
} from '@hiero-ledger/sdk';
import type { IWalletSigningProvider, SignerPublicKeyInfo } from './types';
import { getMirrorAccount, type MirrorAccount } from '../mirrorNode';

/**
 * Normalizes account ID string (e.g. "0.0.5449100" -> "0_0_5449100") for environment variable lookups.
 */
function accountIdToEnvSuffix(accountId: string): string {
  return accountId.trim().replace(/\./g, '_');
}

export interface MirrorKeyNode {
  _type?: string;
  key?: string;
  keys?: MirrorKeyNode[];
  threshold?: number;
}

/**
 * Checks whether the signer's public key is authorized in the Hedera account's key structure.
 * Supports ED25519, ECDSA_SECP256K1, KeyList, and ThresholdKey.
 * Strictly uses exact equality (=== or PublicKey.equals), never substring includes().
 */
export function keyStructureMatches(
  keyNode: MirrorKeyNode | null | undefined,
  signerPublicKey: PublicKey
): boolean {
  if (!keyNode) return false;

  const signerRaw = signerPublicKey.toStringRaw().toLowerCase().replace(/^0x/, '');
  const signerDer = signerPublicKey.toStringDer().toLowerCase().replace(/^0x/, '');

  // 1. If leaf key is present
  if (keyNode.key) {
    const candidateClean = keyNode.key.trim().toLowerCase().replace(/^0x/, '');

    // Strict exact comparison against raw or DER
    if (candidateClean === signerRaw || candidateClean === signerDer) {
      return true;
    }

    // Attempt exact equality via PublicKey parsing if supported
    try {
      const candidateKey = PublicKey.fromString(keyNode.key.trim());
      if (candidateKey.equals(signerPublicKey)) {
        return true;
      }
    } catch {
      // Ignore parse failure for custom or protobuf formats
    }
  }

  // 2. If KeyList or ThresholdKey with child keys
  if (Array.isArray(keyNode.keys) && keyNode.keys.length > 0) {
    for (const childNode of keyNode.keys) {
      if (keyStructureMatches(childNode, signerPublicKey)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Delegated Hedera Signer Provider
 * Manages isolated signing keys per account without global operator key substitution.
 */
export class DelegatedWalletSigningProvider implements IWalletSigningProvider {
  readonly providerId = 'delegated_secure_signer';

  // Secure in-memory account key registry for dynamic agent sessions & test suites
  private accountKeyRegistry = new Map<string, PrivateKey>();

  // Secure agent session key registry: accountId -> (agentId -> PrivateKey)
  private delegatedSessionRegistry = new Map<string, Map<string, PrivateKey>>();

  /**
   * Registers a dedicated signing key for an account (e.g. during onboarding or automated tests).
   */
  public registerAccountKey(accountId: string, keyDerOrHex: string): void {
    const cleanId = accountId.trim();
    let privKey: PrivateKey;

    if (keyDerOrHex.startsWith('0x')) {
      privKey = PrivateKey.fromStringECDSA(keyDerOrHex);
    } else {
      privKey = PrivateKey.fromString(keyDerOrHex);
    }

    this.accountKeyRegistry.set(cleanId, privKey);
  }

  /**
   * Registers a delegated agent session key granted by the user.
   * Maps agentId and accountId to an isolated, separate agent-controlled private key.
   */
  public registerAgentSessionKey(
    agentId: string,
    accountId: string,
    keyDerOrHex: string
  ): PrivateKey {
    const cleanId = accountId.trim();
    let privKey: PrivateKey;

    if (keyDerOrHex.startsWith('0x')) {
      privKey = PrivateKey.fromStringECDSA(keyDerOrHex);
    } else {
      privKey = PrivateKey.fromString(keyDerOrHex);
    }

    if (!this.delegatedSessionRegistry.has(cleanId)) {
      this.delegatedSessionRegistry.set(cleanId, new Map());
    }
    this.delegatedSessionRegistry.get(cleanId)!.set(agentId, privKey);

    // Also register in accountKeyRegistry so canSign(cleanId) is true
    this.accountKeyRegistry.set(cleanId, privKey);

    return privKey;
  }

  /**
   * Instantly unregisters an agent's delegated session key on revocation.
   */
  public unregisterAgentSessionKey(agentId: string): void {
    for (const [accountId, agentMap] of this.delegatedSessionRegistry.entries()) {
      if (agentMap.has(agentId)) {
        agentMap.delete(agentId);
        if (agentMap.size === 0) {
          this.delegatedSessionRegistry.delete(accountId);
          this.accountKeyRegistry.delete(accountId);
        }
      }
    }
  }

  /**
   * Verifies if a private key is an authorized delegated session key for the given account.
   */
  public isDelegatedSessionKey(accountId: string, key: PrivateKey): boolean {
    const cleanId = accountId.trim();
    const agentMap = this.delegatedSessionRegistry.get(cleanId);
    if (!agentMap) return false;
    const targetDer = key.publicKey.toStringDer();
    for (const regKey of agentMap.values()) {
      if (regKey.publicKey.toStringDer() === targetDer) {
        return true;
      }
    }
    return false;
  }

  /**
   * Unregisters an account signing key.
   */
  public unregisterAccountKey(accountId: string): void {
    this.accountKeyRegistry.delete(accountId.trim());
  }

  /**
   * Resolves the PrivateKey for a specific account.
   * Looks up the in-memory registry, then account-scoped environment variable.
   * NEVER falls back to HEDERA_OPERATOR_KEY for arbitrary accounts.
   */
  private resolvePrivateKeyForAccount(accountId: string): PrivateKey | null {
    const cleanId = accountId.trim();

    // 1. In-memory registry
    if (this.accountKeyRegistry.has(cleanId)) {
      return this.accountKeyRegistry.get(cleanId)!;
    }

    // 2. Account-scoped environment variable (e.g. HEDERA_ACCOUNT_KEY_0_0_123456)
    const envKeyName = `HEDERA_ACCOUNT_KEY_${accountIdToEnvSuffix(cleanId)}`;
    const envKeyValue = process.env[envKeyName];
    if (envKeyValue) {
      if (envKeyValue.startsWith('0x')) {
        return PrivateKey.fromStringECDSA(envKeyValue);
      }
      return PrivateKey.fromString(envKeyValue);
    }

    // 3. If account ID strictly equals HEDERA_OPERATOR_ID and operator key is configured:
    // Only permit operator key when the payer account explicitly IS the operator account itself.
    if (
      process.env.HEDERA_OPERATOR_ID &&
      cleanId === process.env.HEDERA_OPERATOR_ID.trim() &&
      process.env.HEDERA_OPERATOR_KEY
    ) {
      const opKey = process.env.HEDERA_OPERATOR_KEY;
      return opKey.startsWith('0x')
        ? PrivateKey.fromStringECDSA(opKey)
        : PrivateKey.fromString(opKey);
    }

    return null;
  }

  public async canSign(accountId: string): Promise<boolean> {
    return this.resolvePrivateKeyForAccount(accountId) !== null;
  }

  public async getPublicKey(accountId: string): Promise<SignerPublicKeyInfo> {
    const privateKey = this.resolvePrivateKeyForAccount(accountId);
    if (!privateKey) {
      throw new Error(
        `[Security Exception] No authorized signer configured for account "${accountId}". Global operator fallback is prohibited.`
      );
    }

    const pubKey = privateKey.publicKey;
    const isEcdsa = privateKey.type === 'secp256k1';

    return {
      accountId,
      publicKeyHex: pubKey.toStringRaw(),
      keyType: isEcdsa ? 'ECDSA_SECP256K1' : 'ED25519',
    };
  }

  public async signTransaction(
    accountId: string,
    transaction: TransferTransaction
  ): Promise<TransferTransaction> {
    const cleanId = accountId.trim();
    const privateKey = this.resolvePrivateKeyForAccount(cleanId);

    if (!privateKey) {
      throw new Error(
        `[Security Exception] No signer configured for account "${cleanId}". Cannot sign transaction.`
      );
    }

    // 1. Verify transaction payer matches the authorized account ID
    const txPayer = transaction.transactionId?.accountId?.toString();
    if (!txPayer) {
      throw new Error(
        '[Security Exception] Transaction is missing a valid transactionId with payer account.'
      );
    }
    if (txPayer !== cleanId) {
      throw new Error(
        `[Security Exception] Transaction payer mismatch: Transaction is set to payer "${txPayer}", but signer is authorized for "${cleanId}".`
      );
    }

    // 2. Validate public key against Mirror Node on-chain key structure (FAIL CLOSED)
    let mirrorAccount: MirrorAccount | null;
    try {
      mirrorAccount = await getMirrorAccount(cleanId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[Security Exception] Mirror Node verification failed for account "${cleanId}": ${msg}`
      );
    }

    if (!mirrorAccount) {
      throw new Error(
        `[Security Exception] Mirror Node account lookup failed: Account "${cleanId}" could not be retrieved from Mirror Node. Signing rejected.`
      );
    }

    if (mirrorAccount.deleted) {
      throw new Error(
        `[Security Exception] Account "${cleanId}" is marked as deleted on Hedera Mirror Node. Signing rejected.`
      );
    }

    if (!mirrorAccount.key) {
      throw new Error(
        `[Security Exception] Account "${cleanId}" has no valid key structure registered on Hedera Mirror Node. Signing rejected.`
      );
    }

    const keyMatches = keyStructureMatches(
      mirrorAccount.key as MirrorKeyNode,
      privateKey.publicKey
    );

    const isSessionKey = this.isDelegatedSessionKey(cleanId, privateKey);

    if (!keyMatches && !isSessionKey) {
      throw new Error(
        `[Security Exception] Signer public key mismatch: The signer key for "${cleanId}" is not authorized by the on-chain key structure registered on Hedera Mirror Node.`
      );
    }

    // 3. Sign transaction directly with authorized account private key
    privateKey.signTransaction(transaction);

    return transaction;
  }
}

// Export singleton instance
export const delegatedSigner = new DelegatedWalletSigningProvider();
export const defaultDelegatedSigner = delegatedSigner;

