'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession, clearSession } from '@/lib/auth';
import { ArrowRight, AlertCircle } from 'lucide-react';

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
          const redirectUrl =
            typeof window !== 'undefined' && window.location.origin
              ? `${window.location.origin}/auth/callback`
              : (process.env.NEXT_PUBLIC_APP_URL
                  ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
                  : 'https://console.paidx.cc/auth/callback');

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
      setError(msg);
    } finally {
      setIsLoading(false);
    }
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
            Contactless Retail Payments on Ethereum Sepolia (Non-Custodial)
          </p>
        </div>

        <Card className="p-6 space-y-6 bg-[#0B161B]/95 border-[#1A2E38] backdrop-blur shadow-2xl">
          {/* Mode Switcher: Login / Register */}
          <div className="grid grid-cols-2 p-1 bg-[#071013] rounded-lg border border-[#1A2E38]">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
                setInfoMessage(null);
              }}
              className={`py-2 text-xs font-mono font-medium rounded-md transition-all ${
                mode === 'register'
                  ? 'bg-[#5465FF] text-white shadow-sm'
                  : 'text-[#888888] hover:text-[#DFE0E2]'
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
              className={`py-2 text-xs font-mono font-medium rounded-md transition-all ${
                mode === 'login'
                  ? 'bg-[#5465FF] text-white shadow-sm'
                  : 'text-[#888888] hover:text-[#DFE0E2]'
              }`}
            >
              Sign In
            </button>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-lg flex items-start gap-2.5 text-red-300 text-xs font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-lg flex items-start gap-2.5 text-blue-300 text-xs font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Channel selector: Email vs Phone */}
          <div className="flex items-center gap-2 border-b border-[#1A2E38] pb-3">
            <span className="text-xs font-mono text-[#888888]">Channel:</span>
            <button
              type="button"
              onClick={() => {
                setChannel('email');
                setError(null);
              }}
              className={`text-xs font-mono px-2.5 py-1 rounded transition-colors ${
                channel === 'email'
                  ? 'bg-[#1A2E38] text-[#5465FF] font-semibold'
                  : 'text-[#666666] hover:text-[#AAAAAA]'
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
              className={`text-xs font-mono px-2.5 py-1 rounded transition-colors ${
                channel === 'phone'
                  ? 'bg-[#1A2E38] text-[#5465FF] font-semibold'
                  : 'text-[#666666] hover:text-[#AAAAAA]'
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
              className="w-full font-mono text-xs"
              isLoading={isLoading}
            >
              <span>{mode === 'register' ? 'Create Account & Continue' : 'Sign In to Console'}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </form>
        </Card>

        {/* Security Tagline */}
        <div className="text-center text-[11px] font-mono text-[#666666]">
          Non-custodial smart accounts on Ethereum Sepolia
        </div>
      </div>
    </div>
  );
}
