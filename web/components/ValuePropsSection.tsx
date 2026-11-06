'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Radio,
  CreditCard,
  Zap,
  Cpu,
  Coins,
  Lock,
  ArrowLeft,
  Copy,
} from 'lucide-react';

export function ValuePropsSection() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const paymentUri = 'ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453?value=8500000';
  const displayUri = 'https://pay.paidx.cc/i/k15oSzQ8XpD5m3n...';
  const CONST_TIME_LEFT = '13:51';

  useEffect(() => {
    QRCode.toDataURL(paymentUri, {
      width: 320,
      margin: 1,
      color: {
        dark: '#080808',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
  }, []);

  // 6 existing benefits preserved exactly in wording and order
  const benefits = [
    'Contactless NFC tap-to-pay with physical smart cards.',
    'Sub-second transaction finality (< 1.2s) powered by Base Layer-2.',
    'Zero gas fees for shoppers—fully sponsored via Account Abstraction paymasters.',
    'Pre-authorized session keys with daily spend limits (no phone unlock needed).',
    'Instant merchant settlement in native USDC with zero volatility risk.',
    'Dual terminal flexibility: Turnkey ESP32 hardware terminal or instant mobile web POS.',
  ];

  const whyCards = [
    {
      icon: Radio,
      title: 'Sub-Second Tap & Go',
      desc: 'Customers simply tap their physical PaidX NFC card against the countertop terminal. Faster than traditional EMV chip cards with zero cashier delays.',
      color: 'bg-blue-500/10 text-brand-blue dark:text-brand-cyan',
    },
    {
      icon: CreditCard,
      title: 'Smart Account Session Keys',
      desc: 'Built on ERC-4337. Shoppers configure daily spending limits (e.g. $25/day), allowing micro-purchases like chai or lunch without unlocking phones or signing popups.',
      color: 'bg-indigo-500/10 text-brand-violet dark:text-brand-violet',
    },
    {
      icon: Zap,
      title: 'Zero Gas Tolls for Shoppers',
      desc: 'The integrated Base Paymaster sponsors transaction gas behind the scenes, making small everyday retail transactions economically frictionless.',
      color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    {
      icon: Cpu,
      title: 'ESP32 Hardware Terminal',
      desc: 'Custom countertop hardware with 2.8" SPI TFT display, PN532 NFC reader, touch controls, and Wi-Fi sync directly to your merchant portal.',
      color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    },
    {
      icon: Coins,
      title: 'Instant USDC Settlement',
      desc: 'Merchants receive native USDC on Base directly into their self-custody smart account or wallet. No 3-day bank settlement delays or merchant reserve holdbacks.',
      color: 'bg-cyan-500/10 text-brand-cyan dark:text-brand-cyan',
    },
    {
      icon: Lock,
      title: 'Zero Chargeback Fraud',
      desc: 'Every purchase achieves cryptographic finality on Base L2 with verifiable on-chain receipts, permanently ending credit card chargeback clawbacks.',
      color: 'bg-rose-500/10 text-brand-coral dark:text-brand-coral',
    },
  ];

  return (
    <section id="why-paidx" className="py-20 md:py-24 bg-[#FFFFFF] dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        
        {/* Large Horizontal Split-Panel Container (faithfully matched to Image 1 / image04.png) */}
        <div className="rounded-[28px] sm:rounded-[32px] border border-[#E2E6F0] dark:border-white/10 overflow-hidden shadow-sm bg-white dark:bg-[#07132B]">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch">
            
            {/* Left Panel: Soft Lavender Background (#ECEFFD) with Centered Checkout Illustration & Floating Pills */}
            <div className="bg-[#ECEFFD] dark:bg-[#0C1838] p-6 sm:p-10 lg:p-12 flex items-center justify-center relative min-h-[480px] lg:min-h-[520px]">
              <div className="relative w-full max-w-[320px] py-4 select-none flex items-center justify-center">
                
                {/* 1. Top-Left Floating Pill: Customer Wallet (matches Image 1 BitPay Wallet pill) */}
                <div className="absolute -left-3 sm:-left-7 top-6 sm:top-8 z-20 bg-white dark:bg-[#101F3B] rounded-full border border-gray-100 dark:border-white/10 shadow-[0_8px_25px_rgba(0,0,0,0.09)] px-3 sm:px-3.5 py-1.5 sm:py-2 flex items-center gap-2.5 transition-transform hover:-translate-y-0.5">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#2448F5] flex items-center justify-center text-white shrink-0 shadow-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3 sm:w-3.5 sm:h-3.5 lucide lucide-wallet preview-icon"
                    >
                      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
                      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-normal leading-tight">
                      From
                    </span>
                    <span className="text-[11px] sm:text-xs font-semibold text-gray-900 dark:text-white block leading-tight whitespace-nowrap">
                      Customer Wallet
                    </span>
                  </div>
                </div>

                {/* 2. Center Tall Checkout Card: Recreated from Image 1 */}
                <div className="w-[260px] sm:w-[275px] bg-white dark:bg-[#0D1A34] rounded-2xl border border-[#E5E7EB] dark:border-white/15 shadow-[0_20px_45px_-10px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.6)] p-3.5 sm:p-4 z-10 relative">
                  
                  {/* Top Bar: Back arrow, Centered Title, Right Logo */}
                  <div className="flex items-center justify-between pb-2">
                    <div
                      className="p-1 -ml-1 text-gray-500 dark:text-gray-400 cursor-default select-none"
                      aria-hidden="true"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-semibold text-[#111827] dark:text-white tracking-tight">
                      PaidX
                    </span>
                    <div className="w-5 h-5 rounded-full overflow-hidden shadow-sm flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/logo-02.png"
                        alt="PaidX Logo"
                        className="w-full h-full object-cover rounded-full"
                      />
                    </div>
                  </div>

                  {/* Royal Blue Accent Indicator Line */}
                  <div className="h-[2px] bg-[#2448F5] w-full rounded-full mb-3" />

                  {/* QR Code Container */}
                  <div className="rounded-xl border border-[#E5E7EB] dark:border-white/10 p-2.5 bg-white dark:bg-[#081224] flex items-center justify-center relative mb-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrDataUrl}
                        alt="PaidX Dynamic Checkout QR"
                        className="w-36 h-36 sm:w-38 sm:h-38 object-contain rounded-md"
                      />
                    ) : (
                      <div className="w-36 h-36 sm:w-38 sm:h-38 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-md" />
                    )}

                    {/* Center Circular Badge inside QR */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shadow-md border-2 border-white dark:border-[#081224] bg-white flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/logo-02.png"
                          alt="PaidX Logo"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Payment URL Input / Copy Box */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-[8px] border border-[#E5E7EB] dark:border-white/10 bg-[#FAFAFA] dark:bg-[#081224] text-[10px] font-mono text-[#475467] dark:text-[#A9B9D5] mb-2.5 select-none">
                    <span className="truncate max-w-[170px]">{displayUri}</span>
                    <div
                      className="p-1 text-gray-400 dark:text-gray-500 cursor-default select-none"
                      title="Payment Link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Metadata Rows: Time Left & Total Price */}
                  <div className="border-t border-[#F0F2F5] dark:border-white/10 pt-2 space-y-1 text-xs">
                    <div className="flex justify-between items-center text-[#6B7280] dark:text-[#94A3B8]">
                      <span className="text-[11px]">Time Left</span>
                      <span className="font-mono text-xs font-medium text-[#111827] dark:text-white">
                        {CONST_TIME_LEFT}
                      </span>
                    </div>
                    <div className="border-t border-[#F0F2F5] dark:border-white/5 my-0.5" />
                    <div className="flex justify-between items-center text-[#6B7280] dark:text-[#94A3B8]">
                      <span className="text-[11px]">Total Price</span>
                      <span className="font-semibold text-xs text-[#111827] dark:text-white">
                        $8.50 USDC
                      </span>
                    </div>
                  </div>

                  {/* Action CTA: Pay in Wallet with Royal Blue Border */}
                  <div
                    className="mt-3 w-full py-2.5 rounded-[8px] border border-[#2448F5] text-[#2448F5] bg-white dark:bg-transparent dark:border-[#5B8EFF] dark:text-[#5B8EFF] text-center text-xs font-semibold tracking-wide block shadow-sm cursor-default select-none"
                  >
                    Pay in Wallet
                  </div>
                </div>

                {/* 3. Bottom-Right Floating Pill: Merchant Receiving Address (matches Image 1 Merchant Account pill) */}
                <div className="absolute -right-3 sm:-right-7 bottom-24 sm:bottom-28 z-20 bg-white dark:bg-[#101F3B] rounded-full border border-gray-100 dark:border-white/10 shadow-[0_8px_25px_rgba(0,0,0,0.09)] px-3 sm:px-3.5 py-1.5 sm:py-2 flex items-center gap-2.5 transition-transform hover:-translate-y-0.5">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-[#142C65] dark:bg-[#1E3A8A] flex items-center justify-center text-white shrink-0 shadow-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#38BDF8] lucide lucide-building-complex preview-icon"
                    >
                      <path d="M10 12h4" />
                      <path d="M10 8h4" />
                      <path d="M14 21v-3a2 2 0 0 0-4 0v3" />
                      <path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
                      <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-normal leading-tight">
                      To
                    </span>
                    <span className="text-[11px] sm:text-xs font-semibold text-gray-900 dark:text-white block leading-tight whitespace-nowrap">
                      Merchant Receiving Address
                    </span>
                    <span className="text-[9px] font-mono text-[#2448F5] dark:text-[#38BDF8] block leading-tight">
                      USDC on Base
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Right Panel: Pure White Background (#FFFFFF) with Restrained Heading & Square Checkboxes */}
            <div className="bg-white dark:bg-[#07132B] p-7 sm:p-10 lg:p-14 flex flex-col justify-center">
              
              {/* Heading: Medium weight, ~34-36px desktop, line-height 1.3 */}
              <h2 className="font-archivo font-medium text-2xl sm:text-3xl lg:text-[34px] text-[#080808] dark:text-[#F5F8FF] leading-[1.3] tracking-[-0.015em] mb-7 sm:mb-8">
                Designed for high-speed retail checkout counters
              </h2>

              {/* Checklist Items: Small square checkbox with rounded corners, blue border, blue checkmark */}
              <div className="space-y-4 sm:space-y-4.5">
                {benefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-start gap-3.5 group">
                    {/* Square Checkbox with rounded corners matching Image 1 */}
                    <div className="w-5 h-5 rounded-[5px] border border-[#2448F5] dark:border-[#3B82F6] flex items-center justify-center shrink-0 mt-0.5 bg-white dark:bg-[#07132B] transition-colors">
                      <Check className="w-3.5 h-3.5 text-[#2448F5] dark:text-[#3B82F6]" strokeWidth={2.5} />
                    </div>
                    {/* Benefit text: Muted dark blue-grey, regular weight */}
                    <span className="font-archivo text-[15px] sm:text-[16px] text-[#475467] dark:text-[#A9B9D5] leading-[1.5]">
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>

            </div>

          </div>
        </div>

        {/* 6-Card Grid: "Why businesses choose PaidX for in-store payments" (Redesigned to match Image 06/07) */}
        <div className="space-y-12 sm:space-y-16">
          {/* Section Heading: Elegant, lightweight, centered */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h2 className="font-archivo font-normal text-3xl sm:text-4xl lg:text-[42px] text-[#111111] dark:text-[#F5F8FF] leading-[1.2] tracking-[-0.015em]">
              Why businesses choose PaidX for in-store payments
            </h2>
            <p className="font-archivo text-base sm:text-lg lg:text-[19px] text-[#334155] dark:text-[#A9B9D5] leading-[1.5] max-w-2xl mx-auto">
              Everything physical coffee shops, retail stores, and pop-up merchants need to accept
              crypto with zero friction.
            </p>
          </div>

          {/* 3-column, 2-row desktop grid with soft lavender-blue (#ECEEFF) cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7 lg:gap-8">
            {whyCards.map((card, idx) => {
              const IconComp = card.icon;
              return (
                <div
                  key={idx}
                  className="rounded-[28px] sm:rounded-[32px] p-8 sm:p-9 lg:p-10 bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 transition-colors duration-200 h-full flex flex-col justify-start"
                >
                  {/* Icon inside small circular container (48-56px, subtle light background, blue icon) */}
                  <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#DBE2FC] dark:bg-white/10 flex items-center justify-center shrink-0">
                    <IconComp className="w-6 h-6 text-[#2045E8] dark:text-[#5B8EFF]" strokeWidth={2} />
                  </div>

                  {/* Card heading: medium font weight, ~28-32px desktop */}
                  <h3 className="font-archivo font-medium text-2xl sm:text-[28px] lg:text-[30px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em] mt-6 sm:mt-7 mb-3 sm:mb-3.5">
                    {card.title}
                  </h3>

                  {/* Card description: ~18-20px, comfortable line height */}
                  <p className="font-archivo text-[16px] sm:text-[17px] lg:text-[18px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
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
