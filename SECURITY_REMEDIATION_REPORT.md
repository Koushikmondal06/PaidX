# PaidX Security Remediation Report

**Date:** November 6, 2026  
**Auditor:** PaidX Security & Infrastructure Engineering Team  
**Scope:** Hedera Agentic Wallet, x402 Payment Pipeline, MCP Server, Supabase Integration, and Policy Engine  
**Branch:** `Agent-Commerce`

---

## Executive Summary

A comprehensive architectural and security audit was conducted on the PaidX repository to remediate critical authentication vulnerabilities, wallet signing insecurities, protocol non-compliances, and race conditions identified in the initial Hedera Agentic Wallet implementation.

All 10 critical security findings have been resolved, verified through automated unit tests, and compiled into production-ready builds. The system now enforces zero-trust identity derivation from Supabase Auth, prevents operator private key substitution, executes atomic database-backed budget reservations, follows strict decimal arithmetic without floating-point hazards, and provides complete isolation between connected AI agents.

---

## Detailed Remediation Findings

### Finding 1: Unauthenticated Agent Endpoints and Header Spoofing
* **Severity:** Critical (CVSS 9.8)
* **Original Problem:** The `/api/agents` route trusted the user-supplied `x-user-id` header to filter agent connections. If `x-user-id` was omitted, the endpoint returned all connected agents across all users globally. In the POST route, `userId` was trusted directly from the request JSON body without validating the caller's session.
* **Changed Files:**
  - `dashboard/lib/server/auth.ts` (created)
  - `dashboard/app/api/agents/route.ts`
  - `dashboard/app/dashboard/agents/page.tsx`
* **Fix Implemented:** Created `getAuthenticatedUser(req)` and `requireAuthenticatedUser(req)` in `lib/server/auth.ts`, extracting the Bearer token from the `Authorization` header and verifying it against Supabase Auth (`supabase.auth.getUser(token)`). The `x-user-id` header is completely ignored; caller identity is derived strictly from `user.id`. In POST, the agent connection is created only for the authenticated `user.id`.
* **Test Performed:** `test/unit/auth_and_wallet.test.ts` (Test Case 1) verified that forged `x-user-id` headers are ignored and requests without a valid session return 401 Unauthorized.
* **Test Result:** Passed.
* **Remaining Limitations:** Client browsers must maintain a valid Supabase Auth session token.

---

### Finding 2: Unverified Wallet Ownership & Non-Hedera Wallet Linking
* **Severity:** High (CVSS 8.5)
* **Original Problem:** In `/api/agents` POST, an arbitrary `walletId` could be passed without verifying that the authenticated user owned the wallet. Furthermore, wallets with `kind: 'metamask_smart_account'` or `kind: 'eoa'` could be linked to Hedera agent payments, causing downstream signing and network failures. If no wallet ID was supplied, the route silently assigned `HEDERA_OPERATOR_ID`.
* **Changed Files:**
  - `dashboard/app/api/agents/route.ts`
* **Fix Implemented:** 
  1. The route now queries `wallets` where `id = walletId` AND `user_id = user.id`. If no match, it returns `403 Forbidden`.
  2. Enforces `wallet.kind === 'hedera'`. If not, it returns `400 Bad Request`.
  3. If `walletId` is omitted, it queries the user's existing Hedera wallet; if none exists, it rejects the request rather than silently defaulting to the operator account.
* **Test Performed:** `test/unit/auth_and_wallet.test.ts` (Test Case 2) tested linking a wallet belonging to another user (rejected) and linking an Ethereum wallet (rejected).
* **Test Result:** Passed.
* **Remaining Limitations:** Users must explicitly connect or register a Hedera account before binding an agent.

---

### Finding 3: Operator Private Key Used as User Wallet Signer
* **Severity:** Critical (CVSS 9.6)
* **Original Problem:** `dashboard/lib/hedera/signer.ts` fell back to `process.env.HEDERA_OPERATOR_KEY` or `process.env.SESSION_ACCOUNT_PRIVATE_KEY` whenever a specific signing key was not provided. This meant user agent payments were signed using the server's global operator key, completely invalidating decentralized account isolation.
* **Changed Files:**
  - `dashboard/lib/hedera/signing/types.ts` (created)
  - `dashboard/lib/hedera/signing/delegatedSigner.ts` (created)
  - `dashboard/lib/hedera/signing/registry.ts` (created)
  - `dashboard/lib/hedera/signer.ts`
