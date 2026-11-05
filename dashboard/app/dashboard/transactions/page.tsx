'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getBaseScanTxUrl, truncateAddress } from '@/lib/base';
import {
  DollarSign,
  ExternalLink,
  Filter,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
} from 'lucide-react';

interface PaymentItem {
  id: string;
  merchantName: string;
  merchantAddress: string;
  cardUid: string;
  amount: string;
  amountWei: string;
  status: 'settled' | 'pending' | 'failed';
  timestamp: string;
  txHash: string;
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<'all' | 'settled' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const transactions: PaymentItem[] = [
    {
      id: 'tx_01',
      merchantName: 'Blue Bottle Coffee',
      merchantAddress: '0x99A371F62a34DE9aC328Ea6C7f285F540fDEB456',
      cardUid: '4305-0129-8812',
      amount: '$4.50 USDC',
      amountWei: '4500000',
      status: 'settled',
      timestamp: '2026-11-06 01:14 UTC',
      txHash: '0x3a5b6c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef0123',
    },
    {
      id: 'tx_02',
      merchantName: 'Subway Market Street',
      merchantAddress: '0x1234567890123456789012345678901234567890',
      cardUid: '4305-0129-8812',
      amount: '$2.00 USDC',
      amountWei: '2000000',
      status: 'settled',
      timestamp: '2026-11-05 22:30 UTC',
      txHash: '0x8f7e6d5c4b3a210987654321fedcba987654321fedcba987654321fedcba9876',
    },
    {
      id: 'tx_03',
      merchantName: 'Caltrain Station Kiosk',
      merchantAddress: '0x71C67Ed3E879C51bFa61b2e2d96c97a892789111',
      cardUid: '4305-0129-8812',
      amount: '$8.25 USDC',
      amountWei: '8250000',
      status: 'settled',
      timestamp: '2026-11-05 18:05 UTC',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    },
  ];

  const filtered = transactions.filter((tx) => {
    if (filter !== 'all' && tx.status !== filter) return false;
    if (
      searchQuery &&
      !tx.merchantName.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !tx.txHash.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
            Transaction History
          </h1>
          <p className="text-xs text-[#AAAAAA] font-mono mt-1">
            Settled retail taps & blockchain verification receipts on Base
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1.5 p-1 bg-[#0B161B] rounded-lg border border-[#1A2E38]">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-xs font-mono ${
              filter === 'all'
                ? 'bg-[#0E1D24] text-[#DFE0E2] border border-[#5465FF]/40'
                : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('settled')}
            className={`px-3 py-1 rounded text-xs font-mono ${
              filter === 'settled'
                ? 'bg-[#0E1D24] text-[#DFE0E2] border border-[#5465FF]/40'
                : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
            }`}
          >
            Settled
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 rounded text-xs font-mono ${
              filter === 'pending'
                ? 'bg-[#0E1D24] text-[#DFE0E2] border border-[#5465FF]/40'
                : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
            }`}
          >
            Pending
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="max-w-md">
        <Input
          placeholder="Search by merchant name or tx hash..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Transactions Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0E1D24] border-b border-[#1A2E38] text-[#888888]">
              <tr>
                <th className="py-3 px-6">Status</th>
                <th className="py-3 px-6">Merchant</th>
                <th className="py-3 px-6">Amount</th>
                <th className="py-3 px-6">Timestamp</th>
                <th className="py-3 px-6">Receipt / BaseScan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2E38]">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-[#0E1D24]/40 transition-colors">
                  <td className="py-4 px-6">
                    <Badge variant="posted">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      SETTLED
                    </Badge>
                  </td>
                  <td className="py-4 px-6">
                    <div className="font-bold text-[#DFE0E2]">{tx.merchantName}</div>
                    <div className="text-[10px] text-[#888888]">
                      To: {truncateAddress(tx.merchantAddress)}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="font-bold text-[#DFE0E2]">{tx.amount}</div>
                    <div className="text-[10px] text-[#888888]">Raw: {tx.amountWei} units</div>
                  </td>
                  <td className="py-4 px-6 text-[#AAAAAA]">{tx.timestamp}</td>
                  <td className="py-4 px-6">
                    <a
                      href={getBaseScanTxUrl(tx.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#5465FF] hover:underline inline-flex items-center gap-1 font-mono text-xs"
                    >
                      {truncateAddress(tx.txHash)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
