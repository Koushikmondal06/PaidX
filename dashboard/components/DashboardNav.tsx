'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PaidXLogo } from './ui/PaidXLogo';
import { Button } from './ui/Button';
import { truncateAddress } from '@/lib/base';
import { signOutReal, UserSession } from '@/lib/auth';
import {
  LayoutDashboard,
  CreditCard,
  DollarSign,
  Terminal,
  LogOut,
  Cpu,
  Store,
  User,
  ShieldCheck,
  Bot,
  Wallet,
  Menu,
  X,
  ChevronRight,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';

export interface DashboardNavProps {
  session?: UserSession | null;
  children?: React.ReactNode;
}

export function DashboardNav({ session, children }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOutReal();
    router.push('/auth');
    router.refresh();
  };

  const isMerchantPath = pathname.startsWith('/merchant');

  const userNavItems = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Wallet', href: '/dashboard/wallet', icon: Wallet },
    { label: 'Cards & Limits', href: '/dashboard/cards', icon: CreditCard },
    { label: 'Agent Wallet', href: '/dashboard/agents', icon: Bot },
    { label: 'Transactions', href: '/dashboard/transactions', icon: DollarSign },
  ];

  const merchantNavItems = [
    { label: 'Merchant Overview', href: '/merchant', icon: Store },
    { label: 'Virtual Terminal', href: '/merchant/terminal', icon: Terminal },
    { label: 'POS Hardware', href: '/merchant/pos', icon: Cpu },
  ];

  const navItems = isMerchantPath ? merchantNavItems : userNavItems;
  const activeItem = navItems.find((item) => item.href === pathname);
  const walletAddr = session?.smartAccountAddress || session?.eoaAddress || '';

  return (
    <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] text-[#303747] dark:text-[#A9B9D5] flex transition-colors">
      {/* ========================================================= */}
      {/* 1. Permanent Left Sidebar (Desktop & Tablet)              */}
      {/* ========================================================= */}
      <aside className="hidden md:flex flex-col w-20 lg:w-64 shrink-0 border-r border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-[#09152D] h-screen sticky top-0 z-30 transition-all duration-200 select-none">
        {/* Top Logo / Console Branding */}
        <div className="h-16 lg:h-[74px] px-4 lg:px-6 flex items-center justify-center lg:justify-start border-b border-[#E2E8F0] dark:border-white/10 shrink-0">
          <Link
            href={isMerchantPath ? '/merchant' : '/dashboard'}
            className="focus:outline-none flex items-center"
          >
            {/* Desktop: Full Logo with wordmark and badge */}
            <div className="hidden lg:block">
              <PaidXLogo size={32} showConsole={true} />
            </div>
            {/* Tablet: Icon Only */}
            <div className="block lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-02-thumb.png"
                alt="PaidX Logo"
                width={32}
                height={32}
                className="w-8 h-8 rounded-[8px] object-cover shadow-sm transition-transform hover:scale-105"
              />
            </div>
          </Link>
        </div>

        {/* Vertically Stacked Menu Items */}
        <nav className="flex-1 px-3 lg:px-4 py-5 space-y-1.5 overflow-y-auto">
          <div className="hidden lg:block px-3 pb-2 text-[11px] font-archivo font-semibold uppercase tracking-wider text-[#9299A8]">
            {isMerchantPath ? 'Merchant Suite' : 'Console Navigation'}
          </div>

          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={`flex items-center gap-3 px-3 lg:px-3.5 py-2.5 rounded-xl text-[14px] font-archivo font-medium transition-all ${
                  isActive
                    ? 'bg-[#ECEEFF] text-[#1749F5] dark:bg-white/10 dark:text-[#5B8EFF] font-semibold shadow-xs'
                    : 'text-[#303747] dark:text-[#A9B9D5] hover:text-[#1749F5] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-white/5'
                } justify-center lg:justify-start`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    isActive ? 'text-[#1749F5] dark:text-[#5B8EFF]' : 'text-[#667085] dark:text-[#94A3B8]'
                  }`}
                />
                <span className="hidden lg:inline truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Account & Network Status in Sidebar */}
        <div className="p-3 lg:p-4 border-t border-[#E2E8F0] dark:border-white/10 shrink-0">
          {walletAddr ? (
            <>
              {/* Desktop version: Connected Account Pill */}
              <div className="hidden lg:flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-mono font-medium text-[#090B12] dark:text-[#F5F8FF] truncate" title={walletAddr}>
                    {truncateAddress(walletAddr)}
                  </span>
                  <span className="text-[10px] font-archivo font-semibold uppercase tracking-wider text-[#10B981] leading-tight">
                    Base L2 • Connected
                  </span>
                </div>
              </div>

              {/* Tablet version: compact dot */}
              <div
                className="flex lg:hidden justify-center items-center py-1"
                title={`${walletAddr} (Base L2 Connected)`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
              </div>
            </>
          ) : (
            <>
              {/* Desktop version fallback */}
              <div className="hidden lg:flex items-center gap-2.5 px-3 py-2 rounded-[8px] bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-archivo font-semibold text-[#090B12] dark:text-[#F5F8FF] leading-tight truncate">
                    Base L2 Network
                  </span>
                  <span className="text-[10px] font-archivo text-[#667085] dark:text-[#94A3B8] leading-tight truncate">
                    Ethereum Sepolia
                  </span>
                </div>
              </div>

              {/* Tablet version: compact dot */}
              <div
                className="flex lg:hidden justify-center items-center py-1"
                title="Base L2 Connected"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse" />
              </div>
            </>
          )}
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. Main Area: Compact Top Header + Dashboard Content       */}
      {/* ========================================================= */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Top Header */}
        <header className="sticky top-0 z-20 w-full h-16 lg:h-[74px] border-b border-[#E2E8F0] dark:border-white/10 bg-white/85 dark:bg-[#050B1B]/85 backdrop-blur-md px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-colors">
          {/* Left: Mobile Hamburger + Breadcrumb */}
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl text-[#303747] dark:text-[#A9B9D5] hover:bg-[#F8FAFC] dark:hover:bg-white/5 border border-[#E2E8F0] dark:border-white/10 focus:outline-none"
              aria-label="Open navigation drawer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile Brand Logo */}
            <div className="md:hidden">
              <PaidXLogo size={28} showConsole={false} />
            </div>

            {/* Desktop / Tablet Breadcrumb */}
            <div className="hidden md:flex items-center gap-1.5 text-xs font-archivo text-[#667085] dark:text-[#94A3B8]">
              <span>Console</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#9299A8]" />
              <span className="font-semibold text-[#090B12] dark:text-[#F5F8FF]">
                {activeItem?.label || (isMerchantPath ? 'Merchant Portal' : 'Overview')}
              </span>
            </div>
          </div>

          {/* Right: Controls Horizontally & Vertically Aligned */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Merchant Portal / User Console Toggle */}
            {isMerchantPath ? (
              <Link href="/dashboard" className="hidden sm:inline-flex">
                <Button variant="ghost" size="sm" className="text-xs font-archivo gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#1749F5] dark:text-[#5B8EFF]" />
                  <span>User Console</span>
                </Button>
              </Link>
            ) : (
              <Link href="/merchant" className="hidden sm:inline-flex">
                <Button variant="outline" size="sm" className="text-xs font-archivo gap-1.5">
                  <Store className="w-3.5 h-3.5 text-[#1749F5] dark:text-[#5B8EFF]" />
                  <span>Merchant Portal</span>
                </Button>
              </Link>
            )}

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 sm:p-2.5 rounded-[8px] border border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-white/5 text-[#303747] dark:text-[#A9B9D5] hover:border-[#1749F5] dark:hover:border-[#5B8EFF] transition-all duration-200 focus:outline-none"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-brand-cyan transition-transform rotate-0 scale-100" />
              ) : (
                <Moon className="w-4 h-4 text-[#1749F5] transition-transform rotate-0 scale-100" />
              )}
            </button>

            {/* Sign Out Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="font-archivo text-xs gap-1.5 hidden sm:inline-flex"
            >
              <LogOut className="w-3.5 h-3.5 text-[#667085] dark:text-[#94A3B8]" />
              <span>Sign Out</span>
            </Button>
          </div>
        </header>

        {/* Dashboard Content */}
        {children ? (
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            {children}
          </main>
        ) : null}
      </div>

      {/* ========================================================= */}
      {/* 3. Mobile Collapsible Navigation Drawer                   */}
      {/* ========================================================= */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white dark:bg-[#09152D] border-r border-[#E2E8F0] dark:border-white/10 shadow-2xl flex flex-col z-10 transition-transform">
            {/* Drawer Header */}
            <div className="h-16 px-4 flex items-center justify-between border-b border-[#E2E8F0] dark:border-white/10">
              <PaidXLogo size={30} showConsole={true} />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-[#667085] hover:text-[#090B12] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-white/5"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Nav Links */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              <div className="px-3 pb-2 text-[11px] font-archivo font-semibold uppercase tracking-wider text-[#9299A8]">
                {isMerchantPath ? 'Merchant Suite' : 'Console Navigation'}
              </div>

              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-archivo font-medium transition-colors ${
                      isActive
                        ? 'bg-[#ECEEFF] text-[#1749F5] dark:bg-white/10 dark:text-[#5B8EFF] font-semibold'
                        : 'text-[#303747] dark:text-[#A9B9D5] hover:bg-[#F8FAFC] dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? 'text-[#1749F5] dark:text-[#5B8EFF]' : 'text-[#667085] dark:text-[#94A3B8]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Mobile Footer with Wallet & Controls */}
            <div className="p-4 border-t border-[#E2E8F0] dark:border-white/10 space-y-3">
              {walletAddr && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#ECEEFF] dark:bg-white/5 border border-[#DFE3F8] dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#10B981]" />
                    <span className="text-xs font-mono font-medium text-[#090B12] dark:text-[#F5F8FF]">
                      {truncateAddress(walletAddr)}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-[#10B981] bg-white/80 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/40">
                    Base L2
                  </span>
                </div>
              )}

              {isMerchantPath ? (
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full block"
                >
                  <Button variant="outline" size="sm" className="w-full text-xs font-archivo justify-center">
                    <User className="w-3.5 h-3.5 mr-1.5 text-[#1749F5] dark:text-[#5B8EFF]" />
                    Switch to User Console
                  </Button>
                </Link>
              ) : (
                <Link
                  href="/merchant"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full block"
                >
                  <Button variant="outline" size="sm" className="w-full text-xs font-archivo justify-center">
                    <Store className="w-3.5 h-3.5 mr-1.5 text-[#1749F5] dark:text-[#5B8EFF]" />
                    Switch to Merchant Portal
                  </Button>
                </Link>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-archivo text-[#667085] dark:text-[#94A3B8]">Theme</span>
                <button
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-white/5 text-xs font-archivo text-[#303747] dark:text-[#A9B9D5]"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-brand-cyan" />
                      <span>Light Mode</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-[#1749F5]" />
                      <span>Dark Mode</span>
                    </>
                  )}
                </button>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={handleSignOut}
                className="w-full text-xs font-archivo justify-center text-[#EF4444]"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
