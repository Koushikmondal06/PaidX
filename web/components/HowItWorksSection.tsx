'use client';

import React from 'react';
import { ArrowDown, CheckCircle, Radio, Landmark, QrCode, ShieldCheck, Zap } from 'lucide-react';
import { BaseChainIcon, UsdcIcon } from './CryptoIcons';

export function HowItWorksSection() {
  const steps = [
    {
      num: 1,
      title: 'Order',
      desc: 'Cashier enters the item or total on the ESP32 terminal keypad or web Virtual POS.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/10">
            <span className="text-xs font-mono text-light-text-secondary dark:text-dark-text-muted">
              CHAI & BAKERY
            </span>
            <span className="text-base font-bold text-light-text-primary dark:text-white">$8.50</span>
          </div>
          <div className="p-3 bg-light-secondary dark:bg-[#09152D] rounded-xl flex items-center justify-center">
            <div className="relative p-2 bg-white rounded-lg border border-gray-200 dark:border-white/20">
              <QrCode className="w-24 h-24 text-[#06142F]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <BaseChainIcon size={20} />
              </div>
            </div>
          </div>
          <div className="text-center text-xs font-medium text-brand-blue dark:text-brand-cyan">
            Amount Locked in USDC
          </div>
        </div>
      ),
    },
    {
      num: 2,
      title: 'Tap or Scan',
      desc: 'Shopper taps their physical PaidX NFC card against the reader or scans the dynamic QR.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md flex flex-col items-center justify-center space-y-4 py-8">
          <div className="w-16 h-12 bg-brand-blue dark:bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg animate-pulse">
            <Radio className="w-7 h-7" />
          </div>
          <div className="px-3 py-1 rounded-full bg-light-secondary dark:bg-[#09152D] border border-light-border dark:border-white/10 text-xs font-mono font-bold text-light-text-primary dark:text-white">
            NFC Chip Detected
          </div>
          <span className="text-[11px] text-light-text-secondary dark:text-dark-text-muted text-center">
            Zero phone unlock required
          </span>
        </div>
      ),
    },
    {
      num: 3,
      title: 'Session Key Check',
      desc: 'ERC-4337 smart account verifies daily card limit and executes a gasless Base user operation.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md space-y-3">
          <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-cyan">
            <Zap className="w-4 h-4" />
            <span>Paymaster Sponsoring Gas</span>
          </div>
          <div className="text-center text-xl font-black text-light-text-primary dark:text-white font-mono">
            $0.00 Gas Toll
          </div>
          <div className="pt-2 border-t border-gray-100 dark:border-white/10 space-y-1.5 text-[11px] text-light-text-secondary dark:text-dark-text-secondary font-mono">
            <div className="flex justify-between">
              <span>Card Limit</span>
              <span className="text-emerald-500 font-semibold">$50.00/day</span>
            </div>
            <div className="flex justify-between">
              <span>Remaining</span>
              <span className="font-semibold text-light-text-primary dark:text-white">$41.50</span>
            </div>
            <div className="flex justify-between">
              <span>Execution</span>
              <span className="text-brand-blue dark:text-brand-cyan font-semibold">1.1s Finality</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      num: 4,
      title: 'Instant Settlement',
      desc: 'USDC lands directly in the merchant wallet with on-chain BaseScan receipt and zero chargebacks.',
      renderCard: () => (
        <div className="w-full bg-white dark:bg-[#101F3B] rounded-2xl p-6 border border-light-border dark:border-white/10 shadow-md flex flex-col items-center justify-center space-y-4 py-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 shadow-sm">
            <CheckCircle className="w-7 h-7" />
          </div>

          <div className="px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/40 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">
            +$8.50 USDC Received
          </div>

          <span className="text-[11px] text-light-text-secondary dark:text-dark-text-muted text-center font-mono">
            Tx Verified on BaseScan
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
            <span>Simple 4-Step Checkout Flow</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            How in-store payments work with PaidX
          </h2>
          <p className="text-base sm:text-lg text-light-text-secondary dark:text-dark-text-secondary">
            Effortless checkout experience for both retail cashiers and smart card shoppers.
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
