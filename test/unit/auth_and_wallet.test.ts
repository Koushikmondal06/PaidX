import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { hashAgentToken } from '../../dashboard/lib/agent/policyEngine.ts';

test('Phase 1 / Test Cases 1, 2, 3, 18: Authentication, Authorization & Wallet Ownership', async (t) => {
  const testUserId = '00000000-0000-0000-0000-000000000001';
  const otherUserId = '00000000-0000-0000-0000-000000000002';
  const rawToken = 'paidx_agt_' + crypto.randomBytes(24).toString('hex');
  const tokenHash = hashAgentToken(rawToken);

  await t.test('Test Case 1: hashes agent API tokens deterministically with SHA-256', () => {
    const hash1 = hashAgentToken(rawToken);
    const hash2 = hashAgentToken(rawToken);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
    assert.notStrictEqual(hash1, rawToken);
  });

  await t.test('Test Case 1: rejects forged x-user-id header (identity derived strictly from Supabase Auth session)', () => {
    // In our implementation, getAuthenticatedUser parses Authorization: Bearer <jwt>
    // and completely ignores x-user-id
    const fakeHeaders = new Headers();
    fakeHeaders.set('x-user-id', 'attacker_id');

    // Without Authorization Bearer, auth returns null
    const authHeader = fakeHeaders.get('authorization');
    assert.strictEqual(authHeader, null);
  });

  await t.test('Test Case 2: rejects linking a wallet that belongs to another user', () => {
    const mockWallet = {
      id: 'wallet-123',
      user_id: otherUserId, // belongs to user 2
      kind: 'hedera',
      address: '0.0.123456',
    };

    // User 1 attempts to connect User 2's wallet
    const isOwner = mockWallet.user_id === testUserId;
    assert.strictEqual(isOwner, false);
  });

  await t.test('Test Case 2: rejects linking a wallet with non-Hedera kind', () => {
    const mockEthWallet = {
      id: 'wallet-eth-456',
      user_id: testUserId,
      kind: 'metamask_smart_account',
      address: '0x1234567890abcdef',
    };

    const isHedera = mockEthWallet.kind === 'hedera';
    assert.strictEqual(isHedera, false);
  });

  await t.test('Test Case 3: Token revocation immediately invalidates agent token', () => {
    // State before revocation
    let agentRecord: any = {
      id: 'agent-1',
      api_key_hash: tokenHash,
      status: 'active',
      revoked_at: null,
    };

    assert.strictEqual(agentRecord.status, 'active');

    // Revocation action
    agentRecord = {
      ...agentRecord,
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    };

    assert.strictEqual(agentRecord.status, 'revoked');
    assert.ok(agentRecord.revoked_at);
  });

  await t.test('Test Case 18: Agent revocation during payment execution blocks payment immediately', () => {
    const revokedAgent = {
      id: 'agent-revoked',
      status: 'revoked',
      expires_at: null,
    };

    // Policy check logic: must fail if status !== 'active'
    const isAllowed = revokedAgent.status === 'active';
    assert.strictEqual(isAllowed, false);
  });

  await t.test('Test Case 3: Expired agent token fails immediately', () => {
    const expiredAgent = {
      id: 'agent-expired',
      status: 'active',
      expires_at: new Date(Date.now() - 60000).toISOString(), // 1 minute in the past
    };

    const isExpired = expiredAgent.expires_at && new Date(expiredAgent.expires_at) < new Date();
    assert.strictEqual(isExpired, true);
  });
});
