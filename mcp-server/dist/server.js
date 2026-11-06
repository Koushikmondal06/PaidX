"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenValidationCache = exports.revokedTokenIds = exports.usedAuthorizationCodes = exports.registeredClients = exports.sseLegacyTransports = exports.sessions = exports.TOKEN_CACHE_TTL_MS = exports.SESSION_TTL_MS = exports.MAX_REQUEST_SIZE_BYTES = exports.PAIDX_BACKEND_URL = exports.HOST = exports.PORT = void 0;
exports.getBackendUrl = getBackendUrl;
exports.maskToken = maskToken;
exports.getTokenHashPrefix = getTokenHashPrefix;
exports.getServerOrigin = getServerOrigin;
exports.getWwwAuthenticateHeader = getWwwAuthenticateHeader;
exports.generateDurableSessionId = generateDurableSessionId;
exports.verifyDurableSessionId = verifyDurableSessionId;
exports.validateAgentTokenWithBackend = validateAgentTokenWithBackend;
exports.generateAuthorizationCode = generateAuthorizationCode;
exports.verifyAuthorizationCode = verifyAuthorizationCode;
exports.generateOAuthTokens = generateOAuthTokens;
exports.verifyOAuthAccessToken = verifyOAuthAccessToken;
exports.verifyOAuthRefreshToken = verifyOAuthRefreshToken;
exports.validateAuthHeader = validateAuthHeader;
exports.createMcpSdkServer = createMcpSdkServer;
exports.getRequestBody = getRequestBody;
exports.applyCorsHeaders = applyCorsHeaders;
exports.handleProtectedResourceMetadata = handleProtectedResourceMetadata;
exports.handleAuthorizationServerMetadata = handleAuthorizationServerMetadata;
exports.handleClientRegistration = handleClientRegistration;
exports.handleOAuthAuthorize = handleOAuthAuthorize;
exports.handleOAuthToken = handleOAuthToken;
exports.handleOAuthRevoke = handleOAuthRevoke;
exports.handleHealthRequest = handleHealthRequest;
exports.handleMcpRequest = handleMcpRequest;
exports.handleVercelRequest = handleVercelRequest;
const crypto_1 = require("crypto");
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
// Port & Host Configuration (Fallback for local server mode)
exports.PORT = parseInt(process.env.PORT || process.env.MCP_PORT || '3002', 10);
exports.HOST = '0.0.0.0';
function getBackendUrl() {
    return (process.env.PAIDX_BACKEND_URL ||
        (process.env.NODE_ENV === 'production'
            ? 'https://paidx-backend.vercel.app/api/mcp'
            : 'http://localhost:3000/api/mcp'));
}
exports.PAIDX_BACKEND_URL = getBackendUrl();
exports.MAX_REQUEST_SIZE_BYTES = 2 * 1024 * 1024; // 2MB limit
exports.SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours durable session TTL
exports.TOKEN_CACHE_TTL_MS = 10 * 1000; // 10 seconds TTL for token verification cache
// Cryptographic Secret for Stateless Serverless Sessions & OAuth Tokens
const SESSION_SECRET = process.env.MCP_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    'paidx_mcp_durable_session_signing_secret_v1';
// In-memory active stores (fast cache for local/warm execution)
exports.sessions = new Map();
exports.sseLegacyTransports = new Map();
exports.registeredClients = new Map();
exports.usedAuthorizationCodes = new Set();
exports.revokedTokenIds = new Set();
exports.tokenValidationCache = new Map();
/**
 * Masks raw token to prevent leaking secrets in logs or responses.
 */
function maskToken(token) {
    if (!token || token.length < 15)
        return '***';
    return `${token.slice(0, 14)}...${token.slice(-4)}`;
}
/**
 * Derives a deterministic token hash prefix for safe session-to-agent binding.
 */
function getTokenHashPrefix(token) {
    return (0, crypto_1.createHash)('sha256').update(token.trim()).digest('hex').slice(0, 16);
}
/**
 * Resolves the canonical public origin for the MCP server.
 * Supports Render, Vercel, reverse proxies, and local development.
 */
function getServerOrigin(req) {
    if (process.env.MCP_PUBLIC_URL) {
        return process.env.MCP_PUBLIC_URL.replace(/\/mcp\/?$/, '').replace(/\/$/, '');
    }
    if (process.env.NEXT_PUBLIC_MCP_SERVER_URL) {
        return process.env.NEXT_PUBLIC_MCP_SERVER_URL.replace(/\/mcp\/?$/, '').replace(/\/$/, '');
    }
    if (req?.headers.host) {
        const proto = req.headers['x-forwarded-proto'] ||
            (req.headers.host.includes('localhost') || req.headers.host.includes('127.0.0.1')
                ? 'http'
                : 'https');
        return `${proto}://${req.headers.host}`;
    }
    return process.env.NODE_ENV === 'production'
        ? 'https://mcp-paidx.onrender.com'
        : 'http://localhost:3002';
}
/**
 * Generates standard RFC 9728 & RFC 6750 WWW-Authenticate header with resource_metadata pointer.
 */
