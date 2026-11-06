'use client';

import React from 'react';
import { ArrowDown, CheckCircle, RefreshCw, Landmark, QrCode } from 'lucide-react';
import { BitcoinIcon, BaseChainIcon, UsdcIcon } from './CryptoIcons';

export function HowItWorksSection() {
  const steps = [
    {
      num: 1,
      title: 'Invoice',
      desc: 'PaidX generates a payment invoice with a locked exchange rate and dynamic QR code.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/10">
            <span className="text-xs font-mono text-light-text-secondary dark:text-dark-text-muted">
              INV #8942-01
            </span>
            <span className="text-base font-bold text-light-text-primary dark:text-white">$136.12</span>
          </div>
          <div className="p-3 bg-light-secondary dark:bg-[#09152D] rounded-xl flex items-center justify-center">
            <div className="relative p-2 bg-white rounded-lg border border-gray-200 dark:border-white/20">
              <QrCode className="w-24 h-24 text-[#06142F]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <BitcoinIcon size={20} />
              </div>
            </div>
          </div>
          <div className="text-center text-xs font-medium text-light-text-secondary dark:text-dark-text-muted">
            Rate locked for 15 minutes
          </div>
        </div>
      ),
    },
    {
      num: 2,
      title: 'Payment',
      desc: 'Your customer pays seamlessly with their preferred self-custody wallet or mobile app.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md space-y-3">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span>Payment Detected</span>
          </div>
          <div className="text-center text-2xl font-black text-light-text-primary dark:text-white">
            $136.12
          </div>
          <div className="pt-2 border-t border-gray-100 dark:border-white/10 space-y-1.5 text-[11px] text-light-text-secondary dark:text-dark-text-secondary font-mono">
            <div className="flex justify-between">
              <span>Network</span>
              <span className="font-semibold text-brand-blue dark:text-brand-cyan">Base L2</span>
            </div>
            <div className="flex justify-between">
              <span>Asset</span>
              <span>USDC / BTC</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <span className="text-emerald-500 font-semibold">Confirmed (1.1s)</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      num: 3,
      title: 'Conversion',
      desc: 'PaidX instantly converts the crypto asset to guaranteed local fiat with zero slippage.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md flex flex-col items-center justify-center space-y-4 py-8">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/40">
            <BitcoinIcon size={20} />
            <span className="text-xs font-bold font-mono text-amber-700 dark:text-amber-300">
              0.013104 BTC
            </span>
          </div>

          <div className="p-2 rounded-full bg-light-soft dark:bg-[#142443] text-brand-blue dark:text-brand-cyan shadow-sm animate-pulse">
            <ArrowDown className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/40 shadow-sm">
            <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
              $
            </div>
            <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
              $136.12 USD
            </span>
          </div>
        </div>
      ),
    },
    {
      num: 4,
      title: 'Transfer',
      desc: 'PaidX settles funds directly to your business bank account the next business day.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md flex flex-col items-center justify-center space-y-4 py-8">
          <div className="relative">
            <div className="w-16 h-12 bg-brand-blue dark:bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              <Landmark className="w-6 h-6" />
            </div>
            <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-emerald-500 text-white font-mono text-[10px] font-bold">
              ACH/SEPA
            </div>
          </div>

          <div className="px-3.5 py-1.5 rounded-full bg-light-secondary dark:bg-[#09152D] border border-light-border dark:border-white/10 text-xs font-mono font-bold text-light-text-primary dark:text-white">
            +$136.12 USD Settled
          </div>

          <span className="text-[11px] text-light-text-secondary dark:text-dark-text-muted text-center">
            Daily automatic bank batching
          </span>
        </div>
      ),
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-[#FFFFFF] dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-brand-blue bg-brand-blue/10 dark:text-brand-cyan dark:bg-brand-cyan/15">
            <span>Simple 4-Step Retail Flow</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            How in-store crypto payments work with PaidX
          </h2>
          <p className="text-base sm:text-lg text-light-text-secondary dark:text-dark-text-secondary">
            Effortless checkout experience for both your retail cashiers and your customers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.num} className="flex flex-col items-center space-y-5 text-center">
              {/* Number Badge */}
              <div className="w-12 h-12 rounded-full bg-white dark:bg-dark-surface border-2 border-brand-blue dark:border-brand-cyan text-brand-blue dark:text-brand-cyan flex items-center justify-center font-bold text-lg shadow-sm">
                {step.num}
              </div>

              {/* Title & Desc */}
              <div className="space-y-1.5 px-2">
                <h3 className="text-xl font-bold text-light-text-primary dark:text-white">
                  {step.title}
                </h3>
                <p className="text-xs sm:text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                  {step.desc}
                </p>
              </div>

              {/* Visual Card */}
              <div className="w-full pt-2 flex-1 flex flex-col justify-end">
                {step.renderCard()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
