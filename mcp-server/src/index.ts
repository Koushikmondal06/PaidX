import http from 'http';
import dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOL_DEFINITIONS } from './tools.js';

dotenv.config();

// Port & Host Configuration:
// Prefer process.env.PORT for Render / cloud deployments, MCP_PORT as fallback, default 3002.
// Must bind to 0.0.0.0 in cloud containers.
const PORT = parseInt(process.env.PORT || process.env.MCP_PORT || '3002', 10);
const HOST = '0.0.0.0';
const PAIDX_BACKEND_URL = process.env.PAIDX_BACKEND_URL || 'http://localhost:3000/api/mcp';
const MAX_REQUEST_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = 1000;
const TOKEN_CACHE_TTL_MS = 10 * 1000; // 10 seconds TTL for token verification cache

export interface ActiveMcpSession {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  server: Server;
  bearerToken: string;
  openCount: number;
  lastActive: number;
}

// In-memory active sessions and token validation cache
export const sessions = new Map<string, ActiveMcpSession>();
export const sseLegacyTransports = new Map<string, SSEServerTransport>();

interface TokenValidationResult {
  valid: boolean;
  error?: string;
  code?: number;
  timestamp: number;
}
export const tokenValidationCache = new Map<string, TokenValidationResult>();

/**
 * Masks raw token to prevent leaking secrets in logs or responses.
 */
export function maskToken(token: string): string {
  if (!token || token.length < 15) return '***';
  return `${token.slice(0, 14)}...${token.slice(-4)}`;
}

/**
 * Validates the Agent Bearer Token through the existing PaidX backend authentication mechanism.
 * Never trusts client-provided identity; delegates verification to the backend orchestrator.
 */
export async function validateAgentTokenWithBackend(
  authHeader: string,
  backendUrl: string = PAIDX_BACKEND_URL,
  timeoutMs: number = 10000
): Promise<{ valid: boolean; error?: string; code?: number }> {
  if (!authHeader || typeof authHeader !== 'string') {
    return {
      valid: false,
      error: 'Unauthorized: Missing PaidX Agent Bearer Token in Authorization header.',
      code: -32001,
    };
  }

  const cleanHeader = authHeader.trim();
  if (!cleanHeader.toLowerCase().startsWith('bearer paidx_agt_')) {
    return {
      valid: false,
      error: 'Unauthorized: Invalid token format. Must be "Bearer paidx_agt_<secret>".',
      code: -32001,
    };
  }

  // Check short-lived cache
  const cached = tokenValidationCache.get(cleanHeader);
  if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL_MS) {
    return { valid: cached.valid, error: cached.error, code: cached.code };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: cleanHeader,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'auth-check',
        method: 'tools/list',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.status === 401 || res.status === 403) {
      const result = {
        valid: false,
        error: 'Unauthorized: Invalid, expired, or revoked PaidX Agent Token.',
        code: -32001,
        timestamp: Date.now(),
      };
      tokenValidationCache.set(cleanHeader, result);
      return result;
    }

    if (!res.ok) {
      const errText = await res.text();
      return {
        valid: false,
        error: `PaidX Backend validation error (HTTP ${res.status}): ${errText}`,
        code: -32603,
      };
    }

    const json = (await res.json()) as any;
    if (json.error) {
      const result = {
        valid: false,
        error: json.error.message || 'Unauthorized: Token validation failed.',
        code: json.error.code || -32001,
        timestamp: Date.now(),
      };
      tokenValidationCache.set(cleanHeader, result);
      return result;
    }

    const result = { valid: true, timestamp: Date.now() };
    tokenValidationCache.set(cleanHeader, result);
    return result;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      valid: false,
      error: isAbort
        ? 'Gateway Timeout: Backend authentication probe timed out'
        : 'Backend connection error during validation',
      code: -32603,
    };
  }
}

/**
 * Creates and initializes an MCP SDK Server instance using the official SDK.
 * All 16 standard MCP tools are preserved and exposed.
 * Tool execution is forwarded securely to the backend with the authenticated agent token.
 */
