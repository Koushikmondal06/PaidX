# PaidX Architecture & Specification

## 1. Actors
1. **User (Payer)**: Retail customer holding a physical NFC card and a self-custodial MetaMask wallet on Ethereum Sepolia. Signs own transactions (account upgrade, card registration, ERC-7715 permission delegation) in MetaMask.
2. **Merchant**: Retail business with a verified settlement payout address accepting card taps via POS terminal (web or ESP32 hardware).
3. **Admin**: Protocol owner (`0xA2e3...69efa`) who approves merchants on-chain in `MerchantRegistry.sol` via MetaMask.
4. **Session Account (Server Relayer)**: Server-held testnet EOA (`0x08AC...0009`) initialized with `SESSION_ACCOUNT_PRIVATE_KEY`. Redeems granted user permissions at tap payment time; pays its own gas in Sepolia ETH.
5. **PaidX Backend (console.paidx.cc)**: Next.js API running on Vercel backed by Supabase (Postgres & Auth), orchestrating card lookups, hashing, permission validation, and relaying redemptions.

---

## 2. User Onboarding Flow
1. **Account Creation & Email Confirmation**: User registers on `console.paidx.cc/auth` with email and password. Receives token-hash email redirecting to `/auth/confirm` which server-verifies OTP and forwards to `/auth/confirmed`.
2. **MetaMask Wallet Connection**: User connects MetaMask on Ethereum Sepolia (`11155111`). Address saved in `public.wallets`.
3. **Smart Account Upgrade (EIP-7702)**: Account upgrade checked via `publicClient.getCode`. If not upgraded, batch call sent via MetaMask to delegate to MetaMask's official `EIP7702StatelessDeleGatorImpl`. Verified server-side.
4. **ERC-7715 Permission Grant**: User selects allowance and validity period (e.g. 25 USDC per 24 hours, valid 30 days). MetaMask signs scoped execution permission for PaidX session account. Saved in `public.permissions`.
5. **Card Registration**: User taps or inputs card UID. Server computes salted hash `keccak256(rawUid + salt)`. User signs `CardRegistry.registerCard(cardHash, userAddress)` in MetaMask with Sepolia ETH gas. Saved to `public.cards` with status 'active' only upon on-chain transaction receipt.

---

## 3. Merchant Onboarding Flow
1. **Signup & Profile Creation**: Merchant registers at `console.paidx.cc/auth` with role `merchant`.
2. **Business Details & Payout Address**: Merchant supplies business name, store slug, and verified settlement payout address (or connected MetaMask address). Recorded in `public.merchants` with status `pending`.
3. **Admin On-Chain Approval**: Protocol admin opens `/admin` in PaidX Console (gated by `profiles.role = 'admin'` AND connected MetaMask matching `MerchantRegistry.owner()`). Admin clicks "Approve", signing `MerchantRegistry.registerMerchant(merchantId, payoutAddress)` in MetaMask.
4. **Activation**: Upon on-chain transaction receipt, `merchants.status` transitions to `active` and stores `register_tx_hash`. Merchant can now accept payments on `/merchant/terminal`.

---

## 4. Tap-Payment Flow
1. POS terminal (ESP32 hardware or Web Virtual Terminal) scans NFC card UID and specifies USDC charge amount.
2. POS sends `POST https://console.paidx.cc/api/payments` with `rawCardUid`, `amount`, and `Idempotency-Key`.
3. Backend computes `cardHash = keccak256(rawUid + salt)` using server-only `CARD_UID_SALT`.
4. Backend verifies:
   - Merchant is active on-chain and in DB.
   - Card is active on-chain (`CardRegistry.verifyCardActive`) and in DB.
   - User has active, non-expired ERC-7715 permission with sufficient remaining period limit.
5. Session account (`SESSION_ACCOUNT_PRIVATE_KEY`) encodes and broadcasts delegation redemption transaction moving USDC directly from user account to merchant payout address.
6. Backend waits for on-chain receipt, updates `payments` record to `confirmed` with `tx_hash`, and returns `txHash` + `explorerUrl` to POS.

