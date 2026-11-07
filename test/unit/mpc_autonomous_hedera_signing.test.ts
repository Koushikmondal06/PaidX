import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import {
  PrivateKey,
  PublicKey,
  AccountId,
  TransferTransaction,
  AccountUpdateTransaction,
  KeyList,
  TransactionId,
  Hbar,
} from '@hiero-ledger/sdk';

import {
  defaultMpcEngine,
  defaultMpcSigner,
  MpcTssEngine,
  MpcKeyStore,
  type MpcThresholdKey,
  type MpcShare,
  SECP256K1_ORDER,
  ED25519_ORDER,
  mod,
  lagrangeCoefficient,
} from '../../dashboard/lib/hedera/signing/mpcSigner.ts';
import {
  prepareMpcAccountAuthorization,
  finalizeMpcAccountAuthorization,
} from '../../dashboard/lib/hedera/signing/mpcEnrollment.ts';
import {
  getWalletSigningProvider,
  setWalletSigningProvider,
  resetWalletSigningProvider,
} from '../../dashboard/lib/hedera/signing/registry.ts';
import { keyStructureMatches } from '../../dashboard/lib/hedera/signing/delegatedSigner.ts';
import { setTestMirrorMock } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { setTestFacilitatorMock } from '../../dashboard/lib/hedera/x402/facilitator.ts';
import { setTestPriceOracleMock, resetTestPriceOracleMock } from '../../dashboard/lib/agent/priceOracle.ts';
import { closeHederaClient } from '../../dashboard/lib/hedera/client.ts';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import { POST as createAgentRoute } from '../../dashboard/app/api/agents/route.ts';
import { POST as revokeAgentRoute } from '../../dashboard/app/api/agents/revoke/route.ts';
import { POST as chatAgentRoute } from '../../dashboard/app/api/agents/chat/route.ts';
import { POST as enrollMpcRoute } from '../../dashboard/app/api/mpc/enroll/route.ts';
import { POST as recoverMpcRoute } from '../../dashboard/app/api/mpc/recover/route.ts';

// -----------------------------------------------------------------------------
// In-Memory Database Mock for Supabase
// -----------------------------------------------------------------------------
interface MockDb {
  wallets: any[];
  agent_connections: any[];
  agent_policies: any[];
  agent_payments: any[];
  agent_spending_reservations: any[];
}

