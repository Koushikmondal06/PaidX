'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Modal } from '@/components/ui/Modal';
import { QrCodeDisplay } from '@/components/ui/QrCodeDisplay';
import { getRealUserSession, UserSession } from '@/lib/auth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getExplorerAddressUrl, getExplorerTxUrl, truncateAddress, PAYMENT_TOKEN_ADDRESS } from '@/lib/base';
import { formatUsdc } from '@/lib/currency';
import { ERC20_ABI } from '@/lib/contracts';
import { getBrowserPublicClient } from '@/lib/chain';
import { formatEther, type Address } from 'viem';
import {
  CreditCard,
  Sliders,
  DollarSign,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Plus,
  Radio,
  QrCode,
  Zap,
  Copy,
  Check,
  TrendingUp,
} from 'lucide-react';

interface PaymentRow {
  id: string;
  amount: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
  merchant_id: string;
}

export default function UserDashboardOverviewPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Real Balances
  const [usdcBalance, setUsdcBalance] = useState<string>('0.00');
  const [ethBalance, setEthBalance] = useState<string>('0.0000');
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);

  // Real Payments & Cards
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [cardsCount, setCardsCount] = useState<number>(0);

  // Real Limits from permissions
  const [dailyLimitUsdc, setDailyLimitUsdc] = useState<number>(0);
  const [remainingUsdc, setRemainingUsdc] = useState<number>(0);

  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    async function loadData() {
      const s = await getRealUserSession();
      setSession(s);
      if (!s) return;

      const walletAddress = s.smartAccountAddress || s.eoaAddress;

      // 1. Fetch on-chain balances if wallet is linked
      if (walletAddress) {
        try {
          const publicClient = getBrowserPublicClient();

          // Fetch Sepolia USDC balance
          const tokenBal = await publicClient.readContract({
            address: PAYMENT_TOKEN_ADDRESS as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [walletAddress as Address],
          });
          setUsdcBalance(formatUsdc(tokenBal.toString()));

          // Fetch Sepolia native ETH balance for gas awareness
          const ethBal = await publicClient.getBalance({
            address: walletAddress as Address,
          });
          setEthBalance(Number(formatEther(ethBal)).toFixed(4));
        } catch (balErr) {
          console.warn('[Balance] On-chain balance query notice:', balErr);
        } finally {
          setIsLoadingBalance(false);
        }
      } else {
        setIsLoadingBalance(false);
      }

      // 2. Fetch real recent payments from public.payments
      try {
        const { data: payments } = await supabase
          .from('payments')
          .select('id, amount, status, tx_hash, created_at, merchant_id')
          .eq('user_id', s.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (payments) {
          setRecentPayments(payments);
        }
      } catch (payErr) {
        console.warn('[Payments] DB query notice:', payErr);
      }

      // 3. Fetch active cards count
      try {
        const { count } = await supabase
          .from('cards')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', s.id);

        setCardsCount(count || 0);
      } catch (cErr) {
        console.warn('[Cards] DB query notice:', cErr);
      }

      // 4. Fetch active permissions limit
      try {
        const { data: perm } = await supabase
          .from('permissions')
          .select('limit_per_period, remaining_in_period')
          .eq('user_id', s.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (perm) {
          const limit = Number(BigInt(perm.limit_per_period || '0') / 1_000_000n);
          const remaining = Number(BigInt(perm.remaining_in_period || '0') / 1_000_000n);
          setDailyLimitUsdc(limit);
          setRemainingUsdc(remaining);
        }
      } catch (permErr) {
        console.warn('[Permission] DB query notice:', permErr);
      }
    }

    loadData();
  }, [supabase]);

  if (!session) return null;

  const walletAddr = session.smartAccountAddress || session.eoaAddress || '';
  const spentToday = Math.max(0, dailyLimitUsdc - remainingUsdc);
  const percentSpent = dailyLimitUsdc > 0 ? Math.round((spentToday / dailyLimitUsdc) * 100) : 0;

  const handleCopyWalletAddress = () => {
    if (!walletAddr) return;
    navigator.clipboard.writeText(walletAddr);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <div className="space-y-8 sm:space-y-10 font-archivo">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-bold font-archivo tracking-tight text-[#090B12] dark:text-[#F5F8FF]">
              Welcome back, {session.fullName}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-archivo font-semibold bg-[#ECEEFF] text-[#1749F5] border border-[#DFE3F8] dark:bg-white/10 dark:text-[#5B8EFF] uppercase tracking-wider select-none">
              {session.role.toUpperCase()}
            </span>
          </div>
          <p className="text-xs sm:text-[13px] font-archivo text-[#667085] dark:text-[#94A3B8] flex flex-wrap items-center gap-2">
            <span>Settlement Smart Account:</span>
            {walletAddr ? (
              <a
                href={getExplorerAddressUrl(walletAddr)}
                target="_blank"
                rel="noreferrer"
                className="text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 font-mono font-medium"
              >
                {truncateAddress(walletAddr)}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span className="text-amber-500 font-archivo">No wallet linked yet</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDepositModal(true)}
            className="text-xs font-archivo font-medium bg-white hover:bg-[#F8FAFC] dark:bg-[#09152D] dark:hover:bg-white/5 border border-[#E2E8F0] dark:border-white/10 text-[#303747] dark:text-[#F5F8FF] rounded-xl shadow-xs px-4 py-2"
            disabled={!walletAddr}
          >
            <QrCode className="w-3.5 h-3.5 mr-1.5 text-[#1749F5] dark:text-[#5B8EFF]" />
            <span>Deposit USDC</span>
          </Button>

          <Link href="/dashboard/cards">
            <Button
              variant="primary"
              size="sm"
              className="text-xs font-archivo font-semibold bg-[#1749F5] hover:bg-[#113AC8] text-white rounded-xl shadow-sm hover:shadow-md hover:shadow-[#1749F5]/20 px-4 py-2"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              <span>Link NFC Card</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="USDC Balance"
          value={isLoadingBalance ? 'Loading...' : `$${usdcBalance} USDC`}
          subtitle={`${ethBalance} ETH for Gas`}
          icon={<DollarSign className="w-5 h-5 text-[#1749F5] dark:text-[#5B8EFF]" />}
        />

        <StatCard
          title="Active Physical Cards"
          value={`${cardsCount} Card${cardsCount === 1 ? '' : 's'}`}
          subtitle="Contactless Retail Ready"
          icon={<Radio className="w-5 h-5 text-[#10B981]" />}
        />

        <StatCard
          title="Remaining Daily Limit"
          value={`$${remainingUsdc.toFixed(2)} USDC`}
          trend={`${percentSpent}% used`}
          trendDirection={percentSpent > 85 ? 'down' : 'neutral'}
          trendLabel={`of $${dailyLimitUsdc.toFixed(2)} daily cap`}
          icon={<Sliders className="w-5 h-5 text-[#1749F5] dark:text-[#5B8EFF]" />}
        />
      </div>

      {/* Spending Limits Progress Section in Soft Lavender Container (Section 1 & 5.2 motif) */}
      {dailyLimitUsdc > 0 && (
        <div className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-6 sm:p-8 space-y-4 transition-colors shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#09152D] text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-[13px] font-archivo font-semibold text-[#090B12] dark:text-[#F5F8FF] uppercase tracking-wider">
                  ERC-7715 Periodic Spending Delegation
                </h3>
                <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
                  Enforces automated daily spending allowances for sub-second tap settlement
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/cards"
              className="text-xs sm:text-[13px] font-archivo font-medium text-[#1749F5] dark:text-[#5B8EFF] hover:underline flex items-center gap-1"
            >
              <span>Manage Delegation</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-5 bg-white dark:bg-[#09152D] rounded-2xl border border-[#DFE3F8] dark:border-white/10 space-y-2 shadow-sm">
            <div className="flex justify-between text-xs sm:text-[13px] font-archivo">
              <span className="text-[#303747] dark:text-[#A9B9D5]">
                Spent: <strong className="text-[#090B12] dark:text-white font-semibold">${spentToday.toFixed(2)} USDC</strong>
              </span>
              <span className="text-[#090B12] dark:text-white font-semibold">
                Daily Cap: ${dailyLimitUsdc.toFixed(2)} USDC
              </span>
            </div>
            <div className="w-full h-2.5 bg-[#F1F5F9] dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  percentSpent > 85 ? 'bg-[#EF4444]' : 'bg-[#1749F5]'
                }`}
                style={{ width: `${Math.min(100, percentSpent)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Recent Settled Retail Payments */}
      <Card className="p-6 sm:p-8 space-y-4 rounded-[24px] border border-[#E2E8F0] dark:border-white/10 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]">
        <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0] dark:border-white/10">
          <div>
            <h3 className="text-sm sm:text-base font-archivo font-bold text-[#090B12] dark:text-[#F5F8FF]">
              Recent Contactless Payments
            </h3>
            <p className="text-xs text-[#667085] dark:text-[#94A3B8]">
              Sub-second taps settled directly on Base L2
            </p>
          </div>
          <Link
            href="/dashboard/transactions"
            className="text-xs sm:text-[13px] font-archivo font-medium text-[#667085] hover:text-[#1749F5] dark:text-[#94A3B8] dark:hover:text-[#5B8EFF] flex items-center gap-1 transition-colors"
          >
            <span>View All</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentPayments.length === 0 ? (
          <div className="py-12 text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] dark:bg-white/5 text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center mx-auto">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-sm font-archivo font-semibold text-[#090B12] dark:text-[#F5F8FF]">
              No transactions recorded yet
            </p>
            <p className="text-xs font-archivo text-[#667085] dark:text-[#94A3B8] max-w-sm mx-auto">
              Tap your linked NFC smart card at any participating countertop PaidX terminal to begin.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-white/5">
            {recentPayments.map((p) => (
              <div
                key={p.id}
                className="py-3.5 flex items-center justify-between text-xs sm:text-sm font-archivo hover:bg-[#F8FAFC] dark:hover:bg-white/[0.02] p-2 rounded-xl transition-colors"
              >
                <div>
                  <p className="font-semibold text-sm sm:text-base text-[#090B12] dark:text-[#F5F8FF]">
                    ${formatUsdc(p.amount)} USDC
                  </p>
                  <p className="text-xs text-[#667085] dark:text-[#94A3B8] mt-0.5">
                    {new Date(p.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={p.status === 'confirmed' ? 'active' : p.status === 'failed' ? 'revoked' : 'info'}>
                    {p.status.toUpperCase()}
                  </Badge>
                  {p.tx_hash && (
                    <a
                      href={getExplorerTxUrl(p.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 text-xs font-medium"
                    >
                      <span>Receipt</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Deposit USDC Modal */}
      <Modal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        title="Deposit USDC to Smart Account"
      >
        <div className="space-y-4 text-center font-archivo">
          <p className="text-xs sm:text-sm text-[#667085] dark:text-[#94A3B8]">
            Send native USDC on Base / Ethereum Sepolia to your receiving smart account:
          </p>

          <div className="flex justify-center p-4 bg-white dark:bg-[#050B1B] rounded-2xl w-fit mx-auto border border-[#E2E8F0] dark:border-white/10 shadow-sm">
            <QrCodeDisplay value={walletAddr} size={180} />
          </div>

          <div className="flex items-center justify-between p-3 bg-[#F8FAFC] dark:bg-white/5 rounded-xl border border-[#E2E8F0] dark:border-white/10">
            <span className="font-mono text-xs text-[#1749F5] dark:text-[#5B8EFF] truncate mr-2 select-all">
              {walletAddr}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyWalletAddress}
              className="text-xs shrink-0"
            >
              {copiedAddress ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#10B981] mr-1" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  <span>Copy</span>
                </>
              )}
            </Button>
          </div>

          <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
            Base Sepolia USDC Contract:{' '}
            <span className="font-mono text-[#090B12] dark:text-white">{truncateAddress(PAYMENT_TOKEN_ADDRESS)}</span>
          </p>
        </div>
      </Modal>
    </div>
  );
}
