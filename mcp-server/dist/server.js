"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenValidationCache = exports.sseLegacyTransports = exports.sessions = exports.TOKEN_CACHE_TTL_MS = exports.SESSION_TTL_MS = exports.MAX_REQUEST_SIZE_BYTES = exports.PAIDX_BACKEND_URL = exports.HOST = exports.PORT = void 0;
exports.getBackendUrl = getBackendUrl;
exports.maskToken = maskToken;
exports.getTokenHashPrefix = getTokenHashPrefix;
exports.generateDurableSessionId = generateDurableSessionId;
exports.verifyDurableSessionId = verifyDurableSessionId;
exports.validateAgentTokenWithBackend = validateAgentTokenWithBackend;
exports.createMcpSdkServer = createMcpSdkServer;
exports.getRequestBody = getRequestBody;
exports.applyCorsHeaders = applyCorsHeaders;
exports.handleHealthRequest = handleHealthRequest;
exports.handleMcpRequest = handleMcpRequest;
exports.handleVercelRequest = handleVercelRequest;
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = require("crypto");
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const tools_js_1 = require("./tools.js");
dotenv_1.default.config();
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
// Cryptographic Secret for Stateless Serverless Sessions
const SESSION_SECRET = process.env.MCP_SESSION_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    'paidx_mcp_durable_session_signing_secret_v1';
// In-memory active sessions (fast cache for local/warm execution)
exports.sessions = new Map();
exports.sseLegacyTransports = new Map();
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
 * Generates a cryptographically signed, stateless session ID.
 * Allows any Vercel serverless microVM instance to verify and resume sessions
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
        // Legacy or UUID format not found in memory
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
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }
    return false;
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
    // GET /mcp: Open SSE stream or return 405 Method Not Allowed in stateless mode
    // --------------------------------------------------------------------------
    if (req.method === 'GET') {
        const sessionId = req.headers['mcp-session-id'] || '';
        if (sessionId) {
            const authHeader = req.headers['authorization'] || '';
            const verification = verifyDurableSessionId(sessionId, authHeader || undefined);
            if (!verification.valid) {
                res.writeHead(verification.code || 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32001, message: verification.error || 'Session not found or expired' },
                    id: null,
                }));
                return;
            }
        }
        // In serverless stateless environments, GET /mcp returns 405 Method Not Allowed per MCP spec
        // as requests are completed synchronously via POST.
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
                res.writeHead(sessionCheck.code || 404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    jsonrpc: '2.0',
                    error: { code: -32001, message: sessionCheck.error || 'Session not found or expired' },
                    id: null,
                }));
                return;
            }
        }
        // Require Authorization: Bearer paidx_agt_...
        if (!authHeader) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                    code: -32001,
                    message: 'Unauthorized: Missing PaidX Agent Bearer Token in Authorization header.',
                },
                id: null,
            }));
            return;
        }
        // Validate token against backend orchestrator
        const validation = await validateAgentTokenWithBackend(authHeader);
        if (!validation.valid) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                    code: validation.code || -32001,
                    message: validation.error || 'Unauthorized: Invalid PaidX Agent Token.',
                },
                id: null,
            }));
            return;
        }
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
            const mcpServerInstance = createMcpSdkServer(authHeader.trim());
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
 * Universal Vercel Request Dispatcher.
 * Dispatches `/health`, `/mcp`, `/api/mcp`, and `/` to appropriate serverless handlers.
 */
async function handleVercelRequest(req, res) {
    if (applyCorsHeaders(req, res)) {
        return;
    }
    const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;
    if (pathname === '/health' || pathname === '/api/health' || pathname === '/') {
        return handleHealthRequest(req, res);
    }
    if (pathname === '/mcp' || pathname === '/api/mcp') {
        return handleMcpRequest(req, res);
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
}
exports.default = handleVercelRequest;