function getWwwAuthenticateHeader(origin, error) {
    const prmUrl = `${origin}/.well-known/oauth-protected-resource`;
    if (!error) {
        return `Bearer resource_metadata="${prmUrl}"`;
    }
    const cleanError = error.replace(/"/g, "'");
    return `Bearer error="invalid_token", error_description="${cleanError}", resource_metadata="${prmUrl}"`;
}
/**
 * Generates a cryptographically signed, stateless session ID.
 * Allows any Vercel serverless microVM instance or Render replica to verify and resume sessions
 * without depending exclusively on a shared in-memory Map.
 */
function generateDurableSessionId(bearerToken) {
    const sid = (0, crypto_1.randomUUID)();
    const tokenHashPrefix = getTokenHashPrefix(bearerToken);
    const payload = {
        sid,
        tokenHashPrefix,
        createdAt: Date.now(),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    return `paidx_sess_${payloadB64}.${signature}`;
}
/**
 * Verifies a durable session ID against its cryptographic HMAC signature,
 * expiry window, and associated agent token binding.
 */
function verifyDurableSessionId(sessionId, bearerToken) {
    if (!sessionId || typeof sessionId !== 'string') {
        return { valid: false, error: 'Bad Request: Missing or empty session ID', code: 400 };
    }
    // Check in-memory session cache first
    const inMemory = exports.sessions.get(sessionId);
    if (inMemory) {
        if (bearerToken && inMemory.bearerToken !== bearerToken.trim()) {
            return {
                valid: false,
                error: 'Forbidden: Session is bound to a different agent token.',
                code: 403,
            };
        }
        return {
            valid: true,
            sessionData: {
                sid: inMemory.sessionId,
                tokenHashPrefix: getTokenHashPrefix(inMemory.bearerToken),
                createdAt: inMemory.lastActive,
            },
        };
    }
    // Verify stateless signed format
    if (!sessionId.startsWith('paidx_sess_')) {
        return { valid: false, error: 'Session not found or expired', code: 404 };
    }
    const rawPart = sessionId.slice('paidx_sess_'.length);
    const dotIndex = rawPart.indexOf('.');
    if (dotIndex === -1) {
        return { valid: false, error: 'Session not found or expired', code: 404 };
    }
    const payloadB64 = rawPart.slice(0, dotIndex);
    const providedSig = rawPart.slice(dotIndex + 1);
    const expectedSig = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    try {
        const bufProvided = Buffer.from(providedSig);
        const bufExpected = Buffer.from(expectedSig);
        if (bufProvided.length !== bufExpected.length || !(0, crypto_1.timingSafeEqual)(bufProvided, bufExpected)) {
            return { valid: false, error: 'Session not found or expired', code: 404 };
        }
        const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        // Validate expiration
        if (Date.now() - payload.createdAt > exports.SESSION_TTL_MS) {
            return { valid: false, error: 'Session expired', code: 404 };
        }
        // Validate agent token binding (Cross-agent isolation)
        if (bearerToken) {
            const currentPrefix = getTokenHashPrefix(bearerToken);
            if (currentPrefix !== payload.tokenHashPrefix) {
                return {
                    valid: false,
                    error: 'Forbidden: Session is bound to a different agent token.',
                    code: 403,
                };
            }
        }
        return { valid: true, sessionData: payload };
    }
    catch {
        return { valid: false, error: 'Session not found or expired', code: 404 };
    }
}
/**
 * Validates the Agent Bearer Token through the existing PaidX backend authentication mechanism.
 * Never trusts client-provided identity; delegates verification to the backend orchestrator.
 */
async function validateAgentTokenWithBackend(authHeader, backendUrl = getBackendUrl(), timeoutMs = 10000) {
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
    const cached = exports.tokenValidationCache.get(cleanHeader);
    if (cached && Date.now() - cached.timestamp < exports.TOKEN_CACHE_TTL_MS) {
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
            exports.tokenValidationCache.set(cleanHeader, result);
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
        const json = (await res.json());
        if (json.error) {
            const result = {
                valid: false,
                error: json.error.message || 'Unauthorized: Token validation failed.',
                code: json.error.code || -32001,
                timestamp: Date.now(),
            };
            exports.tokenValidationCache.set(cleanHeader, result);
            return result;
        }
        const result = { valid: true, timestamp: Date.now() };
        exports.tokenValidationCache.set(cleanHeader, result);
        return result;
    }
    catch (err) {
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
// ----------------------------------------------------------------------------
// OAuth 2.1 Token Helpers (RFC 6749, RFC 7636, RFC 8707)
// ----------------------------------------------------------------------------
/**
 * Generates an encrypted/HMAC-signed authorization code for OAuth 2.1 Authorization Code Flow.
 */
function generateAuthorizationCode(params) {
    const codeId = (0, crypto_1.randomUUID)();
    const payload = {
        codeId,
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod || 'S256',
        agentToken: params.agentToken.trim(),
        scope: params.scope || 'mcp:tools',
        createdAt: Date.now(),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    return `paidx_code_${payloadB64}.${signature}`;
}
/**
 * Verifies and decodes an OAuth 2.1 authorization code.
 */
function verifyAuthorizationCode(code) {
    if (!code || typeof code !== 'string' || !code.startsWith('paidx_code_')) {
        return { valid: false, error: 'Invalid authorization code format' };
    }
    const raw = code.slice('paidx_code_'.length);
    const dotIndex = raw.indexOf('.');
    if (dotIndex === -1) {
        return { valid: false, error: 'Malformed authorization code' };
    }
    const payloadB64 = raw.slice(0, dotIndex);
    const providedSig = raw.slice(dotIndex + 1);
    const expectedSig = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    const bufProvided = Buffer.from(providedSig);
    const bufExpected = Buffer.from(expectedSig);
    if (bufProvided.length !== bufExpected.length || !(0, crypto_1.timingSafeEqual)(bufProvided, bufExpected)) {
        return { valid: false, error: 'Invalid authorization code signature' };
    }
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
        // 10 minutes code expiry window
        if (Date.now() - payload.createdAt > 10 * 60 * 1000) {
            return { valid: false, error: 'Authorization code has expired' };
        }
        if (exports.usedAuthorizationCodes.has(payload.codeId)) {
            return { valid: false, error: 'Authorization code has already been redeemed' };
        }
        return { valid: true, payload };
    }
    catch {
        return { valid: false, error: 'Failed to decode authorization code payload' };
    }
}
/**
 * Issues signed OAuth 2.1 access and refresh tokens mapped to an authentic PaidX Agent token.
 */
function generateOAuthTokens(agentToken, clientId, scope = 'mcp:tools') {
    const now = Date.now();
    const accessPayload = {
        tokenId: (0, crypto_1.randomUUID)(),
        type: 'access',
        agentToken: agentToken.trim(),
        clientId,
        scope,
        createdAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
    };
    const accessB64 = Buffer.from(JSON.stringify(accessPayload)).toString('base64url');
    const accessSig = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(accessB64).digest('base64url');
    const accessToken = `paidx_oat_${accessB64}.${accessSig}`;
    const refreshPayload = {
        tokenId: (0, crypto_1.randomUUID)(),
        type: 'refresh',
        agentToken: agentToken.trim(),
        clientId,
        scope,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    const refreshB64 = Buffer.from(JSON.stringify(refreshPayload)).toString('base64url');
    const refreshSig = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(refreshB64).digest('base64url');
    const refreshToken = `paidx_ort_${refreshB64}.${refreshSig}`;
    return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 86400,
        refresh_token: refreshToken,
        scope,
    };
}
/**
 * Cryptographically verifies an OAuth 2.1 access token.
 */
function verifyOAuthAccessToken(token) {
    if (!token || typeof token !== 'string' || !token.startsWith('paidx_oat_')) {
        return { valid: false, error: 'Invalid OAuth access token format' };
    }
    const raw = token.slice('paidx_oat_'.length);
    const dotIndex = raw.indexOf('.');
    if (dotIndex === -1) {
        return { valid: false, error: 'Malformed OAuth access token' };
    }
    const payloadB64 = raw.slice(0, dotIndex);
    const providedSig = raw.slice(dotIndex + 1);
    const expectedSig = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    const bufProvided = Buffer.from(providedSig);
    const bufExpected = Buffer.from(expectedSig);
    if (bufProvided.length !== bufExpected.length || !(0, crypto_1.timingSafeEqual)(bufProvided, bufExpected)) {
        return { valid: false, error: 'Invalid OAuth access token signature' };
    }
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
        if (payload.type !== 'access') {
            return { valid: false, error: 'Not an OAuth access token' };
        }
        if (exports.revokedTokenIds.has(payload.tokenId)) {
            return { valid: false, error: 'OAuth token has been revoked' };
        }
        if (Date.now() > payload.expiresAt) {
            return { valid: false, error: 'OAuth access token has expired' };
        }
        return { valid: true, payload };
    }
    catch {
        return { valid: false, error: 'Failed to parse OAuth access token payload' };
    }
}
/**
 * Cryptographically verifies an OAuth 2.1 refresh token.
 */
function verifyOAuthRefreshToken(token) {
    if (!token || typeof token !== 'string' || !token.startsWith('paidx_ort_')) {
        return { valid: false, error: 'Invalid OAuth refresh token format' };
    }
    const raw = token.slice('paidx_ort_'.length);
    const dotIndex = raw.indexOf('.');
    if (dotIndex === -1) {
        return { valid: false, error: 'Malformed OAuth refresh token' };
    }
    const payloadB64 = raw.slice(0, dotIndex);
    const providedSig = raw.slice(dotIndex + 1);
    const expectedSig = (0, crypto_1.createHmac)('sha256', SESSION_SECRET).update(payloadB64).digest('base64url');
    const bufProvided = Buffer.from(providedSig);
    const bufExpected = Buffer.from(expectedSig);
    if (bufProvided.length !== bufExpected.length || !(0, crypto_1.timingSafeEqual)(bufProvided, bufExpected)) {
        return { valid: false, error: 'Invalid OAuth refresh token signature' };
    }
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
        if (payload.type !== 'refresh') {
            return { valid: false, error: 'Not an OAuth refresh token' };
        }
        if (exports.revokedTokenIds.has(payload.tokenId)) {
            return { valid: false, error: 'OAuth token has been revoked' };
        }
        if (Date.now() > payload.expiresAt) {
            return { valid: false, error: 'OAuth refresh token has expired' };
        }
        return { valid: true, payload };
    }
    catch {
        return { valid: false, error: 'Failed to parse OAuth refresh token payload' };
    }
}
/**
 * Universal Authorization Header Validator.
 * Seamlessly supports both:
 * 1. OAuth 2.1 Tokens from Claude (`Bearer paidx_oat_...`)
 * 2. Direct Static Agent Tokens from Claude Desktop/Cursor (`Bearer paidx_agt_...`)
 */
async function validateAuthHeader(authHeader, backendUrl = getBackendUrl(), origin = getServerOrigin()) {
    if (!authHeader || typeof authHeader !== 'string') {
        return {
            valid: false,
            error: 'Unauthorized: Missing PaidX Agent Bearer Token in Authorization header.',
            code: -32001,
            wwwAuthHeader: getWwwAuthenticateHeader(origin),
        };
    }
    const cleanHeader = authHeader.trim();
    const lower = cleanHeader.toLowerCase();
    // 1. OAuth 2.1 Access Token: Bearer paidx_oat_...
    if (lower.startsWith('bearer paidx_oat_')) {
        const rawToken = cleanHeader.slice(7).trim();
        const oauthCheck = verifyOAuthAccessToken(rawToken);
        if (!oauthCheck.valid || !oauthCheck.payload) {
            const err = oauthCheck.error || 'Unauthorized: Invalid OAuth access token.';
            return {
                valid: false,
                error: err,
                code: -32001,
                wwwAuthHeader: getWwwAuthenticateHeader(origin, err),
            };
        }
        const mappedAgentToken = oauthCheck.payload.agentToken;
        const backendCheck = await validateAgentTokenWithBackend(mappedAgentToken, backendUrl);
        if (!backendCheck.valid) {
            return {
                valid: false,
                error: backendCheck.error,
                code: backendCheck.code || -32001,
                wwwAuthHeader: getWwwAuthenticateHeader(origin, backendCheck.error),
            };
        }
        return {
            valid: true,
            effectiveAgentToken: mappedAgentToken,
            wwwAuthHeader: '',
        };
    }
    // 2. Direct PaidX Agent Token: Bearer paidx_agt_...
    if (lower.startsWith('bearer paidx_agt_')) {
        const backendCheck = await validateAgentTokenWithBackend(cleanHeader, backendUrl);
        if (!backendCheck.valid) {
            return {
                valid: false,
                error: backendCheck.error,
                code: backendCheck.code || -32001,
                wwwAuthHeader: getWwwAuthenticateHeader(origin, backendCheck.error),
            };
        }
        return {
            valid: true,
            effectiveAgentToken: cleanHeader,
            wwwAuthHeader: '',
        };
    }
    // 3. Invalid token format
    const formatErr = 'Unauthorized: Invalid token format. Must be "Bearer paidx_agt_<secret>" or "Bearer paidx_oat_<token>".';
    return {
        valid: false,
        error: formatErr,
        code: -32001,
        wwwAuthHeader: getWwwAuthenticateHeader(origin, formatErr),
    };
}
/**
 * Creates and initializes an MCP SDK Server instance using the official SDK.
 * All 16 standard MCP tools are preserved and exposed.
 * Tool execution is forwarded securely to the backend with the authenticated agent token.
 */
function createMcpSdkServer(bearerToken, backendUrl = getBackendUrl()) {
    const mcpServer = new index_js_1.Server({
        name: 'paidx-mcp-server',
        version: '1.0.0',
    }, {
        capabilities: {
            tools: {},
        },
    });
    // 1. Tool Listing Handler (MCP SDK standard)
    mcpServer.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
        return {
            tools: tools_js_1.MCP_TOOL_DEFINITIONS.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            })),
        };
    });
    // 2. Tool Execution Handler (Forward to authoritative PaidX Backend)
    mcpServer.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
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
                    Authorization: bearerToken.startsWith('Bearer ') ? bearerToken : `Bearer ${bearerToken}`,
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
            const data = (await res.json());
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
        }
        catch (err) {
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
 * Safely extracts request body in both Vercel Serverless (pre-parsed body)
 * and raw Node.js streaming environments.
 */
async function getRequestBody(req) {
    const anyReq = req;
    // 1. Vercel / Express pre-parsed body
    if (anyReq.body !== undefined && anyReq.body !== null) {
        if (typeof anyReq.body === 'object' && !Buffer.isBuffer(anyReq.body)) {
            return {
                rawBody: JSON.stringify(anyReq.body),
                parsedBody: anyReq.body,
            };
        }
        const str = Buffer.isBuffer(anyReq.body) ? anyReq.body.toString('utf-8') : String(anyReq.body);
        let parsed = null;
        try {
            parsed = str ? JSON.parse(str) : null;
        }
        catch { }
        return { rawBody: str, parsedBody: parsed };
    }
    // 2. Stream consumption for raw Node.js HTTP servers
    return new Promise((resolve, reject) => {
        let body = '';
        let bytesReceived = 0;
        req.on('data', (chunk) => {
            bytesReceived += chunk.length;
            if (bytesReceived > exports.MAX_REQUEST_SIZE_BYTES) {
                reject(new Error('Payload Too Large: Maximum allowed size is 2MB.'));
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            let parsed = null;
            try {
                parsed = body ? JSON.parse(body) : null;
            }
            catch { }
            resolve({ rawBody: body, parsedBody: parsed });
        });
        req.on('error', (err) => reject(err));
    });
}
/**
 * CORS headers application supporting remote connections and MCP Inspector.
 */
function applyCorsHeaders(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id, accept');
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, mcp-session-id, mcp-protocol-version');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }
    return false;
}
/**
 * RFC 9728 OAuth 2.0 Protected Resource Metadata Endpoint.
 * Exposed at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`.
 */
async function handleProtectedResourceMetadata(req, res) {
    const origin = getServerOrigin(req);
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        scopes_supported: ['mcp:tools'],
        bearer_methods_supported: ['header'],
        resource_name: 'PaidX Agent Commerce',
        resource_documentation: 'https://console.paidx.cc/dashboard/agents',
    }));
}
/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata & OpenID Configuration.
 * Exposed at `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`.
 */
