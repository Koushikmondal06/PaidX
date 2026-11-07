'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getRealUserSession, getStoredSession } from '@/lib/auth';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const session = (await getRealUserSession()) || getStoredSession();
      if (!session) {
        router.replace('/auth');
      } else if (session.onboardingStep !== 'completed') {
        router.replace('/onboarding');
      } else if (session.role === 'merchant') {
        router.replace('/merchant');
      } else {
        router.replace('/dashboard');
      }
    }
    init();
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#2045E8] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8]">Initializing PaidX...</span>
      </div>
    </div>
  );
}
