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
    <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] text-[#334155] dark:text-[#A9B9D5] flex flex-col justify-between py-10 px-4 sm:px-6 font-archivo relative overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#ECEEFF] dark:bg-[#2045E8]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex justify-center mb-6 relative z-10">
        <PaidXLogo size={40} />
      </div>

      <div className="max-w-md w-full mx-auto relative z-10">
        <Card className="p-6 sm:p-8 border border-[#E2E8F0] dark:border-white/10 bg-white dark:bg-[#09152D] rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
          {!isError ? (
            /* Success State */
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-[#ECFDF5] border border-[#A7F3D0] rounded-full flex items-center justify-center mx-auto text-[#10B981] shadow-sm">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-[#111111] dark:text-white">
                  Email Confirmed
                </h1>
                <p className="text-[#64748B] dark:text-[#94A3B8] text-sm leading-relaxed">
                  Your PaidX account is verified. You can now sign in to configure your wallet and start accepting or sending retail payments.
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <Link href={`${APP_URL}/auth`} className="block w-full">
                  <Button
                    variant="primary"
                    className="w-full text-xs font-semibold py-3 flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(32,69,232,0.25)]"
                  >
                    <span>Open PaidX Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>

                <div className="pt-1">
                  <a
                    href={SITE_URL}
                    className="text-xs text-[#64748B] hover:text-[#111111] dark:hover:text-white inline-flex items-center gap-1 transition-colors"
                  >
                    <span>Back to paidx.cc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            /* Error / Expired State */
            <div className="space-y-6">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 bg-[#FFFBEB] border border-[#FDE68A] rounded-full flex items-center justify-center mx-auto text-[#D97706] shadow-sm">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight text-[#111111] dark:text-white">
                  Verification Link Expired or Invalid
                </h1>
                <p className="text-[#64748B] dark:text-[#94A3B8] text-sm leading-relaxed">
                  This confirmation link is no longer valid or has already been used. Enter your email below to request a new verification email.
                </p>
              </div>

              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <Input
                    label="Email Address"
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                  />
                </div>

                {resendFeedback && (
                  <div
                    className={`p-3.5 rounded-xl text-xs leading-relaxed border ${
                      resendStatus === 'success'
                        ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]'
                        : resendStatus === 'rate_limited'
                        ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
                        : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]'
                    }`}
                  >
                    {resendFeedback}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  disabled={isResending || !resendEmail}
                  className="w-full text-xs font-semibold py-3 flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(32,69,232,0.25)]"
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending Verification...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4" />
                      <span>Resend Confirmation Email</span>
                    </>
                  )}
                </Button>
              </form>

              <div className="pt-2 text-center border-t border-[#E2E8F0] dark:border-white/10 space-y-2">
                <div>
                  <Link href={`${APP_URL}/auth`} className="text-xs text-[#2045E8] hover:underline font-medium">
                    Return to Sign In
                  </Link>
                </div>
                <div>
                  <a
                    href={SITE_URL}
                    className="text-xs text-[#64748B] hover:text-[#111111] dark:hover:text-white inline-flex items-center gap-1 transition-colors"
                  >
                    <span>Back to paidx.cc</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="text-center text-xs text-[#64748B] dark:text-[#94A3B8] relative z-10">
        &copy; {new Date().getFullYear()} PaidX Protocol. Ethereum Sepolia Testnet.
      </div>
    </div>
  );
}

export default function ConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] flex items-center justify-center text-[#64748B]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2045E8]"></div>
        </div>
      }
    >
      <ConfirmedContent />
    </Suspense>
  );
}
