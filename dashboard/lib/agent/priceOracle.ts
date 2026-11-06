import { getMirrorNodeBaseUrl } from '../hedera/mirrorNode';

/**
 * Common USD-Micro Denomination Standard
 * Policy limits and normalized spending are evaluated strictly in USD micro-units ($10^-6 USD).
 * 1 USD = 1,000,000 USD micro-units.
 * USDC has 6 decimals on Hedera (1 USDC = 1,000,000 atomic units = 1 USD).
 * HBAR has 8 decimals on Hedera (1 HBAR = 100,000,000 tinybars).
 */
export const USD_MICRO_DECIMALS = 6;
export const USD_MICRO_MULTIPLIER = 1_000_000n;
export const HBAR_DECIMALS = 8;
export const HBAR_TINYBAR_DIVISOR = 100_000_000n;
export const DEFAULT_MAX_PRICE_AGE_SECONDS = 300; // 5 minutes max allowable price age

export interface PriceQuote {
  assetSymbol: string;
  priceUsd: string;          // Formatted USD decimal string, e.g. "0.068470"
  priceMicroUsd: bigint;     // Ceiling-rounded micro-USD per whole asset token, e.g. 68_470n
  centEquivalent?: bigint;   // Exact Hedera cent numerator from File 0.0.112
  hbarEquivalent?: bigint;   // Exact Hedera hbar denominator from File 0.0.112
  source: string;            // e.g. 'hedera_mirror_node', 'pegged_usd_stablecoin', 'test_oracle'
  timestamp: number;         // Unix epoch in milliseconds
  decimals: number;          // Target denomination decimals (6 for USD-micro)
  expirationTime?: number;   // Optional expiration unix seconds
  consensusTimestamp?: string; // Hedera File 0.0.112 consensus timestamp string
}

export interface NormalizedSpend {
  assetSymbol: string;
  rawAtomicAmount: string;          // Raw asset atomic units (tinybars or micro-USDC)
  normalizedAmountUsdMicro: string; // Integer micro-USD string for policy evaluation
  priceQuote: PriceQuote;
  conversionDecimals: number;       // 6
  conversionPrecision: string;      // 'USD_MICRO_6_DECIMALS'
}

export class PriceOracleError extends Error {
  public code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PriceOracleError';
    this.code = code;
  }
}

// Test mock hook for deterministic testing
let testPriceMock: ((assetSymbol: string) => Promise<PriceQuote | null> | PriceQuote | null) | null = null;

export function setTestPriceOracleMock(
  mock: ((assetSymbol: string) => Promise<PriceQuote | null> | PriceQuote | null) | null
) {
  testPriceMock = mock;
}

export function resetTestPriceOracleMock() {
  testPriceMock = null;
}

/**
 * Computes price in micro-USD from Hedera network exchangerate cent and hbar equivalents.
 * Derived from Hedera consensus file 0.0.112.
 * Strictly performs upward ceiling division on micro-USD price to avoid truncation.
 */
export function computeHbarPriceFromCentRate(
  centEquivalent: number | bigint,
  hbarEquivalent: number | bigint
): { priceUsd: string; priceMicroUsd: bigint } {
  const centBig = BigInt(centEquivalent);
  const hbarBig = BigInt(hbarEquivalent);
  if (hbarBig <= 0n || centBig <= 0n) {
    throw new PriceOracleError(
      'PRICE_ORACLE_UNAVAILABLE',
      'Invalid exchange rate: equivalents must be positive integers'
    );
  }

  // 1 cent = 10,000 micro-USD ($1 = 100 cents = 1,000,000 micro-USD)
  // Ceiling division: ceil(centBig * 10000 / hbarBig)
  const priceMicroUsd = (centBig * 10000n + (hbarBig - 1n)) / hbarBig;
  const priceUsd = (Number(priceMicroUsd) / 1_000_000).toFixed(6);

  return { priceUsd, priceMicroUsd };
}

/**
 * Exact single-step ceiling conversion directly from Hedera cent and hbar equivalents.
 * Avoids any intermediate truncation or floating-point math:
 * ceil(tinybars * centEquivalent * 10,000 / (hbarEquivalent * 100,000,000))
 * = ceil(tinybars * centEquivalent / (hbarEquivalent * 10,000))
 */
export function convertTinybarsFromCentRate(
  tinybars: bigint | string,
  centEquivalent: bigint | number,
  hbarEquivalent: bigint | number
): bigint {
  const t = typeof tinybars === 'bigint' ? tinybars : BigInt(tinybars);
  if (t < 0n) throw new PriceOracleError('INVALID_AMOUNT', 'Payment amount cannot be negative.');
  if (t === 0n) return 0n;
  const c = BigInt(centEquivalent);
  const h = BigInt(hbarEquivalent);
  if (c <= 0n || h <= 0n) throw new PriceOracleError('PRICE_ORACLE_UNAVAILABLE', 'Exchange rate must be positive.');

  const divisor = h * 10000n;
  return (t * c + (divisor - 1n)) / divisor;
}

