/**
 * Natural language parser for conversational payment instructions.
 * Extracts: Recipient (0.0.x), Amount, Asset (USDC, HBAR).
 */
export function parsePaymentInstruction(prompt: string): {
  recipient?: string;
  amount?: string;
  asset?: string;
  network?: 'hedera:testnet';
  error?: string;
} {
  const text = prompt.trim();

  // 1. Extract Hedera Account ID: 0.0.[0-9]+
  const accountMatch = text.match(/\b(0\.0\.[1-9][0-9]*)\b/);
  const recipient = accountMatch ? accountMatch[1] : undefined;

  // 2. Extract Asset: USDC, HBAR
  let asset = 'USDC';
  if (/\bhbar\b/i.test(text)) {
    asset = 'HBAR';
  } else if (/\busdc\b/i.test(text)) {
    asset = 'USDC';
  }

  // 3. Extract Amount: e.g. "5", "5.00", "0.5"
  const amountMatch =
    text.match(/(?:send|pay|transfer)\s+([0-9]+(?:\.[0-9]+)?)/i) ||
    text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:usdc|hbar)/i) ||
    text.match(/\b([0-9]+(?:\.[0-9]+)?)\b/);

  const amount = amountMatch ? amountMatch[1] : undefined;

  if (!recipient) {
    return {
      error: 'Missing recipient address. Please specify a valid Hedera Account ID (e.g. 0.0.123456).',
    };
  }

  if (!amount || parseFloat(amount) <= 0) {
    return {
      recipient,
      error: 'Missing or invalid payment amount. Please specify an amount greater than zero.',
    };
  }

  return {
    recipient,
    amount,
    asset,
    network: 'hedera:testnet',
  };
}
