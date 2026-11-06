'use client';

import React, { useState } from 'react';
import { ArrowRight, Check, Github, Twitter, Linkedin, LifeBuoy } from 'lucide-react';

export function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setTimeout(() => {
        setSubscribed(false);
        setEmail('');
      }, 4000);
    }
  };

  return (
    <footer className="w-full bg-[#050B1B] text-[#F5F8FF] border-t border-white/10 pt-16 sm:pt-20 pb-12 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 sm:space-y-16">
        {/* Support Banner */}
        <div className="pb-12 sm:pb-16 border-b border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-xl">
            <div className="flex items-center gap-2 text-[#5B8EFF] text-[13px] font-semibold tracking-wider uppercase">
              <LifeBuoy className="w-4 h-4" />
              <span>Merchant Operations 24/7</span>
            </div>
            <h3 className="font-archivo font-medium sm:font-semibold text-2xl sm:text-3xl text-[#F5F8FF] tracking-[-0.01em]">
              We’re here to help
            </h3>
            <p className="font-archivo text-[15px] sm:text-[16px] text-[#94A3B8] leading-relaxed">
              Support is just a few taps away. Get your questions answered by using our help library or
              schedule a live terminal onboarding session with our technical team.
            </p>
          </div>
          <a
            href="https://paidx.cc/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-[8px] text-sm font-medium text-white bg-[#2045E8] hover:bg-[#1a38be] transition-all shrink-0 shadow-sm active:scale-[0.98]"
          >
            Get Help & Support
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Main Footer Links Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Info Column */}
          <div className="sm:col-span-2 space-y-4">
            <a href="https://paidx.cc" className="inline-flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-02.png"
                alt="PaidX"
                className="w-8 h-8 rounded-[8px] shadow-sm object-cover"
              />
              <span className="font-archivo font-extrabold text-2xl tracking-tight text-white">
                PaidX
              </span>
            </a>
            <p className="font-archivo text-[14px] text-[#94A3B8] leading-relaxed max-w-sm">
              The in-store crypto payments network for the physical economy. Tap, scan, and settle on
              Base L2 in sub-second speed with zero gas headaches.
            </p>

            {/* Newsletter Subscription */}
            <div className="pt-2">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-[#94A3B8] block mb-2">
                Subscribe to Merchant Updates
              </span>
              <form onSubmit={handleSubscribe} className="flex w-full max-w-sm min-w-0">
                <input
                  type="email"
                  required
                  placeholder="Enter work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-w-0 px-3.5 py-2.5 rounded-l-[8px] bg-white/5 border border-white/10 text-xs sm:text-sm text-white placeholder:text-[#94A3B8] focus:outline-none focus:border-[#5B8EFF] focus:ring-1 focus:ring-[#5B8EFF] transition-colors"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-r-[8px] bg-[#2045E8] hover:bg-[#1a38be] text-xs sm:text-sm font-medium text-white transition-colors shrink-0 flex items-center gap-1.5"
                >
                  {subscribed ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Done</span>
                    </>
                  ) : (
                    <span>Subscribe</span>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Column 1: For Businesses */}
          <div className="space-y-3.5">
            <h4 className="font-archivo text-[14px] sm:text-[15px] font-semibold text-[#F5F8FF] tracking-wide">
              For Businesses
            </h4>
            <ul className="space-y-2.5 text-[14px]">
              <li>
                <a href="#features" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  In-Store POS
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Virtual Register
                </a>
              </li>
              <li>
                <a href="#features" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  ESP32 Terminal
                </a>
              </li>
              <li>
                <a href="#why-paidx" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  USDC Settlement
                </a>
              </li>
              <li>
                <a href="https://console.paidx.cc" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Merchant Console
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Developers */}
          <div className="space-y-3.5">
            <h4 className="font-archivo text-[14px] sm:text-[15px] font-semibold text-[#F5F8FF] tracking-wide">
              Developers
            </h4>
            <ul className="space-y-2.5 text-[14px]">
              <li>
                <a href="https://paidx.cc/docs" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  REST APIs
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Webhooks
                </a>
              </li>
              <li>
                <a href="https://basescan.org" target="_blank" rel="noopener noreferrer" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Base L2 Explorer
                </a>
              </li>
              <li>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  GitHub Repos
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Company */}
          <div className="space-y-3.5">
            <h4 className="font-archivo text-[14px] sm:text-[15px] font-semibold text-[#F5F8FF] tracking-wide">
              Company
            </h4>
            <ul className="space-y-2.5 text-[14px]">
              <li>
                <a href="https://paidx.cc" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  About PaidX
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Compliance & KYC
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="https://console.paidx.cc" className="text-[#94A3B8] hover:text-[#5B8EFF] transition-colors">
                  Support Desk
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright and legal disclaimer */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[13px] sm:text-[14px] text-[#94A3B8]">
          <p className="font-archivo text-center sm:text-left break-words text-[#94A3B8]">
            © {new Date().getFullYear()} PaidX Network Inc. All rights reserved. Powered by Base L2.
          </p>
          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter"
              className="p-2 rounded-lg text-[#94A3B8] hover:text-[#5B8EFF] hover:bg-white/5 transition-all"
            >
              <Twitter className="w-4 h-4" />
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="p-2 rounded-lg text-[#94A3B8] hover:text-[#5B8EFF] hover:bg-white/5 transition-all"
            >
              <Github className="w-4 h-4" />
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="p-2 rounded-lg text-[#94A3B8] hover:text-[#5B8EFF] hover:bg-white/5 transition-all"
            >
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
