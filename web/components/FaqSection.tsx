'use client';

import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

interface FaqItem {
  question: string;
  answer: string;
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      question: 'Do I need a special cryptocurrency point of sale terminal to accept crypto in store?',
      answer:
        'No special hardware is required. You can immediately accept crypto using our web-based Virtual POS on any smartphone, iPad, tablet, or PC browser. For high-volume physical retail counters desiring a standalone dedicated device, PaidX provides our turnkey ESP32 countertop hardware terminal with integrated NFC tap-to-pay and high-contrast OLED QR screens.',
    },
    {
      question: 'Can I offer crypto payments alongside cards and cash?',
      answer:
        'Yes! PaidX is built to seamlessly sit alongside your existing card terminals (Square, Clover, Verifone, Toast) and cash registers. When a customer wants to pay with crypto, your cashier simply enters the amount or prompts the dynamic PaidX QR on the customer-facing screen.',
    },
    {
      question: 'Which cryptocurrencies and networks are supported?',
      answer:
        'PaidX supports USDC, Bitcoin (BTC), Ethereum (ETH), Solana (SOL), Base ETH, Litecoin (LTC), Polygon (POL), and leading stablecoins. Customers can pay using any self-custody wallet (Coinbase Wallet, MetaMask, Rainbow, Phantom, Trust Wallet) or exchange wallet.',
    },
    {
      question: 'Do I need to hold or manage crypto to use PaidX?',
      answer:
        'No. PaidX eliminates all volatility and technical overhead. When a customer pays in crypto, our smart routing system immediately locks the exchange rate and converts the transaction to guaranteed fiat currency or USDC stablecoin.',
    },
    {
      question: 'Can I get settled/fund payouts in fiat currency?',
      answer:
        'Yes. PaidX directly deposits funds via standard ACH, Wire, or SEPA directly into your existing business bank account in 38+ countries in USD, EUR, GBP, CAD, and more. Alternatively, you can opt for 100% USDC stablecoin settlement or a customized percentage split.',
    },
    {
      question: 'What fees does PaidX charge?',
      answer:
        'PaidX charges a low, flat processing fee starting at just 0.5% – 1% per transaction—saving businesses up to 70–80% compared to traditional credit card interchange fees (which typically average 3.5% + $0.30). There are zero hidden monthly gateway fees and zero cancellation penalties.',
    },
    {
      question: 'Is PaidX compliant with cryptocurrency regulations?',
      answer:
        'PaidX is engineered with institutional regulatory standards. We utilize real-time blockchain analytics, automated OFAC/Sanctions screening, and bank-grade KYC/AML compliance pipelines to ensure all retail payment flows remain 100% safe and legally compliant.',
    },
    {
      question: 'Who uses PaidX?',
      answer:
        'PaidX powers physical retail merchants, coffee shops, electronics stores, luxury boutiques, hospitality venues, and international tourist destinations that want to eliminate card interchange tolls, prevent chargeback fraud, and capture high-spending crypto consumers.',
    },
  ];

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="py-24 bg-[#FFFFFF] dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-brand-blue bg-brand-blue/10 dark:text-brand-cyan dark:bg-brand-cyan/15">
            <span>Got Questions?</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            FAQs about accepting crypto payments in-store
          </h2>
          <p className="text-base text-light-text-secondary dark:text-dark-text-secondary">
            Everything you need to know about setting up and running PaidX at your register.
          </p>
        </div>

        {/* Accordion List */}
        <div className="divide-y divide-gray-200/80 dark:divide-white/10 border-y border-gray-200/80 dark:border-white/10">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div key={idx} className="py-5">
                <button
                  onClick={() => toggle(idx)}
                  className="w-full flex items-center justify-between text-left gap-4 group focus:outline-none"
                >
                  <span className="text-lg font-bold text-light-text-primary dark:text-[#F5F8FF] group-hover:text-brand-blue dark:group-hover:text-brand-cyan transition-colors">
                    {faq.question}
                  </span>
                  <div className="p-1 rounded-full text-brand-blue dark:text-brand-cyan group-hover:bg-light-soft dark:group-hover:bg-dark-elevated transition-colors shrink-0">
                    {isOpen ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3.5 pr-8 text-sm sm:text-base text-light-text-body dark:text-dark-text-secondary leading-relaxed animate-in fade-in-50 duration-200">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
