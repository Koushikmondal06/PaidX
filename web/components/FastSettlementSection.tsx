'use client';

import React from 'react';
import { CheckCircle2, ArrowRight, ArrowDown, Wallet, Radio, Zap, ShieldCheck } from 'lucide-react';
import { BaseChainIcon, UsdcIcon } from './CryptoIcons';

export function FastSettlementSection() {
  return (
    <section className="py-24 bg-[#FFFFFF] dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        {/* Settlement Architecture Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left: Bullets */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-brand-blue bg-brand-blue/10 dark:text-brand-cyan dark:bg-brand-cyan/15">
              <span>Instant Settlement</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF] leading-tight">
              Direct on-chain settlement without multi-day delays or rolling reserves
            </h2>
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                <span className="text-base text-light-text-body dark:text-dark-text-secondary leading-snug">
                  Funds land directly in your merchant receiving address in under 1.2 seconds upon customer tap.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                <span className="text-base text-light-text-body dark:text-dark-text-secondary leading-snug">
                  100% native USDC on Base: dollar-backed stability with zero crypto market volatility risk.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                <span className="text-base text-light-text-body dark:text-dark-text-secondary leading-snug">
                  No rolling reserves, no frozen payout holds, and no surprise chargeback clawbacks.
                </span>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline"
              >
                See how it works
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Right: Diagram */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-[#F7F8FC] dark:bg-dark-surface rounded-2xl p-8 border border-light-border dark:border-white/10 shadow-sm flex flex-col items-center space-y-6">
              {/* Box 1: Customer Card Tap */}
              <div className="w-full flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm">
                <div className="p-2 rounded-lg bg-brand-blue text-white shadow-sm">
                  <Radio className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-wider uppercase text-light-text-muted dark:text-dark-text-muted">
                    COUNTER CHECKOUT
                  </div>
                  <div className="text-sm font-bold text-light-text-primary dark:text-white">
                    Customer NFC Smart Card / QR Tap
                  </div>
                </div>
              </div>

              {/* Dotted Arrow with Convert Pill */}
              <div className="flex flex-col items-center">
                <div className="h-6 border-l-2 border-dashed border-brand-blue/40 dark:border-brand-cyan/40" />
                <div className="my-1 px-3 py-1 rounded-full bg-light-soft dark:bg-[#142443] border border-light-border dark:border-white/10 flex items-center gap-1.5 text-[11px] font-mono font-bold text-brand-blue dark:text-brand-cyan">
                  <Zap className="w-3 h-3" />
                  <span>BASE L2 EXECUTION (&lt; 1.2S)</span>
                </div>
                <div className="h-6 border-l-2 border-dashed border-brand-blue/40 dark:border-brand-cyan/40" />
              </div>

              {/* Box 2: Merchant Settlement Address */}
              <div className="w-full flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm">
                <div className="p-2 rounded-lg bg-emerald-500 text-white shadow-sm">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-wider uppercase text-light-text-muted dark:text-dark-text-muted">
                    INSTANT DEPOSIT
                  </div>
                  <div className="text-sm font-bold text-light-text-primary dark:text-white">
                    Merchant Wallet (Native USDC on Base)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pre-Footer Action Banner */}
        <div className="rounded-2xl p-8 sm:p-14 bg-gradient-to-r from-light-soft via-white to-light-soft dark:from-[#06142F] dark:via-[#09152D] dark:to-[#06142F] border border-brand-blue/20 dark:border-brand-cyan/20 text-center space-y-6 shadow-md">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            Start accepting contactless crypto at your counter
          </h2>
          <p className="text-base sm:text-lg text-light-text-body dark:text-dark-text-secondary max-w-2xl mx-auto leading-relaxed">
            Equip your cashiers with the ESP32 countertop hardware terminal or launch the web
            Virtual POS in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-xl text-base font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover transition-all shadow-md active:scale-[0.98]"
            >
              Launch Console
            </a>
            <a
              href="https://paidx.cc/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-xl text-base font-semibold text-[#303747] dark:text-[#F5F8FF] border border-light-border dark:border-white/20 bg-white dark:bg-dark-elevated hover:bg-light-soft dark:hover:bg-dark-alt transition-all"
            >
              Explore Documentation
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
