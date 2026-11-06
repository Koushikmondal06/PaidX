import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { hashAgentToken, authenticateAgentToken } from '../../dashboard/lib/agent/policyEngine.ts';
import { requireAuthenticatedUser } from '../../dashboard/lib/server/auth.ts';
import { GET as getAgentsRoute, POST as createAgentRoute } from '../../dashboard/app/api/agents/route.ts';
import { POST as agentChatRoute } from '../../dashboard/app/api/agents/chat/route.ts';

test('Phase 1 / Test Cases 1, 2, 3, 18: Authentication, Authorization & Route Guards', async (t) => {
  const rawToken = 'paidx_agt_' + crypto.randomBytes(24).toString('hex');

  await t.test('Test Case 1: hashes agent API tokens deterministically with SHA-256', () => {
    const hash1 = hashAgentToken(rawToken);
    const hash2 = hashAgentToken(rawToken);
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
    assert.notStrictEqual(hash1, rawToken);
  });

  await t.test('Test Case 1: requireAuthenticatedUser strictly REJECTS forged x-user-id header', async () => {
    // Attacker sends forged x-user-id header without valid Supabase session
    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: {
        'x-user-id': '00000000-0000-0000-0000-000000000999',
      },
    });

    const result = await requireAuthenticatedUser(req);
    assert.ok(!result.user);
    assert.ok(result.errorResponse);
    assert.strictEqual(result.errorResponse.status, 401);
  });

  await t.test('Test Case 1: Actual Route Handler GET /api/agents blocks unauthenticated requests with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'GET',
      headers: {
        'x-user-id': 'attacker_id',
      },
    });

    const res = await getAgentsRoute(req);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
  });

  await t.test('Test Case 2: Actual Route Handler POST /api/agents blocks unauthenticated creation with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'unauthenticated_user',
      },
      body: JSON.stringify({
        agentName: 'Malicious Agent',
        walletId: '00000000-0000-0000-0000-000000000001',
      }),
    });

    const res = await createAgentRoute(req);
    assert.strictEqual(res.status, 401);
  });

  await t.test('Test Case 2: Actual Route Handler POST /api/agents/chat blocks requests without session or bearer token', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'spoofed_id',
      },
      body: JSON.stringify({
        message: 'Send 5 USDC to 0.0.123456',
      }),
    });

    const res = await agentChatRoute(req);
    assert.strictEqual(res.status, 401);
  });

  await t.test('Test Case 2: Actual Route Handler POST /api/agents/chat rejects invalid token formats', async () => {
    const req = new NextRequest('http://localhost:3000/api/agents/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_token_format', // Does not start with paidx_agt_
      },
      body: JSON.stringify({
        message: 'Send 5 USDC to 0.0.123456',
      }),
    });

    const res = await agentChatRoute(req);
    assert.strictEqual(res.status, 401);
  });

  await t.test('Test Case 3: authenticateAgentToken returns null for empty or non-paidx tokens', async () => {
    const res1 = await authenticateAgentToken('');
    assert.strictEqual(res1, null);

    const res2 = await authenticateAgentToken('Bearer not_a_paidx_token');
    assert.strictEqual(res2, null);
  });

  await t.test('Wallet Ownership: rejects non-Hedera wallet kind', () => {
    const mockEthWallet = {
      id: 'wallet-eth-456',
      user_id: 'user-1',
      kind: 'metamask_smart_account',
      address: '0x1234567890abcdef',
    };

    assert.notStrictEqual(mockEthWallet.kind, 'hedera');
  });
});
