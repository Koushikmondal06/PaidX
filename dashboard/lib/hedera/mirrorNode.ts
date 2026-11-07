/**
 * Hedera Mirror Node Client for PaidX
 * Interacts with the public Hedera Mirror Node REST API for testnet verification.
 */

const DEFAULT_MIRROR_NODE_URL = 'https://testnet.mirrornode.hedera.com';

export function getMirrorNodeBaseUrl(): string {
  return (process.env.HEDERA_MIRROR_NODE_URL || DEFAULT_MIRROR_NODE_URL).replace(/\/$/, '');
}

export interface MirrorAccount {
  account: string;
  alias: string | null;
  auto_renew_period: number;
  balance: {
    balance: number;
    timestamp: string;
    tokens: Array<{ token_id: string; balance: number }>;
  };
  deleted: boolean;
  evm_address: string;
  key: {
    _type: string;
    key: string;
  } | null;
}

export interface MirrorAccountBalance {
  balance: number; // in tinybars (1 HBAR = 100,000,000 tinybars)
  tokens: Array<{
    token_id: string;
    balance: number;
  }>;
}

export interface MirrorTokenInfo {
  token_id: string;
  symbol: string;
  name: string;
  decimals: string;
  type: string;
}

export interface MirrorTransaction {
  transaction_id: string;
  consensus_timestamp: string;
  result: string; // "SUCCESS"
  charged_tx_fee: number;
  transfers: Array<{
    account: string;
    amount: number;
  }>;
  token_transfers?: Array<{
    token_id: string;
    account: string;
    amount: number;
  }>;
}

export interface MirrorTopicMessage {
  consensus_timestamp: string;
  topic_id: string;
  message: string; // Base64
  running_hash: string;
  sequence_number: number;
}

// Test mock hook for unit testing
let testMirrorMock: {
  getTransaction?: (txId: string) => Promise<MirrorTransaction | null>;
  getAccount?: (accountId: string) => Promise<MirrorAccount | null>;
  getAccountByEvmAddress?: (evmAddress: string) => Promise<MirrorAccount | null>;
  getBalance?: (accountId: string) => Promise<MirrorAccountBalance | null>;
  getTopicMessages?: (topicId: string) => Promise<MirrorTopicMessage[]>;
  getTopicMessageBySequence?: (topicId: string, sequenceNumber: number) => Promise<MirrorTopicMessage | null>;
} | null = null;

export function setTestMirrorMock(mock: typeof testMirrorMock) {
  testMirrorMock = mock;
}

/**
 * Helper to fetch with configurable timeout (via AbortController) and retry logic.
 */
export async function fetchMirrorWithRetry(
  url: string,
  options: { timeoutMs?: number; retries?: number } = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const retries = options.retries ?? 2;

  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 0 },
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Do not retry 4xx errors (client not found, invalid syntax)
      if (res.status < 500) {
        return res;
      }

      lastError = new Error(`Mirror Node returned HTTP ${res.status}`);
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort = err?.name === 'AbortError';
      lastError = isAbort
        ? new Error(`Mirror Node request timed out after ${timeoutMs}ms`)
        : err;
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 150 * Math.pow(2, attempt)));
    }
  }

  throw lastError;
}

/**
 * Fetch account info including authorized keys from Hedera Mirror Node
 */
export async function getMirrorAccount(accountId: string): Promise<MirrorAccount | null> {
  if (testMirrorMock?.getAccount) {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await testMirrorMock.getAccount(accountId);
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 10));
        }
      }
    }
    console.warn(`[Mirror Node Mock] Failed to fetch account ${accountId}:`, lastErr);
    throw lastErr;
  }

  const baseUrl = getMirrorNodeBaseUrl();
  const url = `${baseUrl}/api/v1/accounts/${encodeURIComponent(accountId.trim())}`;

  try {
    const res = await fetchMirrorWithRetry(url, { timeoutMs: 8000, retries: 2 });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[Mirror Node] Failed to fetch account ${accountId}:`, err);
    throw err;
  }
}

/**
 * Resolve Hedera account info by EVM address (e.g. from MetaMask).
 * Queries Mirror Node /api/v1/accounts/{evmAddress} with fallback to /api/v1/accounts?account.evm_address={evmAddress}.
 */
export async function getMirrorAccountByEvmAddress(evmAddress: string): Promise<MirrorAccount | null> {
  if (testMirrorMock?.getAccountByEvmAddress) {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await testMirrorMock.getAccountByEvmAddress(evmAddress);
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 10));
        }
      }
    }
    console.warn(`[Mirror Node Mock] Failed to fetch account by EVM ${evmAddress}:`, lastErr);
    throw lastErr;
  }
  if (testMirrorMock?.getAccount) {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        return await testMirrorMock.getAccount(evmAddress);
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 10));
        }
      }
    }
    console.warn(`[Mirror Node Mock] Failed to fetch account by EVM ${evmAddress}:`, lastErr);
    throw lastErr;
  }

  const clean = evmAddress.trim().toLowerCase();
  const baseUrl = getMirrorNodeBaseUrl();

  // 1. Direct path lookup: /api/v1/accounts/{evmAddress}
  try {
    const res = await fetchMirrorWithRetry(`${baseUrl}/api/v1/accounts/${encodeURIComponent(clean)}`, {
      timeoutMs: 8000,
      retries: 2,
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.account) return data;
    }
  } catch (err) {
    console.warn(`[Mirror Node] Direct EVM lookup failed for ${clean}:`, err);
  }

  // 2. Query parameter lookup: /api/v1/accounts?account.evm_address={evmAddress}
  try {
    const res = await fetchMirrorWithRetry(
      `${baseUrl}/api/v1/accounts?account.evm_address=${encodeURIComponent(clean)}`,
      { timeoutMs: 8000, retries: 2 }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.accounts) && data.accounts.length > 0) {
        return data.accounts[0];
      }
    }
  } catch (err) {
    console.warn(`[Mirror Node] Query EVM lookup failed for ${clean}:`, err);
  }

  return null;
}

/**
 * Fetch account balances and token associations from Hedera Mirror Node
 */
export async function getMirrorAccountBalance(accountId: string): Promise<MirrorAccountBalance | null> {
  if (testMirrorMock?.getBalance) {
    return testMirrorMock.getBalance(accountId);
  }

  const baseUrl = getMirrorNodeBaseUrl();
  const url = `${baseUrl}/api/v1/balances?account.id=${encodeURIComponent(accountId.trim())}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.balances?.[0];
    if (!item) return null;

    return {
      balance: item.balance || 0,
      tokens: item.tokens || [],
    };
  } catch (err) {
    console.warn(`[Mirror Node] Failed to fetch balance for ${accountId}:`, err);
    return null;
  }
}

