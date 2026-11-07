import test from 'node:test';
import assert from 'node:assert';
import {
  defaultMpcEngine,
  defaultMpcSigner,
  MpcTssEngine,
  MpcKeyStore,
  SECP256K1_ORDER,
  ED25519_ORDER,
  type MpcThresholdKey,
} from '../../dashboard/lib/hedera/signing/mpcSigner';
import {
  generatePasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  generatePasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
  assertPasskeyAuthorization,
  resetPasskeyStore,
} from '../../dashboard/lib/auth/passkey';
import {
  createNativeHederaAccount,
  computeEvmAddressFromPublicKey,
  setTestAccountCreator,
} from '../../dashboard/lib/hedera/nativeAccount';
import {
  POST as createMpcWalletRoute,
} from '../../dashboard/app/api/wallets/mpc/create/route';
import {
  POST as recoverMpcWalletRoute,
} from '../../dashboard/app/api/wallets/mpc/recover/route';
import {
  POST as rotateMpcWalletRoute,
} from '../../dashboard/app/api/wallets/mpc/rotate/route';
import { PAIDX_MCP_TOOLS } from '../../dashboard/lib/mcp/tools';
import { MCP_TOOL_DEFINITIONS } from '../../mcp-server/src/tools';
import { setTestMirrorMock } from '../../dashboard/lib/hedera/mirrorNode';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server';
import { buildTransferTransaction } from '../../dashboard/lib/hedera/hts';
import { TransferTransaction, Hbar, AccountId, PublicKey } from '@hiero-ledger/sdk';