async function handleAuthorizationServerMetadata(req, res) {
    const origin = getServerOrigin(req);
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        revocation_endpoint: `${origin}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        scopes_supported: ['mcp:tools'],
        service_documentation: 'https://console.paidx.cc/dashboard/agents',
    }));
}
/**
 * RFC 7591 Dynamic Client Registration Handler (`POST /oauth/register`).
 */
async function handleClientRegistration(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    const { parsedBody } = await getRequestBody(req);
    const clientName = parsedBody?.client_name || 'Claude';
    const redirectUris = Array.isArray(parsedBody?.redirect_uris) ? parsedBody.redirect_uris : [];
    const clientId = `paidx_client_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 16)}`;
    const issuedAt = Math.floor(Date.now() / 1000);
    const clientInfo = {
        client_id: clientId,
        client_name: clientName,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        client_id_issued_at: issuedAt,
    };
    exports.registeredClients.set(clientId, clientInfo);
    res.writeHead(201, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(clientInfo));
}
/**
 * Renders the HTML consent page for user-authorized Claude connections.
 */
function renderAuthorizeHtml(params) {
    const { origin, clientId, redirectUri, state, codeChallenge, codeChallengeMethod, scope, error } = params;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PaidX - Authorize Claude Connection</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #0b0f19; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 1rem; width: 100%; max-width: 480px; padding: 2rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .logo-badge { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; background: #4f46e5; border-radius: 0.75rem; font-weight: bold; font-size: 1.25rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    p.desc { color: #94a3b8; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1.5rem; }
    .scopes-box { background: #1e293b; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1.5rem; }
    .scopes-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; margin-bottom: 0.5rem; }
    .scope-item { display: flex; align-items: center; font-size: 0.875rem; color: #e2e8f0; margin-bottom: 0.5rem; }
    .scope-item:last-child { margin-bottom: 0; }
    .scope-item svg { width: 16px; height: 16px; color: #10b981; margin-right: 0.5rem; flex-shrink: 0; }
    .alert-error { background: #451a1a; border: 1px solid #7f1d1d; color: #fca5a5; padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .form-group { margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.5rem; }
    input[type="password"], input[type="text"] { width: 100%; background: #0f172a; border: 1px solid #334155; border-radius: 0.5rem; padding: 0.75rem 1rem; color: #f8fafc; font-size: 0.875rem; font-family: monospace; outline: none; }
    input:focus { border-color: #6366f1; box-shadow: 0 0 0 1px #6366f1; }
    .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    button.btn-primary { flex: 1; background: #4f46e5; color: white; border: none; padding: 0.75rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; transition: background 0.15s; }
    button.btn-primary:hover { background: #4338ca; }
    a.btn-secondary { display: flex; align-items: center; justify-content: center; text-decoration: none; padding: 0.75rem 1rem; border: 1px solid #334155; border-radius: 0.5rem; color: #94a3b8; font-size: 0.875rem; font-weight: 500; }
    a.btn-secondary:hover { background: #1e293b; color: #cbd5e1; }
    .footer { text-align: center; font-size: 0.75rem; color: #64748b; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-badge">⚡</div>
    <h1>Authorize Claude</h1>
    <p class="desc"><strong>Claude</strong> is requesting permission to access your <strong>PaidX Agentic Commerce</strong> tools.</p>
    
    ${error ? `<div class="alert-error">${error}</div>` : ''}

    <div class="scopes-box">
      <div class="scopes-title">Requested Permissions</div>
      <div class="scope-item">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        Execute conversational payments under agent policy limits
      </div>
      <div class="scope-item">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        Query wallet addresses, balances & payment status
      </div>
      <div class="scope-item">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
        Verify cryptographic Hedera audit records
      </div>
    </div>

    <form method="POST" action="${origin}/oauth/authorize">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="code_challenge" value="${codeChallenge}">
      <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">
      <input type="hidden" name="scope" value="${scope}">

      <div class="form-group">
        <label for="agent_token">PaidX Agent Bearer Token</label>
        <input type="password" id="agent_token" name="agent_token" placeholder="paidx_agt_..." required autocomplete="off">
        <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem;">
          Get your token from the <a href="https://console.paidx.cc/dashboard/agents" target="_blank" style="color: #818cf8; text-decoration: none;">PaidX Console</a>.
        </div>
      </div>

      <div class="actions">
        <button type="submit" class="btn-primary">Authorize Claude</button>
        ${redirectUri ? `<a class="btn-secondary" href="${redirectUri}?error=access_denied${state ? `&state=${encodeURIComponent(state)}` : ''}">Cancel</a>` : ''}
      </div>
    </form>

    <div class="footer">
      Secured by PaidX OAuth 2.1 & Hedera Hashgraph
    </div>
  </div>
</body>
</html>`;
}
/**
 * OAuth 2.1 Authorization Endpoint (`GET /oauth/authorize` & `POST /oauth/authorize`).
 */
