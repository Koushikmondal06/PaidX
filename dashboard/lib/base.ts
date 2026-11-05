export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

export const BASE_EXPLORER_URL = 'https://basescan.org';
export const BASE_SEPOLIA_EXPLORER_URL = 'https://sepolia.basescan.org';

export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const BASE_MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export function getBaseScanTxUrl(txHash: string, chainId: number = BASE_MAINNET_CHAIN_ID): string {
  const baseUrl = chainId === BASE_SEPOLIA_CHAIN_ID ? BASE_SEPOLIA_EXPLORER_URL : BASE_EXPLORER_URL;
  return `${baseUrl}/tx/${txHash}`;
}

export function getBaseScanAddressUrl(address: string, chainId: number = BASE_MAINNET_CHAIN_ID): string {
  const baseUrl = chainId === BASE_SEPOLIA_CHAIN_ID ? BASE_SEPOLIA_EXPLORER_URL : BASE_EXPLORER_URL;
  return `${baseUrl}/address/${address}`;
}

export function generateEip681PaymentUri(
  recipientAddress: string,
  amountWei: string | bigint,
  chainId: number = BASE_MAINNET_CHAIN_ID
): string {
  return `ethereum:${recipientAddress}@${chainId}?value=${amountWei.toString()}`;
}

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
