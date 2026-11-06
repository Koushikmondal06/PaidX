'use client';

import React, { useState } from 'react';
import { Search, ChevronRight, Check } from 'lucide-react';
import {
  BitcoinIcon,
  EthereumIcon,
  UsdcIcon,
  SolanaIcon,
  BaseChainIcon,
  LitecoinIcon,
  PolygonIcon,
} from './CryptoIcons';

interface Coin {
  id: string;
  name: string;
  symbol: string;
  network: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  settlementTime: string;
  rateUsd: string;
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
    },
    {
      id: 'base',
      name: 'Base ETH',
      symbol: 'ETH (Base)',
      network: 'Base Layer 2',
      icon: BaseChainIcon,
      settlementTime: '< 1.2s',
      rateUsd: '$3,420.00',
    },
    {
      id: 'eth',
      name: 'Ethereum',
      symbol: 'ETH',
      network: 'Ethereum Mainnet',
      icon: EthereumIcon,
      settlementTime: '~12 sec',
      rateUsd: '$3,420.00',
    },
    {
      id: 'sol',
      name: 'Solana',
      symbol: 'SOL',
      network: 'Solana Mainnet',
      icon: SolanaIcon,
      settlementTime: '~1.5 sec',
      rateUsd: '$198.50',
    },
    {
      id: 'btc',
      name: 'Bitcoin',
      symbol: 'BTC',
      network: 'Bitcoin / Lightning',
      icon: BitcoinIcon,
      settlementTime: '~2 sec (LN)',
      rateUsd: '$96,400.00',
    },
    {
      id: 'pol',
      name: 'Polygon',
      symbol: 'POL',
      network: 'Polygon PoS',
      icon: PolygonIcon,
      settlementTime: '~2 sec',
      rateUsd: '$0.58',
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
    <section className="py-24 bg-[#F7F8FC] dark:bg-[#09152D] transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-brand-blue bg-brand-blue/10 dark:text-brand-cyan dark:bg-brand-cyan/15">
            <span>Settlement Rails</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF]">
            Zero-volatility native USDC settlement on Base
          </h2>
          <p className="text-base sm:text-lg text-light-text-secondary dark:text-dark-text-secondary">
            PaidX settles transactions directly into native USDC to protect retail merchants from
            market fluctuations. Customers can tap with PaidX smart cards or scan with any Web3 wallet.
          </p>
        </div>

        {/* 2-Column Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left: Interactive Currency Selector Mockup */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-white dark:bg-[#101F3B] rounded-2xl p-6 sm:p-7 border border-light-border dark:border-white/10 shadow-lg space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-white/10">
                <span className="font-bold text-base text-light-text-primary dark:text-white">
                  Supported Assets
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-light-soft dark:bg-[#142443] text-brand-blue dark:text-brand-cyan font-mono font-medium">
                  Base Mainnet (8453)
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-light-secondary dark:bg-[#071022] border border-light-border dark:border-white/10 text-sm text-light-text-primary dark:text-white placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                />
              </div>

              {/* Coin List */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {filteredCoins.map((coin) => {
                  const Icon = coin.icon;
                  const isSelected = selectedCoin.id === coin.id;
                  return (
                    <button
                      key={coin.id}
                      onClick={() => setSelectedCoin(coin)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                        isSelected
                          ? 'bg-light-soft dark:bg-[#142443] border border-brand-blue/30 dark:border-brand-cyan/40'
                          : 'hover:bg-light-secondary dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={32} />
                        <div className="text-left">
                          <div className="text-sm font-bold text-light-text-primary dark:text-white">
                            {coin.name}
                          </div>
                          <div className="text-xs font-mono text-light-text-secondary dark:text-dark-text-muted">
                            {coin.symbol} • {coin.network}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSelected && <Check className="w-4 h-4 text-brand-blue dark:text-brand-cyan" />}
                        <ChevronRight className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Active Selection Details Preview */}
              <div className="p-3.5 rounded-xl bg-light-secondary dark:bg-[#071022] border border-light-border dark:border-white/10 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="text-light-text-muted dark:text-dark-text-muted">Settlement: </span>
                  <span className="font-bold text-light-text-primary dark:text-white">
                    {selectedCoin.symbol}
                  </span>
                </div>
                <div>
                  <span className="text-light-text-muted dark:text-dark-text-muted">Latency: </span>
                  <span className="font-bold text-emerald-500">{selectedCoin.settlementTime}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Copy */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold text-brand-violet bg-brand-violet/10 dark:text-brand-violet dark:bg-brand-violet/15">
              <span>Stablecoin Architecture</span>
            </div>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-[#090B12] dark:text-[#F5F8FF] leading-tight">
              Instant settlement in dollars, powered by Base Layer-2
            </h3>
            <p className="text-base sm:text-lg text-light-text-body dark:text-dark-text-secondary leading-relaxed">
              When a customer taps their card at your counter, the funds are instantly verified and
              deposited as native USDC on Base. There is zero price exposure to volatile crypto assets.
            </p>
            <p className="text-sm sm:text-base text-light-text-secondary dark:text-dark-text-muted leading-relaxed">
              Customers can pay with their physical PaidX smart cards or scan with Coinbase Wallet,
              MetaMask, Rainbow, or any self-custody wallet supporting Base and EIP-681 payment URIs.
            </p>

            <div className="pt-2 flex flex-wrap gap-2">
              {['USDC on Base', 'ERC-4337 Smart Accounts', 'Paymaster Gas Sponsoring', 'BaseScan Verified', 'PN532 NFC'].map(
                (tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-lg text-xs font-mono font-semibold bg-white dark:bg-[#101F3B] border border-light-border dark:border-white/10 text-light-text-body dark:text-white"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
