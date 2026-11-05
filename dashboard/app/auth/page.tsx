'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createNewSession, saveSession, DEFAULT_DEMO_USER } from '@/lib/auth';
import { Mail, Phone, Lock, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();

  // Mode: login vs register
  const [mode, setMode] = useState<'login' | 'register'>('register');
  // Channel: email vs phone
  const [channel, setChannel] = useState<'email' | 'phone'>('email');

  // Form states
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const identifier = channel === 'email' ? email.trim() : phone.trim();

    if (!identifier) {
      setError(channel === 'email' ? 'Please enter a valid email address.' : 'Please enter your phone number.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please re-enter confirm password.');
        return;
      }
    }

    setIsLoading(true);

    // Simulate direct secure authentication (no OTP required)
    setTimeout(() => {
      setIsLoading(false);

      if (mode === 'register') {
        // Create new session starting at wallet selection
        const newSession = createNewSession(identifier, channel);
        router.push('/onboarding');
      } else {
        // Sign in existing session or demo user
        const session = {
          ...DEFAULT_DEMO_USER,
          identifier,
          type: channel,
        };
        saveSession(session);
        router.push('/dashboard');
      }
    }, 600);
  };

  const handleQuickDemo = () => {
    saveSession(DEFAULT_DEMO_USER);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#071013] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow aesthetics */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#5465FF]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <PaidXLogo size={36} />
          </div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
            {mode === 'register' ? 'Create Your PaidX Account' : 'Sign In to PaidX Console'}
          </h1>
          <p className="text-xs text-[#AAAAAA] font-mono">
            Contactless Retail Payments on Base (Non-Custodial)
          </p>
        </div>

        {/* Auth Mode Tabs (Sign In / Register) */}
        <div className="flex bg-[#0B161B] p-1 rounded-xl border border-[#1A2E38]">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-mono font-medium rounded-lg transition-all ${
              mode === 'register'
                ? 'bg-[#0E1D24] text-[#DFE0E2] border border-[#5465FF]/40 shadow-sm'
                : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-mono font-medium rounded-lg transition-all ${
              mode === 'login'
                ? 'bg-[#0E1D24] text-[#DFE0E2] border border-[#5465FF]/40 shadow-sm'
                : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
            }`}
          >
            Sign In
          </button>
        </div>

        {/* Auth Card */}
        <Card className="space-y-5 border-[#1A2E38] shadow-2xl">
          {/* Channel Selector: Email vs Phone */}
          <div className="flex gap-2 pb-3 border-b border-[#1A2E38]">
            <button
              type="button"
              onClick={() => {
                setChannel('email');
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                channel === 'email'
                  ? 'bg-[#5465FF]/15 text-[#5465FF] border border-[#5465FF]/30'
                  : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setChannel('phone');
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                channel === 'phone'
                  ? 'bg-[#5465FF]/15 text-[#5465FF] border border-[#5465FF]/30'
                  : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Phone Number</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {channel === 'email' ? (
              <Input
                label="Email Address"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            ) : (
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                helperText="Enter phone with international country code (E.164)"
                required
              />
            )}

            <Input
              label="Password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {mode === 'register' && (
              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                helperText="Ensure passwords match exactly"
                required
              />
            )}

            {error && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs font-mono">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full font-mono text-xs"
              isLoading={isLoading}
            >
              <span>{mode === 'register' ? 'Create Account & Continue' : 'Sign In to Console'}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </form>

          {/* Quick Demo Bypass for Developer Testing */}
          <div className="pt-3 border-t border-[#1A2E38] text-center">
            <button
              type="button"
              onClick={handleQuickDemo}
              className="text-[11px] font-mono text-[#5465FF] hover:underline inline-flex items-center gap-1"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>Or explore as Demo User (Pre-funded on Base)</span>
            </button>
          </div>
        </Card>

        {/* Security Tagline */}
        <div className="text-center text-[11px] font-mono text-[#666666]">
          Non-custodial smart accounts powered by Base L2 & MetaMask
        </div>
      </div>
    </div>
  );
}
