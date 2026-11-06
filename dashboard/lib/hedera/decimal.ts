/**
 * Strict Decimal and Atomic Unit Utilities for Hedera HTS & HBAR Payments.
 * Enforces zero-tolerance precision validation and pure BigInt arithmetic.
 */

// Regex for strictly formatted positive decimal strings (no signs, no scientific notation, no whitespace)
const STRICT_DECIMAL_REGEX = /^[0-9]+(\.[0-9]+)?$/;

// Hedera Account or Token ID format: 0.0.123456
const HEDERA_ENTITY_ID_REGEX = /^0\.0\.[1-9][0-9]*$/;

/**
 * Validates a decimal string against exact format and asset decimal constraints.
 * Throws a descriptive Error if invalid.
 */
export function validateDecimalString(amount: unknown, maxDecimals: number): string {
  if (typeof amount !== 'string') {
    throw new Error(`Amount must be provided as a string. Received: ${typeof amount}`);
  }

  const trimmed = amount.trim();
  if (!trimmed) {
    throw new Error('Payment amount cannot be empty.');
  }

  // Reject scientific notation
  if (/[eE]/.test(trimmed)) {
    throw new Error(`Scientific notation is not permitted for financial amounts: "${trimmed}"`);
  }

  // Reject negative signs
  if (trimmed.startsWith('-') || trimmed.includes('-')) {
    throw new Error(`Negative payment amounts are not permitted: "${trimmed}"`);
  }

  // Reject plus signs or non-digit/dot characters
  if (!STRICT_DECIMAL_REGEX.test(trimmed)) {
    throw new Error(`Invalid amount format: "${trimmed}". Expected positive decimal string (e.g. "5" or "5.50").`);
  }

  const parts = trimmed.split('.');
  const wholePart = parts[0];
  const fracPart = parts[1] || '';

  // Validate decimal precision
  if (fracPart.length > maxDecimals) {
    throw new Error(
      `Amount "${trimmed}" exceeds maximum allowed precision of ${maxDecimals} decimal places for this asset.`
    );
  }

  // Check for non-zero positive value
  const isAllZeroes = /^0+$/.test(wholePart) && (!fracPart || /^0+$/.test(fracPart));
  if (isAllZeroes) {
    throw new Error(`Payment amount must be strictly greater than zero. Received: "${trimmed}"`);
  }

  return trimmed;
}

/**
 * Parses a decimal string to its atomic integer representation (BigInt) without floating-point errors.
 * Example for USDC (6 decimals):
 *   "5"       => 5000000n
 *   "0.5"     => 500000n
 *   "0.000001"=> 1n
 */
export function parseToAtomicUnits(amountStr: string, decimals: number): bigint {
  const validated = validateDecimalString(amountStr, decimals);
  const [whole, fraction = ''] = validated.split('.');

  const paddedFraction = fraction.padEnd(decimals, '0');
  const combinedStr = `${whole}${paddedFraction}`.replace(/^0+/, '');

  if (combinedStr === '') {
    return 0n;
  }

  return BigInt(combinedStr);
}

/**
 * Formats atomic BigInt units back into a clean decimal display string.
 * Example:
 *   5000000n (6 dec) => "5"
 *   5500000n (6 dec) => "5.5"
 *   1n       (6 dec) => "0.000001"
 */
export function formatAtomicUnits(atomic: bigint | string, decimals: number): string {
  const atomicBig = typeof atomic === 'bigint' ? atomic : BigInt(atomic.toString());
  if (atomicBig < 0n) {
    throw new Error('Atomic units cannot be negative.');
  }

  if (decimals === 0) {
    return atomicBig.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = atomicBig / divisor;
  const remainder = atomicBig % divisor;

  if (remainder === 0n) {
    return whole.toString();
  }

  const remainderStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toString()}.${remainderStr}`;
}

/**
 * Validates whether a token ID conforms to Hedera entity format: 0.0.123456 or 0.0.0 (HBAR).
 */
export function isValidHederaTokenId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed === '0.0.0') return true;
  return HEDERA_ENTITY_ID_REGEX.test(trimmed);
}

/**
 * Converts HBAR amount string to tinybars (8 decimals).
 */
export function parseHbarToTinybars(amountStr: string): bigint {
  return parseToAtomicUnits(amountStr, 8);
}

/**
 * Formats tinybars (8 decimals) to HBAR string.
 */
export function formatTinybarsToHbar(tinybars: bigint | string): string {
  return formatAtomicUnits(tinybars, 8);
}
