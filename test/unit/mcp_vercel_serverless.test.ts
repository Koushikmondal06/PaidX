import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import {
  handleHealthRequest,
  handleMcpRequest,
  handleVercelRequest,
  generateDurableSessionId,
  verifyDurableSessionId,
  createMcpSdkServer,
  validateAgentTokenWithBackend,
  applyCorsHeaders,
  sessions,
  tokenValidationCache,
} from '../../mcp-server/src/server.ts';
import { MCP_TOOL_DEFINITIONS } from '../../mcp-server/src/tools.ts';
import healthHandler from '../../mcp-server/api/health.js';
import mcpHandler from '../../mcp-server/api/mcp.js';
import indexHandler from '../../mcp-server/api/index.js';

// Helper to create mock Node.js HTTP request/response objects
function createMockHttp(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
}) {
  const req = new EventEmitter() as any;
  req.method = options.method || 'GET';
  req.url = options.url || '/';
  const headers = { host: 'agents.paidx.cc', ...(options.headers || {}) };
  req.headers = headers;
  req.rawHeaders = Object.entries(headers).flatMap(([k, v]) => [k, String(v)]);
  req.body = options.body !== undefined ? options.body : undefined;
  req.resume = () => req;
  req.pause = () => req;
  req.destroy = () => req;
  req.readableEnded = true;

  let statusCode = 200;
  const headersSentMap: Record<string, string> = {};
  let responseData = '';
  let finished = false;

  const res = new EventEmitter() as any;
  res.headersSent = false;
  res.statusCode = 200;

  res.setHeader = (name: string, value: string) => {
    headersSentMap[name.toLowerCase()] = String(value);
  };
  res.getHeader = (name: string) => headersSentMap[name.toLowerCase()];
  res.getHeaders = () => ({ ...headersSentMap });

  res.writeHead = (code: number, headers?: Record<string, string>) => {
    statusCode = code;
    res.statusCode = code;
    res.headersSent = true;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        headersSentMap[k.toLowerCase()] = String(v);
      }
    }
    return res;
  };

  res.write = (chunk: any) => {
    if (chunk) {
      if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
        responseData += Buffer.from(chunk).toString('utf-8');
      } else {
        responseData += chunk.toString();
      }
    }
    return true;
  };

  res.end = (chunk?: any) => {
    if (chunk) {
      if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
        responseData += Buffer.from(chunk).toString('utf-8');
      } else {
        responseData += chunk.toString();
      }
    }
    finished = true;
    res.emit('finish');
    res.emit('close');
    return res;
  };

  const getResult = () => ({
    statusCode,
    headers: headersSentMap,
    body: responseData,
    json: () => {
      try {
        return JSON.parse(responseData);
      } catch {
        return null;
      }
    },
    finished,
  });

  return { req, res, getResult };
}

