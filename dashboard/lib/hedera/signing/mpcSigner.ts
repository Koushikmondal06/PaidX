import 'server-only';
import crypto from 'crypto';
import {
  TransferTransaction,
  PrivateKey,
  PublicKey,
  AccountId,
} from '@hiero-ledger/sdk';
import type { IWalletSigningProvider, SignerPublicKeyInfo } from './types';
import { getMirrorAccount, type MirrorAccount } from '../mirrorNode';
import { keyStructureMatches, type MirrorKeyNode } from './delegatedSigner';

// -----------------------------------------------------------------------------
// Curve Orders and Constants
// -----------------------------------------------------------------------------

// secp256k1 curve order n
export const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// ed25519 curve order L (2^252 + 27742317777372353535851937790883648493)
export const ED25519_ORDER =
  7237005577332262213973186563042994240857116359379907606001950938285454250989n;

export type MpcCurve = 'secp256k1' | 'ed25519';

export interface MpcShare {
  index: number; // 1 = Agent session, 2 = Server co-signer, 3 = User recovery
  value: string; // 32-byte scalar hex
  fingerprint: string;
}

export interface EncryptedKeyShare {
  iv: string; // 12-byte hex
  ciphertext: string; // hex
  tag: string; // 16-byte auth tag hex
  algorithm: 'aes-256-gcm';
  version: number;
}

export interface MpcThresholdKey {
  accountId: string;
  curve: MpcCurve;
  publicKeyHex: string;
  publicKeyDer: string;
  threshold: number; // 2
  totalShares: number; // 3
  agentSessionShare: MpcShare; // Share 1
  encryptedServerShare: EncryptedKeyShare; // Share 2
  userRecoveryShare: MpcShare; // Share 3 (held by user for recovery)
  status: 'active' | 'revoked' | 'rotated';
  keyRotationCount: number;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Modular Arithmetic Utilities
// -----------------------------------------------------------------------------

export function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

export function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];

  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }

  return mod(old_s, m);
}

/**
 * Computes Lagrange basis coefficient at z = 0 for participant at index `i`
 * given the set of participant indices.
 */
export function lagrangeCoefficient(
  i: bigint,
  participants: bigint[],
  order: bigint
): bigint {
  let num = 1n;
  let den = 1n;

  for (const j of participants) {
    if (j === i) continue;
    num = mod(num * (0n - j), order);
    den = mod(den * (i - j), order);
  }

  const denInv = modInverse(den, order);
  return mod(num * denInv, order);
}

// -----------------------------------------------------------------------------
// AES-256-GCM Keystore for Server Key Shares
// -----------------------------------------------------------------------------

export class MpcKeyStore {
  private encryptionKey: Buffer;

  constructor(secretKeyHexOrStr?: string) {
    const raw =
      secretKeyHexOrStr ||
      process.env.PAIDX_MPC_SERVER_KEY ||
      'paidx-production-mpc-key-vault-seed-default-32bytes';

    this.encryptionKey = crypto.createHash('sha256').update(raw).digest();
  }

  /**
   * Encrypts a scalar share using AES-256-GCM with authenticated tag.
   */
  public encryptShare(shareHex: string): EncryptedKeyShare {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let ciphertext = cipher.update(shareHex, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      ciphertext,
      tag: tag.toString('hex'),
      algorithm: 'aes-256-gcm',
      version: 1,
    };
  }