* **Fix Implemented:** Designed a swappable `IWalletSigningProvider` architecture. The `DelegatedWalletSigningProvider` resolves signing keys strictly per account ID (via in-memory registration or account-scoped environment variables `HEDERA_ACCOUNT_KEY_<account_id>`). It verifies that the transaction payer equals the signer account ID and confirms that the signer's public key matches the on-chain key on Hedera Mirror Node. Operator key fallback is strictly prohibited.
* **Test Performed:** `test/unit/signing_and_transaction.test.ts` (Test Case 10) tested signing with configured accounts (succeeded), unconfigured accounts (rejected with `No authorized signing key configured`), and payer mismatches (rejected with `Transaction payer mismatch`).
* **Test Result:** Passed.
* **Remaining Limitations:** HSM/KMS providers can be plugged in via `setWalletSigningProvider` for enterprise custody.

---

### Finding 4: Global Active Agent Fallback in Conversational Chat Route
* **Severity:** High (CVSS 8.2)
* **Original Problem:** In `dashboard/app/api/agents/chat/route.ts`, if neither `agentId` nor `userId` was supplied, the route executed `.from('agent_connections').select('*, wallets(*)').eq('status', 'active').limit(1).maybeSingle()`, randomly selecting the first active agent in the database and executing payments against their wallet.
* **Changed Files:**
  - `dashboard/app/api/agents/chat/route.ts`
* **Fix Implemented:** Removed all global fallbacks. The endpoint now authenticates the caller via either:
  1. An Agent Bearer Token (`Authorization: Bearer paidx_agt_...`) verified against `api_key_hash`.
  2. A Supabase Auth user session (`Authorization: Bearer <session_token>`), resolving agents owned strictly by `user.id`.
  If unauthenticated or if no agent belongs to the caller, the request fails with 401 or 400.
* **Test Performed:** Verified in `test/unit/auth_and_wallet.test.ts` and automated API routes.
* **Test Result:** Passed.
* **Remaining Limitations:** None.

---

### Finding 5: Unauthenticated and Unscoped Agent Revocation
* **Severity:** High (CVSS 8.1)
* **Original Problem:** `/api/agents/revoke` accepted `agentId` in the JSON request body and updated `status = 'revoked'` without verifying user authentication or ownership, allowing any unauthorized caller to revoke any agent connection across the system.
* **Changed Files:**
  - `dashboard/app/api/agents/revoke/route.ts`
* **Fix Implemented:** Endpoint requires `requireAuthenticatedUser(req)`. It verifies that `agent_connections.user_id === user.id`. Only the authenticated owner can revoke the agent. Upon revocation, any outstanding active spending reservations for that agent are released.
* **Test Performed:** `test/unit/auth_and_wallet.test.ts` (Test Case 3).
* **Test Result:** Passed.
* **Remaining Limitations:** None.

---

### Finding 6: Silent Operator Fallback in Facilitator Settlement
* **Severity:** Critical (CVSS 9.1)
* **Original Problem:** In `dashboard/lib/hedera/x402/facilitator.ts`, if external facilitator settlement failed or was unreachable, the function caught the error and fell back to executing the transaction directly on Hedera Testnet using `HEDERA_OPERATOR_KEY`, while falsely reporting successful x402 facilitator settlement.
* **Changed Files:**
  - `dashboard/lib/hedera/x402/facilitator.ts`
* **Fix Implemented:** Removed all silent fallback execution. The facilitator module now strictly fails closed. If `HEDERA_FACILITATOR_URL` is missing or the external facilitator returns an error/500, an explicit error is returned. Direct execution with operator funds is completely eliminated.
* **Test Performed:** `test/unit/x402_and_facilitator.test.ts` (Test Case 12) tested facilitator 500 error response (fails closed without operator bypass).
* **Test Result:** Passed.
* **Remaining Limitations:** A live facilitator endpoint is required for on-chain testnet settlement.

---

### Finding 7: Unsafe Floating-Point Conversions and Precision Truncation
* **Severity:** Medium (CVSS 6.5)
* **Original Problem:** `hts.ts` and `orchestrator.ts` used `parseFloat` and `.slice(0, decimals)` on amount strings. This caused silent truncation of excessive decimal digits (e.g. `0.0000001` USDC silently became `0.000000` instead of rejecting) and introduced floating-point rounding errors on large numbers.
* **Changed Files:**
  - `dashboard/lib/hedera/decimal.ts` (created)
  - `dashboard/lib/hedera/hts.ts`
  - `dashboard/lib/agent/orchestrator.ts`
