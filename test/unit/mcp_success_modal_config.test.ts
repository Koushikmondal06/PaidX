import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import {
  getPublicMcpServerUrl,
  buildMcpClientConfig,
  PRODUCTION_MCP_URL,
  LOCAL_MCP_URL,
} from '../../dashboard/lib/config/mcp.ts';
import { POST as testMcpRoute } from '../../dashboard/app/api/agents/test-mcp/route.ts';
import { setTestSupabaseClient } from '../../dashboard/lib/supabase/server.ts';
import { hashAgentToken } from '../../dashboard/lib/agent/policyEngine.ts';

test('MCP Success Modal Configuration & Backend-Assisted Verifier Suite', async (t) => {
  const originalEnvUrl = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  t.after(() => {
    if (originalEnvUrl !== undefined) {
      process.env.NEXT_PUBLIC_MCP_SERVER_URL = originalEnvUrl;
    } else {
      delete process.env.NEXT_PUBLIC_MCP_SERVER_URL;
    }
    process.env.NODE_ENV = originalNodeEnv;
    setTestSupabaseClient(null);
  });

  // --------------------------------------------------------------------------
  // Test 1: URL Resolution & Fallback Behavior
  // --------------------------------------------------------------------------
  await t.test('1: Public MCP URL resolves correctly with environment variables and safe defaults', () => {
    // 1. Explicit override via NEXT_PUBLIC_MCP_SERVER_URL
    process.env.NEXT_PUBLIC_MCP_SERVER_URL = 'https://mcp-paidx.onrender.com/mcp';
    assert.strictEqual(getPublicMcpServerUrl(), 'https://mcp-paidx.onrender.com/mcp');

    // 2. Production fallback when env var is absent
    delete process.env.NEXT_PUBLIC_MCP_SERVER_URL;
    process.env.NODE_ENV = 'production';
    assert.strictEqual(getPublicMcpServerUrl(), PRODUCTION_MCP_URL);
    assert.strictEqual(getPublicMcpServerUrl(), 'https://mcp-paidx.onrender.com/mcp');

    // 3. Development fallback
    process.env.NODE_ENV = 'development';
    assert.strictEqual(getPublicMcpServerUrl(), LOCAL_MCP_URL);
    assert.strictEqual(getPublicMcpServerUrl(), 'http://localhost:3002/mcp');

    // 4. Critical Security Rule: Never expose internal backend endpoint /api/mcp
    assert.notStrictEqual(getPublicMcpServerUrl(), 'http://localhost:3000/api/mcp');
    assert.notStrictEqual(getPublicMcpServerUrl(), '/api/mcp');
  });

  // --------------------------------------------------------------------------
  // Test 2: MCP Client Configuration JSON Generator
  // --------------------------------------------------------------------------
  await t.test('2: Generated MCP configuration JSON conforms to Claude Desktop & Cursor specs', () => {
    const testToken = 'paidx_agt_' + randomUUID().replace(/-/g, '');
    const config = buildMcpClientConfig(testToken, 'https://mcp-paidx.onrender.com/mcp');

    assert.deepStrictEqual(config, {
      mcpServers: {
        paidx: {
          url: 'https://mcp-paidx.onrender.com/mcp',
          headers: {
            Authorization: `Bearer ${testToken}`,
          },
        },
      },
    });

    const jsonString = JSON.stringify(config, null, 2);
    const parsed = JSON.parse(jsonString);
    assert.strictEqual(parsed.mcpServers.paidx.url, 'https://mcp-paidx.onrender.com/mcp');
    assert.strictEqual(parsed.mcpServers.paidx.headers.Authorization, `Bearer ${testToken}`);
    assert.strictEqual(jsonString.includes('localhost:3000/api/mcp'), false);
  });

  // --------------------------------------------------------------------------
  // Test 3: POST /api/agents/test-mcp Route Security & Token Binding
  // --------------------------------------------------------------------------
  await t.test('3: /api/agents/test-mcp enforces strict user auth and agent token ownership', async () => {
    const userId = 'user_' + randomUUID();
    const otherUserId = 'user_' + randomUUID();
    const rawToken = 'paidx_agt_' + randomUUID().replace(/-/g, '');
    const otherUserToken = 'paidx_agt_' + randomUUID().replace(/-/g, '');
    const tokenHash = hashAgentToken(rawToken);
    const otherTokenHash = hashAgentToken(otherUserToken);

    // Mock Supabase Server Client
    const mockSupabase = {
      auth: {
        getUser: async (jwt: string) => {
          if (jwt === 'valid-user-jwt') {
            return { data: { user: { id: userId, email: 'user@example.com' } }, error: null };
          }
          return { data: { user: null }, error: new Error('Invalid JWT') };
        },
      },
      from: (table: string) => {
        if (table === 'agent_connections') {
          return {
            select: () => ({
              eq: (col1: string, val1: any) => ({
                eq: (col2: string, val2: any) => ({
                  maybeSingle: async () => {
                    // Match user + token hash
                    if (val1 === tokenHash && val2 === userId) {
                      return {
                        data: {
                          id: 'agent-123',
                          agent_name: 'Claude Test Assistant',
                          status: 'active',
                          user_id: userId,
                        },
                        error: null,
                      };
                    }
                    if (val1 === otherTokenHash && val2 === otherUserId) {
                      return {
                        data: {
                          id: 'agent-456',
                          agent_name: 'Other Agent',
                          status: 'active',
                          user_id: otherUserId,
                        },
                        error: null,
                      };
                    }
                    return { data: null, error: null };
                  },
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };

    setTestSupabaseClient(mockSupabase);

    // 1. Rejects unauthenticated requests with 401
    const unauthReq = new NextRequest('http://localhost:3000/api/agents/test-mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    const unauthRes = await testMcpRoute(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    // 2. Rejects invalid token formats with 400
    const malformedReq = new NextRequest('http://localhost:3000/api/agents/test-mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-jwt',
      },
      body: JSON.stringify({ token: 'invalid_prefix_token' }),
    });
    const malformedRes = await testMcpRoute(malformedReq);
    assert.strictEqual(malformedRes.status, 400);

    // 3. Rejects another user's token with 403 Forbidden
    const crossUserReq = new NextRequest('http://localhost:3000/api/agents/test-mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-user-jwt',
      },
      body: JSON.stringify({ token: otherUserToken }),
    });
    const crossUserRes = await testMcpRoute(crossUserReq);
    assert.strictEqual(crossUserRes.status, 403);
    const crossUserJson = await crossUserRes.json();
    assert.strictEqual(crossUserJson.success, false);
    assert.match(crossUserJson.error, /Forbidden/);
  });

  // --------------------------------------------------------------------------
  // Test 4: End-to-End MCP Handshake via /api/agents/test-mcp
  // --------------------------------------------------------------------------
  await t.test('4: /api/agents/test-mcp performs live Streamable HTTP handshake with standalone MCP server', async () => {
    const userId = 'user_handshake_' + randomUUID();
    const rawToken = 'paidx_agt_hs_' + randomUUID().replace(/-/g, '');
    const tokenHash = hashAgentToken(rawToken);

    // Spin up an ephemeral standalone MCP test server
    let lastAuthHeader = '';
    let lastMethod = '';
    const mcpTestPort = 39800 + Math.floor(Math.random() * 100);

    const ephemeralMcpServer = http.createServer((req, res) => {
      lastAuthHeader = req.headers['authorization'] || '';
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.method === 'DELETE') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
          return;
        }

        const parsed = JSON.parse(body || '{}');
        lastMethod = parsed.method;

        if (parsed.method === 'initialize') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'mcp-session-id': 'test-session-' + randomUUID(),
          });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.id,
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

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unsupported method' }));
      });
    });

    await new Promise<void>((resolve) => ephemeralMcpServer.listen(mcpTestPort, '127.0.0.1', () => resolve()));

    // Point NEXT_PUBLIC_MCP_SERVER_URL to our ephemeral test server
    process.env.NEXT_PUBLIC_MCP_SERVER_URL = `http://127.0.0.1:${mcpTestPort}/mcp`;

    try {
      const mockSupabase = {
        auth: {
          getUser: async () => ({
            data: { user: { id: userId, email: 'hs@example.com' } },
            error: null,
          }),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: 'agent-hs-1',
                    agent_name: 'Claude Handshake Agent',
                    status: 'active',
                    user_id: userId,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };

      setTestSupabaseClient(mockSupabase);

      const req = new NextRequest('http://localhost:3000/api/agents/test-mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-jwt',
        },
        body: JSON.stringify({ token: rawToken }),
      });

      const res = await testMcpRoute(req);
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.mcpUrl, `http://127.0.0.1:${mcpTestPort}/mcp`);
      assert.strictEqual(json.protocolVersion, '2024-11-05');
      assert.strictEqual(json.serverInfo.name, 'paidx-mcp-server');
      assert.strictEqual(json.agentName, 'Claude Handshake Agent');

      // Verify that the standalone MCP server received the exact bearer token and initialize method
      assert.strictEqual(lastAuthHeader, `Bearer ${rawToken}`);
      assert.strictEqual(lastMethod, 'initialize');
    } finally {
      await new Promise<void>((resolve) => ephemeralMcpServer.close(() => resolve()));
    }
  });
});
