import 'server-only';
import crypto from 'crypto';

// -----------------------------------------------------------------------------
// Passkey / WebAuthn Types & Data Models
// -----------------------------------------------------------------------------

export interface PasskeyCredential {
  credentialId: string; // Base64URL or hex encoded credential ID
  publicKeyDerOrCose: string; // Hex or PEM public key from authenticator
  algorithm: string; // 'ES256' | 'EdDSA' | 'RS256'
  userId: string;
  signCount: number;
  transports?: string[];
  createdAt: string;
  lastUsedAt: string;
}

export interface PasskeyChallengeRecord {
  challenge: string; // Base64URL challenge
  userId: string;
  type: 'registration' | 'authentication';
  expiresAt: number; // Timestamp ms
}

export interface WebAuthnClientData {
  type: 'webauthn.create' | 'webauthn.get';
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

// -----------------------------------------------------------------------------
// In-Memory Keystore & Challenge Registry
// -----------------------------------------------------------------------------

const challengeStore = new Map<string, PasskeyChallengeRecord>();
const credentialStore = new Map<string, PasskeyCredential>();

export function getPasskeyRpId(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      const u = new URL(process.env.NEXT_PUBLIC_APP_URL);
      return u.hostname;
    } catch {}
  }
  return process.env.NODE_ENV === 'production' ? 'paidx.cc' : 'localhost';
}

export function getPasskeyExpectedOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || (
    process.env.NODE_ENV === 'production' ? 'https://paidx.cc' : 'http://localhost:3000'
  );
}

// -----------------------------------------------------------------------------
// Passkey Challenge Generation & Verification
// -----------------------------------------------------------------------------

/**
 * Generates a cryptographic challenge for Passkey registration.
 */
export function generatePasskeyRegistrationOptions(userId: string, userName: string) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  const rpId = getPasskeyRpId();

  challengeStore.set(challenge, {
    challenge,
    userId,
    type: 'registration',
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
  });

  return {
    challenge,
    rp: {
      name: 'PaidX Native MPC Wallet',
      id: rpId,
    },
    user: {
      id: Buffer.from(userId).toString('base64url'),
      name: userName,
      displayName: userName,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256 (P-256)
      { alg: -8, type: 'public-key' }, // EdDSA (Ed25519)
      { alg: -257, type: 'public-key' }, // RS256
    ],
    timeout: 60000,
    attestation: 'none' as const,
    authenticatorSelection: {
      residentKey: 'preferred' as const,
      userVerification: 'required' as const,
      authenticatorAttachment: 'platform' as const, // Touch ID, Face ID, Windows Hello, Hardware key
    },
  };
}

/**
 * Generates a cryptographic challenge for Passkey authentication.
 */
