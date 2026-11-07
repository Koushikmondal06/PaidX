'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession, clearSession } from '@/lib/auth';
import { APP_URL } from '@/lib/base';
import { ArrowRight, AlertCircle, ShieldCheck } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

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
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Clear any stale local session on auth page visit
  useEffect(() => {
    clearSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

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

    try {
      if (mode === 'register') {
        if (channel === 'email') {
          const redirectUrl = `${APP_URL}/auth/confirmed`;

          const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: redirectUrl,
              data: {
                display_name: email.split('@')[0],
              },
            },
          });

          if (signUpError) throw signUpError;

          if (data.user && !data.session) {
            setInfoMessage('Account created! Please check your email to confirm your registration before signing in.');
            setIsLoading(false);
            return;
          }

          // User session established directly
          await getRealUserSession();
          router.push('/onboarding');
        } else {
          // Phone registration
          const { data, error: signUpError } = await supabase.auth.signUp({
            phone,
            password,
            options: {
              data: {
                display_name: phone,
              },
            },
          });

          if (signUpError) throw signUpError;

          if (data.user && !data.session) {
            setInfoMessage('Account created! Verification code sent to your phone.');
            setIsLoading(false);
            return;
          }

          await getRealUserSession();
          router.push('/onboarding');
        }
      } else {
        // Sign In
        if (channel === 'email') {
          const { data, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (signInError) throw signInError;
          if (data.user) {
            const session = await getRealUserSession();
            if (session?.onboardingStep === 'completed') {
              router.push(session.role === 'merchant' ? '/merchant' : '/dashboard');
            } else {
              router.push('/onboarding');
            }
          }
        } else {
          // Phone Sign In
          const { data, error: signInError } = await supabase.auth.signInWithPassword({
            phone,
            password,
          });

          if (signInError) throw signInError;
          if (data.user) {
            const session = await getRealUserSession();
            if (session?.onboardingStep === 'completed') {
              router.push(session.role === 'merchant' ? '/merchant' : '/dashboard');
            } else {
              router.push('/onboarding');
            }
          }
        }
      }
    } catch (err: unknown) {
      console.error('[Auth Error]:', err);
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please verify your credentials.';
      if (msg.toLowerCase().includes('rate limit')) {
        setError('Email rate limit exceeded (Supabase default is 3-4 emails/hour). If you already created this account, switch to "Sign In" above. To bypass email confirmation during testnet development, disable "Confirm email" in Supabase Dashboard > Authentication > Providers > Email.');
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] text-[#303747] dark:text-[#A9B9D5] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden font-archivo">
      {/* Background soft ambient tint matching landing page */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#ECEEFF]/80 dark:bg-[#1749F5]/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-[440px] space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <PaidXLogo size={42} showConsole={true} />
          </div>
          <h1 className="text-2xl sm:text-[28px] font-bold font-archivo tracking-tight text-[#090B12] dark:text-[#F5F8FF]">
            {mode === 'register' ? 'Create Your PaidX Account' : 'Sign In to PaidX Console'}
          </h1>
          <p className="text-xs sm:text-sm font-archivo text-[#667085] dark:text-[#94A3B8]">
            Contactless Retail Payments on Ethereum Sepolia
          </p>
        </div>

        {/* Authentication Card */}
        <div className="p-7 sm:p-9 space-y-6 bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 rounded-[28px] shadow-[0_16px_45px_rgba(31,45,88,0.07)]">
          {/* Mode Switcher: Login / Register */}
          <div className="grid grid-cols-2 p-1.5 bg-[#F1F5F9] dark:bg-white/5 rounded-2xl border border-[#E2E8F0] dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-2.5 text-xs sm:text-[13px] font-archivo font-medium rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-white dark:bg-[#1749F5] text-[#090B12] dark:text-white shadow-sm font-semibold'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#090B12] dark:hover:text-white'
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-2.5 text-xs sm:text-[13px] font-archivo font-medium rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-white dark:bg-[#1749F5] text-[#090B12] dark:text-white shadow-sm font-semibold'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#090B12] dark:hover:text-white'
              }`}
            >
              Sign In
            </button>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3.5 bg-[#FEF2F2] dark:bg-red-950/30 border border-[#FCA5A5] dark:border-red-800/60 rounded-xl flex items-start gap-2.5 text-[#991B1B] dark:text-red-300 text-xs font-archivo">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#EF4444]" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3.5 bg-[#EFF6FF] dark:bg-blue-950/30 border border-[#BFDBFE] dark:border-blue-800/60 rounded-xl flex items-start gap-2.5 text-[#1E40AF] dark:text-blue-300 text-xs font-archivo">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#1749F5]" />
              <span className="leading-relaxed">{infoMessage}</span>
            </div>
          )}

          {/* Channel selector: Email vs Phone */}
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] dark:border-white/10 pb-3">
            <span className="text-xs font-archivo font-medium text-[#667085] dark:text-[#94A3B8]">Channel:</span>
            <button
              type="button"
              onClick={() => {
                setChannel('email');
                setError(null);
              }}
              className={`text-xs font-archivo px-3 py-1.5 rounded-xl transition-all ${
                channel === 'email'
                  ? 'bg-[#ECEEFF] text-[#1749F5] dark:bg-[#1749F5]/20 dark:text-[#7C9BFF] font-semibold border border-[#DFE3F8] dark:border-[#1749F5]/30 shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#090B12] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-white/5'
              }`}
            >
              Email Address
            </button>
            <button
              type="button"
              onClick={() => {
                setChannel('phone');
                setError(null);
              }}
              className={`text-xs font-archivo px-3 py-1.5 rounded-xl transition-all ${
                channel === 'phone'
                  ? 'bg-[#ECEEFF] text-[#1749F5] dark:bg-[#1749F5]/20 dark:text-[#7C9BFF] font-semibold border border-[#DFE3F8] dark:border-[#1749F5]/30 shadow-xs'
                  : 'text-[#667085] dark:text-[#94A3B8] hover:text-[#090B12] dark:hover:text-white hover:bg-[#F8FAFC] dark:hover:bg-white/5'
              }`}
            >
              Phone Number
            </button>
          </div>

          {/* Auth form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {channel === 'email' ? (
              <Input
                label="Email Address"
                type="email"
                required
                autoComplete="email"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            ) : (
              <Input
                label="Phone Number (E.164 with country code)"
                type="tel"
                required
                autoComplete="tel"
                placeholder="+14155552671"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            )}

            <Input
              label="Password"
              type="password"
              required
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {mode === 'register' && (
              <Input
                label="Confirm Password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full h-12 text-sm font-semibold rounded-xl bg-[#1749F5] hover:bg-[#113AC8] text-white shadow-sm hover:shadow-md hover:shadow-[#1749F5]/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2"
              isLoading={isLoading}
            >
              <span>{mode === 'register' ? 'Create Account & Continue' : 'Sign In to Console'}</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </form>
        </div>

        {/* Security Tagline */}
        <div className="text-center text-xs font-archivo text-[#667085] dark:text-[#94A3B8] flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
          <span>Non-custodial smart accounts on Ethereum Sepolia</span>
        </div>
      </div>
    </div>
  );
}
