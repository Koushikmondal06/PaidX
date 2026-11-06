'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Copy, ArrowRight, ArrowLeft } from 'lucide-react';

export function HeroSection() {
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

  return (
    <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden bg-white dark:bg-[#050B1B] transition-colors duration-300">
      {/* Dark Mode subtle background graphic */}
      <div className="absolute inset-0 hidden dark:block hero-dark-bg opacity-90 pointer-events-none" />
      <div className="absolute inset-0 hidden dark:block bg-gradient-to-b from-[#050B1B]/40 via-transparent to-[#050B1B] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          {/* Left Column: Hero Typography & CTAs (strictly matched to Image 1) */}
          <div className="lg:col-span-6 space-y-6 text-left">
            {/* Main Headline - Restrained, clean Archivo font (matched to Image 1) */}
            <h1 className="font-archivo font-bold text-3xl sm:text-4xl lg:text-[45px] text-[#080808] dark:text-[#F5F8FF] leading-[1.14] tracking-[-0.015em] max-w-[540px]">
              What if you could buy a cup of chai with crypto as easily as tapping a card?
            </h1>

            {/* Subtext - Archivo regular, dark muted blue-grey (matched to Image 1) */}
            <p className="font-archivo text-[17px] sm:text-[18px] text-[#475467] dark:text-[#A9B9D5] leading-[1.6] max-w-[510px]">
              PaidX brings real-world crypto payments to physical retail counters. Tap a physical
              NFC card or scan a dynamic QR code for sub-second, zero-gas checkout on Base—settled
              instantly in native USDC.
            </p>

            {/* CTA Buttons - Image 1 styling: strong royal blue primary, white with blue border secondary */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              <a
                href="https://console.paidx.cc"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-[8px] text-[15px] font-medium text-white bg-[#1749F5] hover:bg-[#113AC8] transition-all shadow-sm active:scale-[0.99] group"
              >
                Launch Console
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-[8px] text-[15px] font-medium text-[#1749F5] dark:text-[#5B8EFF] bg-white dark:bg-transparent border border-[#1749F5] dark:border-[#5B8EFF] hover:bg-blue-50/60 dark:hover:bg-white/5 transition-all shadow-sm active:scale-[0.99]"
              >
                Explore ESP32 Terminal
              </a>
            </div>
          </div>

          {/* Right Column: Layered Miniature Crypto Checkout Illustration (matched to Image 1) */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end">
            {/* Outer Illustration Container: Neutral Light Grey, Rounded-28px, Generous Internal Spacing */}
            <div className="w-full max-w-[530px] bg-[#F3F5F6] dark:bg-[#09152D] border border-[#E5E7EB] dark:border-white/10 rounded-[28px] p-6 sm:p-8 lg:p-10 shadow-sm flex items-center justify-center min-h-[520px] sm:min-h-[550px]">
              <div className="relative w-full h-[415px] sm:h-[425px] max-w-[440px] select-none">
                
                {/* 1. Background Payment Card: Merchant Order Summary (sits behind, shifted left and aligned vertically like Image 1) */}
                <div className="absolute left-0 top-[100px] sm:top-[105px] w-[66%] sm:w-[280px] bg-white dark:bg-[#101F3B] rounded-2xl border border-[#E5E7EB] dark:border-white/10 shadow-sm p-3.5 sm:p-4 z-10 transition-transform">
                  {/* Merchant Top Header */}
                  <div className="flex items-center gap-2 pb-2.5 border-b border-[#F0F2F5] dark:border-white/10">
                    <div className="w-5 h-5 rounded-full bg-[#E5E7EB] dark:bg-white/20 flex items-center justify-center text-gray-700 dark:text-gray-200">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-3 h-3 lucide lucide-coffee preview-icon"
                      >
                        <path d="M10 2v2" />
                        <path d="M14 2v2" />
                        <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
                        <path d="M6 2v2" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-[#111827] dark:text-white truncate">
                      Corner Chai Bar
                    </span>
                  </div>

                  {/* Order Summary Heading */}
                  <div className="pt-2.5 pb-1.5">
                    <h4 className="text-sm font-bold text-[#111827] dark:text-white">
                      Order Summary
                    </h4>
                  </div>

                  {/* Pricing Items with clean horizontal dividers */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-[#F0F2F5] dark:border-white/5">
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">Subtotal</span>
                      <span className="font-medium text-[#111827] dark:text-white">$8.00</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-[#F0F2F5] dark:border-white/5">
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">Shipping</span>
                      <span className="font-medium text-[#111827] dark:text-white">—</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-[#F0F2F5] dark:border-white/5">
                      <span className="text-[#6B7280] dark:text-[#94A3B8]">Tax</span>
                      <span className="font-medium text-[#111827] dark:text-white">$0.50</span>
                    </div>
                    <div className="flex justify-between items-center py-1 font-bold text-[#111827] dark:text-white">
                      <span>Total</span>
                      <span>$8.50</span>
                    </div>
                  </div>

                  {/* Bottom Merchant Action: Navy blue button matching Image 1 */}
                  <div className="pt-2.5">
                    <div
                      className="w-auto px-3.5 py-2 rounded-[8px] bg-[#142C65] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm cursor-default select-none"
                    >
                      <span className="text-gray-200 font-normal">Pay with</span>
                      <span className="font-bold tracking-tight text-white">PaidX</span>
                    </div>
                  </div>
                </div>

                {/* 2. Foreground Checkout Card: BitPay-style PaidX Checkout Interface (overlaps toward right) */}
                <div className="absolute right-0 top-0 w-[72%] sm:w-[280px] bg-white dark:bg-[#0D1A34] rounded-2xl border border-[#E5E7EB] dark:border-white/15 shadow-[0_20px_45px_-10px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_20px_45px_-10px_rgba(0,0,0,0.6)] p-3.5 sm:p-4 z-20 transition-transform">
                  
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
                        src="/logo.png"
                        alt="PaidX Logo"
                        className="w-full h-full object-cover rounded-full"
                      />
                    </div>
                  </div>

                  {/* Blue accent indicator line under header (matched to Image 1) */}
                  <div className="h-[2px] bg-[#1749F5] w-full rounded-full mb-3" />

                  {/* Dynamic QR Code in Soft Rounded Inner Container */}
                  <div className="rounded-xl border border-[#E5E7EB] dark:border-white/10 p-2.5 bg-white dark:bg-[#081224] flex items-center justify-center relative mb-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
                    {qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={qrDataUrl}
                        alt="PaidX Dynamic Checkout QR"
                        className="w-36 h-36 sm:w-40 sm:h-40 object-contain rounded-md"
                      />
                    ) : (
                      <div className="w-36 h-36 sm:w-40 sm:h-40 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-md" />
                    )}

                    {/* Center Circular Badge inside QR */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shadow-md border-2 border-white dark:border-[#081224] bg-white flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/logo.png"
                          alt="PaidX Logo"
                          className="w-full h-full object-cover rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Payment URL Input / Copy Box */}
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-[8px] border border-[#E5E7EB] dark:border-white/10 bg-[#FAFAFA] dark:bg-[#081224] text-[10px] font-mono text-[#475467] dark:text-[#A9B9D5] mb-2.5 select-none">
                    <span className="truncate max-w-[180px]">{displayUri}</span>
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

                  {/* Action CTA: Pay in Wallet (Illustration Preview - non-actionable) */}
                  <div
                    className="mt-3 w-full py-2.5 rounded-[8px] border border-[#1749F5] text-[#1749F5] bg-white dark:bg-transparent dark:border-[#5B8EFF] dark:text-[#5B8EFF] text-center text-xs font-semibold tracking-wide block shadow-sm cursor-default select-none"
                  >
                    Pay in Wallet
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
