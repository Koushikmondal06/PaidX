import { PAYMENT_TOKEN_ADDRESS } from './base';
import type { Address } from 'viem';

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  native: boolean;
  address?: Address;
  faucetUrl: string;
  faucetName: string;
}

export const FAUCET_CONFIG = {
  ETH: {
    name: 'Google Cloud Sepolia ETH Faucet',
    url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
    backupUrl: 'https://sepoliafaucet.com/',
    description: 'Get free Sepolia ETH for transaction gas',
  },
  USDC: {
    name: 'Official Circle Web3 Faucet',
    url: 'https://faucet.circle.com/',
    description: 'Receive 10 Sepolia testnet USDC instantly',
  },
};

export const SUPPORTED_TOKENS: Record<'ETH' | 'USDC', TokenConfig> = {
  ETH: {
    symbol: 'ETH',
    name: 'Sepolia ETH',
    decimals: 18,
    native: true,
    faucetUrl: FAUCET_CONFIG.ETH.url,
    faucetName: FAUCET_CONFIG.ETH.name,
  },
  USDC: {
    symbol: 'USDC',
    name: 'Circle USDC',
    decimals: 6,
    native: false,
    address: PAYMENT_TOKEN_ADDRESS as Address,
    faucetUrl: FAUCET_CONFIG.USDC.url,
    faucetName: FAUCET_CONFIG.USDC.name,
  },
};

export type SupportedTokenSymbol = keyof typeof SUPPORTED_TOKENS;

