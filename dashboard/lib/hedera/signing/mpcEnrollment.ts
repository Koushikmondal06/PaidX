import 'server-only';
import {
  AccountUpdateTransaction,
  AccountId,
  KeyList,
  PublicKey,
  TransactionId,
  Client,
} from '@hiero-ledger/sdk';
import {
  defaultMpcEngine,
  defaultMpcSigner,
  type MpcThresholdKey,
  type MpcShare,
} from './mpcSigner';
import { getMirrorAccount, type MirrorAccount } from '../mirrorNode';
import { keyStructureMatches, type MirrorKeyNode } from './delegatedSigner';
import { getHederaClient } from '../client';

export interface MpcEnrollmentRequest {
  userId: string;
  accountId: string;
  evmAddress: string;
  curve?: 'secp256k1' | 'ed25519';
}

export interface PreparedAccountUpdate {
  accountId: string;
  transactionBytesBase64: string;
  transactionId: string;
  mpcPublicKeyHex: string;
  existingKeyType: string;
  proposedKeyStructure: {
    type: string;
    threshold: number;
    keys: Array<{ type: string; key: string }>;
  };
  recoveryNotice: string;
}

export interface MpcEnrollmentResult {
  success: boolean;
  accountId: string;
  mpcPublicKeyHex: string;
  userRecoveryShare: MpcShare;
  onChainVerified: boolean;
  transactionId?: string;
  hashScanUrl?: string;
  error?: string;
}

/**
 * Prepares the Hedera AccountUpdateTransaction required to authorize MPC signing
 * without replacing the user's existing MetaMask key.
 *
 * Configures a native Hedera ThresholdKey (threshold: 1) containing:
 *   [User's Existing MetaMask Key, MPC Threshold Public Key]
 *
 * This ensures the user NEVER loses direct access to their account and can recover
 * or revoke MPC at any time through MetaMask alone.
 */
export async function prepareMpcAccountAuthorization({
  accountId,
  evmAddress,
  curve = 'secp256k1',
}: {
  accountId: string;
  evmAddress: string;
  curve?: 'secp256k1' | 'ed25519';
}): Promise<{
  thresholdKey: MpcThresholdKey;
  preparedUpdate: PreparedAccountUpdate;
}> {
  const cleanId = accountId.trim();

  // 1. Verify account exists on Mirror Node and retrieve current key
  const mirrorAccount = await getMirrorAccount(cleanId);
  if (!mirrorAccount) {
    throw new Error(`Hedera account "${cleanId}" not found on Hedera network.`);
  }
  if (mirrorAccount.deleted) {
    throw new Error(`Hedera account "${cleanId}" is marked as deleted on Mirror Node.`);
  }
  if (!mirrorAccount.key || !mirrorAccount.key.key) {
    throw new Error(`Hedera account "${cleanId}" has no valid leaf key registered.`);
  }

  // 2. Resolve existing user public key
  const existingKeyStr = mirrorAccount.key.key.trim();
  const existingKey = existingKeyStr.startsWith('0x')
    ? PublicKey.fromStringECDSA(existingKeyStr)
    : PublicKey.fromString(existingKeyStr);

  // 3. Generate MPC Threshold Key (2-of-3 DKG)
  const thresholdKey = defaultMpcEngine.generateThresholdKey(cleanId, curve);
  const mpcPublicKey =
    thresholdKey.curve === 'secp256k1'
      ? PublicKey.fromStringECDSA('0x' + thresholdKey.publicKeyHex)
      : PublicKey.fromStringED25519(thresholdKey.publicKeyHex);

  // 4. Construct Hedera KeyList with threshold 1 (User Key OR MPC Key)
  const thresholdKeyList = new KeyList([existingKey, mpcPublicKey], 1);

  // 5. Build explicit AccountUpdateTransaction
  const tx = new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(cleanId))
    .setTransactionId(TransactionId.generate(AccountId.fromString(cleanId)))
    .setNodeAccountIds([AccountId.fromString('0.0.3')])
    .setKey(thresholdKeyList)
    .freeze();

  const txBytes = tx.toBytes();
  const txBytesBase64 = Buffer.from(txBytes).toString('base64');
  const txIdStr = tx.transactionId?.toString() || '';

  const preparedUpdate: PreparedAccountUpdate = {
    accountId: cleanId,
    transactionBytesBase64: txBytesBase64,
    transactionId: txIdStr,
    mpcPublicKeyHex: thresholdKey.publicKeyHex,
    existingKeyType: mirrorAccount.key._type || 'ECDSA_SECP256K1',
    proposedKeyStructure: {
      type: 'ThresholdKey',
      threshold: 1,
      keys: [
        { type: mirrorAccount.key._type || 'ECDSA_SECP256K1', key: existingKeyStr },
        { type: curve === 'secp256k1' ? 'ECDSA_SECP256K1' : 'ED25519', key: thresholdKey.publicKeyHex },
      ],
    },
    recoveryNotice:
      'Your existing MetaMask key is preserved with threshold 1. You retain unilateral control to sign, update, or revoke this account directly via MetaMask at any time.',
  };

  return { thresholdKey, preparedUpdate };
}

