import type { TransferTransaction } from '@hiero-ledger/sdk';

export interface SignerPublicKeyInfo {
  accountId: string;
  publicKeyHex: string;
  keyType: 'ED25519' | 'ECDSA_SECP256K1';
}

/**
 * Replaceable Hedera Wallet Signing Provider Interface.
 * Allows Delegated Signers, HSM/KMS, MPC, or WalletConnect providers
 * to sign TransferTransaction objects without exposing secrets.
 */
export interface IWalletSigningProvider {
  /**
   * Provider identifier (e.g. 'delegated_local', 'kms', 'mock_test')
   */
  readonly providerId: string;

  /**
   * Returns true if this provider has an authorized key registered for this account ID.
   */
  canSign(accountId: string): Promise<boolean>;

  /**
   * Returns public key details for the account.
   */
  getPublicKey(accountId: string): Promise<SignerPublicKeyInfo>;

  /**
   * Signs the TransferTransaction on behalf of the authorized payer account.
   * Validates account ID matches transaction payer.
   */
  signTransaction(
    accountId: string,
    transaction: TransferTransaction
  ): Promise<TransferTransaction>;
}
