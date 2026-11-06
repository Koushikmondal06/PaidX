'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardNav } from '@/components/DashboardNav';
import { getRealUserSession, getStoredSession, UserSession } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<UserSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const s = (await getRealUserSession()) || getStoredSession();
      if (!s) {
        router.replace('/auth');
      } else if (s.onboardingStep !== 'completed') {
        router.replace('/onboarding');
      } else {
        setSession(s);
        setIsLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#071013] flex items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-[#5465FF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071013] text-[#DFE0E2] flex flex-col">
      <DashboardNav session={session} />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