/**
 * Converts a decimal USD price (e.g. "0.08" or 0.08) to micro-USD BigInt (e.g. 80_000n).
 */
export function computePriceMicroUsdFromUsd(priceUsd: string | number): bigint {
  const num = typeof priceUsd === 'number' ? priceUsd : parseFloat(priceUsd);
  if (isNaN(num) || num <= 0) {
    throw new PriceOracleError(
      'PRICE_ORACLE_UNAVAILABLE',
      `Invalid USD price: "${priceUsd}". Price must be strictly positive.`
    );
  }
  return BigInt(Math.round(num * 1_000_000));
}

/**
 * Validates price freshness and ensures fail-closed behavior on stale/future quotes.
 * Consistently enforces:
 * 1. Quote timestamp age no greater than 300 seconds (applied to live, mock, cached, fallback).
 * 2. Protocol expiration timestamp strictly in the future (if provided).
 * 3. Rejects missing, zero, negative, and future-skewed values.
 */
export function validatePriceFreshness(
  quote: PriceQuote,
  maxAgeSeconds: number = DEFAULT_MAX_PRICE_AGE_SECONDS
): void {
  if (!quote || !quote.priceMicroUsd || quote.priceMicroUsd <= 0n) {
    throw new PriceOracleError(
      'PRICE_ORACLE_UNAVAILABLE',
      'Price quote is missing or non-positive.'
    );
  }

  const now = Date.now();

  // 1. Clock skew guard (quote timestamp in the future by > 60 seconds)
  if (quote.timestamp - now > 60_000) {
    throw new PriceOracleError(
      'PRICE_ORACLE_STALE',
      'Price quote timestamp is ahead of current server time.'
    );
  }

  // 2. Strict 300-second maximum age enforcement across all quotes
  // (Applies unconditionally to all quotes: live, mock, cached, or protocol)
  const maxAgeMs = maxAgeSeconds * 1000;
  if (now - quote.timestamp > maxAgeMs) {
    const ageSeconds = Math.round((now - quote.timestamp) / 1000);
    throw new PriceOracleError(
      'PRICE_ORACLE_STALE',
      `Price quote is stale: age ${ageSeconds}s exceeds maximum allowed freshness of ${maxAgeSeconds}s.`
    );
  }

  // 3. Protocol expiration check (if quote provides on-chain expiration)
  // Must be strictly in the future
  if (quote.expirationTime && quote.expirationTime * 1000 <= now) {
    const expiredAgoSeconds = Math.round((now - quote.expirationTime * 1000) / 1000);
    throw new PriceOracleError(
      'PRICE_ORACLE_STALE',
      `Hedera exchange rate has expired (expired ${expiredAgoSeconds}s ago).`
    );
  }
}

/**
 * Fetches the official Hedera testnet/mainnet exchange rate from the Hedera Mirror Node.
 * Mirror node endpoint /api/v1/network/exchangerate provides current_rate from consensus file 0.0.112.
 */
export async function fetchHederaMirrorExchangeRate(): Promise<PriceQuote> {
  const baseUrl = getMirrorNodeBaseUrl();
  const url = `${baseUrl}/api/v1/network/exchangerate`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PriceOracleError(
      'PRICE_ORACLE_UNAVAILABLE',
      `Failed to connect to Hedera Mirror Node exchange rate endpoint: ${msg}`
    );
  }

  if (!res.ok) {
    throw new PriceOracleError(
      'PRICE_ORACLE_UNAVAILABLE',
      `Hedera Mirror Node exchange rate endpoint returned HTTP ${res.status}`
    );
  }

  const data = await res.json();
  const currentRate = data?.current_rate;
  if (!currentRate || !currentRate.cent_equivalent || !currentRate.hbar_equivalent) {
    throw new PriceOracleError(
      'PRICE_ORACLE_UNAVAILABLE',
      'Hedera Mirror Node exchange rate response format is invalid.'
    );
  }

  const { priceUsd, priceMicroUsd } = computeHbarPriceFromCentRate(
    currentRate.cent_equivalent,
    currentRate.hbar_equivalent
  );

  return {
    assetSymbol: 'HBAR',
    priceUsd,
    priceMicroUsd,
    centEquivalent: BigInt(currentRate.cent_equivalent),
    hbarEquivalent: BigInt(currentRate.hbar_equivalent),
    source: 'hedera_mirror_node',
    timestamp: Date.now(),
    consensusTimestamp: data.timestamp || undefined,
    decimals: USD_MICRO_DECIMALS,
    expirationTime: currentRate.expiration_time,
  };
}

/**
 * Retrieves authoritative price quote for an asset.
 * - USDC is 1:1 USD-pegged stablecoin with 6 decimals (1 USDC atomic unit = 1 USD-micro).
 * - HBAR uses Hedera Mirror Node exchange rate oracle (or test mock).
 * - Fails closed on missing or stale price data.
 */
