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
    <section id="faq" className="w-full py-20 md:py-24 bg-white dark:bg-[#050B1B] transition-colors duration-300 overflow-x-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header without badge: naturally moved up */}
        <div className="text-center space-y-3 sm:space-y-3.5 max-w-3xl mx-auto">
          <h2 className="font-archivo font-medium sm:font-semibold text-2xl sm:text-3xl lg:text-[38px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em]">
            Everything you need to know about PaidX
          </h2>
          <p className="font-archivo text-[17px] sm:text-[18px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
            Common questions regarding NFC tap-to-pay, session limits, and Base L2 settlement.
          </p>
        </div>

        {/* Accordion List */}
        <div className="mt-12 sm:mt-16 divide-y divide-[#E2E8F0] dark:divide-white/10 border-y border-[#E2E8F0] dark:border-white/10">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div key={idx} className="py-5 sm:py-6">
                <button
                  type="button"
                  onClick={() => toggle(idx)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${idx}`}
                  className="w-full flex items-center justify-between text-left gap-4 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2045E8] rounded-md transition-colors"
                >
                  <span className="font-archivo font-medium sm:font-semibold text-[16px] sm:text-[17px] text-[#111111] dark:text-[#F5F8FF] group-hover:text-[#2045E8] dark:group-hover:text-[#5B8EFF] transition-colors leading-snug min-w-0 pr-2">
                    {faq.question}
                  </span>
                  <div className="shrink-0 p-1 flex items-center justify-center text-[#2045E8] dark:text-[#5B8EFF] transition-colors">
                    {isOpen ? (
                      <Minus className="w-5 h-5 text-[#2045E8] dark:text-[#5B8EFF]" strokeWidth={2.25} />
                    ) : (
                      <Plus className="w-5 h-5 text-[#2045E8] dark:text-[#5B8EFF]" strokeWidth={2.25} />
                    )}
                  </div>
                </button>

                <div
                  id={`faq-answer-${idx}`}
                  className={`grid transition-[grid-template-rows,opacity] duration-250 ease-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100 mt-3.5 sm:mt-4' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden pr-4 sm:pr-12">
                    <p className="font-archivo text-[15px] sm:text-[16px] text-[#334155] dark:text-[#94A3B8] leading-[1.65]">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
