'use client';

import React from 'react';
import {
  CheckCircle2,
  Shield,
  Zap,
  TrendingDown,
  Lock,
  Wrench,
  Banknote,
  ArrowRight,
  Wallet,
  Building2,
} from 'lucide-react';
import { BaseChainIcon } from './CryptoIcons';

export function ValuePropsSection() {
  const benefits = [
    'Attract new high-value, crypto-native customers.',
    'Save up to 80% on traditional credit card processing fees.',
    'Reduce fraud and eliminate chargebacks through Base cryptographic finality.',
    'Accept payments from international travelers without foreign exchange friction.',
    'Avoid volatility with instant automatic settlement in fiat or USDC direct to your bank.',
    'No-code integration, instant terminal pairing, no crypto treasury management needed.',
  ];

  const whyCards = [
    {
      icon: Shield,
      title: 'Trusted & Battle-Tested',
      desc: 'Built on Base L2 secured by Ethereum. Over 10M+ on-chain retail transactions processed with cryptographic security and 99.99% uptime.',
      color: 'bg-blue-500/10 text-brand-blue dark:text-brand-cyan',
    },
    {
      icon: TrendingDown,
      title: 'Never hold crypto',
      desc: 'Accept payments in any coin while receiving 100% stable fiat or USDC. Zero exposure to crypto market price fluctuations or accounting complexities.',
      color: 'bg-indigo-500/10 text-brand-violet dark:text-brand-violet',
    },
    {
      icon: Zap,
      title: 'Ultra Low Cost',
      desc: 'Slash processing costs from the standard 3.5% + $0.30 credit card toll down to transparent fractional fees, saving merchants thousands monthly.',
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
      icon: Lock,
      title: 'Regulated & Compliant',
      desc: 'Built with enterprise-ready regulatory compliance. Automated Sanction screening, AML checks, and real-time transaction monitoring.',
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      icon: Wrench,
      title: '60-Second Easy Setup',
      desc: 'Get up and running in minutes with plug-and-play web POS, mobile tablet apps, or our custom ESP32 hardware countertop terminal.',
      color: 'bg-cyan-500/10 text-brand-cyan dark:text-brand-cyan',
    },
    {
      icon: Banknote,
      title: 'Fiat Settlement & Funding',
      desc: 'Settle sales directly into your existing business bank account in 38+ countries in USD, EUR, GBP, or native USDC with next-business-day funding.',
      color: 'bg-rose-500/10 text-brand-coral dark:text-brand-coral',
    },
  ];

  return (
    <section id="why-paidx" className="py-24 bg-[#FFFFFF] dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        {/* Split Feature Row: Interactive Routing Flow vs Checklist */}
        <div className="rounded-2xl p-8 sm:p-12 bg-[#F7F8FC] dark:bg-dark-surface border border-light-border dark:border-white/10 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left: Transaction Flow Graphic matching reference slice 01 */}
            <div className="lg:col-span-6 flex justify-center">
              <div className="w-full max-w-md bg-white dark:bg-[#101F3B] rounded-2xl p-6 sm:p-8 border border-light-border dark:border-white/10 shadow-lg relative overflow-hidden">
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-white/10">
                  <span className="text-xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-muted">
                    End-to-End Payment Flow
                  </span>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[11px] font-medium text-brand-blue dark:text-brand-cyan border border-blue-200 dark:border-blue-800/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-blue dark:bg-brand-cyan animate-ping" />
                    <span>Live routing</span>
                  </div>
                </div>

                {/* Sender Pill */}
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-light-secondary dark:bg-[#09152D] border border-light-border dark:border-white/10">
                  <div className="p-2 rounded-lg bg-brand-blue text-white shadow-sm">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted">From</div>
                    <div className="text-sm font-bold text-light-text-primary dark:text-white">
                      Customer Web3 Wallet (Base, Solana, BTC)
                    </div>
                  </div>
                </div>

                {/* Connecting Pulse Line */}
                <div className="relative py-4 flex flex-col items-center">
                  <div className="w-0.5 h-10 bg-gradient-to-b from-brand-blue via-brand-cyan to-emerald-500" />
                  <div className="my-2 p-1.5 rounded-full bg-light-soft dark:bg-[#142443] border border-brand-blue/30 dark:border-brand-cyan/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/logo.png"
                      alt="PaidX"
                      className="w-5 h-5 rounded-full object-cover shadow-sm"
                    />
                  </div>
                  <div className="w-0.5 h-10 bg-gradient-to-b from-brand-cyan to-emerald-500" />
                  <span className="text-[11px] font-mono text-light-text-secondary dark:text-dark-text-muted mt-1">
                    Instant Conversion & Zero Gas Toll
                  </span>
                </div>

                {/* Receiver Pill */}
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-light-secondary dark:bg-[#09152D] border border-light-border dark:border-white/10">
                  <div className="p-2 rounded-lg bg-emerald-500 text-white shadow-sm">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted">To</div>
                    <div className="text-sm font-bold text-light-text-primary dark:text-white">
                      Merchant Bank Account ($ USD / € EUR)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Bullet Points */}
            <div className="lg:col-span-6 space-y-6">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF] leading-tight">
                Built for leading coins, blockchains, and wallets
              </h2>
              <div className="space-y-4 pt-2">
                {benefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-brand-blue dark:text-brand-cyan shrink-0 mt-0.5" />
                    <span className="text-base text-light-text-body dark:text-dark-text-secondary leading-snug">
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 6-Card Grid: "Why businesses choose PaidX for in-store crypto payments" */}
        <div className="space-y-12">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
              Why businesses choose PaidX for in-store crypto payments
            </h2>
            <p className="text-base sm:text-lg text-light-text-secondary dark:text-dark-text-secondary">
              Everything modern retailers and point-of-sale operators need to accept digital assets
              safely, quickly, and affordably.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {whyCards.map((card, idx) => {
              const IconComp = card.icon;
              return (
                <div
                  key={idx}
                  className="rounded-2xl p-7 bg-[#F7F8FC] dark:bg-dark-surface hover:bg-[#F0F2FF] dark:hover:bg-dark-elevated border border-light-border dark:border-white/10 hover:border-brand-blue/30 dark:hover:border-brand-cyan/40 transition-all duration-300 group shadow-sm hover:shadow-md"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-5 ${card.color}`}>
                    <IconComp className="w-6 h-6 transition-transform group-hover:scale-110" />
                  </div>
                  <h3 className="text-xl font-bold text-light-text-primary dark:text-[#F5F8FF] mb-2">
                    {card.title}
                  </h3>
                  <p className="text-sm text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                    {card.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
