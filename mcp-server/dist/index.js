"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.MCP_TOOL_DEFINITIONS = exports.revokedTokenIds = exports.usedAuthorizationCodes = exports.registeredClients = exports.tokenValidationCache = exports.sseLegacyTransports = exports.sessions = exports.validateAuthHeader = exports.verifyOAuthRefreshToken = exports.verifyOAuthAccessToken = exports.generateOAuthTokens = exports.verifyAuthorizationCode = exports.generateAuthorizationCode = exports.handleOAuthRevoke = exports.handleOAuthToken = exports.handleOAuthAuthorize = exports.handleClientRegistration = exports.handleAuthorizationServerMetadata = exports.handleProtectedResourceMetadata = exports.getWwwAuthenticateHeader = exports.getServerOrigin = exports.getTokenHashPrefix = exports.maskToken = exports.verifyDurableSessionId = exports.generateDurableSessionId = exports.createMcpSdkServer = exports.validateAgentTokenWithBackend = exports.applyCorsHeaders = exports.handleMcpRequest = exports.handleHealthRequest = exports.handleVercelRequest = exports.PAIDX_BACKEND_URL = exports.HOST = exports.PORT = void 0;
exports.shutdownMcpServer = shutdownMcpServer;
exports.startMcpServer = startMcpServer;
const http_1 = __importDefault(require("http"));
const server_js_1 = require("./server.js");
Object.defineProperty(exports, "PORT", { enumerable: true, get: function () { return server_js_1.PORT; } });
Object.defineProperty(exports, "HOST", { enumerable: true, get: function () { return server_js_1.HOST; } });
Object.defineProperty(exports, "PAIDX_BACKEND_URL", { enumerable: true, get: function () { return server_js_1.PAIDX_BACKEND_URL; } });
Object.defineProperty(exports, "handleVercelRequest", { enumerable: true, get: function () { return server_js_1.handleVercelRequest; } });
Object.defineProperty(exports, "handleHealthRequest", { enumerable: true, get: function () { return server_js_1.handleHealthRequest; } });
Object.defineProperty(exports, "handleMcpRequest", { enumerable: true, get: function () { return server_js_1.handleMcpRequest; } });
Object.defineProperty(exports, "applyCorsHeaders", { enumerable: true, get: function () { return server_js_1.applyCorsHeaders; } });
Object.defineProperty(exports, "validateAgentTokenWithBackend", { enumerable: true, get: function () { return server_js_1.validateAgentTokenWithBackend; } });
Object.defineProperty(exports, "createMcpSdkServer", { enumerable: true, get: function () { return server_js_1.createMcpSdkServer; } });
Object.defineProperty(exports, "generateDurableSessionId", { enumerable: true, get: function () { return server_js_1.generateDurableSessionId; } });
Object.defineProperty(exports, "verifyDurableSessionId", { enumerable: true, get: function () { return server_js_1.verifyDurableSessionId; } });
Object.defineProperty(exports, "maskToken", { enumerable: true, get: function () { return server_js_1.maskToken; } });
Object.defineProperty(exports, "getTokenHashPrefix", { enumerable: true, get: function () { return server_js_1.getTokenHashPrefix; } });
Object.defineProperty(exports, "getServerOrigin", { enumerable: true, get: function () { return server_js_1.getServerOrigin; } });
Object.defineProperty(exports, "getWwwAuthenticateHeader", { enumerable: true, get: function () { return server_js_1.getWwwAuthenticateHeader; } });
Object.defineProperty(exports, "handleProtectedResourceMetadata", { enumerable: true, get: function () { return server_js_1.handleProtectedResourceMetadata; } });
Object.defineProperty(exports, "handleAuthorizationServerMetadata", { enumerable: true, get: function () { return server_js_1.handleAuthorizationServerMetadata; } });
Object.defineProperty(exports, "handleClientRegistration", { enumerable: true, get: function () { return server_js_1.handleClientRegistration; } });
Object.defineProperty(exports, "handleOAuthAuthorize", { enumerable: true, get: function () { return server_js_1.handleOAuthAuthorize; } });
Object.defineProperty(exports, "handleOAuthToken", { enumerable: true, get: function () { return server_js_1.handleOAuthToken; } });
Object.defineProperty(exports, "handleOAuthRevoke", { enumerable: true, get: function () { return server_js_1.handleOAuthRevoke; } });
Object.defineProperty(exports, "generateAuthorizationCode", { enumerable: true, get: function () { return server_js_1.generateAuthorizationCode; } });
Object.defineProperty(exports, "verifyAuthorizationCode", { enumerable: true, get: function () { return server_js_1.verifyAuthorizationCode; } });
Object.defineProperty(exports, "generateOAuthTokens", { enumerable: true, get: function () { return server_js_1.generateOAuthTokens; } });
Object.defineProperty(exports, "verifyOAuthAccessToken", { enumerable: true, get: function () { return server_js_1.verifyOAuthAccessToken; } });
Object.defineProperty(exports, "verifyOAuthRefreshToken", { enumerable: true, get: function () { return server_js_1.verifyOAuthRefreshToken; } });
Object.defineProperty(exports, "validateAuthHeader", { enumerable: true, get: function () { return server_js_1.validateAuthHeader; } });
Object.defineProperty(exports, "sessions", { enumerable: true, get: function () { return server_js_1.sessions; } });
Object.defineProperty(exports, "sseLegacyTransports", { enumerable: true, get: function () { return server_js_1.sseLegacyTransports; } });
Object.defineProperty(exports, "tokenValidationCache", { enumerable: true, get: function () { return server_js_1.tokenValidationCache; } });
Object.defineProperty(exports, "registeredClients", { enumerable: true, get: function () { return server_js_1.registeredClients; } });
Object.defineProperty(exports, "usedAuthorizationCodes", { enumerable: true, get: function () { return server_js_1.usedAuthorizationCodes; } });
Object.defineProperty(exports, "revokedTokenIds", { enumerable: true, get: function () { return server_js_1.revokedTokenIds; } });
const tools_js_1 = require("./tools.js");
Object.defineProperty(exports, "MCP_TOOL_DEFINITIONS", { enumerable: true, get: function () { return tools_js_1.MCP_TOOL_DEFINITIONS; } });
// Standalone Node.js HTTP server instance (used for local development, Render deployment, and test runners)
const server = http_1.default.createServer(server_js_1.handleVercelRequest);
exports.server = server;
async function shutdownMcpServer() {
    server_js_1.sessions.clear();
    server_js_1.tokenValidationCache.clear();
    server_js_1.usedAuthorizationCodes.clear();
    server_js_1.revokedTokenIds.clear();
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
const isMainModule = () => {
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
        return false;
    }
    if (process.env.NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'))) {
        return false;
    }
    return typeof require !== 'undefined' && require.main === module;
};
function startMcpServer(port = server_js_1.PORT, host = server_js_1.HOST) {
    return server.listen(port, host, () => {
        console.log(`=======================================================`);
        console.log(`  PaidX Dedicated MCP Server running on ${host}:${port}`);
        console.log(`  Transport: Official Streamable HTTP & SSE`);
        console.log(`  Tools: ${tools_js_1.MCP_TOOL_DEFINITIONS.length} registered`);
        console.log(`  Streamable HTTP Endpoint: http://${host}:${port}/mcp`);
        console.log(`  Health Endpoint: http://${host}:${port}/health`);
        console.log(`  OAuth 2.1 Metadata: http://${host}:${port}/.well-known/oauth-authorization-server`);
        console.log(`  Protected Resource Metadata: http://${host}:${port}/.well-known/oauth-protected-resource`);
        console.log(`  Connected Backend Orchestrator: ${server_js_1.PAIDX_BACKEND_URL}`);
        console.log(`=======================================================`);
    });
}
if (isMainModule()) {
    startMcpServer();
}
exports.default = server_js_1.handleVercelRequest;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign(server_js_1.handleVercelRequest, module.exports);
}
