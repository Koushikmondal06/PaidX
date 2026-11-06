# Model Context Protocol (MCP) Transport Compliance Report

**Server Component:** PaidX Remote MCP Server (`mcp-server/src/index.ts`)  
**Specification:** Anthropic / Model Context Protocol (MCP) Specification (Protocol Version `2024-11-05`)  
**SDK:** `@modelcontextprotocol/sdk` (v1.32.2)  
**Status:** Compliant & Production Hardened  

---

## 1. Architecture & Dual-Transport Support

The PaidX MCP Server enables external AI clients (Claude Desktop, Cursor, Custom Agent Frameworks) to interact with PaidX Agentic Wallets via two standardized MCP transports:

1. **Streamable HTTP Transport (Stateless JSON-RPC 2.0)**:
   - Handled via `POST /mcp`, `POST /api/mcp`, or `POST /`.
   - Supports `initialize`, `notifications/initialized`, `tools/list`, and `tools/call`.
   - Ideal for request-response agent orchestrations.

2. **Server-Sent Events (SSE) Transport (Stateful Streaming)**:
   - Initialized via `GET /sse` using official `SSEServerTransport('/message', res)`.
   - Assigns a unique cryptographic `sessionId`.
   - Inbound client messages delivered via `POST /message?sessionId=<sessionId>`.
   - Lifecycle tracked in-memory with automatic cleanup on client disconnection.

---

## 2. Security Hardening & Compliance Remediations

### 2.1 Elimination of Wildcard CORS
- **Previous State:** `Access-Control-Allow-Origin: *` was returned globally.
- **Remediated Implementation:**
  - Evaluates request `Origin` header against configured allowed origins (`MCP_ALLOWED_ORIGINS`).
  - Automatically allows local development origins (`localhost`, `127.0.0.1`).
  - Sets `Access-Control-Allow-Origin` dynamically to the validated origin.
  - Sets `Access-Control-Allow-Credentials: true`.
  - Removes deprecated `x-user-id` from `Access-Control-Allow-Headers`.

### 2.2 Server-Side Bearer Token Isolation
- AI agents authenticate via the standard HTTP `Authorization: Bearer <token>` header.
- The MCP server never logs, serializes, or echoes the raw bearer token in tool responses or error payloads.
- Authentication tokens are validated and forwarded directly to the authoritative backend orchestrator over internal network channels.

### 2.3 Strict Request Size Limits & Stream Protection
- Implemented a 2MB maximum payload size limit (`MAX_REQUEST_SIZE_BYTES = 2 * 1024 * 1024`).
- If an incoming payload stream exceeds 2MB, the server immediately returns `HTTP 413 Payload Too Large` and destroys the request stream to protect against Denial of Service (DoS) attacks.

### 2.4 Graceful Shutdown Lifecycle
- Implemented process signal traps for `SIGTERM` and `SIGINT`.
- Closes all active `SSEServerTransport` connections cleanly before terminating the HTTP server listener.

---

## 3. Canonical 16-Tool Registry

The standalone MCP server (`mcp-server/src/tools.ts`) and backend orchestrator (`dashboard/lib/mcp/tools.ts`) share an identical, canonical registry of 16 Model Context Protocol tools:

| # | Tool Name | Category | Primary Function |
|---|---|---|---|
| **1** | `get_connected_wallet` | Wallet | Retrieves metadata about the connected wallet authorized for this agent. |
| **2** | `get_wallet_address` | Wallet | Returns the Hedera Account ID (`0.0.123456`) of the connected wallet. |
| **3** | `get_wallet_balance` | Wallet | Queries on-chain HBAR and token balances (such as USDC). |
| **4** | `get_supported_assets` | Wallet | Lists assets supported by the Hedera x402 facilitator (USDC, HBAR). |
| **5** | `prepare_hedera_payment` | Payment | Generates recipient-directed x402 exact payment requirements. |
| **6** | `verify_payment_payload` | Payment | Validates signed transaction bytes against payment requirements. |
| **7** | `submit_facilitator_payment` | Payment | Submits verified payload to facilitator `/settle` endpoint. |
| **8** | `send_payment` | Payment | End-to-end payment orchestration from natural language instruction. |
| **9** | `get_spending_policy` | Policy | Returns spending limits, allowed assets, networks, and approval rules. |
| **10** | `get_remaining_budget` | Policy | Calculates real-time remaining daily and monthly spendable budgets. |
| **11** | `get_pending_approvals` | Approval | Lists payment intents currently awaiting human approval. |
| **12** | `get_payment_status` | Accounting | Queries the status of a specific payment by ID or transaction ID. |
| **13** | `get_payment_history` | Accounting | Returns paginated spending history with tx IDs and HashScan URLs. |
| **14** | `reconcile_payment` | Accounting | Reconciles uncertain payment statuses against Mirror Node consensus. |
| **15** | `get_hcs_audit_log` | Audit | Retrieves immutable audit trail events published to Hedera Consensus Service. |
| **16** | `verify_hedera_payment` | Audit | Cross-verifies settlement against Mirror Node and HCS audit message payload. |

---

## 4. Test Verification Summary

Verified in `test/unit/mcp_server.test.ts`:
- Exactly 16 tools verified in tool registry.
- Protocol version `2024-11-05` verified during MCP `initialize` handshake.
- Tool listing (`tools/list`) returns full schema definitions.
- Unauthorized execution without bearer token rejected with HTTP 401.
- Cross-agent data isolation verified (Agent A cannot inspect Agent B's payments).
- Request size limit enforcement verified.
