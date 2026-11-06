import 'server-only';
import {
  TransferTransaction,
  PrivateKey,
  AccountId,
  PublicKey,
} from '@hiero-ledger/sdk';
import type { IWalletSigningProvider, SignerPublicKeyInfo } from './types';
import { getMirrorAccount } from '../mirrorNode';

/**
 * Normalizes account ID string (e.g. "0.0.5449100" -> "0_0_5449100") for environment variable lookups.
 */
function accountIdToEnvSuffix(accountId: string): string {
  return accountId.trim().replace(/\./g, '_');
}

/**
 * Delegated Hedera Signer Provider
 * Manages isolated signing keys per account without global operator key substitution.
 */
export class DelegatedWalletSigningProvider implements IWalletSigningProvider {
  readonly providerId = 'delegated_secure_signer';

  // Secure in-memory account key registry for dynamic agent sessions & test suites
  private accountKeyRegistry = new Map<string, PrivateKey>();

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
        `[Signing Error] No authorized signer configured for account "${accountId}". Global operator fallback is prohibited.`
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
    if (txPayer && txPayer !== cleanId) {
      throw new Error(
        `[Security Exception] Transaction payer mismatch: Transaction is set to payer "${txPayer}", but signer is authorized for "${cleanId}".`
      );
    }

    // 2. Validate public key against Mirror Node on-chain key if available
    try {
      const mirrorAccount = await getMirrorAccount(cleanId);
      if (mirrorAccount && mirrorAccount.key?.key) {
        const onChainKey = mirrorAccount.key.key.toLowerCase().replace(/^0x/, '');
        const signerPubKey = privateKey.publicKey.toStringRaw().toLowerCase().replace(/^0x/, '');

        // If on-chain key is present, verify match
        if (
          onChainKey.length > 0 &&
          !onChainKey.includes(signerPubKey) &&
          !signerPubKey.includes(onChainKey)
        ) {
          throw new Error(
            `[Security Exception] Signer public key mismatch: The signer key for "${cleanId}" does not match the on-chain key registered on Hedera Mirror Node.`
          );
        }
      }
    } catch (err: unknown) {
      // In offline / unit test mode or if mirror node has transient delay, log warning
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Signer public key mismatch')) {
        throw err;
      }
      // Non-blocking for offline/test networks
    }

    // 3. Sign the transaction
    await transaction.sign(privateKey);
    return transaction;
  }
}

// Global default provider instance
export const defaultDelegatedSigner = new DelegatedWalletSigningProvider();