async function handleOAuthAuthorize(req, res) {
    const origin = getServerOrigin(req);
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET') {
        const clientId = urlObj.searchParams.get('client_id') || 'claude';
        const redirectUri = urlObj.searchParams.get('redirect_uri') || '';
        const state = urlObj.searchParams.get('state') || '';
        const codeChallenge = urlObj.searchParams.get('code_challenge') || '';
        const codeChallengeMethod = urlObj.searchParams.get('code_challenge_method') || 'S256';
        const scope = urlObj.searchParams.get('scope') || 'mcp:tools';
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        res.end(renderAuthorizeHtml({
            origin,
            clientId,
            redirectUri,
            state,
            codeChallenge,
            codeChallengeMethod,
            scope,
        }));
        return;
    }
    if (req.method === 'POST') {
        const { rawBody, parsedBody } = await getRequestBody(req);
        let params = {};
        if (parsedBody && typeof parsedBody === 'object') {
            params = parsedBody;
        }
        else if (rawBody) {
            const sp = new URLSearchParams(rawBody);
            sp.forEach((v, k) => {
                params[k] = v;
            });
        }
        const clientId = params.client_id || urlObj.searchParams.get('client_id') || 'claude';
        const redirectUri = params.redirect_uri || urlObj.searchParams.get('redirect_uri') || '';
        const state = params.state || urlObj.searchParams.get('state') || '';
        const codeChallenge = params.code_challenge || urlObj.searchParams.get('code_challenge') || '';
        const codeChallengeMethod = params.code_challenge_method || urlObj.searchParams.get('code_challenge_method') || 'S256';
        const scope = params.scope || urlObj.searchParams.get('scope') || 'mcp:tools';
        const agentToken = (params.agent_token || '').trim();
        if (!agentToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'invalid_request',
                error_description: 'Missing agent_token parameter',
            }));
            return;
        }
        // Validate agent token with backend orchestrator
        const formattedToken = agentToken.startsWith('Bearer ') ? agentToken : `Bearer ${agentToken}`;
        const validation = await validateAgentTokenWithBackend(formattedToken);
        if (!validation.valid) {
            if (req.headers.accept?.includes('application/json')) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'access_denied',
                    error_description: validation.error || 'Invalid PaidX Agent Token',
                }));
                return;
            }
            res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderAuthorizeHtml({
                origin,
                clientId,
                redirectUri,
                state,
                codeChallenge,
                codeChallengeMethod,
                scope,
                error: validation.error ||
                    'Invalid PaidX Agent Token. Please verify your token in the PaidX Console.',
            }));
            return;
        }
        // Generate cryptographic authorization code
        const code = generateAuthorizationCode({
            clientId,
            redirectUri,
            codeChallenge,
            codeChallengeMethod,
            agentToken: formattedToken,
            scope,
        });
        if (req.headers.accept?.includes('application/json')) {
            const target = redirectUri
                ? `${redirectUri}?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
                : '';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code, redirect_uri: target }));
            return;
        }
        if (!redirectUri) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h3>PaidX Authorization Successful!</h3><p>Authorization Code: <code>${code}</code></p>`);
            return;
        }
        const redirectTarget = `${redirectUri}?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`;
        res.writeHead(302, { Location: redirectTarget });
        res.end();
        return;
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
}
/**
 * OAuth 2.1 Token Endpoint (`POST /oauth/token`).
 * Supports authorization_code and refresh_token grant types with mandatory PKCE (S256).
 */
