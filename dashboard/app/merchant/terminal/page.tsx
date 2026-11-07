'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { QrCodeDisplay } from '@/components/ui/QrCodeDisplay';
import { getRealUserSession, UserSession } from '@/lib/auth';
import { generateEip681PaymentUri, truncateAddress, getExplorerTxUrl } from '@/lib/base';
import { parseUnits } from 'viem';
import {
  Terminal,
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  Zap,
  Radio,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

export default function VirtualTerminalPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [amount, setAmount] = useState('4.50');
  const [cardUid, setCardUid] = useState('');

  // Terminal state: 'idle' | 'awaiting' | 'processing' | 'confirmed' | 'failed'
  const [status, setStatus] = useState<'idle' | 'awaiting' | 'processing' | 'confirmed' | 'failed'>('idle');
  const [settledTxHash, setSettledTxHash] = useState<string | null>(null);
  const [settledBlock, setSettledBlock] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const s = await getRealUserSession();
      setSession(s);
    }
    load();
  }, []);

  const receivingAddress =
    session?.merchantProfile?.receivingAddress ||
    session?.smartAccountAddress ||
    session?.eoaAddress ||
    '';

  let amountUnits = '0';
  try {
    amountUnits = parseUnits(amount || '0', 6).toString();
  } catch {
    amountUnits = '0';
  }

  const paymentUri = generateEip681PaymentUri(
    receivingAddress,
    amountUnits
  );

  const handleCreateCharge = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount || '0');
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMessage('Charge amount must be greater than $0.00 USDC.');
      return;
    }
    if (!receivingAddress) {
      setErrorMessage('Merchant settlement address is not configured.');
      return;
    }
    setStatus('awaiting');
    setErrorMessage(null);
  };

  const handleExecuteTap = async () => {
    if (!cardUid) {
      setErrorMessage('Please enter or scan an NFC card UID.');
      return;
    }

    if (!session?.merchantProfile?.id) {
      setErrorMessage('Merchant profile not found for this account.');
      return;
    }

    setStatus('processing');
    setErrorMessage(null);

    try {
      const idempotencyKey = crypto.randomUUID();

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'x-merchant-id': session.merchantProfile.id,
        },
        body: JSON.stringify({
          merchantId: session.merchantProfile.id,
          rawCardUid: cardUid.trim(),
          amount: amountUnits,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Payment failed with code: ${data.code}`);
      }

      setSettledTxHash(data.payment.tx_hash);
      setSettledBlock(data.payment.block_number);
      setCardUid('');
      setStatus('confirmed');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment settlement failed';
      setErrorMessage(msg);
      setStatus('failed');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setCardUid('');
    setSettledTxHash(null);
    setSettledBlock(null);
    setErrorMessage(null);
  };

  const presetAmounts = ['2.50', '5.00', '12.50', '25.00'];

  if (!session) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
              Virtual POS Checkout Register
            </h1>
            <Badge variant="active" dot>LIVE COUNTER POS</Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] font-archivo">
            Accept contactless NFC smart card taps or generate dynamic EIP-681 payment QR codes
          </p>
        </div>

        {receivingAddress && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 text-xs font-mono">
            <span className="text-[#64748B] dark:text-[#94A3B8]">Receiving:</span>
            <span className="text-[#1749F5] dark:text-[#5B8EFF] font-medium">{truncateAddress(receivingAddress)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Cashier Charge Form Card */}
        <div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-6">
          <div className="flex items-center gap-2.5 pb-2 border-b border-[#E2E8F0] dark:border-white/10">
            <div className="w-9 h-9 rounded-xl bg-[#ECEEFF] dark:bg-white/10 text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
                Register Sale Amount
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                Settled natively in USDC on Base L2
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateCharge} className="space-y-5 font-archivo">
            <div className="space-y-2">
              <label className="block text-xs sm:text-[13px] font-medium text-[#111111] dark:text-[#F5F8FF]">
                Charge Amount (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3 text-xl font-semibold text-[#64748B] dark:text-[#94A3B8]">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/15 focus:border-[#1749F5] focus:ring-1 focus:ring-[#1749F5] text-[#111111] dark:text-white text-2xl font-semibold rounded-xl pl-9 pr-4 py-2.5 transition-all focus:outline-none"
                  disabled={status === 'awaiting' || status === 'processing'}
                  required
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-2 pt-1">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={status === 'awaiting' || status === 'processing'}
                    onClick={() => setAmount(preset)}
                    className="flex-1 py-1.5 px-2 bg-[#F8FAFC] dark:bg-white/5 hover:bg-[#ECEEFF] dark:hover:bg-white/10 text-[#334155] dark:text-[#F5F8FF] hover:text-[#1749F5] text-xs font-medium rounded-lg border border-[#E2E8F0] dark:border-white/10 transition-colors"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-[#F8FAFC] dark:bg-white/5 rounded-2xl border border-[#E2E8F0] dark:border-white/10 space-y-2 text-xs sm:text-[13px]">
              <div className="flex justify-between text-[#64748B] dark:text-[#94A3B8]">
                <span>Settlement Currency:</span>
                <span className="text-[#111111] dark:text-[#F5F8FF] font-medium">Native USDC (Base L2)</span>
              </div>
              <div className="flex justify-between text-[#64748B] dark:text-[#94A3B8]">
                <span>Tap Execution Speed:</span>
                <span className="text-[#10B981] font-semibold">&lt; 1.2s Instant Settlement</span>
              </div>
            </div>

            {status === 'idle' ? (
              <Button type="submit" variant="primary" size="lg" className="w-full">
                <span>Open Terminal For Customer</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={handleReset}
                className="w-full gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Register</span>
              </Button>
            )}
          </form>
        </div>

        {/* Customer Facing Terminal Screen: Soft Lavender Panel Motif */}
        <div className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-6 sm:p-8 flex flex-col justify-between items-center text-center relative overflow-hidden min-h-[400px] transition-colors shadow-sm font-archivo">
          {status === 'idle' && (
            <div className="my-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[#09152D] border border-[#DFE3F8] dark:border-white/10 flex items-center justify-center mx-auto text-[#1749F5] dark:text-[#5B8EFF] shadow-sm">
                <Radio className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-[#111111] dark:text-[#F5F8FF]">
                  Register Ready
                </h4>
                <p className="text-xs sm:text-sm text-[#334155] dark:text-[#A9B9D5] mt-1 max-w-xs leading-relaxed">
                  Enter an amount and click Open Terminal to initiate retail POS settlement.
                </p>
              </div>
            </div>
          )}

          {status === 'awaiting' && (
            <div className="w-full space-y-5 my-auto">
              <div className="text-center space-y-1.5">
                <Badge variant="info" dot>AWAITING TAP OR SCAN</Badge>
                <div className="text-3xl sm:text-4xl font-semibold text-[#111111] dark:text-[#F5F8FF] pt-1 tracking-tight">
                  ${parseFloat(amount || '0').toFixed(2)} USDC
                </div>
              </div>

              {/* NFC Card UID Input inside elevated white card */}
              <div className="p-5 bg-white dark:bg-[#09152D] rounded-2xl border border-[#DFE3F8] dark:border-white/10 space-y-3.5 shadow-sm text-left">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[#1749F5] dark:text-[#5B8EFF] uppercase tracking-wider">
                  <Radio className="w-4 h-4 animate-pulse" />
                  <span>Tap NFC Card or Enter UID</span>
                </div>

                <Input
                  label="Smart Card UID"
                  placeholder="e.g. 04:A2:B3:C4:D5:E6:F7"
                  value={cardUid}
                  onChange={(e) => setCardUid(e.target.value)}
                />

                <Button
                  variant="primary"
                  size="md"
                  onClick={handleExecuteTap}
                  className="w-full gap-1.5"
                >
                  <Zap className="w-4 h-4" />
                  <span>Execute Contactless Tap</span>
                </Button>
              </div>

              <div className="flex justify-center p-3 bg-white dark:bg-[#09152D] rounded-2xl w-fit mx-auto shadow-sm border border-[#DFE3F8] dark:border-white/10">
                <QrCodeDisplay value={paymentUri} size={110} />
              </div>
            </div>
          )}

          {status === 'processing' && (
            <div className="my-auto space-y-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[#09152D] border border-[#1749F5] flex items-center justify-center mx-auto text-[#1749F5] shadow-sm animate-spin">
                <Clock className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-[#111111] dark:text-[#F5F8FF]">
                  Redeeming Session Key Tap
                </h4>
                <p className="text-xs sm:text-sm text-[#334155] dark:text-[#A9B9D5] mt-1">
                  Submitting transaction to Base L2 Paymaster...
                </p>
              </div>
            </div>
          )}

          {status === 'confirmed' && (
            <div className="my-auto space-y-4 text-center w-full">
              <div className="w-16 h-16 rounded-2xl bg-[#ECFDF5] border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center mx-auto text-[#10B981] shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-[#111111] dark:text-[#F5F8FF]">
                  Payment Confirmed On-Chain
                </h4>
                <p className="text-sm text-[#10B981] font-semibold mt-1">
                  ${parseFloat(amount || '0').toFixed(2)} USDC Settled (&lt; 1.2s)
                </p>
              </div>

              {settledTxHash && (
                <div className="p-4 bg-white dark:bg-[#09152D] rounded-xl border border-[#DFE3F8] dark:border-white/10 text-xs max-w-sm mx-auto shadow-sm">
                  <p className="text-[#64748B] dark:text-[#94A3B8]">Immutable Receipt:</p>
                  <a
                    href={getExplorerTxUrl(settledTxHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 font-mono text-xs mt-1 font-medium"
                  >
                    <span>{truncateAddress(settledTxHash)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {settledBlock && (
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5 font-mono">
                      Block #{settledBlock}
                    </p>
                  )}
                </div>
              )}

              <Button variant="primary" size="sm" onClick={handleReset} className="mt-2">
                New Sale
              </Button>
            </div>
          )}

          {status === 'failed' && (
            <div className="my-auto space-y-4 text-center w-full">
              <div className="w-16 h-16 rounded-2xl bg-[#FEF2F2] border border-red-200 dark:border-red-800/40 flex items-center justify-center mx-auto text-[#EF4444] shadow-sm">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-[#EF4444]">
                  Payment Declined
                </h4>
                <p className="text-xs sm:text-sm text-[#334155] dark:text-[#A9B9D5] mt-1 max-w-xs mx-auto">
                  {errorMessage || 'Transaction could not be settled on-chain.'}
                </p>
              </div>

              <Button variant="outline" size="sm" onClick={handleReset} className="mt-2">
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
