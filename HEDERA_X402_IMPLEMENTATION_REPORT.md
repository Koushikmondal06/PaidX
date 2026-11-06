# PaidX Hedera x402 Implementation Report

**Protocol:** Hedera x402 Conversational Wallet Payment Protocol  
**Network:** Hedera Testnet (Chain ID 296)  
**Standard Scheme:** `exact`  
**Assets Supported:** Hedera Token Service (HTS) USDC (`0.0.5449156`), Native HBAR (`0.0.0`)  
**Target Services:** Hedera Token Service (HTS), Hedera Consensus Service (HCS), Hedera Mirror Node  

---

## 1. Executive Protocol Summary

PaidX implements an AI-powered conversational wallet payment pipeline compliant with the official **Hedera x402 exact payment scheme specification**. A user connects their authorized Hedera wallet to an AI agent (via Claude Desktop, Cursor, OpenAI Agents, or the PaidX Console) and issues natural language commands such as:

> `"Send 5 USDC to 0.0.123456"`

The pipeline validates the recipient, evaluates spending limits atomically, creates recipient-directed x402 payment requirements (`payTo: 0.0.123456`), signs the payment using an isolated delegated signer for the connected wallet, verifies the payload through the x402 facilitator, settles on Hedera Testnet, confirms consensus independently via the Hedera Mirror Node, commits spending records, and publishes an immutable audit event to the Hedera Consensus Service (HCS).

---

## 2. End-to-End Payment Execution Lifecycle

```
[User Chat Prompt]
       |
       v
1. Instruction Parser (lib/agent/instructionParser.ts)
   - Extracts: recipient (0.0.123456), amount (5), asset (USDC), network (hedera:testnet)
       |
       v
2. Authentication & Wallet Resolution (lib/agent/policyEngine.ts)
   - Validates Bearer token / Supabase session
   - Resolves authorized Hedera wallet (kind: 'hedera', address: 0.0.payer)
       |
       v
3. Strict Decimal Conversion (lib/hedera/decimal.ts)
   - Zero-tolerance validation: non-negative, non-zero, no scientific notation
   - Atomic unit calculation: 5 USDC (6 decimals) -> 5000000n BigInt
       |
       v
4. Atomic Budget Reservation (supabase/migrations/20261106010000_atomic_budget_reservation.sql)
   - Row-level lock (FOR UPDATE) on agent_policies
   - Enforces max_amount_per_tx, daily_budget, monthly_budget, allowlists
   - Inserts spending_reservations (status: 'reserved', expires_at: +10min)
       |
       v
5. Recipient-Directed Requirements (lib/hedera/x402/requirements.ts)
   - scheme: 'exact'
   - network: 'hedera:testnet'
   - amount: '5000000' (atomic units)
   - asset: '0.0.5449156' (HTS USDC)
   - payTo: '0.0.123456' (User's recipient)
   - extra.feePayer: Facilitator account
       |
       v
6. Delegated Wallet Signing (lib/hedera/signing/delegatedSigner.ts)
   - Resolves key for payer account (never operator fallback)
   - Verifies public key matches Hedera Mirror Node on-chain key
   - Signs TransferTransaction
       |
       v
7. Facilitator Verify-Then-Settle (lib/hedera/x402/facilitator.ts)
   - Structural validation: exact amount (no greater/lesser), exact recipient, no rogue transfers
   - Calls Facilitator POST /verify -> Validates signature & requirements
   - Calls Facilitator POST /settle -> Submits sponsored transaction
   - Fails closed on any facilitator failure (no silent operator execution)
       |
       v
8. Independent Mirror Node Confirmation (lib/hedera/mirrorNode.ts)
   - Polls /api/v1/transactions/{txId}
   - Verifies consensus result === 'SUCCESS'
   - Verifies on-chain token transfers match expected recipient & amount
       |
       v
9. Ledger Commit & Immutable HCS Audit (lib/hedera/hcs.ts)
   - Commits reservation to agent_policies.spent_today / spent_this_month
   - Submits TopicMessageSubmitTransaction to PaidX HCS Audit Topic
   - Records sequence_number & running_hash
   - Updates agent_payments status: 'confirmed'
       |
       v
[Payment Confirmation Returned to User]
Transaction ID: 0.0.payer@1700000000.123456789
HashScan: https://hashscan.io/testnet/transaction/0.0.payer-1700000000-123456789
HCS Audit Sequence: #42 on topic 0.0.xxxxxx
```

---

## 3. Specification Compliance Matrix

| Requirement | Implementation | Compliance Status |
| :--- | :--- | :--- |
| **Payment Scheme** | Strictly `exact` (rejects `market`, `range`, or unknown schemes) | Compliant |
| **Network** | `hedera:testnet` | Compliant |
| **Recipient (`payTo`)** | User-specified recipient (e.g. `0.0.123456`) | Compliant |
| **Atomic Amount** | `BigInt` exact atomic units (`5000000` for 5 USDC, `250000000` for 2.5 HBAR) | Compliant |
| **Asset Identifier** | HTS Token ID (`0.0.5449156`) or `0.0.0` for HBAR | Compliant |
| **Fee Payer** | Facilitator account sponsors gas fees | Compliant |
| **Verify-Then-Settle** | Structural check -> `/verify` endpoint -> `/settle` endpoint | Compliant |
| **Mirror Node Audit** | Polls consensus and verifies transfer records independently | Compliant |
| **Immutable HCS Event** | Records payment ID, payer, recipient, atomic amount, tx ID, sequence number | Compliant |

---

## 4. Rejection & Failure Handling

1. **Amount Mismatch Rejection:**
   If a signed transaction transfers an amount different from requirements (e.g. 6 USDC instead of 5 USDC, or 4 USDC instead of 5 USDC), `validateTransactionBytesAgainstRequirements` rejects the transaction with `Exact amount mismatch`.
2. **Wrong Recipient Rejection:**
   If the transaction transfers funds to an address other than `requirements.payTo`, verification rejects with `no transfer of token to recipient`.
3. **Facilitator Failure:**
   If the facilitator is unavailable or out of gas, settlement fails with an explicit error. Silent execution with the server operator key has been completely eliminated.
4. **Network Timeout & Uncertain Consensus:**
   If facilitator communication times out after transaction submission, the payment is placed in status `uncertain`. Budget reservations are **retained** rather than released to prevent double-spending. The `/api/payments/reconcile` endpoint queries the Mirror Node to resolve consensus.

---

## 5. Automated Verification Results

All protocol requirements were verified through automated tests in `test/unit/x402_and_facilitator.test.ts` and `test/unit/signing_and_transaction.test.ts`:

- **Test Case 9:** Transaction construction with exact payer, recipient, and amount: **PASS**
- **Test Case 10:** Signer public key verification and payer matching: **PASS**
- **Test Case 11:** Rejection of mismatched amounts (greater/lesser), wrong recipient, wrong asset, non-exact scheme: **PASS**
- **Test Case 12:** Facilitator failure fails closed without operator bypass: **PASS**
- **Test Case 13:** Mirror Node consensus confirmation and failure detection: **PASS**
- **Test Case 19:** Uncertain network outcome handling without premature reservation release: **PASS**

---
*Report certified by PaidX Blockchain & Hedera Engineering.*
