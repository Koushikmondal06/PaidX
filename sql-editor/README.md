# PaidX Supabase SQL Editor Scripts

This directory contains standalone, copy-pasteable SQL scripts for your **[Supabase Dashboard SQL Editor](https://supabase.com/dashboard/project/_/sql)**.

---

### Recommended: Run 1-Click Master Script

Open and execute **`00_master_all.sql`** (or `../supabase/RUN_IN_SUPABASE_SQL_EDITOR.sql`). It applies all tables, columns, indexes, RLS policies, and hardware terminal seed data in one go and is 100% idempotent.

---

### Individual Step-by-Step Scripts

If you prefer to run migrations individually:

1. **`01_permissions.sql`**
   - Resolves: `Could not find the 'current_period_start' column of 'permissions' in the schema cache`
   - Adds rolling spending allowance columns (`limit_per_period`, `remaining_in_period`, `current_period_start`, `valid_after`, `valid_until`)
   - Adds auto-sync triggers between legacy and modern permission formats.

2. **`02_cards.sql`**
   - Supports: Step 5 ("Issue a Card")
   - Drops `NOT NULL` on `wallet_id` and adds `registration_tx_hash`, `register_tx_hash`, and `registered_at_block`.

3. **`03_pos_devices.sql`**
   - Supports: Hardware POS Terminal `#001`
   - Creates the `pos_devices` table and seeds Terminal `#001` with SHA-256 hash for PSK token `psk_d6187915992b28f7acaf227169a211072b92a0d2b1989168`.

4. **`04_merchants.sql`**
   - Supports: Retail merchant payouts
   - Seeds `Apex Retail` (`#001`) with payout address `0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6` and sets status to `active`.

5. **`05_payments.sql`**
   - Supports: On-chain transaction receipts and Etherscan linking
   - Adds `confirmed_at`, `user_op_hash`, and `failure_reason` to `payments`.

6. **`06_waitlist.sql`**
   - Supports: Landing page waitlist subscriber registration and dynamic counter
   - Creates `waitlist_subscribers` table with unique email constraint and RLS
   - Adds `get_waitlist_count()` security-definer function for privacy-safe aggregate counting.

