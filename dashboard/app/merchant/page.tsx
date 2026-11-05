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
  const receivingAddress = session.merchantProfile?.receivingAddress || session.smartAccountAddress || session.eoaAddress || '';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
              {storeName}
            </span>
            <Badge variant="info">MERCHANT PORTAL</Badge>
          </div>
          <p className="text-xs font-mono text-[#AAAAAA] flex items-center gap-2">
            <span>Settlement Receiving Address:</span>
            {receivingAddress ? (
              <a
                href={getExplorerAddressUrl(receivingAddress)}
                target="_blank"
                rel="noreferrer"
                className="text-[#5465FF] hover:underline inline-flex items-center gap-1 font-mono"
              >
                {truncateAddress(receivingAddress)}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-amber-400 font-mono">No payout address set</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/merchant/pos">
            <Button variant="outline" size="sm" className="font-mono text-xs">
              <Cpu className="w-3.5 h-3.5 mr-1.5" />
              Manage Terminals
            </Button>
          </Link>

          <Link href="/merchant/terminal">
            <Button variant="primary" size="sm" className="font-mono text-xs">
              <Terminal className="w-3.5 h-3.5 mr-1.5" />
              Launch POS Register
            </Button>
          </Link>
        </div>
      </div>

      {/* Real Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Settled Revenue"
          value={isLoading ? 'Loading...' : `$${formatUsdc(totalRevenueUnits.toString())} USDC`}
          change="Authoritative on-chain settlement"
          changeType="positive"
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          label="Confirmed Transactions"
          value={`${txCount} Sales`}
          change="Ethereum Sepolia Testnet"
          changeType="neutral"
          icon={<TrendingUp className="w-5 h-5 text-[#5465FF]" />}
        />
        <StatCard
          label="Merchant Status"
          value={session.merchantProfile?.isActive ? 'Active' : 'Pending'}
          change="POS Register Ready"
          changeType={session.merchantProfile?.isActive ? 'positive' : 'negative'}
          icon={<Store className="w-5 h-5 text-amber-400" />}
        />
      </div>

      {/* Recent Merchant Transactions */}
      <Card className="border-[#1A2E38] space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1A2E38]">
          <h3 className="text-xs font-mono font-bold text-[#DFE0E2] uppercase tracking-wider">
            Recent Terminal Sales
          </h3>
          <Link
            href="/merchant/terminal"
            className="text-xs font-mono text-[#5465FF] hover:underline flex items-center gap-1"
          >
            <span>Open Register</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {recentSales.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Clock className="w-6 h-6 text-[#444444] mx-auto" />
            <p className="text-xs font-mono text-[#888888]">
              No sales recorded on this merchant register yet. Launch the POS Register to accept taps.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1A2E38]">
            {recentSales.map((sale) => (
              <div
                key={sale.id}
                className="py-3 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <p className="font-bold text-[#DFE0E2]">
                    ${formatUsdc(sale.amount)} USDC
                  </p>
                  <p className="text-[11px] text-[#888888]">
                    {new Date(sale.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={sale.status === 'confirmed' ? 'success' : sale.status === 'failed' ? 'danger' : 'info'}>
                    {sale.status.toUpperCase()}
                  </Badge>
                  {sale.tx_hash && (
                    <a
                      href={getExplorerTxUrl(sale.tx_hash)}
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
    </div>
  );
}
