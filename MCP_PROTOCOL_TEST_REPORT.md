# PaidX Model Context Protocol (MCP) Protocol & Tool Report

**Server Component:** `mcp-server` (Port 3002) & `dashboard/app/api/mcp` (Port 3000)  
**SDK Dependency:** `@modelcontextprotocol/sdk` v1.21.0 / v1.32.2  
**Protocol Version:** `2024-11-05`  
**Transports:** Streamable HTTP (`POST /mcp`) & Server-Sent Events (`GET /sse`, `POST /message`)  
**Tools Registered:** Exactly 16 Canonical Tools  

---

## 1. Protocol Architecture & Transports

PaidX provides two remote MCP access layers powered by the official `@modelcontextprotocol/sdk`:
1. **Dedicated Remote MCP Server (`mcp-server/`):** A standalone Node.js service running on port 3002 that exposes Streamable HTTP and SSE transports for desktop agent environments (Claude Desktop, Cursor, OpenAI Agents, Windsurf).
2. **Next.js MCP Endpoint (`dashboard/app/api/mcp/route.ts`):** A serverless HTTP endpoint that provides direct streamable tool calls with integrated database authentication.

```
+--------------------+        +-----------------------+        +--------------------------+
|  AI Agent Client   |  MCP   | PaidX Remote MCP Svr  |  HTTP  | PaidX Orchestrator / DB  |
|  (Claude / Cursor) |=======>| (Port 3002: SSE/HTTP) |=======>| (Port 3000 / api/mcp)    |
+--------------------+        +-----------------------+        +--------------------------+
```

### Transports Implemented
- **Streamable HTTP Transport:** Handled via JSON-RPC 2.0 `POST /mcp` with streaming chunk processing and a 2MB maximum payload limit (`HTTP 413 Payload Too Large` enforcement).
- **Server-Sent Events (SSE) Transport:** Implemented via the official `SSEServerTransport('/message', res)` class. Active sessions are stored in an in-memory map keyed by `transport.sessionId`. Client messages are received via `POST /message?sessionId=...` and delivered through `transport.handlePostMessage(req, res)`.
- **Graceful Shutdown:** Process handlers for `SIGTERM` and `SIGINT` cleanly close active SSE connections before shutting down the HTTP listener.

---

## 2. Canonical 16-Tool Registry Audit

All tools are synchronized across `mcp-server/src/tools.ts` and `dashboard/lib/mcp/tools.ts`:

| # | Tool Name | Category | Purpose | Input Parameters |
| :- | :--- | :--- | :--- | :--- |
| 1 | `get_connected_wallet` | Wallet | Returns metadata on connected PaidX wallet | None |
| 2 | `get_wallet_address` | Wallet | Returns Hedera Account ID (`0.0.x`) | None |
| 3 | `get_wallet_balance` | Wallet | Queries on-chain HBAR and HTS balances | `asset` (optional) |
| 4 | `get_supported_assets` | Wallet | Lists supported facilitator tokens (USDC, HBAR) | None |
| 5 | `get_supported_networks` | Wallet | Lists supported networks (`hedera:testnet`) | None |
| 6 | `prepare_wallet_payment` | Payment | Validates recipient, computes atomic units | `recipient`, `amount`, `asset` |
| 7 | `execute_wallet_payment` | Payment | **Core payment tool** (x402 execution) | `recipient`, `amount`, `asset`, `network` |
| 8 | `get_payment_status` | Payment | Status lookup scoped to agent | `paymentId` or `transactionId` |
| 9 | `get_transaction_details`| Payment | Fetches Mirror Node verification record | `transactionId` |
| 10 | `get_payment_history` | Payment | Historical payments settled by agent | `limit` (default: 10) |
| 11 | `get_agent_permissions` | Policy | Returns autonomous flags and allowlists | None |
| 12 | `get_agent_spending_limit`| Policy | Max per-tx, daily budget, remaining allowance| None |
| 13 | `get_agent_spending_history`| Policy | Active reservations and deductions | None |
| 14 | `request_payment_approval`| Policy | Queues payment for human review if over limit| `recipient`, `amount`, `asset`, `reason` |
| 15 | `get_hedera_payment_audit`| Audit | Retrieves immutable HCS audit messages | `topicId`, `limit` |
| 16 | `verify_hedera_payment` | Audit | Cross-checks tx on Mirror Node + HCS | `transactionId` |

---

## 3. Tool Authorization & Data Isolation (Phase 9)

1. **Authentication Enforcement:**
   Every tool execution requires a valid PaidX Agent Bearer Token (`Authorization: Bearer paidx_agt_...`). The token is hashed with SHA-256 and verified against `agent_connections`. If missing or invalid, the server responds with JSON-RPC error code `-32001 (Unauthorized)`.
2. **Cross-Agent Data Isolation:**
   All queries for payment status (`get_payment_status`), payment history (`get_payment_history`), permissions (`get_agent_permissions`), and spending limits (`get_agent_spending_limit`) are strictly filtered by `agent_id = ctx.agentId`. An agent cannot inspect records belonging to another agent.
3. **Approval Lifecycle Completion:**
   When an agent payment exceeds spending caps or recipient allowlists, `request_payment_approval` queues the payment with status `approval_required`. Three dedicated endpoints manage the human authorization lifecycle:
   - `POST /api/approvals/approve`: Authenticated user marks payment approved.
   - `POST /api/approvals/reject`: Authenticated user marks payment declined.
   - `POST /api/approvals/execute`: Executes the approved payment via the orchestrator.

---

## 4. Automated Verification Results

Verified via `test/unit/mcp_server.test.ts`:

- **Test Case 15 (Tool Count & Handshake):** Verified that exactly 16 tools are registered in both repositories and the MCP initialize handshake complies with specification `2024-11-05`: **PASS**
- **Test Case 16 (Unauthorized Calls):** Verified that missing or invalid authorization headers are rejected: **PASS**
- **Test Case 17 (Cross-Agent Isolation):** Verified that agent B cannot query agent A's payment status or policy records: **PASS**

---
*Report certified by PaidX AI Agent Systems Engineering.*
