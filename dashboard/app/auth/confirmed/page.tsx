'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { APP_URL, SITE_URL } from '@/lib/base';
import { CheckCircle2, AlertTriangle, ArrowRight, Mail, ExternalLink, RefreshCw } from 'lucide-react';

function ConfirmedContent() {
  const searchParams = useSearchParams();
  const isError = searchParams.get('status') === 'error';

  // Resend state
  const [resendEmail, setResendEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'success' | 'rate_limited' | 'error'>('idle');
  const [resendFeedback, setResendFeedback] = useState<string | null>(null);

  const supabase = createBrowserSupabaseClient();

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) return;

    setIsResending(true);
    setResendStatus('idle');
    setResendFeedback(null);

    try {
      const emailRedirectTo = `${APP_URL}/auth/confirmed`;
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: resendEmail.trim(),
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        if (error.status === 429 || error.message.toLowerCase().includes('rate limit')) {
          setResendStatus('rate_limited');
          setResendFeedback('Email rate limit reached. Please wait a few minutes before requesting another verification link.');
        } else {
          setResendStatus('error');
          // Neutral feedback that doesn't leak user existence
          setResendFeedback('Unable to process request at this moment. If the account exists, a link will be sent.');
        }
      } else {
        setResendStatus('success');
        setResendFeedback('If an account exists with this email, a new verification link has been sent. Please check your inbox.');
      }
    } catch (err: unknown) {
      console.warn('[Resend Exception]:', err);
      setResendStatus('error');
      setResendFeedback('An unexpected network error occurred. Please try again shortly.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-10 px-4 sm:px-6">
      <div className="flex justify-center mb-6">
        <PaidXLogo size="md" subtitle="Ethereum Sepolia" />
      </div>

      <div className="max-w-md w-full mx-auto">
        <Card className="p-6 sm:p-8 border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md">
          {!isError ? (
            /* Success State */
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Email Confirmed
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Your PaidX account is verified. You can now sign in to configure your wallet and start accepting or sending retail payments.
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <Link href={`${APP_URL}/auth`} className="block w-full">
                  <Button className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center justify-center gap-2">
                    Open PaidX Console <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>

                <div className="pt-1">
                  <a
                    href={SITE_URL}
                    className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 transition-colors"
                  >
                    Back to paidx.cc <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            /* Error / Expired State */
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto text-amber-400 shadow-inner">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white">
                  Verification Link Expired or Invalid
                </h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  This confirmation link is no longer valid or has already been used. Enter your email below to request a new verification email.
                </p>
              </div>

              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className="bg-slate-950 border-slate-700 text-white"
                  />
                </div>

                {resendFeedback && (
                  <div
                    className={`p-3 rounded-lg text-xs leading-relaxed border ${
                      resendStatus === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : resendStatus === 'rate_limited'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    {resendFeedback}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isResending || !resendEmail}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center justify-center gap-2"
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending Verification...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      Resend Confirmation Email
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-2 text-center border-t border-slate-800/80 space-y-2">
                <div>
                  <Link href={`${APP_URL}/auth`} className="text-xs text-indigo-400 hover:text-indigo-300 font-medium">
                    Return to Sign In
                  </Link>
                </div>
                <div>
                  <a
                    href={SITE_URL}
                    className="text-xs text-slate-500 hover:text-slate-300 inline-flex items-center gap-1 transition-colors"
                  >
                    Back to paidx.cc <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} PaidX Protocol. Ethereum Sepolia Testnet.
      </div>
    </div>
  );
}

export default function ConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      }
    >
      <ConfirmedContent />
    </Suspense>
  );
}

