/**
 * PaidX MCP Server — Health Endpoint
 * GET /health and GET /
 * Self-contained zero-dependency serverless handler for Vercel.
 */

async function handler(req, res) {
  // CORS Headers
  const origin = req.headers?.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id, accept'
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Handle GET /health
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0',
  });
  res.end(
    JSON.stringify({
      status: 'healthy',
      name: 'paidx-mcp-server',
      version: '1.0.0',
      transport: 'streamable-http',
      protocolVersion: '2024-11-05',
      toolsCount: 16,
      hederaNetwork: process.env.HEDERA_NETWORK || 'testnet',
      runtime: 'vercel-serverless',
      timestamp: new Date().toISOString(),
    })
  );
}

module.exports = handler;
module.exports.default = handler;
