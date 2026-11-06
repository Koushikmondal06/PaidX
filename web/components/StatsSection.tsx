'use client';

import React from 'react';
import { Zap, ShieldCheck, Clock, Radio } from 'lucide-react';

export function StatsSection() {
  const stats = [
    {
      label: 'Settlement Latency',
      value: '< 1.2s',
      desc: 'Sub-second block confirmation on Base Layer 2 for frictionless line-busting.',
      icon: Clock,
    },
    {
      label: 'Shopper Gas Fee',
      value: '$0.00',
      desc: 'Zero gas tolls for customers via Paymaster-sponsored Account Abstraction.',
      icon: Zap,
    },
    {
      label: 'Chargeback Risk',
      value: '0%',
      desc: 'Cryptographic on-chain finality permanently prevents payment clawbacks.',
      icon: ShieldCheck,
    },
    {
      label: 'Contactless Experience',
      value: '1-Tap NFC',
      desc: 'Physical smart card tap with automated daily session spending limits.',
      icon: Radio,
    },
  ];

  return (
    <section className="py-24 bg-[#FFFFFF] dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-brand-blue bg-brand-blue/10 dark:text-brand-cyan dark:bg-brand-cyan/15">
            <span>Built for Real-World Retail</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#090B12] dark:text-[#F5F8FF] tracking-tight">
            Engineered for physical counter checkout speeds
          </h2>
          <p className="text-base sm:text-lg text-light-text-secondary dark:text-dark-text-secondary leading-relaxed">
            Legacy card networks penalize merchants with 3.5% swipe tolls, 3-day delays, and
            chargeback disputes. PaidX delivers instantaneous finality directly on Base L2.
          </p>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, idx) => {
            const IconComp = stat.icon;
            return (
              <div
                key={idx}
                className="rounded-2xl p-7 bg-[#F7F8FC] dark:bg-dark-surface border border-light-border dark:border-white/10 hover:border-brand-blue/30 dark:hover:border-brand-cyan/40 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-brand-blue/10 dark:bg-brand-cyan/15 text-brand-blue dark:text-brand-cyan flex items-center justify-center">
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-black text-light-text-primary dark:text-[#F5F8FF] tracking-tight">
                    {stat.value}
                  </div>
                  <div className="text-sm font-bold text-light-text-primary dark:text-white">
                    {stat.label}
                  </div>
                </div>
                <div className="pt-4 mt-4 border-t border-gray-200/60 dark:border-white/5 text-xs text-light-text-secondary dark:text-dark-text-muted leading-relaxed">
                  {stat.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
