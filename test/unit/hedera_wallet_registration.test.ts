import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { PrivateKey, PublicKey } from '@hiero-ledger/sdk';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import { setTestMirrorMock } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { delegatedSigner } from '../../dashboard/lib/hedera/signing/delegatedSigner.ts';
import { GET as getHederaWalletsRoute, POST as registerHederaWalletRoute } from '../../dashboard/app/api/wallets/hedera/route.ts';
import { POST as createChallengeRoute } from '../../dashboard/app/api/wallets/hedera/challenge/route.ts';
import { POST as createAgentRoute } from '../../dashboard/app/api/agents/route.ts';

/**
 * In-memory Mock Supabase Client
 * Faithfully simulates PostgREST query chaining for unit tests
 */
function createMockSupabase(initialWallets: any[] = []) {
  const db: {
    wallets: any[];
    agent_connections: any[];
    agent_policies: any[];
  } = {
    wallets: JSON.parse(JSON.stringify(initialWallets)),
    agent_connections: [],
    agent_policies: [],
  };

  const client = {
    db,
    auth: {
      getUser: async (token: string) => {
        if (token && token.startsWith('user_')) {
          return {
            data: {
              user: {
                id: token,
                email: `${token}@paidx.test`,
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: new Error('Invalid token') };
      },
    },
    from: (table: 'wallets' | 'agent_connections' | 'agent_policies') => {
      const filters: Array<(row: any) => boolean> = [];
      let sortCol: string | null = null;
      let sortAscending = true;
      let limitCount: number | null = null;
      let pendingUpdate: any = null;
      let pendingInsert: any = null;
      let isDelete = false;

      function getFilteredRows() {
        if (pendingInsert) {
          return pendingInsert;
        }
        let rows = (db[table] || []).filter((r) => filters.every((f) => f(r)));

        if (pendingUpdate) {
          for (const r of rows) {
            Object.assign(r, pendingUpdate);
          }
        }

        if (isDelete) {
          const ids = new Set(rows.map((r) => r.id));
          db[table] = db[table].filter((r) => !ids.has(r.id));
          return [];
        }

        if (sortCol) {
          rows.sort((a, b) => {
            if (a[sortCol!] < b[sortCol!]) return sortAscending ? -1 : 1;
            if (a[sortCol!] > b[sortCol!]) return sortAscending ? 1 : -1;
            return 0;
          });
        }

        if (limitCount !== null) {
          rows = rows.slice(0, limitCount);
        }

        return rows;
      }

      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => {
          filters.push((r) => r[col] === val);
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          sortCol = col;
          sortAscending = opts?.ascending !== false;
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        maybeSingle: async () => {
          const rows = getFilteredRows();
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          const rows = getFilteredRows();
          if (rows.length === 0) {
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          }
          return { data: rows[0], error: null };
        },
        insert: (data: any) => {
          const items = Array.isArray(data) ? data : [data];
          const inserted = items.map((d, i) => ({
            id: d.id || `id-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date().toISOString(),
            ...d,
          }));
          db[table].push(...inserted);
          pendingInsert = inserted;
          return builder;
        },
        upsert: (data: any, options?: { onConflict?: string }) => {
          const items = Array.isArray(data) ? data : [data];
          const results: any[] = [];
          for (const item of items) {
            const conflictCols = (options?.onConflict || 'id')
              .split(',')
              .map((c) => c.trim());

            const existingIdx = db[table].findIndex((r) =>
              conflictCols.every((col) => r[col] === item[col])
            );

            if (existingIdx >= 0) {
              db[table][existingIdx] = {
                ...db[table][existingIdx],
                ...item,
                updated_at: new Date().toISOString(),
              };
              results.push(db[table][existingIdx]);
            } else {
              const newRow = {
                id: item.id || `id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                created_at: new Date().toISOString(),
                ...item,
              };
              db[table].push(newRow);
              results.push(newRow);
            }
          }
          pendingInsert = results;
          return builder;
        },
        update: (data: any) => {
          pendingUpdate = data;
          return builder;
        },
        delete: () => {
          isDelete = true;
          return builder;
        },
        then: (resolve: any, reject: any) => {
          try {
            const rows = getFilteredRows();
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          } catch (err) {
            return Promise.reject(err).then(resolve, reject);
          }
        },
      };

      return builder;
    },
  };

  return client;
}

test('Hedera Wallet Registration & Agent Authorization Flow', async (t) => {
  const userA = 'user_alice_123';
  const userB = 'user_bob_456';

  const testKeyA = PrivateKey.generateED25519();
  const testKeyB = PrivateKey.generateECDSA();
  const validAccountIdA = '0.0.123456';
  const validAccountIdB = '0.0.654321';

  let mockSupabase: ReturnType<typeof createMockSupabase>;

  t.beforeEach(() => {
    mockSupabase = createMockSupabase();
    setTestSupabaseClient(mockSupabase);

    setTestMirrorMock({
      getAccount: async (accId: string) => {
        if (accId === validAccountIdA) {
          return {
            account: validAccountIdA,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 500000000, timestamp: '1', tokens: [] },
            deleted: false,
            evm_address: '0x000000000000000000000000000000000001e240',
            key: { _type: 'ED25519', key: testKeyA.publicKey.toStringRaw() },
          };
        }
        if (accId === validAccountIdB) {
          return {
            account: validAccountIdB,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 250000000, timestamp: '1', tokens: [] },
            deleted: false,
            evm_address: '0x000000000000000000000000000000000009fbf1',
            key: { _type: 'ECDSA_SECP256K1', key: testKeyB.publicKey.toStringRaw() },
          };
        }
        if (accId === '0.0.999999') {
          // Account marked deleted
          return {
            account: '0.0.999999',
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 0, timestamp: '1', tokens: [] },
            deleted: true,
            evm_address: '0x0',
            key: { _type: 'ED25519', key: 'dead' },
          };
        }
        // Non-existent account
        return null;
      },
      getBalance: async (accId: string) => {
        if (accId === validAccountIdA) {
          return {
            balance: 500000000,
            tokens: [],
          };
        }
        return { balance: 0, tokens: [] };
      },
    });
  });

  t.afterEach(() => {
    setTestSupabaseClient(null);
    setTestMirrorMock(null);
  });

  // --------------------------------------------------------------------------
  // Scenario 1: User without Hedera wallet receives clear error from agent API
  // --------------------------------------------------------------------------
  await t.test('Scenario 1: User without Hedera wallet receives clear error when connecting agent', async () => {
    // User A has no Hedera wallet in Supabase
    const req = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Alice Agent',
        dailyBudget: 20,
        maxAmountPerTx: 5,
      }),
    });

    const res = await createAgentRoute(req);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(
      body.error,
      /No Hedera wallet linked to your account\. Please link or register a Hedera wallet before connecting an agent\./i
    );
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Register valid Testnet account with Mirror Node verification
  // --------------------------------------------------------------------------
  await t.test('Scenario 2: User successfully registers valid Hedera Testnet account', async () => {
    const req = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        accountId: validAccountIdA,
        network: 'hedera:testnet',
        publicKey: testKeyA.publicKey.toStringRaw(),
      }),
    });

    const res = await registerHederaWalletRoute(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.wallet.address, validAccountIdA);
    assert.strictEqual(body.wallet.chainId, 296);
    assert.strictEqual(body.wallet.verified, true);

    // Verify row was saved in Supabase
    assert.strictEqual(mockSupabase.db.wallets.length, 1);
    const saved = mockSupabase.db.wallets[0];
    assert.strictEqual(saved.user_id, userA);
    assert.strictEqual(saved.address, validAccountIdA);
    assert.strictEqual(saved.kind, 'hedera');
    assert.strictEqual(saved.chain_id, 296);
    assert.strictEqual(saved.is_primary, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Invalid account ID format is rejected with 400
  // --------------------------------------------------------------------------
  await t.test('Scenario 3: Invalid account ID formats are rejected with 400', async () => {
    const invalidIds = ['not-an-id', '0.0.abc', '-1.0.1', '', '0.0.0.1', '0x1234567890abcdef'];

    for (const invalidId of invalidIds) {
      const req = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          accountId: invalidId,
          publicKey: testKeyA.publicKey.toStringRaw(),
        }),
      });

      const res = await registerHederaWalletRoute(req);
      assert.strictEqual(res.status, 400, `Expected 400 for invalid ID "${invalidId}"`);
      const body = await res.json();
      assert.match(body.error, /Invalid Hedera account ID format/i);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Wallet ownership verification succeeds and rejects mismatch
  // --------------------------------------------------------------------------
  await t.test('Scenario 4: Wallet ownership verification (public key, signing key & challenge)', async (tSub) => {
    // 4a: Public key mismatch fails closed with 403
    await tSub.test('fails closed with 403 when public key does not match on-chain key', async () => {
      const wrongKey = PrivateKey.generateED25519().publicKey.toStringRaw();
      const req = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          accountId: validAccountIdA,
          publicKey: wrongKey,
        }),
      });

      const res = await registerHederaWalletRoute(req);
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.match(body.error, /Public key mismatch/i);
    });

    // 4b: Delegated signing key control registers in-memory and NEVER writes private key to DB
    await tSub.test('verifies signing key proof and never persists private key to DB', async () => {
      const req = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          accountId: validAccountIdA,
          signingKey: testKeyA.toStringDer(),
        }),
      });

      const res = await registerHederaWalletRoute(req);
      assert.strictEqual(res.status, 200);

      // Verify signing key is registered in-memory for delegated agent execution
      assert.strictEqual(await delegatedSigner.canSign(validAccountIdA), true);

      // Verify private key is NEVER saved to database
      const savedWallet = mockSupabase.db.wallets[0];
      assert.ok(savedWallet);
      assert.strictEqual(savedWallet.private_key, undefined);
      assert.strictEqual(savedWallet.signingKey, undefined);
      assert.strictEqual(JSON.stringify(savedWallet).includes(testKeyA.toStringDer()), false);
    });

    // 4c: Cryptographic challenge generation and signature verification
    await tSub.test('generates fresh challenge and verifies cryptographic signature', async () => {
      // 1. Request challenge
      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({ accountId: validAccountIdA }),
      });

      const chalRes = await createChallengeRoute(chalReq);
      assert.strictEqual(chalRes.status, 200);
      const chalBody = await chalRes.json();
      assert.ok(chalBody.challenge.startsWith(`paidx:link-hedera-wallet:${userA}:${validAccountIdA}:`));

      // 2. Sign challenge with account private key
      const signatureBytes = testKeyA.sign(Buffer.from(chalBody.challenge));
      const signatureHex = Buffer.from(signatureBytes).toString('hex');

      // 3. Submit signature verification
      const verifyReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          accountId: validAccountIdA,
          challenge: chalBody.challenge,
          signature: signatureHex,
          publicKey: testKeyA.publicKey.toStringRaw(),
        }),
      });

      const verifyRes = await registerHederaWalletRoute(verifyReq);
      assert.strictEqual(verifyRes.status, 200);
      const verifyBody = await verifyRes.json();
      assert.strictEqual(verifyBody.success, true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5 & 6: Agent authorization succeeds after wallet linking
  // --------------------------------------------------------------------------
  await t.test('Scenario 5 & 6: Agent authorization succeeds and associates with correct wallet', async () => {
    // 1. Link Hedera wallet for user A
    const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        accountId: validAccountIdA,
        publicKey: testKeyA.publicKey.toStringRaw(),
      }),
    });
    const linkRes = await registerHederaWalletRoute(linkReq);
    assert.strictEqual(linkRes.status, 200);
    const linkBody = await linkRes.json();
    const linkedWalletId = linkBody.wallet.id;

    // 2. Authorize agent without explicitly providing walletId -> automatically resolves primary Hedera wallet
    const agentReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Alice Hedera Agent',
        dailyBudget: 25,
        maxAmountPerTx: 5,
        autonomousPaymentsEnabled: true,
      }),
    });

    const agentRes = await createAgentRoute(agentReq);
    assert.strictEqual(agentRes.status, 200);
    const agentBody = await agentRes.json();
    assert.strictEqual(agentBody.success, true);
    assert.ok(agentBody.token.startsWith('paidx_agt_'));
    assert.ok(agentBody.agentId);

    // Verify agent connection in database points to the linked Hedera wallet
    const agentConnection = mockSupabase.db.agent_connections[0];
    assert.ok(agentConnection);
    assert.strictEqual(agentConnection.user_id, userA);
    assert.strictEqual(agentConnection.wallet_id, linkedWalletId);

    // Verify spending policies were saved
    const policy = mockSupabase.db.agent_policies[0];
    assert.ok(policy);
    assert.strictEqual(policy.agent_id, agentConnection.id);
    assert.strictEqual(policy.max_amount_per_tx, '5');
    assert.strictEqual(policy.daily_budget, '25');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Cross-user claim protection
  // --------------------------------------------------------------------------
  await t.test('Scenario 7: Another user cannot claim an already linked wallet without proof of key control', async () => {
    // 1. User A links wallet 0.0.123456
    const linkReqA = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        accountId: validAccountIdA,
        publicKey: testKeyA.publicKey.toStringRaw(),
      }),
    });
    const linkResA = await registerHederaWalletRoute(linkReqA);
    assert.strictEqual(linkResA.status, 200);

    // 2. User B tries to claim User A's wallet using ONLY the public key (no private key or signature)
    const linkReqB = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB}`,
      },
      body: JSON.stringify({
        accountId: validAccountIdA,
        publicKey: testKeyA.publicKey.toStringRaw(),
      }),
    });
    const linkResB = await registerHederaWalletRoute(linkReqB);
    // MUST BE REJECTED WITH 403
    assert.strictEqual(linkResB.status, 403);
    const bodyB = await linkResB.json();
    assert.match(bodyB.error, /already registered to another PaidX user.*prove cryptographic key control/i);

    // Verify the wallet still belongs to User A
    const currentWallet = mockSupabase.db.wallets.find((w) => w.address === validAccountIdA);
    assert.strictEqual(currentWallet.user_id, userA);

    // 3. If User B proves key control (by signing a challenge with the actual key), transfer succeeds
    const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB}`,
      },
      body: JSON.stringify({ accountId: validAccountIdA }),
    });
    const chalRes = await createChallengeRoute(chalReq);
    const chalBody = await chalRes.json();

    const sigHex = Buffer.from(testKeyA.sign(Buffer.from(chalBody.challenge))).toString('hex');
    const claimReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB}`,
      },
      body: JSON.stringify({
        accountId: validAccountIdA,
        challenge: chalBody.challenge,
        signature: sigHex,
        publicKey: testKeyA.publicKey.toStringRaw(),
      }),
    });

    const claimRes = await registerHederaWalletRoute(claimReq);
    assert.strictEqual(claimRes.status, 200);
    const claimBody = await claimRes.json();
    assert.strictEqual(claimBody.success, true);
    assert.match(claimBody.message, /ownership verified and transferred/i);

    // Wallet is now reassigned to User B
    const transferredWallet = mockSupabase.db.wallets.find((w) => w.address === validAccountIdA);
    assert.strictEqual(transferredWallet.user_id, userB);
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Deleted accounts on Mirror Node are rejected with 400
  // --------------------------------------------------------------------------
  await t.test('Scenario 8: Deleted accounts on Mirror Node are rejected with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        accountId: '0.0.999999',
        publicKey: 'dead',
      }),
    });

    const res = await registerHederaWalletRoute(req);
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /marked as deleted on Mirror Node/i);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Non-existent accounts on Mirror Node return 404
  // --------------------------------------------------------------------------
  await t.test('Scenario 9: Non-existent accounts on Mirror Node return 404', async () => {
    const req = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        accountId: '0.0.888888',
        publicKey: testKeyA.publicKey.toStringRaw(),
      }),
    });

    const res = await registerHederaWalletRoute(req);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /does not exist on hedera:testnet/i);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: GET /api/wallets/hedera returns live status and balances
  // --------------------------------------------------------------------------
  await t.test('Scenario 10: GET /api/wallets/hedera returns linked wallet details', async () => {
    // 1. Before linking: hasLinkedWallet is false
    const reqBefore = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userA}` },
    });
    const resBefore = await getHederaWalletsRoute(reqBefore);
    assert.strictEqual(resBefore.status, 200);
    const bodyBefore = await resBefore.json();
    assert.strictEqual(bodyBefore.hasLinkedWallet, false);
    assert.strictEqual(bodyBefore.wallet, null);

    // 2. Link wallet
    await registerHederaWalletRoute(
      new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          accountId: validAccountIdA,
          publicKey: testKeyA.publicKey.toStringRaw(),
        }),
      })
    );

    // 3. After linking: returns wallet details and HashScan URL
    const reqAfter = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'GET',
      headers: { Authorization: `Bearer ${userA}` },
    });
    const resAfter = await getHederaWalletsRoute(reqAfter);
    assert.strictEqual(resAfter.status, 200);
    const bodyAfter = await resAfter.json();
    assert.strictEqual(bodyAfter.hasLinkedWallet, true);
    assert.strictEqual(bodyAfter.wallet.address, validAccountIdA);
    assert.strictEqual(bodyAfter.wallet.network, 'hedera:testnet');
    assert.strictEqual(bodyAfter.wallet.chainId, 296);
    assert.strictEqual(bodyAfter.wallet.verified, true);
    assert.ok(bodyAfter.wallet.hashScanUrl.includes(validAccountIdA));
  });
});
