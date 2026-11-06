'use client';

import React from 'react';
import { CheckCircle2, ArrowRight, ArrowDown, Building2, Repeat } from 'lucide-react';
import { BitcoinIcon } from './CryptoIcons';

export function FastSettlementSection() {
  return (
    <section className="py-24 bg-[#FFFFFF] dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        {/* Settlement Architecture Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left: Bullets */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-brand-blue bg-brand-blue/10 dark:text-brand-cyan dark:bg-brand-cyan/15">
              <span>Fast Settlement</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF] leading-tight">
              Get settled in fiat directly to your bank account
            </h2>
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                <span className="text-base text-light-text-body dark:text-dark-text-secondary leading-snug">
                  Receive funds directly to your regular business checking account with no crypto intermediary steps.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                <span className="text-base text-light-text-body dark:text-dark-text-secondary leading-snug">
                  Bank deposits in 38+ countries, settled in US Dollars (USD), Euros (EUR), British Pounds (GBP), and more.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                <span className="text-base text-light-text-body dark:text-dark-text-secondary leading-snug">
                  Choose 100% fiat settlement, 100% USDC stablecoin, or customize a hybrid percentage allocation.
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

          {/* Right: Diagram matching reference slice 06 */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-[#F7F8FC] dark:bg-dark-surface rounded-2xl p-8 border border-light-border dark:border-white/10 shadow-sm flex flex-col items-center space-y-6">
              {/* Box 1: Merchant Account */}
              <div className="w-full flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm">
                <div className="p-1">
                  <BitcoinIcon size={36} />
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-wider uppercase text-light-text-muted dark:text-dark-text-muted">
                    FROM
                  </div>
                  <div className="text-sm font-bold text-light-text-primary dark:text-white">
                    Merchant Account (Crypto Inflows)
                  </div>
                </div>
              </div>

              {/* Dotted Arrow with Convert Pill */}
              <div className="flex flex-col items-center">
                <div className="h-6 border-l-2 border-dashed border-brand-blue/40 dark:border-brand-cyan/40" />
                <div className="my-1 px-3 py-1 rounded-full bg-light-soft dark:bg-[#142443] border border-light-border dark:border-white/10 flex items-center gap-1.5 text-[11px] font-mono font-bold text-brand-blue dark:text-brand-cyan">
                  <Repeat className="w-3 h-3" />
                  <span>CONVERT TO FIAT / USDC</span>
                </div>
                <div className="h-6 border-l-2 border-dashed border-brand-blue/40 dark:border-brand-cyan/40" />
              </div>

              {/* Box 2: Bank Account */}
              <div className="w-full flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-mono font-bold tracking-wider uppercase text-light-text-muted dark:text-dark-text-muted">
                    TO
                  </div>
                  <div className="text-sm font-bold text-light-text-primary dark:text-white">
                    Local Bank Account (Direct ACH / SEPA)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pre-Footer Action Banner matching slice 06 */}
        <div className="rounded-2xl p-8 sm:p-14 bg-gradient-to-r from-light-soft via-white to-light-soft dark:from-[#06142F] dark:via-[#09152D] dark:to-[#06142F] border border-brand-blue/20 dark:border-brand-cyan/20 text-center space-y-6 shadow-md">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            Start accepting crypto at the register
          </h2>
          <p className="text-base sm:text-lg text-light-text-body dark:text-dark-text-secondary max-w-2xl mx-auto leading-relaxed">
            Tap into the new global economy with modern crypto POS systems. PaidX makes it fast,
            compliant, and easy.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-xl text-base font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover transition-all shadow-md active:scale-[0.98]"
            >
              Get Started
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
