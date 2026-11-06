# PaidX Dedicated Remote MCP Server

Dedicated Model Context Protocol (MCP) server for the **PaidX Agentic Wallet**, providing conversational cryptocurrency payments on **Hedera Testnet** using **Hedera x402 exact payment scheme** and Hedera Native Services (**HTS & HCS**).

---

## Architecture Overview

```
 USER (Conversational Chat)
   |
   | "Send 5 USDC to 0.0.123456"
   v
 AI AGENT (Claude Desktop, Cursor, OpenAI Agents)
   |
   | MCP Protocol (Streamable HTTP / SSE)
   v
 PAIDX MCP SERVER (mcp-server: port 3002)
   |
   v
 PAIDX PAYMENT ORCHESTRATOR (dashboard: port 3000 / api/mcp)
   |
   +---> Validates Agent Token & Spending Policy
   +---> Atomic Budget Reservation
   +---> Prepares x402 Payment Requirements (payTo: 0.0.123456)
   +---> Signs TransferTransaction with Connected Wallet
   +---> Facilitator Sponsoring feePayer Settle
   +---> Publishes Audit Event to Hedera Consensus Service (HCS)
   |
   v
 HEDERA TESTNET SETTLEMENT
```

---

## 16 Standard MCP Tools Exposed

### 1. Wallet Tools
* `get_connected_wallet`: Metadata on user's authorized Hedera account.
* `get_wallet_address`: Returns Hedera Account ID (`0.0.x`).
* `get_wallet_balance`: On-chain HBAR and HTS USDC balances from Mirror Node.
* `get_supported_assets`: Lists supported assets (USDC, HBAR).
* `get_supported_networks`: Returns supported networks (`hedera:testnet`).

### 2. Payment Tools
* `prepare_wallet_payment`: Validates recipient and computes atomic payment requirements.
* `execute_wallet_payment`: Core tool — executes recipient-directed x402 payment on Hedera.
* `get_payment_status`: Checks settlement status by payment ID or transaction ID.
* `get_transaction_details`: Fetches on-chain verification data from Mirror Node.
* `get_payment_history`: Returns recent payments settled by this agent.

### 3. Agent Policy Tools
* `get_agent_permissions`: Checks agent autonomous payment flags and allowed networks.
* `get_agent_spending_limit`: Returns max per-tx, daily budget, and remaining allowance.
* `get_agent_spending_history`: Active reservations and recent budget deductions.
* `request_payment_approval`: Queues payment for interactive human authorization if over budget.

### 4. Audit Tools (Hedera Native Services Track)
* `get_hedera_payment_audit`: Queries immutable messages on PaidX HCS Audit Topic.
* `verify_hedera_payment`: Cross-checks transaction on Mirror Node and HCS audit trail.

---

## Getting Started

### 1. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```

Ensure your backend orchestrator is running on port 3000 (`http://localhost:3000/api/mcp`).

### 2. Install & Start Server
```bash
npm install
npm run dev
```

The MCP Server will listen on `http://localhost:3002/mcp` and `http://localhost:3002/sse`.

---

## Configuring with Claude Desktop or Cursor

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "paidx": {
      "url": "http://localhost:3002/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_PAIDX_AGENT_TOKEN"
      }
    }
  }
}
```

Mint your `YOUR_PAIDX_AGENT_TOKEN` in the **PaidX Console $\rightarrow$ Agent Wallet** section.