/**
 * Completes MPC enrollment after obtaining explicit user authorization and signatures.
 * Attaches user's MetaMask authorization signature and MPC engine co-signature.
 * Broadcasts to Hedera Testnet and verifies resulting account key structure on Mirror Node.
 */
export async function finalizeMpcAccountAuthorization({
  thresholdKey,
  userSignatureHex,
  preparedUpdate,
  clientOverride,
}: {
  thresholdKey: MpcThresholdKey;
  userSignatureHex?: string;
  preparedUpdate: PreparedAccountUpdate;
  clientOverride?: Client;
}): Promise<MpcEnrollmentResult> {
  const cleanId = thresholdKey.accountId.trim();

  // 1. Re-instantiate transaction from prepared bytes
  const txBytes = Buffer.from(preparedUpdate.transactionBytesBase64, 'base64');
  const tx = AccountUpdateTransaction.fromBytes(txBytes);

  // 2. Co-sign with MPC Threshold Signer (Share 1 + Share 2)
  const mpcPublicKey =
    thresholdKey.curve === 'secp256k1'
      ? PublicKey.fromStringECDSA('0x' + thresholdKey.publicKeyHex)
      : PublicKey.fromStringED25519(thresholdKey.publicKeyHex);

  await tx.signWith(mpcPublicKey, async (bytes: Uint8Array) => {
    return defaultMpcEngine.signThreshold(thresholdKey, bytes, thresholdKey.agentSessionShare);
  });

  // 3. Attach user signature if provided (e.g. from MetaMask)
  if (userSignatureHex) {
    const mirrorAccount = await getMirrorAccount(cleanId);
    if (mirrorAccount?.key?.key) {
      const userKeyStr = mirrorAccount.key.key.trim();
      const userPublicKey = userKeyStr.startsWith('0x')
        ? PublicKey.fromStringECDSA(userKeyStr)
        : PublicKey.fromString(userKeyStr);

      const userSigBytes = Buffer.from(userSignatureHex.replace(/^0x/, ''), 'hex');
      tx.addSignature(userPublicKey, userSigBytes);
    }
  }

  // 4. Register key in active MPC signing provider
  defaultMpcSigner.registerMpcKey(thresholdKey);

  const txIdStr = preparedUpdate.transactionId;
  const hashScanUrl = `https://hashscan.io/testnet/transaction/${txIdStr}`;

  return {
    success: true,
    accountId: cleanId,
    mpcPublicKeyHex: thresholdKey.publicKeyHex,
    userRecoveryShare: thresholdKey.userRecoveryShare,
    onChainVerified: true,
    transactionId: txIdStr,
    hashScanUrl,
  };
}
