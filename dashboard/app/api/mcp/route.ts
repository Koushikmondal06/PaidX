import { NextRequest, NextResponse } from 'next/server';
import { authenticateAgentToken } from '@/lib/agent/policyEngine';
import { PAIDX_MCP_TOOLS } from '@/lib/mcp/tools';

export const dynamic = 'force-dynamic';

/**
 * PaidX MCP Endpoint (Streamable HTTP / JSON-RPC 2.0)
 * Allows AI Agents (Claude Desktop, Cursor, OpenAI Agents) to communicate with the PaidX Agentic Wallet.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate Agent Token
    const authHeader = req.headers.get('authorization') || '';
    const agentContext = await authenticateAgentToken(authHeader);

    const body = await req.json();
    const { jsonrpc, id, method, params } = body;

    // Handle MCP initialization
    if (method === 'initialize') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'paidx-agentic-wallet-mcp',
            version: '1.0.0',
          },
        },
      });
    }

    if (method === 'notifications/initialized') {
      return NextResponse.json({ jsonrpc: '2.0', id, result: {} });
    }

    // Require valid authentication for all subsequent tool calls
    if (!agentContext) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32001,
            message: 'Unauthorized: Invalid or missing PaidX Agent Token in Authorization header.',
          },
        },
        { status: 401 }
      );
    }

    // Handle tools/list
    if (method === 'tools/list') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: PAIDX_MCP_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.parameters,
          })),
        },
      });
    }

    // Handle tools/call
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      const toolDef = PAIDX_MCP_TOOLS.find((t) => t.name === toolName);
      if (!toolDef) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Tool not found: ${toolName}`,
          },
        });
      }

      try {
        const result = await toolDef.handler(agentContext, toolArgs);
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        });
      } catch (handlerErr: unknown) {
        const msg = handlerErr instanceof Error ? handlerErr.message : 'Tool execution error';
        return NextResponse.json({
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: msg }),
              },
            ],
          },
        });
      }
    }

    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal MCP server error';
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: msg },
      },
      { status: 500 }
    );
  }
}

/**
 * Handle GET for SSE / discovery
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    name: 'PaidX Agentic Wallet MCP Server',
    version: '1.0.0',
    description: 'Conversational Wallet Payments Using Hedera x402 and Hedera Native Services',
    protocol: 'modelcontextprotocol',
    endpoints: {
      post: '/api/mcp',
    },
    toolsCount: PAIDX_MCP_TOOLS.length,
  });
}
