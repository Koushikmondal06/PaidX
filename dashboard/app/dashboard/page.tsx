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
import { getExplorerTxUrl, getExplorerAddressUrl, truncateAddress, PAYMENT_TOKEN_ADDRESS } from '@/lib/base';
import { formatUsdc } from '@/lib/currency';
import { ERC20_ABI } from '@/lib/contracts';
import { createPublicClient, http, formatEther, type Address } from 'viem';
import { sepolia } from '@/lib/chain';
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
          const publicClient = createPublicClient({
            chain: sepolia,
            transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.sepolia.org'),
          });

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

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
              Welcome back, {session.fullName}
            </span>
            <Badge variant="info">
              {session.role.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs font-mono text-[#AAAAAA] flex items-center gap-2">
            <span>Settlement Wallet:</span>
            {walletAddr ? (
              <a
                href={getExplorerAddressUrl(walletAddr)}
                target="_blank"
                rel="noreferrer"
                className="text-[#5465FF] hover:underline inline-flex items-center gap-1 font-mono"
              >
                {truncateAddress(walletAddr)}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-amber-400 font-mono">No wallet linked yet</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDepositModal(true)}
            className="font-mono text-xs"
            disabled={!walletAddr}
          >
            <QrCode className="w-3.5 h-3.5 mr-1.5 text-[#5465FF]" />
            <span>Deposit USDC</span>
          </Button>

          <Link href="/dashboard/cards">
            <Button variant="primary" size="sm" className="font-mono text-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              <span>Link NFC Card</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Sepolia USDC Balance"
          value={isLoadingBalance ? 'Loading...' : `$${usdcBalance} USDC`}
          subtitle={`${ethBalance} ETH for Gas`}
          icon={<DollarSign className="w-5 h-5 text-[#5465FF]" />}
        />

        <StatCard
          title="Active Physical Cards"
          value={`${cardsCount} Card${cardsCount === 1 ? '' : 's'}`}
          subtitle="Contactless Retail Ready"
          icon={<Radio className="w-5 h-5 text-emerald-400" />}
        />

        <StatCard
          title="Remaining Spending Limit"
          value={`$${remainingUsdc.toFixed(2)} USDC`}
          subtitle={`${percentSpent}% of $${dailyLimitUsdc.toFixed(2)} cap used`}
          icon={<Sliders className="w-5 h-5 text-indigo-400" />}
        />
      </div>

      {/* Spending Limits Progress Section */}
      {dailyLimitUsdc > 0 && (
        <Card className="border-[#1A2E38] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#5465FF]" />
              <h3 className="text-xs font-mono font-bold text-[#DFE0E2] uppercase tracking-wider">
                ERC-7715 Periodic Spending Delegation
              </h3>
            </div>
            <Link
              href="/dashboard/cards"
              className="text-xs font-mono text-[#5465FF] hover:underline flex items-center gap-1"
            >
              <span>Manage Delegation</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-[#AAAAAA]">
                Used: ${spentToday.toFixed(2)} USDC
              </span>
              <span className="text-[#DFE0E2] font-bold">
                Cap: ${dailyLimitUsdc.toFixed(2)} USDC / period
              </span>
            </div>
            <div className="w-full h-2 bg-[#0E1D24] rounded-full overflow-hidden border border-[#1A2E38]">
              <div
                className={`h-full transition-all duration-500 rounded-full ${percentSpent > 85 ? 'bg-rose-500' : 'bg-[#5465FF]'
                  }`}
                style={{ width: `${Math.min(100, percentSpent)}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Recent Settled Retail Payments */}
      <Card className="border-[#1A2E38] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1A2E38]">
          <h3 className="text-xs font-mono font-bold text-[#DFE0E2] uppercase tracking-wider">
            Recent Contactless Payments
          </h3>
          <Link
            href="/dashboard/transactions"
            className="text-xs font-mono text-[#AAAAAA] hover:text-[#DFE0E2] flex items-center gap-1"
          >
            <span>View All</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

        {recentPayments.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Clock className="w-6 h-6 text-[#444444] mx-auto" />
            <p className="text-xs font-mono text-[#888888]">
              No transactions recorded yet. Tap your linked NFC card at any participating PaidX terminal.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1A2E38]">
            {recentPayments.map((p) => (
              <div
                key={p.id}
                className="py-3 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <p className="font-bold text-[#DFE0E2]">
                    ${formatUsdc(p.amount)} USDC
                  </p>
                  <p className="text-[11px] text-[#888888]">
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
                      className="text-[#5465FF] hover:underline inline-flex items-center gap-1 text-[11px]"
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
        title="Deposit USDC on Ethereum Sepolia"
      >
        <div className="space-y-4 text-center">
          <p className="text-xs font-mono text-[#AAAAAA]">
            Send Sepolia USDC to your settlement address:
          </p>

          <div className="flex justify-center p-4 bg-white rounded-xl w-fit mx-auto">
            <QrCodeDisplay value={walletAddr} size={180} />
          </div>

          <div className="p-3 bg-[#0B161B] rounded-lg border border-[#1A2E38] font-mono text-xs text-[#5465FF] break-all select-all">
            {walletAddr}
          </div>

          <p className="text-[11px] font-mono text-[#666666]">
            Official Sepolia Circle USDC Contract: {PAYMENT_TOKEN_ADDRESS}
          </p>
        </div>
      </Modal>
    </div>
  );
}
