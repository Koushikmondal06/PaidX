'use client';

import React from 'react';
import { Smartphone, Cpu, Wifi, Radio, ArrowRight, ShieldCheck, Check, CreditCard } from 'lucide-react';

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 md:py-24 bg-white dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Section Heading: Elegant, lightweight, centered matching BitPay design */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-[#2045E8] bg-[#DBE2FC] dark:text-brand-cyan dark:bg-brand-cyan/15">
            <span>Hardware & Software In Harmony</span>
          </div>
          <h2 className="font-archivo font-normal text-3xl sm:text-4xl lg:text-[42px] text-[#111111] dark:text-[#F5F8FF] leading-[1.2] tracking-[-0.015em]">
            Flexible point of sale infrastructure for physical retail
          </h2>
          <p className="font-archivo text-base sm:text-lg lg:text-[19px] text-[#334155] dark:text-[#A9B9D5] leading-[1.5] max-w-2xl mx-auto">
            Deploy contactless crypto payments using your choice of form factor: an autonomous
            ESP32 countertop terminal or a browser-based Virtual POS register.
          </p>
        </div>

        {/* 2 Primary Integration Cards in Soft Lavender-Blue (#ECEEFF) with 28-32px rounded corners */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 lg:gap-8">
          
          {/* Card 1: Quick Checkout (Virtual Web POS) */}
          <div className="rounded-[28px] sm:rounded-[32px] p-8 sm:p-10 bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 transition-colors duration-200 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              {/* Icon inside small circular container (48-56px, subtle light background, blue icon) */}
              <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#DBE2FC] dark:bg-white/10 flex items-center justify-center shrink-0">
                <Smartphone className="w-6 h-6 text-[#2045E8] dark:text-[#5B8EFF]" strokeWidth={2} />
              </div>
              
              <h3 className="font-archivo font-medium text-2xl sm:text-[28px] lg:text-[30px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em] pt-2">
                Virtual POS Register
              </h3>
              
              <p className="font-archivo text-[16px] sm:text-[17px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
                Accept crypto payments using any existing phone, iPad, tablet, or laptop browser.
                Input the sale in USD and generate an instant dynamic EIP-681 QR code with zero
                hardware purchase.
              </p>
              
              <ul className="space-y-3 pt-2 text-sm sm:text-[15px] font-archivo text-[#334155] dark:text-[#A9B9D5]">
                <li className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-[5px] border border-[#2045E8] dark:border-[#3B82F6] flex items-center justify-center shrink-0 bg-white dark:bg-[#07132B]">
                    <Check className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#3B82F6]" strokeWidth={2.5} />
                  </div>
                  <span>Launches on any modern mobile or desktop browser</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-[5px] border border-[#2045E8] dark:border-[#3B82F6] flex items-center justify-center shrink-0 bg-white dark:bg-[#07132B]">
                    <Check className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#3B82F6]" strokeWidth={2.5} />
                  </div>
                  <span>Real-time payment detection chime and visual success banner</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-[5px] border border-[#2045E8] dark:border-[#3B82F6] flex items-center justify-center shrink-0 bg-white dark:bg-[#07132B]">
                    <Check className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#3B82F6]" strokeWidth={2.5} />
                  </div>
                  <span>Instant transaction link to BaseScan block explorer</span>
                </li>
              </ul>
            </div>

            {/* Virtual POS UI Mockup */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#081224] border border-[#DFE3F8] dark:border-white/10 space-y-3 font-mono text-xs shadow-sm">
              <div className="flex justify-between items-center text-[#6B7280] dark:text-dark-text-muted">
                <span>VIRTUAL POS REGISTER #01</span>
                <span className="text-emerald-500 font-bold">● ACTIVE</span>
              </div>
              <div className="flex justify-between items-center text-base font-bold text-[#111111] dark:text-white">
                <span>Total Due:</span>
                <span className="text-[#2045E8] dark:text-brand-cyan">$8.50 USDC</span>
              </div>
            </div>
          </div>

          {/* Card 2: Dedicated ESP32 Hardware Terminal */}
          <div className="rounded-[28px] sm:rounded-[32px] p-8 sm:p-10 bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 transition-colors duration-200 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              {/* Icon inside small circular container */}
              <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#DBE2FC] dark:bg-white/10 flex items-center justify-center shrink-0">
                <Cpu className="w-6 h-6 text-[#2045E8] dark:text-[#5B8EFF]" strokeWidth={2} />
              </div>
              
              <div className="flex items-center gap-2 pt-2">
                <h3 className="font-archivo font-medium text-2xl sm:text-[28px] lg:text-[30px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em]">
                  PaidX ESP32 Hardware Terminal
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#2045E8]/10 text-[#2045E8] dark:bg-brand-cyan/20 dark:text-brand-cyan border border-[#2045E8]/20">
                  HARDWARE
                </span>
              </div>
              
              <p className="font-archivo text-[16px] sm:text-[17px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
                Autonomous countertop terminal equipped with a PN532 NFC reader for tap-to-pay, a
                2.8&quot; color SPI TFT touchscreen, tactile keypad, and Wi-Fi connectivity for high-speed retail.
              </p>
              
              <ul className="space-y-3 pt-2 text-sm sm:text-[15px] font-archivo text-[#334155] dark:text-[#A9B9D5]">
                <li className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-[5px] border border-[#2045E8] dark:border-[#3B82F6] flex items-center justify-center shrink-0 bg-white dark:bg-[#07132B]">
                    <Radio className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#3B82F6]" />
                  </div>
                  <span>Instant contactless NFC smart card & phone tap detection</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-[5px] border border-[#2045E8] dark:border-[#3B82F6] flex items-center justify-center shrink-0 bg-white dark:bg-[#07132B]">
                    <Wifi className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#3B82F6]" />
                  </div>
                  <span>Direct Wi-Fi telemetry to your PaidX merchant portal</span>
                </li>
                <li className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-[5px] border border-[#2045E8] dark:border-[#3B82F6] flex items-center justify-center shrink-0 bg-white dark:bg-[#07132B]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#2045E8] dark:text-[#3B82F6]" />
                  </div>
                  <span>Hardware-level secure key storage & standalone offline doctor</span>
                </li>
              </ul>
            </div>

            {/* Hardware Terminal Telemetry Mockup */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#081224] border border-[#DFE3F8] dark:border-white/10 space-y-3 font-mono text-xs shadow-sm">
              <div className="flex justify-between items-center text-[#6B7280] dark:text-dark-text-muted">
                <span>TERMINAL ID: ESP-PAIDX-77A</span>
                <span className="text-emerald-500 font-bold">● CONNECTED (WIFI)</span>
              </div>
              <div className="flex justify-between items-center text-sm font-semibold text-[#111111] dark:text-white">
                <span>NFC Station: READY TO TAP</span>
                <span className="text-[#2045E8] dark:text-brand-cyan">DISPLAY: 2.8&quot; TFT ACTIVE</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3rd Complementary: NFC Smart Cards & Session Key Limits */}
        <div className="rounded-[28px] sm:rounded-[32px] p-8 sm:p-10 bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 transition-colors duration-200">
          <div className="space-y-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2.5 text-[#2045E8] dark:text-brand-cyan font-medium text-sm">
              <div className="w-7 h-7 rounded-full bg-[#DBE2FC] dark:bg-white/10 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-[#2045E8] dark:text-brand-cyan" />
              </div>
              <span>Smart Account Tap Cards</span>
            </div>
            <h4 className="font-archivo font-medium text-xl sm:text-2xl text-[#111111] dark:text-white pt-1">
              NFC Tap Cards with Daily Spending Limits
            </h4>
            <p className="font-archivo text-sm sm:text-base text-[#334155] dark:text-[#A9B9D5] max-w-xl">
              Equip customers or staff with physical PaidX NFC cards linked to their ERC-4337 smart
              account. Set daily allowances ($25–$100/day) and freeze cards instantly from the dashboard.
            </p>
          </div>
          <a
            href="https://console.paidx.cc"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-[8px] text-[15px] font-medium text-white bg-[#2045E8] hover:bg-[#1635B8] transition-colors shrink-0 shadow-sm"
          >
            Manage Cards
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

      </div>
    </section>
  );
}