* **Fix Implemented:** Created `validateDecimalString` and `parseToAtomicUnits` in `decimal.ts`. Enforces regex `^[0-9]+(\.[0-9]+)?$`, rejects negative values, zero, scientific notation (`1e-5`), and rejects fractional precision exceeding asset decimals (e.g. >6 for USDC). Computes atomic amounts exclusively using `BigInt`.
* **Test Performed:** `test/unit/decimal.test.ts` (Test Case 8) executed 12 subtests for 5 USDC, 0.5 USDC, 0.000001 USDC, 0.0000001 USDC (rejected), negatives (rejected), zero (rejected), scientific notation (rejected), and very large numbers.
* **Test Result:** All 12 subtests passed.
* **Remaining Limitations:** None.

---

### Finding 8: Non-Atomic Spending Policy Reservation & Concurrency Vulnerability
* **Severity:** High (CVSS 7.9)
* **Original Problem:** `policyEngine.ts` checked limits in JavaScript and then inserted a reservation into the database. Under concurrent requests, two requests could evaluate remaining budget simultaneously and both succeed, violating the daily or monthly budget cap.
* **Changed Files:**
  - `supabase/migrations/20261106010000_atomic_budget_reservation.sql` (created)
  - `dashboard/lib/agent/policyEngine.ts`
* **Fix Implemented:** Created PostgreSQL stored procedure `reserve_agent_budget` that executes `SELECT ... FOR UPDATE` on `agent_policies`. It atomically checks daily and monthly budgets, aggregates active unexpired reservations (`status = 'reserved' AND expires_at > NOW()`), performs date rollovers, checks allowlists, and creates the reservation within a single database transaction.
* **Test Performed:** `test/unit/policy_and_concurrency.test.ts` (Test Cases 4, 5, 6).
* **Test Result:** Passed.
* **Remaining Limitations:** PostgreSQL functions should be deployed to production Supabase.

---

### Finding 9: Fake Fallback Topic ID in HCS Audit Trail
* **Severity:** Medium (CVSS 5.3)
* **Original Problem:** `dashboard/lib/hedera/hcs.ts` fell back to a hardcoded dummy topic `'0.0.5449200'` if `HEDERA_HCS_TOPIC_ID` was not configured, falsely claiming immutable HCS publication.
* **Changed Files:**
  - `dashboard/lib/hedera/hcs.ts`
  - `dashboard/lib/hedera/mirrorNode.ts`
* **Fix Implemented:** Removed the dummy fallback topic ID. If `HEDERA_HCS_TOPIC_ID` is not set and cannot be created on testnet, the system fails closed. If HCS message submission fails after on-chain settlement, the payment record is preserved and marked `hcs_status: 'pending_retry'`.
* **Test Performed:** `test/unit/hcs_audit.test.ts` (Test Case 14).
* **Test Result:** Passed.
* **Remaining Limitations:** Valid HCS topic required for audit trail.

---

### Finding 10: Cross-Agent Data Leakage in MCP Tools
* **Severity:** Medium (CVSS 6.1)
* **Original Problem:** MCP tools `get_payment_status` and `get_payment_history` queried `agent_payments` without scoping by `ctx.agentId`. Any connected agent could query the payment status and history of any other agent.
* **Changed Files:**
  - `dashboard/lib/mcp/tools.ts`
* **Fix Implemented:** Scoped all payment queries strictly with `.eq('agent_id', ctx.agentId)`. If an agent queries a payment ID that belongs to another agent, the tool returns `found: false`.
* **Test Performed:** `test/unit/mcp_server.test.ts` (Test Case 17).
* **Test Result:** Passed.
* **Remaining Limitations:** None.

---

## Remediation Verification Matrix

| Vulnerability ID | Description | Remediation Status | Automated Test Case | Verification Result |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Unauthenticated `/api/agents` & header trust | Resolved | Case 1 | Verified (0 error) |
| **SEC-02** | Unverified wallet ownership & non-Hedera kind | Resolved | Case 2 | Verified (0 error) |
| **SEC-03** | Silent operator key substitution as wallet signer | Resolved | Case 10 | Verified (0 error) |
| **SEC-04** | Global active agent fallback in `/api/agents/chat` | Resolved | Case 1 | Verified (0 error) |
| **SEC-05** | Unauthenticated `/api/agents/revoke` endpoint | Resolved | Case 3 | Verified (0 error) |
| **SEC-06** | Silent operator execution on facilitator failure | Resolved | Case 12 | Verified (0 error) |
| **SEC-07** | Unsafe floating-point arithmetic & truncation | Resolved | Case 8 | Verified (0 error) |
| **SEC-08** | Non-atomic budget reservation race conditions | Resolved | Cases 4, 5, 6 | Verified (0 error) |
| **SEC-09** | Fake fallback HCS topic substitution | Resolved | Case 14 | Verified (0 error) |
| **SEC-10** | Cross-agent data exposure in MCP tool queries | Resolved | Cases 16, 17 | Verified (0 error) |

---
*Report certified by PaidX Security Engineering.*
