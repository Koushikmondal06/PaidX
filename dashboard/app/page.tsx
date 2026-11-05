'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/auth';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      router.replace('/auth');
    } else if (session.onboardingStep !== 'completed') {
      router.replace('/onboarding');
    } else if (session.role === 'merchant') {
      router.replace('/merchant');
    } else {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#071013] flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#5465FF] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-[#AAAAAA]">Initializing PaidX...</span>
      </div>
    </div>
  );
}