export function createMcpSdkServer(bearerToken: string, backendUrl: string = PAIDX_BACKEND_URL): Server {
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
      const res = await fetch(backendUrl, {
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
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const msg = isAbort
        ? 'Gateway Timeout: PaidX backend timed out after 15 seconds'
        : err instanceof Error
        ? err.message
        : 'Unknown backend forwarding error';
      throw new Error(`Tool execution failed: ${msg}`);
    }
  });

  return mcpServer;
}

/**
 * Tracks open responses on an active session to prevent closing while processing.
 */
function trackResponse(session: ActiveMcpSession, res: http.ServerResponse) {
  if (!res.socket || res.destroyed) return;
  session.openCount++;
  session.lastActive = Date.now();
  res.on('close', () => {
    session.openCount = Math.max(0, session.openCount - 1);
    session.lastActive = Date.now();
  });
}

/**
 * CORS headers application supporting remote connections and MCP Inspector.
 */
function applyCorsHeaders(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id, accept'
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

/**
 * Standalone HTTP Server hosting official Streamable HTTP and SSE transports.
 */
const server = http.createServer(async (req, res) => {
  if (applyCorsHeaders(req, res)) {
    return;
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // 1. Health & Discovery Endpoint (/health and /)
  // Strictly returns status without leaking internal backend URLs or credentials.
  if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        name: 'paidx-mcp-server',
        version: '1.0.0',
        transport: 'streamable-http',
        protocolVersion: '2024-11-05',
        toolsCount: MCP_TOOL_DEFINITIONS.length,
        hederaNetwork: process.env.HEDERA_NETWORK || 'testnet',
        activeSessions: sessions.size,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // 2. Legacy SSE Transport Endpoint (/sse)
  if (req.method === 'GET' && pathname === '/sse') {
    const authHeader = (req.headers['authorization'] as string) || '';
    if (!authHeader) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Unauthorized: Missing PaidX Agent Bearer Token.' },
          id: null,
        })
      );
      return;
    }

    const validation = await validateAgentTokenWithBackend(authHeader);
    if (!validation.valid) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: validation.error || 'Unauthorized' },
          id: null,
        })
      );
      return;
    }

    const mcpServer = createMcpSdkServer(authHeader.trim());
    const transport = new SSEServerTransport('/message', res);
    const sessionId = transport.sessionId;
    sseLegacyTransports.set(sessionId, transport);

    req.on('close', () => {
      sseLegacyTransports.delete(sessionId);
    });

    await mcpServer.connect(transport);
    await transport.start();
    return;
  }

  // 3. Legacy SSE Inbound Message Endpoint (/message)
  if (req.method === 'POST' && pathname === '/message') {
    const sessionId = urlObj.searchParams.get('sessionId');
    if (!sessionId || !sseLegacyTransports.has(sessionId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or expired SSE sessionId' }));
      return;
    }

    const transport = sseLegacyTransports.get(sessionId)!;
    await transport.handlePostMessage(req, res);
    return;
  }

  // 4. Official Streamable HTTP Endpoints (/mcp or /api/mcp)
  const isMcpPath = pathname === '/mcp' || pathname === '/api/mcp';

  // GET /mcp: Open SSE stream for established Streamable HTTP session
  if (req.method === 'GET' && isMcpPath) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: Missing mcp-session-id header' },
          id: null,
        })
      );
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found or expired' },
          id: null,
        })
      );
      return;
    }

    // Ensure Accept header includes text/event-stream
    let accept = req.headers['accept'] || '';
    if (!accept.includes('text/event-stream')) {
      req.headers['accept'] = 'text/event-stream';
    }

    trackResponse(session, res);
    await session.transport.handleRequest(req, res);
    return;
  }

  // DELETE /mcp: Terminate session according to MCP specification
  if (req.method === 'DELETE' && isMcpPath) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: Missing mcp-session-id header' },
          id: null,
        })
      );
      return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found or expired' },
          id: null,
        })
      );
      return;
    }

    trackResponse(session, res);
    await session.transport.handleRequest(req, res);
    await session.transport.close();
    sessions.delete(sessionId);
    return;
  }

  // POST /mcp: Official Streamable HTTP JSON-RPC message handling
  if (req.method === 'POST' && isMcpPath) {
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
        // 1. Require Authorization: Bearer <agent-token>
        const authHeader = (req.headers['authorization'] as string) || '';
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // If there's an existing session and no auth header passed, use session's authenticated token
        let effectiveAuthHeader = authHeader;
        let existingSession: ActiveMcpSession | undefined = undefined;

        if (sessionId) {
          existingSession = sessions.get(sessionId);
          if (!existingSession) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32001, message: 'Session not found or expired' },
                id: null,
              })
            );
            return;
          }

          if (!effectiveAuthHeader) {
            effectiveAuthHeader = existingSession.bearerToken;
          } else if (existingSession.bearerToken !== effectiveAuthHeader.trim()) {
            // Cross-agent protection: token on request does not match session
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: 'Forbidden: Session is bound to a different agent token.',
                },
                id: null,
              })
            );
            return;
          }
        }

        if (!effectiveAuthHeader) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32001,
                message: 'Unauthorized: Missing PaidX Agent Bearer Token in Authorization header.',
              },
              id: null,
            })
          );
          return;
        }

        // Validate token against backend
        const validation = await validateAgentTokenWithBackend(effectiveAuthHeader);
        if (!validation.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: validation.code || -32001,
                message: validation.error || 'Unauthorized: Invalid PaidX Agent Token.',
              },
              id: null,
            })
          );
          return;
        }

        // 2. Parse request body
        let parsedBody: unknown;
        try {
          parsedBody = bodyStr ? JSON.parse(bodyStr) : {};
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32700, message: 'Parse error: Invalid JSON' },
              id: null,
            })
          );
          return;
        }

        // 3. Ensure Accept header complies with Streamable HTTP requirements
        let accept = req.headers['accept'] || '';
        if (!accept.includes('text/event-stream') || !accept.includes('application/json')) {
          req.headers['accept'] = 'application/json, text/event-stream';
        }

        // 4. Handle with existing stateful transport
        if (existingSession) {
          trackResponse(existingSession, res);
          await existingSession.transport.handleRequest(req, res, parsedBody);
          return;
        }

        // 5. New initialization request: create stateful session
        if (!sessionId && isInitializeRequest(parsedBody)) {
          if (sessions.size >= MAX_SESSIONS) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Too many open sessions on server' },
                id: null,
              })
            );
            return;
          }

          let createdSessionId: string | undefined;
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => {
              createdSessionId = randomUUID();
              return createdSessionId;
            },
            enableJsonResponse: true,
            onsessioninitialized: (sid) => {
              const activeSession: ActiveMcpSession = {
                sessionId: sid,
                transport,
                server: mcpServerInstance,
                bearerToken: effectiveAuthHeader.trim(),
                openCount: 0,
                lastActive: Date.now(),
              };
              sessions.set(sid, activeSession);
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId || createdSessionId;
            if (sid && sessions.has(sid)) {
              sessions.delete(sid);
            }
          };

          const mcpServerInstance = createMcpSdkServer(effectiveAuthHeader.trim());
          await mcpServerInstance.connect(transport);
          await transport.handleRequest(req, res, parsedBody);
          return;
        }

        // 6. Non-initialization request without session ID:
        // Handle in stateless mode with a single-use StreamableHTTPServerTransport
        const statelessTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        const statelessServer = createMcpSdkServer(effectiveAuthHeader.trim());
        await statelessServer.connect(statelessTransport);
        await statelessTransport.handleRequest(req, res, parsedBody);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error processing MCP request';
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: msg },
              id: null,
            })
          );
        }
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

// Periodic idle session cleanup
const idleCheckTimer = setInterval(() => {
  const cutoff = Date.now() - SESSION_IDLE_TIMEOUT_MS;
  for (const [sid, session] of sessions.entries()) {
    if (session.openCount === 0 && session.lastActive < cutoff) {
      session.transport.close().catch(() => {});
      sessions.delete(sid);
    }
  }
}, 60000);
idleCheckTimer.unref();

// Graceful shutdown handling
export async function shutdownMcpServer(): Promise<void> {
  clearInterval(idleCheckTimer);
  for (const [sid, session] of sessions.entries()) {
    try {
      await session.transport.close();
    } catch {}
    sessions.delete(sid);
  }
  for (const transport of sseLegacyTransports.values()) {
    try {
      await transport.close();
    } catch {}
  }
  sseLegacyTransports.clear();
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

// Helper to determine if executed as main CLI script
const isMainModule = (): boolean => {
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
