'use client';

import React, { useState } from 'react';
import { Search, ChevronRight, Check, ArrowLeft, ChevronDown } from 'lucide-react';
import {
  EthereumIcon,
  UsdcIcon,
  SolanaIcon,
  BaseChainIcon,
} from './CryptoIcons';

interface Coin {
  id: string;
  name: string;
  symbol: string;
  network: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  settlementTime: string;
  rateUsd: string;
  supported: boolean;
}

export function CurrencyCoverageSection() {
  const coins: Coin[] = [
    {
      id: 'usdc',
      name: 'USD Coin (Primary)',
      symbol: 'USDC',
      network: 'Base L2 Native (0x8335...02913)',
      icon: UsdcIcon,
      settlementTime: '< 1.2s (Instant)',
      rateUsd: '$1.00',
      supported: true,
    },
    {
      id: 'eth',
      name: 'Ethereum',
      symbol: 'ETH',
      network: 'Ethereum Mainnet',
      icon: EthereumIcon,
      settlementTime: '~12 sec',
      rateUsd: '$3,420.00',
      supported: true,
    },
    {
      id: 'base',
      name: 'Base ETH',
      symbol: 'ETH (Base)',
      network: 'Base Layer 2',
      icon: BaseChainIcon,
      settlementTime: '< 1.2s',
      rateUsd: '$3,420.00',
      supported: true,
    },
    {
      id: 'sol',
      name: 'Solana',
      symbol: 'SOL',
      network: 'Solana Mainnet (Unsupported)',
      icon: SolanaIcon,
      settlementTime: 'N/A',
      rateUsd: '$198.50',
      supported: false,
    },
  ];

  const [search, setSearch] = useState('');
  const [selectedCoin, setSelectedCoin] = useState<Coin>(coins[0]);

  const filteredCoins = coins.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.symbol.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section id="coverage" className="py-20 md:py-24 bg-white dark:bg-[#050B1B] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Large Rounded Split-Panel Container (Matching Image 14 Reference) */}
        <div className="rounded-[28px] sm:rounded-[32px] overflow-hidden border border-[#E2E8F0] dark:border-white/10 shadow-sm bg-white dark:bg-[#07132B]">
          <div className="grid grid-cols-1 lg:grid-cols-2 items-stretch">
            
            {/* Left Side: Subtle Light-Grey Visual Container with Floating White Asset Selector Card */}
            <div className="bg-[#F3F5F7] dark:bg-[#0A1633] p-5 sm:p-10 lg:p-12 flex items-center justify-center transition-colors duration-300">
              <div className="w-full max-w-[320px] xs:max-w-[360px] sm:max-w-md bg-white dark:bg-[#0C1838] rounded-[18px] p-4 sm:p-6 border border-[#E2E8F0] dark:border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-none space-y-3.5 sm:space-y-5 transition-colors duration-200">
                
                {/* Card Header: Back Arrow, Centered "Select Currency" */}
                <div className="flex items-center justify-between pb-0.5">
                  <button
                    type="button"
                    aria-label="Back"
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 text-[#334155] dark:text-white transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                  <h3 className="font-archivo font-medium text-sm sm:text-[17px] text-[#111111] dark:text-white text-center">
                    Select Currency
                  </h3>
                  <div className="w-7 sm:w-8 shrink-0" />
                </div>

                {/* Search Bar with All Networks Pill Selector */}
                <div className="relative flex items-center min-w-0 w-full">
                  <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#94A3B8] absolute left-3 shrink-0 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search assets..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full min-w-0 pl-8 sm:pl-9 pr-20 sm:pr-32 py-1.5 sm:py-2.5 rounded-full bg-[#F8F9FB] dark:bg-[#071022] border border-[#E2E8F0] dark:border-white/10 text-xs sm:text-sm text-[#111111] dark:text-white placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2045E8]/20 transition-all"
                  />
                  <div className="absolute right-1 flex items-center gap-0.5 sm:gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-[#ECEEFF] dark:bg-[#1A2952] text-[#2045E8] dark:text-[#5B8EFF] text-[10px] sm:text-[11px] font-medium select-none pointer-events-none shrink-0">
                    <span className="hidden xs:inline sm:inline">All Networks</span>
                    <span className="xs:hidden sm:hidden">All</span>
                    <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  </div>
                </div>

                {/* 4 Supported Assets List */}
                <div className="space-y-1 sm:space-y-2">
                  {filteredCoins.map((coin) => {
                    const Icon = coin.icon;
                    const isSelected = selectedCoin.id === coin.id;

                    return (
                      <div
                        key={coin.id}
                        onClick={() => {
                          if (coin.supported) {
                            setSelectedCoin(coin);
                          }
                        }}
                        className={`w-full flex items-center justify-between p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all ${
                          !coin.supported
                            ? 'opacity-40 cursor-not-allowed border border-transparent'
                            : isSelected
                            ? 'bg-[#ECEEFF] dark:bg-[#142443] border border-[#2045E8]/30 dark:border-brand-cyan/40 cursor-pointer shadow-xs'
                            : 'hover:bg-[#F8F9FA] dark:hover:bg-white/5 border border-transparent cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <Icon size={28} className="shrink-0 sm:w-8 sm:h-8" />
                          <div className="text-left truncate">
                            <div className="font-archivo font-medium text-xs sm:text-[15px] text-[#111111] dark:text-white flex items-center gap-1.5 sm:gap-2">
                              <span className="truncate">{coin.name}</span>
                              {!coin.supported && (
                                <span className="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400 font-normal shrink-0">
                                  Unsupported
                                </span>
                              )}
                            </div>
                            <div className="font-archivo text-[10px] sm:text-xs text-[#64748B] dark:text-[#94A3B8] truncate">
                              {coin.symbol} • {coin.network}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-1.5">
                          {isSelected && coin.supported && (
                            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#2045E8] dark:text-brand-cyan shrink-0" strokeWidth={2.5} />
                          )}
                          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#94A3B8] shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Active Settlement Information Preview Strip */}
                <div className="pt-2.5 sm:pt-3 border-t border-[#E2E8F0] dark:border-white/10 flex items-center justify-between text-[10px] sm:text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
                  <div className="truncate pr-2">
                    Settlement:{' '}
                    <span className="font-bold text-[#111111] dark:text-white">
                      {selectedCoin.symbol}
                    </span>
                  </div>
                  <div className="shrink-0">
                    Latency:{' '}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {selectedCoin.settlementTime}
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Right Side: Textual Content with Accent Label, Restrained Heading, Descriptions, and Tags */}
            <div className="bg-white dark:bg-[#07132B] p-6 sm:p-10 lg:p-14 flex flex-col justify-center space-y-6 transition-colors duration-300">
              
              {/* Small Blue/Purple Accent Label */}
              <div className="font-archivo font-normal sm:font-medium text-xl sm:text-[22px] text-[#2045E8] dark:text-[#5B8EFF] tracking-tight">
                Settlement Rails
              </div>

              {/* Main Heading: Approximately 32-36px desktop, regular/medium weight */}
              <h2 className="font-archivo font-medium text-2xl sm:text-3xl lg:text-[34px] text-[#111111] dark:text-[#F5F8FF] leading-[1.25] tracking-[-0.015em]">
                Instant settlement in dollars, powered by Base Layer-2
              </h2>

              {/* Preserved Section Descriptions & Explanations */}
              <div className="space-y-4">
                <p className="font-archivo text-base sm:text-[17px] lg:text-[18px] text-[#334155] dark:text-[#A9B9D5] leading-[1.6]">
                  Zero-volatility native USDC settlement on Base. PaidX settles transactions directly into native USDC to protect retail merchants from market fluctuations. When a customer taps their card at your counter, the funds are instantly verified and deposited as native USDC on Base. There is zero price exposure to volatile crypto assets.
                </p>
                <p className="font-archivo text-sm sm:text-base text-[#64748B] dark:text-[#94A3B8] leading-[1.6]">
                  Customers can pay with their physical PaidX smart cards or scan with Coinbase Wallet, MetaMask, Rainbow, or any self-custody wallet supporting Base and EIP-681 payment URIs.
                </p>
              </div>

              {/* Preserved Feature Tags */}
              <div className="pt-2 flex flex-wrap gap-2.5">
                {[
                  'USDC on Base',
                  'ERC-4337 Smart Accounts',
                  'Paymaster Gas Sponsoring',
                  'BaseScan Verified',
                  'PN532 NFC',
                ].map((tag) => (
                  <span
                    key={tag}
                    className="px-3.5 py-1.5 rounded-full text-xs font-mono font-medium bg-[#F3F5F7] dark:bg-[#0E1C38] border border-[#E2E8F0] dark:border-white/10 text-[#334155] dark:text-[#CBD5E1]"
                  >
                    {tag}
                  </span>
                ))}
              </div>

            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
