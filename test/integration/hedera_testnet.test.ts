import test from 'node:test';
import assert from 'node:assert';
import { getMirrorAccountBalance, getMirrorTransaction } from '../../dashboard/lib/hedera/mirrorNode.ts';
import { getHederaClient } from '../../dashboard/lib/hedera/client.ts';

test('Hedera Testnet Live Integration Test (Opt-in)', async (t) => {
  const shouldRun = process.env.RUN_HEDERA_INTEGRATION_TESTS === 'true';
  const hasCredentials = !!(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);

  if (!shouldRun || !hasCredentials) {
    console.log(
      '[Integration Test] Skipped: Set RUN_HEDERA_INTEGRATION_TESTS=true with valid HEDERA_OPERATOR_ID & HEDERA_OPERATOR_KEY to run live Hedera Testnet tests.'
    );
    return;
  }

  await t.test('verifies live Hedera Testnet Mirror Node connectivity and balance', async () => {
    const operatorId = process.env.HEDERA_OPERATOR_ID!;
    const balance = await getMirrorAccountBalance(operatorId);
    assert.ok(balance, 'Mirror node balance should be returned');
    console.log(`[Integration Test] Live HBAR balance for ${operatorId}: ${balance.hbarBalance} HBAR`);
  });

  await t.test('verifies Hedera SDK Client initializes with testnet operator', () => {
    const client = getHederaClient();
    assert.ok(client, 'Hedera Client should initialize');
    assert.strictEqual(client.operatorAccountId?.toString(), process.env.HEDERA_OPERATOR_ID);
  });
});
