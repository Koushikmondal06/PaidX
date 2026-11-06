'use client';

import React from 'react';
import { BookOpen, FileText, ArrowRight, Store, Globe } from 'lucide-react';

export function ResourcesSection() {
  return (
    <section className="py-24 bg-[#F7F8FC] dark:bg-[#09152D] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
        {/* Top: Learn more about crypto payments */}
        <div className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
              Learn more about crypto payments
            </h2>
            <p className="text-base text-light-text-secondary dark:text-dark-text-secondary">
              Guides, research, and technical reports for merchants navigating digital commerce.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Guide Card 1 */}
            <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-brand-blue dark:text-brand-cyan flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-light-text-primary dark:text-white">
                  50 Questions to Ask Payment Processors
                </h3>
                <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                  Arm yourself with the essential questions to ask when vetting crypto point-of-sale
                  providers, from settlement guarantees to fee structures.
                </p>
              </div>
              <a
                href="https://paidx.cc/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline"
              >
                Read the Merchant Guide
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            {/* Guide Card 2 */}
            <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-light-text-primary dark:text-white">
                  State of Stablecoins 2026 Report
                </h3>
                <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                  Discover the latest retail payment volume data and why brick-and-mortar merchants are
                  adopting USDC on Layer-2 networks to replace credit rails.
                </p>
              </div>
              <a
                href="https://paidx.cc/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline"
              >
                Download the Research Report
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom: Dual Solution Portals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 space-y-4">
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-brand-blue dark:text-brand-cyan">
              Accept Cryptocurrency Payments
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-light-text-primary dark:text-white">
              Receive payments in crypto, settle your way
            </h3>
            <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
              Integrate with web checkout, mobile virtual POS, or countertop ESP32 hardware terminals.
            </p>
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline pt-2"
            >
              Explore In-Store Payments
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 space-y-4">
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-brand-violet">
              Send Crypto Payouts
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-light-text-primary dark:text-white">
              Pay anyone, anywhere, without touching crypto
            </h3>
            <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
              Disburse mass vendor payments, supplier invoices, and contractor rewards globally using
              programmatic rails.
            </p>
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline pt-2"
            >
              Explore Batch Payouts
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
