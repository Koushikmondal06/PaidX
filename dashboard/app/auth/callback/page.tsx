'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession, type UserSession } from '@/lib/auth';
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck, ExternalLink } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userSession, setUserSession] = useState<UserSession | null>(null);

  useEffect(() => {
    async function handleAuthVerification() {
      try {
        const supabase = createBrowserSupabaseClient();

        // 1. Handle PKCE auth code exchange if present in query parameters
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const code = params.get('code');

          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              console.warn('[Auth Callback] exchangeCodeForSession warning:', exchangeError);
            }
          }
        }

        // 2. Fetch and confirm verified real session
        const session = await getRealUserSession();
        if (session) {
          setUserSession(session);
          setStatus('success');
          return;
        }

        // 3. Check for implicit hash session token if applicable
        const { data: authData } = await supabase.auth.getSession();
        if (authData.session) {
          const user = authData.session.user;
          setUserSession({
            id: user.id,
            identifier: user.email || user.phone || '',
            type: user.phone ? 'phone' : 'email',
            fullName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'PaidX Member',
            role: 'payer',
            onboardingStep: 'wallet_selection',
            currencyPreference: 'USDC',
          });
          setStatus('success');
          return;
        }

        throw new Error('Authentication confirmation could not be verified. Please try signing in directly.');
      } catch (err: unknown) {
        console.error('[Auth Callback] Verification failed:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    }

    handleAuthVerification();
  }, []);

  const handleProceed = () => {
    if (userSession?.onboardingStep === 'completed') {
      router.push(userSession.role === 'merchant' ? '/merchant' : '/dashboard');
    } else {
      router.push('/onboarding');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] text-[#334155] dark:text-[#A9B9D5] flex flex-col items-center justify-center p-4 relative overflow-hidden font-archivo">
      {/* Background ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#ECEEFF] dark:bg-[#2045E8]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-lg space-y-6 relative z-10 text-center">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-3">
          <PaidXLogo size={42} />
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-xs text-[#065F46] font-medium">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span>Ethereum Sepolia Network</span>
          </div>
        </div>

        <Card className="p-8 space-y-6 bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          {/* VERIFYING STATE */}
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 text-[#2045E8] animate-spin" />
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold text-[#111111] dark:text-white">Verifying Your Account...</h2>
                <p className="text-sm text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto">
                  Exchanging secure cryptographic authorization tokens with PaidX Console.
                </p>
              </div>
            </div>
          )}

          {/* SUCCESS CONFIRMED STATE */}
          {status === 'success' && (
            <div className="space-y-6 py-2">
              <div className="w-16 h-16 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-9 h-9 text-[#10B981]" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-[#111111] dark:text-white">
                  Email Verified & Account Active
                </h1>
                <p className="text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed max-w-md mx-auto">
                  Your identity has been authenticated. You are ready to connect your MetaMask Smart Account and link contactless NFC payment cards.
                </p>
              </div>

              {/* User details summary pill */}
              {userSession && (
                <div className="p-4 bg-[#F8FAFC] dark:bg-white/5 rounded-xl border border-[#E2E8F0] dark:border-white/10 text-left space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Account Identifier:</span>
                    <span className="text-[#111111] dark:text-white font-medium">{userSession.identifier}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Status:</span>
                    <span className="text-[#10B981] font-medium flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" /> Confirmed & Authorized
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={handleProceed}
                  className="w-full text-xs font-semibold py-3 flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(32,69,232,0.25)]"
                >
                  <span>Launch PaidX Setup & Onboarding</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <div>
                  <a
                    href="https://paidx.cc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 text-xs text-[#64748B] hover:text-[#111111] dark:hover:text-white transition-colors py-1.5"
                  >
                    <span>Learn more at paidx.cc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {status === 'error' && (
            <div className="space-y-6 py-4">
              <div className="w-16 h-16 rounded-full bg-[#FEF2F2] border border-[#FCA5A5] flex items-center justify-center mx-auto">
                <AlertCircle className="w-9 h-9 text-[#EF4444]" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-[#991B1B] dark:text-red-300">Confirmation Issue</h2>
                <p className="text-sm text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto">
                  {errorMessage || 'The verification link may have expired or already been used.'}
                </p>
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => router.push('/auth')}
                  className="w-full text-xs font-semibold py-3"
                >
                  Return to Sign In
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Footer info */}
        <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
          PaidX • Non-custodial payments on Ethereum Sepolia
        </p>
      </div>
    </div>
  );
}
