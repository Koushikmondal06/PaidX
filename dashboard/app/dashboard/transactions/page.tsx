'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
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

      // Fetch payments for this user joined with merchants
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
            Contactless Transaction Ledger
          </h1>
          <p className="text-xs font-mono text-[#AAAAAA] mt-1">
            Real on-chain POS settlement events on Ethereum Sepolia
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Search by merchant or tx hash..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
            filter === 'all'
              ? 'bg-[#5465FF]/20 text-[#5465FF] border border-[#5465FF]/40'
              : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter('confirmed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
            filter === 'confirmed'
              ? 'bg-[#5465FF]/20 text-[#5465FF] border border-[#5465FF]/40'
              : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
          }`}
        >
          Confirmed
        </button>
        <button
          type="button"
          onClick={() => setFilter('failed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
            filter === 'failed'
              ? 'bg-[#5465FF]/20 text-[#5465FF] border border-[#5465FF]/40'
              : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
          }`}
        >
          Failed
        </button>
      </div>

      {/* Table Card */}
      <Card className="border-[#1A2E38] p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs font-mono text-[#888888]">
            Loading transaction ledger from Sepolia...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Clock className="w-8 h-8 text-[#444444] mx-auto" />
            <p className="text-xs font-mono text-[#888888]">
              No transactions match your search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1A2E38]">
            {filtered.map((tx) => (
              <div
                key={tx.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs font-mono hover:bg-[#0E1D24]/50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[#DFE0E2]">
                      {tx.merchants?.name || tx.merchants?.business_name || 'Retail Merchant'}
                    </p>
                    <Badge
                      variant={
                        tx.status === 'confirmed'
                          ? 'active'
                          : tx.status === 'failed'
                          ? 'revoked'
                          : 'info'
                      }
                    >
                      {tx.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[#666666] mt-0.5">
                    {new Date(tx.created_at).toUTCString()}
                    {tx.block_number && ` · Block #${tx.block_number}`}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="font-bold text-[#DFE0E2]">
                      ${formatUsdc(tx.amount)} USDC
                    </p>
                    {tx.merchants?.payout_address && (
                      <p className="text-[10px] text-[#666666]">
                        To: {truncateAddress(tx.merchants.payout_address)}
                      </p>
                    )}
                  </div>

                  {tx.tx_hash ? (
                    <a
                      href={getExplorerTxUrl(tx.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg bg-[#0E1D24] border border-[#1A2E38] text-[#5465FF] hover:border-[#5465FF]/40 inline-flex items-center gap-1"
                    >
                      <span>Receipt</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : (
                    <span className="text-[10px] text-[#666666] italic">Pending</span>
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
