import type { IWalletSigningProvider, SignerPublicKeyInfo } from './types';
import { defaultDelegatedSigner } from './delegatedSigner';
import { defaultMpcSigner } from './mpcSigner';
import type { TransferTransaction } from '@hiero-ledger/sdk';

/**
 * Unified Wallet Signing Provider
 * Intelligently routes signing requests to the MPC Threshold Signer when an account
 * has an active MPC enrollment, and falls back to Delegated Signer otherwise.
 */
export class UnifiedWalletSigningProvider implements IWalletSigningProvider {
  readonly providerId = 'unified_mpc_delegated_signer';

  public async canSign(accountId: string): Promise<boolean> {
    if (await defaultMpcSigner.canSign(accountId)) {
      return true;
    }
    return defaultDelegatedSigner.canSign(accountId);
  }

  public async getPublicKey(accountId: string): Promise<SignerPublicKeyInfo> {
    if (await defaultMpcSigner.canSign(accountId)) {
      return defaultMpcSigner.getPublicKey(accountId);
    }
    return defaultDelegatedSigner.getPublicKey(accountId);
  }

  public async signTransaction(
    accountId: string,
    transaction: TransferTransaction
  ): Promise<TransferTransaction> {
    if (await defaultMpcSigner.canSign(accountId)) {
      // Deterministic routing: when account is enrolled in MPC, strictly use MPC signer
      // and fail closed on error (never silently fall back to delegated signing).
      return defaultMpcSigner.signTransaction(accountId, transaction);
    }
    if (await defaultDelegatedSigner.canSign(accountId)) {
      return defaultDelegatedSigner.signTransaction(accountId, transaction);
    }
    throw new Error(`[Signing Registry] No authorized signing provider found for account "${accountId}".`);
  }
}

export const unifiedSigningProvider = new UnifiedWalletSigningProvider();
let currentSigningProvider: IWalletSigningProvider = unifiedSigningProvider;

/**
 * Returns the active Hedera Wallet Signing Provider.
 */
export function getWalletSigningProvider(): IWalletSigningProvider {
  return currentSigningProvider;
}

/**
 * Sets a custom signing provider (e.g., KMS, MPC, or Mock for tests).
 */
export function setWalletSigningProvider(provider: IWalletSigningProvider): void {
  currentSigningProvider = provider;
}

/**
 * Resets signing provider back to default unified signer.
 */
export function resetWalletSigningProvider(): void {
  currentSigningProvider = unifiedSigningProvider;
}
