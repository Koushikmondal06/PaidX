/**
 * MCP Server Configuration & Client Generator
 *
 * External AI clients (ChatGPT, Claude Desktop, Cursor) connect to the standalone
 * MCP server using the official Streamable HTTP transport.
 *
 * Production endpoint: https://agents.paidx.cc/mcp
 * Local development:   http://localhost:3002/mcp
 *
 * NOTE: External clients must NEVER connect directly to the internal backend endpoint (/api/mcp).
 */

export const PRODUCTION_MCP_URL = 'https://agents.paidx.cc/mcp';
export const LOCAL_MCP_URL = 'http://localhost:3002/mcp';

/**
 * Returns the public MCP server endpoint for external AI clients.
 * Uses NEXT_PUBLIC_MCP_SERVER_URL if defined, falling back safely to
 * https://agents.paidx.cc/mcp in production and http://localhost:3002/mcp in development/test.
 */
export function getPublicMcpServerUrl(): string {
  if (process.env.NEXT_PUBLIC_MCP_SERVER_URL) {
    return process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  }
  return process.env.NODE_ENV === 'production' ? PRODUCTION_MCP_URL : LOCAL_MCP_URL;
}

export interface McpClientConfig {
  mcpServers: {
    paidx: {
      url: string;
      headers: {
        Authorization: string;
      };
    };
  };
}

/**
 * Generates valid MCP JSON client configuration for Claude Desktop and Cursor.
 */
export function buildMcpClientConfig(agentToken: string, customUrl?: string): McpClientConfig {
  const url = customUrl || getPublicMcpServerUrl();
  return {
    mcpServers: {
      paidx: {
        url,
        headers: {
          Authorization: `Bearer ${agentToken}`,
        },
      },
    },
  };
}
