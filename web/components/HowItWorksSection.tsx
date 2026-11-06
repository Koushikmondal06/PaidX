'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Check, Radio, Zap } from 'lucide-react';

export function HowItWorksSection() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL('ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453?value=8500000', {
      width: 240,
      margin: 1,
      color: {
        dark: '#080808',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
  }, []);

  const steps = [
    {
      num: '1',
      title: 'Order',
      desc: 'Cashier enters the item or total on the ESP32 terminal keypad or web Virtual POS.',
    },
    {
      num: '2',
      title: 'Tap or Scan',
      desc: 'Shopper taps their physical PaidX NFC card against the reader or scans the dynamic QR.',
    },
    {
      num: '3',
      title: 'Session Key Check',
      desc: 'ERC-4337 smart account verifies daily card limit and executes a gasless Base user operation.',
    },
    {
      num: '4',
      title: 'Instant Settlement',
      desc: 'USDC lands directly in the merchant wallet with on-chain BaseScan receipt and zero chargebacks.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-white dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16 sm:space-y-20">
        
        {/* Section Heading & Subtitle: Lightweight, elegant, centered (matched to Image 12) */}
        <div className="text-center max-w-3xl mx-auto space-y-3 px-2">
          <h2 className="font-archivo font-normal text-2xl sm:text-3xl lg:text-[42px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em] max-w-[280px] sm:max-w-3xl mx-auto">
            How in-store payments work with PaidX
          </h2>
          <p className="font-archivo text-sm sm:text-lg lg:text-[19px] text-[#334155] dark:text-[#A9B9D5] leading-[1.5] max-w-2xl mx-auto">
            Effortless checkout experience for both retail cashiers and smart card shoppers.
          </p>
        </div>

        {/* 4 Steps Laid Out Horizontally on Desktop (grid-cols-1 md:grid-cols-2 lg:grid-cols-4) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-7 lg:gap-8 items-stretch">
          
          {/* STEP 1: Order */}
          <div className="flex flex-col items-center text-center h-full">
            {/* Circular Numbered Indicator (white floating disc with subtle shadow and blue text) */}
            <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-white dark:bg-[#101F3B] shadow-[0_4px_16px_rgba(32,69,232,0.08),0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 dark:border-white/10 flex items-center justify-center text-[#2045E8] dark:text-[#5B8EFF] font-bold text-lg sm:text-xl shrink-0">
              {steps[0].num}
            </div>

            {/* Step Title: Medium font weight, ~28-32px */}
            <h3 className="font-archivo font-normal sm:font-medium text-2xl sm:text-[26px] lg:text-[28px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em] mt-5 mb-2.5">
              {steps[0].title}
            </h3>

            {/* Step Description: ~16-18px dark blue-grey text */}
            <p className="font-archivo text-[15px] sm:text-[16px] text-[#475467] dark:text-[#A9B9D5] leading-[1.55] max-w-[270px] mx-auto mb-8 min-h-[64px] flex items-center justify-center">
              {steps[0].desc}
            </p>

            {/* Visual Card 1 – Order: Invoice / QR Card */}
            <div className="w-full max-w-[290px] sm:max-w-none bg-white dark:bg-[#0D1A34] rounded-2xl border border-[#E5E9F2] dark:border-white/10 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05),0_2px_6px_-1px_rgba(17,24,39,0.02)] p-5 sm:p-6 h-[260px] sm:h-[275px] flex flex-col justify-between items-center select-none transition-all duration-200 hover:shadow-md mt-auto">
              <div className="w-full flex items-center justify-between pb-2 border-b border-[#F0F2F5] dark:border-white/5">
                <span className="font-mono text-[11px] font-semibold text-[#6B7280] dark:text-[#94A3B8] tracking-wider uppercase">
                  CHAI &amp; BAKERY
                </span>
                <span className="font-bold text-sm text-[#111111] dark:text-white">
                  $8.50
                </span>
              </div>

              {/* Dynamic QR Code */}
              <div className="relative w-28 h-28 my-1 flex items-center justify-center p-1 bg-white rounded-xl border border-gray-100 dark:border-white/10 shadow-inner">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="Order Payment QR" className="w-full h-full object-contain rounded-md" />
                ) : (
                  <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse rounded-md" />
                )}
                {/* Center Badge */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-6 h-6 rounded-full overflow-hidden shadow-sm border-2 border-white dark:border-[#0D1A34] bg-white flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/logo-02.png"
                      alt="PaidX Logo"
                      className="w-full h-full object-cover rounded-full"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-1 text-center">
                <span className="text-xs font-semibold text-[#2045E8] dark:text-[#5B8EFF]">
                  Amount Locked in USDC
                </span>
              </div>
            </div>
          </div>

          {/* STEP 2: Tap or Scan */}
          <div className="flex flex-col items-center text-center h-full">
            {/* Circular Numbered Indicator */}
            <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-white dark:bg-[#101F3B] shadow-[0_4px_16px_rgba(32,69,232,0.08),0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 dark:border-white/10 flex items-center justify-center text-[#2045E8] dark:text-[#5B8EFF] font-bold text-lg sm:text-xl shrink-0">
              {steps[1].num}
            </div>

            {/* Step Title */}
            <h3 className="font-archivo font-normal sm:font-medium text-2xl sm:text-[26px] lg:text-[28px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em] mt-5 mb-2.5">
              {steps[1].title}
            </h3>

            {/* Step Description */}
            <p className="font-archivo text-[15px] sm:text-[16px] text-[#475467] dark:text-[#A9B9D5] leading-[1.55] max-w-[270px] mx-auto mb-8 min-h-[64px] flex items-center justify-center">
              {steps[1].desc}
            </p>

            {/* Visual Card 2 – Tap or Scan: NFC Chip Detection */}
            <div className="w-full max-w-[290px] sm:max-w-none bg-white dark:bg-[#0D1A34] rounded-2xl border border-[#E5E9F2] dark:border-white/10 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05),0_2px_6px_-1px_rgba(17,24,39,0.02)] p-5 sm:p-6 h-[260px] sm:h-[275px] flex flex-col justify-center items-center select-none transition-all duration-200 hover:shadow-md mt-auto space-y-4">
              {/* Circular NFC Wave Badge */}
              <div className="w-14 h-14 rounded-full bg-[#1749F5] text-white flex items-center justify-center shadow-md shadow-[#1749F5]/25">
                <Radio className="w-7 h-7" strokeWidth={2.2} />
              </div>

              {/* Status Pill: NFC Chip Detected */}
              <div className="px-4 py-1.5 rounded-full bg-[#ECEFFD] dark:bg-white/10 border border-[#DFE3F8] dark:border-white/10 text-xs font-semibold text-[#111111] dark:text-white flex items-center gap-2 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>NFC Chip Detected</span>
              </div>

              {/* Subtext */}
              <div className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
                Zero phone unlock required
              </div>
            </div>
          </div>

          {/* STEP 3: Session Key Check */}
          <div className="flex flex-col items-center text-center h-full">
            {/* Circular Numbered Indicator */}
            <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-white dark:bg-[#101F3B] shadow-[0_4px_16px_rgba(32,69,232,0.08),0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 dark:border-white/10 flex items-center justify-center text-[#2045E8] dark:text-[#5B8EFF] font-bold text-lg sm:text-xl shrink-0">
              {steps[2].num}
            </div>

            {/* Step Title */}
            <h3 className="font-archivo font-normal sm:font-medium text-2xl sm:text-[26px] lg:text-[28px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em] mt-5 mb-2.5">
              {steps[2].title}
            </h3>

            {/* Step Description */}
            <p className="font-archivo text-[15px] sm:text-[16px] text-[#475467] dark:text-[#A9B9D5] leading-[1.55] max-w-[270px] mx-auto mb-8 min-h-[64px] flex items-center justify-center">
              {steps[2].desc}
            </p>

            {/* Visual Card 3 – Session Key Check: Paymaster Gas & Status Card */}
            <div className="w-full max-w-[290px] sm:max-w-none bg-white dark:bg-[#0D1A34] rounded-2xl border border-[#E5E9F2] dark:border-white/10 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05),0_2px_6px_-1px_rgba(17,24,39,0.02)] p-4 sm:p-5 h-[260px] sm:h-[275px] flex flex-col justify-between items-center select-none transition-all duration-200 hover:shadow-md mt-auto text-left">
              {/* Header Pill */}
              <div className="w-full flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[11px] font-semibold text-[#2045E8] dark:text-[#5B8EFF] border border-blue-200/60 dark:border-blue-800/40">
                <Zap className="w-3.5 h-3.5" />
                <span>Paymaster Sponsoring Gas</span>
              </div>

              {/* Main Metric */}
              <div className="text-center my-1">
                <div className="text-2xl font-bold text-[#111111] dark:text-white tracking-tight">
                  $0.00 Gas Toll
                </div>
              </div>

              {/* Key-Value Details */}
              <div className="w-full rounded-xl bg-[#F8F9FC] dark:bg-[#081224] border border-[#EAEDF5] dark:border-white/5 p-2.5 space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between items-center text-[#6B7280] dark:text-[#94A3B8]">
                  <span>Card Limit</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">$50.00/day</span>
                </div>
                <div className="flex justify-between items-center text-[#6B7280] dark:text-[#94A3B8]">
                  <span>Remaining</span>
                  <span className="font-medium text-[#111827] dark:text-white">$41.50</span>
                </div>
                <div className="flex justify-between items-center text-[#6B7280] dark:text-[#94A3B8]">
                  <span>Execution</span>
                  <span className="font-semibold text-[#2045E8] dark:text-[#5B8EFF]">1.1s Finality</span>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4: Instant Settlement */}
          <div className="flex flex-col items-center text-center h-full">
            {/* Circular Numbered Indicator */}
            <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-white dark:bg-[#101F3B] shadow-[0_4px_16px_rgba(32,69,232,0.08),0_1px_3px_rgba(0,0,0,0.04)] border border-gray-100 dark:border-white/10 flex items-center justify-center text-[#2045E8] dark:text-[#5B8EFF] font-bold text-lg sm:text-xl shrink-0">
              {steps[3].num}
            </div>

            {/* Step Title */}
            <h3 className="font-archivo font-normal sm:font-medium text-2xl sm:text-[26px] lg:text-[28px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em] mt-5 mb-2.5">
              {steps[3].title}
            </h3>

            {/* Step Description */}
            <p className="font-archivo text-[15px] sm:text-[16px] text-[#475467] dark:text-[#A9B9D5] leading-[1.55] max-w-[270px] mx-auto mb-8 min-h-[64px] flex items-center justify-center">
              {steps[3].desc}
            </p>

            {/* Visual Card 4 – Instant Settlement: Success USDC Settlement */}
            <div className="w-full max-w-[290px] sm:max-w-none bg-white dark:bg-[#0D1A34] rounded-2xl border border-[#E5E9F2] dark:border-white/10 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05),0_2px_6px_-1px_rgba(17,24,39,0.02)] p-5 sm:p-6 h-[260px] sm:h-[275px] flex flex-col justify-center items-center select-none transition-all duration-200 hover:shadow-md mt-auto space-y-4">
              {/* Circular Green Checkmark Badge */}
              <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm">
                <Check className="w-7 h-7" strokeWidth={2.5} />
              </div>

              {/* Settlement Pill: +$8.50 USDC Received */}
              <div className="px-4 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 shadow-xs">
                +$8.50 USDC Received
              </div>

              {/* Subtext */}
              <div className="text-xs text-[#6B7280] dark:text-[#94A3B8] flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/base-logo.png"
                  alt="Base"
                  className="w-3.5 h-3.5 object-contain rounded-full shrink-0"
                />
                <span>Tx Verified on BaseScan</span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