async function handleOAuthToken(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    const { rawBody, parsedBody } = await getRequestBody(req);
    let params = {};
    if (parsedBody && typeof parsedBody === 'object') {
        params = parsedBody;
    }
    else if (rawBody) {
        const sp = new URLSearchParams(rawBody);
        sp.forEach((v, k) => {
            params[k] = v;
        });
    }
    const grantType = params.grant_type;
    if (grantType === 'authorization_code') {
        const code = params.code;
        const codeVerifier = params.code_verifier;
        const clientId = params.client_id || 'claude';
        const redirectUri = params.redirect_uri;
        if (!code || !codeVerifier) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'invalid_request',
                error_description: 'Missing code or code_verifier parameter',
            }));
            return;
        }
        const verification = verifyAuthorizationCode(code);
        if (!verification.valid || !verification.payload) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'invalid_grant',
                error_description: verification.error || 'Invalid authorization code',
            }));
            return;
        }
        const payload = verification.payload;
        // Verify PKCE S256 Challenge
        const calculatedChallenge = (0, crypto_1.createHash)('sha256').update(codeVerifier).digest('base64url');
        const bufCalc = Buffer.from(calculatedChallenge);
        const bufExpected = Buffer.from(payload.codeChallenge);
        if (bufCalc.length !== bufExpected.length || !(0, crypto_1.timingSafeEqual)(bufCalc, bufExpected)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'invalid_grant',
                error_description: 'PKCE verification failed: code_verifier does not match code_challenge',
            }));
            return;
        }
        // Verify redirect_uri if supplied
        if (payload.redirectUri && redirectUri && payload.redirectUri !== redirectUri) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'invalid_grant',
                error_description: 'redirect_uri mismatch',
            }));
            return;
        }
        // Mark code as redeemed to prevent replay attacks
        exports.usedAuthorizationCodes.add(payload.codeId);
        // Issue tokens mapped to validated agent token
        const tokens = generateOAuthTokens(payload.agentToken, clientId, payload.scope);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(tokens));
        return;
    }
    if (grantType === 'refresh_token') {
        const refreshToken = params.refresh_token;
        if (!refreshToken) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'invalid_request',
                error_description: 'Missing refresh_token parameter',
            }));
            return;
        }
        const verification = verifyOAuthRefreshToken(refreshToken);
        if (!verification.valid || !verification.payload) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: 'invalid_grant',
                error_description: verification.error || 'Invalid refresh token',
            }));
            return;
        }
        const payload = verification.payload;
        const tokens = generateOAuthTokens(payload.agentToken, payload.clientId, payload.scope);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify(tokens));
        return;
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        error: 'unsupported_grant_type',
        error_description: `Grant type "${grantType}" is not supported. Use "authorization_code" or "refresh_token".`,
    }));
}
/**
 * RFC 7009 OAuth 2.0 Token Revocation Handler (`POST /oauth/revoke`).
 */
