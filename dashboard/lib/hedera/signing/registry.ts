import type { IWalletSigningProvider } from './types';
import { defaultDelegatedSigner } from './delegatedSigner';

let currentSigningProvider: IWalletSigningProvider = defaultDelegatedSigner;

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
 * Resets signing provider back to default delegated signer.
 */
export function resetWalletSigningProvider(): void {
  currentSigningProvider = defaultDelegatedSigner;
}
