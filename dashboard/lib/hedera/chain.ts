/**
 * Hedera Testnet EVM Configuration, Network Switching, and RPC Diagnostics for MetaMask & Web3 Wallets
 */

export const HEDERA_TESTNET_CHAIN_ID = 296;
export const HEDERA_TESTNET_CHAIN_ID_HEX = '0x128'; // 296 in lowercase hexadecimal

export const HEDERA_MAINNET_CHAIN_ID = 295;
export const HEDERA_MAINNET_CHAIN_ID_HEX = '0x127'; // 295 in lowercase hexadecimal

export const HEDERA_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_HEDERA_RPC_URL || 'https://testnet.hashio.io/api';

export const HEDERA_TESTNET_EXPLORER_URL = 'https://hashscan.io/testnet';

/**
 * Canonical EIP-3085 parameters for adding Hedera Testnet to MetaMask.
 * Enforces:
 *   - Chain ID: 296 (0x128)
 *   - Currency: HBAR
 *   - Decimals: 18 (EVM standard for native gas token)
 *   - RPC: https://testnet.hashio.io/api
 *   - Explorer: https://hashscan.io/testnet
 */
export const HEDERA_TESTNET_CHAIN_PARAMS = {
  chainId: HEDERA_TESTNET_CHAIN_ID_HEX,
  chainName: 'Hedera Testnet',
  nativeCurrency: {
    name: 'HBAR',
    symbol: 'HBAR',
    decimals: 18,
  },
  rpcUrls: [HEDERA_TESTNET_RPC_URL],
  blockExplorerUrls: [HEDERA_TESTNET_EXPLORER_URL],
};

/**
 * Specialized error class for MetaMask and EIP-1193 operations with structured error codes and diagnostics.
 * Preserves the original MetaMask error code and message without obscuring them behind generic errors.
 */
export class MetaMaskError extends Error {
  code: number | string;
  originalCode?: number | string;
  originalMessage?: string;
  providerName?: string;
  diagnostic?: any;

  constructor(
    message: string,
    code: number | string = -32603,
    diagnostic?: any,
    options?: { originalCode?: number | string; originalMessage?: string; providerName?: string }
  ) {
    super(message);
    this.name = 'MetaMaskError';
    this.code = code;
    this.originalCode = options?.originalCode ?? code;
    this.originalMessage = options?.originalMessage ?? message;
    this.providerName = options?.providerName;
    this.diagnostic = diagnostic;
  }
}

/**
 * Resolves the genuine MetaMask provider, cleanly filtering out conflicting
 * browser extensions such as Brave Wallet in multi-provider environments.
 */
export function getMetaMaskEthereumProvider(customEthereum?: any): any {
  const eth = customEthereum || (typeof window !== 'undefined' ? (window as any).ethereum : null);
  if (!eth) return null;

  // Handle multiple wallet providers (e.g. Brave Wallet + MetaMask installed together)
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    // 1. Look strictly for genuine MetaMask (not Brave Wallet spoofing isMetaMask)
    const genuineMetaMask = eth.providers.find(
      (p: any) => p.isMetaMask && !p.isBraveWallet
    );
    if (genuineMetaMask) return genuineMetaMask;

    // 2. Fallback: any provider declaring isMetaMask
    const anyMetaMask = eth.providers.find((p: any) => p.isMetaMask);
    if (anyMetaMask) return anyMetaMask;

    return eth.providers[0];
  }

  return eth;
}

/**
 * Parses chain ID from hex ("0x128", "0x0128") or decimal string/number ("296", 296).
 * Strictly prevents radix errors between hexadecimal and base-10 representations.
 */
export function parseChainId(chainIdHexOrDec: string | number | null | undefined): number {
  if (chainIdHexOrDec === null || chainIdHexOrDec === undefined) return 0;
  if (typeof chainIdHexOrDec === 'number') return chainIdHexOrDec;
  const str = String(chainIdHexOrDec).trim();
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return parseInt(str, 16);
  }
  return parseInt(str, 10);
}

/**
 * Validates whether an address string is an EVM hex address (0x...).
 * Strictly distinguishes EVM addresses (40 hex chars) from native Hedera Account IDs (0.0.x).
 */
