# PaidX RPC Audit & Resilient Transport Fix

This document tracks the audit, architecture, and manual verification procedure for resolving Ethereum Sepolia RPC rate-limiting, wallet connect timeouts (`eth_getCode`), and multi-provider fallback.

---

## 1. Audit: Identified RPC & Transport Usages

Before remediation, the following files contained references to the public fallback `https://rpc.sepolia.org`, bare or unconfigured `http()` transports, or ad-hoc client initializations:

| File | Line(s) | Mechanism / Usage | Root Cause / Risk |
|---|---|---|---|
| `dashboard/app/onboarding/page.tsx` | 101 | `transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.sepolia.org')` | During `eth_getCode` check on wallet connect. Falls back to public rate-limited RPC, causing timeouts (HTTP 429/timeout). |
| `dashboard/app/dashboard/page.tsx` | 74 | `transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.sepolia.org')` | During balance and token queries. Fell back to public RPC without retry or timeout configs. |
| `dashboard/lib/server/indexer.ts` | 38 | `transport: http(rpcUrl)` | In backend server. Bare `http(rpcUrl)` without timeout, retryCount, retryDelay, or secondary fallback transport. |
| `dashboard/lib/server/paymentExecutor.ts` | 63, 69 | `transport: http(rpcUrl)` (PublicClient and WalletClient) | In backend server during UserOp / delegation redemption. Lacked timeout and retry configurations. |
| `dashboard/lib/base.ts` | 8 | `export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.sepolia.org';` | Unsafe fallback constant silently defaulting to public Sepolia RPC. |
| `dashboard/lib/chain.ts` | 13 | `http: ['https://rpc.sepolia.org']` | Static default RPC URL array in chain definition. |

---

## 2. Shared Transport Architecture (`dashboard/lib/chain.ts`)

All transports and clients are now unified in `dashboard/lib/chain.ts`:

1. **Browser Transport (`getBrowserTransport`)**:
   - Primary: `http(process.env.NEXT_PUBLIC_RPC_URL, { timeout: 15_000, retryCount: 3, retryDelay: 300 })`.
   - Fallback: `fallback([primary, secondary])` if `NEXT_PUBLIC_RPC_URL_FALLBACK` or `RPC_URL_FALLBACK` is provided.
   - Guard: Throws `[RPC Configuration Error] NEXT_PUBLIC_RPC_URL is empty` if no client endpoint is provided, completely preventing silent public RPC usage.
2. **Server Transport (`getServerTransport`)**:
   - Primary: `http(process.env.RPC_URL_SERVER || process.env.NEXT_PUBLIC_RPC_URL, { timeout: 15_000, retryCount: 3, retryDelay: 300 })`.
   - Fallback: `fallback([primary, secondary])` if `RPC_URL_FALLBACK` is set.
   - Guard: Throws `[RPC Configuration Error] RPC_URL_SERVER and NEXT_PUBLIC_RPC_URL are empty` if unconfigured.
3. **Chain ID Verification**:
   - Compares `sepolia.id === CHAIN_ID` (`11155111`); throws immediately if mismatched.

---

## 3. Resilient Wallet Connection & Chain Enforcement

In `dashboard/app/onboarding/page.tsx`:
1. **Network Switching**:
   - Immediately checks `window.ethereum.request({ method: 'eth_chainId' })`.
   - If not `11155111` (`0xaa36a7`), requests `wallet_switchEthereumChain` (and `wallet_addEthereumChain` if chain 4902 unadded) before executing any read or write calls.
2. **Non-Blocking Bytecode Verification**:
   - `eth_getCode` call is wrapped in a dedicated `checkBytecodeStatus(address)` helper.
   - On RPC failure or timeout:
     - Sets account status to `'unknown'` instead of crashing or misclassifying.
     - Displays a non-blocking warning banner: `"Couldn't check your account on the network. Retry"` with an interactive `Retry` button.
     - Never halts the user from continuing to profile and role configuration.

---

## 4. Manual Verification Tests

### Test 1: Connect MetaMask on Sepolia (Happy Path)
1. In `dashboard/.env.local`, set `NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>`.
2. Start the dev server (`npm run dev`) and navigate to `http://localhost:3000/onboarding`.
3. Click **Connect MetaMask & Verify**.
4. Confirm connection in MetaMask.
5. **Expected Result**: Connection succeeds instantly without timeout. The app reads bytecode within milliseconds via Alchemy and accurately displays `Standard EOA` or `Smart Account Deployed`.

### Test 2: Missing RPC URL Configuration Error Guard
1. In `dashboard/.env.local`, temporarily leave `NEXT_PUBLIC_RPC_URL=` empty.
2. Restart or reload the app and attempt to connect wallet or check balance.
3. **Expected Result**: The app immediately throws `[RPC Configuration Error] NEXT_PUBLIC_RPC_URL is empty. Please configure your Alchemy Sepolia RPC URL in .env.local.` instead of falling back to `rpc.sepolia.org`.

### Test 3: Network Switching Enforcement
1. Switch MetaMask network to Ethereum Mainnet or Base.
2. Click **Connect MetaMask & Verify** on `/onboarding`.
3. **Expected Result**: MetaMask immediately triggers a `Switch network` modal prompting to switch to Ethereum Sepolia (`0xaa36a7`).

### Test 4: Network Check Failure Recovery
1. Set an invalid or unreachable RPC in `NEXT_PUBLIC_RPC_URL` (e.g. `https://httpstat.us/500`).
2. Click **Connect MetaMask & Verify**.
3. **Expected Result**: Connection does not crash. Step 2 loads showing the wallet address with `Status Unknown` badge, accompanied by a non-blocking banner: `"Couldn't check your account on the network. Retry"`. Clicking **Retry** re-invokes the bytecode inspection.
