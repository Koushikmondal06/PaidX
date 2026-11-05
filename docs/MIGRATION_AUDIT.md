# PaidX Migration Audit: Foundation to Testnet Architecture

This audit catalogs all detected frameworks, package managers, auth mechanisms, wallet logic, legacy Supabase keys, and fake/mock data paths across the codebase. It defines the concrete to-do list for transitioning to real Ethereum Sepolia (11155111) testnet execution.

## System Profile

- **Framework**: Next.js 15.1.0 App Router (React 19, TypeScript 5.7, Tailwind CSS 3.4)
- **Package Manager**: npm (v10+, Node.js v24 LTS)
- **Default Testnet Chain**: Ethereum Sepolia (`11155111`)

---

## Migration Audit Table

| File | What is Fake / Legacy | Real Replacement |
|---|---|---|
| `dashboard/lib/auth.ts` | `DEFAULT_DEMO_USER`, mock `UserSession` in `localStorage`, random mock hex address generator (`0x${randomHex}`) | Real Supabase Auth session via browser client (`sb_publishable_...`) linked to `profiles` table and real `wallets` table records. |
| `dashboard/lib/base.ts` | Hardcoded Base mainnet/Sepolia chain IDs (`8453`, `84532`), hardcoded Base USDC addresses (`0x83358...`, `0x036C...`) | Dynamic chain config read exclusively from environment variables: `NEXT_PUBLIC_CHAIN_ID` (`11155111`), `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_EXPLORER_URL`, `NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS` (Sepolia USDC). |
| `dashboard/lib/currency.ts` | Hardcoded wei/ETH & USDC calculations without token decimal verification from chain | Dynamic ERC-20 token decimals and balance formatting based on RPC token inspection or verified testnet token configuration. |
| `dashboard/app/auth/page.tsx` | `setTimeout` mock authentication, mock user creation, quick-demo bypass button injecting fake session | Real Supabase Auth: `supabase.auth.signUp({ email, password })` and `signInWithPassword({ email, password })` using publishable key client. |
| `dashboard/app/onboarding/page.tsx` | `setTimeout` fake wallet creation, fake smart account counterfactual computation, local state update | Real MetaMask Smart Accounts Kit (`toMetaMaskSmartAccount`) with EOA/Extension connection, persisting counterfactual address and owner EOA into `public.wallets`. |
| `dashboard/app/dashboard/page.tsx` | Hardcoded balances ($145.80 USDC, 0.0350 ETH), mock transactions array (`tx_8453_01`, fake tx hashes `0x3a5b6c...`), fake spending limit calculations | Real on-chain balance query via viem/RPC against Sepolia USDC contract, real query to `public.payments` and `public.permissions` via Supabase client. |
| `dashboard/app/dashboard/cards/page.tsx` | Mock cards array (`4305-0129-8812`), fake `c_${Date.now()}` claim mechanism, mock `auditLogs` array, local freeze toggle | Query real user cards from `public.cards` table (storing `uid_hash` bytes32), real ERC-7715 permission update, and server-side card freeze/revoke via backend API. |
| `dashboard/app/dashboard/transactions/page.tsx` | Static transactions list with placeholder tx hashes (`0x3a5b...`, `0x8f7e...`), fake merchant receiving addresses | Real paginated queries from `public.payments` joined with `public.merchants` via Supabase RLS policies, linking to real Sepolia Etherscan URLs. |
| `dashboard/app/merchant/page.tsx` | Hardcoded revenue metrics ($1,420.50 settled, 18 transactions, < 850ms), hardcoded fallback address `0x99A371F...` | Real aggregation query on `public.payments` where `merchant_id` matches current authenticated merchant user, and payout address from `public.merchants`. |
| `dashboard/app/merchant/terminal/page.tsx` | `setTimeout` tap simulation, hardcoded merchant address, mock card UID, fake settlement screen | Real payment intent creation, real NFC card UID read, on-chain UserOp submission through ERC-4337 bundler/paymaster, real receipt polling. |
| `dashboard/app/merchant/pos/page.tsx` | Local state device list (`dev_01`), in-browser random hex generator for pairing token | Real POS device registration API storing hashed secrets in PostgreSQL with server-side validation. |
| `local_test/.env.example` *(legacy)* | Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...` and `SUPABASE_SERVICE_ROLE_KEY=eyJ...` | Modern Supabase keys: client `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` and server `SUPABASE_SECRET_KEY=sb_secret_...`. |
| `local_test/apps/console/lib/supabase/*` *(legacy)* | Legacy client creation using `SUPABASE_SERVICE_ROLE_KEY` (JWT) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` | New standard browser client (`createBrowserClient` with `sb_publishable_...`) and server-only client (`createServerClient` with `sb_secret_...`). |