function createMockSupabaseClient(db: MockDb) {
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
    from: (table: keyof MockDb) => {
      const filters: Array<(row: any) => boolean> = [];
      let sortCol: string | null = null;
      let sortAscending = true;
      let limitCount: number | null = null;
      let pendingUpdate: any = null;
      let pendingInsert: any = null;
      let isDelete = false;

      function getFilteredRows() {
        let rows = pendingInsert ? [...pendingInsert] : (db[table] || []).filter((r) => filters.every((f) => f(r)));

        if (pendingUpdate) {
          for (const r of rows) {
            Object.assign(r, pendingUpdate);
            const orig = (db[table] || []).find((x: any) => x.id === r.id);
            if (orig) Object.assign(orig, pendingUpdate);
          }
        }

        if (isDelete) {
          const ids = new Set(rows.map((r) => r.id));
          db[table] = (db[table] as any[]).filter((r) => !ids.has(r.id));
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

        if (table === 'agent_connections') {
          return rows.map((r) => {
            const wallet = db.wallets?.find((w) => w.id === r.wallet_id);
            const policy = db.agent_policies?.find((p) => p.agent_id === r.id);
            return {
              ...r,
              wallets: wallet || null,
              agent_policies: policy ? [policy] : [],
            };
          });
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
            updated_at: new Date().toISOString(),
            ...d,
          }));
          if (!db[table]) db[table] = [];
          db[table].push(...inserted);
          pendingInsert = inserted;
          return builder;
        },
        update: (data: any) => {
          pendingUpdate = { ...data, updated_at: new Date().toISOString() };
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
    rpc: async (func: string, params: any) => {
      if (func === 'reserve_agent_budget') {
        const { p_agent_id, p_amount_usd_micro, p_idempotency_key } = params;
        const policy = db.agent_policies.find((p) => p.agent_id === p_agent_id);
        if (!policy) {
          return { data: JSON.stringify({ allowed: false, reason: 'Policy not found' }), error: null };
        }

        const maxPerTx = BigInt(policy.max_amount_per_tx || '5000000');
        const dailyLimit = BigInt(policy.daily_budget || '20000000');
        const spentToday = BigInt(policy.spent_today || '0');
        const reqAmount = BigInt(p_amount_usd_micro || '0');

        if (reqAmount > maxPerTx) {
          return {
            data: JSON.stringify({
              allowed: false,
              requires_human_approval: true,
              reason: `Transaction amount (${reqAmount}) exceeds per-transaction limit (${maxPerTx})`,
              code: 'MAX_AMOUNT_EXCEEDED',
            }),
            error: null,
          };
        }

        if (spentToday + reqAmount > dailyLimit) {
          return {
            data: JSON.stringify({
              allowed: false,
              requires_human_approval: true,
              reason: 'Daily budget exhausted',
              code: 'DAILY_BUDGET_EXCEEDED',
            }),
            error: null,
          };
        }

        if (!policy.autonomous_payments_enabled) {
          return {
            data: JSON.stringify({
              allowed: false,
              requires_human_approval: true,
              reason: 'Autonomous payments disabled',
              code: 'APPROVAL_REQUIRED',
            }),
            error: null,
          };
        }

        const resId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        db.agent_spending_reservations.push({
          id: resId,
          agent_id: p_agent_id,
          amount_usd_micro: p_amount_usd_micro,
          status: 'reserved',
          idempotency_key: p_idempotency_key,
          expires_at: new Date(Date.now() + 60000).toISOString(),
        });

        return {
          data: JSON.stringify({
            allowed: true,
            requires_human_approval: false,
            reservation_id: resId,
            normalized_amount_usd_micro: p_amount_usd_micro,
            daily_budget_remaining: (dailyLimit - (spentToday + reqAmount)).toString(),
          }),
          error: null,
        };
      }

      if (func === 'commit_agent_reservation') {
        const { p_agent_id, p_reservation_id } = params;
        const res = db.agent_spending_reservations.find(
          (r) => r.id === p_reservation_id && r.agent_id === p_agent_id
        );
        if (res) {
          res.status = 'settled';
          const pol = db.agent_policies.find((p) => p.agent_id === p_agent_id);
          if (pol) {
            pol.spent_today = (BigInt(pol.spent_today || '0') + BigInt(res.amount_usd_micro || '0')).toString();
          }
        }
        return { data: JSON.stringify({ success: true }), error: null };
      }

      if (func === 'release_agent_reservation') {
        const { p_reservation_id } = params;
        const res = db.agent_spending_reservations.find((r) => r.id === p_reservation_id);
        if (res) {
          res.status = 'released';
        }
        return { data: JSON.stringify({ success: true }), error: null };
      }

      return { data: null, error: new Error(`Unknown RPC function: ${func}`) };
    },
  };

  return client;
}