test('Vercel Serverless MCP Deployment, Endpoints & Session Suite', async (t) => {
  t.beforeEach(() => {
    sessions.clear();
    tokenValidationCache.clear();
  });

  t.afterEach(() => {
    sessions.clear();
    tokenValidationCache.clear();
  });

  // --------------------------------------------------------------------------
  // 1. Tool Parity: All 16 registered tools
  // --------------------------------------------------------------------------
  await t.test('1: Preserves all 16 registered MCP tools with correct schemas', () => {
    assert.strictEqual(MCP_TOOL_DEFINITIONS.length, 16);
    const expectedTools = [
      'get_connected_wallet',
      'get_wallet_address',
      'get_wallet_balance',
      'get_supported_assets',
      'get_supported_networks',
      'prepare_wallet_payment',
      'execute_wallet_payment',
      'get_payment_status',
      'get_transaction_details',
      'get_payment_history',
      'get_agent_permissions',
      'get_agent_spending_limit',
      'get_agent_spending_history',
      'request_payment_approval',
      'get_hedera_payment_audit',
      'verify_hedera_payment',
    ];

    for (const toolName of expectedTools) {
      const found = MCP_TOOL_DEFINITIONS.find((t) => t.name === toolName);
      assert.ok(found, `Tool ${toolName} must be registered`);
      assert.ok(found.inputSchema);
    }
  });

  // --------------------------------------------------------------------------
  // 2. Health Endpoint: GET /health
  // --------------------------------------------------------------------------
  await t.test('2: GET /health returns HTTP 200 and operational metadata', async () => {
    const { req, res, getResult } = createMockHttp({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://console.paidx.cc' },
    });

    await handleHealthRequest(req, res);
    const result = getResult();

    assert.strictEqual(result.statusCode, 200);
    const json = result.json();
    assert.strictEqual(json.status, 'healthy');
    assert.strictEqual(json.name, 'paidx-mcp-server');
    assert.strictEqual(json.version, '1.0.0');
    assert.strictEqual(json.transport, 'streamable-http');
    assert.strictEqual(json.protocolVersion, '2024-11-05');
    assert.strictEqual(json.toolsCount, 16);
    assert.strictEqual(json.runtime, 'vercel-serverless');
  });

  // --------------------------------------------------------------------------
  // 3. Authentication & Token Guards
  // --------------------------------------------------------------------------
  await t.test('3: Rejects missing, malformed, and unauthorized agent tokens', async () => {
    // 3a. Missing Authorization header
    const { req: req1, res: res1, getResult: getRes1 } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } },
      },
    });
    await handleMcpRequest(req1, res1);
    assert.strictEqual(getRes1().statusCode, 401);
    assert.match(getRes1().json().error.message, /Missing PaidX Agent Bearer Token/);

    // 3b. Malformed Authorization header
    const { req: req2, res: res2, getResult: getRes2 } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
      body: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    });
    await handleMcpRequest(req2, res2);
    assert.strictEqual(getRes2().statusCode, 401);
    assert.match(getRes2().json().error.message, /Invalid token format/);
  });

  // --------------------------------------------------------------------------
  // 4. Live MCP Initialization & Tools List with Mock Backend Orchestrator
  // --------------------------------------------------------------------------
  await t.test('4: Live MCP initialization and tools/list execution via Streamable HTTP', async () => {
    const backendPort = 39200 + Math.floor(Math.random() * 500);
    const validToken = 'paidx_agt_valid_' + randomUUID().replace(/-/g, '');
    const revokedToken = 'paidx_agt_revoked_' + randomUUID().replace(/-/g, '');

    const mockBackend = http.createServer((bReq, bRes) => {
      const auth = bReq.headers['authorization'] || '';
      let body = '';
      bReq.on('data', (c) => (body += c));
      bReq.on('end', () => {
        if (auth === `Bearer ${revokedToken}`) {
          bRes.writeHead(401, { 'Content-Type': 'application/json' });
          bRes.end(JSON.stringify({ error: { code: -32001, message: 'Agent token revoked' } }));
          return;
        }

        if (auth !== `Bearer ${validToken}`) {
          bRes.writeHead(401, { 'Content-Type': 'application/json' });
          bRes.end(JSON.stringify({ error: { code: -32001, message: 'Invalid token' } }));
          return;
        }

        const parsed = JSON.parse(body || '{}');
        if (parsed.method === 'tools/list') {
          bRes.writeHead(200, { 'Content-Type': 'application/json' });
          bRes.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.id,
              result: {
                tools: MCP_TOOL_DEFINITIONS.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: tool.inputSchema,
                })),
              },
            })
          );
          return;
        }

        if (parsed.method === 'tools/call') {
          const toolName = parsed.params?.name;
          if (toolName === 'get_wallet_address') {
            bRes.writeHead(200, { 'Content-Type': 'application/json' });
            bRes.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.id,
                result: {
                  content: [{ type: 'text', text: JSON.stringify({ address: '0.0.5449200' }) }],
                },
              })
            );
            return;
          }
        }

        bRes.writeHead(404, { 'Content-Type': 'application/json' });
        bRes.end(JSON.stringify({ error: 'Not found' }));
      });
    });

    await new Promise<void>((resolve) => mockBackend.listen(backendPort, '127.0.0.1', () => resolve()));
    const backendUrl = `http://127.0.0.1:${backendPort}/api/mcp`;

    try {
      // Step A: Initialize Request
      const { req: initReq, res: initRes, getResult: getInitResult } = createMockHttp({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'Claude-Desktop-Test', version: '1.0' },
          },
        },
      });

      // Temporarily override PAIDX_BACKEND_URL for live test
      const originalBackend = process.env.PAIDX_BACKEND_URL;
      process.env.PAIDX_BACKEND_URL = backendUrl;

      await handleMcpRequest(initReq, initRes);
      const initResult = getInitResult();

      assert.strictEqual(initResult.statusCode, 200);
      const initJson = initResult.json();
      assert.strictEqual(initJson.result.protocolVersion, '2024-11-05');
      assert.strictEqual(initJson.result.serverInfo.name, 'paidx-mcp-server');

      // Verify that a durable session ID was generated and set in response header
      const sessionId = initResult.headers['mcp-session-id'];
      assert.ok(sessionId, 'mcp-session-id header must be returned on initialize');
      assert.ok(sessionId.startsWith('paidx_sess_'));

      // --------------------------------------------------------------------------
      // 5. Session Handling Across Separate Serverless Invocations (Cold Lambda)
      // --------------------------------------------------------------------------
      // Clear in-memory Map completely to simulate invocation on a completely different microVM
      sessions.clear();
      tokenValidationCache.clear();
      assert.strictEqual(sessions.size, 0);

      // MicroVM B receives tools/list request with mcp-session-id
      const { req: listReq, res: listRes, getResult: getListResult } = createMockHttp({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${validToken}`,
          'mcp-session-id': sessionId,
          'mcp-protocol-version': '2024-11-05',
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        },
      });

      await handleMcpRequest(listReq, listRes);
      const listResult = getListResult();

      assert.strictEqual(listResult.statusCode, 200);
      const listJson = listResult.json();
      assert.ok(listJson.result);
      assert.strictEqual(listJson.result.tools.length, 16);

      // --------------------------------------------------------------------------
      // 6. Cross-Agent Isolation Guard Across MicroVMs
      // --------------------------------------------------------------------------
      // Another agent token attempts to reuse sessionId belonging to validToken
      const otherAgentToken = 'paidx_agt_other_' + randomUUID().replace(/-/g, '');
      const { req: crossReq, res: crossRes, getResult: getCrossResult } = createMockHttp({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${otherAgentToken}`,
          'mcp-session-id': sessionId,
          'mcp-protocol-version': '2024-11-05',
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/list',
        },
      });

      await handleMcpRequest(crossReq, crossRes);
      const crossResult = getCrossResult();

      assert.strictEqual(crossResult.statusCode, 403);
      assert.match(crossResult.json().error.message, /bound to a different agent token/);

      // --------------------------------------------------------------------------
      // 7. Revoked Token Rejection
      // --------------------------------------------------------------------------
      const { req: revReq, res: revRes, getResult: getRevResult } = createMockHttp({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${revokedToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/list',
        },
      });

      await handleMcpRequest(revReq, revRes);
      assert.strictEqual(getRevResult().statusCode, 401);

      // --------------------------------------------------------------------------
      // 8. Read-Only Tool Execution (get_wallet_address)
      // --------------------------------------------------------------------------
      const { req: callReq, res: callRes, getResult: getCallResult } = createMockHttp({
        method: 'POST',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${validToken}`,
          'mcp-session-id': sessionId,
          'mcp-protocol-version': '2024-11-05',
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'get_wallet_address', arguments: {} },
        },
      });

      await handleMcpRequest(callReq, callRes);
      const callResult = getCallResult();
      assert.strictEqual(callResult.statusCode, 200);
      const callJson = callResult.json();
      assert.ok(callJson.result.content);
      assert.match(callJson.result.content[0].text, /0.0.5449200/);

      // --------------------------------------------------------------------------
      // 9. Session Cleanup (DELETE /mcp) Across MicroVMs
      // --------------------------------------------------------------------------
      const { req: delReq, res: delRes, getResult: getDelResult } = createMockHttp({
        method: 'DELETE',
        url: '/mcp',
        headers: {
          authorization: `Bearer ${validToken}`,
          'mcp-session-id': sessionId,
        },
      });

      await handleMcpRequest(delReq, delRes);
      assert.strictEqual(getDelResult().statusCode, 200);

      // Restore PAIDX_BACKEND_URL
      if (originalBackend !== undefined) {
        process.env.PAIDX_BACKEND_URL = originalBackend;
      } else {
        delete process.env.PAIDX_BACKEND_URL;
      }
    } finally {
      await new Promise<void>((resolve) => mockBackend.close(() => resolve()));
    }
  });

  // --------------------------------------------------------------------------
  // 10. Vercel API Route Handlers Integration (api/health, api/mcp, api/index)
  // --------------------------------------------------------------------------
  await t.test('10: Vercel serverless function entrypoints (api/health, api/mcp, api/index)', async () => {
    // 10a: api/health handler
    const { req: hReq, res: hRes, getResult: getHResult } = createMockHttp({ method: 'GET', url: '/api/health' });
    await healthHandler(hReq, hRes);
    assert.strictEqual(getHResult().statusCode, 200);
    assert.strictEqual(getHResult().json().status, 'healthy');

    // 10b: api/index dispatcher on /health
    const { req: iReq, res: iRes, getResult: getIResult } = createMockHttp({ method: 'GET', url: '/health' });
    await indexHandler(iReq, iRes);
    assert.strictEqual(getIResult().statusCode, 200);
    assert.strictEqual(getIResult().json().status, 'healthy');

    // 10c: OPTIONS preflight check on api/mcp
    const { req: optReq, res: optRes, getResult: getOptResult } = createMockHttp({
      method: 'OPTIONS',
      url: '/api/mcp',
      headers: { origin: 'https://console.paidx.cc' },
    });
    await mcpHandler(optReq, optRes);
    assert.strictEqual(getOptResult().statusCode, 204);
    assert.strictEqual(getOptResult().headers['access-control-allow-origin'], 'https://console.paidx.cc');
  });
});
