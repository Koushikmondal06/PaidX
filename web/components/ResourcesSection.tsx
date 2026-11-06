'use client';

import React from 'react';
import { Cpu, ShieldCheck, ArrowRight, Store, CreditCard } from 'lucide-react';

export function ResourcesSection() {
  return (
    <section className="py-24 bg-[#F7F8FC] dark:bg-[#09152D] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
        {/* Top: Learn more about PaidX */}
        <div className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
              Developer & Merchant Guides
            </h2>
            <p className="text-base text-light-text-secondary dark:text-dark-text-secondary">
              Technical documentation and setup guides for the PaidX point-of-sale ecosystem.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Guide Card 1 */}
            <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-brand-blue dark:text-brand-cyan flex items-center justify-center">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-light-text-primary dark:text-white">
                  ESP32 Hardware Terminal Provisioning
                </h3>
                <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                  Step-by-step firmware guide for provisioning ESP32 boards with 2.8&quot; TFT touchscreens,
                  PN532 NFC reader modules, and Wi-Fi pairing to your store.
                </p>
              </div>
              <a
                href="https://paidx.cc/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline"
              >
                Read Hardware Guide
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            {/* Guide Card 2 */}
            <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-2xl font-bold text-light-text-primary dark:text-white">
                  ERC-4337 Session Keys &amp; Tap Limits
                </h3>
                <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                  Understand how Account Abstraction session keys grant scoped daily allowances,
                  enabling instant tap-to-pay without phone confirmation popups.
                </p>
              </div>
              <a
                href="https://paidx.cc/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline"
              >
                Explore Smart Accounts
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Bottom: Dual Solution Portals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
          <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-brand-blue dark:text-brand-cyan">
              <Store className="w-5 h-5" />
              <span className="text-xs font-mono font-bold tracking-wider uppercase">
                For Retail Merchants
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-light-text-primary dark:text-white">
              Turn your counter into a high-speed crypto register
            </h3>
            <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
              Launch our web Virtual POS in seconds on an iPad, or deploy dedicated ESP32 terminals
              with instant USDC settlement on Base L2.
            </p>
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline pt-2"
            >
              Open Merchant Portal
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          <div className="p-8 rounded-2xl bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-brand-violet">
              <CreditCard className="w-5 h-5" />
              <span className="text-xs font-mono font-bold tracking-wider uppercase">
                For Smart Card Holders
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-light-text-primary dark:text-white">
              Carry your crypto in your physical wallet
            </h3>
            <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
              Tap to buy chai, groceries, or dinner. Set daily spending limits, freeze cards anytime,
              and enjoy zero gas fees sponsored by our paymaster.
            </p>
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-brand-blue dark:text-brand-cyan hover:underline pt-2"
            >
              Get Your PaidX Card
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
