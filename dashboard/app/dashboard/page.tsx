'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Modal } from '@/components/ui/Modal';
import { QrCodeDisplay } from '@/components/ui/QrCodeDisplay';
import { getStoredSession, UserSession } from '@/lib/auth';
import { getBaseScanTxUrl, getBaseScanAddressUrl, truncateAddress } from '@/lib/base';
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

export default function UserDashboardOverviewPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Spending limits state
  const dailyLimitUsdc = 25.0;
  const spentTodayUsdc = 6.5;
  const remainingUsdc = dailyLimitUsdc - spentTodayUsdc;
  const percentSpent = Math.round((spentTodayUsdc / dailyLimitUsdc) * 100);

  // Mock transactions
  const recentPayments = [
    {
      id: 'tx_8453_01',
      merchantName: 'Blue Bottle Coffee',
      amount: '$4.50 USDC',
      amountWei: '4500000',
      status: 'settled',
      timestamp: '12 minutes ago',
      txHash: '0x3a5b6c7d8e9f0123456789abcdef0123456789abcdef0123456789abcdef0123',
    },
    {
      id: 'tx_8453_02',
      merchantName: 'Subway Market Street',
      amount: '$2.00 USDC',
      amountWei: '2000000',
      status: 'settled',
      timestamp: '3 hours ago',
      txHash: '0x8f7e6d5c4b3a210987654321fedcba987654321fedcba987654321fedcba9876',
    },
    {
      id: 'tx_8453_03',
      merchantName: 'Caltrain Station Kiosk',
      amount: '$8.25 USDC',
      amountWei: '8250000',
      status: 'settled',
      timestamp: 'Yesterday',
      txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    },
  ];

  useEffect(() => {
    setSession(getStoredSession());
  }, []);

  if (!session) return null;

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
            <span>Smart Account:</span>
            <a
              href={getBaseScanAddressUrl(session.smartAccountAddress)}
              target="_blank"
              rel="noreferrer"
              className="text-[#5465FF] hover:underline inline-flex items-center gap-1 font-mono"
            >
              {truncateAddress(session.smartAccountAddress)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDepositModal(true)}
            className="font-mono text-xs"
          >
            <QrCode className="w-3.5 h-3.5 mr-1.5 text-[#5465FF]" />
            Deposit Funds
          </Button>

          <Link href="/dashboard/cards">
            <Button variant="primary" size="sm" className="font-mono text-xs">
              <Sliders className="w-3.5 h-3.5 mr-1.5" />
              Manage Limits
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats & Balances Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="USDC Balance"
          value="$145.80"
          subtitle="Ready for NFC Card Tap"
          icon={<DollarSign className="w-4 h-4" />}
        />
        <StatCard
          title="Base ETH Balance"
          value="0.0350 ETH"
          subtitle="Base Mainnet (8453)"
          icon={<Zap className="w-4 h-4 text-emerald-400" />}
        />
        <StatCard
          title="Daily Remaining"
          value={`$${remainingUsdc.toFixed(2)}`}
          subtitle={`of $${dailyLimitUsdc.toFixed(2)} daily limit`}
          icon={<Clock className="w-4 h-4 text-[#5465FF]" />}
        />
        <StatCard
          title="Active Physical Cards"
          value="1 Card"
          subtitle="Black Matte (UID: 4305-0129)"
          icon={<CreditCard className="w-4 h-4 text-[#EB5160]" />}
        />
      </div>

      {/* Daily Spending Limit Progress Bar */}
      <Card className="p-6 bg-gradient-to-r from-[#0B161B] to-[#0E1D24] border-[#1A2E38]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-mono font-bold text-[#DFE0E2] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#5465FF]" />
              Today's Spending Delegation
            </h3>
            <p className="text-xs font-mono text-[#AAAAAA] mt-0.5">
              Enforced on-chain by ERC-7710 Caveat Enforcers • Resets at 00:00 UTC
            </p>
          </div>
          <div className="text-right">
            <span className="text-sm font-mono font-bold text-[#DFE0E2]">
              ${spentTodayUsdc.toFixed(2)} / ${dailyLimitUsdc.toFixed(2)} USDC
            </span>
            <span className="text-xs font-mono text-[#5465FF] ml-2">({percentSpent}%)</span>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full bg-[#071013] h-3 rounded-full overflow-hidden p-0.5 border border-[#1A2E38]">
          <div
            className="h-full bg-gradient-to-r from-[#5465FF] to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${percentSpent}%` }}
          />
        </div>
      </Card>

      {/* Interactive Card Section & Quick Tap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visual Physical Card */}
        <div className="lg:col-span-1">
          <div className="h-56 rounded-2xl p-6 bg-gradient-to-tr from-[#050D11] via-[#0E1D24] to-[#122630] border border-[#1A2E38] shadow-2xl relative flex flex-col justify-between overflow-hidden">
            {/* Hologram / Shine effect */}
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#5465FF]/20 rounded-full blur-2xl" />

            <div className="flex items-center justify-between z-10">
              <span className="font-mono font-bold text-sm tracking-tight text-[#DFE0E2]">
                Paid<span className="text-[#5465FF]">X</span> Card
              </span>
              <div className="flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-[#5465FF] animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-400">ACTIVE</span>
              </div>
            </div>

            {/* Chip */}
            <div className="w-10 h-7 rounded bg-gradient-to-br from-amber-200 to-amber-500 p-0.5 opacity-90 shadow-sm z-10">
              <div className="w-full h-full border border-amber-800/40 rounded flex flex-col justify-between p-0.5">
                <div className="h-[1px] bg-amber-800/40" />
                <div className="h-[1px] bg-amber-800/40" />
              </div>
            </div>

            <div className="z-10 space-y-1">
              <div className="text-[11px] font-mono text-[#AAAAAA] tracking-widest">
                UID: 4305 •••• •••• 0129
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-[#888888]">
                <span>{session.fullName.toUpperCase()}</span>
                <span>BASE (8453)</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex justify-between gap-2">
            <Link href="/dashboard/cards" className="flex-1">
              <Button variant="outline" size="sm" className="w-full text-xs font-mono">
                Card Settings
              </Button>
            </Link>
            <Link href="/merchant/terminal" className="flex-1">
              <Button variant="secondary" size="sm" className="w-full text-xs font-mono">
                Test in Terminal
              </Button>
            </Link>
          </div>
        </div>

        {/* Recent Transactions Feed */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#1A2E38]">
              <div>
                <h3 className="text-sm font-mono font-bold text-[#DFE0E2]">Recent Activity</h3>
                <p className="text-[11px] font-mono text-[#AAAAAA]">
                  Payments verified on Base & settled in ledger
                </p>
              </div>
              <Link href="/dashboard/transactions">
                <Button variant="ghost" size="sm" className="text-xs font-mono">
                  View All
                  <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="divide-y divide-[#1A2E38] mt-2">
              {recentPayments.map((payment) => (
                <div key={payment.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-[#DFE0E2]">
                        {payment.merchantName}
                      </div>
                      <div className="text-[11px] font-mono text-[#888888]">
                        {payment.timestamp}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-[#DFE0E2]">
                      {payment.amount}
                    </div>
                    <a
                      href={getBaseScanTxUrl(payment.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] font-mono text-[#5465FF] hover:underline inline-flex items-center gap-0.5"
                    >
                      BaseScan <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Deposit Modal */}
      <Modal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        title="Deposit Funds to Smart Account"
      >
        <div className="space-y-5 text-center">
          <p className="text-xs font-mono text-[#AAAAAA]">
            Send Base USDC or Base ETH directly to your non-custodial Smart Account address:
          </p>

          <QrCodeDisplay value={session.smartAccountAddress} size={180} />

          <div className="p-3 rounded-lg bg-[#071013] border border-[#1A2E38] text-left">
            <span className="text-[10px] font-mono text-[#888888] block">Your Smart Account:</span>
            <span className="text-xs font-mono text-[#5465FF] break-all select-all">
              {session.smartAccountAddress}
            </span>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <span>Network: Base (Chain ID 8453)</span>
          </div>

          <Button
            variant="outline"
            size="md"
            className="w-full"
            onClick={() => setShowDepositModal(false)}
          >
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}
