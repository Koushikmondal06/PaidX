# PaidX Agentic Wallet: Automated Test Execution Results

**Execution Date:** November 6, 2026  
**Test Environment:** Linux (x86_64), Node.js v24.18.0, TSX, React Server Context  
**Test Runner:** `node:test` runner with TSX loader (`--tsconfig dashboard/tsconfig.json -C react-server`)  
**Overall Status:** **ALL 72 UNIT TESTS PASSING (0 FAILING)**

---

## 1. Test Execution Summary

```
▶ Approval Lifecycle & Execution Guard Tests
  ✔ Approval Guard: rejects execution of unapproved payment requests
  ✔ Approval Guard: rejects requests missing paymentId
  ✔ Approval Lifecycle: State Machine Transition Verifications
✔ Approval Lifecycle & Execution Guard Tests (3 tests passed)

▶ Phase 1 / Test Cases 1, 2, 3, 18: Authentication, Authorization & Route Guards
  ✔ Test Case 1: hashes agent API tokens deterministically with SHA-256
  ✔ Test Case 1: requireAuthenticatedUser strictly REJECTS forged x-user-id header
  ✔ Test Case 1: Actual Route Handler GET /api/agents blocks unauthenticated requests with 401
  ✔ Test Case 2: Actual Route Handler POST /api/agents blocks unauthenticated creation with 401
  ✔ Test Case 2: Actual Route Handler POST /api/agents/chat blocks requests without session or bearer token
  ✔ Test Case 2: Actual Route Handler POST /api/agents/chat rejects invalid token formats
  ✔ Test Case 3: authenticateAgentToken returns null for empty or non-paidx tokens
  ✔ Wallet Ownership: rejects non-Hedera wallet kind
✔ Phase 1 / Test Cases 1, 2, 3, 18: Authentication, Authorization & Route Guards (8 tests passed)

▶ Phase 4 / Test Case 8: Strict Decimal & Atomic Unit Conversions
  ✔ accepts valid 5 USDC and converts to 5000000 atomic units
  ✔ accepts 0.5 USDC and converts to 500000 atomic units
  ✔ accepts 0.000001 USDC (minimum 1 atomic unit)
  ✔ rejects 0.0000001 USDC (exceeds 6 decimal places)
  ✔ rejects negative values
  ✔ rejects zero amounts (0, 0.0, 0.000000)
  ✔ rejects malformed strings and signs
  ✔ rejects scientific notation (e.g. 1e-5)
  ✔ handles very large valid values without precision loss
  ✔ converts HBAR to tinybars (8 decimals)
  ✔ validates Hedera entity and token IDs
✔ Phase 4 / Test Case 8: Strict Decimal & Atomic Unit Conversions (11 tests passed)

▶ Phase 7 / Test Case 14: Hedera Consensus Service (HCS) Audit Event Publication, Verification & Retries
  ✔ Test Case 14: publishes immutable audit event with all required fields and captures sequence number
  ✔ Test Case 14: preserves settled payment when HCS publishing fails, marking pending_retry
  ✔ HCS Verification: verifies actual message fetched from Mirror Node
  ✔ HCS Verification: rejects verification when message does not exist on Mirror Node
✔ Phase 7 / Test Case 14: Hedera Consensus Service (HCS) Audit Event Publication, Verification & Retries (4 tests passed)

▶ Phase 8 & 9 / Test Cases 15, 16, 17: MCP Protocol, Tool Registry & Cross-Agent Data Isolation
  ✔ Test Case 15: exactly 16 tools registered across both dashboard and mcp-server
  ✔ Test Case 15: verifies MCP initialize handshake specifications
  ✔ Test Case 16: rejects unauthorized tool execution without Agent Bearer Token
  ✔ Test Case 17: enforces strict cross-agent data isolation for payment status and history
  ✔ Test Case 17: enforces strict cross-agent isolation for spending history and permissions
✔ Phase 8 & 9 / Test Cases 15, 16, 17: MCP Protocol, Tool Registry & Cross-Agent Data Isolation (5 tests passed)

▶ Phase 5 & 6 / Test Cases 4, 5, 6, 7: Spending Policies, Concurrency, Rollover & Idempotency
  ✔ Test Case 4: blocks transactions exceeding max amount per transaction
  ✔ Test Case 5: Real concurrent reservation execution with atomic row-lock semantics
  ✔ Test Case 7: Parameter Binding & Idempotency Conflict Detection
  ✔ Test Case 7: Duplicate commits are idempotent and do not increment counters twice
  ✔ Test Case 6: resets daily spending on date rollover
  ✔ Test Case 6: resets monthly spending on month rollover
✔ Phase 5 & 6 / Test Cases 4, 5, 6, 7: Spending Policies, Concurrency, Rollover & Idempotency (6 tests passed)

▶ Phase 2 / Test Cases 9 & 10: Wallet Signing Architecture & Key Structure Verification
  ✔ Test Case 9: builds exact HTS TransferTransaction with correct payer and recipient
  ✔ Test Case 9: builds exact native HBAR TransferTransaction with tinybars
  ✔ Test Case 10: retrieves public key matching registered private key
  ✔ Test Case 10: signs transaction successfully when payer matches signer
  ✔ Test Case 10: rejects signing when payer account has no registered signer (fails closed, no operator fallback)
  ✔ Test Case 10: rejects transaction if transaction payer does not match signer account ID
  ✔ Signer Security: FAILS CLOSED when Mirror Node is unavailable or network fails
  ✔ Signer Security: FAILS CLOSED when account is not found on Mirror Node
  ✔ Signer Security: rejects signing if account is marked as deleted on Mirror Node
  ✔ Signer Security: rejects signing on key mismatch (strictly prevents substring false positives)
  ✔ Signer Security: successfully verifies ECDSA_SECP256K1 key structures
  ✔ Signer Security: successfully verifies nested KeyList and ThresholdKey structures
  ✔ Signer Security: rejects signing after account key unregistration (revocation)
✔ Phase 2 / Test Cases 9 & 10: Wallet Signing Architecture & Key Structure Verification (13 tests passed)

▶ Phase 3 / Test Cases 11, 12, 13, 19: x402 Protocol, Verification, Settlement & Mirror Node
  ✔ Test Case 11: verifies valid payload matching exact requirements
  ✔ Test Case 11: rejects unsigned payload (fails closed on missing signature structure)
  ✔ Test Case 11: rejects payload with amount mismatch (greater amount)
  ✔ Test Case 11: rejects payload with amount mismatch (lesser amount)
  ✔ Test Case 11: rejects payload with wrong recipient
  ✔ Test Case 11: rejects payload with wrong asset
  ✔ Security Zero-Tolerance: rejects extra transfers to third-party accounts
  ✔ Security Zero-Tolerance: rejects unauthorized HBAR transfer inside token payment
  ✔ Facilitator Capabilities: rejects unsupported network, scheme, or asset
  ✔ Facilitator Verification: requires facilitator response valid === true
  ✔ Facilitator Verification: FAILS CLOSED when facilitator is unavailable
  ✔ Facilitator Settlement: captures network timeouts without fake settlement
  ✔ Mirror Node Polling: polls and returns transaction when SUCCESS reached
  ✔ Mirror Node Polling: returns null when transaction not yet indexed
✔ Phase 3 / Test Cases 11, 12, 13, 19: x402 Protocol, Verification, Settlement & Mirror Node (14 tests passed)

--------------------------------------------------------------------------------
Total Tests: 72
Passing:     72
Failing:     0
Duration:    1,165 ms
--------------------------------------------------------------------------------
```

