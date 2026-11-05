'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { QrCodeDisplay } from '@/components/ui/QrCodeDisplay';
import { getStoredSession } from '@/lib/auth';
import { generateEip681PaymentUri, truncateAddress } from '@/lib/base';
import {
  Terminal,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
  Radio,
  Sparkles,
} from 'lucide-react';

export default function VirtualTerminalPage() {
  const session = getStoredSession();
  const receivingAddress =
    session?.merchantProfile?.receivingAddress ||
    session?.smartAccountAddress ||
    '0x99A371F62a34DE9aC328Ea6C7f285F540fDEB456';

  const [amount, setAmount] = useState('4.50');
  const [currency, setCurrency] = useState<'USDC' | 'ETH'>('USDC');
  const [cardUid, setCardUid] = useState('4305-0129-8812');

  // Terminal state: 'idle' | 'awaiting' | 'settled'
  const [status, setStatus] = useState<'idle' | 'awaiting' | 'settled'>('idle');
  const [isProcessing, setIsProcessing] = useState(false);

  const paymentUri = generateEip681PaymentUri(
    receivingAddress,
    currency === 'USDC' ? Math.round(parseFloat(amount || '0') * 1000000).toString() : '4500000000000000'
  );

  const handleCreateCharge = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('awaiting');
  };

  const handleSimulateTap = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStatus('settled');
    }, 1200);
  };

  const handleReset = () => {
    setStatus('idle');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-[#1A2E38]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
              Virtual POS Checkout Register
            </span>
            <Badge variant="active">LIVE TERMINAL</Badge>
          </div>
          <p className="text-xs text-[#AAAAAA] font-mono">
            Accept card taps or display dynamic EIP-681 QR codes on Base
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cashier Charge Form */}
        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-mono font-bold text-[#DFE0E2] flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#5465FF]" />
            Transaction Details
          </h3>

          <form onSubmit={handleCreateCharge} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-mono font-medium text-[#DFE0E2]">
                Amount to Charge
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-mono text-[#888888]">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#071013] border border-[#1A2E38] focus:border-[#5465FF] focus:ring-1 focus:ring-[#5465FF] text-[#DFE0E2] text-xl font-mono font-bold rounded-lg pl-8 pr-3.5 py-2 transition-all focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCurrency('USDC')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono border ${
                  currency === 'USDC'
                    ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                    : 'bg-[#071013] text-[#AAAAAA] border-[#1A2E38]'
                }`}
              >
                USDC (Fixed)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('ETH')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono border ${
                  currency === 'ETH'
                    ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                    : 'bg-[#071013] text-[#AAAAAA] border-[#1A2E38]'
                }`}
              >
                Base ETH
              </button>
            </div>

            <Input
              label="Customer Card UID (or Tap)"
              value={cardUid}
              onChange={(e) => setCardUid(e.target.value)}
              helperText="NFC reader automatically populates this on physical tap"
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={status === 'awaiting'}
            >
              Generate Payment Request
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </form>
        </Card>

        {/* Customer-Facing POS Display */}
        <Card className="p-6 text-center flex flex-col items-center justify-between min-h-[380px] bg-gradient-to-b from-[#0B161B] to-[#071013] border-[#1A2E38]">
          <div className="w-full flex items-center justify-between pb-3 border-b border-[#1A2E38]">
            <span className="text-[10px] font-mono text-[#888888]">CUSTOMER SCREEN</span>
            <Badge variant={status === 'settled' ? 'posted' : 'info'}>
              {status.toUpperCase()}
            </Badge>
          </div>

          {status === 'idle' && (
            <div className="my-auto space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#0E1D24] border border-[#1A2E38] flex items-center justify-center mx-auto text-[#5465FF]">
                <Radio className="w-7 h-7" />
              </div>
              <div className="font-mono text-xs text-[#DFE0E2] font-bold">Terminal Ready</div>
              <p className="text-[11px] font-mono text-[#888888] max-w-xs">
                Enter an amount on the left to activate customer tap & QR display
              </p>
            </div>
          )}

          {status === 'awaiting' && (
            <div className="my-auto space-y-4">
              <div className="text-2xl font-bold font-mono text-[#DFE0E2]">
                ${parseFloat(amount || '0').toFixed(2)} {currency}
              </div>

              <QrCodeDisplay value={paymentUri} size={150} />

              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-xs font-mono text-emerald-400">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>Ready for NFC Card Tap</span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSimulateTap}
                  isLoading={isProcessing}
                  className="font-mono text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1 text-[#5465FF]" />
                  Simulate NFC Card Tap
                </Button>
              </div>
            </div>
          )}

          {status === 'settled' && (
            <div className="my-auto space-y-4 p-4 rounded-xl bg-emerald-950/30 border border-emerald-800 text-emerald-300">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <div>
                <div className="text-base font-bold font-mono">PAYMENT SETTLED</div>
                <div className="text-xs font-mono text-emerald-400/80 mt-1">
                  ${parseFloat(amount || '0').toFixed(2)} {currency} transferred on Base
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="font-mono text-xs"
              >
                Next Customer
              </Button>
            </div>
          )}

          <div className="w-full pt-3 border-t border-[#1A2E38] text-[10px] font-mono text-[#888888] flex items-center justify-between">
            <span>Base Mainnet (8453)</span>
            <span>Zero Gas to Customer</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
