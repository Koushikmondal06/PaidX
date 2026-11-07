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
  ChevronRight,
  Cpu,
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

      // 3. Request server-issued challenge
      setMetaMaskStatusText('Requesting single-use verification challenge...');
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

      // 4. Request personal_sign signature
      setMetaMaskStatusText('Please sign the verification message in MetaMask...');
      const signature: string = await ethereum.request({
        method: 'personal_sign',
        params: [chalData.challenge, evmAddress],
      });

      // 5. Submit signed challenge to server for verification & Mirror Node lookup
      setMetaMaskStatusText('Resolving Hedera account on Mirror Node...');
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
  const displayWalletAddress = hederaWallet?.address || 'No Hedera Wallet';

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
              AI Agent Wallet
            </h1>
            <Badge variant="active" dot>Hedera x402</Badge>
            <Badge variant="info">HTS + HCS Native</Badge>
            <Badge variant="default">16 MCP Tools</Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] font-archivo">
            Delegate conversational payments to autonomous AI agents via official Model Context Protocol (MCP) tools.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setWalletLinkError(null);
              setWalletLinkSuccess(null);
              setActiveLinkTab('metamask');
              setShowLinkWalletModal(true);
            }}
            className="text-xs font-archivo"
          >
            <Wallet className="w-3.5 h-3.5 mr-1.5 text-[#1749F5] dark:text-[#5B8EFF]" />
            <span>{hederaWallet ? 'Manage Hedera Wallet' : 'Link MetaMask to Hedera'}</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setCreatedToken(null);
              setAgentConnectError(null);
              setShowConnectModal(true);
            }}
            className="text-xs font-archivo"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>Connect AI Agent</span>
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Connected Agents"
          value={activeAgents.length.toString()}
          subtitle="Active with spending budgets"
          icon={<Bot className="w-5 h-5" />}
        />
        <StatCard
          title="Hedera Account"
          value={displayWalletAddress}
          subtitle={hederaWallet ? 'Hedera Testnet (Chain ID 296)' : 'Link wallet to activate'}
          icon={
            hederaWallet ? (
              <ShieldCheck className="w-5 h-5 text-[#10B981]" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-[#F59E0B]" />
            )
          }
        />
        <StatCard
          title="Daily Spending Cap"
          value="$20.00 USDC"
          subtitle="Autonomous Policy Enforced"
          icon={<Sliders className="w-5 h-5" />}
        />
        <StatCard
          title="Gas Facilitator"
          value="Active (x402)"
          subtitle="Sponsored transaction fees"
          icon={<Zap className="w-5 h-5" />}
        />
      </div>

      {/* Connected Hedera Wallet Banner Section: Split Panel & Inner Card Motif */}
      {walletLoading ? (
        <div className="p-6 rounded-[24px] bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 flex items-center justify-center gap-2 text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] shadow-sm">
          <RefreshCw className="w-4 h-4 animate-spin text-[#1749F5] dark:text-[#5B8EFF]" />
          <span>Verifying linked Hedera account on Mirror Node...</span>
        </div>
      ) : hederaWallet ? (
        <div className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-6 sm:p-8 space-y-4 transition-colors shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-archivo font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                  Authorized Hedera Settlement Account
                </span>
                <Badge variant="active">VERIFIED ON MIRROR NODE</Badge>
                {hederaWallet.signerType === 'metamask_evm' && (
                  <Badge variant="info">METAMASK EVM</Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="text-2xl font-semibold font-mono tracking-tight text-[#111111] dark:text-[#F5F8FF]">
                  {hederaWallet.address}
                </span>

                {hederaWallet.evmAddress && (
                  <span className="text-xs font-mono text-[#334155] dark:text-[#A9B9D5] bg-white dark:bg-white/10 px-2.5 py-1 rounded-lg border border-[#DFE3F8] dark:border-white/10">
                    EVM: {hederaWallet.evmAddress.slice(0, 6)}...{hederaWallet.evmAddress.slice(-4)}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(hederaWallet.address);
                    alert('Hedera Account ID copied to clipboard!');
                  }}
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#1749F5] hover:bg-white dark:hover:bg-white/10 transition-colors"
                  title="Copy Account ID"
                >
                  <Copy className="w-4 h-4" />
                </button>

                <a
                  href={hederaWallet.hashScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-archivo font-medium text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1"
                >
                  <span>View on HashScan</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {hederaWallet.balance && (
                <p className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] pt-1">
                  On-Chain Balance:{' '}
                  <strong className="text-[#111111] dark:text-white font-semibold">
                    {hederaWallet.balance.hbarBalance} HBAR
                  </strong>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setWalletLinkError(null);
                  setWalletLinkSuccess(null);
                  setActiveLinkTab('metamask');
                  setShowLinkWalletModal(true);
                }}
                className="text-xs"
              >
                Switch Account
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#FFFBEB] dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-[28px] p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-colors shadow-sm">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
                No Hedera Account Linked
              </h3>
              <p className="text-xs sm:text-sm font-archivo text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-xl">
                Link an authorized Hedera Testnet account (via MetaMask EVM or manual Account ID) to enable conversational MCP payments and autonomous policy enforcement.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setWalletLinkError(null);
                setWalletLinkSuccess(null);
                setActiveLinkTab('metamask');
                setShowLinkWalletModal(true);
              }}
            >
              <Wallet className="w-4 h-4 mr-1.5" />
              <span>Link MetaMask to Hedera</span>
            </Button>
            <Button
              variant="outline"
              size="md"
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
      )}

      {/* Conversational Payment Console */}
      <Card className="p-6 sm:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#E2E8F0] dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#ECEEFF] dark:bg-white/10 text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
                Conversational Payment Tester
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Natural Language Prompt &rarr; Autonomous Hedera x402 Settlement
              </p>
            </div>
          </div>
          <span className="text-xs font-archivo font-medium text-[#1749F5] dark:text-[#5B8EFF] bg-[#ECEEFF] dark:bg-blue-950/40 px-2.5 py-1 rounded-full border border-[#DFE3F8] dark:border-blue-800/40 self-start sm:self-auto">
            Interactive Agent Loop
          </span>
        </div>

        {/* Chat History Window */}
        <div className="bg-[#F8FAFC] dark:bg-white/[0.02] border border-[#E2E8F0] dark:border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 min-h-[220px] max-h-[360px] overflow-y-auto">
          {chatLog.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col gap-1.5 max-w-[85%] ${
                msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-archivo font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                {msg.sender === 'user' ? (
                  <span className="text-[#1749F5] dark:text-[#5B8EFF]">You</span>
                ) : (
                  <>
                    <Bot className="w-3.5 h-3.5 text-[#1749F5] dark:text-[#5B8EFF]" />
                    <span>PaidX Agent</span>
                  </>
                )}
              </div>

              <div
                className={`p-3.5 rounded-2xl text-xs sm:text-sm font-archivo leading-relaxed shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-[#1749F5] text-white rounded-tr-none'
                    : 'bg-white dark:bg-[#09152D] text-[#111111] dark:text-[#F5F8FF] border border-[#E2E8F0] dark:border-white/10 rounded-tl-none'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {msg.details?.hashScanUrl && (
                  <div className="mt-2.5 pt-2 border-t border-[#E2E8F0] dark:border-white/10 flex flex-wrap items-center gap-3 text-xs">
                    <a
                      href={msg.details.hashScanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#1749F5] dark:text-[#5B8EFF] font-medium hover:underline"
                    >
                      <span>Receipt on HashScan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {msg.details.hcsTopicId && (
                      <span className="text-[11px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                        HCS Topic: {msg.details.hcsTopicId} (Seq #{msg.details.hcsSequenceNumber})
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isChatSending && (
            <div className="p-3.5 bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 rounded-2xl text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] animate-pulse flex items-center gap-2 max-w-sm shadow-sm">
              <Bot className="w-4 h-4 text-[#1749F5] dark:text-[#5B8EFF] animate-spin" />
              <span>Agent verifying wallet balance and executing Hedera x402 payment...</span>
            </div>
          )}
        </div>

        {/* Quick Example Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-archivo font-medium text-[#64748B] dark:text-[#94A3B8]">
            Quick Examples:
          </span>
          {[
            'Send 5 USDC to 0.0.123456',
            'Send 2 HBAR to 0.0.987654',
            'Send 1 USDC to 0.0.5449100',
          ].map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSendChat(sample)}
              className="text-xs font-archivo px-3 py-1.5 bg-[#F8FAFC] dark:bg-white/5 text-[#334155] dark:text-[#F5F8FF] border border-[#E2E8F0] dark:border-white/10 hover:border-[#1749F5] hover:text-[#1749F5] rounded-xl transition-all"
            >
              {sample}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="flex gap-2.5 pt-1">
          <input
            type="text"
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
            placeholder='Type payment instruction (e.g. "Send 5 USDC to 0.0.123456")...'
            className="flex-1 bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-archivo text-[#111111] dark:text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1749F5] focus:ring-1 focus:ring-[#1749F5] transition-colors"
          />
          <Button
            variant="primary"
            disabled={isChatSending || !chatPrompt.trim()}
            onClick={() => handleSendChat()}
            className="text-xs font-archivo px-5"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            <span>Send</span>
          </Button>
        </div>
      </Card>

      {/* Authorized AI Agents Grid / Table */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0] dark:border-white/10">
          <div>
            <h2 className="text-base sm:text-lg font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
              Authorized AI Agents
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Autonomous policy allowances and MCP credentials
            </p>
          </div>
          <Badge variant="info">
            {activeAgents.length} ACTIVE
          </Badge>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-archivo text-[#64748B] dark:text-[#94A3B8]">
            Loading connected agents...
          </div>
        ) : agents.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] dark:bg-white/5 text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center mx-auto">
              <Bot className="w-6 h-6" />
            </div>
            <p className="text-sm font-archivo font-medium text-[#111111] dark:text-[#F5F8FF]">
              No AI agents connected yet
            </p>
            <p className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto">
              Issue your first MCP token to authorize Claude Desktop, Cursor, or autonomous scripts.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCreatedToken(null);
                setAgentConnectError(null);
                setShowConnectModal(true);
              }}
              className="mt-2 text-xs"
            >
              Connect Your First Agent
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-white/5">
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
              const percentDaily =
                parseFloat(dailyBudgetNum) > 0
                  ? Math.min(100, Math.round((parseFloat(spentTodayNum) / parseFloat(dailyBudgetNum)) * 100))
                  : 0;

              return (
                <div
                  key={agent.id}
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs sm:text-sm font-archivo hover:bg-[#F8FAFC] dark:hover:bg-white/[0.02] p-2 rounded-xl transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-base text-[#111111] dark:text-[#F5F8FF]">
                        {agent.agent_name}
                      </span>
                      <Badge variant={agent.status === 'active' ? 'active' : 'revoked'}>
                        {agent.status.toUpperCase()}
                      </Badge>
                      {policy?.autonomous_payments_enabled && (
                        <Badge variant="info">AUTONOMOUS</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
                      <span>Key: {agent.api_key_prefix}</span>
                      <span>•</span>
                      <span>Wallet: {agent.wallets?.address || displayWalletAddress}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 text-xs font-archivo">
                    <div className="space-y-1 min-w-[130px]">
                      <div className="flex justify-between text-[#64748B] dark:text-[#94A3B8]">
                        <span>Daily Spend:</span>
                        <span className="font-semibold text-[#111111] dark:text-white">
                          ${spentTodayNum} / ${dailyBudgetNum}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[#E2E8F0] dark:bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1749F5] rounded-full transition-all"
                          style={{ width: `${percentDaily}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <span className="text-[#64748B] dark:text-[#94A3B8] block">Max Per Tx:</span>
                      <span className="font-semibold text-[#111111] dark:text-white">${maxPerTxNum} USDC</span>
                    </div>

                    {agent.status === 'active' && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRevokeAgent(agent.id)}
                        className="text-xs"
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

      {/* Historical Payments Ledger: Table format following Section 5.5 */}
      <div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 overflow-hidden shadow-sm">
        <div className="p-6 pb-4 border-b border-[#E2E8F0] dark:border-white/10 flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
              Hedera x402 Settlement Ledger
            </h2>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Cryptographic transaction logs anchored on Hedera Consensus Service (HCS)
            </p>
          </div>
          <span className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8]">
            {payments.length} transactions recorded
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="p-12 text-center text-xs sm:text-sm font-archivo text-[#64748B] dark:text-[#94A3B8]">
            No payments settled yet. Use the conversational tester above to execute your first payment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm font-archivo">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-white/[0.02] border-b border-[#E2E8F0] dark:border-white/10 text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Recipient</th>
                  <th className="py-3.5 px-6">Amount</th>
                  <th className="py-3.5 px-6">Network</th>
                  <th className="py-3.5 px-6">Hedera Tx ID</th>
                  <th className="py-3.5 px-6">HCS Audit</th>
                  <th className="py-3.5 px-6 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70 dark:divide-white/5">
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-[#F8FAFC]/80 dark:hover:bg-white/[0.02] transition-colors text-[#334155] dark:text-[#A9B9D5]"
                  >
                    <td className="py-4 px-6">
                      <Badge variant={p.status === 'confirmed' ? 'active' : 'warning'}>
                        {p.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-4 px-6 font-mono text-xs text-[#111111] dark:text-[#F5F8FF]">
                      {p.recipient}
                    </td>
                    <td className="py-4 px-6 font-semibold text-[#111111] dark:text-[#F5F8FF]">
                      {p.amount_display}
                    </td>
                    <td className="py-4 px-6 text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {p.network}
                    </td>
                    <td className="py-4 px-6">
                      {p.tx_id ? (
                        <a
                          href={p.hashscan_url || `https://hashscan.io/testnet/transaction/${p.tx_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 font-mono text-xs"
                        >
                          <span>{p.tx_id.slice(0, 16)}...</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      {p.hcs_sequence_number ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/40 dark:text-emerald-300">
                          Seq #{p.hcs_sequence_number}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link / Register Hedera Wallet Modal */}
      <Modal
        isOpen={showLinkWalletModal}
        onClose={() => setShowLinkWalletModal(false)}
        title={hederaWallet ? 'Manage Connected Hedera Wallet' : 'Link Hedera Testnet Wallet'}
      >
        <div className="space-y-5">
          {/* Tab Selector */}
          <div className="grid grid-cols-2 p-1.5 bg-[#F1F5F9] dark:bg-white/5 rounded-xl border border-[#E2E8F0] dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setActiveLinkTab('metamask');
                setWalletLinkError(null);
                setWalletLinkSuccess(null);
              }}
              className={`py-2 text-xs font-archivo font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeLinkTab === 'metamask'
                  ? 'bg-white dark:bg-[#09152D] text-[#1749F5] dark:text-[#5B8EFF] shadow-sm font-semibold'
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#111111] dark:hover:text-white'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>MetaMask (EVM Linking)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveLinkTab('manual');
                setWalletLinkError(null);
                setWalletLinkSuccess(null);
              }}
              className={`py-2 text-xs font-archivo font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeLinkTab === 'manual'
                  ? 'bg-white dark:bg-[#09152D] text-[#1749F5] dark:text-[#5B8EFF] shadow-sm font-semibold'
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#111111] dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Manual Account ID</span>
            </button>
          </div>

          {walletLinkError && (
            <div className="p-3.5 bg-[#FEF2F2] border border-red-200 dark:border-red-800/40 rounded-xl text-[#EF4444] text-xs font-archivo flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{walletLinkError}</span>
            </div>
          )}

          {walletLinkSuccess && (
            <div className="p-3.5 bg-[#ECFDF5] border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-[#10B981] text-xs font-archivo flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{walletLinkSuccess}</span>
            </div>
          )}

          {activeLinkTab === 'metamask' ? (
            <div className="space-y-4">
              <div className="p-4 bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 rounded-2xl text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] space-y-2">
                <div className="font-semibold text-[#111111] dark:text-[#F5F8FF] flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  MetaMask Hedera Integration
                </div>
                <p>
                  Link your MetaMask EVM wallet to PaidX on Hedera Testnet.
                </p>
                <div className="space-y-1 text-[11px] pt-1">
                  <div>• <strong className="text-[#111111] dark:text-white">Network:</strong> Hedera Testnet (Chain ID 296)</div>
                  <div>• <strong className="text-[#111111] dark:text-white">RPC:</strong> https://testnet.hashio.io/api</div>
                  <div>• <strong className="text-[#111111] dark:text-white">Resolution:</strong> Automatically maps EVM address to Hedera Account ID (0.0.x) on Mirror Node</div>
                </div>
              </div>

              {metaMaskStatusText && (
                <div className="p-3 bg-[#ECEEFF] dark:bg-white/5 border border-[#DFE3F8] dark:border-white/10 rounded-xl text-[#1749F5] dark:text-[#5B8EFF] text-xs font-archivo flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{metaMaskStatusText}</span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E2E8F0] dark:border-white/10">
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
              <div className="p-4 bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 rounded-2xl text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] space-y-1">
                <div className="font-semibold text-[#111111] dark:text-[#F5F8FF] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                  Hedera Mirror Node Verification
                </div>
                <p>
                  Enter your Hedera account ID. PaidX will query Mirror Node to verify account status and link it securely.
                </p>
              </div>

              <Input
                label="Hedera Account ID"
                value={linkAccountId}
                onChange={(e) => setLinkAccountId(e.target.value)}
                placeholder="e.g. 0.0.123456"
                required
              />

              <Input
                label="Delegated Signing Key (Optional / Dev Testing)"
                type="password"
                value={linkSigningKey}
                onChange={(e) => setLinkSigningKey(e.target.value)}
                placeholder="0x... or 302e... (DER/Hex private key)"
                helperText="Encrypted in memory only. Enables AI agents to sign payments autonomously."
              />

              <Input
                label="Public Key (Alternative if no private key)"
                value={linkPublicKey}
                onChange={(e) => setLinkPublicKey(e.target.value)}
                placeholder="302a... (Hex public key)"
              />

              <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E2E8F0] dark:border-white/10">
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
          <div className="space-y-4 font-archivo text-xs">
            <div className="p-4 bg-[#ECFDF5] border border-emerald-200 dark:border-emerald-800/40 rounded-2xl text-[#10B981] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#10B981]" />
              <div>
                <div className="font-semibold text-sm text-[#111111] dark:text-white">
                  Agent Token Minted & Ready to Connect
                </div>
                <div className="text-xs text-[#334155] dark:text-[#A9B9D5] mt-1">
                  This Bearer token is shown only once. Copy it now and configure your AI client (Claude Desktop, Cursor, ChatGPT).
                </div>
              </div>
            </div>

            {/* Public MCP Server Endpoint */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#64748B] dark:text-[#94A3B8]">
                <label className="text-xs font-medium">Public MCP Server Endpoint:</label>
                <span className="text-[10px] font-semibold text-[#1749F5] bg-[#ECEEFF] dark:bg-white/10 px-2 py-0.5 rounded-full">
                  Streamable HTTP
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={publicMcpUrl}
                  className="flex-1 bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 rounded-xl px-3 py-2 text-[#1749F5] dark:text-[#5B8EFF] font-mono text-xs select-all"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => copyToClipboard(publicMcpUrl, 'url')}
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-[#10B981] mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedUrl ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* PaidX Agent Bearer Token */}
            <div className="space-y-1.5">
              <label className="text-[#64748B] dark:text-[#94A3B8] block text-xs font-medium">
                PaidX Agent Bearer Token (Shown Once):
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={createdToken}
                  className="flex-1 bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 rounded-xl px-3 py-2 text-[#111111] dark:text-white font-mono text-xs select-all break-all"
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => copyToClipboard(createdToken, 'token')}
                >
                  {copiedToken ? <Check className="w-3.5 h-3.5 text-[#10B981] mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  {copiedToken ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Claude Desktop / Cursor MCP Setup */}
            <div className="p-4 bg-[#050B1B] text-white rounded-2xl border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-white">Claude Desktop / Cursor Config:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(buildMcpClientConfig(createdToken, publicMcpUrl), null, 2),
                      'config'
                    )
                  }
                  className="text-[11px] text-[#A9B9D5] hover:text-white h-7 px-2.5 bg-white/10 hover:bg-white/20"
                >
                  {copiedConfig ? (
                    <Check className="w-3 h-3 text-[#10B981] mr-1" />
                  ) : (
                    <Copy className="w-3 h-3 mr-1" />
                  )}
                  {copiedConfig ? 'Copied!' : 'Copy JSON'}
                </Button>
              </div>
              <pre className="text-[11px] text-[#A9B9D5] p-3 rounded-xl bg-black/40 overflow-x-auto whitespace-pre font-mono border border-white/5">
{JSON.stringify(buildMcpClientConfig(createdToken, publicMcpUrl), null, 2)}
              </pre>
            </div>

            {/* MCP Connection Test */}
            <div className="space-y-2 pt-1">
              <Button
                variant="outline"
                type="button"
                className="w-full justify-center"
                onClick={handleTestMcpConnection}
                disabled={isTestingMcp}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-2 ${isTestingMcp ? 'animate-spin text-[#1749F5]' : ''}`} />
                {isTestingMcp ? 'Verifying MCP Connection...' : 'Test MCP Connection'}
              </Button>

              {mcpTestResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs font-archivo space-y-1 ${
                    mcpTestResult.success
                      ? 'bg-[#ECFDF5] border-emerald-200 dark:border-emerald-800/40 text-[#10B981]'
                      : 'bg-[#FEF2F2] border-red-200 dark:border-red-800/40 text-[#EF4444]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    {mcpTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{mcpTestResult.success ? 'MCP Connection Verified' : 'MCP Test Failed'}</span>
                  </div>
                  <p className="text-xs opacity-90 break-all">
                    {mcpTestResult.success ? mcpTestResult.message : mcpTestResult.error}
                  </p>
                </div>
              )}
            </div>

            <Button variant="primary" className="w-full" onClick={handleCloseConnectModal}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleConnectAgent} className="space-y-4 font-archivo">
            {!hederaWallet && (
              <div className="p-3.5 bg-[#FFFBEB] border border-amber-200 dark:border-amber-800/40 rounded-xl text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between gap-3">
                <span>No Hedera wallet linked yet.</span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setShowConnectModal(false);
                    setShowLinkWalletModal(true);
                  }}
                  className="text-xs shrink-0"
                >
                  Link Wallet
                </Button>
              </div>
            )}

            {agentConnectError && (
              <div className="p-3.5 bg-[#FEF2F2] border border-red-200 dark:border-red-800/40 rounded-xl text-[#EF4444] text-xs flex items-center gap-2">
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
                label="Max per Tx (USDC)"
                type="number"
                step="0.01"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(e.target.value)}
                required
              />
              <Input
                label="Daily Cap (USDC)"
                type="number"
                step="0.01"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                required
              />
            </div>

            <Input
              label="Monthly Cap (USDC)"
              type="number"
              step="0.01"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(e.target.value)}
              required
            />

            <div className="flex items-center justify-between p-4 bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 rounded-xl">
              <div>
                <div className="text-xs font-semibold text-[#111111] dark:text-[#F5F8FF]">
                  Autonomous Execution
                </div>
                <div className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                  Allow agent to pay up to daily budget without user prompt
                </div>
              </div>
              <input
                type="checkbox"
                checked={autonomousEnabled}
                onChange={(e) => setAutonomousEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#1749F5] rounded"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
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
