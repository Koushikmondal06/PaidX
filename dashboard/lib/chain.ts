import { http, fallback, createPublicClient, createWalletClient, custom, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { PAYMENT_TOKEN_ADDRESS } from '@/lib/base';

export { sepolia, PAYMENT_TOKEN_ADDRESS };

export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '11155111', 10);

// Validate chain ID configuration
if (sepolia.id !== CHAIN_ID) {
  throw new Error(
    `[Chain Configuration Error] Chain ID mismatch: env NEXT_PUBLIC_CHAIN_ID (${CHAIN_ID}) does not match Ethereum Sepolia chain ID (${sepolia.id})`
  );
}

/**
 * Creates browser-safe viem transport for Sepolia with primary Alchemy/Infura RPC and optional fallback.
 * Enforces timeout: 15_000, retryCount: 3, retryDelay: 300.
 */
export function getBrowserTransport() {
  const primaryRpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (!primaryRpc) {
    throw new Error(
      '[RPC Configuration Error] NEXT_PUBLIC_RPC_URL is empty. Please configure your Alchemy Sepolia RPC URL in .env.local.'
    );
  }

  const primaryHttp = http(primaryRpc, {
    timeout: 15_000,
    retryCount: 3,
    retryDelay: 300,
  });

  const fallbackRpc = process.env.NEXT_PUBLIC_RPC_URL_FALLBACK || process.env.RPC_URL_FALLBACK;
  if (fallbackRpc) {
    const fallbackHttp = http(fallbackRpc, {
      timeout: 15_000,
      retryCount: 3,
      retryDelay: 300,
    });
    return fallback([primaryHttp, fallbackHttp]);
  }

  return primaryHttp;
}

/**
 * Creates authoritative server-only viem transport for Sepolia.
 * Enforces timeout: 15_000, retryCount: 3, retryDelay: 300.
 */
export function getServerTransport() {
  const primaryRpc = process.env.RPC_URL_SERVER || process.env.NEXT_PUBLIC_RPC_URL;
  if (!primaryRpc) {
    throw new Error(
      '[RPC Configuration Error] RPC_URL_SERVER and NEXT_PUBLIC_RPC_URL are empty. Please configure your server RPC URL in .env.local.'
    );
  }

  const primaryHttp = http(primaryRpc, {
    timeout: 15_000,
    retryCount: 3,
    retryDelay: 300,
  });

  const fallbackRpc = process.env.RPC_URL_FALLBACK || process.env.NEXT_PUBLIC_RPC_URL_FALLBACK;
  if (fallbackRpc) {
    const fallbackHttp = http(fallbackRpc, {
      timeout: 15_000,
      retryCount: 3,
      retryDelay: 300,
    });
    return fallback([primaryHttp, fallbackHttp]);
  }

  return primaryHttp;
}

/**
 * Shared client factory for browser RPC calls.
 */
export function getBrowserPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: getBrowserTransport(),
  });
}

/**
 * Shared client factory for authoritative backend RPC calls.
 */
export function getServerPublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: getServerTransport(),
  });
}

export const SEPOLIA_CHAIN_ID_HEX = '0xaa36a7'; // 11155111

/**
 * Ensures MetaMask / injected web3 provider is connected to Ethereum Sepolia (11155111).
 * If the current chain is not Sepolia, prompts MetaMask to switch or add the chain.
 */
export async function ensureSepoliaNetwork(ethereum?: any): Promise<void> {
  const provider = ethereum || (typeof window !== 'undefined' ? (window as any).ethereum : null);
  if (!provider || !provider.request) {
    throw new Error('MetaMask is not available in the browser.');
  }

  try {
    const currentChainId = await provider.request({ method: 'eth_chainId' });
    if (typeof currentChainId === 'string' && currentChainId.toLowerCase() === SEPOLIA_CHAIN_ID_HEX.toLowerCase()) {
      return;
    }

    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (switchError: any) {
    // 4902 indicates that the chain has not been added to MetaMask
    if (switchError?.code === 4902 || switchError?.message?.includes('4902')) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: SEPOLIA_CHAIN_ID_HEX,
            chainName: 'Sepolia',
            nativeCurrency: {
              name: 'Sepolia Ether',
              symbol: 'ETH',
              decimals: 18,
            },
            rpcUrls: ['https://rpc.sepolia.org', 'https://sepolia.gateway.tenderly.co'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Creates browser-safe viem wallet client backed by MetaMask (window.ethereum).
 * If account is specified, it binds default signer to writeContract/sendTransaction.
 * Automatically ensures MetaMask is switched to Ethereum Sepolia before creating the client.
 */
export async function getBrowserWalletClient(account?: Address) {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask is not available in the browser.');
  }
  await ensureSepoliaNetwork((window as any).ethereum);
  return createWalletClient({
    account,
    chain: sepolia,
    transport: custom((window as any).ethereum),
  });
}
