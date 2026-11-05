# PaidX Smart Contract Architecture & Specification (Design Only)

> **Specification Stage**: Design & Architecture  
> **Target Network**: Ethereum Sepolia Testnet (`11155111`)  
> **Tooling**: Foundry (`forge`, `cast`), OpenZeppelin Contracts v5.x, Solidity `^0.8.28`  
> **Security Standards**: No custody contracts, ERC-7715 scoped delegations, ERC-4337 Account Abstraction via MetaMask Smart Accounts Kit.

---

## 1. High-Level Architectural Principles

1. **Strictly Non-Custodial (No Middleman Vault)**:
   PaidX never holds user or merchant funds. Payments execute as atomic, peer-to-peer ERC-20 transfers from the customer's **MetaMask Smart Account** directly to the **Merchant Payout Address**.
2. **Account Upgrade Requirement**:
   Before a card tap can execute gasless retail payments, the user's EOA must be upgraded to a **MetaMask Smart Account (ERC-4337 / ERC-7710)** using `@metamask/smart-accounts-kit`.
3. **Execution Delegation (ERC-7715)**:
   The user signs an ERC-7715 scoped execution permission delegating periodic transfer rights (e.g. max $25.00 USDC per 24 hours) to PaidX's backend **Session Account**. The Session Account submits UserOperations to an ERC-4337 bundler with paymaster sponsorship.
4. **Hardware UID Anonymity**:
   Raw physical NFC card UIDs are never stored on-chain or in plaintext in the database. All contracts reference:
   $$\text{cardHash} = \text{keccak256}(\text{abi.encodePacked}(\text{rawUid}, \text{cardSalt}))$$

---

## 2. Smart Contract Specifications

### 2.1 CardRegistry (`contracts/CardRegistry.sol`)

Tracks NFC card ownership, lifecycle states, and binding to user Smart Accounts.

* **Inheritance**: `Initializable`, `Ownable2Step` (from OpenZeppelin v5)
* **Data Types**:
  ```solidity
  enum CardStatus { Pending, Active, Frozen, Revoked }

  struct CardRecord {
      address owner;         // MetaMask Smart Account of the user
      CardStatus status;     // Lifecycle status
      uint64 registeredAt;   // Unix timestamp
      uint64 statusUpdatedAt;
  }
  ```
* **Storage**:
  * `mapping(bytes32 cardHash => CardRecord) public cards;`
  * `mapping(address owner => bytes32[]) private _ownerCards;`
* **Key Functions**:
  * `registerCard(bytes32 cardHash, address owner)`:
    * Can be called by the user's Smart Account or verified relayer with user signature.
    * Reverts with `CardAlreadyRegistered(cardHash)` if `cards[cardHash].owner != address(0)`.
    * Sets status to `Active`.
  * `setCardStatus(bytes32 cardHash, CardStatus newStatus)`:
    * Callable **only by the card owner** (`msg.sender == cards[cardHash].owner`).
    * Reverts with `UnauthorizedCaller()` if caller is not the owner.
    * Reverts with `InvalidStatusTransition()` if card is `Revoked`.
    * Allows owner to instantly freeze/unfreeze their own card.
  * `verifyCardActive(bytes32 cardHash) external view returns (bool, address)`:
    * Read-only helper for bundler/session validator to confirm card is `Active`.
* **Events**:
  * `event CardRegistered(bytes32 indexed cardHash, address indexed owner, uint64 timestamp);`
  * `event CardStatusUpdated(bytes32 indexed cardHash, CardStatus indexed previousStatus, CardStatus indexed newStatus, uint64 timestamp);`
* **Errors**:
  * `error CardAlreadyRegistered(bytes32 cardHash);`
  * `error CardNotFound(bytes32 cardHash);`
  * `error UnauthorizedCaller();`
  * `error InvalidStatusTransition();`
  * `error ZeroAddress();`

---

### 2.2 MerchantRegistry (`contracts/MerchantRegistry.sol`)

Maintains the authoritative registry of verified merchants and their designated settlement payout addresses.

* **Inheritance**: `Ownable2Step`, `Pausable`
* **Data Types**:
  ```solidity
  struct MerchantRecord {
      address payoutAddress; // Destination for retail settlement
      bool isActive;         // Admin approval flag
      uint64 registeredAt;
  }
  ```
* **Storage**:
  * `mapping(bytes32 merchantId => MerchantRecord) public merchants;`
