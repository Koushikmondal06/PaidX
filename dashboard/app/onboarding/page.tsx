'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { getStoredSession, saveSession, UserSession, UserRole } from '@/lib/auth';
import {
  Wallet,
  CreditCard,
  Store,
  User,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Link2,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);

  // Funnel steps: 1 = Wallet, 2 = Role & Profile
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Wallet state
  const [walletChoice, setWalletChoice] = useState<'create' | 'link'>('create');
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);

  // Step 2: Role & Profile state
  const [selectedRole, setSelectedRole] = useState<UserRole>('payer');
  const [fullName, setFullName] = useState('');
  const [currencyPref, setCurrencyPref] = useState<'USDC' | 'ETH'>('USDC');

  // Merchant specific inputs
  const [businessName, setBusinessName] = useState('');
  const [merchantSlug, setMerchantSlug] = useState('');
  const [receivingAddress, setReceivingAddress] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const s = getStoredSession();
    if (!s) {
      router.replace('/auth');
    } else {
      setSession(s);
      setFullName(s.fullName || '');
      setReceivingAddress(s.smartAccountAddress || '');
    }
  }, [router]);

  // Handle Step 1: Wallet Connection
  const handleWalletSubmit = () => {
    setIsWalletConnecting(true);

    setTimeout(() => {
      setIsWalletConnecting(false);
      setStep(2);
    }, 700);
  };

  // Handle Step 2: Complete Profile & Role Configuration
  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setIsLoading(true);

    setTimeout(() => {
      const updatedSession: UserSession = {
        ...session,
        fullName: fullName || session.fullName,
        role: selectedRole,
        currencyPreference: currencyPref,
        onboardingStep: 'completed',
        merchantProfile:
          selectedRole === 'merchant'
            ? {
                businessName: businessName || 'My Store',
                slug: merchantSlug || 'my-store',
                receivingAddress: receivingAddress || session.smartAccountAddress,
              }
            : undefined,
      };

      saveSession(updatedSession);
      setIsLoading(false);

      if (selectedRole === 'merchant') {
        router.push('/merchant');
      } else {
        router.push('/dashboard');
      }
    }, 600);
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#071013] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-xl space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <PaidXLogo size={36} />
          </div>
          <h1 className="text-xl font-bold font-mono text-[#DFE0E2]">
            {step === 1 ? 'Step 1: Non-Custodial Wallet Setup' : 'Step 2: Profile & Role Configuration'}
          </h1>
          <p className="text-xs text-[#AAAAAA] font-mono">
            {step === 1
              ? 'Connect or generate your smart account for Base L2 settlement'
              : 'Customize your PaidX experience based on how you participate'}
          </p>
        </div>

        {/* Funnel Progress Indicator */}
        <div className="flex items-center justify-center gap-3">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
              step === 1
                ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
              {step > 1 ? '✓' : '1'}
            </span>
            <span>Wallet</span>
          </div>

          <div className="w-8 h-[1px] bg-[#1A2E38]" />

          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
              step === 2
                ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                : 'bg-[#0B161B] text-[#666666] border-[#1A2E38]'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
              2
            </span>
            <span>Role & Profile</span>
          </div>
        </div>

        {/* STEP 1: WALLET SETUP */}
        {step === 1 && (
          <Card className="space-y-6 border-[#1A2E38]">
            <div className="space-y-4">
              {/* Option A: Create Smart Wallet */}
              <div
                onClick={() => setWalletChoice('create')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  walletChoice === 'create'
                    ? 'bg-[#0E1D24] border-[#5465FF] shadow-sm shadow-[#5465FF]/20'
                    : 'bg-[#071013] border-[#1A2E38] hover:border-[#1A2E38]/80'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    walletChoice === 'create'
                      ? 'bg-[#5465FF] text-white'
                      : 'bg-[#0B161B] text-[#AAAAAA]'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold text-[#DFE0E2]">
                      Create New Smart Wallet (Recommended)
                    </h3>
                    <Badge variant="info">GASLESS ERC-4337</Badge>
                  </div>
                  <p className="text-[11px] font-mono text-[#AAAAAA] mt-1">
                    Instantly creates a non-custodial Smart Account on Base via MetaMask Embedded
                    WaaS. No seed phrases to write down.
                  </p>
                </div>
              </div>

              {/* Option B: Link Existing MetaMask */}
              <div
                onClick={() => setWalletChoice('link')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  walletChoice === 'link'
                    ? 'bg-[#0E1D24] border-[#5465FF] shadow-sm shadow-[#5465FF]/20'
                    : 'bg-[#071013] border-[#1A2E38] hover:border-[#1A2E38]/80'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    walletChoice === 'link'
                      ? 'bg-[#5465FF] text-white'
                      : 'bg-[#0B161B] text-[#AAAAAA]'
                  }`}
                >
                  <Link2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold text-[#DFE0E2]">
                      Link Existing MetaMask
                    </h3>
                    <Badge variant="default">ERC-7715 EXTENSION</Badge>
                  </div>
                  <p className="text-[11px] font-mono text-[#AAAAAA] mt-1">
                    Connect your existing MetaMask extension or mobile wallet. Retain full key
                    management with native delegation support.
                  </p>
                </div>
              </div>

              {/* Notice on Coinbase Wallet */}
              <div className="p-3 rounded-lg bg-[#071013] border border-[#1A2E38] flex items-center gap-2 text-[11px] font-mono text-[#888888]">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Coinbase Wallet integration is deferred due to delegation permissions constraints;
                  MetaMask is the active supported provider.
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full font-mono text-xs"
              onClick={handleWalletSubmit}
              isLoading={isWalletConnecting}
            >
              <span>{walletChoice === 'create' ? 'Provision Smart Wallet' : 'Connect MetaMask'}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Card>
        )}

        {/* STEP 2: ROLE & PROFILE SELECTION */}
        {step === 2 && (
          <Card className="space-y-6 border-[#1A2E38]">
            <form onSubmit={handleProfileSubmit} className="space-y-5">
              {/* Role Cards */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-medium text-[#DFE0E2]">
                  Select Account Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Payer */}
                  <div
                    onClick={() => setSelectedRole('payer')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedRole === 'payer'
                        ? 'bg-[#0E1D24] border-[#5465FF]'
                        : 'bg-[#071013] border-[#1A2E38]'
                    }`}
                  >
                    <CreditCard className="w-5 h-5 text-[#5465FF] mb-2" />
                    <div className="text-xs font-mono font-bold text-[#DFE0E2]">Payer</div>
                    <p className="text-[10px] font-mono text-[#AAAAAA] mt-1">
                      Tap-to-pay with cards or phone limits.
                    </p>
                  </div>

                  {/* Merchant */}
                  <div
                    onClick={() => setSelectedRole('merchant')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedRole === 'merchant'
                        ? 'bg-[#0E1D24] border-[#5465FF]'
                        : 'bg-[#071013] border-[#1A2E38]'
                    }`}
                  >
                    <Store className="w-5 h-5 text-[#5465FF] mb-2" />
                    <div className="text-xs font-mono font-bold text-[#DFE0E2]">Merchant</div>
                    <p className="text-[10px] font-mono text-[#AAAAAA] mt-1">
                      Accept crypto at retail POS terminals.
                    </p>
                  </div>

                  {/* Normal User */}
                  <div
                    onClick={() => setSelectedRole('normal_user')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedRole === 'normal_user'
                        ? 'bg-[#0E1D24] border-[#5465FF]'
                        : 'bg-[#071013] border-[#1A2E38]'
                    }`}
                  >
                    <User className="w-5 h-5 text-[#5465FF] mb-2" />
                    <div className="text-xs font-mono font-bold text-[#DFE0E2]">Standard</div>
                    <p className="text-[10px] font-mono text-[#AAAAAA] mt-1">
                      General Web3 wallet & portfolio view.
                    </p>
                  </div>
                </div>
              </div>

              {/* Dynamic Profile Fields */}
              <div className="pt-2 border-t border-[#1A2E38] space-y-4">
                <Input
                  label="Display Name / Full Name"
                  placeholder="e.g. Alex Vance"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />

                {selectedRole === 'payer' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono font-medium text-[#DFE0E2]">
                      Primary Settlement Currency
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrencyPref('USDC')}
                        className={`flex-1 py-2 rounded-lg text-xs font-mono border transition-all ${
                          currencyPref === 'USDC'
                            ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                            : 'bg-[#071013] text-[#AAAAAA] border-[#1A2E38]'
                        }`}
                      >
                        USDC (Stablecoin)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrencyPref('ETH')}
                        className={`flex-1 py-2 rounded-lg text-xs font-mono border transition-all ${
                          currencyPref === 'ETH'
                            ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                            : 'bg-[#071013] text-[#AAAAAA] border-[#1A2E38]'
                        }`}
                      >
                        Base ETH
                      </button>
                    </div>
                  </div>
                )}

                {selectedRole === 'merchant' && (
                  <>
                    <Input
                      label="Business / Store Name"
                      placeholder="e.g. Apex Artisan Coffee"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                    />
                    <Input
                      label="Store URL Slug"
                      placeholder="e.g. apex-coffee"
                      value={merchantSlug}
                      onChange={(e) => setMerchantSlug(e.target.value)}
                      required
                    />
                    <Input
                      label="Base Receiving Address"
                      value={receivingAddress}
                      onChange={(e) => setReceivingAddress(e.target.value)}
                      helperText="Settlement funds are deposited here"
                      required
                    />
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-1/3 font-mono text-xs"
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-2/3 font-mono text-xs"
                  isLoading={isLoading}
                >
                  <span>Complete Setup</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
