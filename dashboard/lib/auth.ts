export type UserRole = 'payer' | 'merchant' | 'normal_user' | 'super_admin';
export type OnboardingStep = 'wallet_selection' | 'role_selection' | 'profile_setup' | 'completed';

export interface UserSession {
  id: string;
  identifier: string; // email or phone
  type: 'email' | 'phone';
  fullName: string;
  role: UserRole;
  onboardingStep: OnboardingStep;
  smartAccountAddress: string;
  eoaAddress: string;
  currencyPreference: 'USDC' | 'ETH';
  merchantProfile?: {
    businessName: string;
    slug: string;
    receivingAddress: string;
  };
}

const STORAGE_KEY = 'paidx_session_v1';

export const DEFAULT_DEMO_USER: UserSession = {
  id: 'usr_8453_92f01',
  identifier: 'alex@paidx.cc',
  type: 'email',
  fullName: 'Alex Vance',
  role: 'payer',
  onboardingStep: 'completed',
  smartAccountAddress: '0x845300B7F8C4328E253A04aF1492B19e273f5544',
  eoaAddress: '0x17A8f64593C29E6566D290525Fe57E6D6497B47C',
  currencyPreference: 'USDC',
  merchantProfile: {
    businessName: 'Apex Artisan Coffee',
    slug: 'apex-coffee',
    receivingAddress: '0x99A371F62a34DE9aC328Ea6C7f285F540fDEB456',
  },
};

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

export function saveSession(session: UserSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function createNewSession(
  identifier: string,
  type: 'email' | 'phone'
): UserSession {
  // Generate a random counterfactual mock address on Base
  const randomHex = Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  const smartAccountAddress = `0x${randomHex}`;
  const randomEoa = `0x${Array.from({ length: 40 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')}`;

  const session: UserSession = {
    id: `usr_${Date.now()}`,
    identifier,
    type,
    fullName: identifier.split('@')[0] || 'PaidX Member',
    role: 'normal_user',
    onboardingStep: 'wallet_selection',
    smartAccountAddress,
    eoaAddress: randomEoa,
    currencyPreference: 'USDC',
  };

  saveSession(session);
  return session;
}
