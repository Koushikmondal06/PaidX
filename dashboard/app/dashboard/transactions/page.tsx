'use client';

import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession } from '@/lib/auth';
import { getExplorerTxUrl, truncateAddress } from '@/lib/base';
import { formatUsdc } from '@/lib/currency';
import {
  DollarSign,
  ExternalLink,
  Filter,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface PaymentRecord {
  id: string;
  amount: string;
  status: 'created' | 'submitted' | 'confirmed' | 'failed';
  tx_hash: string | null;
  block_number: number | null;
  created_at: string;
  merchant_id: string;
  merchants?: {
    name?: string;
    business_name?: string;
    payout_address: string;
  } | null;
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const supabase = createBrowserSupabaseClient();

  const loadPayments = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const session = await getRealUserSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('payments')
        .select('*, merchants(name, payout_address)')
        .eq('user_id', session.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setPayments(data as unknown as PaymentRecord[]);
      }
    } catch (err: unknown) {
      console.warn('[Transactions] Fetch error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to load transaction history';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const filtered = payments.filter((tx) => {
    if (filter !== 'all' && tx.status !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (tx.merchants?.name || tx.merchants?.business_name || '').toLowerCase();
      const hash = tx.tx_hash?.toLowerCase() || '';
      if (!name.includes(q) && !hash.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
              Contactless Transaction Ledger
            </h1>
            <Badge variant="active" dot>BASE L2</Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] font-archivo">
            Real on-chain POS settlement events with sub-second finality
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#94A3B8] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search merchant, hash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 rounded-xl pl-9 pr-4 py-2.5 text-xs sm:text-sm font-archivo text-[#111111] dark:text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1749F5] focus:ring-1 focus:ring-[#1749F5] transition-colors"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadPayments}
            disabled={isLoading}
            className="text-xs shrink-0"
            title="Refresh Ledger"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-[13px] font-archivo font-medium transition-all ${
            filter === 'all'
              ? 'bg-[#ECEEFF] text-[#1749F5] dark:bg-white/10 dark:text-[#5B8EFF] font-semibold shadow-sm'
              : 'text-[#64748B] hover:text-[#111111] dark:text-[#94A3B8] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-white/5'
          }`}
        >
          All Transactions ({payments.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('confirmed')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-[13px] font-archivo font-medium transition-all ${
            filter === 'confirmed'
              ? 'bg-[#ECEEFF] text-[#1749F5] dark:bg-white/10 dark:text-[#5B8EFF] font-semibold shadow-sm'
              : 'text-[#64748B] hover:text-[#111111] dark:text-[#94A3B8] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-white/5'
          }`}
        >
          Confirmed Settled
        </button>
        <button
          type="button"
          onClick={() => setFilter('failed')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-[13px] font-archivo font-medium transition-all ${
            filter === 'failed'
              ? 'bg-[#ECEEFF] text-[#1749F5] dark:bg-white/10 dark:text-[#5B8EFF] font-semibold shadow-sm'
              : 'text-[#64748B] hover:text-[#111111] dark:text-[#94A3B8] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-white/5'
          }`}
        >
          Failed / Reverted
        </button>
      </div>

      {/* Transaction Table matching Section 5.5 */}
      <div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-16 text-center text-xs sm:text-sm font-archivo text-[#64748B] dark:text-[#94A3B8] flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#1749F5]" />
            <span>Loading transaction ledger from Base L2...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ECEEFF] dark:bg-white/5 text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center mx-auto shadow-sm">
              <Clock className="w-6 h-6" />
            </div>
            <p className="text-sm font-archivo font-medium text-[#111111] dark:text-[#F5F8FF]">
              No transactions match your criteria
            </p>
            <p className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8]">
              Try adjusting your search query or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm font-archivo">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-white/[0.02] border-b border-[#E2E8F0] dark:border-white/10 text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                  <th className="py-3.5 px-6">Status</th>
                  <th className="py-3.5 px-6">Merchant / Location</th>
                  <th className="py-3.5 px-6">Amount</th>
                  <th className="py-3.5 px-6">Transaction Hash</th>
                  <th className="py-3.5 px-6">Block</th>
                  <th className="py-3.5 px-6 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]/70 dark:divide-white/5">
                {filtered.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-[#F8FAFC]/80 dark:hover:bg-white/[0.02] transition-colors text-[#334155] dark:text-[#A9B9D5]"
                  >
                    <td className="py-4 px-6">
                      <span
                        className={
                          tx.status === 'confirmed'
                            ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/40 dark:text-emerald-300'
                            : tx.status === 'failed'
                            ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#EF4444] dark:bg-red-950/40 dark:text-red-300'
                            : 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#ECEEFF] text-[#1749F5] dark:bg-blue-950/40 dark:text-blue-300'
                        }
                      >
                        {tx.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-[#111111] dark:text-[#F5F8FF]">
                        {tx.merchants?.name || tx.merchants?.business_name || 'Countertop Retail Register'}
                      </div>
                      {tx.merchants?.payout_address && (
                        <div className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                          {truncateAddress(tx.merchants.payout_address)}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-base text-[#111111] dark:text-[#F5F8FF]">
                        ${formatUsdc(tx.amount)} USDC
                      </div>
                      <div className="text-[11px] text-[#10B981] font-medium">&lt; 1.2s tap</div>
                    </td>
                    <td className="py-4 px-6">
                      {tx.tx_hash ? (
                        <a
                          href={getExplorerTxUrl(tx.tx_hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 font-mono text-xs font-medium"
                        >
                          <span>{truncateAddress(tx.tx_hash)}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="py-4 px-6 font-mono text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {tx.block_number ? `#${tx.block_number}` : 'Pending'}
                    </td>
                    <td className="py-4 px-6 text-right text-xs text-[#64748B] dark:text-[#94A3B8]">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
