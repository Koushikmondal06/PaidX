/**
 * Testnet Chain Configuration for PaidX
 * Reads exclusively from environment variables with Ethereum Sepolia (11155111) default.
 * Hard rule: Never hardcode chain ID or explorer URLs.
 */

export const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '11155111', 10);
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || '';
export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://sepolia.etherscan.io').replace(/\/$/, '');
export const PAYMENT_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS || '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238').toLowerCase();

export function getExplorerTxUrl(txHash: string): string {
  if (!txHash) return '#';
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function getExplorerAddressUrl(address: string): string {
  if (!address) return '#';
  return `${EXPLORER_URL}/address/${address}`;
}

export function getBaseScanTxUrl(txHash: string): string {
  return getExplorerTxUrl(txHash);
}

export function getBaseScanAddressUrl(address: string): string {
  return getExplorerAddressUrl(address);
}

export function generateEip681PaymentUri(
  recipientAddress: string,
  amountWei: string | bigint,
  chainId: number = CHAIN_ID
): string {
  return `ethereum:${recipientAddress}@${chainId}?value=${amountWei.toString()}`;
}

export function truncateAddress(address?: string | null): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
