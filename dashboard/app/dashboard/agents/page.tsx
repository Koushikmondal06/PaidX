'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { StatCard } from '@/components/ui/StatCard';
import { getStoredSession } from '@/lib/auth';
import {
  Bot,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Send,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Clock,
  Trash2,
  Sliders,
  DollarSign,
  Radio,
  FileText,
  Sparkles,
} from 'lucide-react';

interface AgentItem {
  id: string;
  agent_name: string;
  api_key_prefix: string;
  status: 'active' | 'revoked' | 'expired';
  created_at: string;
  wallets?: {
    id: string;
    address: string;
  };
  agent_policies?: {
    max_amount_per_tx: string;
    daily_budget: string;
    spent_today: string;
    monthly_budget: string;
    autonomous_payments_enabled: boolean;
    allowed_networks: string[];
    allowed_assets: string[];
  }[];
}

interface AgentPaymentItem {
  id: string;
  recipient: string;
  amount_display: string;
  asset: string;
  network: string;
  status: 'confirmed' | 'failed' | 'pending';
  tx_id?: string;
  hashscan_url?: string;
  hcs_topic_id?: string;
  hcs_sequence_number?: number;
  created_at: string;
}

export default function AgentWalletPage() {
  const session = getStoredSession();
  const userId = session?.id || 'usr_8453_92f01';

  // Connected Agents State
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [payments, setPayments] = useState<AgentPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New Agent Modal State
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [agentName, setAgentName] = useState('Claude Assistant');
  const [maxPerTx, setMaxPerTx] = useState('5.00');
  const [dailyBudget, setDailyBudget] = useState('20.00');
  const [monthlyBudget, setMonthlyBudget] = useState('100.00');
  const [autonomousEnabled, setAutonomousEnabled] = useState(true);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Conversational Chat Tester State
  const [chatPrompt, setChatPrompt] = useState('Send 5 USDC to 0.0.123456');
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ sender: 'user' | 'agent'; text: string; details?: any }>>([
    {
      sender: 'agent',
      text: 'PaidX Agentic Wallet ready. You can instruct me in natural language, for example: "Send 5 USDC to 0.0.123456"',
    },
  ]);

  // Load Agents & Payments
  const loadData = async () => {
    try {
      const res = await fetch('/api/agents', {
        headers: { 'x-user-id': userId },
      });
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }

      // Fetch payment history
      const histRes = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer paidx_admin',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'get_payment_history', arguments: { limit: 10 } },
        }),
      });

      if (histRes.ok) {
        const histData = await histRes.json();
        const contentStr = histData.result?.content?.[0]?.text;
        if (contentStr) {
          const parsed = JSON.parse(contentStr);
          if (parsed.payments) setPayments(parsed.payments);
        }
      }
    } catch (err) {
      console.warn('[Agents Page] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  // Handle Connect Agent
  const handleConnectAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          agentName,
          maxAmountPerTx: (parseFloat(maxPerTx) * 1000000).toString(),
          dailyBudget: (parseFloat(dailyBudget) * 1000000).toString(),
          monthlyBudget: (parseFloat(monthlyBudget) * 1000000).toString(),
          autonomousPaymentsEnabled: autonomousEnabled,
          allowedNetworks: ['hedera:testnet'],
          allowedAssets: ['USDC', 'HBAR'],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setCreatedToken(data.token);
        loadData();
      }
    } catch (err) {
      console.error('Error connecting agent:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Revoke Agent
  const handleRevokeAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to revoke this agent? It will immediately lose wallet access.')) return;
    try {
      const res = await fetch('/api/agents/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (res.ok) {
        loadData();
      }
    } catch (err) {
      console.error('Error revoking agent:', err);
    }
  };

  // Handle Conversational Chat Payment
  const handleSendChat = async (promptToSend?: string) => {
    const text = promptToSend || chatPrompt;
    if (!text.trim() || isChatSending) return;

    setChatLog((prev) => [...prev, { sender: 'user', text }]);
    setChatPrompt('');
    setIsChatSending(true);

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          userId,
        }),
      });

      const data = await res.json();
      if (data.response) {
        setChatLog((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: data.response,
            details: data.result,
          },
        ]);
      } else {
        setChatLog((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `Payment failed: ${data.error || 'Server error'}`,
          },
        ]);
      }

      loadData();
    } catch (err: unknown) {
      setChatLog((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: `Error connecting to payment orchestrator: ${(err as Error).message}`,
        },
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const activeAgents = agents.filter((a) => a.status === 'active');
  const primaryHederaAccount =
    agents[0]?.wallets?.address || process.env.NEXT_PUBLIC_HEDERA_OPERATOR_ID || '0.0.5449100';

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#DFE0E2] tracking-tight">AI Agent Wallet</h1>
            <Badge variant="active">Hedera x402</Badge>
            <Badge variant="info">HTS + HCS Native</Badge>
          </div>
          <p className="text-sm text-[#AAAAAA] mt-1 font-mono">
            Connect AI agents to your PaidX wallet for conversational payments on Hedera Testnet.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setCreatedToken(null);
            setShowConnectModal(true);
          }}
          className="self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Connect AI Agent
        </Button>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Connected Agents"
          value={activeAgents.length.toString()}
          subtitle="Active with spending budgets"
          icon={<Bot className="w-4 h-4" />}
        />
        <StatCard
          title="Authorized Hedera Account"
          value={primaryHederaAccount}
          subtitle="Hedera Testnet (Chain ID 296)"
          icon={<ShieldCheck className="w-4 h-4" />}
        />
        <StatCard
          title="Daily Spending Cap"
          value="$20.00 USDC"
          subtitle="Autonomous Policy Enforced"
          icon={<Sliders className="w-4 h-4" />}
        />
        <StatCard
          title="Hedera Facilitator"
          value="Active (x402)"
          subtitle="Sponsoring Gas Fees"
          icon={<Zap className="w-4 h-4" />}
        />
      </div>

      {/* Conversational Payment Console (PRIMARY REQUIREMENT) */}
      <Card className="p-6 border border-[#5465FF]/30 bg-[#071013]">
        <div className="flex items-center justify-between pb-4 border-b border-[#1A2E38]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#00F5D4]" />
            <h2 className="text-base font-semibold text-[#DFE0E2]">Conversational Payment Tester</h2>
          </div>
          <span className="text-xs font-mono text-[#AAAAAA]">
            Natural Language $\rightarrow$ Hedera x402
          </span>
        </div>

        {/* Chat History Window */}
        <div className="mt-4 space-y-3 min-h-[200px] max-h-[320px] overflow-y-auto pr-2 font-mono text-xs">
          {chatLog.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg flex flex-col gap-1.5 ${
                msg.sender === 'user'
                  ? 'bg-[#0E1D24] text-[#00F5D4] border border-[#00F5D4]/20 ml-8'
                  : 'bg-[#101F28] text-[#DFE0E2] border border-[#1A2E38] mr-8'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-[#AAAAAA]">
                {msg.sender === 'user' ? (
                  <>
                    <span className="font-bold text-[#00F5D4]">USER</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-[#5465FF]" />
                    <span className="font-bold text-[#5465FF]">PAIDX AGENT</span>
                  </>
                )}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

              {msg.details?.hashScanUrl && (
                <div className="mt-2 pt-2 border-t border-[#1A2E38] flex items-center gap-4">
                  <a
                    href={msg.details.hashScanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#00F5D4] hover:underline"
                  >
                    View on HashScan <ExternalLink className="w-3 h-3" />
                  </a>
                  {msg.details.hcsTopicId && (
                    <span className="text-[10px] text-[#AAAAAA]">
                      HCS Topic: {msg.details.hcsTopicId} (Seq #{msg.details.hcsSequenceNumber})
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {isChatSending && (
            <div className="p-3 bg-[#101F28] rounded-lg text-xs text-[#AAAAAA] animate-pulse flex items-center gap-2">
              <Bot className="w-3.5 h-3.5 text-[#5465FF] animate-spin" />
              Agent verifying wallet balance and executing Hedera x402 payment...
            </div>
          )}
        </div>

        {/* Quick Example Pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-[11px] text-[#AAAAAA] py-1 font-mono">Quick Test:</span>
          {[
            'Send 5 USDC to 0.0.123456',
            'Send 2 HBAR to 0.0.987654',
            'Send 1 USDC to 0.0.5449100',
          ].map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSendChat(sample)}
              className="text-[11px] font-mono px-2.5 py-1 bg-[#0E1D24] text-[#DFE0E2] border border-[#1A2E38] hover:border-[#5465FF] rounded-md transition-colors"
            >
              {sample}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
            placeholder='Type payment instruction (e.g. "Send 5 USDC to 0.0.123456")...'
            className="flex-1 bg-[#0E1D24] border border-[#1A2E38] rounded-lg px-3 py-2 text-xs font-mono text-[#DFE0E2] focus:outline-none focus:border-[#5465FF]"
          />
          <Button
            variant="primary"
            disabled={isChatSending || !chatPrompt.trim()}
            onClick={() => handleSendChat()}
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            Send
          </Button>
        </div>
      </Card>

      {/* Connected Agents Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#1A2E38]">
          <h2 className="text-base font-semibold text-[#DFE0E2]">Authorized AI Agents</h2>
          <span className="text-xs text-[#AAAAAA] font-mono">{activeAgents.length} active</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-[#AAAAAA]">Loading connected agents...</div>
        ) : agents.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <Bot className="w-8 h-8 text-[#5465FF]/50 mx-auto" />
            <p className="text-sm text-[#AAAAAA] font-mono">No AI agents connected yet.</p>
            <Button variant="outline" size="sm" onClick={() => setShowConnectModal(true)}>
              Connect Your First Agent
            </Button>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-[#1A2E38]">
            {agents.map((agent) => {
              const policy = agent.agent_policies?.[0];
              const dailyBudgetNum = policy?.daily_budget
                ? (Number(policy.daily_budget) / 1000000).toFixed(2)
                : '20.00';
              const spentTodayNum = policy?.spent_today
                ? (Number(policy.spent_today) / 1000000).toFixed(2)
                : '0.00';
              const maxPerTxNum = policy?.max_amount_per_tx
                ? (Number(policy.max_amount_per_tx) / 1000000).toFixed(2)
                : '5.00';

              return (
                <div key={agent.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#DFE0E2]">{agent.agent_name}</span>
                      <Badge variant={agent.status === 'active' ? 'active' : 'revoked'}>
                        {agent.status}
                      </Badge>
                      {policy?.autonomous_payments_enabled && (
                        <Badge variant="info">Autonomous</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono text-[#AAAAAA]">
                      <span>Key: {agent.api_key_prefix}</span>
                      <span>•</span>
                      <span>Wallet: {agent.wallets?.address || primaryHederaAccount}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
                    <div>
                      <div className="text-[#AAAAAA]">Daily Spend</div>
                      <div className="text-[#DFE0E2] font-semibold">
                        ${spentTodayNum} / ${dailyBudgetNum} USDC
                      </div>
                    </div>
                    <div>
                      <div className="text-[#AAAAAA]">Max Per Tx</div>
                      <div className="text-[#DFE0E2] font-semibold">${maxPerTxNum} USDC</div>
                    </div>
                    {agent.status === 'active' && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRevokeAgent(agent.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Historical Payments Ledger */}
      <Card className="p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#1A2E38]">
          <h2 className="text-base font-semibold text-[#DFE0E2]">Hedera x402 Settlement Ledger</h2>
          <span className="text-xs text-[#AAAAAA] font-mono">{payments.length} transactions</span>
        </div>

        {payments.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#AAAAAA] font-mono">
            No payments settled yet. Use the conversational tester above to execute your first payment!
          </div>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1A2E38] text-[#AAAAAA]">
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Recipient</th>
                  <th className="pb-3 font-medium">Amount</th>
                  <th className="pb-3 font-medium">Network</th>
                  <th className="pb-3 font-medium">Hedera Tx ID</th>
                  <th className="pb-3 font-medium">HCS Reference</th>
                  <th className="pb-3 font-medium">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1A2E38]">
                {payments.map((p) => (
                  <tr key={p.id} className="text-[#DFE0E2]">
                    <td className="py-3">
                      <Badge variant={p.status === 'confirmed' ? 'active' : 'warning'}>
                        {p.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-[#00F5D4]">{p.recipient}</td>
                    <td className="py-3 font-semibold">{p.amount_display}</td>
                    <td className="py-3 text-[#AAAAAA]">{p.network}</td>
                    <td className="py-3">
                      {p.tx_id ? (
                        <a
                          href={p.hashscan_url || `https://hashscan.io/testnet/transaction/${p.tx_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#5465FF] hover:underline flex items-center gap-1"
                        >
                          {p.tx_id.slice(0, 16)}...
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#AAAAAA]">—</span>
                      )}
                    </td>
                    <td className="py-3 text-[#AAAAAA]">
                      {p.hcs_sequence_number ? (
                        <span className="text-emerald-400">Seq #{p.hcs_sequence_number}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 text-[#AAAAAA]">
                      {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Connect AI Agent Modal */}
      <Modal
        isOpen={showConnectModal}
        onClose={() => setShowConnectModal(false)}
        title={createdToken ? 'Agent Connected Successfully' : 'Connect New AI Agent'}
      >
        {createdToken ? (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Agent token minted. Copy and store this token securely.</span>
            </div>

            <div className="space-y-1">
              <label className="text-[#AAAAAA] block">PaidX Agent Bearer Token (shown once):</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={createdToken}
                  className="flex-1 bg-[#071013] border border-[#1A2E38] rounded-lg px-3 py-2 text-[#00F5D4] select-all font-mono"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdToken);
                    alert('Token copied to clipboard!');
                  }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  Copy
                </Button>
              </div>
            </div>

            <div className="p-3 bg-[#071013] border border-[#1A2E38] rounded-lg text-[#AAAAAA] space-y-2">
              <div className="font-semibold text-[#DFE0E2]">Claude Desktop / Cursor MCP Setup:</div>
              <pre className="text-[10px] text-[#DFE0E2] bg-[#0E1D24] p-2 rounded overflow-x-auto">
{`"mcpServers": {
  "paidx": {
    "url": "http://localhost:3000/api/mcp",
    "headers": {
      "Authorization": "Bearer ${createdToken}"
    }
  }
}`}
              </pre>
            </div>

            <Button variant="primary" className="w-full" onClick={() => setShowConnectModal(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleConnectAgent} className="space-y-4">
            <Input
              label="Agent Name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Claude Desktop Assistant"
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Max per Transaction (USDC)"
                type="number"
                step="0.01"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(e.target.value)}
                required
              />
              <Input
                label="Daily Spending Cap (USDC)"
                type="number"
                step="0.01"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                required
              />
            </div>

            <Input
              label="Monthly Spending Cap (USDC)"
              type="number"
              step="0.01"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              required
            />

            <div className="flex items-center justify-between p-3 bg-[#071013] border border-[#1A2E38] rounded-lg">
              <div>
                <div className="text-xs font-semibold text-[#DFE0E2]">Autonomous Payments</div>
                <div className="text-[11px] text-[#AAAAAA]">
                  Allow agent to pay up to daily budget without prompting
                </div>
              </div>
              <input
                type="checkbox"
                checked={autonomousEnabled}
                onChange={(e) => setAutonomousEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#5465FF] rounded"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setShowConnectModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Minting Agent Token...' : 'Authorize Agent'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
