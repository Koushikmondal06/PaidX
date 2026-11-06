import http from 'http';
import dotenv from 'dotenv';
import { MCP_TOOL_DEFINITIONS } from './tools.js';

dotenv.config();

const PORT = parseInt(process.env.MCP_PORT || '3002', 10);
const PAIDX_BACKEND_URL = process.env.PAIDX_BACKEND_URL || 'http://localhost:3000/api/mcp';

/**
 * PaidX Dedicated Remote MCP Server
 * Exposes Streamable HTTP and SSE transports for AI agents (Claude Desktop, Cursor, OpenAI Agents).
 */
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';

  // 1. Health & Discovery Endpoint
  if (req.method === 'GET' && (url === '/' || url === '/mcp' || url === '/health')) {
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

  // 2. Server-Sent Events (SSE) Transport
  if (req.method === 'GET' && url === '/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    res.write(`event: endpoint\ndata: ${url}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
    return;
  }

  // 3. Streamable HTTP / JSON-RPC 2.0 Endpoint
  if (req.method === 'POST' && (url === '/mcp' || url === '/api/mcp' || url === '/')) {
    let bodyStr = '';
    req.on('data', (chunk) => {
      bodyStr += chunk;
    });

    req.on('end', async () => {
      try {
        const authHeader = req.headers['authorization'] || '';
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

        // Handle tools/list locally or forward
        if (method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                tools: MCP_TOOL_DEFINITIONS,
              },
            })
          );
          return;
        }

        // Authenticate tool execution against backend orchestrator
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

        // Forward tool execution to backend orchestrator
        const backendRes = await fetch(PAIDX_BACKEND_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: bodyStr,
        });

        const data = await backendRes.json();
        res.writeHead(backendRes.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
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

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`  PaidX Dedicated MCP Server running on port ${PORT}`);
  console.log(`  Transport: Streamable HTTP & SSE`);
  console.log(`  URL: http://localhost:${PORT}/mcp`);
  console.log(`  Connected Backend Orchestrator: ${PAIDX_BACKEND_URL}`);
  console.log(`=======================================================`);
});