export async function getAssetPriceQuote(
  assetSymbol: string,
  maxAgeSeconds: number = DEFAULT_MAX_PRICE_AGE_SECONDS
): Promise<PriceQuote> {
  const symbol = assetSymbol.trim().toUpperCase();

  // 1. Check test mock hook first
  if (testPriceMock) {
    const mockQuote = await testPriceMock(symbol);
    if (!mockQuote) {
      throw new PriceOracleError(
        'PRICE_ORACLE_UNAVAILABLE',
        `Test price oracle returned null for asset "${symbol}".`
      );
    }
    validatePriceFreshness(mockQuote, maxAgeSeconds);
    return mockQuote;
  }

  // 2. USDC pegged 1:1 to USD
  if (symbol === 'USDC') {
    return {
      assetSymbol: 'USDC',
      priceUsd: '1.000000',
      priceMicroUsd: USD_MICRO_MULTIPLIER, // 1_000_000 micro-USD per USDC
      source: 'pegged_usd_stablecoin',
      timestamp: Date.now(),
      decimals: USD_MICRO_DECIMALS,
    };
  }

  // 3. HBAR via Hedera Mirror Node consensus exchange rate
  if (symbol === 'HBAR') {
    const quote = await fetchHederaMirrorExchangeRate();
    validatePriceFreshness(quote, maxAgeSeconds);
    return quote;
  }

  throw new PriceOracleError(
    'UNSUPPORTED_PRICE_ASSET',
    `No price oracle configured for asset "${symbol}". Supported assets: USDC, HBAR.`
  );
}

/**
 * Ceil-divides tinybars to USD-micro units:
 * ceil(tinybars * priceMicroUsd / 100_000_000)
 * Uses ceiling rounding to protect policy limits against fractional truncation bypasses.
 */
export function convertTinybarsToUsdMicro(
  tinybars: bigint | string,
  priceMicroUsd: bigint
): bigint {
  const t = typeof tinybars === 'bigint' ? tinybars : BigInt(tinybars);
  if (t < 0n) {
    throw new PriceOracleError('INVALID_AMOUNT', 'Payment amount cannot be negative.');
  }
  if (t === 0n) return 0n;
  if (priceMicroUsd <= 0n) {
    throw new PriceOracleError('PRICE_ORACLE_UNAVAILABLE', 'Price must be greater than zero.');
  }

  // Ceiling division formula: (A * B + (D - 1)) / D
  return (t * priceMicroUsd + (HBAR_TINYBAR_DIVISOR - 1n)) / HBAR_TINYBAR_DIVISOR;
}

/**
 * Normalizes any asset atomic amount into common USD-micro units ($10^-6 USD)
 * for uniform policy evaluation.
 *
 * - USDC (6 decimals): 1:1 direct mapping into USD-micro.
 * - HBAR (8 decimals): converted via price oracle with ceiling rounding.
 * - Fails closed if price oracle is unavailable or stale.
 */
export async function normalizeToUsdMicro({
  rawAtomicAmount,
  assetSymbol,
  priceOverride,
  maxAgeSeconds = DEFAULT_MAX_PRICE_AGE_SECONDS,
}: {
  rawAtomicAmount: string;
  assetSymbol: string;
  priceOverride?: PriceQuote;
  maxAgeSeconds?: number;
}): Promise<NormalizedSpend> {
  const symbol = assetSymbol.trim().toUpperCase();
  const atomicBig = BigInt(rawAtomicAmount);

  if (atomicBig < 0n) {
    throw new PriceOracleError('INVALID_AMOUNT', 'Atomic amount cannot be negative.');
  }

  let quote: PriceQuote;
  if (priceOverride) {
    validatePriceFreshness(priceOverride, maxAgeSeconds);
    quote = priceOverride;
  } else {
    quote = await getAssetPriceQuote(symbol, maxAgeSeconds);
  }

  let normalizedBig: bigint;

  if (symbol === 'USDC') {
    // 1 USDC atomic unit (10^-6) = 1 USD-micro unit (10^-6)
    normalizedBig = atomicBig;
  } else if (symbol === 'HBAR') {
    // Perform exact upward ceiling conversion into USD-micro ($10^-6 USD)
    if (quote.centEquivalent && quote.hbarEquivalent) {
      normalizedBig = convertTinybarsFromCentRate(atomicBig, quote.centEquivalent, quote.hbarEquivalent);
    } else {
      normalizedBig = convertTinybarsToUsdMicro(atomicBig, quote.priceMicroUsd);
    }
  } else {
    throw new PriceOracleError(
      'UNSUPPORTED_PRICE_ASSET',
      `Cannot normalize unsupported asset: "${symbol}".`
    );
  }

  return {
    assetSymbol: symbol,
    rawAtomicAmount,
    normalizedAmountUsdMicro: normalizedBig.toString(),
    priceQuote: quote,
    conversionDecimals: USD_MICRO_DECIMALS,
    conversionPrecision: 'USD_MICRO_6_DECIMALS',
  };
}
