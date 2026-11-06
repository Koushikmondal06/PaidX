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

// Test facilitator mock hook for unit/integration tests
let testFacilitatorMock: {
  supported?: () => Promise<FacilitatorSupportedResponse>;
  verify?: (payload: X402PaymentPayload, requirements: X402PaymentRequirements) => Promise<FacilitatorVerifyResult>;
  settle?: (payload: X402PaymentPayload, requirements: X402PaymentRequirements) => Promise<FacilitatorSettleResult>;
} | null = null;

export function setTestFacilitatorMock(mock: typeof testFacilitatorMock) {
  testFacilitatorMock = mock;
}

/**
 * Checks facilitator /supported capabilities endpoint.
 * Validates that the facilitator supports the requested network, scheme, and asset.
 * FAILS CLOSED if facilitator is unreachable or does not support required parameters.
 */
export async function checkFacilitatorCapabilities(
  facilitatorUrl?: string,
  required?: { network?: string; scheme?: string; asset?: string }
): Promise<FacilitatorSupportedResponse> {
  if (testFacilitatorMock?.supported) {
    const supported = await testFacilitatorMock.supported();
    validateCapabilities(supported, required);
    return supported;
  }

  const url = (facilitatorUrl || process.env.HEDERA_FACILITATOR_URL || '').replace(/\/$/, '');
  if (!url) {
    throw new Error(
      '[Facilitator Error] HEDERA_FACILITATOR_URL is not configured. A genuine x402 facilitator is required.'
    );
  }

  try {
    const res = await fetch(`${url}/supported`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(
        `[Facilitator Error] Facilitator (${url}/supported) returned HTTP ${res.status}`
      );
    }

    const data = await res.json();
    const supported: FacilitatorSupportedResponse = {
      networks: data.networks || data.supportedNetworks || [],
      schemes: data.schemes || data.supportedSchemes || [],
      assets: data.assets || data.supportedAssets || [],
      methods: data.methods || ['cryptoTransfer'],
      feePayerAccount: data.feePayerAccount || data.feePayer,
    };

    validateCapabilities(supported, required);
    return supported;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[Facilitator Error] Failed to verify facilitator capabilities: ${msg}`);
  }
}

function validateCapabilities(
  supported: FacilitatorSupportedResponse,
  required?: { network?: string; scheme?: string; asset?: string }
) {
  if (!required) return;

  if (required.network && !supported.networks.includes(required.network)) {
    throw new Error(
      `[Facilitator Error] Facilitator does not support network "${required.network}". Supported: [${supported.networks.join(', ')}]`
    );
  }

  if (required.scheme && !supported.schemes.includes(required.scheme)) {
    throw new Error(
      `[Facilitator Error] Facilitator does not support scheme "${required.scheme}". Supported: [${supported.schemes.join(', ')}]`
    );
  }

  if (required.asset) {
    const assetUpper = required.asset.toUpperCase();
    const supportedAssetsUpper = supported.assets.map((a) => a.toUpperCase());
    if (
      !supportedAssetsUpper.includes(assetUpper) &&
      !supportedAssetsUpper.includes('ANY') &&
      !supportedAssetsUpper.includes('*')
    ) {
      throw new Error(
        `[Facilitator Error] Facilitator does not support asset "${required.asset}". Supported: [${supported.assets.join(', ')}]`
      );
    }
  }
}

/**
 * Validates transaction payload bytes against exact x402 payment requirements.
 * Rejects unexpected amounts, extra transfers, wrong assets, or incorrect recipients.
 * Enforces zero-tolerance check for extra transfers or third-party recipients.
 * Validates cryptographic signature structure.
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

    if (!payload.transactionBytes) {
      return { valid: false, error: 'Transaction payload is missing transactionBytes' };
    }

    const txBytes = Buffer.from(payload.transactionBytes, 'base64');
    const tx = TransferTransaction.fromBytes(txBytes) as TransferTransaction;

    // 1. Validate Transaction ID & Payer
    const payer = tx.transactionId?.accountId?.toString();
    if (!payer) {
      return { valid: false, error: 'Transaction is missing a valid payer transactionId' };
    }

    // 2. Validate Signature Structure (Fail closed if unsigned)
    const sigMap = tx.getSignatures();
    let sigCount = 0;
    if (sigMap && (sigMap as any)._map) {
      for (const [, nodeMap] of (sigMap as any)._map.entries()) {
        if (nodeMap && nodeMap._map) {
          for (const [, pairMap] of nodeMap._map.entries()) {
            if (pairMap && pairMap._map) {
              sigCount += pairMap._map.size;
            }
          }
        }
      }
    }

    if (sigCount === 0) {
      return {
        valid: false,
        error: 'Transaction signature check failed: No cryptographic signatures present on transaction',
      };
    }

    const reqAmountBig = BigInt(requirements.amount);
    if (reqAmountBig <= 0n) {
      return { valid: false, error: `Required amount must be positive. Received: ${requirements.amount}` };
    }

    const recipient = requirements.payTo.trim();
    const isHbar = requirements.asset === '0.0.0' || requirements.asset.toUpperCase() === 'HBAR';

    if (isHbar) {
      // Reject any unexpected token transfers inside an HBAR payment
      if (tx.tokenTransfers && (tx.tokenTransfers as any)._map && (tx.tokenTransfers as any)._map.size > 0) {
        return {
          valid: false,
          error: 'Security Exception: Transaction contains unauthorized token transfers in an HBAR payment',
        };
      }

      // Check HBAR transfers - MUST have exactly 2 entries (payer and recipient)
      const hbarMap = (tx.hbarTransfers as any)?._map as Map<string, any> | undefined;
      if (!hbarMap || hbarMap.size !== 2) {
        return {
          valid: false,
          error: `Security Exception: Expected exactly 2 HBAR transfers (payer and recipient), got ${hbarMap?.size ?? 0}`,
        };
      }

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

      const hbarPayerVal = tx.hbarTransfers.get(payer);
      if (!hbarPayerVal) {
        return {
          valid: false,
          error: `Transaction has no debit transfer from payer "${payer}"`,
        };
      }

      const payerTinybars = hbarPayerVal.toTinybars().toBigInt();
      if (payerTinybars !== -reqAmountBig) {
        return {
          valid: false,
          error: `Exact debit mismatch: Expected payer debit of exactly -${reqAmountBig.toString()} tinybars, got ${payerTinybars.toString()}`,
        };
      }
    } else {
      // Reject any unexpected HBAR transfers inside a token payment
      if (tx.hbarTransfers && (tx.hbarTransfers as any)._map && (tx.hbarTransfers as any)._map.size > 0) {
        return {
          valid: false,
          error: 'Security Exception: Transaction contains unauthorized HBAR transfers in a token payment',
        };
      }

      // Token transfers: MUST contain ONLY the required token
      const tokenTransferMap = (tx.tokenTransfers as any)?._map as Map<string, any> | undefined;
      if (!tokenTransferMap || tokenTransferMap.size !== 1) {
        return {
          valid: false,
          error: `Security Exception: Expected exactly 1 token asset transfer, got ${tokenTransferMap?.size ?? 0}`,
        };
      }

      const accountMap = tx.tokenTransfers.get(requirements.asset);
      if (!accountMap) {
        return {
          valid: false,
          error: `Transaction does not transfer required token asset "${requirements.asset}"`,
        };
      }

      const innerAccountMap = (accountMap as any)?._map as Map<string, any> | undefined;
      if (!innerAccountMap || innerAccountMap.size !== 2) {
        return {
          valid: false,
          error: `Security Exception: Expected exactly 2 token transfer entries (payer and recipient), got ${innerAccountMap?.size ?? 0}`,
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

      const payerDebitAmount = accountMap.get(payer);
      if (!payerDebitAmount) {
        return {
          valid: false,
          error: `Transaction has no debit of token "${requirements.asset}" from payer "${payer}"`,
        };
      }

      const payerDebitBig = payerDebitAmount.toBigInt();
      if (payerDebitBig !== -reqAmountBig) {
        return {
          valid: false,
          error: `Exact debit mismatch: Expected payer debit of exactly -${reqAmountBig.toString()} units, got ${payerDebitBig.toString()}`,
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
 * Requires facilitator response to contain valid === true.
 * FAILS CLOSED if facilitator is unreachable or returns error.
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
    if (data.valid !== true) {
      return {
        valid: false,
        error: data.error || 'Facilitator verification failed: response valid !== true',
      };
    }

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
