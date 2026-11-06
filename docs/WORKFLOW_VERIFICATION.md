# PaidX End-to-End Workflow Verification Guide

> **Branch**: `fix/playtest-p0`  
> **Network**: Ethereum Sepolia (`11155111`)  
> **Target USDC**: Circle Sepolia Native USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`)  
> **Merchant Payout Address**: `0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6`  
> **CardRegistry Contract**: `0x7cBD8DE77C16Ba79A1fe10E30913517845D68e51`  
> **MerchantRegistry Contract**: `0xb11dAE79F1B187E95CB93655A983D6e86E574145`  
> **Backend Session Relayer**: `0x08AC38a8655a8Cb9841582CEa092df0F65fF0009`  
> **POS Device**: Terminal `#001` (PSK: `psk_d6187915992b28f7acaf227169a211072b92a0d2b1989168`)  

---

## 1. Prerequisites (30 Seconds)

1. **User MetaMask**:
   - Address: `0xA2e3A301159beA4429c56417aB0856a3f4569efa`
   - Verified Balance: `0.02948 ETH`, `20.00 USDC`
2. **Session Relayer Gas**:
   - The relayer submits the on-chain settlement transactions for card taps.
   - Go to `https://console.paidx.cc/dashboard/wallet`.
   - Under **POS Tap Settlement Relayer**, click **"Fund Relayer (0.005 ETH)"** and confirm in MetaMask. (This gives the relayer gas for 20+ retail settlement transactions).

---

## 2. Step 1: Issue a Card

1. Navigate to `https://console.paidx.cc/dashboard/cards`.
2. Click the blue **"Issue a Card"** button.
3. Enter the physical NFC card's UID (e.g. `04:A2:B3:C4:D5:E6:F7`).
4. Click **"Issue a Card"**:
   - Step 1: Backend prepares the salted `cardHash = keccak256(rawUid + salt)`.
   - Step 2: MetaMask opens asking you to sign `CardRegistry.registerCard(cardHash, userAddress)`.
   - Step 3: Wait for 1 on-chain confirmation on Sepolia.
   - Step 4: Card is saved to `public.cards` with status `active`.
5. The card now appears in your dashboard under **Registered Physical Cards** with a green **ACTIVE** badge.

---

## 3. Step 2: Ensure Active Spending Permission

1. In Onboarding Step 4 or `/dashboard/cards`:
   - Set a daily allowance (e.g. `$10 USDC`).
   - Click **"Sign Allowance & Continue"**.
   - MetaMask prompts you for on-chain `USDC.approve(sessionRelayer, 10_000_000)`.
   - Confirm in MetaMask.

---

## 4. Step 3: Tap NFC Card on ESP32 Terminal

1. Power on the ESP32 terminal (`esp/esp.ino`).
2. Enter an amount on the keypad (e.g. `1.50` USDC).
3. Tap the physical NFC card against the PN532 reader.
4. The terminal executes `POST https://console.paidx.cc/api/payments`:
   - Header: `X-Merchant-Id: #001`
   - Header: `Authorization: Bearer psk_...`
   - Body: `rawCardUid`, `amount`, `idempotencyKey`
5. The backend:
   - Resolves merchant `#001` from `public.merchants` &rarr; destination `0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6`.
   - Computes `cardHash` and verifies active card ownership.
   - Checks available daily limit and records payment in `public.payments`.
   - Relayer broadcasts `USDC.transferFrom(userWallet, merchantPayoutAddress, amount)` on Sepolia.
   - Waits for authoritative transaction receipt.
   - Marks payment as `confirmed`.
6. Terminal screen displays:
   - **"SETTLED ON SEPOLIA"** with real `txHash`.
   - Shows QR code linking directly to `https://sepolia.etherscan.io/tx/<txHash>`.

---

## 5. Step 4: Verification on Etherscan & Database

1. Open `https://sepolia.etherscan.io/address/0x7B52dcb074EF9C189BDFb0c19bE7094C277a94F6#tokentxns`.
2. You will see an incoming `Transfer` of USDC from your user wallet (`0xA2e3...69efa`) to merchant (`0x7B52...94F6`).
3. Check `public.payments` in Supabase:
   - `status`: `confirmed`
   - `tx_hash`: matches Etherscan
   - `merchant_id`: matches merchant `#001`

