'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession, clearSession } from '@/lib/auth';
import { Mail, Phone, Lock, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

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

  // Google One Tap setup
  useEffect(() => {
    const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!googleClientId || typeof window === 'undefined') return;

    const setupGoogleOneTap = async () => {
      // Generate cryptographically secure nonce
      const rawNonce = crypto.randomUUID();
      const encoder = new TextEncoder();
      const nonceBuffer = encoder.encode(rawNonce);
      const hashBuffer = await crypto.subtle.digest('SHA-256', nonceBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedNonce = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      // @ts-expect-error Google Identity Services global
      if (window.google?.accounts?.id) {
        // @ts-expect-error Google Identity Services global
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response: { credential: string }) => {
            try {
              setIsLoading(true);
              setError(null);
              const { data, error: signInError } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
                nonce: rawNonce,
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
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Google One Tap sign-in failed.';
              setError(msg);
            } finally {
              setIsLoading(false);
            }
          },
          nonce: hashedNonce,
          auto_select: false,
        });

        // @ts-expect-error Google Identity Services global
        window.google.accounts.id.prompt();
      }
    };

    // Attempt initialize when window.google is ready
    const timer = setTimeout(() => {
      setupGoogleOneTap().catch(console.error);
    }, 1000);

    return () => clearTimeout(timer);
  }, [supabase, router]);

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
          const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
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

          if (data.session) {
            const session = await getRealUserSession();
            if (session?.onboardingStep === 'completed') {
              router.push(session.role === 'merchant' ? '/merchant' : '/dashboard');
            } else {
              router.push('/onboarding');
            }
          }
        } else {
          // Phone sign in
          const { data, error: signInError } = await supabase.auth.signInWithPassword({
            phone,
            password,
          });

          if (signInError) throw signInError;

          if (data.session) {
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
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please verify your credentials.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#071013] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Google Identity Services SDK */}
      <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />

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

        {/* Auth Mode Tabs (Sign In / Register) */}
        <div className="flex bg-[#0B161B] p-1 rounded-xl border border-[#1A2E38]">
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
              setInfoMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-mono font-medium rounded-lg transition-all ${mode === 'register'
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
              setInfoMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-mono font-medium rounded-lg transition-all ${mode === 'login'
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
                setInfoMessage(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${channel === 'email'
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
                setInfoMessage(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${channel === 'phone'
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

            {infoMessage && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-900/60 text-emerald-300 text-xs font-mono">
                {infoMessage}
              </div>
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

          {/* Real Google One Tap Helper Info */}
          <div className="pt-3 border-t border-[#1A2E38] text-center">
            <p className="text-[11px] font-mono text-[#888888] flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#5465FF]" />
              <span>Google One Tap active when configured in Supabase</span>
            </p>
          </div>
        </Card>

        {/* Security Tagline */}
        <div className="text-center text-[11px] font-mono text-[#666666]">
          Non-custodial smart accounts on Ethereum Sepolia
        </div>
      </div>
    </div>
  );
}