---

## 5. Key Custody Table

| Key | Where Stored | What It Can Do | Risk | Testnet Only? |
|---|---|---|---|---|
| User Private Key | User's MetaMask wallet | Full control of user funds and signing permissions | Low (Never leaves user's MetaMask extension/app) | No (standard Web3) |
| Admin Private Key | Admin's MetaMask wallet | Call `registerMerchant`, pause registry, transfer ownership | Low (Never leaves admin's MetaMask extension) | No (standard Web3) |
| Deployer Private Key (`DEPLOYER_PRIVATE_KEY`) | Local Foundry environment / CLI only | Deploy contracts via Foundry scripts | Minimal (Not in deployed apps or runtime env) | Yes |
| Session Account Private Key (`SESSION_ACCOUNT_PRIVATE_KEY`) | Server-only environment variable (`console.paidx.cc`) | Submit redeemed ERC-7715 user delegations | Medium (Can spend gas; can only transfer within user-signed permission limits) | Yes |
| Supabase Secret Key (`SUPABASE_SECRET_KEY`) | Server-only environment variable (`console.paidx.cc`) | Full administrative access to Supabase Postgres database | High (Must never be exposed to browser or client bundle) | Yes |
| Supabase Publishable Key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | Client & Server environment variable | Authenticate client-side Supabase queries respecting RLS | Low (Restricted by Row Level Security) | Yes |

---

## 6. Gas Table

| Action | Who Signs | Who Pays Gas | Currency |
|---|---|---|---|
| Contract Deployment (`Deploy.s.sol`) | Deployer | Deployer | Sepolia ETH |
| Account Upgrade to Smart Account (EIP-7702) | User (MetaMask) | User | Sepolia ETH |
| Card Registration (`registerCard`) | User (MetaMask) | User | Sepolia ETH |
| Card Status Update (Freeze/Revoke) | User (MetaMask) | User | Sepolia ETH |
| Merchant Registration (`registerMerchant`) | Admin (MetaMask) | Admin | Sepolia ETH |
| Merchant Payout Update (`updatePayoutAddress`) | Merchant/Admin (MetaMask) | Merchant/Admin | Sepolia ETH |
| Permission Delegation (ERC-7715) | User (MetaMask) | Off-chain signature (No gas) | N/A |
| Tap-Payment Redemption | Session Account | Session Account | Sepolia ETH |
| USDC Transfer via Delegation | Delegated User Account | Session Account (submits tx) | Session Account pays ETH gas; User balance decreases by USDC amount |

---

## 7. Gaps Against Target Model

| Target Model Requirement | Current State | Status |
|---|---|---|
| User keys exist only in MetaMask; PaidX never sees them | User keys reside exclusively in MetaMask | MATCHES |
| Admin signs via MetaMask in browser; no server admin key | Live contracts deployed by admin MetaMask; admin approval UI missing | GAP |
| /admin page visible only if `role = 'admin'` AND connected address == `owner()` | No /admin page implemented | GAP |
| Session account is only server-held key; redeems permissions | Implemented via `SESSION_ACCOUNT_PRIVATE_KEY` EOA | MATCHES |
| Payments move USDC directly user -> merchant; PaidX never holds funds | Implemented in `paymentExecutor.ts` | MATCHES |
| Users pay gas for on-chain `registerCard` via MetaMask | Currently skips on-chain call and writes directly to DB | GAP |
| Merchants registered on-chain via `MerchantRegistry.registerMerchant` | Currently registers directly to DB without on-chain approval | GAP |
| Email confirmation token-hash flow without localhost redirects | Currently hits email rate limits and legacy redirects | GAP |
| Console wallet page with real testnet balances, send form, and EIP-747 USDC | Missing dedicated wallet management view | GAP |
| Strict bigint money math (no floats) | Terminal used float `Math.round(parseFloat * 1_000_000)` | GAP |
| EIP-7702 upgrade detection and batch upgrade trigger | Checked bytecode generically, missing official delegation address comparison | GAP |

