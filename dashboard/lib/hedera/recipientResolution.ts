import {
  getMirrorAccount,
  getMirrorAccountByEvmAddress,
  type MirrorAccount,
} from './mirrorNode';
import { isValidHederaAccountId } from './client';

export interface RecipientResolutionResult {
  valid: boolean;
  recipient: string; // The native Hedera account ID, e.g. "0.0.11334921"
  originalInput: string;
  isEvmAddress: boolean;
  evmAddress?: string;
  recipientVerified: boolean;
  recipientVerificationSource: 'hedera_mirror_node' | null;
  network: string;
  error?: string;
  errorCode?: string;
  deleted?: boolean;
}

/**
 * Checks whether an address string conforms to 20-byte EVM hex format (0x...).
 */
export function isEvmAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

/**
 * Checks whether a network string is a supported Hedera network.
 */
export function isHederaNetwork(network: string): boolean {
  if (!network || typeof network !== 'string') return false;
  const clean = network.trim().toLowerCase();
  return (
    clean === 'hedera:testnet' ||
    clean === 'hedera-testnet' ||
    clean === 'testnet' ||
    clean === 'hedera:mainnet' ||
    clean === 'hedera-mainnet' ||
    clean === 'mainnet'
  );
}

/**
 * Authoritatively resolves and verifies a payment recipient on the Hedera Mirror Node.
 *
 * For Hedera EVM addresses:
 * - Queries the Hedera Mirror Node (/api/v1/accounts/{evmAddress}).
 * - Resolves the EVM address to its native Hedera account ID.
 * - Confirms the returned evm_address matches the requested address (case-insensitive).
 * - Rejects deleted or non-existent accounts.
 *
 * For native account IDs:
 * - Verifies the account exists on the selected Hedera network via Mirror Node.
 * - Rejects deleted or non-existent accounts.
 * - Never relies solely on syntax validation.
 *
 * Never trusts client-supplied EVM-to-account mappings.
 */
