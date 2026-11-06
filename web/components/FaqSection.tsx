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
      question: 'How does PaidX NFC tap-to-pay work?',
      answer:
        'Shoppers carry a physical PaidX contactless smart card linked to their self-custody smart account (ERC-4337 on Base). When tapped against the merchant\'s ESP32 terminal, the transaction executes in under 1.2 seconds without requiring an internet connection or unlocked phone from the customer.',
    },
    {
      question: 'Do customers need to unlock their phone for every coffee or lunch?',
      answer:
        'No! PaidX utilizes Account Abstraction session keys. Cardholders pre-authorize a daily spending limit (e.g. $50/day). Micro-purchases like a cup of chai or a snack execute seamlessly with a physical card tap, exactly like tapping a Visa or Apple Pay.',
    },
    {
      question: 'What is the ESP32 hardware terminal?',
      answer:
        'The PaidX Terminal is a standalone countertop device powered by an ESP32 microcontroller with a 2.8" SPI color touchscreen, integrated PN532 NFC reader, tactile controls, and Wi-Fi connectivity. It connects directly to the PaidX merchant portal and provides instantaneous audio and visual payment confirmations.',
    },
    {
      question: 'Can merchants accept payments without buying hardware?',
      answer:
        'Yes! PaidX provides a full web-based Virtual POS register that runs directly in any phone, iPad, tablet, or laptop browser. Simply type the sale amount in USD, and a dynamic EIP-681 QR code is generated instantly for the customer to scan.',
    },
    {
      question: 'How fast is settlement and what currency do merchants receive?',
      answer:
        'Settlement occurs in under 1.2 seconds directly on Base Layer 2. Funds are deposited into your merchant receiving address in native USDC (guaranteed 1:1 USD equivalent). There is zero crypto price volatility and no waiting 2-3 business days for bank batches.',
    },
    {
      question: 'Are there gas fees for customers or merchants?',
      answer:
        'Gas fees are sponsored by the PaidX Paymaster on Base L2, meaning shoppers pay $0 in gas tolls at checkout. Merchants enjoy near-zero overhead compared to traditional 3.5% + $0.30 credit card swipe tolls.',
    },
    {
      question: 'Can transactions be charged back or disputed?',
      answer:
        'No. Once confirmed on Base L2, transactions achieve immutable cryptographic finality. Merchants never have to worry about fraudulent chargebacks, friendly fraud, or dispute fees.',
    },
    {
      question: 'How do I get started as a merchant?',
      answer:
        'Visit console.paidx.cc, connect with email or wallet, set your store name and receiving address, and immediately launch the Virtual POS or order and provision an ESP32 hardware terminal.',
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
            <span>Frequently Asked Questions</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            Everything you need to know about PaidX
          </h2>
          <p className="text-base text-light-text-secondary dark:text-dark-text-secondary">
            Common questions regarding NFC tap-to-pay, session limits, and Base L2 settlement.
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