export function isEvmAddress(address?: string | null): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

/**
 * Validates whether an address string is a native Hedera Account ID (0.0.xxxxx).
 * Strictly distinguishes native Account IDs from EVM addresses (0x...).
 */
export function isHederaAccountId(address?: string | null): boolean {
  if (!address || typeof address !== 'string') return false;
  return /^0\.0\.[1-9][0-9]*$/.test(address.trim());
}

export interface RpcTestResult {
  success: boolean;
  rpcUrl: string;
  chainId?: number;
  chainIdHex?: string;
  blockNumber?: number;
  balanceWei?: string;
  latencyMs?: number;
  error?: string;
  code?: number | string;
  checks: {
    eth_chainId: boolean;
    eth_blockNumber: boolean;
    eth_getBalance: boolean;
  };
}

/**
 * Tests JSON-RPC connectivity to the Hedera Testnet RPC endpoint.
 * Executes:
 *   1. eth_chainId - verifies chain ID equals 296 (0x128)
 *   2. eth_blockNumber - verifies blocks are progressing on-chain (> 0)
 *   3. eth_getBalance - verifies state balance queries succeed
 *
 * Implements configurable timeout handling (via AbortController) and retry logic with exponential backoff.
 */
export async function testHederaRpcConnectivity(
  rpcUrl: string = HEDERA_TESTNET_RPC_URL,
  options: {
    timeoutMs?: number;
    retries?: number;
    testAddress?: string;
  } = {}
): Promise<RpcTestResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const retries = options.retries ?? 2;
  const testAddress = options.testAddress || '0x0000000000000000000000000000000000000000';

  const checks = {
    eth_chainId: false,
    eth_blockNumber: false,
    eth_getBalance: false,
  };

  const startTime = Date.now();

  async function postJsonRpcWithRetry(method: string, params: any[]): Promise<any> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method,
            params,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok) {
          throw new Error(`RPC server returned HTTP status ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        if (data.error) {
          throw new Error(data.error.message || JSON.stringify(data.error));
        }

        return data.result;
      } catch (err: unknown) {
        clearTimeout(timer);
        const isAbort = err instanceof Error && err.name === 'AbortError';
        lastError = isAbort
          ? new Error(`RPC request for ${method} timed out after ${timeoutMs}ms`)
          : err instanceof Error
          ? err
          : new Error(String(err));

        if (attempt < retries) {
          // Exponential backoff delay: 150ms, 300ms...
          await new Promise((r) => setTimeout(r, 150 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError;
  }

  try {
    // 1. Verify eth_chainId
    const chainIdHex = await postJsonRpcWithRetry('eth_chainId', []);
    if (typeof chainIdHex !== 'string' || !chainIdHex.startsWith('0x')) {
      throw new Error(`Invalid eth_chainId response format from RPC: ${JSON.stringify(chainIdHex)}`);
    }
    const numericChainId = parseInt(chainIdHex, 16);
    if (numericChainId !== HEDERA_TESTNET_CHAIN_ID) {
      throw new Error(
        `RPC returned chain ID ${numericChainId} (${chainIdHex}), but expected Hedera Testnet ${HEDERA_TESTNET_CHAIN_ID} (${HEDERA_TESTNET_CHAIN_ID_HEX}).`
      );
    }
    checks.eth_chainId = true;

    // 2. Verify eth_blockNumber
    const blockNumberHex = await postJsonRpcWithRetry('eth_blockNumber', []);
    if (typeof blockNumberHex !== 'string' || !blockNumberHex.startsWith('0x')) {
      throw new Error(`Invalid eth_blockNumber response format from RPC: ${JSON.stringify(blockNumberHex)}`);
    }
    const blockNumber = parseInt(blockNumberHex, 16);
    if (isNaN(blockNumber) || blockNumber <= 0) {
      throw new Error(`Invalid block number received from RPC: ${blockNumberHex}`);
    }
    checks.eth_blockNumber = true;

    // 3. Verify eth_getBalance
    const balanceHex = await postJsonRpcWithRetry('eth_getBalance', [testAddress, 'latest']);
    if (typeof balanceHex !== 'string' || !balanceHex.startsWith('0x')) {
      throw new Error(`Invalid eth_getBalance response format from RPC: ${JSON.stringify(balanceHex)}`);
    }
    checks.eth_getBalance = true;

    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      rpcUrl,
      chainId: numericChainId,
      chainIdHex,
      blockNumber,
      balanceWei: balanceHex,
      latencyMs,
      checks,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      rpcUrl,
      latencyMs,
      error: msg,
      code: -32603,
      checks,
    };
  }
}

/**
 * Ensures MetaMask / injected web3 provider is connected to Hedera Testnet (Chain ID 296 / 0x128).
 *
 * Handling:
 * - If already on Chain 296, returns immediately without issuing redundant prompts.
 * - Prompts `wallet_switchEthereumChain`.
 * - If error 4902 (chain not added) or wrapped error -32603, prompts `wallet_addEthereumChain` with official params.
 * - If error 4001 (user rejected), halts and throws a friendly cancellation error without altering network state.
 * - If error -32603 or connection issue occurs, runs `testHederaRpcConnectivity` to diagnose network status and
 *   returns an actionable message to guide the user.
 * - Never silently switches networks without user consent.
 */
export async function ensureHederaTestnetNetwork(ethereum?: any): Promise<{
  switched: boolean;
  alreadyOnChain: boolean;
  chainId: number;
}> {
  const provider = getMetaMaskEthereumProvider(ethereum);
  if (!provider || !provider.request) {
    console.warn('[MetaMask Diagnostic] Provider detected: None (window.ethereum unavailable)');
    throw new MetaMaskError(
      'MetaMask extension is not detected in your browser. Please install MetaMask to use 1-click EVM wallet linking.',
      -32603,
      undefined,
      { providerName: 'none' }
    );
  }

  // Diagnostic: Identify active provider
  const providerName =
    provider.isMetaMask && !provider.isBraveWallet
      ? 'MetaMask'
      : provider.isBraveWallet
      ? 'BraveWallet'
      : provider.isMetaMask
      ? 'MetaMask'
      : 'EIP-1193 Provider';

  console.info(`[MetaMask Diagnostic] Provider detected: ${providerName}`);

  // 1. Detect current chain
  let currentChainHex: string;
  try {
    currentChainHex = await provider.request({ method: 'eth_chainId' });
  } catch (err: any) {
    const origCode = err?.code ?? -32603;
    const origMsg = err?.message || String(err);
    console.error('[MetaMask Diagnostic] Failed to query chain ID:', { code: origCode, message: origMsg });
    throw new MetaMaskError(
      `Failed to query current chain ID from MetaMask: ${origMsg}`,
      origCode,
      undefined,
      { originalCode: origCode, originalMessage: origMsg, providerName }
    );
  }

  const currentChainId = parseChainId(currentChainHex);
  console.info(`[MetaMask Diagnostic] Current chain ID: ${currentChainHex} (parsed: ${currentChainId})`);
  console.info('[MetaMask Diagnostic] Wallet connection status: Connected');

  if (
    currentChainId === HEDERA_TESTNET_CHAIN_ID ||
    currentChainHex?.toLowerCase() === HEDERA_TESTNET_CHAIN_ID_HEX.toLowerCase()
  ) {
    return { switched: false, alreadyOnChain: true, chainId: HEDERA_TESTNET_CHAIN_ID };
  }

  // 2. Request user consent to switch to Hedera Testnet
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HEDERA_TESTNET_CHAIN_PARAMS.chainId }],
    });
    console.info('[MetaMask Diagnostic] Switched to Hedera Testnet successfully.');
    return { switched: true, alreadyOnChain: false, chainId: HEDERA_TESTNET_CHAIN_ID };
  } catch (switchErr: any) {
    const origSwitchCode = switchErr?.code ?? -32603;
    const origSwitchMsg = switchErr?.message || String(switchErr);

    console.error('[MetaMask Diagnostic] Original MetaMask error on switch:', {
      code: origSwitchCode,
      message: origSwitchMsg,
      provider: providerName,
    });

    // Error Code 4001: User explicitly rejected the network switch prompt in MetaMask
    if (
      switchErr?.code === 4001 ||
      switchErr?.message?.toLowerCase().includes('user rejected') ||
      switchErr?.message?.toLowerCase().includes('user denied')
    ) {
      throw new MetaMaskError(
        `MetaMask error [Code 4001]: ${origSwitchMsg} (Switch to Hedera Testnet was rejected in MetaMask)`,
        4001,
        undefined,
        { originalCode: 4001, originalMessage: origSwitchMsg, providerName }
      );
    }

    // Error Code 4902: Unrecognized chain ID in MetaMask (must add chain first)
    // Also covers browsers that wrap 4902 inside error -32603
    const isChainNotAdded =
      switchErr?.code === 4902 ||
      switchErr?.data?.originalError?.code === 4902 ||
      switchErr?.error?.code === 4902 ||
      switchErr?.message?.includes('4902') ||
      switchErr?.message?.toLowerCase().includes('unrecognized chain') ||
      switchErr?.message?.toLowerCase().includes('wallet_addethereumchain') ||
      (switchErr?.code === -32603 &&
        (switchErr?.message?.includes('0x128') ||
          switchErr?.message?.toLowerCase().includes('unrecognized') ||
          switchErr?.message?.toLowerCase().includes('not been added') ||
          switchErr?.message?.toLowerCase().includes('chain not added') ||
          switchErr?.message?.toLowerCase().includes('try adding the chain')));

    if (isChainNotAdded) {
      try {
        console.info('[MetaMask Diagnostic] Requesting wallet_addEthereumChain for Hedera Testnet...');
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [HEDERA_TESTNET_CHAIN_PARAMS],
        });
        console.info('[MetaMask Diagnostic] Hedera Testnet added and switched successfully.');
        return { switched: true, alreadyOnChain: false, chainId: HEDERA_TESTNET_CHAIN_ID };
      } catch (addErr: any) {
        const origAddCode = addErr?.code ?? -32603;
        const origAddMsg = addErr?.message || String(addErr);

        console.error('[MetaMask Diagnostic] Original MetaMask error on add:', {
          code: origAddCode,
          message: origAddMsg,
          provider: providerName,
        });

        // Error Code 4001: User rejected adding the network
        if (
          addErr?.code === 4001 ||
          addErr?.message?.toLowerCase().includes('user rejected') ||
          addErr?.message?.toLowerCase().includes('user denied')
        ) {
          throw new MetaMaskError(
            `MetaMask error [Code 4001]: ${origAddMsg} (Hedera Testnet addition request was rejected in MetaMask)`,
            4001,
            undefined,
            { originalCode: 4001, originalMessage: origAddMsg, providerName }
          );
        }

        // Test RPC connectivity to provide truthful diagnostic without masking original error
        const diag = await testHederaRpcConnectivity(HEDERA_TESTNET_RPC_URL);
        if (!diag.success) {
          console.warn('[MetaMask Diagnostic] RPC request failure:', {
            error: diag.error,
            checks: diag.checks,
          });
        }

        // Always display original MetaMask error code and message
        const failureDetails = diag.success
          ? `(Hashio RPC endpoint ${HEDERA_TESTNET_RPC_URL} is online and verified)`
          : `(Hashio RPC diagnostic: ${diag.error})`;

        throw new MetaMaskError(
          `MetaMask failed to add Hedera Testnet [Code ${origAddCode}]: ${origAddMsg}. ${failureDetails}`,
          origAddCode,
          diag,
          { originalCode: origAddCode, originalMessage: origAddMsg, providerName }
        );
      }
    }

    // Other switch errors: test RPC connectivity and display original MetaMask error code & message
    const diag = await testHederaRpcConnectivity(HEDERA_TESTNET_RPC_URL);
    if (!diag.success) {
      console.warn('[MetaMask Diagnostic] RPC request failure:', {
        error: diag.error,
        checks: diag.checks,
      });
    }

    const failureDetails = diag.success
      ? `(Hashio RPC endpoint ${HEDERA_TESTNET_RPC_URL} is online and verified)`
      : `(Hashio RPC diagnostic: ${diag.error})`;

    throw new MetaMaskError(
      `MetaMask error [Code ${origSwitchCode}]: ${origSwitchMsg}. ${failureDetails}`,
      origSwitchCode,
      diag,
      { originalCode: origSwitchCode, originalMessage: origSwitchMsg, providerName }
    );
  }
}