/**
 * Fetch token metadata from Hedera Mirror Node
 */
export async function getMirrorTokenInfo(tokenId: string): Promise<MirrorTokenInfo | null> {
  const baseUrl = getMirrorNodeBaseUrl();
  const url = `${baseUrl}/api/v1/tokens/${encodeURIComponent(tokenId.trim())}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[Mirror Node] Failed to fetch token info for ${tokenId}:`, err);
    return null;
  }
}

/**
 * Format Hedera Transaction ID for Mirror Node lookup
 * e.g. "0.0.12345@1710000000.123456789" -> "0.0.12345-1710000000-123456789"
 */
export function normalizeTransactionIdForMirror(txId: string): string {
  return txId.trim().replace('@', '-').replace(/\.([0-9]{9})$/, '-$1');
}

/**
 * Verify a transaction on Hedera Mirror Node
 */
export async function getMirrorTransaction(transactionId: string): Promise<MirrorTransaction | null> {
  if (testMirrorMock?.getTransaction) {
    return testMirrorMock.getTransaction(transactionId);
  }

  const baseUrl = getMirrorNodeBaseUrl();
  const normalizedId = normalizeTransactionIdForMirror(transactionId);
  const url = `${baseUrl}/api/v1/transactions/${encodeURIComponent(normalizedId)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.transactions?.[0] || null;
  } catch (err) {
    console.warn(`[Mirror Node] Failed to fetch tx ${transactionId}:`, err);
    return null;
  }
}

/**
 * Polls Hedera Mirror Node until transaction consensus is confirmed
 */
export async function pollTransactionConsensus(
  transactionId: string,
  maxAttempts: number = 5,
  intervalMs: number = 1500
): Promise<MirrorTransaction | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const tx = await getMirrorTransaction(transactionId);
    if (tx && tx.result) {
      return tx;
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return null;
}

/**
 * Fetch messages submitted to an HCS topic
 */
export async function getMirrorTopicMessages(
  topicId: string,
  limit: number = 10
): Promise<MirrorTopicMessage[]> {
  if (testMirrorMock?.getTopicMessages) {
    return testMirrorMock.getTopicMessages(topicId);
  }

  const baseUrl = getMirrorNodeBaseUrl();
  const url = `${baseUrl}/api/v1/topics/${encodeURIComponent(topicId.trim())}/messages?order=desc&limit=${limit}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    console.warn(`[Mirror Node] Failed to fetch HCS messages for ${topicId}:`, err);
    return [];
  }
}

/**
 * Fetch specific HCS message by sequence number
 */
export async function getMirrorTopicMessageBySequence(
  topicId: string,
  sequenceNumber: number
): Promise<MirrorTopicMessage | null> {
  if (testMirrorMock?.getTopicMessageBySequence) {
    return testMirrorMock.getTopicMessageBySequence(topicId, sequenceNumber);
  }

  const baseUrl = getMirrorNodeBaseUrl();
  const url = `${baseUrl}/api/v1/topics/${encodeURIComponent(topicId.trim())}/messages/${sequenceNumber}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 0 } });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

/**
 * Generate a HashScan URL for a transaction ID
 */
export function getHashScanTxUrl(transactionId: string, network: string = 'testnet'): string {
  if (!transactionId) return '#';
  const cleanId = transactionId.trim();
  return `https://hashscan.io/${network}/transaction/${encodeURIComponent(cleanId)}`;
}

/**
 * Generate a HashScan URL for an account ID
 */
export function getHashScanAccountUrl(accountId: string, network: string = 'testnet'): string {
  if (!accountId) return '#';
  return `https://hashscan.io/${network}/account/${encodeURIComponent(accountId.trim())}`;
}

/**
 * Generate a HashScan URL for an HCS topic ID
 */
export function getHashScanTopicUrl(topicId: string, network: string = 'testnet'): string {
  if (!topicId) return '#';
  return `https://hashscan.io/${network}/topic/${encodeURIComponent(topicId.trim())}`;
}
