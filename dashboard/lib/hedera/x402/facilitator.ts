import 'server-only';
import {
  TransferTransaction,
  AccountId,
  TokenId,
  PrivateKey,
} from '@hiero-ledger/sdk';
import { getHederaClient } from '../client';
import { getHashScanTxUrl } from '../mirrorNode';
import type {
  X402PaymentRequirements,
  X402PaymentPayload,
  FacilitatorVerifyResult,
  FacilitatorSettleResult,
} from '../types';

/**
 * Hedera x402 Facilitator Client
 * Supports both external facilitator HTTP endpoints and authoritative native settlement.
 */
export async function verifyPaymentPayload(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements
): Promise<FacilitatorVerifyResult> {
  const externalFacilitatorUrl = process.env.HEDERA_FACILITATOR_URL;

  if (externalFacilitatorUrl) {
    try {
      const res = await fetch(`${externalFacilitatorUrl.replace(/\/$/, '')}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, requirements }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[Facilitator] External verify failed, using internal verification:', err);
    }
  }

  // Authoritative internal verification of transaction bytes
  try {
    const txBytes = Buffer.from(payload.transactionBytes, 'base64');
    const tx = TransferTransaction.fromBytes(txBytes) as TransferTransaction;

    // Verify scheme & network
    if (payload.scheme !== 'exact') {
      return { valid: false, error: 'Unsupported scheme: expected exact' };
    }

    if (payload.network !== requirements.network) {
      return { valid: false, error: `Network mismatch: expected ${requirements.network}` };
    }

    // Inspect transfers
    const reqAmountNum = Number(requirements.amount);
    let matchedRecipient = false;

    if (requirements.asset === '0.0.0') {
      // HBAR transfers
      const hbarVal = tx.hbarTransfers.get(requirements.payTo);
      if (hbarVal && hbarVal.toTinybars().toNumber() >= reqAmountNum) {
        matchedRecipient = true;
      }
    } else {
      // HTS token transfers
      const accountMap = tx.tokenTransfers.get(requirements.asset);
      if (accountMap) {
        const tokenVal = accountMap.get(requirements.payTo);
        if (tokenVal && tokenVal.toNumber() >= reqAmountNum) {
          matchedRecipient = true;
        }
      }
    }

    if (!matchedRecipient) {
      return {
        valid: false,
        error: `Transaction transfers do not contain required amount ${requirements.amount} to recipient ${requirements.payTo}`,
      };
    }

    return {
      valid: true,
      details: {
        payer: tx.transactionId?.accountId?.toString() || 'unknown',
        recipient: requirements.payTo,
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
 * Settles an x402 payment payload on Hedera
 */
export async function settlePaymentPayload(
  payload: X402PaymentPayload,
  requirements: X402PaymentRequirements
): Promise<FacilitatorSettleResult> {
  const externalFacilitatorUrl = process.env.HEDERA_FACILITATOR_URL;

  if (externalFacilitatorUrl) {
    try {
      const res = await fetch(`${externalFacilitatorUrl.replace(/\/$/, '')}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, requirements }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          transactionId: data.transactionId,
          hashScanUrl: data.hashScanUrl || getHashScanTxUrl(data.transactionId),
        };
      }
    } catch (err) {
      console.warn('[Facilitator] External settle failed, falling back to direct network settlement:', err);
    }
  }

  // Authoritative settlement on Hedera Testnet
  try {
    const client = getHederaClient();
    const txBytes = Buffer.from(payload.transactionBytes, 'base64');
    const tx = TransferTransaction.fromBytes(txBytes) as TransferTransaction;

    // If facilitator private key is available, sign as fee payer
    const facilitatorKeyStr = process.env.HEDERA_FACILITATOR_KEY || process.env.HEDERA_OPERATOR_KEY;
    if (facilitatorKeyStr) {
      try {
        const facilitatorKey = facilitatorKeyStr.startsWith('0x')
          ? PrivateKey.fromStringECDSA(facilitatorKeyStr)
          : PrivateKey.fromString(facilitatorKeyStr);
        await tx.sign(facilitatorKey);
      } catch (signErr) {
        console.warn('[Facilitator] Sign error:', signErr);
      }
    }

    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    const txIdStr = txResponse.transactionId.toString();
    const hashScanUrl = getHashScanTxUrl(txIdStr);

    if (receipt.status.toString() === 'SUCCESS') {
      return {
        success: true,
        transactionId: txIdStr,
        hashScanUrl,
      };
    } else {
      return {
        success: false,
        transactionId: txIdStr,
        hashScanUrl,
        error: `Hedera settlement receipt status: ${receipt.status.toString()}`,
      };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Settlement failed';
    console.error('[Facilitator Settle Exception]:', err);
    return {
      success: false,
      error: msg,
    };
  }
}
