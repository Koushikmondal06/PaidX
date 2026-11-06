/**
 * Hedera & x402 Types for PaidX Agentic Wallet
 */

export type HederaNetwork = 'hedera:testnet' | 'hedera:mainnet';

export interface HtsTokenConfig {
  tokenId: string; // e.g. "0.0.5449156"
  symbol: string;  // e.g. "USDC"
  name: string;
  decimals: number;
  isNativeHbar?: boolean;
}

/**
 * Standard testnet tokens for PaidX on Hedera Testnet.
 * Testnet USDC: Official Circle/Hedera testnet USDC token ID or configured fallback.
 */
export const HEDERA_TESTNET_USDC: HtsTokenConfig = {
  tokenId: process.env.HEDERA_USDC_TOKEN_ID || '0.0.5449156',
  symbol: 'USDC',
  name: 'USD Coin (Testnet)',
  decimals: 6,
};

export const HEDERA_TESTNET_HBAR: HtsTokenConfig = {
  tokenId: '0.0.0',
  symbol: 'HBAR',
  name: 'Hedera Native HBAR',
  decimals: 8,
  isNativeHbar: true,
};

export const SUPPORTED_HEDERA_ASSETS: Record<string, HtsTokenConfig> = {
  USDC: HEDERA_TESTNET_USDC,
  HBAR: HEDERA_TESTNET_HBAR,
};

/**
 * Hedera x402 Payment Requirements
 * Scheme: "exact" (Hedera x402 exact payment scheme)
 */
export interface X402PaymentRequirements {
  scheme: 'exact';
  network: HederaNetwork;
  amount: string; // Atomic units (e.g. "5000000" for 5 USDC with 6 decimals)
  asset: string;  // HTS Token ID (e.g. "0.0.5449156") or "0.0.0" for HBAR
  payTo: string;  // Recipient Hedera Account ID (e.g. "0.0.123456")
  maxTimeoutSeconds: number;
  extra?: {
    feePayer?: string; // Facilitator account sponsoring network fees
    paymentReference?: string;
  };
}

/**
 * Hedera x402 Payment Payload submitted by the client
 */
export interface X402PaymentPayload {
  scheme: 'exact';
  network: HederaNetwork;
  transactionBytes: string; // Base64-encoded signed Hedera TransferTransaction
  clientSaleId: string;
}

/**
 * Facilitator Verification Result
 */
export interface FacilitatorVerifyResult {
  valid: boolean;
  error?: string;
  details?: {
    payer: string;
    recipient: string;
    amount: string;
    asset: string;
  };
}

/**
 * Facilitator Settlement Result
 */
export interface FacilitatorSettleResult {
  success: boolean;
  transactionId?: string; // e.g. "0.0.123456@1700000000.000000000"
  hashScanUrl?: string;
  error?: string;
}

/**
 * Hedera Consensus Service (HCS) Audit Event
 */
export interface HcsAuditEvent {
  event: 'X402_WALLET_PAYMENT_SETTLED';
  agentId: string;
  payer: string;
  recipient: string;
  amountAtomic: string;
  amountDisplay: string;
  asset: string;
  network: string;
  transactionId: string;
  timestamp: string;
}
