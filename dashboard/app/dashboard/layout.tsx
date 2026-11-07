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
      <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] flex items-center justify-center p-4">
        <div className="w-9 h-9 border-2 border-[#1749F5] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DashboardNav session={session}>
      {children}
    </DashboardNav>
  );
}
