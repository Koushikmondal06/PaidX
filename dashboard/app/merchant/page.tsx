'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { getRealUserSession, UserSession } from '@/lib/auth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getExplorerAddressUrl, getExplorerTxUrl, truncateAddress } from '@/lib/base';
import { formatUsdc } from '@/lib/currency';
import {
  Store,
  Terminal,
  Cpu,
  DollarSign,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  TrendingUp,
  Clock,
  Sparkles,
  Radio,
} from 'lucide-react';

interface MerchantPayment {
  id: string;
  amount: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

export default function MerchantOverviewPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [totalRevenueUnits, setTotalRevenueUnits] = useState<bigint>(0n);
  const [txCount, setTxCount] = useState<number>(0);
  const [recentSales, setRecentSales] = useState<MerchantPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    async function loadMerchantData() {
      setIsLoading(true);
      try {
        const s = await getRealUserSession();
        setSession(s);
        if (!s || !s.merchantProfile) return;

        // Fetch payments for this merchant
        const { data: payments } = await supabase
          .from('payments')
          .select('id, amount, status, tx_hash, created_at')
          .eq('merchant_id', s.merchantProfile.id)
          .order('created_at', { ascending: false });

        if (payments) {
          setRecentSales(payments);
          let sum = 0n;
          let count = 0;
          for (const p of payments) {
            if (p.status === 'confirmed') {
              sum += BigInt(p.amount);
              count++;
            }
          }
          setTotalRevenueUnits(sum);
          setTxCount(count);
        }
      } catch (err) {
        console.warn('[Merchant] Load error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadMerchantData();
  }, [supabase]);

  if (!session) return null;

  const storeName = session.merchantProfile?.businessName || 'Merchant Store';
  const receivingAddress =
    session.merchantProfile?.receivingAddress ||
    session.smartAccountAddress ||
    session.eoaAddress ||
    '';

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
              {storeName}
            </h1>
            <Badge variant="info">MERCHANT PORTAL</Badge>
          </div>
          <p className="text-xs sm:text-[13px] font-archivo text-[#64748B] dark:text-[#94A3B8] flex flex-wrap items-center gap-2">
            <span>Settlement Receiving Address:</span>
            {receivingAddress ? (
              <a
                href={getExplorerAddressUrl(receivingAddress)}
                target="_blank"
                rel="noreferrer"
                className="text-[#2045E8] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 font-mono font-medium"
              >
                {truncateAddress(receivingAddress)}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-amber-500 font-archivo">No payout address set</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/merchant/pos">
            <Button variant="outline" size="sm" className="font-archivo text-xs gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#5B8EFF]" />
              <span>Manage Terminals</span>
            </Button>
          </Link>

          <Link href="/merchant/terminal">
            <Button variant="primary" size="sm" className="font-archivo text-xs gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>Launch POS Register</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Real Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          title="Settled Revenue"
          value={isLoading ? 'Loading...' : `$${formatUsdc(totalRevenueUnits.toString())} USDC`}
          subtitle="Direct Base L2 settlement"
          icon={<DollarSign className="w-5 h-5 text-[#10B981]" />}
        />
        <StatCard
          title="Confirmed Sales"
          value={`${txCount} Sales`}
          subtitle="Sub-second contactless taps"
          icon={<TrendingUp className="w-5 h-5 text-[#2045E8]" />}
        />
        <StatCard
          title="Register Status"
          value={session.merchantProfile?.isActive ? 'Active & Ready' : 'Pending'}
          subtitle="ESP32 & Virtual POS Fleet"
          icon={<Store className="w-5 h-5 text-[#2045E8]" />}
        />
      </div>

      {/* Fast Countertop POS Banner in Soft Lavender Container (Section 1 & 5.2 Motif) */}
      <div className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 transition-colors shadow-sm">
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#09152D] text-[#2045E8] dark:text-[#5B8EFF] flex items-center justify-center shadow-sm shrink-0 border border-[#DFE3F8] dark:border-white/10">
            <Terminal className="w-7 h-7" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-archivo font-semibold uppercase tracking-wider bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/40 dark:text-emerald-300 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              READY FOR TAPS
            </div>
            <h3 className="font-archivo font-semibold text-lg sm:text-xl text-[#111111] dark:text-[#F5F8FF]">
              Virtual Register & Hardware Terminal Ready
            </h3>
            <p className="font-archivo text-xs sm:text-sm text-[#334155] dark:text-[#A9B9D5] mt-1 max-w-xl">
              Type any dollar amount to produce dynamic EIP-681 payment QR codes or accept instant physical smart card taps under 1.2 seconds.
            </p>
          </div>
        </div>
        <Link href="/merchant/terminal" className="shrink-0 w-full sm:w-auto">
          <Button variant="primary" size="md" className="w-full sm:w-auto gap-2">
            <span>Open Virtual POS</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Recent Merchant Transactions */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0] dark:border-white/10">
          <div>
            <h3 className="text-sm sm:text-base font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
              Recent Terminal Sales
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Immutable payments received directly at your counter
            </p>
          </div>
          <Link
            href="/merchant/terminal"
            className="text-xs sm:text-[13px] font-archivo font-medium text-[#2045E8] dark:text-[#5B8EFF] hover:underline flex items-center gap-1"
          >
            <span>Open Register</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentSales.length === 0 ? (
          <div className="py-12 text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] dark:bg-white/5 text-[#2045E8] dark:text-[#5B8EFF] flex items-center justify-center mx-auto">
              <Clock className="w-5 h-5" />
            </div>
            <p className="text-sm font-archivo font-medium text-[#111111] dark:text-[#F5F8FF]">
              No sales recorded on this merchant register yet
            </p>
            <p className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto">
              Launch the POS register to charge your first contactless transaction.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-white/5">
            {recentSales.map((sale) => (
              <div
                key={sale.id}
                className="py-3.5 flex items-center justify-between text-xs sm:text-sm font-archivo hover:bg-[#F8FAFC] dark:hover:bg-white/[0.02] p-2 rounded-xl transition-colors"
              >
                <div>
                  <p className="font-semibold text-sm sm:text-base text-[#111111] dark:text-[#F5F8FF]">
                    ${formatUsdc(sale.amount)} USDC
                  </p>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                    {new Date(sale.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={sale.status === 'confirmed' ? 'active' : sale.status === 'failed' ? 'revoked' : 'info'}>
                    {sale.status.toUpperCase()}
                  </Badge>
                  {sale.tx_hash && (
                    <a
                      href={getExplorerTxUrl(sale.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#2045E8] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 text-xs font-medium"
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
    </div>
  );
}
