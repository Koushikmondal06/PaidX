import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/server/auth';
import { authenticateAgentToken, type AgentContext } from '@/lib/agent/policyEngine';
import { orchestrateAgentPayment } from '@/lib/agent/orchestrator';
import { parsePaymentInstruction } from '@/lib/agent/instructionParser';

export const dynamic = 'force-dynamic';

/**
 * Chat endpoint handling direct natural language payment instructions.
 * Authenticates either via user Supabase session OR Agent Bearer Token.
 * Never falls back to a global unassociated agent.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    let agentContext: AgentContext | null = null;

    // 1. Check if authenticated via Agent Bearer Token (paidx_agt_...)
    if (authHeader.toLowerCase().includes('paidx_agt_')) {
      agentContext = await authenticateAgentToken(authHeader);
      if (!agentContext) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid, expired, or revoked Agent Token.' },
          { status: 401 }
        );
      }
    } else {
      // 2. Check if authenticated via Supabase User Session
      const user = await getAuthenticatedUser(req);
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized: Authentication required (User session or Agent Bearer Token).' },
          { status: 401 }
        );
      }

      const body = await req.json();
      const { agentId: providedAgentId } = body;

      const supabase = createServerSupabaseClient();
      let agentQuery = supabase
        .from('agent_connections')
        .select(`
          id,
          agent_name,
          user_id,
          wallet_id,
          status,
          wallets (
            id,
            address,
            kind
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (providedAgentId) {
        agentQuery = agentQuery.eq('id', providedAgentId);
      }

      const { data: agentRecord, error: agentError } = await agentQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (agentError || !agentRecord) {
        return NextResponse.json(
          {
            error:
              'No active connected PaidX agent wallet found for your account. Please connect your Hedera wallet in the Agent Wallet section first.',
          },
          { status: 400 }
        );
      }

      const wallet = (agentRecord as any).wallets;
      if (!wallet || wallet.kind !== 'hedera' || !wallet.address) {
        return NextResponse.json(
          { error: 'The connected agent wallet is not a valid Hedera wallet.' },
          { status: 400 }
        );
      }

      agentContext = {
        agentId: agentRecord.id,
        agentName: agentRecord.agent_name,
        userId: agentRecord.user_id,
        walletId: agentRecord.wallet_id,
        walletAddress: wallet.address,
      };

      // Re-attach body prompt
      req = new NextRequest(req.url, {
        method: req.method,
        headers: req.headers,
        body: JSON.stringify(body),
      });
    }

    // Read and validate instruction prompt
    let bodyJson: any = {};
    try {
      bodyJson = await req.json();
    } catch {
      // already read above
    }
    const prompt = bodyJson.prompt;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Instruction prompt is required' }, { status: 400 });
    }

    const parsed = parsePaymentInstruction(prompt);
    if (parsed.error || !parsed.recipient || !parsed.amount) {
      return NextResponse.json({
        response:
          parsed.error ||
          'Could not understand the payment instruction. Example: "Send 5 USDC to 0.0.123456."',
        parsed,
      });
    }

    // Execute Payment via Orchestrator
    const result = await orchestrateAgentPayment(agentContext, {
      recipient: parsed.recipient,
      amount: parsed.amount,
      asset: parsed.asset,
      network: parsed.network,
    });

    if (result.success) {
      const messages = [
        `I found your connected PaidX wallet (${agentContext.walletAddress}). I will send ${parsed.amount} ${parsed.asset} to ${parsed.recipient} using Hedera.`,
        `Payment successful. ${parsed.amount} ${parsed.asset} was sent to ${parsed.recipient}.`,
        `Transaction ID: ${result.transactionId}`,
        `HashScan: ${result.hashScanUrl}`,
      ];

      if (result.hcsTopicId && result.hcsSequenceNumber) {
        messages.push(`HCS Audit Sequence: #${result.hcsSequenceNumber} on topic ${result.hcsTopicId}`);
      }

      return NextResponse.json({
        success: true,
        response: messages.join('\n\n'),
        details: {
          transactionId: result.transactionId,
          hashScanUrl: result.hashScanUrl,
          hcsTopicId: result.hcsTopicId,
          hcsSequenceNumber: result.hcsSequenceNumber,
          paymentId: result.paymentId,
        },
      });
    }

    if (result.requiresHumanApproval || result.status === 'approval_required') {
      return NextResponse.json({
        success: false,
        requiresHumanApproval: true,
        response: `Payment requires interactive human approval: ${result.error}`,
        details: result,
      });
    }

    return NextResponse.json({
      success: false,
      response: `Payment failed: ${result.error}`,
      details: result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
