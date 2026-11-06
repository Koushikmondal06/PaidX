# PaidX Database Migration & Schema Report

**Database:** Supabase PostgreSQL  
**Migration Path:** `supabase/migrations/`  
**Current Active Migrations:** 3 migrations  
**Integration Status:** Fully Validated & TypeScript Synchronized (`dashboard/lib/supabase/types.ts`)  

---

## 1. Migration Inventory & Evolution

The PaidX database architecture consists of three sequential migrations:

```
20261105210900_init.sql
  │   (Base Sepolia Core: profiles, merchants, wallets, cards, permissions, payments)
  ▼
20261106000000_agent_wallet_hedera.sql
  │   (Hedera Agentic Extension: agent_connections, agent_policies, spending_reservations, agent_payments, hcs_audit_events)
  ▼
20261106010000_atomic_budget_reservation.sql
      (Critical Remediation: row locks, stored procedures, scoped idempotency, hcs_status, uncertain states)
```

---

## 2. Detailed Migration Breakdown

### Migration 1: `20261105210900_init.sql` (Preserved Core)
- **Tables Created:** `profiles`, `merchants`, `wallets`, `cards`, `payment_permissions`, `payments`.
- **Purpose:** Manages user authentication identities, merchant POS configuration, Ethereum Sepolia smart accounts, and Base Sepolia ERC-7715 session permissions.
- **Preservation Assurance:** Completely intact and untouched. Existing POS, NFC card hashes, and merchant terminal flows remain fully backward-compatible.

---

### Migration 2: `20261106000000_agent_wallet_hedera.sql` (Agentic Subsystem)
- **Constraint Modification:**
  ```sql
  ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_kind_check;
  ALTER TABLE public.wallets ADD CONSTRAINT wallets_kind_check 
    CHECK (kind IN ('eoa', 'metamask_smart_account', 'hedera'));
  ```
- **Tables Created:**
  - `agent_connections`: Stores AI agents linked to a user's Hedera wallet. Includes `api_key_hash` (SHA-256) and `api_key_prefix`.
  - `agent_policies`: Per-agent spending constraints (`max_amount_per_tx`, `daily_budget`, `monthly_budget`, `spent_today`, `spent_this_month`, `allowed_networks`, `allowed_assets`, `allowed_recipients`).
  - `agent_spending_reservations`: Short-lived locks (`expires_at: +10min`) preventing concurrent spending race conditions.
  - `agent_payments`: Ledger of conversational transactions, tracking `amount_atomic`, `amount_display`, `tx_id`, `hashscan_url`, `hcs_topic_id`, and `hcs_sequence_number`.
  - `hcs_audit_events`: Mirrors messages written to the Hedera Consensus Service topic.
- **Row-Level Security (RLS):**
  - Revokes all permissions from the `anon` public role.
  - Grants access to `authenticated` users where `user_id = (SELECT auth.uid())`.

---

### Migration 3: `20261106010000_atomic_budget_reservation.sql` (Critical Security Remediation)
- **Schema Hardening:**
  1. Extended `agent_payments.status` check constraint to support the full state machine:
     ```sql
     CHECK (status IN (
       'pending', 'reserved', 'signing', 'submitting', 'submitted',
       'confirmed', 'failed', 'declined', 'uncertain', 'approval_required'
     ));
     ```
  2. Added column `hcs_status`:
     ```sql
     ALTER TABLE public.agent_payments
       ADD COLUMN IF NOT EXISTS hcs_status TEXT NOT NULL DEFAULT 'pending'
       CHECK (hcs_status IN ('pending', 'published', 'pending_retry', 'failed'));
     ```
  3. Added composite unique indexes for scoped idempotency per agent:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_spending_reservations_agent_idemp
       ON public.agent_spending_reservations(agent_id, idempotency_key);

     CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_payments_agent_idemp
       ON public.agent_payments(agent_id, idempotency_key);
     ```
  4. Added `release_reason` column to `agent_spending_reservations`.

- **Atomic Stored Procedures:**
  - **`reserve_agent_budget(...)`:**
    Locks `agent_policies` row using `FOR UPDATE`. Performs daily/monthly rollover checks, aggregates active unexpired reservations, enforces per-tx and budget caps, creates a reservation row, and returns a JSON payload with `reservation_id` and remaining allowance.
  - **`commit_agent_reservation(...)`:**
    Atomically updates the reservation to `settled` and increments `spent_today` and `spent_this_month` on `agent_policies`.
  - **`release_agent_reservation(...)`:**
    Releases a reservation (`status = 'released'`) only if it is currently in `reserved` status.

---

## 3. RLS and Server-Side Security Architecture

The server-side Supabase client (`dashboard/lib/supabase/server.ts`) utilizes the authoritative secret key (`sb_secret_...`) which bypasses Postgres RLS to execute ledger mutations.

To maintain strict zero-trust boundaries:
1. **Application-Level Scoping:** Every server-side query and mutation explicitly enforces `user_id = user.id` (derived from the Supabase Auth session) and `agent_id = ctx.agentId`.
2. **Double Verification:** Wallet linking explicitly verifies wallet ownership prior to insertion.
3. **Defense in Depth:** Direct client-side queries (if initiated via browser client) are bounded by RLS policies using `auth.uid()`.

---

## 4. Migration Execution Verification

Both migrations compile cleanly and their schemas are synchronized with `dashboard/lib/supabase/types.ts`. All TypeScript types pass typechecking (`npm run typecheck` returned 0 errors).

---
*Report certified by PaidX Database & Infrastructure Engineering.*
