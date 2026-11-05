# PaidX Testnet Smoke Test Guide (Ethereum Sepolia - Chain ID 11155111)

This guide documents the end-to-end smoke test procedure to verify the PaidX non-custodial crypto POS payment system on Ethereum Sepolia testnet.

---

## 1. Prerequisites & Environment Setup

### 1.1 Accounts & Faucets
- **Payer MetaMask Wallet**: Needs testnet Sepolia ETH (for gas) and Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`).
  - Get Sepolia ETH from [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/).
  - Get Sepolia USDC from [Circle Testnet Faucet](https://faucet.circle.com/).
- **Backend Session Signer Account**: Needs a testnet private key set in `SESSION_ACCOUNT_PRIVATE_KEY`.

### 1.2 Environment Variables
Ensure `.env.local` inside `dashboard/` contains:
```env
NEXT_PUBLIC_APP_ENV=testnet
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
RPC_URL_SERVER=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>
NEXT_PUBLIC_EXPLORER_URL=https://sepolia.etherscan.io
NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238

NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...

CARD_UID_SALT=<32-byte-hex-random-salt>
SESSION_ACCOUNT_PRIVATE_KEY=<0x-testnet-private-key>

NEXT_PUBLIC_CARD_REGISTRY_ADDRESS=<deployed-card-registry-address>
NEXT_PUBLIC_MERCHANT_REGISTRY_ADDRESS=<deployed-merchant-registry-address>
```

---

## 2. Smart Contract Deployment

Deploy the CardRegistry and MerchantRegistry contracts to Ethereum Sepolia using Foundry:

```bash
forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL_SERVER" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY"
```

Copy the deployed contract addresses into `NEXT_PUBLIC_CARD_REGISTRY_ADDRESS` and `NEXT_PUBLIC_MERCHANT_REGISTRY_ADDRESS`.

---

## 3. End-to-End Verification Procedure

### Test 1: Real Auth (Supabase Auth)
1. Navigate to `/auth`.
2. Toggle to **Create Account**.
3. Register using email and password (minimum 8 characters).
4. Verify record appears in `auth.users` and is automatically propagated to `public.profiles` via database trigger.
5. Sign out via the navigation bar and sign back in to verify session restoration.

### Test 2: Wallet Connection & Smart Account Detection
1. Complete registration or navigate to `/onboarding`.
2. Click **Connect MetaMask & Verify**.
3. Approve connection in the MetaMask browser extension.
4. Verify the system inspects bytecode on Sepolia:
   - If contract code is found, badges as **Smart Account Deployed**.
   - If no bytecode, badges as **Standard EOA**.
5. Verify the wallet record is created in `public.wallets` with `chain_id = 11155111` and `address = lower(...)`.

### Test 3: ERC-7715 Periodic Spending Permission
1. Select role **Payer**.
2. Configure **Limit (USDC)** (e.g. `100` USDC) and **Validity (Days)** (e.g. `30` days).
3. Click **Save Profile & Launch Console**.
4. Check `public.permissions` in Supabase:
   - `status` is `'active'`.
   - `token_address` is `0x1c7d4b196cb0c7b01d743fbc6116a902379c7238`.
   - `limit_per_period` is `100000000` (100 USDC in 6 decimal units).
   - `remaining_in_period` is `100000000`.

### Test 4: Physical NFC Card Registration
1. Navigate to `/dashboard/cards`.
2. Click **Link New NFC Card**.
3. Enter NFC tag UID (e.g. `04:A2:B3:C4:D5:E6:F7`).
4. Click **Register Card**.
5. Verify in `public.cards`:
   - `uid_hash` is a `0x` 32-byte hash computed via `keccak256(normalizedUid + CARD_UID_SALT)`.
   - The raw UID `04:A2:B3:C4:D5:E6:F7` is **never** stored anywhere in the database.
   - `status` is `'active'`.

### Test 5: Card Freeze & Revoke
1. In `/dashboard/cards`, click **Freeze Card**.
2. Confirm status transitions to `'frozen'` in the UI and database.
3. Click **Unfreeze Card** and verify status returns to `'active'`.
4. Click **Revoke Delegation** and confirm modal. Verify `permissions.status` updates to `'revoked'`.

### Test 6: Merchant POS Checkout & Settlement
1. Sign in as a user with role **Merchant** (or navigate to `/merchant/terminal`).
2. Enter charge amount: `$4.50 USDC`.
3. Click **Open Terminal For Customer**.
4. Input the registered physical NFC card UID in the customer screen.
5. Click **Execute Contactless Tap**.
6. The terminal dispatches `POST /api/payments` with an `Idempotency-Key` header:
   - Resolves card by `uid_hash`.
   - Validates active status and remaining period balance.
   - Creates payment record (`status: 'created'`).
   - Submits delegation redemption to Sepolia via the backend session account (`status: 'submitted'`).
   - Waits for authoritative on-chain transaction receipt (`status: 'confirmed'`).
   - Deducts `$4.50` from `permissions.remaining_in_period`.
7. Click the **Receipt** link on the terminal screen to verify the transaction on [Sepolia Etherscan](https://sepolia.etherscan.io).

### Test 7: Limit Rejection & Idempotency
1. Attempt a transaction exceeding the remaining period limit.
2. Verify API returns status `422` with error code `LIMIT_EXCEEDED`.
3. Re-send a request with an existing `Idempotency-Key`. Verify the endpoint returns the existing payment record without creating duplicate on-chain transactions.

### Test 8: Indexer Worker Execution
1. Trigger the indexer worker:
   ```bash
   curl -X POST http://localhost:3000/api/indexer/run
   ```
2. Verify response confirms `cursorAdvanced: true` and `indexer_cursors.last_block` is advanced.
3. Verify processed events are recorded in `public.chain_events` with unique constraint enforcement on `(chain_id, tx_hash, log_index)`.

