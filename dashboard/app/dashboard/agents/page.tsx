'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { StatCard } from '@/components/ui/StatCard';
import { getStoredSession } from '@/lib/auth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
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
  Check,
  Clock,
  Trash2,
  Sliders,
  DollarSign,
  Radio,
  FileText,
  Sparkles,
  Wallet,
  RefreshCw,
} from 'lucide-react';
import { HEDERA_TESTNET_CHAIN_PARAMS } from '@/lib/hedera/chain';
import { getPublicMcpServerUrl, buildMcpClientConfig } from '@/lib/config/mcp';

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

interface HederaWalletInfo {
  id: string;
  address: string;
  network: string;
  chainId: number;
  verified: boolean;
  publicKey?: string;
  evmAddress?: string | null;
  signerType?: string;
  isPrimary: boolean;
  hashScanUrl: string;
  balance?: {
    hbarBalance: string;
    tokens: Array<{ token_id: string; balance: number }>;
  } | null;
  createdAt: string;
}

export default function AgentWalletPage() {
  const session = getStoredSession();
  const userId = session?.id || 'usr_8453_92f01';

  // Connected Agents & Payments State
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [payments, setPayments] = useState<AgentPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Linked Hedera Wallet State
  const [hederaWallet, setHederaWallet] = useState<HederaWalletInfo | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  // Link Wallet Modal State
  const [showLinkWalletModal, setShowLinkWalletModal] = useState(false);
  const [activeLinkTab, setActiveLinkTab] = useState<'metamask' | 'manual'>('metamask');
  const [isLinkingMetaMask, setIsLinkingMetaMask] = useState(false);
  const [metaMaskStatusText, setMetaMaskStatusText] = useState<string | null>(null);
  const [linkAccountId, setLinkAccountId] = useState('');
  const [linkSigningKey, setLinkSigningKey] = useState('');
  const [linkPublicKey, setLinkPublicKey] = useState('');
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);
  const [walletLinkError, setWalletLinkError] = useState<string | null>(null);
  const [walletLinkSuccess, setWalletLinkSuccess] = useState<string | null>(null);

  // New Agent Modal State
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [agentName, setAgentName] = useState('Claude Assistant');
  const [maxPerTx, setMaxPerTx] = useState('5.00');
  const [dailyBudget, setDailyBudget] = useState('20.00');
  const [monthlyBudget, setMonthlyBudget] = useState('100.00');
  const [autonomousEnabled, setAutonomousEnabled] = useState(true);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agentConnectError, setAgentConnectError] = useState<string | null>(null);

  // MCP Success Modal & Connection Test State
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isTestingMcp, setIsTestingMcp] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    mcpUrl?: string;
    serverInfo?: any;
    protocolVersion?: string;
  } | null>(null);

  const publicMcpUrl = getPublicMcpServerUrl();

  const copyToClipboard = (text: string, type: 'config' | 'token' | 'url') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === 'config') {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
      } else if (type === 'token') {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
      } else if (type === 'url') {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      }
    }
  };

  const handleCloseConnectModal = () => {
    setShowConnectModal(false);
    // Securely wipe raw agent token from frontend state so it cannot be viewed again
    setCreatedToken(null);
    setMcpTestResult(null);
    setCopiedConfig(false);
    setCopiedToken(false);
    setCopiedUrl(false);
    setAgentConnectError(null);
  };

  const handleTestMcpConnection = async () => {
    if (!createdToken) return;
    setIsTestingMcp(true);
    setMcpTestResult(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession?.session?.access_token;

      const res = await fetch('/api/agents/test-mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ token: createdToken }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMcpTestResult({
          success: false,
          error: data.error || 'Failed to verify MCP server connection',
          mcpUrl: data.mcpUrl || publicMcpUrl,
        });
      } else {
        setMcpTestResult({
          success: true,
          message: data.message || 'Connected successfully to MCP server.',
          mcpUrl: data.mcpUrl,
          serverInfo: data.serverInfo,
          protocolVersion: data.protocolVersion,
        });
      }
    } catch (err: unknown) {
      setMcpTestResult({
        success: false,
        error: err instanceof Error ? err.message : 'Network error testing MCP connection',
        mcpUrl: publicMcpUrl,
      });
    } finally {
      setIsTestingMcp(false);
    }
  };

  // Conversational Chat Tester State
  const [chatPrompt, setChatPrompt] = useState('Send 5 USDC to 0.0.123456');
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatLog, setChatLog] = useState<Array<{ sender: 'user' | 'agent'; text: string; details?: any }>>([
    {
      sender: 'agent',
      text: 'PaidX Agentic Wallet ready. You can instruct me in natural language, for example: "Send 5 USDC to 0.0.123456"',
    },
  ]);

  // Load Agents, Wallet & Payments
  const loadData = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession?.session?.access_token;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // 1. Fetch linked Hedera wallet
      setWalletLoading(true);
      const walletRes = await fetch('/api/wallets/hedera', { headers });
      if (walletRes.ok) {
        const wData = await walletRes.json();
        if (wData.hasLinkedWallet && wData.wallet) {
          setHederaWallet(wData.wallet);
        } else {
          setHederaWallet(null);
        }
      }
      setWalletLoading(false);

      // 2. Fetch connected agents
      const res = await fetch('/api/agents', { headers });
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }

      // 3. Fetch payment history scoped to user
      const histRes = await fetch('/api/agents/payments', { headers });
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.payments) setPayments(histData.payments);
      }
    } catch (err) {
      console.warn('[Agents Page] Failed to fetch:', err);
    } finally {
      setLoading(false);
      setWalletLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  // Handle MetaMask Hedera Testnet Wallet Linking
  const handleLinkMetaMask = async () => {
    setWalletLinkError(null);
    setWalletLinkSuccess(null);
    setIsLinkingMetaMask(true);

    try {
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        throw new Error(
          'MetaMask extension is not detected in your browser. Please install MetaMask to use 1-click EVM wallet linking.'
        );
      }

      const ethereum = (window as any).ethereum;

      // 1. Request accounts
      setMetaMaskStatusText('Connecting to MetaMask...');
      const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected in MetaMask.');
      }
      const evmAddress = accounts[0];

      // 2. Ensure connected to Hedera Testnet (Chain ID 296 / 0x128)
      setMetaMaskStatusText('Switching to Hedera Testnet (Chain ID 296)...');
      const currentChainIdHex: string = await ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(currentChainIdHex, 16);

      if (currentChainId !== 296) {
        try {
          await ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x128' }],
          });
        } catch (switchErr: any) {
          if (switchErr.code === 4902 || switchErr?.data?.originalError?.code === 4902) {
            await ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [HEDERA_TESTNET_CHAIN_PARAMS],
            });
          } else {
            throw switchErr;
          }
        }
      }

      // 3. Request server-issued, single-use, expiring challenge
      setMetaMaskStatusText('Requesting single-use challenge from PaidX server...');
      const supabase = createBrowserSupabaseClient();
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession?.session?.access_token;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const chalRes = await fetch('/api/wallets/hedera/challenge', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          evmAddress,
          chainId: 296,
          network: 'hedera:testnet',
          action: 'link-metamask-hedera',
        }),
      });

      const chalData = await chalRes.json();
      if (!chalRes.ok) {
        throw new Error(chalData.error || 'Failed to issue verification challenge.');
      }

      // 4. Request personal_sign signature from MetaMask
      setMetaMaskStatusText('Please sign the verification message in MetaMask...');
      const signature: string = await ethereum.request({
        method: 'personal_sign',
        params: [chalData.challenge, evmAddress],
      });

      // 5. Submit signed challenge to server for verification & Mirror Node lookup
      setMetaMaskStatusText('Verifying signature & resolving Hedera account on Mirror Node...');
      const linkRes = await fetch('/api/wallets/hedera', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          evmAddress,
          signature,
          challenge: chalData.challenge,
          nonce: chalData.nonce,
          chainId: 296,
          network: 'hedera:testnet',
          action: 'link-metamask-hedera',
        }),
      });

      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        throw new Error(linkData.error || 'Failed to verify and link MetaMask wallet.');
      }

      setWalletLinkSuccess(
        `MetaMask wallet (${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}) resolved to Hedera Account "${linkData.wallet.address}" and linked successfully!`
      );
      await loadData();

      setTimeout(() => {
        setShowLinkWalletModal(false);
        setWalletLinkSuccess(null);
        setMetaMaskStatusText(null);
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'MetaMask linking failed';
      setWalletLinkError(msg);
    } finally {
      setIsLinkingMetaMask(false);
      setMetaMaskStatusText(null);
    }
  };

  // Handle Register/Link Hedera Wallet
  const handleLinkWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWalletLinkError(null);
    setWalletLinkSuccess(null);
    setIsLinkingWallet(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession?.session?.access_token;

      const res = await fetch('/api/wallets/hedera', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          accountId: linkAccountId.trim(),
          network: 'hedera:testnet',
          ...(linkSigningKey.trim() ? { signingKey: linkSigningKey.trim() } : {}),
          ...(linkPublicKey.trim() ? { publicKey: linkPublicKey.trim() } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to link Hedera wallet');
      }

      setWalletLinkSuccess(`Hedera account "${data.wallet.address}" successfully verified & linked!`);
      await loadData();

      setTimeout(() => {
        setShowLinkWalletModal(false);
        setWalletLinkSuccess(null);
        setLinkAccountId('');
        setLinkSigningKey('');
        setLinkPublicKey('');
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wallet linking failed';
      setWalletLinkError(msg);
    } finally {
      setIsLinkingWallet(false);
    }
  };

  // Handle Connect Agent
  const handleConnectAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAgentConnectError(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession?.session?.access_token;

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          agentName,
          walletId: hederaWallet?.id,
          maxAmountPerTx: (parseFloat(maxPerTx) * 1000000).toString(),
          dailyBudget: (parseFloat(dailyBudget) * 1000000).toString(),
          monthlyBudget: (parseFloat(monthlyBudget) * 1000000).toString(),
          autonomousPaymentsEnabled: autonomousEnabled,
          allowedNetworks: ['hedera:testnet'],
          allowedAssets: ['USDC', 'HBAR'],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to authorize agent');
      }

      setCreatedToken(data.token);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error connecting agent';
      setAgentConnectError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Revoke Agent
  const handleRevokeAgent = async (agentId: string) => {
    if (!confirm('Are you sure you want to revoke this agent? It will immediately lose wallet access.')) return;
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession?.session?.access_token;

      const res = await fetch('/api/agents/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
      const supabase = createBrowserSupabaseClient();
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession?.session?.access_token;

      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: text,
          agentId: agents[0]?.id,
        }),
      });

      const data = await res.json();
      if (data.response) {
        setChatLog((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: data.response,
            details: data.details,
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
  const displayWalletAddress = hederaWallet?.address || 'No Hedera Wallet Linked';

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#DFE0E2] tracking-tight">AI Agent Wallet</h1>
            <Badge variant="active">Hedera x402</Badge>
            <Badge variant="info">HTS + HCS Native</Badge>
            <Badge variant="info">16 MCP Tools</Badge>
          </div>
          <p className="text-sm text-[#AAAAAA] mt-1 font-mono">
            Connect AI agents to your PaidX Hedera wallet for conversational payments on Hedera Testnet.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            onClick={() => {
              setWalletLinkError(null);
              setWalletLinkSuccess(null);
              setActiveLinkTab('metamask');
              setShowLinkWalletModal(true);
            }}
          >
            <Wallet className="w-4 h-4 mr-1.5" />
            {hederaWallet ? 'Manage Hedera Wallet' : 'Link MetaMask to Hedera'}
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              setCreatedToken(null);
              setAgentConnectError(null);
              setShowConnectModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Connect AI Agent
          </Button>
        </div>
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
          value={displayWalletAddress}
          subtitle={hederaWallet ? 'Hedera Testnet (Chain ID 296)' : 'Action Required: Link Wallet'}
          icon={hederaWallet ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-amber-400" />}
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

      {/* Connected Hedera Wallet Banner Section */}
      {walletLoading ? (
        <Card className="p-4 border border-[#1A2E38] bg-[#071013] text-xs text-[#AAAAAA] font-mono flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#5465FF]" />
          Verifying linked Hedera account on Mirror Node...
        </Card>
      ) : hederaWallet ? (
        <Card className="p-5 border border-emerald-500/30 bg-[#071013] relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-[#AAAAAA]">Connected Hedera Wallet</span>
                <Badge variant="active">Verified on Mirror Node</Badge>
                <Badge variant="info">Testnet (296)</Badge>
                {hederaWallet.signerType === 'metamask_evm' && (
                  <Badge variant="info">MetaMask EVM</Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold font-mono text-[#00F5D4]">{hederaWallet.address}</span>
                {hederaWallet.evmAddress && (
                  <span className="text-xs font-mono text-[#AAAAAA] bg-[#1A2E38]/60 px-2 py-0.5 rounded border border-[#1A2E38]">
                    EVM: {hederaWallet.evmAddress.slice(0, 6)}...{hederaWallet.evmAddress.slice(-4)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(hederaWallet.address);
                    alert('Hedera Account ID copied to clipboard!');
                  }}
                  className="text-[#AAAAAA] hover:text-[#DFE0E2] transition-colors"
                  title="Copy Account ID"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <a
                  href={hederaWallet.hashScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#5465FF] hover:underline flex items-center gap-1 font-mono"
                >
                  View on HashScan <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {hederaWallet.balance && (
                <div className="text-xs font-mono text-[#AAAAAA]">
                  On-Chain Balance: <span className="text-[#DFE0E2] font-semibold">{hederaWallet.balance.hbarBalance} HBAR</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWalletLinkError(null);
                  setWalletLinkSuccess(null);
                  setActiveLinkTab('metamask');
                  setShowLinkWalletModal(true);
                }}
              >
                Change Wallet
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5 border border-amber-500/40 bg-amber-500/5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-[#DFE0E2]">No Hedera Wallet Linked</h3>
                <p className="text-xs text-[#AAAAAA] mt-1">
                  You must link an authorized Hedera Testnet account (via MetaMask or Account ID) before creating AI agents or executing conversational x402 payments.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="primary"
                onClick={() => {
                  setWalletLinkError(null);
                  setWalletLinkSuccess(null);
                  setActiveLinkTab('metamask');
                  setShowLinkWalletModal(true);
                }}
              >
                <Wallet className="w-4 h-4 mr-1.5" />
                Link MetaMask to Hedera
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWalletLinkError(null);
                  setWalletLinkSuccess(null);
                  setActiveLinkTab('manual');
                  setShowLinkWalletModal(true);
                }}
              >
                Manual ID
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Conversational Payment Console */}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreatedToken(null);
                setAgentConnectError(null);
                setShowConnectModal(true);
              }}
            >
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
                      <span>Wallet: {agent.wallets?.address || displayWalletAddress}</span>
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

      {/* Link / Register Hedera Wallet Modal */}
      <Modal
        isOpen={showLinkWalletModal}
        onClose={() => setShowLinkWalletModal(false)}
        title={hederaWallet ? 'Manage Connected Hedera Wallet' : 'Link Hedera Testnet Wallet'}
      >
        <div className="space-y-4">
          {/* Tab Selector */}
          <div className="flex items-center gap-2 border-b border-[#1A2E38] pb-3">
            <button
              type="button"
              onClick={() => {
                setActiveLinkTab('metamask');
                setWalletLinkError(null);
                setWalletLinkSuccess(null);
              }}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 ${
                activeLinkTab === 'metamask'
                  ? 'bg-[#5465FF] text-white font-semibold'
                  : 'text-[#AAAAAA] hover:text-[#DFE0E2] hover:bg-[#1A2E38]/50'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              MetaMask (EVM Linking)
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveLinkTab('manual');
                setWalletLinkError(null);
                setWalletLinkSuccess(null);
              }}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 ${
                activeLinkTab === 'manual'
                  ? 'bg-[#5465FF] text-white font-semibold'
                  : 'text-[#AAAAAA] hover:text-[#DFE0E2] hover:bg-[#1A2E38]/50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Manual Account ID
            </button>
          </div>

          {walletLinkError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{walletLinkError}</span>
            </div>
          )}

          {walletLinkSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{walletLinkSuccess}</span>
            </div>
          )}

          {activeLinkTab === 'metamask' ? (
            <div className="space-y-4">
              <div className="p-4 bg-[#071013] border border-[#1A2E38] rounded-lg text-xs font-mono text-[#AAAAAA] space-y-2">
                <div className="font-semibold text-[#DFE0E2] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#00F5D4]" />
                  MetaMask Hedera Testnet Integration
                </div>
                <p>
                  Link your MetaMask EVM wallet to PaidX on Hedera Testnet.
                </p>
                <div className="space-y-1 text-[11px] text-[#888888]">
                  <div>• <span className="text-[#DFE0E2]">Network:</span> Hedera Testnet (Chain ID 296)</div>
                  <div>• <span className="text-[#DFE0E2]">RPC:</span> https://testnet.hashio.io/api</div>
                  <div>• <span className="text-[#DFE0E2]">Security:</span> Server-issued, single-use cryptographic challenge</div>
                  <div>• <span className="text-[#DFE0E2]">Resolution:</span> Automatically resolves EVM address to Hedera Account ID (0.0.x) on Mirror Node</div>
                </div>
              </div>

              {metaMaskStatusText && (
                <div className="p-3 bg-[#5465FF]/10 border border-[#5465FF]/30 rounded-lg text-[#DFE0E2] text-xs font-mono flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#5465FF] shrink-0" />
                  <span>{metaMaskStatusText}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1A2E38]">
                <Button variant="outline" type="button" onClick={() => setShowLinkWalletModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={handleLinkMetaMask}
                  disabled={isLinkingMetaMask}
                >
                  <Wallet className="w-4 h-4 mr-1.5" />
                  {isLinkingMetaMask ? 'Connecting & Verifying...' : 'Connect & Link MetaMask'}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleLinkWalletSubmit} className="space-y-4">
              <div className="p-3 bg-[#071013] border border-[#1A2E38] rounded-lg text-xs font-mono text-[#AAAAAA] space-y-1">
                <div className="font-semibold text-[#DFE0E2] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#00F5D4]" />
                  Hedera Mirror Node On-Chain Verification
                </div>
                <p>
                  Enter your Hedera account ID. PaidX will verify the account on Mirror Node, check key control, and link it securely.
                </p>
              </div>

              <Input
                label="Hedera Account ID"
                value={linkAccountId}
                onChange={(e) => setLinkAccountId(e.target.value)}
                placeholder="e.g. 0.0.123456"
                required
              />

              <div>
                <Input
                  label="Delegated Signing Key (Optional / Dev & Testing)"
                  type="password"
                  value={linkSigningKey}
                  onChange={(e) => setLinkSigningKey(e.target.value)}
                  placeholder="0x... or 302e... (DER/Hex private key)"
                />
                <p className="text-[11px] font-mono text-[#AAAAAA] mt-1">
                  Encrypted in memory only, never stored on disk or database. Enables AI agents to sign payments autonomously.
                </p>
              </div>

              <div>
                <Input
                  label="Public Key (Alternative if no private key)"
                  value={linkPublicKey}
                  onChange={(e) => setLinkPublicKey(e.target.value)}
                  placeholder="302a... (Hex public key)"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1A2E38]">
                <Button variant="outline" type="button" onClick={() => setShowLinkWalletModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isLinkingWallet || !linkAccountId.trim()}>
                  {isLinkingWallet ? 'Verifying on Mirror Node...' : 'Verify & Link Wallet'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* Connect AI Agent Modal */}
      <Modal
        isOpen={showConnectModal}
        onClose={handleCloseConnectModal}
        title={createdToken ? 'Agent Connected Successfully' : 'Connect New AI Agent'}
      >
        {createdToken ? (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <div className="font-semibold text-emerald-300">Agent Token Minted & Ready to Connect</div>
                <div className="text-[11px] text-emerald-400/80 mt-0.5">
                  This Bearer token is shown only once. Copy it now and configure your AI client (Claude Desktop, Cursor, ChatGPT).
                </div>
              </div>
            </div>

            {/* Public MCP Server Endpoint */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[#AAAAAA]">
                <label className="block text-xs">Public MCP Server Endpoint:</label>
                <span className="text-[10px] text-[#5465FF] bg-[#5465FF]/10 px-1.5 py-0.5 rounded border border-[#5465FF]/20 font-mono">
                  Streamable HTTP
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={publicMcpUrl}
                  className="flex-1 bg-[#071013] border border-[#1A2E38] rounded-lg px-3 py-2 text-[#00F5D4] select-all font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => copyToClipboard(publicMcpUrl, 'url')}
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedUrl ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* PaidX Agent Bearer Token */}
            <div className="space-y-1">
              <label className="text-[#AAAAAA] block text-xs">PaidX Agent Bearer Token (Shown Once):</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={createdToken}
                  className="flex-1 bg-[#071013] border border-[#1A2E38] rounded-lg px-3 py-2 text-[#DFE0E2] select-all font-mono text-xs break-all"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => copyToClipboard(createdToken, 'token')}
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedToken ? 'Token Copied!' : 'Copy Token'}
                </Button>
              </div>
            </div>

            {/* Claude Desktop / Cursor MCP Setup */}
            <div className="p-3 bg-[#071013] border border-[#1A2E38] rounded-lg text-[#AAAAAA] space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[#DFE0E2]">Claude Desktop / Cursor MCP Setup:</div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(buildMcpClientConfig(createdToken, publicMcpUrl), null, 2),
                      'config'
                    )
                  }
                  className="text-[11px] h-7 px-2.5"
                >
                  {copiedConfig ? (
                    <Check className="w-3 h-3 text-emerald-400 mr-1" />
                  ) : (
                    <Copy className="w-3 h-3 mr-1" />
                  )}
                  {copiedConfig ? 'Config Copied!' : 'Copy MCP Configuration'}
                </Button>
              </div>
              <pre className="text-[11px] text-[#DFE0E2] bg-[#0E1D24] p-3 rounded overflow-x-auto whitespace-pre font-mono border border-[#1A2E38]/60">
{JSON.stringify(buildMcpClientConfig(createdToken, publicMcpUrl), null, 2)}
              </pre>
            </div>

            {/* MCP Connection Test Section */}
            <div className="space-y-2">
              <Button
                variant="outline"
                type="button"
                className="w-full flex items-center justify-center gap-2 border-[#1A2E38] hover:border-[#5465FF]/50 text-[#DFE0E2]"
                onClick={handleTestMcpConnection}
                disabled={isTestingMcp}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingMcp ? 'animate-spin text-[#5465FF]' : ''}`} />
                {isTestingMcp ? 'Verifying MCP Connection...' : 'Test MCP Connection'}
              </Button>

              {mcpTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs font-mono space-y-1 ${
                    mcpTestResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {mcpTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    )}
                    <span>{mcpTestResult.success ? 'MCP Connection Verified' : 'MCP Test Failed'}</span>
                  </div>
                  <p className="text-[11px] opacity-90 break-all">
                    {mcpTestResult.success ? mcpTestResult.message : mcpTestResult.error}
                  </p>
                  {mcpTestResult.success && mcpTestResult.mcpUrl && (
                    <div className="text-[10px] text-[#AAAAAA] pt-1 border-t border-emerald-500/20 flex flex-wrap gap-x-3">
                      <span>Endpoint: {mcpTestResult.mcpUrl}</span>
                      {mcpTestResult.protocolVersion && <span>Protocol: {mcpTestResult.protocolVersion}</span>}
                      {mcpTestResult.serverInfo?.name && <span>Server: {mcpTestResult.serverInfo.name}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button variant="primary" className="w-full" onClick={handleCloseConnectModal}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleConnectAgent} className="space-y-4">
            {!hederaWallet && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs font-mono flex items-center justify-between">
                <span>No Hedera wallet linked. Link a wallet first:</span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setShowConnectModal(false);
                    setShowLinkWalletModal(true);
                  }}
                >
                  Link Wallet
                </Button>
              </div>
            )}

            {agentConnectError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{agentConnectError}</span>
              </div>
            )}

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
