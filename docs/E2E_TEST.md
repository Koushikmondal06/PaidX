# PaidX Sepolia Testnet End-to-End Verification Guide

This guide walks through the complete end-to-end user and merchant lifecycle on Ethereum Sepolia testnet.

---

## 1. Prerequisites & Funding
1. **Admin / Deployer Account (`0xA2e3A301159beA4429c56417aB0856a3f4569efa`)**:
   - Holds protocol ownership of `CardRegistry` (`0x7cBD8DE77C16Ba79A1fe10E30913517845D68e51`) and `MerchantRegistry` (`0xb11dAE79F1B187E95CB93655A983D6e86E574145`).
   - Funded with Sepolia ETH (`0.029+ ETH` verified on-chain).
2. **Session Relayer Account (`0x08AC38a8655a8Cb9841582CEa092df0F65fF0009`)**:
   - Server-only EOA from `SESSION_ACCOUNT_PRIVATE_KEY`.
   - Send `0.005 Sepolia ETH` from admin or faucet to pay redemption gas.
3. **Test Customer Wallet**:
   - Import test account into MetaMask extension or mobile.
   - Claim Sepolia ETH from [Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) or [Alchemy Faucet](https://sepoliafaucet.com/).
   - Claim 10 Sepolia USDC from [Circle Web3 Faucet](https://faucet.circle.com/) (token `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`).

---

## 2. Merchant Onboarding & Admin Approval
1. **Merchant Sign Up**:
   - Navigate to `https://console.paidx.cc/auth` (or `http://localhost:3000/auth`).
   - Select **Sign Up**, choose role **Retail Merchant**.
   - Enter store name (e.g. "Apex Retail"), store slug (`apex-retail`), and settlement payout address `0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6`.
   - Merchant record is created with `status: 'pending'`.
2. **Admin On-Chain Approval**:
   - Admin connects MetaMask with `0xA2e3A301159beA4429c56417aB0856a3f4569efa`.
   - Navigate to `https://console.paidx.cc/admin`.
   - The page queries `MerchantRegistry.owner()` on-chain to verify administrative rights.
   - Click **Approve On-Chain** next to Apex Retail.
   - MetaMask prompts transaction signing `registerMerchant(keccak256(merchantId), payoutAddress)`.
   - Once the on-chain receipt confirms (1 confirmation), status updates to **Active** with a clickable Sepolia Etherscan transaction link.

---

## 3. Customer Sign-Up & Cross-Device Email Confirmation
1. **Account Registration**:
   - Customer opens `https://console.paidx.cc/auth` on desktop or laptop.
   - Registers with email and password.
   - Receives confirmation email generated from `supabase/templates/confirm.html`.
2. **Cross-Device Confirmation**:
   - User opens the email on their mobile phone and clicks **"Confirm Email Address"**.
   - Link navigates to `https://console.paidx.cc/auth/confirm?token_hash=...&type=email`.
   - Server route verifies OTP token hash and redirects to public landing page `https://console.paidx.cc/auth/confirmed`.
   - Page displays a verified check badge, confirmation message, and "Open PaidX Console" button.

---

## 4. Wallet Connection & Smart Account Upgrade (EIP-7702)
1. **Connect MetaMask**:
   - Open `/onboarding`.
   - Step 2 prompts connecting MetaMask on Ethereum Sepolia (Chain ID `11155111`).
   - Server route `/api/wallets/save` runs authoritative bytecode inspection and saves wallet record.
2. **EIP-7702 Upgrade**:
   - Step 3 checks if account bytecode starts with `0xef0100` pointing to MetaMask's official StatelessDeleGator (`0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B`).
   - Click **Upgrade to Smart Account**: sends atomic batch via `wallet_sendCalls`.
   - MetaMask displays the account upgrade prompt.
   - Upon confirmation, account bytecode transitions to smart account.

---

## 5. Permission Grant & Card Registration
1. **ERC-7715 Permission Delegation**:
   - Step 4 offers presets ($10, $25, $50, $100) or custom daily limit, and 7/30/90 days expiry.
   - User reviews plain-language summary: *"PaidX can spend up to $25.00 USDC per day until [Date]. You can revoke anytime."*
   - Permission is stored in `public.permissions`.
2. **NFC Card Registration**:
   - Step 5 inputs physical NFC card UID (e.g. `04:A2:B3:C4:D5:E6:F7`).
   - Server computes salted hash with `CARD_UID_SALT` (raw UID never stored).
   - User signs `CardRegistry.registerCard(cardHash, userAddress)` in MetaMask.
   - Transaction confirms on Sepolia. Card status becomes **Active** in `public.cards`.

---

## 6. Console Wallet Balances & Transfer Test
1. **Balances View**:
   - Open `/dashboard/wallet`.
   - View real-time balances: Sepolia native ETH and Circle USDC (`0x1c7D...7238`).
   - Click **"Add USDC to MetaMask"** to trigger EIP-747 `wallet_watchAsset`.
2. **Transfer Test**:
   - Select currency (USDC or ETH).
   - Enter recipient and amount (or click **Max**).
   - Click **Review Transfer** &rarr; Confirm in MetaMask.
   - Watch status transition: *Prompting &rarr; Submitted &rarr; Confirming &rarr; Confirmed on Sepolia*.
   - View receipt on Sepolia Etherscan; balances auto-refresh upon block confirmation.

---

## 7. Tap Payment Execution & Settlement
1. **Virtual Terminal Charge**:
   - Merchant opens `/merchant/terminal`.
   - Enters charge amount (e.g. `2.50` USDC) and card UID.
   - Terminal POSTs to `/api/payments` with `Idempotency-Key`.
2. **Redemption & Direct Settlement**:
   - Server verifies active merchant, active on-chain card, and active non-expired permission.
   - Session account (`SESSION_ACCOUNT_PRIVATE_KEY`) broadcasts delegation redemption moving `2.50` USDC directly from customer's account to merchant payout address `0x7B52...94F6`.
   - Receipt confirms on-chain. Terminal shows **Confirmed** with transaction hash and explorer link.
   - Customer overview (`/dashboard`) and merchant overview (`/merchant`) display real transaction rows from `public.payments`.

