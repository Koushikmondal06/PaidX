# PaidX Dedicated Remote MCP Server

Dedicated Model Context Protocol (MCP) server for the **PaidX Agentic Wallet**, providing conversational cryptocurrency payments on **Hedera Testnet** using **Hedera x402 exact payment scheme** and Hedera Native Services (**HTS & HCS**).

---

## Architecture Overview

```
External AI Client (Claude Desktop, Cursor, ChatGPT, MCP Inspector)
    |
    | Streamable HTTP (MCP Protocol 2024-11-05 / 2025-03-26)
    v
https://agents.paidx.cc/mcp (or local: http://localhost:3002/mcp)
    |
    v
Standalone PaidX MCP Server (mcp-server: StreamableHTTPServerTransport)
    |
    | Authorized Internal Forwarding (Authorization: Bearer <agent-token>)
    v
https://paidx-backend.vercel.app/api/mcp (or local: http://localhost:3000/api/mcp)
    |
    +---> Validates Agent Token & Spending Policy (Supabase Postgres)
    +---> Atomic Budget Reservation (reserve_agent_budget RPC)
    +---> Prepares x402 Payment Requirements (payTo: recipient)
    +---> Signs TransferTransaction with Connected Hedera Wallet
    +---> Facilitator Sponsoring feePayer Settle
    +---> Publishes Audit Event to Hedera Consensus Service (HCS)
    |
    v
Hedera Testnet Settlement + Mirror Node Verification
```

> **Important Architecture Boundary**:
> External AI clients MUST connect to the standalone MCP server at `https://agents.paidx.cc/mcp`.
> The internal backend API (`https://paidx-backend.vercel.app/api/mcp`) is private infrastructure and must never be exposed directly to AI clients.

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

## Client Configuration Examples

### Claude Desktop (`claude_desktop_config.json`)

Configure Claude Desktop to use the remote production Streamable HTTP endpoint:

```json
{
  "mcpServers": {
    "paidx": {
      "url": "https://agents.paidx.cc/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_PAIDX_AGENT_TOKEN"
      }
    }
  }
}
```

For local development:

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

### Cursor & MCP Inspector

Connect using the official Streamable HTTP transport:

* **Transport Type**: `Streamable HTTP` (or `SSE`)
* **Endpoint URL**: `https://agents.paidx.cc/mcp`
* **Custom Headers**:
  * `Authorization`: `Bearer YOUR_PAIDX_AGENT_TOKEN`

---

## Environment Configuration

### Local Environment (`mcp-server/.env`)
```bash
MCP_PORT=3002
PAIDX_BACKEND_URL=http://localhost:3000/api/mcp
HEDERA_NETWORK=testnet
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

### Production Environment (Render / Cloud Container)
```bash
NODE_ENV=production
PORT=10000
PAIDX_BACKEND_URL=https://paidx-backend.vercel.app/api/mcp
HEDERA_NETWORK=testnet
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

- Binds to `0.0.0.0`.
- Automatically respects `process.env.PORT` on Render.
- Fallback to `MCP_PORT` (default: 3002).

---

## Public Endpoints

* **MCP Streamable HTTP Endpoint**: `https://agents.paidx.cc/mcp`
* **Health & Status Check**: `https://agents.paidx.cc/health`
* **Legacy SSE Endpoint**: `https://agents.paidx.cc/sse`
