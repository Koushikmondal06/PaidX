'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { BaseChainIcon, UsdcIcon } from './CryptoIcons';

export function HeroSection() {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(899); // 14:59 in seconds

  const paymentUri = 'ethereum:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913@8453?value=135000000';

  useEffect(() => {
    // Generate authentic QR code data URL
    QRCode.toDataURL(paymentUri, {
      width: 280,
      margin: 1,
      color: {
        dark: '#06142F',
        light: '#FFFFFF',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 900));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(paymentUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden transition-colors duration-300">
      {/* Background container for Dark Mode using blue-gradient-waves.png */}
      <div className="absolute inset-0 hidden dark:block hero-dark-bg opacity-90 pointer-events-none" />
      <div className="absolute inset-0 hidden dark:block bg-gradient-to-b from-[#050B1B]/40 via-transparent to-[#050B1B] pointer-events-none" />

      {/* Background container for Light Mode */}
      <div className="absolute inset-0 dark:hidden bg-gradient-to-b from-[#FFFFFF] via-[#F8F9FE] to-[#FFFFFF] pointer-events-none" />
      <div className="absolute -top-40 right-0 w-[500px] h-[500px] bg-brand-blue/5 rounded-full blur-3xl pointer-events-none dark:hidden" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Hero Text & CTAs */}
          <div className="lg:col-span-6 space-y-6 text-left">
            {/* Top Announcement Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border border-brand-blue/20 bg-brand-blue/5 text-brand-blue dark:border-brand-cyan/30 dark:bg-brand-cyan/10 dark:text-brand-cyan shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-brand-blue dark:text-brand-cyan" />
              <span>Next-Gen Crypto Point of Sale • Powered by Base</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight text-[#090B12] dark:text-[#F5F8FF] leading-[1.12]">
              Accept crypto payments in-store with crypto point-of-sale systems
            </h1>

            {/* Subtext */}
            <p className="text-lg sm:text-xl text-[#303747] dark:text-[#A9B9D5] leading-relaxed max-w-xl">
              Accept Bitcoin, Ethereum, stablecoins like USDC, and other crypto as payment at your
              brick-and-mortar store. PaidX makes it easy to accept crypto in-person with QR-based
              checkout and fiat settlement straight to your bank accounts.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <a
                href="https://console.paidx.cc"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl text-base font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover dark:bg-brand-blue dark:hover:bg-blue-600 transition-all shadow-md hover:shadow-brand-blue/30 active:scale-[0.98] group"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl text-base font-semibold text-[#303747] dark:text-[#F5F8FF] border border-light-border dark:border-white/20 bg-white/80 dark:bg-dark-elevated/60 hover:bg-light-soft dark:hover:bg-dark-alt transition-all shadow-sm"
              >
                Explore Terminals
              </a>
            </div>

            {/* Micro value props */}
            <div className="pt-4 flex flex-wrap items-center gap-6 text-xs text-light-text-secondary dark:text-dark-text-muted font-medium">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Zero volatility guarantee</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BaseChainIcon size={16} />
                <span>Sub-second Base L2 settlement</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-coral animate-ping" />
                <span>Zero chargeback risk</span>
              </div>
            </div>
          </div>

          {/* Right Column: Reference Visual Representation (Multi-layered POS Mockup) */}
          <div className="lg:col-span-6 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[500px]">
              {/* Surrounding Ambient Container */}
              <div className="p-4 sm:p-7 rounded-2xl bg-[#F0F2FF] dark:bg-dark-surface/90 border border-brand-blue/15 dark:border-brand-cyan/20 shadow-xl dark:shadow-glow-blue transition-all">
                <div className="relative">
                  {/* Underneath Card: Order Summary */}
                  <div className="w-[88%] mx-auto bg-white dark:bg-[#101F3B] rounded-xl p-5 border border-light-border dark:border-white/10 shadow-sm opacity-90 mb-[-120px] transition-all">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/10">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center font-bold text-xs">
                          ☕
                        </div>
                        <span className="text-xs font-semibold text-light-text-primary dark:text-white">
                          Blue Bottle Coffee Co.
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-light-text-secondary dark:text-dark-text-muted">
                        #POS-8429
                      </span>
                    </div>

                    <div className="pt-3 pb-8 space-y-2 text-xs text-light-text-body dark:text-dark-text-secondary">
                      <div className="flex justify-between">
                        <span>Artisan Chai Latte x 2</span>
                        <span className="font-medium text-light-text-primary dark:text-white">$120.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cardamom Bun x 1</span>
                        <span className="font-medium text-light-text-primary dark:text-white">$15.00</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-100 dark:border-white/5 font-semibold text-sm text-light-text-primary dark:text-white">
                        <span>Total Due</span>
                        <span className="text-brand-blue dark:text-brand-cyan">$135.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Foreground Card: PaidX Dynamic QR Checkout Modal */}
                  <div className="relative z-10 bg-white dark:bg-[#0E1A34] rounded-2xl p-6 border border-light-border dark:border-brand-cyan/30 shadow-2xl transition-all">
                    {/* Modal Top Bar */}
                    <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-white/10">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/logo.svg"
                          alt="PaidX Logo"
                          className="w-6 h-6 rounded-[22.5%] shadow-sm"
                        />
                        <span className="font-bold text-sm tracking-tight text-[#090B12] dark:text-white">
                          PaidX Checkout
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700/50 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Ready to scan</span>
                      </div>
                    </div>

                    {/* QR Code Presentation Box */}
                    <div className="my-5 flex flex-col items-center">
                      <div className="relative p-3.5 bg-white rounded-xl border border-gray-200 dark:border-brand-cyan/40 shadow-inner group">
                        {qrDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={qrDataUrl}
                            alt="PaidX Dynamic Payment QR"
                            className="w-52 h-52 object-contain rounded-lg"
                          />
                        ) : (
                          <div className="w-52 h-52 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-lg" />
                        )}
                        {/* Center Coin Badge inside QR */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="p-1.5 bg-white rounded-full shadow-md border border-gray-200">
                            <BaseChainIcon size={26} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-xs text-light-text-secondary dark:text-dark-text-muted">
                        <UsdcIcon size={14} />
                        <span>USDC on Base • Scan with any Web3 wallet</span>
                      </div>
                    </div>

                    {/* Copyable Payment Link Input */}
                    <div className="relative flex items-center mb-4">
                      <input
                        type="text"
                        readOnly
                        value={paymentUri}
                        className="w-full text-xs font-mono py-2 pl-3 pr-10 rounded-lg bg-light-secondary dark:bg-[#071022] border border-light-border dark:border-white/10 text-light-text-secondary dark:text-dark-text-secondary focus:outline-none"
                      />
                      <button
                        onClick={handleCopy}
                        className="absolute right-1.5 p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-white/10 text-light-text-secondary dark:text-dark-text-muted transition-colors"
                        title="Copy payment URI"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Timer & Total Price Row */}
                    <div className="flex items-center justify-between py-2 text-xs border-t border-gray-100 dark:border-white/10">
                      <div className="flex items-center gap-1.5 text-light-text-secondary dark:text-dark-text-muted">
                        <span>Time Left</span>
                        <span className="font-mono font-semibold text-brand-coral bg-brand-coral/10 px-2 py-0.5 rounded">
                          {formatTimer(timeLeft)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-light-text-muted dark:text-dark-text-muted mr-2">Total Price</span>
                        <span className="font-bold text-base text-[#090B12] dark:text-white">$135.00 USDC</span>
                      </div>
                    </div>

                    {/* Direct Wallet Action */}
                    <a
                      href={paymentUri}
                      className="mt-4 w-full py-3 rounded-xl border border-brand-blue text-brand-blue hover:bg-brand-blue hover:text-white dark:border-brand-cyan dark:text-brand-cyan dark:hover:bg-brand-cyan dark:hover:text-[#050B1B] text-center text-sm font-semibold transition-all duration-200 block shadow-sm"
                    >
                      Pay in Wallet
                    </a>
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
