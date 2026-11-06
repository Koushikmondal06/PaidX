'use client';

import React, { useState } from 'react';
import { ArrowRight, Check, Github, Twitter, Linkedin, MessageSquare, LifeBuoy } from 'lucide-react';

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
    <footer className="bg-[#06142F] text-white pt-20 pb-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Support Banner (Slice 08) */}
        <div className="pb-16 border-b border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2 text-brand-cyan text-sm font-bold uppercase tracking-wider">
              <LifeBuoy className="w-4 h-4" />
              <span>Merchant Operations 24/7</span>
            </div>
            <h3 className="text-3xl font-extrabold text-white">We’re here to help</h3>
            <p className="text-sm text-gray-300 leading-relaxed">
              Support is just a few taps away. Get your questions answered by using our help library or
              schedule a live terminal onboarding session with our technical team.
            </p>
          </div>
          <a
            href="https://paidx.cc/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover dark:bg-brand-blue dark:hover:bg-blue-600 transition-all shrink-0 shadow-sm"
          >
            Get Help & Support
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Main Footer Links Columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Info Column */}
          <div className="col-span-2 space-y-4">
            <a href="https://paidx.cc" className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.svg"
                alt="PaidX"
                className="w-8 h-8 rounded-[22.5%] shadow-sm"
              />
              <span className="font-extrabold text-2xl tracking-tight text-white">
                Paid<span className="text-white">X</span>
              </span>
            </a>
            <p className="text-sm text-gray-300 leading-relaxed max-w-sm">
              The in-store crypto payments network for the physical economy. Tap, scan, and settle on
              Base L2 in sub-second speed with zero gas headaches.
            </p>

            {/* Newsletter Subscription */}
            <div className="pt-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-2">
                Subscribe to Merchant Updates
              </span>
              <form onSubmit={handleSubscribe} className="flex max-w-sm">
                <input
                  type="email"
                  required
                  placeholder="Enter work email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-l-xl bg-white/10 border border-white/20 text-xs text-white placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-cyan"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-r-xl bg-brand-blue hover:bg-brand-blue-hover text-xs font-bold text-white transition-colors shrink-0 flex items-center gap-1"
                >
                  {subscribed ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
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
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">For Businesses</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="#features" className="hover:text-brand-cyan transition-colors">
                  In-Store POS
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-brand-cyan transition-colors">
                  Virtual Register
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-brand-cyan transition-colors">
                  ESP32 Terminal
                </a>
              </li>
              <li>
                <a href="#why-paidx" className="hover:text-brand-cyan transition-colors">
                  Fiat Settlement
                </a>
              </li>
              <li>
                <a href="https://console.paidx.cc" className="hover:text-brand-cyan transition-colors">
                  Merchant Console
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Developers */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">Developers</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="https://paidx.cc/docs" className="hover:text-brand-cyan transition-colors">
                  Documentation
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="hover:text-brand-cyan transition-colors">
                  REST APIs
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="hover:text-brand-cyan transition-colors">
                  Webhooks
                </a>
              </li>
              <li>
                <a href="https://basescan.org" target="_blank" rel="noopener noreferrer" className="hover:text-brand-cyan transition-colors">
                  Base L2 Explorer
                </a>
              </li>
              <li>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand-cyan transition-colors">
                  GitHub Repos
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Company & Legal */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300">Company</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li>
                <a href="https://paidx.cc" className="hover:text-brand-cyan transition-colors">
                  About PaidX
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="hover:text-brand-cyan transition-colors">
                  Compliance & KYC
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="hover:text-brand-cyan transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="https://paidx.cc/docs" className="hover:text-brand-cyan transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="https://console.paidx.cc" className="hover:text-brand-cyan transition-colors">
                  Support Desk
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright and legal disclaimer */}
        <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <p>
            © {new Date().getFullYear()} PaidX Network Inc. All rights reserved. Powered by Base L2.
          </p>
          <div className="flex items-center gap-5">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              <Twitter className="w-4 h-4" />
            </a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              <Github className="w-4 h-4" />
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