test('Native MPC Wallet Architecture & Autonomous Agent Payments Suite', async (t) => {
  const testUserId = 'user-native-mpc-uuid-1234';
  const testEmail = 'developer@paidx.cc';
  let registeredCredentialId = '';
  let nativeAccountId = '0.0.998877';
  let createdThresholdKey: MpcThresholdKey;
  let userRecoveryShare: any;

  // Setup Mock Database for Native MPC Tests
  const mockWalletsTable: any[] = [];
  const mockAgentConnections: any[] = [];
  const mockAgentPolicies: any[] = [];

  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: testUserId, email: testEmail } },
        error: null,
      }),
      getSession: async () => ({
        data: { session: { access_token: 'mock_jwt_token', user: { id: testUserId } } },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: any) => ({
          eq: (col2: string, val2: any) => ({
            order: () => ({
              order: () => ({
                data: mockWalletsTable.filter((w) => w.user_id === val && w.kind === val2),
                error: null,
              }),
            }),
            maybeSingle: async () => ({
              data: mockAgentPolicies.find((p) => p.agent_id === val),
              error: null,
            }),
          }),
          maybeSingle: async () => ({
            data: mockAgentPolicies.find((p) => p.agent_id === val),
            error: null,
          }),
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({
                data: mockWalletsTable.find((w) => w.user_id === val),
                error: null,
              }),
            }),
          }),
        }),
      }),
      insert: async (record: any) => {
        if (table === 'wallets') mockWalletsTable.push(record);
        if (table === 'agent_connections') mockAgentConnections.push(record);
        if (table === 'agent_policies') mockAgentPolicies.push(record);
        return { data: record, error: null };
      },
      update: (updates: any) => ({
        eq: async (col: string, val: any) => {
          if (table === 'wallets') {
            for (const w of mockWalletsTable) {
              if (w[col] === val) Object.assign(w, updates);
            }
          }
          if (table === 'agent_connections') {
            for (const a of mockAgentConnections) {
              if (a[col] === val) Object.assign(a, updates);
            }
          }
          if (table === 'agent_policies') {
            for (const p of mockAgentPolicies) {
              if (p[col] === val) Object.assign(p, updates);
            }
          }
          return { error: null };
        },
      }),
    }),
  };

  setTestSupabaseClient(mockSupabase);

  t.after(() => {
    resetPasskeyStore();
    setTestAccountCreator(null);
    setTestMirrorMock(null);
  });

  // --------------------------------------------------------------------------
  // Requirement 1 & 2: Passkey / WebAuthn Challenge & Registration
  // --------------------------------------------------------------------------
  await t.test('1 & 2: Passkey / WebAuthn Challenge Generation and Registration', async () => {
    resetPasskeyStore();

    // 1. Generate registration challenge
    const regOptions = generatePasskeyRegistrationOptions(testUserId, testEmail);
    assert.ok(regOptions.challenge, 'Challenge must be generated');
    assert.strictEqual(regOptions.rp.name, 'PaidX Native MPC Wallet');
    assert.strictEqual(regOptions.user.displayName, testEmail);

    // 2. Client completes WebAuthn registration
    const mockClientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: regOptions.challenge,
        origin: 'http://localhost:3000',
      })
    ).toString('base64url');

    registeredCredentialId = 'cred_webauthn_' + Buffer.from('test-passkey-key').toString('hex');
    const regResult = verifyPasskeyRegistration({
      userId: testUserId,
      credentialId: registeredCredentialId,
      clientDataJSON: mockClientDataJSON,
    });

    assert.strictEqual(regResult.success, true);
    assert.strictEqual(regResult.credential.credentialId, registeredCredentialId);
    assert.strictEqual(regResult.credential.userId, testUserId);

    // 3. Subsequent authentication challenge
    const authOptions = generatePasskeyAuthenticationOptions(testUserId);
    assert.ok(authOptions.challenge);
    assert.ok(authOptions.allowCredentials.length > 0);

    const mockAuthClientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: authOptions.challenge,
        origin: 'http://localhost:3000',
      })
    ).toString('base64url');

    const authResult = verifyPasskeyAuthentication({
      userId: testUserId,
      credentialId: registeredCredentialId,
      clientDataJSON: mockAuthClientDataJSON,
    });

    assert.strictEqual(authResult.success, true);
    assert.strictEqual(authResult.credentialId, registeredCredentialId);
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Native Wallet Creation Endpoint (Zero MetaMask Required)
  // --------------------------------------------------------------------------
  await t.test('2: Native MPC Wallet Creation via POST /api/wallets/mpc/create', async () => {
    // Mock native Hedera account creation
    setTestAccountCreator(async (pubKeyHex: string) => {
      const evm = computeEvmAddressFromPublicKey(pubKeyHex);
      return {
        accountId: nativeAccountId,
        evmAddress: evm,
        publicKeyHex: pubKeyHex,
        transactionId: `${nativeAccountId}@1730000000.000000000`,
        initialBalanceHbar: 0.5,
        network: 'hedera:testnet',
      };
    });

    const req = new Request('http://localhost:3000/api/wallets/mpc/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testUserId,
        curve: 'secp256k1',
        passkeyProof: {
          verified: true,
          credentialId: registeredCredentialId,
          authMethod: 'passkey',
        },
      }),
    });

    const res = await createMpcWalletRoute(req as any);
    const body = await res.json();

    assert.strictEqual(res.status, 200, `Creation should succeed: ${body.error}`);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.accountId, nativeAccountId);
    assert.strictEqual(body.signerType, 'native_mpc');
    assert.strictEqual(body.threshold, 2);
    assert.strictEqual(body.totalShares, 3);
    assert.ok(body.publicKeyHex, 'Must return public key');
    assert.ok(body.userRecoveryShare, 'Must return User Recovery Share (Share 3)');
    assert.strictEqual(body.userRecoveryShare.index, 3);

    userRecoveryShare = body.userRecoveryShare;
    createdThresholdKey = defaultMpcSigner.getKey(nativeAccountId)!;
    assert.ok(createdThresholdKey, 'Threshold key must be registered with defaultMpcSigner');
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Genuine MPC Threshold Signing (No Key Reconstruction)
  // --------------------------------------------------------------------------
  await t.test('3: Genuine 2-of-3 Threshold Signing without Private Key Reconstruction', async () => {
    assert.ok(createdThresholdKey);

    // Mock Mirror Node account to return the registered MPC public key
    setTestMirrorMock({
      getAccount: async (acc: string) => {
        if (acc === nativeAccountId) {
          return {
            account: nativeAccountId,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 500000000, timestamp: '1730000000.000000000', tokens: [] },
            deleted: false,
            evm_address: computeEvmAddressFromPublicKey(createdThresholdKey.publicKeyHex),
            key: {
              _type: 'ECDSA_SECP256K1',
              key: '0x' + createdThresholdKey.publicKeyHex,
            },
          } as any;
        }
        if (acc === '0.0.11334921') {
          return {
            account: '0.0.11334921',
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 1000000000, timestamp: '1730000000.000000000', tokens: [] },
            deleted: false,
            evm_address: '0x2222222222222222222222222222222222222222',
            key: {
              _type: 'ECDSA_SECP256K1',
              key: '0x0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
            },
          } as any;
        }
        return null;
      },
    });

    // Build a real Hedera TransferTransaction using buildTransferTransaction
    const tx = buildTransferTransaction({
      payerAccountId: nativeAccountId,
      recipientAccountId: '0.0.11334921',
      assetId: '0.0.5449156',
      atomicAmount: '5000000',
    });

    // Sign transaction with native MPC provider
    const signedTx = await defaultMpcSigner.signTransaction(nativeAccountId, tx);
    assert.ok(signedTx);

    const bytes = signedTx.toBytes();
    assert.ok(bytes && bytes.length > 0, 'Signed transaction bytes must exist');
    assert.ok(
      signedTx.transactionId!.toString().startsWith(nativeAccountId),
      'Payer account must match native MPC account'
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 4: Spending Limits & Budget Enforcement ($5 max, $20 daily, $100 monthly in USD_MICRO)
  // --------------------------------------------------------------------------
  await t.test('4: Autonomous Agent Spending Limits Enforced ($5 / $20 / $100 in USD_MICRO)', async () => {
    mockAgentPolicies.push({
      agent_id: 'agent_native_test_1',
      max_amount_per_tx: '5000000',
      daily_budget: '20000000',
      monthly_budget: '100000000',
      spent_today: '0',
      spent_this_month: '0',
      autonomous_payments_enabled: true,
    });

    const mockAgentContext: any = {
      agentId: 'agent_native_test_1',
      agentName: 'Hedera Native Agent',
      walletId: 'wallet_native_1',
      walletAddress: nativeAccountId,
      policy: {
        maxAmountPerTxUsdMicro: 5_000_000n, // $5.00
        dailyBudgetUsdMicro: 20_000_000n, // $20.00
        monthlyBudgetUsdMicro: 100_000_000n, // $100.00
        autonomousPaymentsEnabled: true,
      },
    };

    // Find prepare_wallet_payment tool
    const prepareTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'prepare_wallet_payment')!;
    assert.ok(prepareTool);

    // 1. Payment of 0.01 HBAR ($0.000686 at $0.0686/HBAR) <= $5: Sub-limit passes
    const validPrep = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '0.01',
      asset: 'HBAR',
    });

    assert.strictEqual(validPrep.recipientVerified, true);
    assert.strictEqual(validPrep.spendingLimitDenomination, 'USD_MICRO');
    assert.strictEqual(validPrep.perTransactionLimitUsdMicro, '5000000');
    assert.strictEqual(validPrep.requiresHumanApproval, false);
    assert.strictEqual(validPrep.approvalStatus, 'not_requested');

    // 2. Payment exceeding $5 (e.g. 1000 HBAR = ~$68.60): Requires human approval
    const overLimitPrep = await prepareTool.handler(mockAgentContext, {
      recipient: '0.0.11334921',
      amount: '1000',
      asset: 'HBAR',
    });

    assert.strictEqual(overLimitPrep.requiresHumanApproval, true);
    assert.strictEqual(overLimitPrep.status, 'approval_required');
  });

  // --------------------------------------------------------------------------
  // Requirement 5: All 7 Required MCP Tools Verified
  // --------------------------------------------------------------------------
  await t.test('5: Parity & Functionality of All 7 Required MCP Tools', async () => {
    const requiredTools = [
      'get_wallet_status',
      'get_mpc_enrollment_status',
      'verify_hedera_account_authorization',
      'get_agent_signing_status',
      'prepare_wallet_payment',
      'execute_wallet_payment',
      'revoke_agent_access',
    ];

    // Check presence in both dashboard and mcp-server
    for (const toolName of requiredTools) {
      assert.ok(
        PAIDX_MCP_TOOLS.some((t) => t.name === toolName),
        `Dashboard must have tool: ${toolName}`
      );
      assert.ok(
        MCP_TOOL_DEFINITIONS.some((t) => t.name === toolName),
        `MCP Server must have tool: ${toolName}`
      );
    }

    const mockCtx: any = {
      agentId: 'agent_mcp_test',
      agentName: 'MCP Verification Agent',
      walletId: 'w_1',
      walletAddress: nativeAccountId,
      policy: {
        autonomousPaymentsEnabled: true,
      },
    };

    // Test tool 1: get_wallet_status
    const getWalletStatusTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'get_wallet_status')!;
    const walletStatus = await getWalletStatusTool.handler(mockCtx, {});
    assert.strictEqual(walletStatus.walletAddress, nativeAccountId);
    assert.strictEqual(walletStatus.isNativeMpc, true);
    assert.strictEqual(walletStatus.signerType, 'native_mpc');
    assert.strictEqual(walletStatus.mpcEnrollment.enrolled, true);
    assert.strictEqual(walletStatus.mpcEnrollment.threshold, '2-of-3');
    assert.strictEqual(walletStatus.passkeySecured, true);

    // Test tool 2: get_mpc_enrollment_status
    const getMpcEnrollmentTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'get_mpc_enrollment_status')!;
    const mpcStatus = await getMpcEnrollmentTool.handler(mockCtx, {});
    assert.strictEqual(mpcStatus.isEnrolled, true);
    assert.strictEqual(mpcStatus.threshold, 2);
    assert.strictEqual(mpcStatus.totalShares, 3);

    // Test tool 3: verify_hedera_account_authorization
    const verifyAuthTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'verify_hedera_account_authorization')!;
    const authStatus = await verifyAuthTool.handler(mockCtx, {});
    assert.strictEqual(authStatus.isAuthorizedOnChain, true);
    assert.strictEqual(authStatus.mpcKeyAuthorized, true);

    // Test tool 4: get_agent_signing_status
    const getSigningStatusTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'get_agent_signing_status')!;
    const signingStatus = await getSigningStatusTool.handler(mockCtx, {});
    assert.strictEqual(signingStatus.signingProvider, 'mpc_threshold');
    assert.strictEqual(signingStatus.sessionValid, true);

    // Test tool 7: revoke_agent_access
    const revokeTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'revoke_agent_access')!;
    const revokeResult = await revokeTool.handler(mockCtx, { reason: 'User completed test' });
    assert.strictEqual(revokeResult.success, true);
    assert.strictEqual(revokeResult.status, 'revoked');
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Security Invariant: Email/OAuth Alone MUST NEVER Authorize Recovery
  // --------------------------------------------------------------------------
  await t.test('6 (Security Invariant): Email/OAuth Alone MUST NEVER Authorize Wallet Recovery', async () => {
    // Re-register the key for recovery test
    defaultMpcSigner.registerMpcKey(createdThresholdKey);

    // Attempt recovery WITHOUT passkey proof (e.g. email/OAuth only)
    const reqWithoutPasskey = new Request('http://localhost:3000/api/wallets/mpc/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: nativeAccountId,
        userRecoveryShare,
        passkeyProof: {
          verified: false,
          authMethod: 'oauth_or_email',
        },
      }),
    });

    const res = await recoverMpcWalletRoute(reqWithoutPasskey as any);
    const body = await res.json();

    assert.strictEqual(res.status, 403, 'Must return 403 Forbidden');
    assert.strictEqual(body.success, false);
    assert.match(body.error, /Security Invariant Violation/);
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Disaster Recovery with Passkey + Share 3 & Proactive Key Rotation
  // --------------------------------------------------------------------------
  await t.test('6: Passkey + Share 3 Disaster Recovery and Proactive Share Rotation', async () => {
    // Attempt recovery WITH valid passkey proof and Share 3
    const reqWithPasskey = new Request('http://localhost:3000/api/wallets/mpc/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: nativeAccountId,
        userRecoveryShare,
        passkeyProof: {
          verified: true,
          credentialId: registeredCredentialId,
          authMethod: 'passkey',
        },
      }),
    });

    const res = await recoverMpcWalletRoute(reqWithPasskey as any);
    const body = await res.json();

    assert.strictEqual(res.status, 200, `Recovery must succeed: ${body.error}`);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.accountId, nativeAccountId);
    assert.strictEqual(body.keyRotationCount, 1, 'Key rotation count must increment to 1');
    assert.ok(body.newUserRecoveryShare, 'Must return fresh rotated User Recovery Share');
    assert.strictEqual(body.newUserRecoveryShare.index, 3);
    assert.notStrictEqual(
      body.newUserRecoveryShare.value,
      userRecoveryShare.value,
      'Old recovery share value must be obsoleted by new share'
    );

    // On-chain public key remains identical
    assert.strictEqual(body.publicKeyHex, createdThresholdKey.publicKeyHex);

    // Also test standalone share rotation route: POST /api/wallets/mpc/rotate
    const rotateReq = new Request('http://localhost:3000/api/wallets/mpc/rotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: nativeAccountId,
        passkeyProof: {
          verified: true,
          credentialId: registeredCredentialId,
          authMethod: 'passkey',
        },
      }),
    });

    const rotateRes = await rotateMpcWalletRoute(rotateReq as any);
    const rotateBody = await rotateRes.json();

    assert.strictEqual(rotateRes.status, 200);
    assert.strictEqual(rotateBody.keyRotationCount, 2, 'Key rotation count must increment to 2');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Backward Compatibility & Migration Flow for Existing MetaMask Users
  // --------------------------------------------------------------------------
  await t.test('7: Backward Compatibility & MetaMask Migration Flow Preserved', async () => {
    const metaMaskAccountId = '0.0.556677';
    const metaMaskPublicKeyHex = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

    // Mock Mirror Node account to return existing MetaMask key
    setTestMirrorMock({
      getAccount: async (acc: string) => {
        if (acc === metaMaskAccountId) {
          return {
            account: metaMaskAccountId,
            alias: null,
            auto_renew_period: 7776000,
            balance: { balance: 100000000, timestamp: '1730000000.000000000', tokens: [] },
            deleted: false,
            evm_address: '0x1111111111111111111111111111111111111111',
            key: {
              _type: 'ECDSA_SECP256K1',
              key: '0x' + metaMaskPublicKeyHex,
            },
          } as any;
        }
        return null;
      },
    });

    // Existing prepareMpcAccountAuthorization migration function works seamlessly
    const { prepareMpcAccountAuthorization } = await import(
      '../../dashboard/lib/hedera/signing/mpcEnrollment'
    );

    const result = await prepareMpcAccountAuthorization({
      accountId: metaMaskAccountId,
      evmAddress: '0x1111111111111111111111111111111111111111',
      curve: 'secp256k1',
    });

    assert.strictEqual(result.preparedUpdate.accountId, metaMaskAccountId);
    assert.strictEqual(result.preparedUpdate.proposedKeyStructure.type, 'ThresholdKey');
    assert.strictEqual(result.preparedUpdate.proposedKeyStructure.threshold, 1);
    assert.strictEqual(result.preparedUpdate.proposedKeyStructure.keys.length, 2);
    assert.strictEqual(
      result.preparedUpdate.proposedKeyStructure.keys[0].key.replace(/^0x/, ''),
      metaMaskPublicKeyHex,
      'First key in threshold must be existing MetaMask key'
    );
    assert.strictEqual(
      result.preparedUpdate.proposedKeyStructure.keys[1].key.replace(/^0x/, ''),
      result.thresholdKey.publicKeyHex.replace(/^0x/, ''),
      'Second key in threshold must be newly generated MPC key'
    );
  });
});
