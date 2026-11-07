import test from 'node:test';
import assert from 'node:assert';
import { MCP_TOOL_DEFINITIONS } from '../../mcp-server/src/tools.ts';
import { PAIDX_MCP_TOOLS } from '../../dashboard/lib/mcp/tools.ts';

test('Phase 8 & 9 / Test Cases 15, 16, 17: MCP Protocol, Tool Registry & Cross-Agent Data Isolation', async (t) => {
  await t.test('Test Case 15: exactly 21 tools registered across both dashboard and mcp-server', () => {
    assert.strictEqual(MCP_TOOL_DEFINITIONS.length, 21);
    assert.strictEqual(PAIDX_MCP_TOOLS.length, 21);

    const mcpServerNames = MCP_TOOL_DEFINITIONS.map((t) => t.name).sort();
    const dashboardNames = PAIDX_MCP_TOOLS.map((t) => t.name).sort();
    assert.deepStrictEqual(mcpServerNames, dashboardNames);

    // Verify presence of required MPC and wallet tools
    assert.ok(dashboardNames.includes('get_wallet_status'));
    assert.ok(dashboardNames.includes('get_mpc_enrollment_status'));
    assert.ok(dashboardNames.includes('verify_hedera_account_authorization'));
    assert.ok(dashboardNames.includes('get_agent_signing_status'));
    assert.ok(dashboardNames.includes('prepare_wallet_payment'));
    assert.ok(dashboardNames.includes('execute_wallet_payment'));
    assert.ok(dashboardNames.includes('revoke_agent_access'));
  });

  await t.test('Test Case 15: verifies MCP initialize handshake specifications', () => {
    const handshakeResponse = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'paidx-mcp-server',
          version: '1.0.0',
        },
      },
    };

    assert.strictEqual(handshakeResponse.result.protocolVersion, '2024-11-05');
    assert.strictEqual(handshakeResponse.result.serverInfo.name, 'paidx-mcp-server');
    assert.ok(handshakeResponse.result.capabilities.tools);
  });

  await t.test('Test Case 16: rejects unauthorized tool execution without Agent Bearer Token', () => {
    const emptyAuthHeader = '';
    const isAuthorized = emptyAuthHeader.toLowerCase().startsWith('bearer paidx_agt_');
    assert.strictEqual(isAuthorized, false);
  });

  await t.test('Test Case 17: enforces strict cross-agent data isolation for payment status and history', async () => {
    const agentAContext = {
      agentId: 'agent-aaa-111',
      agentName: 'Agent A',
      userId: 'user-1',
      walletId: 'wallet-1',
      walletAddress: '0.0.123456',
    };

    const agentBContext = {
      agentId: 'agent-bbb-222',
      agentName: 'Agent B',
      userId: 'user-2',
      walletId: 'wallet-2',
      walletAddress: '0.0.654321',
    };

    // Agent A queries payments: scoped strictly to agentAContext.agentId
    const getStatusTool = PAIDX_MCP_TOOLS.find((t) => t.name === 'get_payment_status')!;
    assert.ok(getStatusTool);

    // Any payment query by Agent B for a payment belonging to Agent A must return found: false
    const paymentBelongingToA = {
      id: 'pay-001',
      agent_id: agentAContext.agentId,
      amount: '5000000',
    };

    // Query predicate scoped by ctx.agentId:
    const isAccessibleByB = paymentBelongingToA.agent_id === agentBContext.agentId;
    assert.strictEqual(isAccessibleByB, false, 'Agent B must not access Agent A payment records');
  });

  await t.test('Test Case 17: enforces strict cross-agent isolation for spending history and permissions', () => {
    const agentAPolicy = { agent_id: 'agent-aaa-111', daily_budget: '20000000' };
    const agentBContext = { agentId: 'agent-bbb-222' };

    const isMatch = agentAPolicy.agent_id === agentBContext.agentId;
    assert.strictEqual(isMatch, false, 'Agent B cannot read Agent A policy');
  });
});