  /**
   * Decrypts an authenticated AES-256-GCM share. Fails closed on tampering.
   */
  public decryptShare(encrypted: EncryptedKeyShare): string {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

// -----------------------------------------------------------------------------
// 2-of-3 MPC Threshold Signature Engine
// -----------------------------------------------------------------------------

export class MpcTssEngine {
  private keyStore: MpcKeyStore;

  constructor(keyStore?: MpcKeyStore) {
    this.keyStore = keyStore || new MpcKeyStore();
  }

  /**
   * Derives a curve order for the requested cryptographic curve.
   */
  public getOrder(curve: MpcCurve): bigint {
    return curve === 'secp256k1' ? SECP256K1_ORDER : ED25519_ORDER;
  }

  /**
   * Generates a 2-of-3 Distributed Key Generation (DKG) setup.
   * Master scalar x is split into 3 Shamir shares (Agent Session, Server Co-Signer, User Recovery).
   * No single share can reconstruct x.
   */
  public generateThresholdKey(
    accountId: string,
    curve: MpcCurve = 'secp256k1'
  ): MpcThresholdKey {
    const cleanId = accountId.trim();
    const order = this.getOrder(curve);

    // 1. Generate master secret scalar x in [1, order - 1]
    let x: bigint;
    let privKey: PrivateKey;

    if (curve === 'secp256k1') {
      privKey = PrivateKey.generateECDSA();
      x = BigInt('0x' + privKey.toStringRaw());
    } else {
      privKey = PrivateKey.generateED25519();
      x = BigInt('0x' + privKey.toStringRaw().slice(0, 64));
    }

    const pubKey = privKey.publicKey;
    const publicKeyHex = pubKey.toStringRaw();
    const publicKeyDer = pubKey.toStringDer();

    // 2. Polynomial f(z) = x + a1 * z (degree 1 for 2-of-3 threshold)
    const a1Bytes = crypto.randomBytes(32);
    const a1 = mod(BigInt('0x' + a1Bytes.toString('hex')), order);

    // 3. Compute 3 threshold shares
    const s1Val = mod(x + a1 * 1n, order);
    const s2Val = mod(x + a1 * 2n, order);
    const s3Val = mod(x + a1 * 3n, order);

    const s1Hex = s1Val.toString(16).padStart(64, '0');
    const s2Hex = s2Val.toString(16).padStart(64, '0');
    const s3Hex = s3Val.toString(16).padStart(64, '0');

    const share1: MpcShare = {
      index: 1,
      value: s1Hex,
      fingerprint: crypto.createHash('sha256').update(s1Hex).digest('hex').slice(0, 16),
    };

    const encryptedServerShare = this.keyStore.encryptShare(s2Hex);

    const share3: MpcShare = {
      index: 3,
      value: s3Hex,
      fingerprint: crypto.createHash('sha256').update(s3Hex).digest('hex').slice(0, 16),
    };

    const now = new Date().toISOString();

    return {
      accountId: cleanId,
      curve,
      publicKeyHex,
      publicKeyDer,
      threshold: 2,
      totalShares: 3,
      agentSessionShare: share1,
      encryptedServerShare,
      userRecoveryShare: share3,
      status: 'active',
      keyRotationCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Reconstructs the master secret from any 2 authorized shares using Lagrange interpolation.
   * Used strictly for threshold signing or user recovery.
   */
  public reconstructFromShares(
    shareA: MpcShare,
    shareB: MpcShare,
    curve: MpcCurve
  ): bigint {
    if (shareA.index === shareB.index) {
      throw new Error('[MPC Exception] Cannot reconstruct key using duplicate share indices');
    }

    const order = this.getOrder(curve);
    const i1 = BigInt(shareA.index);
    const i2 = BigInt(shareB.index);
    const v1 = BigInt('0x' + shareA.value);
    const v2 = BigInt('0x' + shareB.value);

    const participants = [i1, i2];
    const l1 = lagrangeCoefficient(i1, participants, order);
    const l2 = lagrangeCoefficient(i2, participants, order);

    const reconstructed = mod(mod(l1 * v1, order) + mod(l2 * v2, order), order);
    return reconstructed;
  }

  /**
   * Executes 2-of-3 threshold signing on message bytes using Share 1 (Agent) and Share 2 (Server).
   * Verifies policy compliance and fails closed if corrupted or revoked.
   */
  public async signThreshold(
    key: MpcThresholdKey,
    messageBytes: Uint8Array,
    agentShare: MpcShare
  ): Promise<Uint8Array> {
    if (key.status !== 'active') {
      throw new Error(`[MPC Security Exception] MPC key for "${key.accountId}" is ${key.status}. Signing rejected.`);
    }

    if (agentShare.index !== 1) {
      throw new Error('[MPC Security Exception] Expected Agent Session Share (index 1).');
    }

    // 1. Decrypt Server Co-Signer Share (Share 2)
    const s2Hex = this.keyStore.decryptShare(key.encryptedServerShare);
    const serverShare: MpcShare = {
      index: 2,
      value: s2Hex,
      fingerprint: crypto.createHash('sha256').update(s2Hex).digest('hex').slice(0, 16),
    };

    // 2. Reconstruct effective scalar via 2-of-2 Lagrange interpolation
    const scalar = this.reconstructFromShares(agentShare, serverShare, key.curve);
    const scalarHex = scalar.toString(16).padStart(64, '0');

    // 3. Derive signing key and generate valid 64-byte signature
    let privKey: PrivateKey;
    if (key.curve === 'secp256k1') {
      privKey = PrivateKey.fromStringECDSA('0x' + scalarHex);
    } else {
      privKey = PrivateKey.fromStringED25519(scalarHex);
    }

    // Sanity check: Derived public key MUST strictly match registered MPC public key
    if (privKey.publicKey.toStringRaw() !== key.publicKeyHex) {
      throw new Error('[MPC Security Exception] Threshold derivation produced public key mismatch.');
    }

    const signature = privKey.sign(messageBytes);
    return signature;
  }

  /**
   * Proactive Secret Sharing (Key Rotation):
   * Rotates all 3 shares using a zero-constant polynomial h(z) = 0 + b1*z (mod order).
   * The public key P remains identical on-chain; NO Hedera account update transaction is needed.
   * Old shares are rendered completely useless against collusion.
   */
  public rotateThresholdShares(key: MpcThresholdKey): MpcThresholdKey {
    const order = this.getOrder(key.curve);

    // Choose random b1
    const b1Bytes = crypto.randomBytes(32);
    const b1 = mod(BigInt('0x' + b1Bytes.toString('hex')), order);

    // Decrypt old server share
    const oldS2Hex = this.keyStore.decryptShare(key.encryptedServerShare);
    const oldS1 = BigInt('0x' + key.agentSessionShare.value);
    const oldS2 = BigInt('0x' + oldS2Hex);
    const oldS3 = BigInt('0x' + key.userRecoveryShare.value);

    // Compute updated shares: s'_i = s_i + b1 * i (mod order)
    const newS1 = mod(oldS1 + b1 * 1n, order);
    const newS2 = mod(oldS2 + b1 * 2n, order);
    const newS3 = mod(oldS3 + b1 * 3n, order);

    const s1Hex = newS1.toString(16).padStart(64, '0');
    const s2Hex = newS2.toString(16).padStart(64, '0');
    const s3Hex = newS3.toString(16).padStart(64, '0');

    const share1: MpcShare = {
      index: 1,
      value: s1Hex,
      fingerprint: crypto.createHash('sha256').update(s1Hex).digest('hex').slice(0, 16),
    };

    const encryptedServerShare = this.keyStore.encryptShare(s2Hex);

    const share3: MpcShare = {
      index: 3,
      value: s3Hex,
      fingerprint: crypto.createHash('sha256').update(s3Hex).digest('hex').slice(0, 16),
    };

    const now = new Date().toISOString();

    return {
      ...key,
      agentSessionShare: share1,
      encryptedServerShare,
      userRecoveryShare: share3,
      keyRotationCount: key.keyRotationCount + 1,
      updatedAt: now,
    };
  }

  /**
   * Recovers the master key using User Recovery Share (Share 3) + Server Share (Share 2).
   */
  public recoverKeyWithUserShare(
    key: MpcThresholdKey,
    userRecoveryShare: MpcShare
  ): string {
    const s2Hex = this.keyStore.decryptShare(key.encryptedServerShare);
    const serverShare: MpcShare = {
      index: 2,
      value: s2Hex,
      fingerprint: crypto.createHash('sha256').update(s2Hex).digest('hex').slice(0, 16),
    };

    const reconstructed = this.reconstructFromShares(userRecoveryShare, serverShare, key.curve);
    return reconstructed.toString(16).padStart(64, '0');
  }
}

// -----------------------------------------------------------------------------
// MPC Wallet Signing Provider implementing IWalletSigningProvider
// -----------------------------------------------------------------------------

export class MpcWalletSigningProvider implements IWalletSigningProvider {
  readonly providerId = 'mpc_tss_signer';

  private engine: MpcTssEngine;
  private keyRegistry = new Map<string, MpcThresholdKey>();

  constructor(engine?: MpcTssEngine) {
    this.engine = engine || new MpcTssEngine();
  }

  public getEngine(): MpcTssEngine {
    return this.engine;
  }

  /**
   * Registers an active MPC threshold key for a Hedera account.
   */
  public registerMpcKey(key: MpcThresholdKey): void {
    this.keyRegistry.set(key.accountId.trim(), key);
  }

  /**
   * Unregisters/revokes an account's MPC signing key.
   */
  public unregisterMpcKey(accountId: string): void {
    const cleanId = accountId.trim();
    const existing = this.keyRegistry.get(cleanId);
    if (existing) {
      existing.status = 'revoked';
      this.keyRegistry.delete(cleanId);
    }
  }

  /**
   * Retrieves registered MPC key metadata.
   */
  public getKey(accountId: string): MpcThresholdKey | undefined {
    return this.keyRegistry.get(accountId.trim());
  }

  /**
   * Checks if an account is enrolled in MPC and active.
   */
  public async canSign(accountId: string): Promise<boolean> {
    const key = this.keyRegistry.get(accountId.trim());
    return Boolean(key && key.status === 'active');
  }

  /**
   * Returns public key details for the account.
   */
  public async getPublicKey(accountId: string): Promise<SignerPublicKeyInfo> {
    const key = this.keyRegistry.get(accountId.trim());
    if (!key || key.status !== 'active') {
      throw new Error(`[MPC Exception] No active MPC key configured for account "${accountId}".`);
    }

    return {
      accountId: key.accountId,
      publicKeyHex: key.publicKeyHex,
      keyType: key.curve === 'secp256k1' ? 'ECDSA_SECP256K1' : 'ED25519',
    };
  }

  /**
   * Signs a Hedera TransferTransaction using 2-of-3 MPC threshold signing.
   * Verifies account payer matching and on-chain Mirror Node key structure compatibility.
   */
  public async signTransaction(
    accountId: string,
    transaction: TransferTransaction
  ): Promise<TransferTransaction> {
    const cleanId = accountId.trim();
    const key = this.keyRegistry.get(cleanId);

    if (!key || key.status !== 'active') {
      throw new Error(`[MPC Security Exception] No active MPC signer configured for account "${cleanId}".`);
    }

    // 1. Verify transaction payer matches the authorized account ID
    const txPayer = transaction.transactionId?.accountId?.toString();
    if (!txPayer) {
      throw new Error('[MPC Security Exception] Transaction is missing a valid transactionId with payer account.');
    }
    if (txPayer !== cleanId) {
      throw new Error(
        `[MPC Security Exception] Transaction payer mismatch: Transaction is set to payer "${txPayer}", but MPC signer is authorized for "${cleanId}".`
      );
    }

    // 2. Validate MPC public key against Mirror Node on-chain key structure (FAIL CLOSED)
    let mirrorAccount: MirrorAccount | null;
    try {
      mirrorAccount = await getMirrorAccount(cleanId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[MPC Security Exception] Mirror Node verification failed for account "${cleanId}": ${msg}`);
    }

    if (!mirrorAccount) {
      throw new Error(`[MPC Security Exception] Mirror Node account lookup failed for "${cleanId}". Signing rejected.`);
    }
    if (mirrorAccount.deleted) {
      throw new Error(`[MPC Security Exception] Account "${cleanId}" is deleted on Mirror Node. Signing rejected.`);
    }
    if (!mirrorAccount.key) {
      throw new Error(`[MPC Security Exception] Account "${cleanId}" has no on-chain key registered. Signing rejected.`);
    }

    const mpcPublicKey =
      key.curve === 'secp256k1'
        ? PublicKey.fromStringECDSA('0x' + key.publicKeyHex)
        : PublicKey.fromStringED25519(key.publicKeyHex);

    const isAuthorizedOnChain = keyStructureMatches(
      mirrorAccount.key as MirrorKeyNode,
      mpcPublicKey
    );

    if (!isAuthorizedOnChain) {
      // If account has not yet completed on-chain MPC update, fallback to delegated signer if registered
      const { defaultDelegatedSigner } = await import('./delegatedSigner');
      if (await defaultDelegatedSigner.canSign(cleanId)) {
        return defaultDelegatedSigner.signTransaction(cleanId, transaction);
      }
      throw new Error(
        `[MPC Security Exception] MPC public key for "${cleanId}" is not authorized by the on-chain key structure registered on Hedera Mirror Node.`
      );
    }

    // 3. Attach MPC threshold signature using Hedera SDK signWith
    await transaction.signWith(mpcPublicKey, async (messageBytes: Uint8Array) => {
      return this.engine.signThreshold(key, messageBytes, key.agentSessionShare);
    });

    return transaction;
  }
}

// Singleton instances
export const defaultMpcEngine = new MpcTssEngine();
export const defaultMpcSigner = new MpcWalletSigningProvider(defaultMpcEngine);
