'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PaidXLogo } from './ui/PaidXLogo';
import { Button } from './ui/Button';
import { truncateAddress } from '@/lib/base';
import { getStoredSession, signOutReal, UserSession } from '@/lib/auth';
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
  Wallet,
} from 'lucide-react';

export function DashboardNav({ session }: { session?: UserSession | null }) {
  const pathname = usePathname();
  const router = useRouter();

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
    { label: 'Transactions', href: '/dashboard/transactions', icon: DollarSign },
  ];

  const merchantNavItems = [
    { label: 'Merchant Overview', href: '/merchant', icon: Store },
    { label: 'Virtual Terminal', href: '/merchant/terminal', icon: Terminal },
    { label: 'POS Hardware', href: '/merchant/pos', icon: Cpu },
  ];

  const navItems = isMerchantPath ? merchantNavItems : userNavItems;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#1A2E38] bg-[#071013]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href={isMerchantPath ? '/merchant' : '/dashboard'}>
            <PaidXLogo size={28} />
          </Link>

          <nav className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    isActive
                      ? 'bg-[#0E1D24] text-[#DFE0E2] border border-[#5465FF]/40 shadow-sm'
                      : 'text-[#AAAAAA] hover:text-[#DFE0E2] hover:bg-[#0E1D24]/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#5465FF]' : 'text-[#666666]'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Switch Role Quick Link */}
          {isMerchantPath ? (
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-[11px] font-mono">
                <User className="w-3.5 h-3.5 mr-1 text-[#5465FF]" />
                User View
              </Button>
            </Link>
          ) : (
            <Link href="/merchant">
              <Button variant="outline" size="sm" className="hidden sm:inline-flex text-[11px] font-mono">
                <Store className="w-3.5 h-3.5 mr-1 text-[#5465FF]" />
                Merchant Portal
              </Button>
            </Link>
          )}

          {/* Connected Address Pill */}
          {(session?.smartAccountAddress || session?.eoaAddress) && (
            <div className="hidden lg:flex flex-col items-end px-2.5 py-1 rounded-lg bg-[#0B161B] border border-[#1A2E38]">
              <span className="text-[11px] font-mono text-[#DFE0E2] flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                {truncateAddress(session.smartAccountAddress || session.eoaAddress)}
              </span>
              <span className="text-[9px] font-mono text-emerald-400">Sepolia (11155111)</span>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={handleSignOut} className="font-mono text-xs">
            <LogOut className="w-3.5 h-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
