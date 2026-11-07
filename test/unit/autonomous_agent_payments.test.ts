import test from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { PrivateKey, AccountId, TransferTransaction, Hbar } from '@hiero-ledger/sdk';

import {
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_TESTNET_CHAIN_ID_HEX,
  HEDERA_TESTNET_RPC_URL,
  getMetaMaskEthereumProvider,
  parseChainId,
  ensureHederaTestnetNetwork,
  MetaMaskError,
} from '../../dashboard/lib/hedera/chain.ts';
import {
  delegatedSigner,
  keyStructureMatches,
} from '../../dashboard/lib/hedera/signing/delegatedSigner.ts';
import {
  setTestMirrorMock,
  type MirrorAccount,
} from '../../dashboard/lib/hedera/mirrorNode.ts';
import {
  setTestFacilitatorMock,
} from '../../dashboard/lib/hedera/x402/facilitator.ts';
import { closeHederaClient } from '../../dashboard/lib/hedera/client.ts';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import {
  setTestPriceOracleMock,
  resetTestPriceOracleMock,
} from '../../dashboard/lib/agent/priceOracle.ts';
import { POST as createAgentRoute } from '../../dashboard/app/api/agents/route.ts';
import { POST as revokeAgentRoute } from '../../dashboard/app/api/agents/revoke/route.ts';
import { POST as chatAgentRoute } from '../../dashboard/app/api/agents/chat/route.ts';
import { parsePaymentInstruction } from '../../dashboard/lib/agent/instructionParser.ts';

// -----------------------------------------------------------------------------
// In-Memory Database for Supabase Mock
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

        // Check per-transaction limit
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

        // Check daily budget
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

        // Autonomous check
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

