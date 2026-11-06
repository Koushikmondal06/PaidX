import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { randomUUID } from 'node:crypto';
import { Client } from '../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js';
import { StreamableHTTPClientTransport } from '../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/cjs/client/streamableHttp.js';
import { MCP_TOOL_DEFINITIONS } from '../../mcp-server/src/tools.ts';
import { PAIDX_MCP_TOOLS } from '../../dashboard/lib/mcp/tools.ts';
import {
  createMcpSdkServer,
  validateAgentTokenWithBackend,
  maskToken,
  tokenValidationCache,
} from '../../mcp-server/src/index.ts';

test('MCP Production Integration & Transport Verification Suite', async (t) => {
  // Test 1: TypeScript Build & Registry Parity
  await t.test('1 & 2: Registry Parity: exactly 16 tools in both dashboard and mcp-server', () => {
    assert.strictEqual(MCP_TOOL_DEFINITIONS.length, 16);
    assert.strictEqual(PAIDX_MCP_TOOLS.length, 16);

    const mcpNames = MCP_TOOL_DEFINITIONS.map((t) => t.name).sort();
    const dashboardNames = PAIDX_MCP_TOOLS.map((t) => t.name).sort();
    assert.deepStrictEqual(mcpNames, dashboardNames);
  });

  // Test 2: Token Masking
  await t.test('3: Never logs raw agent tokens: masks secret bytes', () => {
    const raw = 'paidx_agt_live_prod_abcdef1234567890abcdef1234567890';
    const masked = maskToken(raw);
    assert.strictEqual(masked.startsWith('paidx_agt_live'), true);
    assert.strictEqual(masked.endsWith('7890'), true);
    assert.strictEqual(masked.includes('...'), true);
    assert.strictEqual(masked.length < raw.length, true);
  });

  // Test 3: Actual HTTP MCP Handshake, Tool Listing, Read-Only Operations
  await t.test('4, 5, 6, 7: Actual HTTP MCP initialization, 16 tools listing & read-only execution', async () => {
    // Spin up an ephemeral backend mock representing PaidX Orchestrator
    const backendPort = 39100 + Math.floor(Math.random() * 500);
    const validToken = 'paidx_agt_test_valid_' + randomUUID().replace(/-/g, '');
    const isolatedToken = 'paidx_agt_test_isolated_' + randomUUID().replace(/-/g, '');
    const revokedToken = 'paidx_agt_test_revoked_' + randomUUID().replace(/-/g, '');

    const mockBackend = http.createServer((req, res) => {
      const auth = req.headers['authorization'] || '';
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}');

        if (auth !== `Bearer ${validToken}` && auth !== `Bearer ${isolatedToken}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.id,
              error: { code: -32001, message: 'Unauthorized: Invalid or revoked token' },
            })
          );
          return;
        }

        if (parsed.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
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
          const isAgentA = auth === `Bearer ${validToken}`;
          const walletAddr = isAgentA ? '0.0.5449200' : '0.0.5449201';

          if (toolName === 'get_wallet_address') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({ address: walletAddr, network: 'hedera:testnet' }),
                    },
                  ],
                },
              })
            );
            return;
          }

          if (toolName === 'get_wallet_balance') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        account: walletAddr,
                        asset: 'USDC',
                        tokenId: '0.0.5449156',
                        balance: '150.00',
                      }),
                    },
                  ],
                },
              })
            );
            return;
          }
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      });
    });

    await new Promise<void>((resolve) => mockBackend.listen(backendPort, '127.0.0.1', () => resolve()));
    const backendUrl = `http://127.0.0.1:${backendPort}/api/mcp`;

    // Spin up an ephemeral standalone MCP server instance wired to the mock backend
    const mcpPort = backendPort + 10;
    const { StreamableHTTPServerTransport } = await import(
      '../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/streamableHttp.js'
    );
    const { isInitializeRequest } = await import(
      '../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js'
    );

    const testSessions = new Map<string, any>();
    const mcpTestServer = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', toolsCount: MCP_TOOL_DEFINITIONS.length }));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/mcp') {
        const auth = req.headers['authorization'] as string;
        if (!auth) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32001, message: 'Unauthorized: Missing Token' },
              id: null,
            })
          );
          return;
        }

        const validCheck = await validateAgentTokenWithBackend(auth, backendUrl);
        if (!validCheck.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32001, message: validCheck.error },
              id: null,
            })
          );
          return;
        }

        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          const parsed = body ? JSON.parse(body) : undefined;
          const sessionId = req.headers['mcp-session-id'] as string;
          let session = sessionId ? testSessions.get(sessionId) : undefined;

          if (sessionId && !session) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }));
            return;
          }

          if (session) {
            if (session.bearerToken !== auth) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Forbidden' }, id: null }));
              return;
            }
            await session.transport.handleRequest(req, res, parsed);
            return;
          }

          if (!sessionId && isInitializeRequest(parsed)) {
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              enableJsonResponse: true,
              onsessioninitialized: (sid) => {
                testSessions.set(sid, { transport, bearerToken: auth });
              },
            });
            const mcpSdkServer = createMcpSdkServer(auth, backendUrl);
            await mcpSdkServer.connect(transport);
            await transport.handleRequest(req, res, parsed);
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad request' }));
        });
        return;
      }

      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) => mcpTestServer.listen(mcpPort, '127.0.0.1', () => resolve()));

    try {
      // 1. Connect Client A with valid token
      const clientA = new Client({ name: 'IntegrationClientA', version: '1.0.0' });
      const transportA = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${validToken}` } },
      });
      await clientA.connect(transportA);

      // Verify listTools returns 16 tools
      const toolList = await clientA.listTools();
      assert.strictEqual(toolList.tools.length, 16);

      // Verify get_wallet_address
      const addrRes = await clientA.callTool({ name: 'get_wallet_address', arguments: {} });
      const addrData = JSON.parse((addrRes.content[0] as any).text);
      assert.strictEqual(addrData.address, '0.0.5449200');
      assert.strictEqual(addrData.network, 'hedera:testnet');

      // Verify get_wallet_balance
      const balRes = await clientA.callTool({ name: 'get_wallet_balance', arguments: { asset: 'USDC' } });
      const balData = JSON.parse((balRes.content[0] as any).text);
      assert.strictEqual(balData.account, '0.0.5449200');
      assert.strictEqual(balData.balance, '150.00');

      // 2. Cross-Agent Isolation: Connect Client B
      const clientB = new Client({ name: 'IntegrationClientB', version: '1.0.0' });
      const transportB = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${isolatedToken}` } },
      });
      await clientB.connect(transportB);

      const addrResB = await clientB.callTool({ name: 'get_wallet_address', arguments: {} });
      const addrDataB = JSON.parse((addrResB.content[0] as any).text);
      assert.strictEqual(addrDataB.address, '0.0.5449201');
      assert.notStrictEqual(addrDataA_address(addrData), addrDataB.address);

      function addrDataA_address(a: any) {
        return a.address;
      }

      await clientA.close();
      await clientB.close();

      // 3. Test Missing Token Rejected
      let missingTokenFailed = false;
      try {
        const clientNoAuth = new Client({ name: 'NoAuth', version: '1.0.0' });
        const transportNoAuth = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`));
        await clientNoAuth.connect(transportNoAuth);
      } catch (err) {
        missingTokenFailed = true;
      }
      assert.strictEqual(missingTokenFailed, true, 'Missing token must be rejected');

      // 4. Test Revoked / Invalid Token Rejected
      let revokedTokenFailed = false;
      try {
        const clientRevoked = new Client({ name: 'Revoked', version: '1.0.0' });
        const transportRevoked = new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${mcpPort}/mcp`),
          { requestInit: { headers: { Authorization: `Bearer ${revokedToken}` } } }
        );
        await clientRevoked.connect(transportRevoked);
      } catch (err) {
        revokedTokenFailed = true;
      }
      assert.strictEqual(revokedTokenFailed, true, 'Revoked token must be rejected');
    } finally {
      await new Promise<void>((resolve) => mcpTestServer.close(() => resolve()));
      await new Promise<void>((resolve) => mockBackend.close(() => resolve()));
    }
  });

  // Test 8: Backend Timeout Handling
  await t.test('14: Backend timeout handled gracefully without process crash', async () => {
    // Ephemeral hanging backend
    const timeoutPort = 39800 + Math.floor(Math.random() * 100);
    const hangingBackend = http.createServer((_req, _res) => {
      // Intentionally never respond to simulate backend hanging
    });
    await new Promise<void>((resolve) => hangingBackend.listen(timeoutPort, '127.0.0.1', () => resolve()));

    try {
      tokenValidationCache.clear();
      const val = await validateAgentTokenWithBackend(
        'Bearer paidx_agt_timeout_test',
        `http://127.0.0.1:${timeoutPort}/api/mcp`,
        150 // fast timeout for test execution
      );
      assert.strictEqual(val.valid, false);
      assert.match(val.error || '', /timeout|error/i);
    } finally {
      await new Promise<void>((resolve) => hangingBackend.close(() => resolve()));
    }
  });
});
