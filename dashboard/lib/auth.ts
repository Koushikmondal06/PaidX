import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';

export type UserRole = 'payer' | 'merchant' | 'normal_user' | 'super_admin';
export type OnboardingStep = 'wallet_selection' | 'role_selection' | 'profile_setup' | 'completed';

export interface UserSession {
  id: string; // Supabase auth.users UUID
  identifier: string; // email or phone
  type: 'email' | 'phone';
  fullName: string;
  role: UserRole;
  onboardingStep: OnboardingStep;
  smartAccountAddress?: string;
  eoaAddress?: string;
  currencyPreference: 'USDC' | 'ETH';
  merchantProfile?: {
    id: string;
    businessName: string;
    slug: string;
    receivingAddress: string;
    isActive: boolean;
  };
}

const STORAGE_KEY = 'paidx_session_cache_v2';

/**
 * Returns the cached session from local browser storage (if valid).
 */
export function getStoredSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Caches the current real user session locally.
 */
export function saveSession(session: UserSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/**
 * Clears cached session.
 */
export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Authoritatively fetches the real session from Supabase Auth and database tables.
 */
export async function getRealUserSession(): Promise<UserSession | null> {
  const supabase = createBrowserSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    clearSession();
    return null;
  }

  // 1. Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  // 2. Fetch primary wallet if exists
  const { data: wallet } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', user.id)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Fetch merchant profile if exists
  const { data: merchant } = await supabase
    .from('merchants')
    .select('*')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  const identifier = user.email || user.phone || '';
  const type = user.phone ? 'phone' : 'email';
  const rawRole = profile?.role || 'user';
  const role: UserRole = rawRole === 'merchant' ? 'merchant' : 'payer';

  let onboardingStep: OnboardingStep = 'completed';
  if (!wallet) {
    onboardingStep = 'wallet_selection';
  } else if (!profile?.display_name && !profile?.email && !profile?.phone) {
    onboardingStep = 'role_selection';
  }

  const session: UserSession = {
    id: user.id,
    identifier,
    type,
    fullName: profile?.display_name || identifier.split('@')[0] || 'PaidX Member',
    role,
    onboardingStep,
    smartAccountAddress: wallet?.kind === 'metamask_smart_account' ? wallet.address : undefined,
    eoaAddress: wallet?.kind === 'eoa' ? wallet.address : undefined,
    currencyPreference: 'USDC',
    merchantProfile: merchant
      ? {
          id: merchant.id,
          businessName: merchant.name,
          slug: merchant.slug || '',
          receivingAddress: merchant.payout_address,
          isActive: Boolean(merchant.is_active || merchant.status === 'active'),
        }
      : undefined,
  };

  saveSession(session);
  return session;
}

/**
 * Sign out completely from Supabase Auth and remove cached session.
 */
export async function signOutReal(): Promise<void> {
  const supabase = createBrowserSupabaseClient();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[Auth] Sign out error:', err);
  } finally {
    clearSession();
  }
}