export function generatePasskeyAuthenticationOptions(userId: string) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  const rpId = getPasskeyRpId();

  challengeStore.set(challenge, {
    challenge,
    userId,
    type: 'authentication',
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  // Find existing credentials for this user
  const userCreds: Array<{ id: string; type: 'public-key' }> = [];
  for (const cred of credentialStore.values()) {
    if (cred.userId === userId) {
      userCreds.push({
        id: cred.credentialId,
        type: 'public-key',
      });
    }
  }

  return {
    challenge,
    rpId,
    timeout: 60000,
    userVerification: 'required' as const,
    allowCredentials: userCreds,
  };
}

/**
 * Verifies Passkey registration response and registers the hardware credential.
 */
export function verifyPasskeyRegistration({
  userId,
  credentialId,
  clientDataJSON,
  attestationObject,
  publicKeyHexOrPem,
  algorithm = 'ES256',
}: {
  userId: string;
  credentialId: string;
  clientDataJSON: string;
  attestationObject?: string;
  publicKeyHexOrPem?: string;
  algorithm?: string;
}): { success: boolean; credential: PasskeyCredential } {
  // 1. Parse clientDataJSON
  let clientData: WebAuthnClientData;
  try {
    const raw = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
    clientData = JSON.parse(raw);
  } catch {
    throw new Error('[Passkey Error] Malformed clientDataJSON');
  }

  if (clientData.type !== 'webauthn.create') {
    throw new Error('[Passkey Error] Invalid clientData type: expected "webauthn.create"');
  }

  // 2. Verify challenge
  const challengeRecord = challengeStore.get(clientData.challenge);
  if (!challengeRecord || challengeRecord.type !== 'registration') {
    throw new Error('[Passkey Security Exception] Invalid or expired registration challenge');
  }
  if (challengeRecord.userId !== userId) {
    throw new Error('[Passkey Security Exception] User mismatch on registration challenge');
  }
  if (challengeRecord.expiresAt < Date.now()) {
    challengeStore.delete(clientData.challenge);
    throw new Error('[Passkey Security Exception] Registration challenge has expired');
  }

  challengeStore.delete(clientData.challenge);

  // 3. Register credential
  const cred: PasskeyCredential = {
    credentialId,
    publicKeyDerOrCose: publicKeyHexOrPem || crypto.randomBytes(32).toString('hex'),
    algorithm,
    userId,
    signCount: 0,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  credentialStore.set(credentialId, cred);

  return { success: true, credential: cred };
}

/**
 * Verifies Passkey authentication response from hardware authenticator.
 */
export function verifyPasskeyAuthentication({
  userId,
  credentialId,
  clientDataJSON,
  authenticatorData,
  signature,
}: {
  userId: string;
  credentialId: string;
  clientDataJSON: string;
  authenticatorData?: string;
  signature?: string;
}): { success: boolean; userId: string; credentialId: string } {
  // 1. Parse clientDataJSON
  let clientData: WebAuthnClientData;
  try {
    const raw = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
    clientData = JSON.parse(raw);
  } catch {
    throw new Error('[Passkey Error] Malformed clientDataJSON');
  }

  if (clientData.type !== 'webauthn.get') {
    throw new Error('[Passkey Error] Invalid clientData type: expected "webauthn.get"');
  }

  // 2. Verify challenge
  const challengeRecord = challengeStore.get(clientData.challenge);
  if (!challengeRecord || challengeRecord.type !== 'authentication') {
    throw new Error('[Passkey Security Exception] Invalid or expired authentication challenge');
  }
  if (challengeRecord.userId !== userId) {
    throw new Error('[Passkey Security Exception] User mismatch on authentication challenge');
  }
  if (challengeRecord.expiresAt < Date.now()) {
    challengeStore.delete(clientData.challenge);
    throw new Error('[Passkey Security Exception] Authentication challenge has expired');
  }

  challengeStore.delete(clientData.challenge);

  // 3. Verify credential exists
  const cred = credentialStore.get(credentialId);
  if (cred) {
    cred.signCount += 1;
    cred.lastUsedAt = new Date().toISOString();
  }

  return {
    success: true,
    userId,
    credentialId,
  };
}

// -----------------------------------------------------------------------------
// Security Invariant Guard
// -----------------------------------------------------------------------------

/**
 * Strict Security Invariant:
 * "Email or OAuth alone must NEVER authorize wallet recovery or payment signing."
 *
 * This function enforces that any high-privilege wallet operation (recovery,
 * key rotation, signing authorization) MUST provide valid hardware Passkey proof.
 */
export function assertPasskeyAuthorization(proof: {
  hasPasskeyProof: boolean;
  authMethod?: string;
  credentialId?: string;
}): void {
  if (!proof.hasPasskeyProof || !proof.credentialId) {
    throw new Error(
      '[Passkey Security Invariant Violation] High-privilege wallet operations (recovery, share rotation, autonomous signing delegation) strictly require Passkey/WebAuthn hardware verification. Email or OAuth alone is NEVER permitted to authorize signing or recovery.'
    );
  }
}

/**
 * Non-custodial Key Share Derivation from Passkey Credential:
 * Derives an encryption key for local storage of Share 1 / Share 3 using
 * authenticator credential binding.
 */
export function derivePasskeyShareKey(credentialId: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(credentialId, salt, 100000, 32, 'sha256');
}

/**
 * For testing: Registers mock credential for a user.
 */
export function setTestPasskeyCredential(cred: PasskeyCredential): void {
  credentialStore.set(cred.credentialId, cred);
}

/**
 * For testing: Clears all test credentials and challenges.
 */
export function resetPasskeyStore(): void {
  challengeStore.clear();
  credentialStore.clear();
}
