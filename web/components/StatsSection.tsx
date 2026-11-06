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
    <section id="stats" className="py-20 md:py-24 bg-white dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14 sm:space-y-16">
        {/* Section Heading & Subtitle (Badge removed completely) */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h2 className="font-archivo font-normal sm:font-medium text-3xl sm:text-4xl lg:text-[42px] text-[#111111] dark:text-[#F5F8FF] leading-[1.2] tracking-[-0.015em]">
            Engineered for physical counter checkout speeds
          </h2>
          <p className="font-archivo text-base sm:text-lg lg:text-[19px] text-[#334155] dark:text-[#A9B9D5] leading-[1.5] max-w-2xl mx-auto">
            Legacy card networks penalize merchants with 3.5% swipe tolls, 3-day delays, and
            chargeback disputes. PaidX delivers instantaneous finality directly on Base L2.
          </p>
        </div>

        {/* 4 Feature Cards: Soft lavender-blue (#ECEEFF) cards with subtle border and 26-28px radius */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
          {stats.map((stat, idx) => {
            const IconComp = stat.icon;
            return (
              <div
                key={idx}
                className="rounded-[26px] sm:rounded-[28px] p-7 sm:p-8 bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 transition-colors duration-200 h-full flex flex-col justify-between"
              >
                <div>
                  {/* Icon at top-left inside small circular background */}
                  <div className="w-12 h-12 rounded-full bg-[#DBE2FC] dark:bg-white/10 flex items-center justify-center shrink-0">
                    <IconComp className="w-6 h-6 text-[#2045E8] dark:text-[#5B8EFF]" strokeWidth={2} />
                  </div>

                  {/* Prominent main metric (~40-44px) */}
                  <div className="font-archivo font-medium text-3xl sm:text-4xl lg:text-[40px] text-[#111111] dark:text-[#F5F8FF] tracking-tight leading-tight mt-5 sm:mt-6">
                    {stat.value}
                  </div>

                  {/* Metric label below with medium font weight */}
                  <div className="font-archivo font-medium text-base sm:text-[17px] text-[#111111] dark:text-[#F5F8FF] mt-1.5">
                    {stat.label}
                  </div>
                </div>

                {/* Subtle divider before description */}
                <div className="pt-4 mt-6 border-t border-[#DFE3F8] dark:border-white/10">
                  <p className="font-archivo text-[15px] sm:text-[16px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
                    {stat.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

