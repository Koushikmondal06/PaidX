import { type Address, type PublicClient, getAddress, isAddress } from 'viem';
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit';
import { getBrowserPublicClient, CHAIN_ID } from '@/lib/chain';

export type UpgradeStatus = 'upgraded' | 'not_upgraded' | 'unknown';

export interface UpgradeStatusResult {
  status: UpgradeStatus;
  delegateAddress?: string;
  isForeignDelegation?: boolean;
  warning?: string;
}

/**
 * Reads the official MetaMask EIP7702StatelessDeleGator implementation address for CHAIN_ID
 * strictly from the MetaMask Smart Accounts Kit environment.
 * Never hardcoded.
 */
export function getOfficial7702DeleGatorAddress(chainId: number = CHAIN_ID): Address {
  try {
    const env = getSmartAccountsEnvironment(chainId);
    const impl = env?.implementations?.EIP7702StatelessDeleGatorImpl;
    if (!impl || !isAddress(impl)) {
      throw new Error(`EIP7702StatelessDeleGatorImpl address not found in Smart Accounts Kit for chain ${chainId}`);
    }
    return impl as Address;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error resolving 7702 environment';
    console.error('[EIP-7702 Environment Error]:', msg);
    throw new Error(msg);
  }
}

/**
 * Authoritatively inspects an account's on-chain bytecode for EIP-7702 delegation.
 * EIP-7702 format: code starts with "0xef0100" followed by 20 bytes (40 hex chars) of delegate contract address.
 * 
 * Rules:
 * - Empty or "0x" -> 'not_upgraded'
 * - Starts with "0xef0100" and delegate equals official MetaMask address -> 'upgraded'
 * - Starts with "0xef0100" but delegate is different -> 'not_upgraded' with foreign delegation warning
 * - RPC error / timeout -> 'unknown' (never guess)
 */
export async function getUpgradeStatus(
  address: Address,
  client?: PublicClient
): Promise<UpgradeStatusResult> {
  if (!address || !isAddress(address)) {
    return { status: 'not_upgraded' };
  }

  try {
    const publicClient = client || getBrowserPublicClient();
    const code = await publicClient.getCode({ address });

    if (!code || code === '0x') {
      return { status: 'not_upgraded' };
    }

    const lowerCode = code.toLowerCase();
    // EIP-7702 designation prefix: 0xef0100 followed by 20-byte address (40 hex characters)
    if (lowerCode.startsWith('0xef0100') && lowerCode.length >= 48) {
      const delegate = `0x${lowerCode.substring(8, 48)}`;
      const officialImpl = getOfficial7702DeleGatorAddress(CHAIN_ID).toLowerCase();

      if (delegate.toLowerCase() === officialImpl) {
        return {
          status: 'upgraded',
          delegateAddress: delegate,
        };
      } else {
        return {
          status: 'not_upgraded',
          delegateAddress: delegate,
          isForeignDelegation: true,
          warning: `Account is delegated to a foreign contract (${delegate}) rather than MetaMask's official StatelessDeleGator.`,
        };
      }
    }

    // Account has bytecode but not 7702 format (e.g. ERC-4337 smart contract)
    return { status: 'not_upgraded' };
  } catch (err: unknown) {
    console.warn('[EIP-7702 getUpgradeStatus RPC notice]:', err);
    return {
      status: 'unknown',
      warning: 'Could not query account bytecode due to RPC error or network timeout.',
    };
  }
}

/**
 * Checks wallet capabilities for EIP-5792 / EIP-7702 (wallet_getCapabilities).
 */
export async function checkWalletCapabilities(
  chainId: number = CHAIN_ID
): Promise<{ ready: boolean; reason?: string }> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return { ready: false, reason: 'MetaMask not detected in browser' };
  }

  try {
    const hexChainId = `0x${chainId.toString(16)}`;
    const capabilities = (await window.ethereum.request({
      method: 'wallet_getCapabilities',
    })) as Record<string, any>;

    const chainCaps = capabilities?.[hexChainId] || capabilities?.[chainId.toString()];
    const atomicBatch = chainCaps?.atomicBatch?.supported ?? false;

    if (atomicBatch) {
      return { ready: true };
    }

    return {
      ready: false,
      reason: 'Wallet does not report atomic batch capabilities (wallet_sendCalls). Please use manual upgrade or update MetaMask.',
    };
  } catch (err: unknown) {
    console.warn('[wallet_getCapabilities notice]:', err);
    return {
      ready: false,
      reason: 'Capability check unsupported by this wallet version. Manual upgrade available in MetaMask settings.',
    };
  }
}

/**
 * Initiates smart account upgrade via MetaMask using a batch of two calls via wallet_sendCalls.
 * Following official MetaMask Smart Accounts Kit EIP-7702 batch pattern.
 */
export async function triggerSmartAccountUpgrade(
  userAddress: Address,
  chainId: number = CHAIN_ID
): Promise<{ success: boolean; callId?: string; error?: string }> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return { success: false, error: 'MetaMask not detected' };
  }

  try {
    const hexChainId = `0x${chainId.toString(16)}`;

    // MetaMask triggers the EIP-7702 upgrade flow when a batch of two calls is submitted
    // Call 1 & 2: empty no-op calls to the user's own address
    const calls = [
      {
        to: userAddress,
        data: '0x',
        value: '0x0',
      },
      {
        to: userAddress,
        data: '0x',
        value: '0x0',
      },
    ];

    const callId = (await window.ethereum.request({
      method: 'wallet_sendCalls',
      params: [
        {
          version: '1.0',
          chainId: hexChainId,
          from: userAddress,
          calls,
        },
      ],
    })) as string;

    return { success: true, callId };
  } catch (err: unknown) {
    const rawMsg =
      (err as any)?.message ||
      (err as any)?.data?.message ||
      (err as any)?.error?.message ||
      (err instanceof Error ? err.message : '') ||
      '';
    const code = (err as any)?.code;

    console.error('[triggerSmartAccountUpgrade Exception]:', { code, message: rawMsg, error: err });

    if (rawMsg.toLowerCase().includes('user rejected') || rawMsg.toLowerCase().includes('denied') || code === 4001) {
      return { success: false, error: 'Upgrade request was rejected in MetaMask.' };
    }

    if (
      code === -32601 ||
      code === 4200 ||
      rawMsg.includes('does not exist') ||
      rawMsg.includes('not supported') ||
      rawMsg.includes('not available') ||
      rawMsg.includes('Method not found')
    ) {
      return {
        success: false,
        error:
          'Your MetaMask version does not support automatic in-browser 7702 batch upgrading (wallet_sendCalls). You can continue with your standard EOA wallet or upgrade manually in MetaMask settings.',
      };
    }

    return { success: false, error: rawMsg || 'Upgrade request failed' };
  }
}

