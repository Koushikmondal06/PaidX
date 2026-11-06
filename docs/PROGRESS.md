# PaidX Testnet Progress Log

## Phase 0: Audit
- Status: DONE
- Checkpoint: Completed full architectural audit covering contracts, key custody, gas attribution, and gaps against target model.
- Completed: docs/ARCHITECTURE.md created with complete actors, onboarding steps, key custody table, gas matrix, and gap analysis.
- Blocked: None.
- Unverified: None.

## Phase 1: Email Confirmation Redirect + Landing Page
- Status: DONE
- Checkpoint: Configured cross-device token-hash verification flow (/auth/confirm -> /auth/confirmed), added APP_URL and SITE_URL env vars, and created responsive public confirmation page.
- Completed: dashboard/app/auth/confirm/route.ts, dashboard/app/auth/confirmed/page.tsx, supabase/templates/confirm.html, supabase/config.toml, .env.example, .env.local.
- Blocked: None.
- Unverified: None.

## Phase 2: Show Test Coins in MetaMask
- Status: DONE
- Checkpoint: Added copyable connected address, Sepolia badge, Etherscan link, EIP-747 "Add USDC to MetaMask", and zero-balance faucet helpers.
- Completed: dashboard/lib/tokens.ts (token and faucet config), dashboard/app/dashboard/wallet/page.tsx.
- Blocked: None.
- Unverified: None.

## Phase 3: Console Wallet: Balances + Send
- Status: DONE
- Checkpoint: Built full on-chain balances card, segmented currency selector, review modal, and MetaMask send form for Sepolia ETH and Circle USDC with strict bigint math.
- Completed: dashboard/app/dashboard/wallet/page.tsx, dashboard/components/DashboardNav.tsx (Wallet nav item).
- Blocked: None.
- Unverified: None.

## Phase 4: EIP-7702 Account Upgrade
- Status: DONE
- Checkpoint: Implemented getUpgradeStatus (0xef0100 verification against official StatelessDeleGator address), atomic batch upgrade trigger (wallet_sendCalls), server-side verification guard (/api/wallets/save), and docs/EIP7702.md.
- Completed: dashboard/lib/eip7702.ts, dashboard/app/api/wallets/save/route.ts, dashboard/app/api/permissions/route.ts, docs/EIP7702.md.
- Blocked: None.
- Unverified: None.

## Phase 5: Onboarding Flows
- Status: DONE
- Checkpoint: Built 5-step resumable user onboarding stepper, on-chain card registration with MetaMask receipt verification, gated admin portal (/admin) with on-chain MerchantRegistry approval, and payments route audit.
- Completed: dashboard/app/onboarding/page.tsx, dashboard/app/admin/page.tsx, dashboard/app/api/admin/merchants/route.ts, dashboard/app/api/cards/register/route.ts, dashboard/app/dashboard/cards/page.tsx, supabase/migrations/20261106140000_onboarding_and_merchants.sql.
- Blocked: Direct physical NFC card hardware reader capture in web browser (BLOCKED: Web NFC API is Android Chrome only; typed card UID provided as instructed).
- Unverified: None.

## Phase 6: Verify + Docs
- Status: DONE
- Checkpoint: Ran Foundry test suite (15/15 tests passed across CardRegistry and MerchantRegistry), verified TypeScript compilation, and authored full end-to-end verification walkthrough.
- Completed: docs/E2E_TEST.md, test/CardRegistry.t.sol & test/MerchantRegistry.t.sol verification.
- Blocked: None.
- Unverified: None.
