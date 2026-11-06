import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { orchestrateAgentPayment } from '@/lib/agent/orchestrator';
import { isValidHederaAccountId } from '@/lib/hedera/client';
import { parsePaymentInstruction } from '@/lib/agent/instructionParser';
import type { AgentContext } from '@/lib/agent/policyEngine';

export const dynamic = 'force-dynamic';

/**
 * Chat endpoint handling direct natural language instructions from users or agents
 */
export async function POST(req: NextRequest) {
  try {
    const { prompt, agentId: providedAgentId, userId: providedUserId } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Instruction prompt is required' }, { status: 400 });
    }

    const parsed = parsePaymentInstruction(prompt);
    if (parsed.error || !parsed.recipient || !parsed.amount) {
      return NextResponse.json({
        response: parsed.error || 'Could not understand the payment instruction. Example: "Send 5 USDC to 0.0.123456."',
        parsed,
      });
    }

    const supabase = createServerSupabaseClient();

    // Resolve active agent and wallet
    let agentRecord: any = null;
    if (providedAgentId) {
      const { data } = await supabase
        .from('agent_connections')
        .select('*, wallets(*)')
        .eq('id', providedAgentId)
        .eq('status', 'active')
        .maybeSingle();
      agentRecord = data;
    } else if (providedUserId) {
      const { data } = await supabase
        .from('agent_connections')
        .select('*, wallets(*)')
        .eq('user_id', providedUserId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      agentRecord = data;
    } else {
      // Default fallback to first active agent
      const { data } = await supabase
        .from('agent_connections')
        .select('*, wallets(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      agentRecord = data;
    }

    if (!agentRecord) {
      return NextResponse.json({
        response: 'No active connected PaidX agent wallet found. Please connect your wallet in the Agent Wallet section first.',
        parsed,
      });
    }

    const agentContext: AgentContext = {
      agentId: agentRecord.id,
      agentName: agentRecord.agent_name,
      userId: agentRecord.user_id,
      walletId: agentRecord.wallet_id,
      walletAddress: agentRecord.wallets?.address || process.env.HEDERA_OPERATOR_ID || '0.0.5449100',
    };

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
        messages,
        result,
      });
    } else {
      return NextResponse.json({
        success: false,
        response: `Payment failed: ${result.error || 'Declined'}`,
        result,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Chat error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
