import test from 'node:test';
import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { PrivateKey } from '@hiero-ledger/sdk';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import { setTestMirrorMock } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { resetMemoryChallenges } from '../../dashboard/lib/hedera/challenges.ts';
import { delegatedSigner } from '../../dashboard/lib/hedera/signing/delegatedSigner.ts';
import { GET as getHederaWalletsRoute, POST as registerHederaWalletRoute } from '../../dashboard/app/api/wallets/hedera/route.ts';
import { POST as createChallengeRoute } from '../../dashboard/app/api/wallets/hedera/challenge/route.ts';
import { POST as createAgentRoute } from '../../dashboard/app/api/agents/route.ts';

/**
 * In-memory Mock Supabase Client
 */
function createMockSupabase(initialWallets: any[] = []) {
  const db: {
    wallets: any[];
    agent_connections: any[];
    agent_policies: any[];
    wallet_challenges: any[];
  } = {
    wallets: JSON.parse(JSON.stringify(initialWallets)),
    agent_connections: [],
    agent_policies: [],
    wallet_challenges: [],
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
    from: (table: 'wallets' | 'agent_connections' | 'agent_policies' | 'wallet_challenges') => {
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
          if (!db[table]) db[table] = [];
          db[table].push(...inserted);
          pendingInsert = inserted;
          return builder;
        },
        upsert: (data: any, options?: { onConflict?: string }) => {
          const items = Array.isArray(data) ? data : [data];
          const results: any[] = [];
          if (!db[table]) db[table] = [];
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

test('MetaMask Hedera Testnet Wallet Linking & Verification', async (t) => {
  const userA = 'user_alice_metamask';
  const userB = 'user_bob_metamask';

  // Generate test MetaMask EVM accounts
  const privKeyA = generatePrivateKey();
  const metaMaskAccountA = privateKeyToAccount(privKeyA);
  const evmAddressA = metaMaskAccountA.address; // 0x...
  const hederaAccountIdA = '0.0.789101';
  const testKeyA = PrivateKey.generateECDSA();
  const testEcdsaPubA = testKeyA.publicKey.toStringRaw();

  const privKeyB = generatePrivateKey();
  const metaMaskAccountB = privateKeyToAccount(privKeyB);
  const evmAddressB = metaMaskAccountB.address;
  const hederaAccountIdB = '0.0.789102';
  const testKeyB = PrivateKey.generateECDSA();
  const testEcdsaPubB = testKeyB.publicKey.toStringRaw();

  let mockSupabase: ReturnType<typeof createMockSupabase>;

  t.beforeEach(() => {
    resetMemoryChallenges();
    mockSupabase = createMockSupabase();
    setTestSupabaseClient(mockSupabase);

    setTestMirrorMock({
      getAccount: async (accId: string) => {
        if (accId === hederaAccountIdA || accId.toLowerCase() === evmAddressA.toLowerCase()) {
          return {
            account: hederaAccountIdA,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 350000000, timestamp: '1', tokens: [] },
            deleted: false,
            evm_address: evmAddressA.toLowerCase(),
            key: { _type: 'ECDSA_SECP256K1', key: testEcdsaPubA },
          };
        }
        if (accId === hederaAccountIdB || accId.toLowerCase() === evmAddressB.toLowerCase()) {
          return {
            account: hederaAccountIdB,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 150000000, timestamp: '1', tokens: [] },
            deleted: false,
            evm_address: evmAddressB.toLowerCase(),
            key: { _type: 'ECDSA_SECP256K1', key: testEcdsaPubB },
          };
        }
        if (accId === '0.0.999888' || accId.toLowerCase() === '0x9999999999999999999999999999999999999999') {
          return {
            account: '0.0.999888',
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 0, timestamp: '1', tokens: [] },
            deleted: true,
            evm_address: '0x9999999999999999999999999999999999999999',
            key: { _type: 'ECDSA_SECP256K1', key: 'deleted' },
          };
        }
        // Unactivated EVM address -> 404
        return null;
      },
      getAccountByEvmAddress: async (evmAddress: string) => {
        if (evmAddress.toLowerCase() === evmAddressA.toLowerCase()) {
          return {
            account: hederaAccountIdA,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 350000000, timestamp: '1', tokens: [] },
            deleted: false,
            evm_address: evmAddressA.toLowerCase(),
            key: { _type: 'ECDSA_SECP256K1', key: testEcdsaPubA },
          };
        }
        if (evmAddress.toLowerCase() === evmAddressB.toLowerCase()) {
          return {
            account: hederaAccountIdB,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 150000000, timestamp: '1', tokens: [] },
            deleted: false,
            evm_address: evmAddressB.toLowerCase(),
            key: { _type: 'ECDSA_SECP256K1', key: testEcdsaPubB },
          };
        }
        if (evmAddress.toLowerCase() === '0x9999999999999999999999999999999999999999') {
          return {
            account: '0.0.999888',
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 0, timestamp: '1', tokens: [] },
            deleted: true,
            evm_address: '0x9999999999999999999999999999999999999999',
            key: { _type: 'ECDSA_SECP256K1', key: 'deleted' },
          };
        }
        return null;
      },
      getBalance: async (accId: string) => {
        return { balance: 350000000, tokens: [] };
      },
    });
  });

  t.afterEach(() => {
    resetMemoryChallenges();
    setTestSupabaseClient(null);
    setTestMirrorMock(null);
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Successful MetaMask Hedera Testnet Wallet Linking
  // --------------------------------------------------------------------------
  await t.test('Scenario 1: Successfully links MetaMask wallet to Hedera Testnet (Happy Path)', async () => {
    // 1. Request single-use challenge nonce from server
    const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        evmAddress: evmAddressA,
        chainId: 296,
        network: 'hedera:testnet',
        action: 'link-metamask-hedera',
      }),
    });

    const chalRes = await createChallengeRoute(chalReq);
    assert.strictEqual(chalRes.status, 200);
    const chalBody = await chalRes.json();
    assert.strictEqual(chalBody.success, true);
    assert.strictEqual(chalBody.chainId, 296);
    assert.ok(chalBody.challenge.includes(evmAddressA.toLowerCase()));
    assert.ok(chalBody.challenge.includes(userA));
    assert.ok(chalBody.nonce);

    // 2. Sign the challenge with MetaMask account
    const signature = await metaMaskAccountA.signMessage({
      message: chalBody.challenge,
    });

    // 3. Submit signed challenge to /api/wallets/hedera
    const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        evmAddress: evmAddressA,
        signature,
        challenge: chalBody.challenge,
        nonce: chalBody.nonce,
        chainId: 296,
        network: 'hedera:testnet',
        action: 'link-metamask-hedera',
      }),
    });

    const linkRes = await registerHederaWalletRoute(linkReq);
    assert.strictEqual(linkRes.status, 200);
    const linkBody = await linkRes.json();

    assert.strictEqual(linkBody.success, true);
    assert.strictEqual(linkBody.wallet.address, hederaAccountIdA);
    assert.strictEqual(linkBody.wallet.evmAddress, evmAddressA.toLowerCase());
    assert.strictEqual(linkBody.wallet.chainId, 296);
    assert.strictEqual(linkBody.wallet.signerType, 'metamask_evm');
    assert.strictEqual(linkBody.wallet.verified, true);

    // Verify row was saved in Supabase
    assert.strictEqual(mockSupabase.db.wallets.length, 1);
    const saved = mockSupabase.db.wallets[0];
    assert.strictEqual(saved.user_id, userA);
    assert.strictEqual(saved.address, hederaAccountIdA);
    assert.strictEqual(saved.evm_address, evmAddressA.toLowerCase());
    assert.strictEqual(saved.kind, 'hedera');
    assert.strictEqual(saved.chain_id, 296);
    assert.strictEqual(saved.is_primary, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Invalid & Tampered Signatures are Rejected
  // --------------------------------------------------------------------------
  await t.test('Scenario 2: Invalid and tampered signatures fail closed with 403', async (tSub) => {
    // 2a: Submitting signature from a different account
    await tSub.test('fails closed when signature was produced by a different key', async () => {
      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: evmAddressA,
          chainId: 296,
        }),
      });
      const chalRes = await createChallengeRoute(chalReq);
      const chalBody = await chalRes.json();

      // Sign with Account B instead of claimed Account A
      const wrongSignature = await metaMaskAccountB.signMessage({
        message: chalBody.challenge,
      });

      const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: evmAddressA, // Claims A
          signature: wrongSignature, // Signed by B
          challenge: chalBody.challenge,
          nonce: chalBody.nonce,
          chainId: 296,
        }),
      });

      const linkRes = await registerHederaWalletRoute(linkReq);
      assert.strictEqual(linkRes.status, 403);
      const body = await linkRes.json();
      assert.match(body.error, /Cryptographic signature verification failed.*does not match claimed address/i);
    });

    // 2b: Malformed / corrupted signature bytes
    await tSub.test('fails closed when signature string is malformed or corrupted', async () => {
      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({ evmAddress: evmAddressA }),
      });
      const chalRes = await createChallengeRoute(chalReq);
      const chalBody = await chalRes.json();

      const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: evmAddressA,
          signature: '0xinvalidcorruptedhexsignature1234567890',
          challenge: chalBody.challenge,
          nonce: chalBody.nonce,
        }),
      });

      const linkRes = await registerHederaWalletRoute(linkReq);
      assert.strictEqual(linkRes.status, 403);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Wrong Chain & Network Rejected with 400
  // --------------------------------------------------------------------------
  await t.test('Scenario 3: Wrong chain IDs and networks are strictly rejected', async () => {
    const wrongChains = [1, 11155111, 8453, 137]; // Mainnet, Sepolia, Base, Polygon

    for (const chainId of wrongChains) {
      const req = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: evmAddressA,
          chainId,
        }),
      });

      const res = await createChallengeRoute(req);
      assert.strictEqual(res.status, 400, `Expected 400 for chain ID ${chainId}`);
      const body = await res.json();
      assert.match(body.error, /Only Hedera Testnet \(chain ID 296\) is supported/i);
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Account Mismatch, Incompatibility & Unactivated Accounts
  // --------------------------------------------------------------------------
  await t.test('Scenario 4: Account mismatch, unactivated accounts, and key incompatibility', async (tSub) => {
    // 4a: Unactivated EVM address on Hedera Mirror Node returns clear 404
    await tSub.test('returns clear 404 when EVM address is not yet activated on Hedera Testnet', async () => {
      const unactivatedPrivKey = generatePrivateKey();
      const unactivatedAccount = privateKeyToAccount(unactivatedPrivKey);

      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({ evmAddress: unactivatedAccount.address }),
      });
      const chalRes = await createChallengeRoute(chalReq);
      const chalBody = await chalRes.json();

      const sig = await unactivatedAccount.signMessage({ message: chalBody.challenge });

      const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: unactivatedAccount.address,
          signature: sig,
          challenge: chalBody.challenge,
          nonce: chalBody.nonce,
        }),
      });

      const linkRes = await registerHederaWalletRoute(linkReq);
      assert.strictEqual(linkRes.status, 404);
      const body = await linkRes.json();
      assert.match(body.error, /Hedera account not found for EVM address.*must be activated on-chain/i);
      assert.match(body.error, /fund your address with Hedera Testnet HBAR/i);
    });

    // 4b: Deleted accounts on Mirror Node are rejected with 400
    await tSub.test('rejects deleted accounts on Mirror Node with 400', async () => {
      const deletedEvm = '0x9999999999999999999999999999999999999999';
      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({ evmAddress: deletedEvm }),
      });
      const chalRes = await createChallengeRoute(chalReq);
      const chalBody = await chalRes.json();

      const sig = await metaMaskAccountA.signMessage({ message: chalBody.challenge });

      const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: deletedEvm,
          signature: sig,
          challenge: chalBody.challenge,
          nonce: chalBody.nonce,
        }),
      });

      const linkRes = await registerHederaWalletRoute(linkReq);
      assert.strictEqual(linkRes.status, 403); // Signature mismatch since key A signed for deletedEvm
    });

    // 4c: Key-control incompatibility: ED25519 account claimed via EVM signature
    await tSub.test('rejects when on-chain account key type is incompatible with EVM signatures', async () => {
      const privKeyEd = generatePrivateKey();
      const accEd = privateKeyToAccount(privKeyEd);

      setTestMirrorMock({
        getAccountByEvmAddress: async () => ({
          account: '0.0.555555',
          alias: null,
          auto_renew_period: 7776000,
          balance: { balance: 100000000, timestamp: '1', tokens: [] },
          deleted: false,
          evm_address: accEd.address.toLowerCase(),
          key: { _type: 'ED25519', key: 'ed25519_pub_key_hex' },
        }),
      });

      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({ evmAddress: accEd.address }),
      });
      const chalRes = await createChallengeRoute(chalReq);
      const chalBody = await chalRes.json();

      const sig = await accEd.signMessage({ message: chalBody.challenge });

      const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: accEd.address,
          signature: sig,
          challenge: chalBody.challenge,
          nonce: chalBody.nonce,
        }),
      });

      const linkRes = await registerHederaWalletRoute(linkReq);
      assert.strictEqual(linkRes.status, 403);
      const body = await linkRes.json();
      assert.match(body.error, /Key-control incompatibility/i);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Replayed Challenges are Blocked (Single-Use Nonce Enforced)
  // --------------------------------------------------------------------------
  await t.test('Scenario 5: Replayed challenges and expired nonces are rejected', async (tSub) => {
    await tSub.test('rejects replayed nonce submission with 403', async () => {
      // 1. First submission succeeds
      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({ evmAddress: evmAddressA }),
      });
      const chalRes = await createChallengeRoute(chalReq);
      const chalBody = await chalRes.json();

      const sig = await metaMaskAccountA.signMessage({ message: chalBody.challenge });

      const linkReq1 = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: evmAddressA,
          signature: sig,
          challenge: chalBody.challenge,
          nonce: chalBody.nonce,
        }),
      });

      const res1 = await registerHederaWalletRoute(linkReq1);
      assert.strictEqual(res1.status, 200);

      // 2. Second submission with the SAME nonce must be rejected with 403 (Replay detected)
      const linkReq2 = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: evmAddressA,
          signature: sig,
          challenge: chalBody.challenge,
          nonce: chalBody.nonce,
        }),
      });

      const res2 = await registerHederaWalletRoute(linkReq2);
      assert.strictEqual(res2.status, 403);
      const body2 = await res2.json();
      assert.match(body2.error, /Replay detected: This challenge nonce has already been used/i);
    });

    await tSub.test('rejects challenge that does not bind the authenticated user ID', async () => {
      const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({ evmAddress: evmAddressA }),
      });
      const chalRes = await createChallengeRoute(chalReq);
      const chalBody = await chalRes.json();

      // Attacker intercepts and replaces user ID
      const tamperedChallenge = chalBody.challenge.replace(userA, 'attacker_user_id_999');
      const sig = await metaMaskAccountA.signMessage({ message: tamperedChallenge });

      const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userA}`,
        },
        body: JSON.stringify({
          evmAddress: evmAddressA,
          signature: sig,
          challenge: tamperedChallenge,
          nonce: chalBody.nonce,
        }),
      });

      const res = await registerHederaWalletRoute(linkReq);
      assert.strictEqual(res.status, 403);
      const body = await res.json();
      assert.match(body.error, /Challenge mismatch: Challenge message does not bind the authenticated user ID/i);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Cross-User Access & Safe Ownership Transfer
  // --------------------------------------------------------------------------
  await t.test('Scenario 6: Cross-user claim protection with EVM cryptographic proof', async () => {
    // 1. User A links wallet A
    const chalReqA = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({ evmAddress: evmAddressA }),
    });
    const chalResA = await createChallengeRoute(chalReqA);
    const chalBodyA = await chalResA.json();
    const sigA = await metaMaskAccountA.signMessage({ message: chalBodyA.challenge });

    const linkReqA = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        evmAddress: evmAddressA,
        signature: sigA,
        challenge: chalBodyA.challenge,
        nonce: chalBodyA.nonce,
      }),
    });
    const linkResA = await registerHederaWalletRoute(linkReqA);
    assert.strictEqual(linkResA.status, 200);

    // 2. User B tries to claim Account A using ONLY Account ID and public key (without EVM signature)
    const stealReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB}`,
      },
      body: JSON.stringify({
        accountId: hederaAccountIdA,
        publicKey: testEcdsaPubA,
      }),
    });

    // MUST BE REJECTED with 403
    const stealRes = await registerHederaWalletRoute(stealReq);
    assert.strictEqual(stealRes.status, 403);
    const stealBody = await stealRes.json();
    assert.match(stealBody.error, /already registered to another PaidX user.*prove cryptographic key control/i);

    // 3. When User B proves genuine EVM key control with valid challenge signature, transfer succeeds
    const chalReqB = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB}`,
      },
      body: JSON.stringify({ evmAddress: evmAddressA }),
    });
    const chalResB = await createChallengeRoute(chalReqB);
    const chalBodyB = await chalResB.json();
    const sigTransfer = await metaMaskAccountA.signMessage({ message: chalBodyB.challenge });

    const claimReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userB}`,
      },
      body: JSON.stringify({
        evmAddress: evmAddressA,
        signature: sigTransfer,
        challenge: chalBodyB.challenge,
        nonce: chalBodyB.nonce,
      }),
    });

    const claimRes = await registerHederaWalletRoute(claimReq);
    assert.strictEqual(claimRes.status, 200);
    const claimBody = await claimRes.json();
    assert.strictEqual(claimBody.success, true);
    assert.match(claimBody.message, /ownership verified and transferred/i);

    // Verify ownership in database was transferred to User B
    const updated = mockSupabase.db.wallets.find((w) => w.address === hederaAccountIdA);
    assert.strictEqual(updated.user_id, userB);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Successful Agent Creation with Linked MetaMask Wallet
  // --------------------------------------------------------------------------
  await t.test('Scenario 7: Agent creation recognizes MetaMask-linked Hedera wallet and enforces Requirement 13', async () => {
    // 1. Link MetaMask wallet for User A
    const chalReq = new NextRequest('http://localhost:3000/api/wallets/hedera/challenge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({ evmAddress: evmAddressA }),
    });
    const chalRes = await createChallengeRoute(chalReq);
    const chalBody = await chalRes.json();
    const sig = await metaMaskAccountA.signMessage({ message: chalBody.challenge });

    const linkReq = new NextRequest('http://localhost:3000/api/wallets/hedera', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        evmAddress: evmAddressA,
        signature: sig,
        challenge: chalBody.challenge,
        nonce: chalBody.nonce,
      }),
    });
    const linkRes = await registerHederaWalletRoute(linkReq);
    assert.strictEqual(linkRes.status, 200);
    const linkedWalletId = mockSupabase.db.wallets[0].id;

    // 2. Call POST /api/agents without walletId -> automatically finds primary Hedera wallet
    const agentReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'MetaMask Hedera Agent',
        dailyBudget: 50,
        maxAmountPerTx: 10,
        autonomousPaymentsEnabled: true, // User requests true
      }),
    });

    const agentRes = await createAgentRoute(agentReq);
    assert.strictEqual(agentRes.status, 200);
    const agentBody = await agentRes.json();

    assert.strictEqual(agentBody.success, true);
    assert.ok(agentBody.token.startsWith('paidx_agt_'));
    assert.ok(agentBody.agentId);

    // Verify agent connection points to the MetaMask-linked Hedera wallet
    const conn = mockSupabase.db.agent_connections[0];
    assert.strictEqual(conn.user_id, userA);
    assert.strictEqual(conn.wallet_id, linkedWalletId);

    // Requirement 13 Verification:
    // Because MetaMask EVM wallet has no in-memory delegated signing key,
    // autonomous_payments_enabled MUST be enforced as false!
    const policy = mockSupabase.db.agent_policies[0];
    assert.strictEqual(policy.autonomous_payments_enabled, false);
    assert.strictEqual(agentBody.autonomousPaymentsEnabled, false);
  });
});
