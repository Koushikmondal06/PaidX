'use client';

import React from 'react';
import { CheckCircle2, ArrowRight, Radio, Zap } from 'lucide-react';

export function FastSettlementSection() {
  return (
    <section id="settlement" className="py-20 md:py-24 bg-white dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20 sm:space-y-24">
        {/* Settlement Architecture Row: 2-Column Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Left Side: Text Content */}
          <div className="lg:col-span-6 space-y-6 sm:space-y-7">
            {/* Main Heading: Medium/semibold font weight, ~36-40px desktop */}
            <h2 className="font-archivo font-medium sm:font-semibold text-2xl sm:text-3xl lg:text-[38px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em]">
              Direct on-chain settlement without multi-day delays or rolling reserves
            </h2>

            {/* Bullet Points */}
            <div className="space-y-4 sm:space-y-4.5 pt-1">
              <div className="flex items-start gap-3.5">
                <CheckCircle2 className="w-5 h-5 text-[#2045E8] dark:text-[#5B8EFF] shrink-0 mt-1" strokeWidth={2} />
                <span className="font-archivo text-[16px] sm:text-[17px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
                  Funds land directly in your merchant receiving address in under 1.2 seconds upon customer tap.
                </span>
              </div>
              <div className="flex items-start gap-3.5">
                <CheckCircle2 className="w-5 h-5 text-[#2045E8] dark:text-[#5B8EFF] shrink-0 mt-1" strokeWidth={2} />
                <span className="font-archivo text-[16px] sm:text-[17px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
                  100% native USDC on Base: dollar-backed stability with zero crypto market volatility risk.
                </span>
              </div>
              <div className="flex items-start gap-3.5">
                <CheckCircle2 className="w-5 h-5 text-[#2045E8] dark:text-[#5B8EFF] shrink-0 mt-1" strokeWidth={2} />
                <span className="font-archivo text-[16px] sm:text-[17px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
                  No rolling reserves, no frozen payout holds, and no surprise chargeback clawbacks.
                </span>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-2">
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 font-archivo font-semibold text-[15px] sm:text-base text-[#2045E8] dark:text-[#5B8EFF] hover:underline group transition-colors"
              >
                <span>See how it works</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>

          {/* Right Side: Settlement Flow Visual */}
          <div className="lg:col-span-6 flex justify-center w-full">
            <div className="w-full max-w-[440px] bg-[#ECEEFF] dark:bg-[#0C1838] rounded-[24px] sm:rounded-[28px] p-6 sm:p-9 border border-[#DFE3F8] dark:border-white/10 flex flex-col items-center space-y-4 sm:space-y-5 shadow-xs transition-colors duration-200">
              
              {/* Top Card: Customer Card Tap */}
              <div className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-[18px] sm:rounded-[22px] bg-white dark:bg-[#101F3B] border border-[#E2E8F0] dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-200">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-[#2045E8] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Radio className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-mono font-semibold tracking-wider uppercase text-[#64748B] dark:text-[#94A3B8]">
                    COUNTER CHECKOUT
                  </div>
                  <div className="text-sm sm:text-[15px] font-archivo font-medium text-[#111111] dark:text-white truncate mt-0.5">
                    Customer NFC Smart Card / QR Tap
                  </div>
                </div>
              </div>

              {/* Middle Connector: Vertical Dotted Line with Base L2 Execution Pill */}
              <div className="flex flex-col items-center">
                <div className="h-6 sm:h-7 border-l-2 border-dashed border-[#2045E8]/35 dark:border-[#5B8EFF]/40" />
                <div className="my-1 px-3.5 py-1.5 rounded-full bg-white dark:bg-[#142443] border border-[#DFE3F8] dark:border-white/10 shadow-xs flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#2045E8] dark:text-[#5B8EFF] select-none">
                  <Zap className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#5B8EFF] fill-[#2045E8] dark:fill-[#5B8EFF]" />
                  <span>BASE L2 EXECUTION (&lt; 1.2S)</span>
                </div>
                <div className="h-6 sm:h-7 border-l-2 border-dashed border-[#2045E8]/35 dark:border-[#5B8EFF]/40" />
              </div>

              {/* Bottom Card: Merchant Wallet Deposit */}
              <div className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-[18px] sm:rounded-[22px] bg-white dark:bg-[#101F3B] border border-[#E2E8F0] dark:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none transition-colors duration-200">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-[#10B981] text-white flex items-center justify-center shrink-0 shadow-sm">
                  {/* Exact requested Wallet SVG */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-5 h-5 sm:w-6 sm:h-6 text-white lucide lucide-wallet preview-icon"
                  >
                    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-mono font-semibold tracking-wider uppercase text-[#64748B] dark:text-[#94A3B8]">
                    INSTANT DEPOSIT
                  </div>
                  <div className="text-sm sm:text-[15px] font-archivo font-medium text-[#111111] dark:text-white truncate mt-0.5">
                    Merchant Wallet (Native USDC on Base)
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Pre-Footer Action Banner */}
        <div className="rounded-[28px] p-8 sm:p-12 lg:p-14 bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 text-center space-y-6 transition-colors duration-200">
          <h2 className="font-archivo font-medium text-2xl sm:text-3xl lg:text-[34px] text-[#111111] dark:text-[#F5F8FF] leading-tight">
            Start accepting contactless crypto at your counter
          </h2>
          <p className="font-archivo text-base sm:text-lg text-[#334155] dark:text-[#A9B9D5] max-w-2xl mx-auto leading-relaxed">
            Equip your cashiers with the ESP32 countertop hardware terminal or launch the web
            Virtual POS in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-[10px] text-base font-medium text-white bg-[#2045E8] hover:bg-[#1635B8] transition-colors shadow-sm"
            >
              Launch Console
            </a>
            <a
              href="https://paidx.cc/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3.5 rounded-[10px] text-base font-medium text-[#111111] dark:text-[#F5F8FF] border border-[#DFE3F8] dark:border-white/20 bg-white dark:bg-[#101F3B] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
              Explore Documentation
            </a>
          </div>
        </div>

      </div>
    </section>
  );
}
