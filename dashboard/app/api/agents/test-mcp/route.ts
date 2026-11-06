import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server/auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { hashAgentToken } from '@/lib/agent/policyEngine';
import { getPublicMcpServerUrl } from '@/lib/config/mcp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/test-mcp
 * Backend-assisted verification of the remote/local standalone MCP endpoint.
 *
 * Security & Integrity:
 * 1. Requires authenticated user session via Supabase JWT.
 * 2. Requires raw agent token and confirms it hashes to an active agent belonging to the user.
 * 3. Never logs raw agent tokens.
 * 4. Pings the standalone MCP server using official Streamable HTTP initialization.
 * 5. Returns real-time health and protocol handshake feedback to the dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Require user authentication
    const auth = await requireAuthenticatedUser(req);
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const user = auth.user;

    // 2. Validate token format from body
    const body = await req.json().catch(() => ({}));
    const { token } = body;

    if (!token || typeof token !== 'string' || !token.startsWith('paidx_agt_')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid token format. Token must begin with "paidx_agt_".',
        },
        { status: 400 }
      );
    }

    // 3. Verify token ownership in database
    const supabase = createServerSupabaseClient();
    const tokenHash = hashAgentToken(token);

    const { data: connection, error: connError } = await supabase
      .from('agent_connections')
      .select('id, agent_name, status, user_id')
      .eq('api_key_hash', tokenHash)
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !connection) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Agent token not found or does not belong to your account.',
        },
        { status: 403 }
      );
    }

    if (connection.status !== 'active') {
      return NextResponse.json(
        {
          success: false,
          error: `Agent connection is currently ${connection.status}.`,
        },
        { status: 400 }
      );
    }

    // 4. Test MCP server connection using official Streamable HTTP initialization handshake
    const targetMcpUrl = getPublicMcpServerUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    let mcpRes: Response;
    try {
      mcpRes = await fetch(targetMcpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `verify-${Date.now()}`,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'PaidX-Console-Tester',
              version: '1.0.0',
            },
          },
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      const isAbort = fetchErr?.name === 'AbortError';
      return NextResponse.json(
        {
          success: false,
          mcpUrl: targetMcpUrl,
          error: isAbort
            ? `Connection to MCP server timed out after 6 seconds (${targetMcpUrl})`
            : `Could not connect to MCP server at ${targetMcpUrl}: ${fetchErr?.message || 'Connection refused'}`,
        },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const sessionId = mcpRes.headers.get('mcp-session-id') || undefined;

    if (!mcpRes.ok) {
      const errorText = await mcpRes.text();
      let parsedMessage = errorText;
      try {
        const parsed = JSON.parse(errorText);
        parsedMessage = parsed.error?.message || parsed.message || errorText;
      } catch {
        // use raw text
      }

      return NextResponse.json(
        {
          success: false,
          mcpUrl: targetMcpUrl,
          status: mcpRes.status,
          error: `MCP server returned HTTP ${mcpRes.status}: ${parsedMessage}`,
        },
        { status: 502 }
      );
    }

    // Parse MCP response
    const jsonRpcRes = (await mcpRes.json()) as any;

    if (jsonRpcRes.error) {
      return NextResponse.json(
        {
          success: false,
          mcpUrl: targetMcpUrl,
          error: `MCP handshake error: ${jsonRpcRes.error.message || 'Unknown JSON-RPC error'}`,
        },
        { status: 502 }
      );
    }

    const serverInfo = jsonRpcRes.result?.serverInfo || {};
    const protocolVersion = jsonRpcRes.result?.protocolVersion || '2024-11-05';

    // Best-effort cleanup of test session if a session ID was generated
    if (sessionId) {
      try {
        fetch(targetMcpUrl, {
          method: 'DELETE',
          headers: {
            'mcp-session-id': sessionId,
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {});
      } catch {
        // non-blocking
      }
    }

    return NextResponse.json({
      success: true,
      mcpUrl: targetMcpUrl,
      sessionId,
      serverInfo,
      protocolVersion,
      agentName: connection.agent_name,
      message: 'MCP server verified! Connected successfully and initialized Streamable HTTP session.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
