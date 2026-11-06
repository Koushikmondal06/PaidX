/**
 * Hedera Testnet EVM Configuration for MetaMask & Web3 Wallets
 */

export const HEDERA_TESTNET_CHAIN_ID = 296;
export const HEDERA_MAINNET_CHAIN_ID = 295;

export const HEDERA_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_HEDERA_RPC_URL || 'https://testnet.hashio.io/api';

export const HEDERA_TESTNET_CHAIN_PARAMS = {
  chainId: '0x128', // 296 in hexadecimal
  chainName: 'Hedera Testnet',
  nativeCurrency: {
    name: 'HBAR',
    symbol: 'HBAR',
    decimals: 18,
  },
  rpcUrls: [HEDERA_TESTNET_RPC_URL],
  blockExplorerUrls: ['https://hashscan.io/testnet'],
};