test('PaidX Autonomous AI-Agent Payments Suite', async (t) => {
  const userA = 'user_alice_testnet';
  const mainWalletAddress = '0.0.123456';
  const recipientAddress = '0.0.11334921';

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

    // Set mock mirror node
    setTestMirrorMock({
      getAccount: async (accId: string) => {
        return {
          account: accId,
          alias: null,
          auto_renew_period: 7776000,
          balance: { balance: 10000000000, timestamp: '1', tokens: [] },
          deleted: false,
          evm_address: '',
          key: { _type: 'ED25519', key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
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

    // Set mock facilitator
    setTestFacilitatorMock({
      supported: async () => ({
        networks: ['hedera:testnet'],
        schemes: ['exact'],
        assets: ['0.0.0', 'HBAR', 'USDC'],
        methods: ['cryptoTransfer'],
        feePayerAccount: '0.0.987654',
      }),
      verify: async () => ({ valid: true }),
      settle: async (payload) => ({
        success: true,
        transactionId: `${mainWalletAddress}@${Date.now()}.000000000`,
        hashScanUrl: `https://hashscan.io/testnet/transaction/${mainWalletAddress}@${Date.now()}.000000000`,
      }),
    });
    // Set mock price oracle ($0.08 per HBAR)
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
  });

  t.after(() => {
    closeHederaClient();
  });

  // --------------------------------------------------------------------------
  // Requirement 1 & 2: Delegated Agent Signing Setup
  // User connects main wallet once and grants the agent limited spending permissions
  // --------------------------------------------------------------------------
  await t.test('1 & 2: User connects main wallet once and grants agent delegated spending permissions', async () => {
    const createReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Autonomous Agent Alpha',
        walletId: 'wallet-main-1',
        maxAmountPerTx: '5000000',   // $5.00 limit
        dailyBudget: '20000000',     // $20.00 daily budget
        monthlyBudget: '100000000',  // $100.00 monthly budget
        autonomousPaymentsEnabled: true,
        grantDelegatedSigning: true, // User grants delegated signing permissions
      }),
    });

    const createRes = await createAgentRoute(createReq);
    assert.strictEqual(createRes.status, 200);
    const body = await createRes.json();

    assert.strictEqual(body.success, true);
    assert.strictEqual(body.autonomousPaymentsEnabled, true);
    assert.ok(body.token.startsWith('paidx_agt_'));
    assert.ok(body.sessionPublicKey, 'Should return derived agent session public key');

    // Verify delegatedSigner can sign for the account using the delegated session key
    const canSign = await delegatedSigner.canSign(mainWalletAddress);
    assert.strictEqual(canSign, true, 'delegatedSigner must have session key registered');
  });

  // --------------------------------------------------------------------------
  // Requirement 3 & 4 & 5: Autonomous HBAR payment execution (Expected UX)
  // "Send 0.01 HBAR to 0.0.11334921." -> No MetaMask confirmation popup!
  // --------------------------------------------------------------------------
  await t.test('4 & 5: Expected UX: "Send 0.01 HBAR to 0.0.11334921." executes autonomously', async () => {
    // 1. Authorize agent with delegated session key
    const createReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Autonomous Shopping Agent',
        walletId: 'wallet-main-1',
        maxAmountPerTx: '5000000',
        dailyBudget: '20000000',
        monthlyBudget: '100000000',
        autonomousPaymentsEnabled: true,
        grantDelegatedSigning: true,
      }),
    });

    const createRes = await createAgentRoute(createReq);
    const { token, agentId } = await createRes.json();

    // 2. Natural language payment instruction via chat endpoint
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

    // 3. Verify payment was logged in agent_payments table (Requirement 7)
    assert.strictEqual(mockDb.agent_payments.length, 1);
    const payment = mockDb.agent_payments[0];
    assert.strictEqual(payment.recipient, recipientAddress);
    assert.strictEqual(payment.amount_atomic, '1000000'); // 0.01 HBAR = 1,000,000 tinybars
    assert.strictEqual(payment.asset, 'HBAR');
    assert.strictEqual(payment.status, 'confirmed');
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Reject transactions exceeding delegated permissions
  // --------------------------------------------------------------------------
  await t.test('10: Rejects transactions exceeding maximum per-transaction limit ($5 limit)', async () => {
    // 1. Authorize agent
    const createReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Strict Policy Agent',
        walletId: 'wallet-main-1',
        maxAmountPerTx: '5000000', // $5.00 limit (5,000,000 USD-micro)
        dailyBudget: '20000000',
        monthlyBudget: '100000000',
        autonomousPaymentsEnabled: true,
        grantDelegatedSigning: true,
      }),
    });
    const { token, agentId } = await (await createAgentRoute(createReq)).json();

    // 2. Attempt to send 100 HBAR (which at ~$0.08 is ~$8.00 > $5 limit)
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

    // MUST NOT execute autonomously
    assert.strictEqual(chatBody.success, false);
    assert.ok(
      chatBody.requiresHumanApproval === true || chatBody.response.includes('Payment requires interactive human approval'),
      'Transactions exceeding $5 limit must be halted and not executed autonomously'
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Provide instant delegation revocation
  // --------------------------------------------------------------------------
  await t.test('8: Revoking an agent immediately purges session key and halts payments', async () => {
    // 1. Authorize agent
    const createReq = new NextRequest('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA}`,
      },
      body: JSON.stringify({
        agentName: 'Revocable Agent',
        walletId: 'wallet-main-1',
        maxAmountPerTx: '5000000',
        dailyBudget: '20000000',
        monthlyBudget: '100000000',
        autonomousPaymentsEnabled: true,
        grantDelegatedSigning: true,
      }),
    });
    const { token, agentId } = await (await createAgentRoute(createReq)).json();

    // 2. User calls revoke
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

    // 3. Subsequent payment attempt with revoked agent MUST FAIL with 401
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
    assert.strictEqual(chatRes.status, 401, 'Revoked agent token must be rejected immediately');
  });

  // --------------------------------------------------------------------------
  // Inspection 1, 2, 3: MetaMask & Brave multi-provider detection & chain ID parsing
  // --------------------------------------------------------------------------
  await t.test('Multi-provider: Filters out Brave Wallet to select genuine MetaMask', () => {
    const mockBraveProvider = { isBraveWallet: true, isMetaMask: true, name: 'Brave' };
    const mockMetaMaskProvider = { isBraveWallet: undefined, isMetaMask: true, name: 'GenuineMetaMask' };

    // In Brave with MetaMask installed, window.ethereum.providers contains both
    const customEthereum = {
      providers: [mockBraveProvider, mockMetaMaskProvider],
    };

    const selected = getMetaMaskEthereumProvider(customEthereum);
    assert.strictEqual(selected.name, 'GenuineMetaMask', 'Must select genuine MetaMask provider');
  });

  await t.test('Chain ID parsing: Correctly parses hex and decimal strings without radix mismatch', () => {
    assert.strictEqual(parseChainId('0x128'), 296);
    assert.strictEqual(parseChainId('0x0128'), 296);
    assert.strictEqual(parseChainId(296), 296);
    assert.strictEqual(parseChainId('296'), 296);
  });

  await t.test('Error preservation: Captures and displays original MetaMask error code and message', async () => {
    const mockFailingProvider = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0x1'; // Ethereum Mainnet
        if (method === 'wallet_switchEthereumChain') {
          const err: any = new Error('May not specify default MetaMask chain.');
          err.code = -32603;
          throw err;
        }
        throw new Error('Unexpected');
      },
    };

    try {
      await ensureHederaTestnetNetwork(mockFailingProvider);
      assert.fail('Should have thrown');
    } catch (err: any) {
      assert.ok(err instanceof MetaMaskError);
      assert.strictEqual(err.originalCode, -32603);
      assert.ok(err.message.includes('May not specify default MetaMask chain.'));
      assert.ok(err.message.includes('[Code -32603]'));
    }
  });
});