async function handleOAuthRevoke(req, res) {
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
    }
    const { rawBody, parsedBody } = await getRequestBody(req);
    let params = {};
    if (parsedBody && typeof parsedBody === 'object') {
        params = parsedBody;
    }
    else if (rawBody) {
        const sp = new URLSearchParams(rawBody);
        sp.forEach((v, k) => {
            params[k] = v;
        });
    }
    const token = params.token;
    if (token) {
        if (token.startsWith('paidx_oat_')) {
            const resVal = verifyOAuthAccessToken(token);
            if (resVal.payload)
                exports.revokedTokenIds.add(resVal.payload.tokenId);
        }
        else if (token.startsWith('paidx_ort_')) {
            const resVal = verifyOAuthRefreshToken(token);
            if (resVal.payload)
                exports.revokedTokenIds.add(resVal.payload.tokenId);
        }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'revoked' }));
}
/**
 * Vercel-compatible GET /health & GET / Handler.
 * Returns operational status without leaking secrets or backend topology.
 */
async function handleHealthRequest(_req, res) {
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
    });
    res.end(JSON.stringify({
        status: 'healthy',
        name: 'paidx-mcp-server',
        version: '1.0.0',
        transport: 'streamable-http',
        protocolVersion: '2024-11-05',
        toolsCount: tools_js_1.MCP_TOOL_DEFINITIONS.length,
        hederaNetwork: process.env.HEDERA_NETWORK || 'testnet',
        runtime: 'vercel-serverless',
        authSupport: ['oauth-2.1', 'bearer-agent-token'],
        timestamp: new Date().toISOString(),
    }));
}
/**
 * Vercel-compatible /mcp Handler (supports POST, GET, DELETE).
 * Built with the official StreamableHTTPServerTransport.
 * Compatible with both stateless and durable session execution across separate microVM instances.
 */
