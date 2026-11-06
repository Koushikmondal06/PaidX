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
    <div className="min-h-screen bg-[#071013] text-[#DFE0E2] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#5465FF]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-lg space-y-6 relative z-10 text-center">
        {/* Brand header */}
        <div className="flex flex-col items-center gap-3">
          <PaidXLogo size={42} />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1A2E38]/60 border border-[#1A2E38] text-[11px] font-mono text-[#AAAAAA]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Ethereum Sepolia Network</span>
          </div>
        </div>

        <Card className="p-8 space-y-6 bg-[#0B161B]/95 border-[#1A2E38] backdrop-blur-xl shadow-2xl">
          {/* VERIFYING STATE */}
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 text-[#5465FF] animate-spin" />
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold font-mono text-[#DFE0E2]">Verifying Your Account...</h2>
                <p className="text-xs text-[#888888] font-mono max-w-sm mx-auto">
                  Exchanging secure cryptographic authorization tokens with PaidX Console.
                </p>
              </div>
            </div>
          )}

          {/* SUCCESS CONFIRMED STATE */}
          {status === 'success' && (
            <div className="space-y-6 py-2">
              <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              </div>

              <div className="space-y-2">
                <h1 className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
                  Email Verified & Account Active
                </h1>
                <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed max-w-md mx-auto">
                  Your identity has been authenticated. You are ready to connect your MetaMask Smart Account and link contactless NFC payment cards.
                </p>
              </div>

              {/* User details summary pill */}
              {userSession && (
                <div className="p-3.5 bg-[#071013] rounded-xl border border-[#1A2E38] text-left space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#888888]">Account Identifier:</span>
                    <span className="text-white font-medium">{userSession.identifier}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#888888]">Status:</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Confirmed & Authorized
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
                  className="w-full font-mono text-xs py-3 flex items-center justify-center gap-2"
                >
                  <span>Launch PaidX Setup & Onboarding</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <a
                  href="https://paidx.cc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-mono text-[#888888] hover:text-[#DFE0E2] transition-colors py-1.5"
                >
                  <span>Learn more at paidx.cc</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {status === 'error' && (
            <div className="space-y-6 py-4">
              <div className="w-14 h-14 rounded-full bg-red-950/60 border border-red-500/30 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold font-mono text-red-300">Confirmation Issue</h2>
                <p className="text-xs text-[#AAAAAA] font-mono max-w-sm mx-auto">
                  {errorMessage || 'The verification link may have expired or already been used.'}
                </p>
              </div>

              <div className="pt-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => router.push('/auth')}
                  className="w-full font-mono text-xs py-2.5"
                >
                  Return to Sign In
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Footer info */}
        <p className="text-[11px] font-mono text-[#666666]">
          PaidX • Non-custodial payments on Ethereum Sepolia
        </p>
      </div>
    </div>
  );
}
