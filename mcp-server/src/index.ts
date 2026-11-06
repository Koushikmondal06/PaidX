import http from 'http';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOL_DEFINITIONS } from './tools.js';

dotenv.config();

const PORT = parseInt(process.env.MCP_PORT || '3002', 10);
const PAIDX_BACKEND_URL = process.env.PAIDX_BACKEND_URL || 'http://localhost:3000/api/mcp';
const MAX_REQUEST_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit

// Active SSE transport sessions
const sseTransports = new Map<string, SSEServerTransport>();

/**
 * Creates and initializes the MCP SDK Server instance
 */
function createMcpSdkServer(bearerToken?: string): Server {
  const mcpServer = new Server(
    {
      name: 'paidx-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 1. Tool Listing Handler (MCP SDK standard)
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: MCP_TOOL_DEFINITIONS.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // 2. Tool Execution Handler (Forward to authoritative PaidX Backend)
  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;

    if (!bearerToken) {
      throw new Error('Unauthorized: Missing PaidX Agent Bearer Token in request context.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(PAIDX_BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: bearerToken,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name,
            arguments: toolArgs || {},
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`PaidX Backend returned HTTP ${res.status}: ${errorText}`);
      }

      const data = (await res.json()) as any;
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      return {
        content: data.result?.content || [
          {
            type: 'text',
            text: JSON.stringify(data.result, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : 'Unknown backend forwarding error';
      throw new Error(`Tool execution failed: ${msg}`);
    }
  });

  return mcpServer;
}

/**
 * Validates request Origin against configured allowed origins.
 * Strictly prevents wildcard CORS.
 */
function applyCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin;
  const rawAllowed = process.env.MCP_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000';
  const allowedOrigins = rawAllowed.split(',').map((o) => o.trim().toLowerCase());

  if (origin) {
    const cleanOrigin = origin.trim().toLowerCase();
    const isAllowed =
      allowedOrigins.includes(cleanOrigin) ||
      cleanOrigin.startsWith('http://localhost:') ||
      cleanOrigin.startsWith('http://127.0.0.1:') ||
      cleanOrigin.startsWith('https://localhost:');

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

/**
 * HTTP Server handling Streamable HTTP and SSE transports
 */
const server = http.createServer(async (req, res) => {
  // CORS & Security Headers
  if (applyCorsHeaders(req, res)) {
    return;
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. Health & Discovery Endpoint
  if (req.method === 'GET' && (pathname === '/' || pathname === '/mcp' || pathname === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        name: 'PaidX Remote MCP Server',
        status: 'online',
        transport: 'streamable-http',
        hederaNetwork: process.env.HEDERA_NETWORK || 'testnet',
        backendTarget: PAIDX_BACKEND_URL,
        toolsCount: MCP_TOOL_DEFINITIONS.length,
        tools: MCP_TOOL_DEFINITIONS.map((t) => t.name),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // 2. Server-Sent Events (SSE) Transport Endpoint
  if (req.method === 'GET' && pathname === '/sse') {
    const authHeader = (req.headers['authorization'] as string) || '';
    const mcpServer = createMcpSdkServer(authHeader);

    const transport = new SSEServerTransport('/message', res);
    const sessionId = transport.sessionId;
    sseTransports.set(sessionId, transport);

    req.on('close', () => {
      sseTransports.delete(sessionId);
    });

    await mcpServer.connect(transport);
    await transport.start();
    return;
  }

  // 3. SSE Inbound Message Endpoint (POST /message?sessionId=...)
  if (req.method === 'POST' && pathname === '/message') {
    const sessionId = urlObj.searchParams.get('sessionId');
    if (!sessionId || !sseTransports.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or expired SSE sessionId' }));
      return;
    }

    const transport = sseTransports.get(sessionId)!;
    await transport.handlePostMessage(req, res);
    return;
  }

  // 4. Streamable HTTP / JSON-RPC 2.0 Endpoint (POST /mcp or POST /)
  if (req.method === 'POST' && (pathname === '/mcp' || pathname === '/api/mcp' || pathname === '/')) {
    let bodyStr = '';
    let bytesReceived = 0;
    let isTooLarge = false;

    req.on('data', (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_REQUEST_SIZE_BYTES) {
        isTooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload Too Large: Maximum allowed size is 2MB.' }));
        req.destroy();
        return;
      }
      bodyStr += chunk;
    });

    req.on('end', async () => {
      if (isTooLarge) return;

      try {
        const authHeader = (req.headers['authorization'] as string) || '';
        const body = JSON.parse(bodyStr || '{}');
        const { jsonrpc, id, method, params } = body;

        // MCP Handshake: initialize
        if (method === 'initialize') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: {
                  name: 'paidx-mcp-server',
                  version: '1.0.0',
                },
              },
            })
          );
          return;
        }

        if (method === 'notifications/initialized') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id, result: {} }));
          return;
        }

        // Handle tools/list locally
        if (method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                tools: MCP_TOOL_DEFINITIONS.map((t) => ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                })),
              },
            })
          );
          return;
        }

        // Authenticate tool execution against backend
        if (!authHeader) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32001,
                message: 'Unauthorized: Missing PaidX Agent Bearer Token in Authorization header.',
              },
            })
          );
          return;
        }

        // Forward tool execution with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const backendRes = await fetch(PAIDX_BACKEND_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: authHeader,
            },
            body: bodyStr,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const data = await backendRes.json();
          res.writeHead(backendRes.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: {
                code: -32603,
                message: isAbort ? 'Gateway Timeout: Backend timed out' : 'Backend connection error',
              },
            })
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error processing MCP request';
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: msg },
          })
        );
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[MCP Server] SIGTERM received. Shutting down gracefully...');
  for (const transport of sseTransports.values()) {
    try {
      transport.close();
    } catch {}
  }
  server.close(() => {
    console.log('[MCP Server] Closed all connections.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[MCP Server] SIGINT received. Shutting down gracefully...');
  for (const transport of sseTransports.values()) {
    try {
      transport.close();
    } catch {}
  }
  server.close(() => {
    process.exit(0);
  });
});

// Start listening if executed directly
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  PaidX Dedicated MCP Server running on port ${PORT}`);
    console.log(`  Transport: Streamable HTTP & SSE`);
    console.log(`  Tools: ${MCP_TOOL_DEFINITIONS.length} registered`);
    console.log(`  URL: http://localhost:${PORT}/mcp`);
    console.log(`  Connected Backend Orchestrator: ${PAIDX_BACKEND_URL}`);
    console.log(`=======================================================`);
  });
}

export { server };
