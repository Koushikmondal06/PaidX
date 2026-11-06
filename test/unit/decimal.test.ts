import test from 'node:test';
import assert from 'node:assert';
import {
  validateDecimalString,
  parseToAtomicUnits,
  formatAtomicUnits,
  parseHbarToTinybars,
  formatTinybarsToHbar,
  isValidHederaTokenId,
} from '../../dashboard/lib/hedera/decimal.ts';

test('Phase 4 / Test Case 8: Strict Decimal & Atomic Unit Conversions', async (t) => {
  await t.test('accepts valid 5 USDC and converts to 5000000 atomic units', () => {
    const atomic = parseToAtomicUnits('5', 6);
    assert.strictEqual(atomic, 5000000n);
    assert.strictEqual(formatAtomicUnits(atomic, 6), '5');
  });

  await t.test('accepts 0.5 USDC and converts to 500000 atomic units', () => {
    const atomic = parseToAtomicUnits('0.5', 6);
    assert.strictEqual(atomic, 500000n);
    assert.strictEqual(formatAtomicUnits(atomic, 6), '0.5');
  });

  await t.test('accepts 0.000001 USDC (minimum 1 atomic unit)', () => {
    const atomic = parseToAtomicUnits('0.000001', 6);
    assert.strictEqual(atomic, 1n);
    assert.strictEqual(formatAtomicUnits(atomic, 6), '0.000001');
  });

  await t.test('rejects 0.0000001 USDC (exceeds 6 decimal places)', () => {
    assert.throws(
      () => parseToAtomicUnits('0.0000001', 6),
      /exceeds maximum allowed precision/i
    );
  });

  await t.test('rejects negative values', () => {
    assert.throws(() => parseToAtomicUnits('-5', 6), /Negative payment amounts are not permitted/i);
    assert.throws(() => parseToAtomicUnits('-0.5', 6), /Negative payment amounts are not permitted/i);
  });

  await t.test('rejects zero amounts (0, 0.0, 0.000000)', () => {
    assert.throws(() => parseToAtomicUnits('0', 6), /must be strictly greater than zero/i);
    assert.throws(() => parseToAtomicUnits('0.0', 6), /must be strictly greater than zero/i);
    assert.throws(() => parseToAtomicUnits('0.000000', 6), /must be strictly greater than zero/i);
  });

  await t.test('rejects malformed strings and signs', () => {
    assert.throws(() => parseToAtomicUnits('abc', 6), /Invalid amount format/i);
    assert.throws(() => parseToAtomicUnits('5.5.5', 6), /Invalid amount format/i);
    assert.throws(() => parseToAtomicUnits('+5', 6), /Invalid amount format/i);
    assert.throws(() => parseToAtomicUnits('$5.00', 6), /Invalid amount format/i);
  });

  await t.test('rejects scientific notation (e.g. 1e-5)', () => {
    assert.throws(() => parseToAtomicUnits('1e-5', 6), /Scientific notation is not permitted/i);
    assert.throws(() => parseToAtomicUnits('5E3', 6), /Scientific notation is not permitted/i);
  });

  await t.test('handles very large valid values without precision loss', () => {
    const largeAmount = '1000000000000.500000';
    const atomic = parseToAtomicUnits(largeAmount, 6);
    assert.strictEqual(atomic, 1000000000000500000n);
    assert.strictEqual(formatAtomicUnits(atomic, 6), '1000000000000.5');
  });

  await t.test('converts HBAR to tinybars (8 decimals)', () => {
    const tinybars = parseHbarToTinybars('2.5');
    assert.strictEqual(tinybars, 250000000n);
    assert.strictEqual(formatTinybarsToHbar(tinybars), '2.5');
  });

  await t.test('validates Hedera entity and token IDs', () => {
    assert.strictEqual(isValidHederaTokenId('0.0.5449156'), true);
    assert.strictEqual(isValidHederaTokenId('0.0.0'), true);
    assert.strictEqual(isValidHederaTokenId('0.0.123456'), true);
    assert.strictEqual(isValidHederaTokenId('invalid'), false);
    assert.strictEqual(isValidHederaTokenId('0.1.2'), false);
  });
});
