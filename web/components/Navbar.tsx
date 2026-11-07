'use client';

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Menu, X, ArrowUpRight } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 15);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      const targetElement = document.querySelector(href);
      if (targetElement) {
        setMobileMenuOpen(false);
        const navHeight = 74;
        const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navHeight;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth',
        });
      }
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/85 dark:bg-[#06142F]/85 backdrop-blur-md shadow-sm dark:shadow-none border-b border-light-border dark:border-white/10'
          : 'bg-white/60 dark:bg-[#050B1B]/60 backdrop-blur-sm border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[74px] flex items-center justify-between">
        {/* Left: PaidX logo / wordmark */}
        <a
          href="https://paidx.cc"
          className="flex items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-brand-blue/50 rounded-lg py-1 transition-transform"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-02.png"
            alt="PaidX Logo"
            className="w-8 h-8 rounded-[8px] shadow-sm transition-transform group-hover:scale-105 object-cover"
          />
          <span className="font-extrabold text-2xl tracking-tight text-[#090B12] dark:text-[#F5F8FF]">
            Paid<span className="text-[#090B12] dark:text-white">X</span>
          </span>
        </a>

        {/* Center: Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-[15px] font-medium">
          <a
            href="#features"
            onClick={(e) => handleAnchorClick(e, '#features')}
            className="text-light-text-body hover:text-brand-blue dark:text-dark-text-secondary dark:hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={(e) => handleAnchorClick(e, '#how-it-works')}
            className="text-light-text-body hover:text-brand-blue dark:text-dark-text-secondary dark:hover:text-white transition-colors"
          >
            How it works?
          </a>
          <a
            href="#why-paidx"
            onClick={(e) => handleAnchorClick(e, '#why-paidx')}
            className="text-light-text-body hover:text-brand-blue dark:text-dark-text-secondary dark:hover:text-white transition-colors"
          >
            Why PaidX
          </a>
          <a
            href="https://paidx.cc/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-light-text-body hover:text-brand-blue dark:text-dark-text-secondary dark:hover:text-white transition-colors"
          >
            Docs
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </a>
        </nav>

        {/* Right: Theme Toggle & Get Started CTA */}
        <div className="flex items-center gap-3">
          {/* Theme switcher toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2.5 rounded-xl border border-light-border dark:border-white/10 bg-white dark:bg-dark-surface text-light-text-body dark:text-dark-text-primary hover:border-brand-blue dark:hover:border-brand-cyan transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-brand-cyan transition-transform rotate-0 scale-100" />
            ) : (
              <Moon className="w-4 h-4 text-brand-blue transition-transform rotate-0 scale-100" />
            )}
          </button>

          {/* Desktop Get Started CTA */}
          <a
            href="https://console.paidx.cc"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center justify-center px-5 py-2.5 rounded-[8px] text-sm font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover dark:bg-brand-blue dark:hover:bg-blue-600 transition-all shadow-sm hover:shadow-md hover:shadow-brand-blue/20 active:scale-[0.98]"
          >
            Get Started
          </a>

          {/* Mobile hamburger menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            className="md:hidden p-2.5 rounded-xl border border-light-border dark:border-white/10 bg-white dark:bg-dark-surface text-light-text-body dark:text-white focus:outline-none"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-light-border dark:border-white/10 bg-white/95 dark:bg-[#06142F]/95 backdrop-blur-lg px-4 pt-4 pb-6 space-y-3 transition-all animate-in slide-in-from-top-2">
          <a
            href="#features"
            onClick={(e) => handleAnchorClick(e, '#features')}
            className="block px-3 py-2.5 rounded-lg text-base font-medium text-light-text-body hover:bg-light-soft dark:text-dark-text-secondary dark:hover:bg-dark-elevated dark:hover:text-white transition-colors"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={(e) => handleAnchorClick(e, '#how-it-works')}
            className="block px-3 py-2.5 rounded-lg text-base font-medium text-light-text-body hover:bg-light-soft dark:text-dark-text-secondary dark:hover:bg-dark-elevated dark:hover:text-white transition-colors"
          >
            How it works?
          </a>
          <a
            href="#why-paidx"
            onClick={(e) => handleAnchorClick(e, '#why-paidx')}
            className="block px-3 py-2.5 rounded-lg text-base font-medium text-light-text-body hover:bg-light-soft dark:text-dark-text-secondary dark:hover:bg-dark-elevated dark:hover:text-white transition-colors"
          >
            Why PaidX
          </a>
          <a
            href="https://paidx.cc/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium text-light-text-body hover:bg-light-soft dark:text-dark-text-secondary dark:hover:bg-dark-elevated dark:hover:text-white transition-colors"
          >
            Docs
            <ArrowUpRight className="w-4 h-4 opacity-60" />
          </a>
          <div className="pt-2">
            <a
              href="https://console.paidx.cc"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 rounded-[8px] text-base font-semibold text-white bg-brand-blue hover:bg-brand-blue-hover shadow-sm"
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
