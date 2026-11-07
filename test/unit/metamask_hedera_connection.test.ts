import test from 'node:test';
import assert from 'node:assert';
import {
  HEDERA_TESTNET_CHAIN_ID,
  HEDERA_TESTNET_CHAIN_ID_HEX,
  HEDERA_TESTNET_RPC_URL,
  HEDERA_TESTNET_EXPLORER_URL,
  HEDERA_TESTNET_CHAIN_PARAMS,
  MetaMaskError,
  testHederaRpcConnectivity,
  ensureHederaTestnetNetwork,
  isEvmAddress,
  isHederaAccountId,
} from '../../dashboard/lib/hedera/chain.ts';
import {
  getMirrorAccount,
  getMirrorAccountByEvmAddress,
  setTestMirrorMock,
  fetchMirrorWithRetry,
} from '../../dashboard/lib/hedera/mirrorNode.ts';
import { resolveAndVerifyRecipientAccount } from '../../dashboard/lib/hedera/recipientResolution.ts';

test('PaidX MetaMask Hedera Testnet Connection & Network Integration Suite', async (t) => {
  t.afterEach(() => {
    setTestMirrorMock(null);
  });

  // --------------------------------------------------------------------------
  // Requirement 1 & 2: Canonical Network Configurations
  // --------------------------------------------------------------------------
  await t.test('1 & 2: Canonical Hedera Testnet Configuration for MetaMask', () => {
    assert.strictEqual(HEDERA_TESTNET_CHAIN_ID, 296, 'Chain ID must be 296');
    assert.strictEqual(HEDERA_TESTNET_CHAIN_ID_HEX, '0x128', 'Chain ID hex must be 0x128');
    assert.strictEqual(
      HEDERA_TESTNET_RPC_URL,
      'https://testnet.hashio.io/api',
      'RPC URL must be https://testnet.hashio.io/api'
    );
    assert.strictEqual(
      HEDERA_TESTNET_EXPLORER_URL,
      'https://hashscan.io/testnet',
      'Explorer URL must be https://hashscan.io/testnet'
    );

    // EIP-3085 parameters validation
    assert.strictEqual(HEDERA_TESTNET_CHAIN_PARAMS.chainId, '0x128');
    assert.strictEqual(HEDERA_TESTNET_CHAIN_PARAMS.chainName, 'Hedera Testnet');
    assert.strictEqual(HEDERA_TESTNET_CHAIN_PARAMS.nativeCurrency.name, 'HBAR');
    assert.strictEqual(HEDERA_TESTNET_CHAIN_PARAMS.nativeCurrency.symbol, 'HBAR');
    assert.strictEqual(
      HEDERA_TESTNET_CHAIN_PARAMS.nativeCurrency.decimals,
      18,
      'EVM native currency decimals in MetaMask must be 18'
    );
    assert.deepStrictEqual(HEDERA_TESTNET_CHAIN_PARAMS.rpcUrls, ['https://testnet.hashio.io/api']);
    assert.deepStrictEqual(HEDERA_TESTNET_CHAIN_PARAMS.blockExplorerUrls, ['https://hashscan.io/testnet']);
  });

  // --------------------------------------------------------------------------
  // Requirement 3: RPC Connectivity Testing (eth_chainId, eth_blockNumber, eth_getBalance)
  // --------------------------------------------------------------------------
  await t.test('3: RPC Connectivity Diagnostics via eth_chainId, eth_blockNumber, and eth_getBalance', async () => {
    // Test against live Hashio RPC
    const result = await testHederaRpcConnectivity('https://testnet.hashio.io/api', {
      timeoutMs: 8000,
      retries: 1,
      testAddress: '0x9f5aEA90e65bAb8fbC49385F5076391A6a26eD28',
    });

    if (result.success) {
      assert.strictEqual(result.chainId, 296, 'Chain ID must be 296');
      assert.strictEqual(result.chainIdHex, '0x128', 'Chain ID hex must be 0x128');
      assert.ok(result.blockNumber && result.blockNumber > 0, 'Block number must be positive');
      assert.ok(result.balanceWei && result.balanceWei.startsWith('0x'), 'Balance must be hex wei');
      assert.strictEqual(result.checks.eth_chainId, true);
      assert.strictEqual(result.checks.eth_blockNumber, true);
      assert.strictEqual(result.checks.eth_getBalance, true);
      assert.ok(result.latencyMs && result.latencyMs >= 0, 'Latency must be tracked');
    } else {
      // When external Hashio is temporarily offline/502, verify that diagnostic error is captured gracefully
      assert.ok(
        result.error && (result.error.includes('502') || result.error.includes('fetch') || result.error.includes('timeout')),
        `Expected diagnostic error, got: ${result.error}`
      );
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 3 (Failure Case): Unreachable RPC endpoint diagnosis
  // --------------------------------------------------------------------------
  await t.test('3 (Failure Mode): RPC test fails closed with structured diagnosis on unreachable endpoint', async () => {
    const unreachableResult = await testHederaRpcConnectivity('https://127.0.0.1:59999/unreachable-rpc', {
      timeoutMs: 1000,
      retries: 0,
    });

    assert.strictEqual(unreachableResult.success, false);
    assert.strictEqual(unreachableResult.checks.eth_chainId, false);
    assert.ok(unreachableResult.error, 'Must report actionable error message');
    assert.strictEqual(unreachableResult.code, -32603);
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: wallet_switchEthereumChain already on chain
  // --------------------------------------------------------------------------
  await t.test('4 & 5: When already on Hedera Testnet (0x128), no redundant switch is requested', async () => {
    let switchRequested = false;
    let addRequested = false;

    const mockProvider = {
      request: async ({ method }: { method: string; params?: any[] }) => {
        if (method === 'eth_chainId') return '0x128';
        if (method === 'wallet_switchEthereumChain') {
          switchRequested = true;
          return null;
        }
        if (method === 'wallet_addEthereumChain') {
          addRequested = true;
          return null;
        }
        throw new Error(`Unhandled method: ${method}`);
      },
    };

    const res = await ensureHederaTestnetNetwork(mockProvider);
    assert.strictEqual(res.switched, false);
    assert.strictEqual(res.alreadyOnChain, true);
    assert.strictEqual(res.chainId, 296);
    assert.strictEqual(switchRequested, false, 'No switch request should occur');
    assert.strictEqual(addRequested, false, 'No add request should occur');
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: Switch succeeds directly when chain is already registered
  // --------------------------------------------------------------------------
  await t.test('4 & 5: Successful wallet_switchEthereumChain without needing wallet_addEthereumChain', async () => {
    let currentChain = '0x1'; // Ethereum Mainnet
    let switchedTo = '';

    const mockProvider = {
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        if (method === 'eth_chainId') return currentChain;
        if (method === 'wallet_switchEthereumChain') {
          switchedTo = params?.[0]?.chainId;
          currentChain = switchedTo;
          return null;
        }
        throw new Error(`Unhandled method: ${method}`);
      },
    };

    const res = await ensureHederaTestnetNetwork(mockProvider);
    assert.strictEqual(res.switched, true);
    assert.strictEqual(res.alreadyOnChain, false);
    assert.strictEqual(res.chainId, 296);
    assert.strictEqual(switchedTo, '0x128');
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: Error 4902 triggers wallet_addEthereumChain
  // --------------------------------------------------------------------------
  await t.test('4 & 5: Error 4902 from switch triggers wallet_addEthereumChain with correct params', async () => {
    let currentChain = '0xaa36a7'; // Sepolia
    let addParams: any = null;

    const mockProvider = {
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        if (method === 'eth_chainId') return currentChain;
        if (method === 'wallet_switchEthereumChain') {
          const err: any = new Error('Unrecognized chain ID');
          err.code = 4902;
          throw err;
        }
        if (method === 'wallet_addEthereumChain') {
          addParams = params?.[0];
          currentChain = '0x128';
          return null;
        }
        throw new Error(`Unhandled method: ${method}`);
      },
    };

    const res = await ensureHederaTestnetNetwork(mockProvider);
    assert.strictEqual(res.switched, true);
    assert.strictEqual(res.chainId, 296);
    assert.ok(addParams, 'Must call wallet_addEthereumChain');
    assert.strictEqual(addParams.chainId, '0x128');
    assert.strictEqual(addParams.chainName, 'Hedera Testnet');
    assert.strictEqual(addParams.nativeCurrency.symbol, 'HBAR');
    assert.strictEqual(addParams.nativeCurrency.decimals, 18);
    assert.deepStrictEqual(addParams.rpcUrls, ['https://testnet.hashio.io/api']);
    assert.deepStrictEqual(addParams.blockExplorerUrls, ['https://hashscan.io/testnet']);
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: Error -32603 containing unrecognized chain triggers wallet_addEthereumChain
  // --------------------------------------------------------------------------
  await t.test('4 & 5: Wrapped error -32603 unrecognized chain triggers wallet_addEthereumChain', async () => {
    let addCalled = false;

    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0x1';
        if (method === 'wallet_switchEthereumChain') {
          const err: any = new Error('Unrecognized chain ID "0x128". Try adding the chain using wallet_addEthereumChain first.');
          err.code = -32603;
          throw err;
        }
        if (method === 'wallet_addEthereumChain') {
          addCalled = true;
          return null;
        }
        throw new Error(`Unhandled method: ${method}`);
      },
    };

    const res = await ensureHederaTestnetNetwork(mockProvider);
    assert.strictEqual(res.switched, true);
    assert.strictEqual(addCalled, true);
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: Error 4001 (User rejected switch) handled gracefully
  // --------------------------------------------------------------------------
  await t.test('4 & 5: Error 4001 on wallet_switchEthereumChain throws user-friendly rejection', async () => {
    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0x1';
        if (method === 'wallet_switchEthereumChain') {
          const err: any = new Error('User rejected the request.');
          err.code = 4001;
          throw err;
        }
        throw new Error(`Unhandled method: ${method}`);
      },
    };

    await assert.rejects(
      async () => {
        await ensureHederaTestnetNetwork(mockProvider);
      },
      (err: any) => {
        assert.ok(err instanceof MetaMaskError);
        assert.strictEqual(err.code, 4001);
        assert.ok(err.message.includes('rejected in MetaMask'));
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: Error 4001 on wallet_addEthereumChain handled gracefully
  // --------------------------------------------------------------------------
  await t.test('4 & 5: Error 4001 on wallet_addEthereumChain throws user-friendly rejection', async () => {
    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0x1';
        if (method === 'wallet_switchEthereumChain') {
          const err: any = new Error('Unrecognized chain');
          err.code = 4902;
          throw err;
        }
        if (method === 'wallet_addEthereumChain') {
          const err: any = new Error('User denied network addition.');
          err.code = 4001;
          throw err;
        }
        throw new Error(`Unhandled method: ${method}`);
      },
    };

    await assert.rejects(
      async () => {
        await ensureHederaTestnetNetwork(mockProvider);
      },
      (err: any) => {
        assert.ok(err instanceof MetaMaskError);
        assert.strictEqual(err.code, 4001);
        assert.ok(err.message.includes('addition request was rejected'));
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 4 & 5: Error -32603 on wallet_addEthereumChain runs RPC diagnosis
  // --------------------------------------------------------------------------
  await t.test('4 & 5: Error -32603 on wallet_addEthereumChain runs RPC diagnostics', async () => {
    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0x1';
        if (method === 'wallet_switchEthereumChain') {
          const err: any = new Error('Chain not added');
          err.code = 4902;
          throw err;
        }
        if (method === 'wallet_addEthereumChain') {
          const err: any = new Error('Unable to connect to Hedera Testnet. Check network connectivity.');
          err.code = -32603;
          throw err;
        }
        throw new Error(`Unhandled method: ${method}`);
      },
    };

    await assert.rejects(
      async () => {
        await ensureHederaTestnetNetwork(mockProvider);
      },
      (err: any) => {
        assert.ok(err instanceof MetaMaskError);
        assert.strictEqual(err.code, -32603);
        assert.ok(err.diagnostic, 'Must include diagnostic results');
        assert.ok(err.message.includes('MetaMask failed to add Hedera Testnet'));
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Strictly distinguish Hedera Account IDs from EVM addresses
  // --------------------------------------------------------------------------
  await t.test('6: Strictly distinguish Hedera Account IDs (0.0.xxxxx) from EVM addresses (0x...)', () => {
    const validEvm = '0x9f5aEA90e65bAb8fbC49385F5076391A6a26eD28';
    const validHederaAccount = '0.0.11334921';

    // EVM address checks
    assert.strictEqual(isEvmAddress(validEvm), true, 'Valid EVM address must return true');
    assert.strictEqual(isEvmAddress(validHederaAccount), false, 'Hedera Account ID must NEVER be parsed as EVM');
    assert.strictEqual(isEvmAddress('not-an-address'), false);
    assert.strictEqual(isEvmAddress(null), false);

    // Hedera Account ID checks
    assert.strictEqual(isHederaAccountId(validHederaAccount), true, 'Valid Hedera account ID must return true');
    assert.strictEqual(isHederaAccountId(validEvm), false, 'EVM address must NEVER be parsed as Hedera Account ID');
    assert.strictEqual(isHederaAccountId('0.0.0'), false, 'Account 0.0.0 is not a user account');
    assert.strictEqual(isHederaAccountId('0.0.abc'), false);
    assert.strictEqual(isHederaAccountId(null), false);
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Verify account creation and EVM address mapping on Mirror Node
  // --------------------------------------------------------------------------
  await t.test('7: Authoritative EVM address to Hedera native account resolution via Mirror Node', async () => {
    const evmAddress = '0x9f5aEA90e65bAb8fbC49385F5076391A6a26eD28';
    const resolution = await resolveAndVerifyRecipientAccount({
      recipient: evmAddress,
      network: 'hedera:testnet',
    });

    assert.strictEqual(resolution.valid, true);
    assert.strictEqual(resolution.isEvmAddress, true);
    assert.strictEqual(resolution.recipient, '0.0.11334921', 'Must resolve to 0.0.11334921');
    assert.strictEqual(resolution.recipientVerified, true);
    assert.strictEqual(resolution.recipientVerificationSource, 'hedera_mirror_node');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Deleted accounts fail closed
  // --------------------------------------------------------------------------
  await t.test('7 (Safety): Deleted accounts on Mirror Node fail closed', async () => {
    setTestMirrorMock({
      getAccountByEvmAddress: async () => ({
        account: '0.0.999999',
        alias: null,
        auto_renew_period: 7776000,
        balance: { balance: 0, timestamp: '', tokens: [] },
        deleted: true, // Marked as deleted!
        evm_address: '0x1234567890123456789012345678901234567890',
        key: null,
      }),
    });

    const resolution = await resolveAndVerifyRecipientAccount({
      recipient: '0x1234567890123456789012345678901234567890',
      network: 'hedera:testnet',
    });

    assert.strictEqual(resolution.valid, false);
    assert.strictEqual(resolution.recipientVerified, false);
    assert.ok(resolution.error?.includes('deleted on Hedera network'));
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Timeout handling and retry logic in Mirror Node
  // --------------------------------------------------------------------------
  await t.test('8: Timeout handling and retry logic preserves resilience against transient network drops', async () => {
    let attempts = 0;
    setTestMirrorMock({
      getAccount: async (accId: string) => {
        attempts++;
        if (attempts === 1) {
          // Simulate transient error on first attempt
          throw new Error('Transient network glitch');
        }
        return {
          account: accId,
          alias: null,
          auto_renew_period: 7776000,
          balance: { balance: 500000000, timestamp: '', tokens: [] },
          deleted: false,
          evm_address: '',
          key: null,
        };
      },
    });

    const acc = await getMirrorAccount('0.0.11334921');
    assert.ok(acc);
    assert.strictEqual(acc.account, '0.0.11334921');
    assert.strictEqual(attempts, 2, 'Should have retried after transient failure and succeeded on 2nd attempt');
    setTestMirrorMock(null);

    // Verify fetchMirrorWithRetry retries on 500 status and succeeds
    const origFetch = globalThis.fetch;
    try {
      let httpCalls = 0;
      (globalThis as any).fetch = async () => {
        httpCalls++;
        if (httpCalls === 1) {
          return new Response(JSON.stringify({ error: 'Gateway timeout' }), { status: 504 });
        }
        return new Response(JSON.stringify({ account: '0.0.1234' }), { status: 200 });
      };

      const res = await fetchMirrorWithRetry('https://testnet.mirrornode.hedera.com/api/v1/accounts/0.0.1234', {
        retries: 2,
        timeoutMs: 1000,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(httpCalls, 2, 'fetchMirrorWithRetry successfully retried on 504 status');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Never silently switch networks or bypass user consent
  // --------------------------------------------------------------------------
  await t.test('9: Never silently switch networks without user consent', async () => {
    let consentPromptShown = false;
    const mockProvider = {
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_chainId') return '0x1';
        if (method === 'wallet_switchEthereumChain') {
          consentPromptShown = true;
          // User denies consent
          const err: any = new Error('User rejected the request.');
          err.code = 4001;
          throw err;
        }
        throw new Error(`Unexpected call: ${method}`);
      },
    };

    try {
      await ensureHederaTestnetNetwork(mockProvider);
      assert.fail('Should have thrown on user rejection');
    } catch (err: any) {
      assert.strictEqual(consentPromptShown, true, 'User prompt must be triggered');
      assert.strictEqual(err.code, 4001, 'Rejection must halt execution immediately');
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Never expose private keys or seed phrases
  // --------------------------------------------------------------------------
  await t.test('10: Never leak private keys or seed phrases in error messages or diagnostic payloads', () => {
    const sampleError = new MetaMaskError('Test error message', -32603, {
      rpcUrl: 'https://testnet.hashio.io/api',
      checks: { eth_chainId: true },
    });

    const serialized = JSON.stringify(sampleError);
    assert.strictEqual(serialized.includes('private'), false);
    assert.strictEqual(serialized.includes('secret'), false);
    assert.strictEqual(serialized.includes('seed'), false);
    assert.strictEqual(serialized.includes('mnemonic'), false);
  });
});
