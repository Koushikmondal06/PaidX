'use client';

import React from 'react';
import { Navbar } from '@/components/Navbar';
import { HeroSection } from '@/components/HeroSection';
import { ValuePropsSection } from '@/components/ValuePropsSection';
import { HowItWorksSection } from '@/components/HowItWorksSection';
import { FeaturesSection } from '@/components/FeaturesSection';
import { StatsSection } from '@/components/StatsSection';
import { CurrencyCoverageSection } from '@/components/CurrencyCoverageSection';
import { FastSettlementSection } from '@/components/FastSettlementSection';
import { FaqSection } from '@/components/FaqSection';
import { Footer } from '@/components/Footer';

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen flex flex-col bg-white dark:bg-[#050B1B] text-light-text-body dark:text-dark-text-primary transition-colors duration-300">
      {/* Navigation bar following Additional Requirement 2 */}
      <Navbar />

      {/* Main Landing Sections */}
      <main className="flex-1">
        {/* Hero Section with Light / Dark Mode & blue-gradient-waves.png */}
        <HeroSection />

        {/* Value Props & Why Businesses Choose PaidX */}
        <ValuePropsSection />

        {/* How It Works (4 Interactive Steps) */}
        <HowItWorksSection />

        {/* POS Integrations: Quick Checkout & ESP32 Hardware Terminal */}
        <FeaturesSection />

        {/* Scale & Enterprise Market Stats */}
        <StatsSection />

        {/* Currency Coverage & Interactive Selector */}
        <CurrencyCoverageSection />

        {/* Fast Bank Settlement & Conversion */}
        <FastSettlementSection />

        {/* Comprehensive FAQ Accordion */}
        <FaqSection />
      </main>

      {/* Comprehensive Footer with Support Banner */}
      <Footer />
    </div>
  );
}
