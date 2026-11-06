'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { QrCodeDisplay } from '@/components/ui/QrCodeDisplay';
import { getRealUserSession, UserSession } from '@/lib/auth';
import { generateEip681PaymentUri, truncateAddress, getExplorerTxUrl } from '@/lib/base';
import { formatUsdc } from '@/lib/currency';
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

  if (!session) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-[#1A2E38]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
              Virtual POS Checkout Register
            </span>
            <Badge variant="active">SEPOLIA TESTNET</Badge>
          </div>
          <p className="text-xs text-[#AAAAAA] font-mono">
            Accept contactless NFC card taps or EIP-681 QR codes
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cashier Charge Form */}
        <Card className="p-6 space-y-5">
          <h3 className="text-sm font-mono font-bold text-[#DFE0E2] flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#5465FF]" />
            <span>Transaction Details</span>
          </h3>

          <form onSubmit={handleCreateCharge} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-mono font-medium text-[#DFE0E2]">
                Amount to Charge (USDC)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs font-mono text-[#888888]">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#071013] border border-[#1A2E38] focus:border-[#5465FF] focus:ring-1 focus:ring-[#5465FF] text-[#DFE0E2] text-xl font-mono font-bold rounded-lg pl-8 pr-3.5 py-2 transition-all focus:outline-none"
                  disabled={status === 'awaiting' || status === 'processing'}
                  required
                />
              </div>
            </div>

            <div className="p-3 bg-[#071013] rounded-lg border border-[#1A2E38] space-y-1 text-xs font-mono">
              <div className="flex justify-between text-[#AAAAAA]">
                <span>Settlement Asset:</span>
                <span className="text-[#DFE0E2]">Sepolia USDC</span>
              </div>
              <div className="flex justify-between text-[#AAAAAA]">
                <span>Receiving Payout:</span>
                <span className="text-[#5465FF]">{truncateAddress(receivingAddress)}</span>
              </div>
            </div>

            {status === 'idle' ? (
              <Button type="submit" variant="primary" size="lg" className="w-full font-mono text-xs">
                <span>Open Terminal For Customer</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="w-full font-mono text-xs"
              >
                Reset Register
              </Button>
            )}
          </form>
        </Card>

        {/* Customer Facing Terminal Screen */}
        <Card className="p-6 flex flex-col justify-between items-center text-center relative overflow-hidden bg-[#071013] border-[#1A2E38]">
          {status === 'idle' && (
            <div className="my-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#0E1D24] border border-[#1A2E38] flex items-center justify-center mx-auto text-[#666666]">
                <Radio className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-mono font-bold text-[#DFE0E2]">Register Ready</h4>
                <p className="text-xs font-mono text-[#888888] mt-1 max-w-xs">
                  Enter an amount and click Open Terminal to initiate retail POS settlement.
                </p>
              </div>
            </div>
          )}

          {status === 'awaiting' && (
            <div className="w-full space-y-4 my-auto">
              <div className="text-center space-y-1">
                <Badge variant="active">AWAITING NFC CARD TAP</Badge>
                <div className="text-3xl font-mono font-bold text-[#DFE0E2] pt-2">
                  ${parseFloat(amount || '0').toFixed(2)} USDC
                </div>
              </div>

              {/* NFC Card UID Input */}
              <div className="p-4 bg-[#0B161B] rounded-xl border border-[#1A2E38] space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs font-mono text-indigo-400">
                  <Radio className="w-4 h-4 animate-pulse" />
                  <span>Tap NFC Card or Enter UID</span>
                </div>

                <Input
                  label="Card UID"
                  placeholder="e.g. 04:A2:B3:C4:D5:E6:F7"
                  value={cardUid}
                  onChange={(e) => setCardUid(e.target.value)}
                />

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExecuteTap}
                  className="w-full font-mono text-xs"
                >
                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                  <span>Execute Contactless Tap</span>
                </Button>
              </div>

              <div className="flex justify-center p-2 bg-white rounded-lg w-fit mx-auto">
                <QrCodeDisplay value={paymentUri} size={110} />
              </div>
            </div>
          )}

          {status === 'processing' && (
            <div className="my-auto space-y-4 text-center">
              <div className="w-16 h-16 rounded-full bg-[#5465FF]/20 border border-[#5465FF] flex items-center justify-center mx-auto text-[#5465FF] animate-spin">
                <Clock className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-mono font-bold text-[#DFE0E2]">
                  Redeeming ERC-7715 Delegation
                </h4>
                <p className="text-xs font-mono text-[#888888] mt-1">
                  Submitting transaction on Ethereum Sepolia and awaiting receipt...
                </p>
              </div>
            </div>
          )}

          {status === 'confirmed' && (
            <div className="my-auto space-y-4 text-center w-full">
              <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500 flex items-center justify-center mx-auto text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-mono font-bold text-[#DFE0E2]">
                  Payment Confirmed On-Chain
                </h4>
                <p className="text-xs font-mono text-emerald-400 font-bold mt-1">
                  ${parseFloat(amount || '0').toFixed(2)} USDC Settled
                </p>
              </div>

              {settledTxHash && (
                <div className="p-3 bg-[#0B161B] rounded-lg border border-[#1A2E38] text-xs font-mono">
                  <p className="text-[#888888]">Ethereum Sepolia Receipt:</p>
                  <a
                    href={getExplorerTxUrl(settledTxHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#5465FF] hover:underline inline-flex items-center gap-1 font-mono text-[11px] mt-1"
                  >
                    <span>{truncateAddress(settledTxHash)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {settledBlock && (
                    <p className="text-[10px] text-[#666666] mt-0.5">
                      Block #{settledBlock}
                    </p>
                  )}
                </div>
              )}

              <Button variant="outline" size="sm" onClick={handleReset} className="font-mono text-xs">
                New Sale
              </Button>
            </div>
          )}

          {status === 'failed' && (
            <div className="my-auto space-y-4 text-center w-full">
              <div className="w-16 h-16 rounded-full bg-rose-950/60 border border-rose-500 flex items-center justify-center mx-auto text-rose-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-mono font-bold text-rose-300">
                  Payment Rejected
                </h4>
                <p className="text-xs font-mono text-[#AAAAAA] mt-1">
                  {errorMessage || 'Transaction could not be settled.'}
                </p>
              </div>

              <Button variant="outline" size="sm" onClick={handleReset} className="font-mono text-xs">
                Try Again
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