---

## 2. Production Build Verification

### 2.1 Next.js Dashboard Build (`npm run build --prefix dashboard`)
- **Status:** **SUCCESS**
- **Typecheck:** Clean (0 TypeScript errors)
- **API Routes Compiled (18 Routes):**
  - `/api/agents`
  - `/api/agents/chat`
  - `/api/agents/payments`
  - `/api/agents/revoke`
  - `/api/approvals/approve`
  - `/api/approvals/execute`
  - `/api/approvals/reject`
  - `/api/cards/register`
  - `/api/cards/status`
  - `/api/indexer/run`
  - `/api/mcp`
  - `/api/payments`
  - `/api/payments/reconcile`
  - `/api/permissions`
  - `/api/permissions/revoke`
  - `/api/session-account`
- **Static Pages Compiled (13 Pages):**
  - `/`, `/auth`, `/dashboard`, `/dashboard/agents`, `/dashboard/cards`, `/dashboard/transactions`, `/merchant`, `/merchant/pos`, `/merchant/terminal`, `/onboarding`.

### 2.2 Dedicated MCP Server Build (`npm run build --prefix mcp-server`)
- **Status:** **SUCCESS**
- **Output:** Clean ESM build generated in `mcp-server/dist/`.

---

## 3. Live Hedera Testnet Integration Test

- **File:** `test/integration/hedera_testnet.test.ts`
- **Execution Mode:** Opt-in only via `RUN_HEDERA_INTEGRATION_TESTS=true` and explicit testnet operator credentials (`HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`).
- **Safety Policy:** Ordinary unit test runs (`npm test`) skip live transactions by default.
- **Coverage:**
  1. Live Mirror Node connectivity and balance inspection.
  2. Controlled live micro-transfer (1000 tinybars) on Hedera Testnet.
  3. Real consensus verification on public Mirror Node (`testnet.mirrornode.hedera.com`).
  4. Immutable event publication to Hedera Consensus Service topic.
