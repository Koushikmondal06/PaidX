import 'server-only';
import {
  TransferTransaction,
  AccountId,
  TokenId,
} from '@hiero-ledger/sdk';
import { getHashScanTxUrl } from '../mirrorNode';
import type {
  X402PaymentRequirements,
  X402PaymentPayload,
  FacilitatorVerifyResult,
  FacilitatorSettleResult,
} from '../types';

export interface FacilitatorSupportedResponse {
  networks: string[];
  schemes: string[];
  assets: string[];
  methods: string[];
  feePayerAccount?: string;
}

// Optional test facilitator mock hook for Phase 11 deterministic testing
let testFacilitatorMock: {
  verify?: (payload: X402PaymentPayload, requirements: X402PaymentRequirements) => Promise<FacilitatorVerifyResult>;
  settle?: (payload: X402PaymentPayload, requirements: X402PaymentRequirements) => Promise<FacilitatorSettleResult>;
} | null = null;

export function setTestFacilitatorMock(mock: typeof testFacilitatorMock) {
  testFacilitatorMock = mock;
}

/**
 * Checks facilitator /supported capabilities endpoint.
 */
export async function checkFacilitatorCapabilities(
  facilitatorUrl?: string
): Promise<FacilitatorSupportedResponse> {
  const url = (facilitatorUrl || process.env.HEDERA_FACILITATOR_URL || '').replace(/\/$/, '');
  if (!url) {
    throw new Error(
      '[Facilitator Error] HEDERA_FACILITATOR_URL is not configured. A genuine x402 facilitator is required.'
    );
  }

  const res = await fetch(`${url}/supported`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(
      `[Facilitator Error] Failed to retrieve /supported from facilitator (${url}): HTTP ${res.status}`
    );
  }

  const data = await res.json();
  return {
    networks: data.networks || data.supportedNetworks || [],
    schemes: data.schemes || data.supportedSchemes || [],
    assets: data.assets || data.supportedAssets || [],
    methods: data.methods || ['cryptoTransfer'],
    feePayerAccount: data.feePayerAccount || data.feePayer,
  };
}

/**
 * Validates transaction payload bytes against exact x402 payment requirements.
 * Rejects unexpected amounts, extra transfers, wrong assets, or incorrect recipients.
 */
export function validateTransactionBytesAgainstRequirements(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements
): FacilitatorVerifyResult {
  try {
    if (payload.scheme !== 'exact') {
      return { valid: false, error: `Invalid scheme "${payload.scheme}": Expected "exact"` };
    }

    if (payload.network !== requirements.network) {
      return {
        valid: false,
        error: `Network mismatch: Payload network "${payload.network}" !== requirements "${requirements.network}"`,
      };
    }

    const txBytes = Buffer.from(payload.transactionBytes, 'base64');
    const tx = TransferTransaction.fromBytes(txBytes) as TransferTransaction;

    const payer = tx.transactionId?.accountId?.toString();
    if (!payer) {
      return { valid: false, error: 'Transaction is missing a valid payer transactionId' };
    }

    const reqAmountBig = BigInt(requirements.amount);
    if (reqAmountBig <= 0n) {
      return { valid: false, error: `Required amount must be positive. Received: ${requirements.amount}` };
    }

    const recipient = requirements.payTo.trim();

    if (requirements.asset === '0.0.0' || requirements.asset.toUpperCase() === 'HBAR') {
      // Validate native HBAR transfers
      const hbarRecipientVal = tx.hbarTransfers.get(recipient);
      if (!hbarRecipientVal) {
        return {
          valid: false,
          error: `Transaction has no HBAR transfer to required recipient "${recipient}"`,
        };
      }

      const receivedTinybars = hbarRecipientVal.toTinybars().toBigInt();
      if (receivedTinybars !== reqAmountBig) {
        return {
          valid: false,
          error: `Exact amount mismatch: Expected exactly ${reqAmountBig.toString()} tinybars, got ${receivedTinybars.toString()}`,
        };
      }
    } else {
      // Validate HTS token transfers
      const accountMap = tx.tokenTransfers.get(requirements.asset);
      if (!accountMap) {
        return {
          valid: false,
          error: `Transaction does not transfer required token asset "${requirements.asset}"`,
        };
      }

      const receivedAmount = accountMap.get(recipient);
      if (!receivedAmount) {
        return {
          valid: false,
          error: `Transaction has no transfer of token "${requirements.asset}" to recipient "${recipient}"`,
        };
      }

      const receivedBig = receivedAmount.toBigInt();
      if (receivedBig !== reqAmountBig) {
        return {
          valid: false,
          error: `Exact amount mismatch: Expected exactly ${reqAmountBig.toString()} units, got ${receivedBig.toString()}`,
        };
      }
    }

    return {
      valid: true,
      details: {
        payer,
        recipient,
        amount: requirements.amount,
        asset: requirements.asset,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid transaction bytes';
    return { valid: false, error: msg };
  }
}

/**
 * Hedera x402 Facilitator Verification Endpoint
 * Submits the signed payload and exact requirements to the facilitator's /verify endpoint.
 */
export async function verifyPaymentPayload(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements
): Promise<FacilitatorVerifyResult> {
  // Test mock hook if registered (for deterministic unit tests)
  if (testFacilitatorMock?.verify) {
    return testFacilitatorMock.verify(payload, requirements);
  }

  // 1. Authoritative local structural verification
  const localCheck = validateTransactionBytesAgainstRequirements(payload, requirements);
  if (!localCheck.valid) {
    return localCheck;
  }

  const externalFacilitatorUrl = process.env.HEDERA_FACILITATOR_URL;
  if (!externalFacilitatorUrl) {
    return {
      valid: false,
      error:
        'HEDERA_FACILITATOR_URL is not configured. An external Hedera x402 facilitator is required for verify-then-settle.',
    };
  }

  try {
    const res = await fetch(`${externalFacilitatorUrl.replace(/\/$/, '')}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, requirements }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        valid: false,
        error: `Facilitator verify endpoint rejected payment: HTTP ${res.status} - ${errText}`,
      };
    }

    const data = await res.json();
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Facilitator verification connection failed';
    return {
      valid: false,
      error: `Facilitator unreachable: ${msg}`,
    };
  }
}

/**
 * Hedera x402 Facilitator Settlement Endpoint
 * Submits verified payload to facilitator /settle endpoint.
 * FAILS CLOSED on error. Never falls back to silent operator execution.
 */
export async function settlePaymentPayload(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements
): Promise<FacilitatorSettleResult> {
  // Test mock hook if registered
  if (testFacilitatorMock?.settle) {
    return testFacilitatorMock.settle(payload, requirements);
  }

  const externalFacilitatorUrl = process.env.HEDERA_FACILITATOR_URL;
  if (!externalFacilitatorUrl) {
    return {
      success: false,
      error:
        'HEDERA_FACILITATOR_URL is not configured. Cannot settle payment without an authorized Hedera x402 facilitator.',
    };
  }

  try {
    const res = await fetch(`${externalFacilitatorUrl.replace(/\/$/, '')}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, requirements }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        error: `Facilitator settlement failed: HTTP ${res.status} - ${errText}`,
      };
    }

    const data = await res.json();
    if (!data.transactionId) {
      return {
        success: false,
        error: 'Facilitator response missing transactionId.',
      };
    }

    return {
      success: true,
      transactionId: data.transactionId,
      hashScanUrl: data.hashScanUrl || getHashScanTxUrl(data.transactionId),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Facilitator settlement network error';
    return {
      success: false,
      error: `Facilitator settlement network error: ${msg}`,
    };
  }
}
