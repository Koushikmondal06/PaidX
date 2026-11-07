'use client';

import React, { useState, useEffect } from 'react';
import {
  Mail,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

export function WaitlistSection() {
  const [email, setEmail] = useState('');
  const [joinedCount, setJoinedCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'duplicate' | 'error';
    message: string;
  } | null>(null);

  // Fetch live count from Supabase on mount
  useEffect(() => {
    let isMounted = true;

    async function loadLiveCount() {
      try {
        const res = await fetch('/api/waitlist', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.count === 'number') {
            setJoinedCount(data.count);
          }
        }
      } catch (err) {
        console.warn('[Waitlist] Count fetch notice:', err);
      }
    }

    loadLiveCount();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setFeedback({
        type: 'error',
        message: 'Please enter your email address.',
      });
      return;
    }

    // Client-side format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setFeedback({
        type: 'error',
        message: 'Please enter a valid email address (e.g. name@domain.com).',
      });
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({
          type: 'error',
          message: data.error || 'Failed to reserve spot. Please check your email and try again.',
        });
        return;
      }

      if (data.status === 'already_subscribed') {
        setFeedback({
          type: 'duplicate',
          message: data.message || "You're already on the beta waitlist! We'll notify you as soon as your spot opens up.",
        });
      } else {
        setFeedback({
          type: 'success',
          message: data.message || 'Spot reserved! Welcome to the PaidX beta waitlist.',
        });
        setEmail('');

        // Update live counter with real server count
        if (typeof data.count === 'number') {
          setJoinedCount(data.count);
        } else {
          setJoinedCount((prev) => (prev ?? 0) + 1);
        }
      }
    } catch (err: unknown) {
      console.error('[Waitlist Submit Error]:', err);
      setFeedback({
        type: 'error',
        message: 'Network error connecting to waitlist service. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      id="waitlist"
      aria-label="Reserve your beta spot"
      className="w-full py-20 sm:py-24 md:py-28 bg-[#F0F4FF] dark:bg-[#06142F] border-t border-[#DFE3F8] dark:border-white/10 transition-colors duration-300 relative overflow-hidden"
    >
      {/* Ambient background soft glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-[#1749F5]/10 dark:bg-[#1749F5]/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Main Waitlist Card */}
        <div className="max-w-xl mx-auto bg-white/90 dark:bg-[#09152D]/90 backdrop-blur-md rounded-[28px] sm:rounded-[36px] border border-[#DFE3F8] dark:border-white/10 p-6 sm:p-10 lg:p-12 shadow-[0_16px_50px_rgba(23,73,245,0.08)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all">
          <div className="space-y-4">
            {/* Heading */}
            <h2 className="font-archivo font-extrabold text-3xl sm:text-4xl lg:text-[42px] tracking-tight text-[#090B12] dark:text-[#F5F8FF] uppercase leading-none">
              Reserve Spot
            </h2>

            {/* Description */}
            <p className="font-archivo text-base sm:text-lg text-[#303747] dark:text-[#A9B9D5] leading-relaxed">
              Limited spots available for the beta release.
            </p>

            {/* Live Joined Users Pill (Real database count) */}
            <div className="pt-1">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#090B12]/15 dark:border-white/15 bg-white dark:bg-white/5 backdrop-blur-xs shadow-xs select-none">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse shrink-0" />
                <span className="text-xs sm:text-[13px] font-archivo font-bold uppercase tracking-wider text-[#090B12] dark:text-[#F5F8FF]">
                  {joinedCount !== null
                    ? `${joinedCount} ${joinedCount === 1 ? 'User' : 'Users'} Already Joined`
                    : '0 Users Already Joined'}
                </span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="pt-2 space-y-3.5">
              {/* Email Input Field with Proper Icon & Text Alignment */}
              <div className="relative flex items-center w-full">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none text-[#667085] dark:text-[#94A3B8] flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (feedback) setFeedback(null);
                  }}
                  placeholder="Enter your email"
                  aria-label="Email address"
                  disabled={isLoading}
                  className="w-full h-14 sm:h-16 pl-[54px] pr-6 rounded-full bg-[#ECEEFF]/70 dark:bg-white/5 border border-[#090B12]/20 dark:border-white/15 text-base font-archivo text-[#090B12] dark:text-white placeholder:text-[#667085] dark:placeholder:text-[#94A3B8] focus:outline-none focus:border-[#1749F5] focus:ring-2 focus:ring-[#1749F5]/25 transition-all disabled:opacity-60 shadow-xs"
                />
              </div>

              {/* Primary CTA Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 sm:h-16 rounded-full bg-[#090B12] hover:bg-[#1749F5] dark:bg-[#1749F5] dark:hover:bg-[#113AC8] text-white font-archivo font-bold text-sm sm:text-base tracking-wider uppercase transition-all duration-200 shadow-md hover:shadow-lg hover:shadow-[#1749F5]/20 flex items-center justify-center gap-2.5 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Reserving Spot...</span>
                  </>
                ) : (
                  <>
                    <span>Join Waitlist</span>
                    <ArrowRight className="w-4 h-4 ml-0.5" />
                  </>
                )}
              </button>
            </form>

            {/* Feedback Notifications */}
            {feedback && (
              <div
                className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm font-archivo flex items-start gap-2.5 transition-all animate-in fade-in duration-200 ${
                  feedback.type === 'success'
                    ? 'bg-[#ECFDF5] text-[#065F46] border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50'
                    : feedback.type === 'duplicate'
                    ? 'bg-[#EFF6FF] text-[#1E40AF] border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50'
                    : 'bg-[#FEF2F2] text-[#991B1B] border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      feedback.type === 'duplicate' ? 'text-[#1749F5]' : 'text-[#EF4444]'
                    }`}
                  />
                )}
                <span className="leading-relaxed font-medium">{feedback.message}</span>
              </div>
            )}

            {/* Three Trust Indicators */}
            <div className="pt-4 sm:pt-6 space-y-2.5 border-t border-[#DFE3F8]/80 dark:border-white/10">
              <div className="flex items-center gap-3 text-xs sm:text-[14px] font-archivo font-medium text-[#303747] dark:text-[#A9B9D5]">
                <ShieldCheck className="w-4 h-4 text-[#10B981] shrink-0" />
                <span>No spam, ever.</span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-[14px] font-archivo font-medium text-[#303747] dark:text-[#A9B9D5]">
                <Sparkles className="w-4 h-4 text-[#1749F5] dark:text-[#5B8EFF] shrink-0" />
                <span>Early beta access.</span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-[14px] font-archivo font-medium text-[#303747] dark:text-[#A9B9D5]">
                <Smartphone className="w-4 h-4 text-[#667085] dark:text-[#94A3B8] shrink-0" />
                <span>Exclusive updates.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
