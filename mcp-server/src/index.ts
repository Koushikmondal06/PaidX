import http from 'http';
import {
  PORT,
  HOST,
  PAIDX_BACKEND_URL,
  handleVercelRequest,
  handleHealthRequest,
  handleMcpRequest,
  applyCorsHeaders,
  validateAgentTokenWithBackend,
  createMcpSdkServer,
  generateDurableSessionId,
  verifyDurableSessionId,
  maskToken,
  getTokenHashPrefix,
  sessions,
  sseLegacyTransports,
  tokenValidationCache,
  DurableSessionPayload,
  ActiveMcpSession,
} from './server.js';
import { MCP_TOOL_DEFINITIONS } from './tools.js';

export {
  PORT,
  HOST,
  PAIDX_BACKEND_URL,
  handleVercelRequest,
  handleHealthRequest,
  handleMcpRequest,
  applyCorsHeaders,
  validateAgentTokenWithBackend,
  createMcpSdkServer,
  generateDurableSessionId,
  verifyDurableSessionId,
  maskToken,
  getTokenHashPrefix,
  sessions,
  sseLegacyTransports,
  tokenValidationCache,
  MCP_TOOL_DEFINITIONS,
};

export type { DurableSessionPayload, ActiveMcpSession };

// Standalone Node.js HTTP server instance (used for local development and test runners)
const server = http.createServer(handleVercelRequest);

export async function shutdownMcpServer(): Promise<void> {
  sessions.clear();
  tokenValidationCache.clear();
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

process.on('SIGTERM', async () => {
  console.log('[MCP Server] SIGTERM received. Shutting down gracefully...');
  await shutdownMcpServer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[MCP Server] SIGINT received. Shutting down gracefully...');
  await shutdownMcpServer();
  process.exit(0);
});

const isMainModule = (): boolean => {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return false;
  }
  if (process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'))) {
    return false;
  }
  return typeof require !== 'undefined' && require.main === module;
};

export function startMcpServer(port: number = PORT, host: string = HOST): http.Server {
  return server.listen(port, host, () => {
    console.log(`=======================================================`);
    console.log(`  PaidX Dedicated MCP Server running on ${host}:${port}`);
    console.log(`  Transport: Official Streamable HTTP & SSE`);
    console.log(`  Tools: ${MCP_TOOL_DEFINITIONS.length} registered`);
    console.log(`  Streamable HTTP Endpoint: http://${host}:${port}/mcp`);
    console.log(`  Health Endpoint: http://${host}:${port}/health`);
    console.log(`  Connected Backend Orchestrator: ${PAIDX_BACKEND_URL}`);
    console.log(`=======================================================`);
  });
}

if (isMainModule()) {
  startMcpServer();
}

export { server };
export default handleVercelRequest;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(handleVercelRequest, module.exports);
}