test('PaidX MPC-Based Autonomous Hedera Signing & Account Authorization Suite', async (t) => {
  const userA = 'user_alice_testnet';
  const mainWalletAddress = '0.0.123456';
  const recipientAddress = '0.0.11334921';

  // User's existing MetaMask ECDSA key
  const userMetaMaskPrivKey = PrivateKey.generateECDSA();
  const userMetaMaskPubKey = userMetaMaskPrivKey.publicKey;

  let mockDb: MockDb;
  let mockSupabase: any;

  t.beforeEach(() => {
    mockDb = {
      wallets: [
        {
          id: 'wallet-main-1',
          user_id: userA,
          address: mainWalletAddress,
          chain_id: 296,
          kind: 'hedera',
          network: 'hedera:testnet',
          is_primary: true,
          smart_account_upgraded: false,
          verified: true,
          public_key: userMetaMaskPubKey.toStringRaw(),
          evm_address: '0x9f5aea90e65bab8fbc49385f5076391a6a26ed28',
          verification_metadata: {
            signer_type: 'metamask_evm',
            verification_method: 'metamask_evm_signature',
          },
        },
      ],
      agent_connections: [],
      agent_policies: [],
      agent_payments: [],
      agent_spending_reservations: [],
    };

    mockSupabase = createMockSupabaseClient(mockDb);
    setTestSupabaseClient(mockSupabase);

    // Default Mirror Node mock: User's account with single MetaMask key
    setTestMirrorMock({
      getAccount: async (accId: string) => {
        // Return KeyList with threshold 1 if MPC is enrolled
        const mpcKey = defaultMpcSigner.getKey(mainWalletAddress);
        let keyStructure: any = {
          _type: 'ECDSA_SECP256K1',
          key: userMetaMaskPubKey.toStringRaw(),
        };

        if (mpcKey && mpcKey.status === 'active') {
          keyStructure = {
            _type: 'ThresholdKey',
            threshold: 1,
            keys: [
              { _type: 'ECDSA_SECP256K1', key: userMetaMaskPubKey.toStringRaw() },
              { _type: mpcKey.curve === 'secp256k1' ? 'ECDSA_SECP256K1' : 'ED25519', key: mpcKey.publicKeyHex },
            ],
          };
        }

        return {
          account: accId,
          alias: null,
          auto_renew_period: 7776000,
          balance: { balance: 10000000000, timestamp: '1', tokens: [] },
          deleted: false,
          evm_address: '0x9f5aea90e65bab8fbc49385f5076391a6a26ed28',
          key: keyStructure,
        };
      },
      getTransaction: async (txId: string) => {
        return {
          transaction_id: txId,
          consensus_timestamp: '1700000000.123456789',
          result: 'SUCCESS',
          charged_tx_fee: 100000,
          transfers: [
            { account: recipientAddress, amount: 1000000 },
            { account: mainWalletAddress, amount: -1000000 },
          ],
          token_transfers: [],
        };
      },
    });

    // Mock facilitator
    setTestFacilitatorMock({
      supported: async () => ({
        networks: ['hedera:testnet'],
        schemes: ['exact'],
        assets: ['0.0.0', 'HBAR', 'USDC'],
        methods: ['cryptoTransfer'],
        feePayerAccount: '0.0.987654',
      }),
      verify: async () => ({ valid: true }),
      settle: async () => ({
        success: true,
        transactionId: `${mainWalletAddress}@${Date.now()}.000000000`,
        hashScanUrl: `https://hashscan.io/testnet/transaction/${mainWalletAddress}@${Date.now()}.000000000`,
      }),
    });

    // Mock price oracle ($0.08 per HBAR)
    setTestPriceOracleMock((assetSymbol) => {
      if (assetSymbol.toUpperCase() === 'HBAR') {
        return {
          assetSymbol: 'HBAR',
          priceUsd: '0.080000',
          priceMicroUsd: 80000n,
          centEquivalent: 80000n,
          hbarEquivalent: 10000n,
          source: 'hedera_mirror_node',
          timestamp: Date.now(),
          decimals: 6,
        };
      }
      return null;
    });
  });

  t.afterEach(() => {
    setTestMirrorMock(null);
    setTestFacilitatorMock(null);
    setTestSupabaseClient(null);
    resetTestPriceOracleMock();
    resetWalletSigningProvider();
    defaultMpcSigner.unregisterMpcKey(mainWalletAddress);
  });

  t.after(() => {
    closeHederaClient();
  });

  // --------------------------------------------------------------------------
  // Phase 2: MPC Key Generation (2-of-3 DKG) & Threshold Signing
  // --------------------------------------------------------------------------
  await t.test('Phase 2: 2-of-3 MPC Threshold Key Generation, Encryption & Signing', async () => {
    const engine = new MpcTssEngine();
    const thresholdKey = engine.generateThresholdKey(mainWalletAddress, 'secp256k1');

    assert.strictEqual(thresholdKey.threshold, 2);
    assert.strictEqual(thresholdKey.totalShares, 3);
    assert.strictEqual(thresholdKey.status, 'active');
    assert.ok(thresholdKey.publicKeyHex.length >= 66);

    // Verify shares are distinct
    assert.notStrictEqual(thresholdKey.agentSessionShare.value, thresholdKey.userRecoveryShare.value);

    // Verify Server share is encrypted at rest with AES-256-GCM
    assert.strictEqual(thresholdKey.encryptedServerShare.algorithm, 'aes-256-gcm');
    assert.ok(thresholdKey.encryptedServerShare.tag.length === 32); // 16 bytes = 32 hex chars

    // Test threshold signing of message bytes
    const messageBytes = crypto.createHash('sha256').update('Hedera Payment Intent: 0.01 HBAR').digest();
    const signatureBytes = await engine.signThreshold(thresholdKey, messageBytes, thresholdKey.agentSessionShare);

    assert.strictEqual(signatureBytes.length, 64, 'ECDSA signature must be 64 bytes (r, s)');

    // Verify signature against public key
    const pubKey = PublicKey.fromStringECDSA('0x' + thresholdKey.publicKeyHex);
    const verified = pubKey.verify(messageBytes, signatureBytes);
    assert.strictEqual(verified, true, 'Threshold signature must verify against MPC public key');
  });

  // --------------------------------------------------------------------------
  // Phase 3: Hedera Account Authorization & KeyList Threshold-1 Configuration
  // --------------------------------------------------------------------------
  await t.test('Phase 3: Prepares & Finalizes Native Hedera ThresholdKey (1 of 2)', async () => {
    // 1. Prepare AccountUpdateTransaction
    const { thresholdKey, preparedUpdate } = await prepareMpcAccountAuthorization({
      accountId: mainWalletAddress,
      evmAddress: '0x9f5aea90e65bab8fbc49385f5076391a6a26ed28',
      curve: 'secp256k1',
    });

    assert.strictEqual(preparedUpdate.accountId, mainWalletAddress);
    assert.strictEqual(preparedUpdate.proposedKeyStructure.threshold, 1);
    assert.strictEqual(preparedUpdate.proposedKeyStructure.keys.length, 2);
    assert.ok(preparedUpdate.recoveryNotice.includes('MetaMask key is preserved'));

    // 2. User signs the prepared transaction bytes using MetaMask ECDSA key
    const txBytes = Buffer.from(preparedUpdate.transactionBytesBase64, 'base64');
    const userSig = userMetaMaskPrivKey.sign(txBytes);
    const userSigHex = Buffer.from(userSig).toString('hex');

    // 3. Finalize Account Authorization
    const result = await finalizeMpcAccountAuthorization({
      thresholdKey,
      userSignatureHex: userSigHex,
      preparedUpdate,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.onChainVerified, true);
    assert.ok(result.userRecoveryShare.fingerprint);

    // 4. Verify Mirror Node keyStructureMatches authorizes BOTH MetaMask key AND MPC key
    const mpcPub = PublicKey.fromStringECDSA('0x' + thresholdKey.publicKeyHex);
    const mockMirrorAccount = await (setTestMirrorMock as any) === null ? null : {
      key: {
        _type: 'ThresholdKey',
        threshold: 1,
        keys: [
          { _type: 'ECDSA_SECP256K1', key: userMetaMaskPubKey.toStringRaw() },
          { _type: 'ECDSA_SECP256K1', key: thresholdKey.publicKeyHex },
        ],
      },
    };

    const userAuthorized = keyStructureMatches(mockMirrorAccount.key as any, userMetaMaskPubKey);
    const mpcAuthorized = keyStructureMatches(mockMirrorAccount.key as any, mpcPub);

    assert.strictEqual(userAuthorized, true, 'User MetaMask key remains authorized with threshold 1');
    assert.strictEqual(mpcAuthorized, true, 'MPC threshold key is authorized with threshold 1');
  });

  // --------------------------------------------------------------------------
  // Phase 4: Autonomous Payment Execution ("Send 0.01 HBAR to 0.0.11334921.")
  // --------------------------------------------------------------------------
  await t.test('Phase 4: Autonomous HBAR payment executes via MPC threshold signer without MetaMask prompt', async () => {
    // 1. Enroll account in MPC
    const { thresholdKey, preparedUpdate } = await prepareMpcAccountAuthorization({
      accountId: mainWalletAddress,
      evmAddress: '0x9f5aea90e65bab8fbc49385f5076391a6a26ed28',
    });
    defaultMpcSigner.registerMpcKey(thresholdKey);

    // 2. Create agent with autonomous payments
    const createReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'MPC Autonomous Shopping Agent',
        walletId: 'wallet-main-1',
        maxAmountPerTx: '5000000',   // $5.00 limit
        dailyBudget: '20000000',     // $20.00 daily
        monthlyBudget: '100000000',  // $100.00 monthly
        autonomousPaymentsEnabled: true,
        grantDelegatedSigning: true,
      }),
    });

    const createRes = await createAgentRoute(createReq);
    assert.strictEqual(createRes.status, 200);
    const { token, agentId } = await createRes.json();

    // 3. User says: "Send 0.01 HBAR to 0.0.11334921."
    const chatReq = new NextRequest('http://localhost:3000/api/agents/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agentId,
        prompt: 'Send 0.01 HBAR to 0.0.11334921.',
      }),
    });

    const chatRes = await chatAgentRoute(chatReq);
    assert.strictEqual(chatRes.status, 200);
    const chatBody = await chatRes.json();

    assert.strictEqual(chatBody.success, true);
    assert.ok(chatBody.response.includes('Payment successful'));
    assert.ok(chatBody.response.includes('0.01 HBAR was sent to 0.0.11334921'));
    assert.ok(chatBody.details.transactionId);
    assert.ok(chatBody.details.hashScanUrl.includes('hashscan.io/testnet'));

    // 4. Verify payment was recorded in database
    assert.strictEqual(mockDb.agent_payments.length, 1);
    const payment = mockDb.agent_payments[0];
    assert.strictEqual(payment.recipient, recipientAddress);
    assert.strictEqual(payment.amount_atomic, '1000000'); // 1,000,000 tinybars
    assert.strictEqual(payment.status, 'confirmed');
  });

  // --------------------------------------------------------------------------
  // Phase 5: Key Recovery & Backend Restart Resilience
  // --------------------------------------------------------------------------
  await t.test('Phase 5: Key recovery using User Recovery Share (Share 3) + Server Share (Share 2)', async () => {
    const engine = new MpcTssEngine();
    const thresholdKey = engine.generateThresholdKey(mainWalletAddress, 'secp256k1');

    // 1. Recover using Share 3 (User Recovery) + Share 2 (Server)
    const recoveredScalarHex = engine.recoverKeyWithUserShare(thresholdKey, thresholdKey.userRecoveryShare);
    const recoveredPriv = PrivateKey.fromStringECDSA('0x' + recoveredScalarHex);

    assert.strictEqual(
      recoveredPriv.publicKey.toStringRaw(),
      thresholdKey.publicKeyHex,
      'Recovery with Share 3 + Share 2 must derive the exact master public key'
    );

    // 2. Recover using Share 3 (User Recovery) + Share 1 (Agent Session)
    const rec13Scalar = engine.reconstructFromShares(
      thresholdKey.agentSessionShare,
      thresholdKey.userRecoveryShare,
      'secp256k1'
    );
    const rec13Priv = PrivateKey.fromStringECDSA('0x' + rec13Scalar.toString(16).padStart(64, '0'));

    assert.strictEqual(
      rec13Priv.publicKey.toStringRaw(),
      thresholdKey.publicKeyHex,
      'Recovery with Share 3 + Share 1 must derive the exact master public key'
    );
  });

  // --------------------------------------------------------------------------
  // Phase 5: Proactive Share Rotation (Without Changing On-Chain Public Key)
  // --------------------------------------------------------------------------
  await t.test('Phase 5: Proactive Share Rotation updates shares without changing public key', async () => {
    const engine = new MpcTssEngine();
    const originalKey = engine.generateThresholdKey(mainWalletAddress, 'secp256k1');

    const rotatedKey = engine.rotateThresholdShares(originalKey);

    assert.strictEqual(rotatedKey.keyRotationCount, 1);
    assert.strictEqual(rotatedKey.publicKeyHex, originalKey.publicKeyHex, 'Public key must remain identical');

    // Shares must change
    assert.notStrictEqual(rotatedKey.agentSessionShare.value, originalKey.agentSessionShare.value);

    // Rotated shares must sign and verify against the same public key
    const msg = crypto.createHash('sha256').update('Rotated Share Test').digest();
    const sig = await engine.signThreshold(rotatedKey, msg, rotatedKey.agentSessionShare);

    const pub = PublicKey.fromStringECDSA('0x' + rotatedKey.publicKeyHex);
    assert.strictEqual(pub.verify(msg, sig), true, 'Rotated shares must produce valid signatures');
  });

  // --------------------------------------------------------------------------
  // Phase 5 & 6: Immediate Agent Revocation
  // --------------------------------------------------------------------------
  await t.test('Phase 6: Revoking agent unregisters MPC signing context and rejects subsequent payments', async () => {
    // 1. Authorize agent
    const { thresholdKey } = await prepareMpcAccountAuthorization({
      accountId: mainWalletAddress,
      evmAddress: '0x9f5aea90e65bab8fbc49385f5076391a6a26ed28',
    });
    defaultMpcSigner.registerMpcKey(thresholdKey);

    const createReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Revocable MPC Agent',
        walletId: 'wallet-main-1',
        maxAmountPerTx: '5000000',
        dailyBudget: '20000000',
        monthlyBudget: '100000000',
        autonomousPaymentsEnabled: true,
        grantDelegatedSigning: true,
      }),
    });
    const { token, agentId } = await (await createAgentRoute(createReq)).json();

    // 2. Revoke agent
    const revokeReq = new NextRequest('http://localhost:3000/api/agents/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({ agentId }),
    });

    const revokeRes = await revokeAgentRoute(revokeReq);
    assert.strictEqual(revokeRes.status, 200);

    // 3. MPC signer canSign must be false
    const canSignAfter = await defaultMpcSigner.canSign(mainWalletAddress);
    assert.strictEqual(canSignAfter, false, 'MPC signer must not be able to sign after revocation');

    // 4. Subsequent payment instruction must fail immediately with 401
    const chatReq = new NextRequest('http://localhost:3000/api/agents/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agentId,
        prompt: 'Send 0.01 HBAR to 0.0.11334921.',
      }),
    });

    const chatRes = await chatAgentRoute(chatReq);
    assert.strictEqual(chatRes.status, 401);
  });

  // --------------------------------------------------------------------------
  // Phase 6: Spending Limit Rejection (Fails Closed Before MPC Signer)
  // --------------------------------------------------------------------------
  await t.test('Phase 6: Transactions exceeding spending limits fail closed without invoking MPC signer', async () => {
    const { thresholdKey } = await prepareMpcAccountAuthorization({
      accountId: mainWalletAddress,
      evmAddress: '0x9f5aea90e65bab8fbc49385f5076391a6a26ed28',
    });
    defaultMpcSigner.registerMpcKey(thresholdKey);

    const createReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Strict Limit MPC Agent',
        walletId: 'wallet-main-1',
        maxAmountPerTx: '5000000', // $5 limit
        dailyBudget: '20000000',
        monthlyBudget: '100000000',
        autonomousPaymentsEnabled: true,
        grantDelegatedSigning: true,
      }),
    });
    const { token, agentId } = await (await createAgentRoute(createReq)).json();

    // 100 HBAR at $0.08 = $8.00 > $5.00 limit
    const chatReq = new NextRequest('http://localhost:3000/api/agents/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agentId,
        prompt: 'Send 100 HBAR to 0.0.11334921.',
      }),
    });

    const chatRes = await chatAgentRoute(chatReq);
    const chatBody = await chatRes.json();

    assert.strictEqual(chatBody.success, false);
    assert.strictEqual(chatBody.requiresHumanApproval, true);
    assert.ok(chatBody.response.includes('Payment requires interactive human approval'));
  });

  // --------------------------------------------------------------------------
  // Phase 6: Tampering Detection & AES-256-GCM Fail-Closed Security
  // --------------------------------------------------------------------------
  await t.test('Phase 6: Tampered server share tag fails closed', async () => {
    const engine = new MpcTssEngine();
    const thresholdKey = engine.generateThresholdKey(mainWalletAddress, 'secp256k1');

    // Corrupt the AES-GCM auth tag
    const corruptedKey: MpcThresholdKey = {
      ...thresholdKey,
      encryptedServerShare: {
        ...thresholdKey.encryptedServerShare,
        tag: '00000000000000000000000000000000', // Tampered tag
      },
    };

    const msg = crypto.createHash('sha256').update('Tamper Test').digest();

    await assert.rejects(
      async () => {
        await engine.signThreshold(corruptedKey, msg, corruptedKey.agentSessionShare);
      },
      (err: any) => {
        assert.ok(err.message.includes('Unsupported state or unable to authenticate data'));
        return true;
      }
    );
  });
});
