'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { getStoredSession, UserSession } from '@/lib/auth';
import { getBaseScanAddressUrl, truncateAddress } from '@/lib/base';
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
} from 'lucide-react';

export default function MerchantOverviewPage() {
  const [session, setSession] = useState<UserSession | null>(null);

  useEffect(() => {
    setSession(getStoredSession());
  }, []);

  if (!session) return null;

  const storeName = session.merchantProfile?.businessName || 'Apex Artisan Coffee';
  const receivingAddress =
    session.merchantProfile?.receivingAddress || session.smartAccountAddress;

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
            <a
              href={getBaseScanAddressUrl(receivingAddress)}
              target="_blank"
              rel="noreferrer"
              className="text-[#5465FF] hover:underline inline-flex items-center gap-1 font-mono"
            >
              {truncateAddress(receivingAddress)}
              <ExternalLink className="w-3 h-3" />
            </a>
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

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Settled Revenue"
          value="$1,420.50"
          subtitle="Net USDC Balance in Ledger"
          icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
        />
        <StatCard
          title="Today's Sales"
          value="$84.75"
          subtitle="18 Transactions"
          icon={<TrendingUp className="w-4 h-4 text-[#5465FF]" />}
        />
        <StatCard
          title="Connected Terminals"
          value="2 Active"
          subtitle="Counter 01 & Virtual POS"
          icon={<Cpu className="w-4 h-4 text-amber-400" />}
        />
        <StatCard
          title="Average Settlement"
          value="< 850 ms"
          subtitle="Base L2 Block Finality"
          icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
        />
      </div>

      {/* Quick Access Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-[#5465FF]/10 text-[#5465FF] border border-[#5465FF]/30">
              <Terminal className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-mono font-bold text-[#DFE0E2]">
                Virtual Checkout Register
              </h3>
              <p className="text-xs font-mono text-[#AAAAAA] mt-0.5">
                Ring up customer purchases and accept card taps directly from your browser.
              </p>
            </div>
          </div>
          <Link href="/merchant/terminal" className="block">
            <Button variant="primary" size="md" className="w-full">
              Open Virtual Register
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Link>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-mono font-bold text-[#DFE0E2]">
                Physical ESP32 POS Terminals
              </h3>
              <p className="text-xs font-mono text-[#AAAAAA] mt-0.5">
                Provision hardware NFC counter devices and manage secure pairing tokens.
              </p>
            </div>
          </div>
          <Link href="/merchant/pos" className="block">
            <Button variant="outline" size="md" className="w-full">
              Configure Hardware Terminals
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
