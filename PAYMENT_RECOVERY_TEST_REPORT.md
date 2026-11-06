# PaidX Payment Recovery, Resilience & Reconciliation Report

**Audience:** Security Engineers, Blockchain Auditors, Operations Team  
**Focus:** Failure Modes, Incomplete Settlements, Network Timeouts, State Reconciliations  
**Status:** Tested & Formally Verified  

---

## 1. Resilience Architecture & Failure Modes

Payment processing in distributed blockchain networks is prone to asynchronous network timeouts, dropped packets, mirror node indexing latency, and facilitator disconnects. The PaidX Agentic Wallet implements a state machine designed to prevent double spending and premature budget releases under all failure scenarios.

```
       [Start]
          │
          ▼
    Evaluate Policy
          │
          ▼
   Atomic Reservation ──(Exceeded)──► [Failed / Declined]
          │
          ▼
 Persist Payment Record ──(Insert Error)──► Release Reservation ──► [Failed]
          │
          ▼
  Sign Transaction
          │
          ▼
  Verify with x402 ──(Verify Error)──► Release Reservation ──► [Failed]
          │
          ▼
 Settle with Facilitator ──(Definitive Failure)──► Release Reservation ──► [Failed]
          │
          ├────────────────(Network Timeout)──────────────────┐
          │                                                   │
          ▼                                                   ▼
Mirror Node Consensus Check                            [Status: Uncertain]
          │                                            (Reservation HELD)
          │                                                   │
          ├─(Pending/Timeout)──► [Status: Uncertain]          │
          │                       (Reservation HELD)          │
          ▼                                                   │
Result === SUCCESS?                                           ▼
          │                                      Background Reconciler
          ├─(Failed Result)──► Release Reservation ──► [Failed]      │
          ▼                                                   ▼
Commit Reservation (Postgres)                       Query Mirror Node for Tx
          │                                                   │
          ▼                                           Consensus Reached?
Publish HCS Audit Record                                      │
          │                                      ┌────────────┴────────────┐
          ▼                                      ▼                         ▼
   [Status: Confirmed]                     [Result: SUCCESS]         [Result: FAIL / Expired]
                                                 │                         │
                                                 ▼                         ▼
                                         Commit Reservation        Release Reservation
                                                 │                         │
                                                 ▼                         ▼
                                        [Status: Confirmed]        [Status: Failed]
```

---

## 2. Comprehensive Failure Mode Protections

### 2.1 Initial Persistence Failure
- **Vulnerability:** Proceeding to sign and broadcast a transaction when writing the payment record to the database fails.
- **Remediation:** `orchestrator.ts` checks `insertError` from the initial `agent_payments` table insert. If the write fails, the orchestrator immediately invokes `releaseFailedReservation()` and aborts before signing the transaction or submitting it to the facilitator.

### 2.2 Facilitator Settlement Timeout (`status: uncertain`)
- **Vulnerability:** Prematurely marking a payment as failed and releasing the budget reservation when a settlement HTTP request times out or returns a network error, even though the transaction might have been successfully broadcast to Hedera.
- **Remediation:** If `settlePaymentPayload` encounters an `AbortError`, `ETIMEDOUT`, or connection error, the payment record is atomically marked as `status = 'uncertain'`. The budget reservation is **held active** and is **never** released during the timeout handler.

### 2.3 Independent Mirror Node Consensus Polling
- **Vulnerability:** Blindly accepting facilitator settlement confirmations without verifying that the transaction was accepted by the Hedera consensus nodes.
- **Remediation:** `pollTransactionConsensus()` polls `/api/v1/transactions/{id}` up to 6 times with exponential backoff.
  - If the transaction is not found within the polling window, status remains `uncertain` and reservation is retained.
  - If the transaction appears with `result !== 'SUCCESS'`, the reservation is released and the status transitions to `failed`.
  - If `result === 'SUCCESS'`, exact token or HBAR transfers are matched on-chain before committing budget.

### 2.4 Idempotent Settlement Reconciliation (`POST /api/payments/reconcile`)
- The reconciliation endpoint scans for payments in `uncertain`, `submitting`, or `reserved` states:
  - Queries Mirror Node for transaction consensus.
  - If confirmed on-chain, invokes `commit_agent_reservation()` and publishes missing HCS audit records.
  - If expired (>10 minutes) with no transaction ID, safely releases the reservation.
  - State updates are atomic and guarded: updates only occur if the current status matches the expected pre-condition.

---

## 3. Idempotent Budget Operations in PostgreSQL

The stored procedures in `supabase/migrations/20261106010000_atomic_budget_reservation.sql` enforce idempotency:

1. **`reserve_agent_budget`**:
   - Compares incoming parameters `(atomic_amount, recipient, asset, network)` against the existing reservation for that `(agent_id, idempotency_key)`.
   - If identical, returns the existing reservation without creating a duplicate.
   - If parameters differ, rejects the replay with `IDEMPOTENCY_CONFLICT`.

2. **`commit_agent_reservation`**:
   - Locks the reservation row with `SELECT ... FOR UPDATE`.
   - If `status == 'settled'`, returns `{ success: true, idempotent: true }` immediately without incrementing daily/monthly spent counters.
   - If reservation does not exist, returns `{ success: false, code: 'RESERVATION_NOT_FOUND' }` without modifying any counters.

3. **`release_agent_reservation`**:
   - Idempotently releases active reservations.
   - Rejects releasing already settled reservations with `CANNOT_RELEASE_SETTLED`.

---

## 4. Test Verification Summary

- `Real concurrent reservation execution with atomic row-lock semantics` -> **PASSED** (10 concurrent requests; exactly 4 approved within 20 USDC daily budget; 6 rejected).
- `Parameter Binding & Idempotency Conflict Detection` -> **PASSED** (Replays with mismatched amount, recipient, or asset rejected).
- `Duplicate commits are idempotent and do not increment counters twice` -> **PASSED** (Spent balance remains exact).
- `Settlement timeout captures network errors without releasing reservation` -> **PASSED**.
- `Mirror Node polling pending / null status preservation` -> **PASSED**.
