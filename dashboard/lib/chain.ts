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

/**
 * Creates browser-safe viem wallet client backed by MetaMask (window.ethereum).
 * If account is specified, it binds default signer to writeContract/sendTransaction.
 */
export function getBrowserWalletClient(account?: Address) {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('MetaMask is not available in the browser.');
  }
  return createWalletClient({
    account,
    chain: sepolia,
    transport: custom((window as any).ethereum),
  });
}