async function handleMcpRequest(req, res) {
    if (applyCorsHeaders(req, res)) {
        return;
    }
    const origin = getServerOrigin(req);
    // --------------------------------------------------------------------------
    // DELETE /mcp: Terminate session according to MCP specification
    // --------------------------------------------------------------------------
    if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'] || '';
        if (!sessionId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32000, message: 'Bad Request: Missing mcp-session-id header' },
                id: null,
            }));
            return;
        }
        const authHeader = req.headers['authorization'] || '';
        const verification = verifyDurableSessionId(sessionId, authHeader || undefined);
        if (!verification.valid) {
            res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader(origin, verification.error));
            res.writeHead(verification.code || 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32001, message: verification.error || 'Session not found or expired' },
                id: null,
            }));
            return;
        }
        // Clean up from local memory cache
        exports.sessions.delete(sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', result: { status: 'session terminated' }, id: null }));
        return;
    }
    // --------------------------------------------------------------------------
    // GET /mcp: Return 405 Method Not Allowed in stateless mode
    // --------------------------------------------------------------------------
    if (req.method === 'GET') {
        const sessionId = req.headers['mcp-session-id'] || '';
        if (sessionId) {
            const authHeader = req.headers['authorization'] || '';
            const verification = verifyDurableSessionId(sessionId, authHeader || undefined);
            if (!verification.valid) {
                res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader(origin, verification.error));
                res.writeHead(verification.code || 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32001, message: verification.error || 'Session not found or expired' },
                    id: null,
                }));
                return;
            }
        }
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method Not Allowed. Use POST /mcp for JSON-RPC messages.' },
            id: null,
        }));
        return;
    }
    // --------------------------------------------------------------------------
    // POST /mcp: Streamable HTTP JSON-RPC Message Handling
    // --------------------------------------------------------------------------
    if (req.method === 'POST') {
        let bodyData;
        try {
            bodyData = await getRequestBody(req);
        }
        catch (readErr) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: readErr.message || 'Payload too large' }));
            return;
        }
        const { parsedBody } = bodyData;
        if (!parsedBody || typeof parsedBody !== 'object') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32700, message: 'Parse error: Invalid JSON' },
                id: null,
            }));
            return;
        }
        const authHeader = req.headers['authorization'] || '';
        const sessionId = req.headers['mcp-session-id'];
        // Validate durable session if session ID is provided
        if (sessionId) {
            const sessionCheck = verifyDurableSessionId(sessionId, authHeader || undefined);
            if (!sessionCheck.valid) {
                res.setHeader('WWW-Authenticate', getWwwAuthenticateHeader(origin, sessionCheck.error));
                res.writeHead(sessionCheck.code || 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32001, message: sessionCheck.error || 'Session not found or expired' },
                    id: null,
                }));
                return;
            }
        }
        // Unified Authentication Check: Supports both OAuth 2.1 (Claude) and Static Agent Tokens (Claude Desktop/Cursor)
        const authResult = await validateAuthHeader(authHeader, getBackendUrl(), origin);
        if (!authResult.valid || !authResult.effectiveAgentToken) {
            res.setHeader('WWW-Authenticate', authResult.wwwAuthHeader);
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                    code: authResult.code || -32001,
                    message: authResult.error || 'Unauthorized: Missing or invalid PaidX Agent Bearer Token.',
                },
                id: null,
            }));
            return;
        }
        const effectiveAgentToken = authResult.effectiveAgentToken;
        // Ensure Accept header supports Streamable HTTP response modes
        let accept = req.headers['accept'] || '';
        if (!accept.includes('text/event-stream') || !accept.includes('application/json')) {
            req.headers['accept'] = 'application/json, text/event-stream';
        }
        const isInit = (0, types_js_1.isInitializeRequest)(parsedBody);
        let effectiveSessionId = sessionId;
        // On initialize request: generate durable signed session ID and expose in response header
        if (isInit) {
            effectiveSessionId = generateDurableSessionId(authHeader);
            res.setHeader('mcp-session-id', effectiveSessionId);
            res.setHeader('mcp-protocol-version', '2024-11-05');
            // Cache locally in warm memory
            exports.sessions.set(effectiveSessionId, {
                sessionId: effectiveSessionId,
                bearerToken: authHeader.trim(),
                openCount: 1,
                lastActive: Date.now(),
            });
        }
        else if (effectiveSessionId) {
            res.setHeader('mcp-session-id', effectiveSessionId);
            res.setHeader('mcp-protocol-version', '2024-11-05');
        }
        // Ensure rawHeaders exists for @hono/node-server compatibility
        if (!req.rawHeaders && req.headers) {
            req.rawHeaders = Object.entries(req.headers).flatMap(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(', ') : String(v || ''),
            ]);
        }
        // Execute via official StreamableHTTPServerTransport in stateless mode per-invocation
        try {
            const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true,
            });
            const mcpServerInstance = createMcpSdkServer(effectiveAgentToken);
            await mcpServerInstance.connect(transport);
            await transport.handleRequest(req, res, parsedBody);
            return;
        }
        catch (execErr) {
            const msg = execErr instanceof Error ? execErr.message : 'Error processing MCP request';
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: msg },
                    id: null,
                }));
            }
            return;
        }
    }
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Method ${req.method} not allowed` }));
}
/**
 * Universal Request Dispatcher.
 * Dispatches RFC 9728 discovery, RFC 8414 metadata, OAuth 2.1 flows, health, and MCP requests.
 */
async function handleVercelRequest(req, res) {
    if (applyCorsHeaders(req, res)) {
        return;
    }
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname.replace(/\/$/, '') || '/';
    // 1. RFC 9728 Protected Resource Metadata (Claude & MCP OAuth discovery)
    if (pathname === '/.well-known/oauth-protected-resource' ||
        pathname === '/.well-known/oauth-protected-resource/mcp') {
        return handleProtectedResourceMetadata(req, res);
    }
    // 2. RFC 8414 Authorization Server Metadata & OpenID Configuration
    if (pathname === '/.well-known/oauth-authorization-server' ||
        pathname === '/.well-known/openid-configuration') {
        return handleAuthorizationServerMetadata(req, res);
    }
    // 3. OAuth 2.1 Protocol Endpoints
    if (pathname === '/oauth/register') {
        return handleClientRegistration(req, res);
    }
    if (pathname === '/oauth/authorize') {
        return handleOAuthAuthorize(req, res);
    }
    if (pathname === '/oauth/token') {
        return handleOAuthToken(req, res);
    }
    if (pathname === '/oauth/revoke') {
        return handleOAuthRevoke(req, res);
    }
    // 4. Health & Root Status Endpoints
    if (pathname === '/health' || pathname === '/api/health' || pathname === '/') {
        return handleHealthRequest(req, res);
    }
    // 5. MCP Streamable HTTP Endpoint
    if (pathname === '/mcp' || pathname === '/api/mcp') {
        return handleMcpRequest(req, res);
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
}
exports.default = handleVercelRequest;