* **Key Functions**:
  * `registerMerchant(bytes32 merchantId, address payoutAddress)`:
    * Callable by `onlyOwner` (protocol admin) upon KYC/business review.
    * Reverts if `payoutAddress == address(0)`.
    * Sets `isActive = true`.
  * `updatePayoutAddress(bytes32 merchantId, address newPayoutAddress)`:
    * Callable by merchant owner or approved admin.
    * Reverts if `newPayoutAddress == address(0)`.
  * `setMerchantActive(bytes32 merchantId, bool active)`:
    * Callable by `onlyOwner`. Allows instant administrative freeze on compromised accounts.
* **Events**:
  * `event MerchantRegistered(bytes32 indexed merchantId, address indexed payoutAddress);`
  * `event MerchantPayoutAddressUpdated(bytes32 indexed merchantId, address indexed oldAddress, address indexed newAddress);`
  * `event MerchantStatusToggled(bytes32 indexed merchantId, bool indexed isActive);`
* **Errors**:
  * `error MerchantAlreadyExists(bytes32 merchantId);`
  * `error MerchantNotFound(bytes32 merchantId);`
  * `error MerchantInactive(bytes32 merchantId);`
  * `error ZeroAddress();`

---

### 2.3 Settlement & Payments (No Custom Custody Contract)

PaidX does **NOT** deploy a custody or payment routing contract. Funds never pool in an intermediary escrow.

1. **User Setup**:
   * The user upgrades their wallet to a **MetaMask Smart Account (ERC-4337 / ERC-7710)**.
   * The user grants an **ERC-7715 Execution Permission** to PaidX's backend `session_account_address` with strict caveats:
     * `TargetToken`: Sepolia USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`).
     * `PeriodLimit`: e.g. `$25.00 USDC` (`25000000` base units).
     * `PeriodSeconds`: `86400` (24-hour rolling window).
     * `RecipientPolicy`: Transfer allowed only to addresses listed in `MerchantRegistry.payoutAddress`.
2. **Counter Tap Settlement**:
   * Customer taps NFC card at ESP32 terminal.
   * Terminal sends transaction intent to backend.
   * Backend checks `CardRegistry.verifyCardActive(cardHash)` and verifies that `amount <= remainingPeriodLimit`.
   * Backend Session Signer constructs an ERC-4337 `UserOperation` calling `IERC20(usdc).transfer(merchantPayout, amount)`.
   * Paymaster validates caveats and sponsors gas.
   * Bundler submits transaction to Sepolia testnet.
   * Sepolia USDC transfers directly from `userSmartAccount` to `merchantPayoutAddress`.

---

### 2.4 Token Strategy

* **Default**: Official Circle Native USDC on Ethereum Sepolia:
  * Contract: `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
  * Decimals: 6
* **MockUSDC (`test/mock/MockUSDC.sol`)**:
  * Deployed strictly when `DEPLOY_MOCK_TOKEN=true` in local or isolated test environments.
  * Standard ERC-20 with a public `mint(address to, uint256 amount)` faucet method for automated testing.

---

## 3. Testing Specification (Foundry)

Foundry test suites in `test/`:
1. **Access Control (`CardRegistry.t.sol`)**:
   * Verify non-owner cannot freeze card.
   * Verify non-owner cannot register duplicate card.
   * Verify owner can freeze and reactivate active card.
2. **Happy Path (`MerchantRegistry.t.sol`)**:
   * Admin registers merchant, updates payout address, and toggles active status.
3. **Revert Cases**:
   * Zero-address registration reverts with `ZeroAddress()`.
   * Calling while paused reverts with `EnforcedPause()`.
4. **Fuzzing**:
   * Fuzz `registerCard(bytes32 cardHash, address owner)` across random hashes and non-zero addresses.
   * Invariant: `cards[cardHash].owner` is immutable once set unless revoked.

---

## 4. Deployment Pipeline (`script/Deploy.s.sol`)

1. Read `DEPLOYER_PRIVATE_KEY` and `NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS` from environment.
2. Deploy `CardRegistry` and `MerchantRegistry`.
3. If `DEPLOY_MOCK_TOKEN=true`, deploy `MockUSDC`.
4. Verify contract source code on Etherscan API via `forge verify-contract`.
5. Output deployment metadata:
   * Write `deployments/11155111.json`.
   * Insert rows into Supabase `public.contract_deployments` via the server client (`sb_secret_...`).

---

## 5. Event Indexer Strategy

An idempotent background indexer runs against `RPC_URL_SERVER`:
1. Queries `public.indexer_cursors` for `last_block` of `CardRegistry` and Sepolia USDC.
2. Fetches logs in chunks: `eth_getLogs(fromBlock = last_block + 1, toBlock = latest)`.
3. Inserts events into `public.chain_events` with `ON CONFLICT (chain_id, tx_hash, log_index) DO NOTHING`.
4. Atomically updates `indexer_cursors.last_block`.