export async function resolveAndVerifyRecipientAccount({
  recipient,
  network = 'hedera:testnet',
}: {
  recipient: string;
  network?: string;
}): Promise<RecipientResolutionResult> {
  const originalInput = (recipient || '').trim();

  // 1. Verify Network
  if (network && !isHederaNetwork(network)) {
    return {
      valid: false,
      recipient: originalInput,
      originalInput,
      isEvmAddress: isEvmAddress(originalInput),
      recipientVerified: false,
      recipientVerificationSource: null,
      network,
      error: `Unsupported network "${network}". Only Hedera networks are supported.`,
      errorCode: 'UNSUPPORTED_NETWORK',
    };
  }

  const effectiveNetwork = network || 'hedera:testnet';

  // 2. Empty / Missing Address Check
  if (!originalInput) {
    return {
      valid: false,
      recipient: '',
      originalInput,
      isEvmAddress: false,
      recipientVerified: false,
      recipientVerificationSource: null,
      network: effectiveNetwork,
      error: 'Recipient address is required.',
      errorCode: 'INVALID_RECIPIENT_FORMAT',
    };
  }

  // 3. Hedera EVM Address Resolution (e.g. 0x9f5aEA90e65bAb8fbC49385F5076391A6a26eD28)
  if (isEvmAddress(originalInput)) {
    const cleanEvm = originalInput.toLowerCase();
    let mirrorAccount: MirrorAccount | null = null;

    try {
      mirrorAccount = await getMirrorAccountByEvmAddress(cleanEvm);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        recipient: originalInput,
        originalInput,
        isEvmAddress: true,
        evmAddress: originalInput,
        recipientVerified: false,
        recipientVerificationSource: null,
        network: effectiveNetwork,
        error: `Mirror Node query failed for EVM address "${originalInput}": ${msg}`,
        errorCode: 'MIRROR_NODE_ERROR',
      };
    }

    if (!mirrorAccount || !mirrorAccount.account) {
      return {
        valid: false,
        recipient: originalInput,
        originalInput,
        isEvmAddress: true,
        evmAddress: originalInput,
        recipientVerified: false,
        recipientVerificationSource: null,
        network: effectiveNetwork,
        error: `Recipient account for EVM address "${originalInput}" does not exist on Hedera network.`,
        errorCode: 'RECIPIENT_NOT_FOUND',
      };
    }

    if (mirrorAccount.deleted === true) {
      return {
        valid: false,
        recipient: mirrorAccount.account,
        originalInput,
        isEvmAddress: true,
        evmAddress: mirrorAccount.evm_address || originalInput,
        recipientVerified: false,
        recipientVerificationSource: 'hedera_mirror_node',
        network: effectiveNetwork,
        deleted: true,
        error: `Recipient account for EVM address "${originalInput}" has been deleted on Hedera network.`,
        errorCode: 'RECIPIENT_DELETED',
      };
    }

    // Verify returned EVM address matches requested address (case-insensitive)
    const returnedEvm = (mirrorAccount.evm_address || '').trim().toLowerCase();
    if (returnedEvm && returnedEvm !== cleanEvm) {
      return {
        valid: false,
        recipient: mirrorAccount.account,
        originalInput,
        isEvmAddress: true,
        evmAddress: mirrorAccount.evm_address,
        recipientVerified: false,
        recipientVerificationSource: 'hedera_mirror_node',
        network: effectiveNetwork,
        error: `EVM address mismatch: Mirror Node returned "${mirrorAccount.evm_address}" which does not match requested "${originalInput}".`,
        errorCode: 'EVM_ADDRESS_MISMATCH',
      };
    }

    if (!isValidHederaAccountId(mirrorAccount.account)) {
      return {
        valid: false,
        recipient: originalInput,
        originalInput,
        isEvmAddress: true,
        recipientVerified: false,
        recipientVerificationSource: null,
        network: effectiveNetwork,
        error: `Resolved account ID "${mirrorAccount.account}" is not a valid Hedera native account ID.`,
        errorCode: 'INVALID_RESOLVED_ACCOUNT',
      };
    }

    return {
      valid: true,
      recipient: mirrorAccount.account,
      originalInput,
      isEvmAddress: true,
      evmAddress: mirrorAccount.evm_address || originalInput,
      recipientVerified: true,
      recipientVerificationSource: 'hedera_mirror_node',
      network: effectiveNetwork,
      deleted: false,
    };
  }

  // 4. Native Hedera Account ID Verification (e.g. 0.0.11334921)
  if (isValidHederaAccountId(originalInput)) {
    let mirrorAccount: MirrorAccount | null = null;

    try {
      mirrorAccount = await getMirrorAccount(originalInput);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        valid: false,
        recipient: originalInput,
        originalInput,
        isEvmAddress: false,
        recipientVerified: false,
        recipientVerificationSource: null,
        network: effectiveNetwork,
        error: `Mirror Node query failed for account "${originalInput}": ${msg}`,
        errorCode: 'MIRROR_NODE_ERROR',
      };
    }

    if (!mirrorAccount || !mirrorAccount.account) {
      return {
        valid: false,
        recipient: originalInput,
        originalInput,
        isEvmAddress: false,
        recipientVerified: false,
        recipientVerificationSource: null,
        network: effectiveNetwork,
        error: `Recipient account "${originalInput}" does not exist on Hedera network.`,
        errorCode: 'RECIPIENT_NOT_FOUND',
      };
    }

    if (mirrorAccount.deleted === true) {
      return {
        valid: false,
        recipient: originalInput,
        originalInput,
        isEvmAddress: false,
        evmAddress: mirrorAccount.evm_address || undefined,
        recipientVerified: false,
        recipientVerificationSource: 'hedera_mirror_node',
        network: effectiveNetwork,
        deleted: true,
        error: `Recipient account "${originalInput}" has been deleted on Hedera network.`,
        errorCode: 'RECIPIENT_DELETED',
      };
    }

    return {
      valid: true,
      recipient: mirrorAccount.account,
      originalInput,
      isEvmAddress: false,
      evmAddress: mirrorAccount.evm_address || undefined,
      recipientVerified: true,
      recipientVerificationSource: 'hedera_mirror_node',
      network: effectiveNetwork,
      deleted: false,
    };
  }

  // 5. Invalid Address Format
  return {
    valid: false,
    recipient: originalInput,
    originalInput,
    isEvmAddress: false,
    recipientVerified: false,
    recipientVerificationSource: null,
    network: effectiveNetwork,
    error: `Invalid recipient address format: "${originalInput}". Expected native Hedera account ID (0.0.x) or 40-hex EVM address (0x...).`,
    errorCode: 'INVALID_RECIPIENT_FORMAT',
  };
}
