'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession } from '@/lib/auth';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuthVerification() {
      try {
        const supabase = createBrowserSupabaseClient();

        // Check if there is an auth code to exchange (PKCE auth flow)
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

        // Fetch or verify real user session
        const session = await getRealUserSession();
        if (session) {
          setStatus('success');
          // Smooth redirect to onboarding or dashboard depending on progress
          setTimeout(() => {
            if (session.onboardingStep === 'completed') {
              router.replace(session.role === 'merchant' ? '/merchant' : '/dashboard');
            } else {
              router.replace('/onboarding');
            }
          }, 800);
          return;
        }

        // If session not ready immediately, check Supabase getSession
        const { data: authData } = await supabase.auth.getSession();
        if (authData.session) {
          setStatus('success');
          setTimeout(() => {
            router.replace('/onboarding');
          }, 800);
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
  }, [router]);

  return (
    <div className="min-h-screen bg-[#071013] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-md space-y-6 relative z-10 text-center">
        <div className="flex justify-center mb-2">
          <PaidXLogo size={36} />
        </div>

        <Card className="p-8 space-y-6 bg-[#0B161B]/95 border-[#1A2E38] backdrop-blur shadow-2xl">
          {status === 'verifying' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="w-8 h-8 text-[#5465FF] animate-spin" />
              <div className="space-y-1">
                <h2 className="text-base font-bold font-mono text-[#DFE0E2]">Verifying Authorization...</h2>
                <p className="text-xs text-[#888888] font-mono">
                  Confirming your account with PaidX Console.
                </p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <div className="space-y-1">
                <h2 className="text-base font-bold font-mono text-[#DFE0E2]">Authorization Confirmed!</h2>
                <p className="text-xs text-[#888888] font-mono">
                  Redirecting to your setup...
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <div className="space-y-1">
                <h2 className="text-base font-bold font-mono text-red-300">Verification Error</h2>
                <p className="text-xs text-[#888888] font-mono">
                  {errorMessage}
                </p>
              </div>
              <button
                onClick={() => router.push('/auth')}
                className="mt-2 px-4 py-2 bg-[#1A2E38] hover:bg-[#253E4C] text-xs font-mono text-[#DFE0E2] rounded-md transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

