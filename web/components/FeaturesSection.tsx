'use client';

import React from 'react';
import { Smartphone, Cpu, Code2, Wifi, Radio, ArrowRight, ShieldCheck, Check } from 'lucide-react';

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-[#F7F8FC] dark:bg-[#09152D] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-brand-blue bg-brand-blue/10 dark:text-brand-cyan dark:bg-brand-cyan/15">
            <span>Hardware & Software In Harmony</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            Flexible crypto point of sale system integrations for your store
          </h2>
          <p className="text-base sm:text-lg text-light-text-secondary dark:text-dark-text-secondary">
            Choose the form factor that fits your business: a software virtual register on your
            phone or tablet, or an autonomous ESP32 countertop terminal.
          </p>
        </div>

        {/* 2 Primary Integration Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Card 1: Quick Checkout (Virtual Web POS) */}
          <div className="rounded-2xl p-8 sm:p-10 bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-brand-blue dark:text-brand-cyan flex items-center justify-center">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-light-text-primary dark:text-white">
                Quick Checkout Virtual Register
              </h3>
              <p className="text-sm sm:text-base text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                Accept crypto in person using any existing iPhone, Android, iPad, or laptop browser.
                Generate a dynamic QR code for each transaction with zero extra hardware purchase
                and zero coding.
              </p>
              <ul className="space-y-2.5 pt-2 text-sm text-light-text-body dark:text-dark-text-secondary">
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Works on any modern browser in 10 seconds</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Real-time payment audio chime and visual confirmation</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Print receipts or send SMS/email digital invoices</span>
                </li>
              </ul>
            </div>

            {/* Virtual POS UI Mockup */}
            <div className="p-4 rounded-xl bg-light-secondary dark:bg-[#071022] border border-light-border dark:border-white/10 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center text-light-text-muted dark:text-dark-text-muted">
                <span>VIRTUAL POS TERMINAL #01</span>
                <span className="text-emerald-500 font-bold">● ONLINE</span>
              </div>
              <div className="flex justify-between items-center text-base font-bold text-light-text-primary dark:text-white">
                <span>Total Due:</span>
                <span className="text-brand-blue dark:text-brand-cyan">$42.50 USD</span>
              </div>
            </div>
          </div>

          {/* Card 2: Dedicated ESP32 Hardware Terminal */}
          <div className="rounded-2xl p-8 sm:p-10 bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-brand-cyan flex items-center justify-center">
                <Cpu className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-bold text-light-text-primary dark:text-white">
                  PaidX ESP32 Hardware Terminal
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-coral/10 text-brand-coral border border-brand-coral/20">
                  HARDWARE
                </span>
              </div>
              <p className="text-sm sm:text-base text-light-text-body dark:text-dark-text-secondary leading-relaxed">
                Autonomous countertop terminal equipped with an NFC antenna for tap-to-pay, a high-contrast
                OLED QR screen, tactile keypad, and Wi-Fi connectivity. Built for high-volume retail.
              </p>
              <ul className="space-y-2.5 pt-2 text-sm text-light-text-body dark:text-dark-text-secondary">
                <li className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-brand-cyan shrink-0" />
                  <span>Instant NFC card & smartphone tap detection</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Wifi className="w-4 h-4 text-brand-cyan shrink-0" />
                  <span>Direct Wi-Fi telemetry to PaidX merchant dashboard</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-brand-cyan shrink-0" />
                  <span>Hardware-level secure key storage & tamper resistance</span>
                </li>
              </ul>
            </div>

            {/* Hardware Terminal Telemetry Mockup */}
            <div className="p-4 rounded-xl bg-light-secondary dark:bg-[#071022] border border-light-border dark:border-white/10 space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center text-light-text-muted dark:text-dark-text-muted">
                <span>ESP32 TERMINAL ID: ESP-PAIDX-77A</span>
                <span className="text-emerald-500 font-bold">● CONNECTED (WIFI)</span>
              </div>
              <div className="flex justify-between items-center text-sm font-semibold text-light-text-primary dark:text-white">
                <span>NFC State: READY TO TAP</span>
                <span className="text-brand-coral">OLED: DISPLAYING QR</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3rd Complementary: Developer API / SDK */}
        <div className="rounded-2xl p-8 bg-gradient-to-r from-light-soft to-white dark:from-[#0E1A34] dark:to-[#101F3B] border border-light-border dark:border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-brand-blue dark:text-brand-cyan font-bold text-sm">
              <Code2 className="w-5 h-5" />
              <span>Developer-First Infrastructure</span>
            </div>
            <h4 className="text-xl font-bold text-light-text-primary dark:text-white">
              Need custom integrations or POS system webhooks?
            </h4>
            <p className="text-sm text-light-text-secondary dark:text-dark-text-secondary max-w-xl">
              Use our unified REST APIs, Webhook events, and JavaScript/TypeScript SDK to connect PaidX
              with Square, Toast, Clover, or legacy ERP registers.
            </p>
          </div>
          <a
            href="https://paidx.cc/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover transition-colors shrink-0 shadow-sm"
          >
            Read API Docs
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
