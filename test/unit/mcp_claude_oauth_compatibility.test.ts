import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { EventEmitter } from 'events';
import { randomUUID, createHash } from 'crypto';
import {
  handleVercelRequest,
  handleMcpRequest,
  handleHealthRequest,
  handleProtectedResourceMetadata,
  handleAuthorizationServerMetadata,
  handleClientRegistration,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleOAuthRevoke,
  generateAuthorizationCode,
  verifyAuthorizationCode,
  generateOAuthTokens,
  verifyOAuthAccessToken,
  validateAuthHeader,
  getServerOrigin,
  getWwwAuthenticateHeader,
  sessions,
  tokenValidationCache,
  usedAuthorizationCodes,
  revokedTokenIds,
} from '../../mcp-server/src/server.js';
import { MCP_TOOL_DEFINITIONS } from '../../mcp-server/src/tools.js';

/**
 * Creates a mock HTTP request and response pair for testing Node.js serverless handlers.
 */
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

test('PaidX MCP Claude OAuth 2.1 & Authentication Compatibility Suite', async (t) => {
  // Clear caches before tests
  sessions.clear();
  tokenValidationCache.clear();
  usedAuthorizationCodes.clear();
  revokedTokenIds.clear();

  // Setup Mock PaidX Backend for Token Validation & Tool Execution
  const backendPort = 39400 + Math.floor(Math.random() * 500);
  const validAgentToken = 'paidx_agt_claudetest_' + randomUUID().replace(/-/g, '');
  const revokedAgentToken = 'paidx_agt_revoked_' + randomUUID().replace(/-/g, '');

  const mockBackend = http.createServer((bReq, bRes) => {
    const auth = bReq.headers['authorization'] || '';
    let body = '';
    bReq.on('data', (c) => (body += c));
    bReq.on('end', () => {
      if (auth === `Bearer ${revokedAgentToken}`) {
        bRes.writeHead(401, { 'Content-Type': 'application/json' });
        bRes.end(JSON.stringify({ error: { code: -32001, message: 'Agent token revoked' } }));
        return;
      }

      if (auth !== `Bearer ${validAgentToken}`) {
        bRes.writeHead(401, { 'Content-Type': 'application/json' });
        bRes.end(JSON.stringify({ error: { code: -32001, message: 'Invalid PaidX Agent Token' } }));
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

        if (toolName === 'execute_wallet_payment') {
          bRes.writeHead(200, { 'Content-Type': 'application/json' });
          bRes.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: parsed.id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ txId: '0.0.5449200@1700000000', status: 'SUCCESS' }) }],
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
  const originalBackend = process.env.PAIDX_BACKEND_URL;
  process.env.PAIDX_BACKEND_URL = backendUrl;

  t.after(async () => {
    if (originalBackend !== undefined) {
      process.env.PAIDX_BACKEND_URL = originalBackend;
    } else {
      delete process.env.PAIDX_BACKEND_URL;
    }
    await new Promise<void>((resolve) => mockBackend.close(() => resolve()));
  });

  // --------------------------------------------------------------------------
  // 1. RFC 9728 Protected Resource Metadata Discovery
  // --------------------------------------------------------------------------
  await t.test('1: RFC 9728 Protected Resource Metadata is advertised at /.well-known/oauth-protected-resource', async () => {
    const { req, res, getResult } = createMockHttp({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
      headers: { host: 'mcp-paidx.onrender.com' },
    });

    await handleVercelRequest(req, res);
    const result = getResult();

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.headers['content-type'], 'application/json');
    assert.strictEqual(result.headers['access-control-allow-origin'], '*');

    const json = result.json();
    assert.strictEqual(json.resource, 'https://mcp-paidx.onrender.com/mcp');
    assert.deepStrictEqual(json.authorization_servers, ['https://mcp-paidx.onrender.com']);
    assert.deepStrictEqual(json.scopes_supported, ['mcp:tools']);
    assert.deepStrictEqual(json.bearer_methods_supported, ['header']);
    assert.strictEqual(json.resource_name, 'PaidX Agent Commerce');

    // Also check path-aware endpoint: /.well-known/oauth-protected-resource/mcp
    const { req: pReq, res: pRes, getResult: getPResult } = createMockHttp({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource/mcp',
      headers: { host: 'mcp-paidx.onrender.com' },
    });
    await handleVercelRequest(pReq, pRes);
    assert.strictEqual(getPResult().statusCode, 200);
  });

  // --------------------------------------------------------------------------
  // 2. RFC 8414 Authorization Server Metadata & OpenID Configuration
  // --------------------------------------------------------------------------
  await t.test('2: RFC 8414 OAuth Metadata is advertised at /.well-known/oauth-authorization-server and openid-configuration', async () => {
    const { req, res, getResult } = createMockHttp({
      method: 'GET',
      url: '/.well-known/oauth-authorization-server',
      headers: { host: 'mcp-paidx.onrender.com' },
    });

    await handleVercelRequest(req, res);
    const result = getResult();

    assert.strictEqual(result.statusCode, 200);
    const json = result.json();
    assert.strictEqual(json.issuer, 'https://mcp-paidx.onrender.com');
    assert.strictEqual(json.authorization_endpoint, 'https://mcp-paidx.onrender.com/oauth/authorize');
    assert.strictEqual(json.token_endpoint, 'https://mcp-paidx.onrender.com/oauth/token');
    assert.strictEqual(json.registration_endpoint, 'https://mcp-paidx.onrender.com/oauth/register');
    assert.strictEqual(json.revocation_endpoint, 'https://mcp-paidx.onrender.com/oauth/revoke');
    assert.deepStrictEqual(json.code_challenge_methods_supported, ['S256']);
    assert.deepStrictEqual(json.grant_types_supported, ['authorization_code', 'refresh_token']);

    // Check OpenID Discovery alias
    const { req: oReq, res: oRes, getResult: getOResult } = createMockHttp({
      method: 'GET',
      url: '/.well-known/openid-configuration',
      headers: { host: 'mcp-paidx.onrender.com' },
    });
    await handleVercelRequest(oReq, oRes);
    assert.strictEqual(getOResult().statusCode, 200);
  });

  // --------------------------------------------------------------------------
  // 3. WWW-Authenticate Header on Unauthenticated Probe
  // --------------------------------------------------------------------------
  await t.test('3: Unauthenticated /mcp probe returns HTTP 401 with WWW-Authenticate pointing to PRM', async () => {
    const { req, res, getResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'Claude', version: '1.0' } },
      },
    });

    await handleMcpRequest(req, res);
    const result = getResult();

    assert.strictEqual(result.statusCode, 401);
    const wwwAuth = result.headers['www-authenticate'];
    assert.ok(wwwAuth, 'WWW-Authenticate header must be present');
    assert.match(
      wwwAuth,
      /Bearer resource_metadata="https:\/\/mcp-paidx\.onrender\.com\/\.well-known\/oauth-protected-resource"/
    );

    // Verify CORS exposure of WWW-Authenticate
    const exposeHeaders = result.headers['access-control-expose-headers'];
    assert.ok(exposeHeaders, 'Access-Control-Expose-Headers must be set');
    assert.match(exposeHeaders.toLowerCase(), /www-authenticate/);
  });

  // --------------------------------------------------------------------------
  // 4. Dynamic Client Registration (RFC 7591)
  // --------------------------------------------------------------------------
  let registeredClientId = '';
  await t.test('4: RFC 7591 Dynamic Client Registration issues client_id to Claude connector', async () => {
    const { req, res, getResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/register',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        client_name: 'Claude Custom Connector',
        redirect_uris: ['https://claude.ai/api/auth/callback/mcp'],
        token_endpoint_auth_method: 'none',
      },
    });

    await handleVercelRequest(req, res);
    const result = getResult();

    assert.strictEqual(result.statusCode, 201);
    const json = result.json();
    assert.ok(json.client_id);
    assert.strictEqual(json.client_name, 'Claude Custom Connector');
    assert.deepStrictEqual(json.redirect_uris, ['https://claude.ai/api/auth/callback/mcp']);
    registeredClientId = json.client_id;
  });

  // --------------------------------------------------------------------------
  // 5. OAuth 2.1 Authorization Endpoint (Consent & Code Generation)
  // --------------------------------------------------------------------------
  const codeVerifier = 'paidx_test_pkce_verifier_long_secure_string_1234567890_abcdef';
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  let authCode = '';

  await t.test('5: GET /oauth/authorize renders consent HTML and POST /oauth/authorize validates agent token', async () => {
    // A: GET /oauth/authorize renders consent screen
    const { req: getReq, res: getRes, getResult: getGetResult } = createMockHttp({
      method: 'GET',
      url: `/oauth/authorize?response_type=code&client_id=${registeredClientId}&redirect_uri=https://claude.ai/api/auth/callback/mcp&code_challenge=${codeChallenge}&code_challenge_method=S256&state=claude_state_123`,
      headers: { host: 'mcp-paidx.onrender.com' },
    });

    await handleVercelRequest(getReq, getRes);
    const getResult = getGetResult();
    assert.strictEqual(getResult.statusCode, 200);
    assert.match(getResult.body, /Authorize Claude/);
    assert.match(getResult.body, /PaidX Agent Bearer Token/);

    // B: POST /oauth/authorize with invalid agent token fails with 401
    const { req: failReq, res: failRes, getResult: getFailResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json', accept: 'application/json' },
      body: {
        client_id: registeredClientId,
        redirect_uri: 'https://claude.ai/api/auth/callback/mcp',
        state: 'claude_state_123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        agent_token: 'paidx_agt_bogus_token_1234567890',
      },
    });

    await handleVercelRequest(failReq, failRes);
    assert.strictEqual(getFailResult().statusCode, 401);

    // C: POST /oauth/authorize with valid agent token generates authorization code and redirect
    const { req: authReq, res: authRes, getResult: getAuthResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/authorize',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json', accept: 'application/json' },
      body: {
        client_id: registeredClientId,
        redirect_uri: 'https://claude.ai/api/auth/callback/mcp',
        state: 'claude_state_123',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        agent_token: validAgentToken,
      },
    });

    await handleVercelRequest(authReq, authRes);
    const authResult = getAuthResult();
    assert.strictEqual(authResult.statusCode, 200);
    const authJson = authResult.json();
    assert.ok(authJson.code, 'Authorization code must be generated');
    assert.ok(authJson.redirect_uri.includes('code='), 'Redirect URI must contain code');
    authCode = authJson.code;
  });

  // --------------------------------------------------------------------------
  // 6. OAuth 2.1 Token Exchange with Mandatory PKCE (S256)
  // --------------------------------------------------------------------------
  let claudeOAuthAccessToken = '';
  let claudeOAuthRefreshToken = '';

  await t.test('6: POST /oauth/token enforces PKCE (S256) and issues OAuth tokens mapped to agent identity', async () => {
    // A: Invalid PKCE code_verifier is strictly rejected with 400 invalid_grant
    const { req: pkceFailReq, res: pkceFailRes, getResult: getPkceFailResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/token',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        grant_type: 'authorization_code',
        code: authCode,
        client_id: registeredClientId,
        code_verifier: 'wrong_verifier_12345',
        redirect_uri: 'https://claude.ai/api/auth/callback/mcp',
      },
    });

    await handleVercelRequest(pkceFailReq, pkceFailRes);
    assert.strictEqual(getPkceFailResult().statusCode, 400);
    assert.strictEqual(getPkceFailResult().json().error, 'invalid_grant');
    assert.match(getPkceFailResult().json().error_description, /PKCE/);

    // B: Valid PKCE verification succeeds and issues access_token and refresh_token
    const { req: tokenReq, res: tokenRes, getResult: getTokenResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/token',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        grant_type: 'authorization_code',
        code: authCode,
        client_id: registeredClientId,
        code_verifier: codeVerifier,
        redirect_uri: 'https://claude.ai/api/auth/callback/mcp',
      },
    });

    await handleVercelRequest(tokenReq, tokenRes);
    const tokenResult = getTokenResult();
    assert.strictEqual(tokenResult.statusCode, 200);
    const tokenJson = tokenResult.json();

    assert.ok(tokenJson.access_token);
    assert.ok(tokenJson.access_token.startsWith('paidx_oat_'), 'Access token must have paidx_oat_ prefix');
    assert.ok(tokenJson.refresh_token.startsWith('paidx_ort_'), 'Refresh token must have paidx_ort_ prefix');
    assert.strictEqual(tokenJson.token_type, 'Bearer');
    assert.strictEqual(tokenJson.expires_in, 86400);

    claudeOAuthAccessToken = tokenJson.access_token;
    claudeOAuthRefreshToken = tokenJson.refresh_token;

    // C: Anti-replay: redeeming the same authorization code again is rejected
    const { req: replayReq, res: replayRes, getResult: getReplayResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/token',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        grant_type: 'authorization_code',
        code: authCode,
        client_id: registeredClientId,
        code_verifier: codeVerifier,
        redirect_uri: 'https://claude.ai/api/auth/callback/mcp',
      },
    });
    await handleVercelRequest(replayReq, replayRes);
    assert.strictEqual(getReplayResult().statusCode, 400);
    assert.strictEqual(getReplayResult().json().error, 'invalid_grant');
    assert.match(getReplayResult().json().error_description, /already been redeemed/);
  });

  // --------------------------------------------------------------------------
  // 7. End-to-End MCP Protocol Execution via Authenticated Claude OAuth Token
  // --------------------------------------------------------------------------
  let mcpSessionId = '';

  await t.test('7: Authenticated Claude uses OAuth access token for initialize, tools/list, and read-only tool execution', async () => {
    // Step A: Claude performs MCP initialization with Authorization: Bearer paidx_oat_...
    const { req: initReq, res: initRes, getResult: getInitResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${claudeOAuthAccessToken}`,
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
          clientInfo: { name: 'Claude-Web-Connector', version: '2.0' },
        },
      },
    });

    await handleMcpRequest(initReq, initRes);
    const initResult = getInitResult();

    assert.strictEqual(initResult.statusCode, 200);
    const initJson = initResult.json();
    assert.strictEqual(initJson.result.protocolVersion, '2024-11-05');
    assert.strictEqual(initJson.result.serverInfo.name, 'paidx-mcp-server');

    mcpSessionId = initResult.headers['mcp-session-id'];
    assert.ok(mcpSessionId, 'mcp-session-id must be returned');

    // Step B: Claude lists all 16 MCP tools
    const { req: listReq, res: listRes, getResult: getListResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${claudeOAuthAccessToken}`,
        'mcp-session-id': mcpSessionId,
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
    assert.strictEqual(listJson.result.tools.length, 19);

    // Step C: Read-only tool execution (get_wallet_address) via Claude OAuth token
    const { req: callReq, res: callRes, getResult: getCallResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${claudeOAuthAccessToken}`,
        'mcp-session-id': mcpSessionId,
        'mcp-protocol-version': '2024-11-05',
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'get_wallet_address', arguments: {} },
      },
    });

    await handleMcpRequest(callReq, callRes);
    const callResult = getCallResult();
    assert.strictEqual(callResult.statusCode, 200);
    assert.match(callResult.json().result.content[0].text, /0.0.5449200/);
  });

  // --------------------------------------------------------------------------
  // 8. Token Refresh and Revocation Lifecycle
  // --------------------------------------------------------------------------
  await t.test('8: OAuth token refresh issues new token and revocation blocks subsequent access', async () => {
    // A: Refresh token exchange
    const { req: refReq, res: refRes, getResult: getRefResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/token',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        grant_type: 'refresh_token',
        refresh_token: claudeOAuthRefreshToken,
      },
    });

    await handleVercelRequest(refReq, refRes);
    const refResult = getRefResult();
    assert.strictEqual(refResult.statusCode, 200);
    const refreshedToken = refResult.json().access_token;
    assert.ok(refreshedToken.startsWith('paidx_oat_'));

    // B: Revoke access token
    const { req: revReq, res: revRes, getResult: getRevResult } = createMockHttp({
      method: 'POST',
      url: '/oauth/revoke',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        token: refreshedToken,
      },
    });

    await handleVercelRequest(revReq, revRes);
    assert.strictEqual(getRevResult().statusCode, 200);
    assert.strictEqual(getRevResult().json().status, 'revoked');

    // C: Calling /mcp with revoked token is rejected with 401 and invalid_token error
    const { req: testReq, res: testRes, getResult: getTestResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${refreshedToken}`,
        'content-type': 'application/json',
      },
      body: {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
      },
    });

    await handleMcpRequest(testReq, testRes);
    assert.strictEqual(getTestResult().statusCode, 401);
    assert.match(getTestResult().headers['www-authenticate'], /error="invalid_token"/);
  });

  // --------------------------------------------------------------------------
  // 9. Backwards Compatibility for Existing Static Agent Tokens
  // --------------------------------------------------------------------------
  await t.test('9: Preserves full backwards compatibility for static Bearer paidx_agt_ tokens', async () => {
    // Direct static agent token from Claude Desktop / Cursor
    const { req, res, getResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${validAgentToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: {
        jsonrpc: '2.0',
        id: 10,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'Claude-Desktop-Static', version: '1.0' },
        },
      },
    });

    await handleMcpRequest(req, res);
    const result = getResult();
    assert.strictEqual(result.statusCode, 200);
    const sid = result.headers['mcp-session-id'];
    assert.ok(sid);

    // List tools using static token
    const { req: lReq, res: lRes, getResult: getLResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${validAgentToken}`,
        'mcp-session-id': sid,
        'mcp-protocol-version': '2024-11-05',
        'content-type': 'application/json',
      },
      body: { jsonrpc: '2.0', id: 11, method: 'tools/list' },
    });
    await handleMcpRequest(lReq, lRes);
    assert.strictEqual(getLResult().statusCode, 200);
    assert.strictEqual(getLResult().json().result.tools.length, 19);
  });

  // --------------------------------------------------------------------------
  // 10. Strict Security Enforcement for Payments
  // --------------------------------------------------------------------------
  await t.test('10: Never weakens payment security; unauthenticated and unauthorized payments are strictly rejected', async () => {
    // A: Payment execution without authentication is blocked with 401
    const { req: noAuthReq, res: noAuthRes, getResult: getNoAuthResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: { host: 'mcp-paidx.onrender.com', 'content-type': 'application/json' },
      body: {
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'execute_wallet_payment',
          arguments: { recipient: '0.0.12345', amount: '100', asset: 'HBAR' },
        },
      },
    });

    await handleMcpRequest(noAuthReq, noAuthRes);
    assert.strictEqual(getNoAuthResult().statusCode, 401);
    assert.match(getNoAuthResult().headers['www-authenticate'], /resource_metadata=/);

    // B: Payment execution with revoked agent token is blocked with 401
    const { req: revAuthReq, res: revAuthRes, getResult: getRevAuthResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${revokedAgentToken}`,
        'content-type': 'application/json',
      },
      body: {
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'execute_wallet_payment',
          arguments: { recipient: '0.0.12345', amount: '100', asset: 'HBAR' },
        },
      },
    });

    await handleMcpRequest(revAuthReq, revAuthRes);
    assert.strictEqual(getRevAuthResult().statusCode, 401);
    assert.match(getRevAuthResult().headers['www-authenticate'], /error="invalid_token"/);

    // C: Authorized payment execution forwards to backend with validated agent token
    const { req: payReq, res: payRes, getResult: getPayResult } = createMockHttp({
      method: 'POST',
      url: '/mcp',
      headers: {
        host: 'mcp-paidx.onrender.com',
        authorization: `Bearer ${validAgentToken}`,
        'content-type': 'application/json',
      },
      body: {
        jsonrpc: '2.0',
        id: 22,
        method: 'tools/call',
        params: {
          name: 'execute_wallet_payment',
          arguments: { recipient: '0.0.12345', amount: '100', asset: 'HBAR' },
        },
      },
    });

    await handleMcpRequest(payReq, payRes);
    assert.strictEqual(getPayResult().statusCode, 200);
    assert.match(getPayResult().json().result.content[0].text, /0.0.5449200@1700000000/);
  });
});
