'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession, saveSession, UserSession, UserRole } from '@/lib/auth';
import { PAYMENT_TOKEN_ADDRESS, truncateAddress } from '@/lib/base';
import { getBrowserPublicClient, CHAIN_ID } from '@/lib/chain';
import type { Address } from 'viem';
import {
  Wallet,
  CreditCard,
  Store,
  User,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Link2,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [session, setSession] = useState<UserSession | null>(null);

  // Funnel steps: 1 = Wallet, 2 = Role & Profile
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Wallet state
  const [walletChoice, setWalletChoice] = useState<'create' | 'link'>('create');
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [connectedEoa, setConnectedEoa] = useState<string | null>(null);
  const [smartAccountStatus, setSmartAccountStatus] = useState<'upgraded' | 'eoa' | 'unknown'>('unknown');
  const [isCheckingBytecode, setIsCheckingBytecode] = useState(false);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Step 2: Role & Profile state
  const [selectedRole, setSelectedRole] = useState<UserRole>('payer');
  const [fullName, setFullName] = useState('');
  const [currencyPref, setCurrencyPref] = useState<'USDC' | 'ETH'>('USDC');

  // Spending limit selection for payer (ERC-7715)
  const [spendingLimit, setSpendingLimit] = useState('100'); // USDC
  const [expiryDays, setExpiryDays] = useState('30'); // Days

  // Merchant specific inputs
  const [businessName, setBusinessName] = useState('');
  const [merchantSlug, setMerchantSlug] = useState('');
  const [receivingAddress, setReceivingAddress] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadSession() {
      const s = await getRealUserSession();
      if (!s) {
        router.replace('/auth');
      } else {
        setSession(s);
        setFullName(s.fullName || '');
        if (s.smartAccountAddress || s.eoaAddress) {
          setConnectedEoa(s.smartAccountAddress || s.eoaAddress || null);
        }
      }
    }
    loadSession();
  }, [router]);

  /**
   * Resiliently inspects bytecode on Sepolia to verify if upgraded to smart account.
   * Never crashes the page and never blocks the connection.
   */
  const checkBytecodeStatus = async (address: string): Promise<boolean | null> => {
    setIsCheckingBytecode(true);
    setNetworkWarning(null);

    try {
      const publicClient = getBrowserPublicClient();
      const bytecode = await publicClient.getBytecode({
        address: address as Address,
      });

      const isUpgraded = Boolean(bytecode && bytecode !== '0x');
      setSmartAccountStatus(isUpgraded ? 'upgraded' : 'eoa');
      return isUpgraded;
    } catch (err: unknown) {
      console.warn('[Smart Account Network Check Notice]:', err);
      setSmartAccountStatus('unknown');
      setNetworkWarning("Couldn't check your account on the network. Retry");
      return null;
    } finally {
      setIsCheckingBytecode(false);
    }
  };

  /**
   * Switches connected MetaMask wallet to Sepolia (11155111) if not already on it.
   */
  const ensureSepoliaChain = async () => {
    // @ts-expect-error window.ethereum
    if (!window.ethereum) return;

    // @ts-expect-error window.ethereum
    const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const currentChainId = parseInt(currentChainIdHex, 16);

    if (currentChainId !== CHAIN_ID) {
      const sepoliaHex = `0x${CHAIN_ID.toString(16)}`;
      try {
        // @ts-expect-error window.ethereum
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: sepoliaHex }],
        });
      } catch (switchError: any) {
        // 4902 indicates that the chain has not been added to MetaMask
        if (switchError?.code === 4902 || switchError?.data?.originalError?.code === 4902) {
          const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || '';
          // @ts-expect-error window.ethereum
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: sepoliaHex,
                chainName: 'Ethereum Sepolia',
                nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: rpcUrl ? [rpcUrl] : [],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              },
            ],
          });
        } else {
          throw new Error(`Please switch MetaMask to Ethereum Sepolia (Chain ID: ${CHAIN_ID})`);
        }
      }
    }
  };

  // Connect MetaMask EOA & Detect Smart Account Status
  const handleConnectWallet = async () => {
    setWalletError(null);
    setNetworkWarning(null);
    setIsWalletConnecting(true);

    try {
      // @ts-expect-error window.ethereum
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask is not installed. Please install the MetaMask browser extension to proceed.');
      }

      // @ts-expect-error window.ethereum
      const accounts: string[] = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected in MetaMask');
      }

      // Ensure user is on Ethereum Sepolia
      await ensureSepoliaChain();

      const eoa = accounts[0].toLowerCase();
      setConnectedEoa(eoa);

      // Inspect bytecode resiliently (non-blocking)
      const isUpgraded = await checkBytecodeStatus(eoa);

      // Persist wallet record in Supabase
      if (session) {
        const { error: walletDbError } = await supabase.from('wallets').upsert(
          {
            user_id: session.id,
            address: eoa,
            chain_id: CHAIN_ID,
            kind: isUpgraded ? 'metamask_smart_account' : 'eoa',
            is_primary: true,
            smart_account_upgraded: Boolean(isUpgraded),
          },
          { onConflict: 'chain_id, address' }
        );

        if (walletDbError) {
          console.warn('[DB] Wallet upsert warning:', walletDbError.message);
        }
      }

      setStep(2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wallet connection failed';
      setWalletError(msg);
    } finally {
      setIsWalletConnecting(false);
    }
  };

  // Complete Profile & Role Configuration
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !connectedEoa) return;

    setIsLoading(true);

    try {
      // 1. Update Profile display name & role
      await supabase
        .from('profiles')
        .update({
          display_name: fullName || session.fullName,
          role: selectedRole === 'merchant' ? 'merchant' : 'user',
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.id);

      // 2. If Merchant, register merchant in database
      let merchantId = '';
      if (selectedRole === 'merchant') {
        const slug = (merchantSlug || businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')).replace(/^-|-$/g, '');
        const payout = (receivingAddress || connectedEoa).toLowerCase();

        const { data: merchantData, error: merchantError } = await supabase
          .from('merchants')
          .upsert(
            {
              user_id: session.id,
              business_name: businessName || 'My Store',
              slug: slug || 'merchant',
              payout_address: payout,
              chain_id: CHAIN_ID,
              is_active: true,
            },
            { onConflict: 'id' }
          )
          .select()
          .single();

        if (merchantError) {
          console.warn('[DB] Merchant upsert warning:', merchantError.message);
        }
        if (merchantData) {
          merchantId = merchantData.id;
        }
      }

      // 3. If Payer, create initial ERC-7715 permission via server API
      if (selectedRole === 'payer') {
        try {
          const { data: sessionInfo } = await fetch('/api/session-account').then((r) => r.json());
          const sessionAccountAddress = sessionInfo?.sessionAccountAddress;

          if (sessionAccountAddress) {
            // Get wallet ID from DB
            const { data: walletRecord } = await supabase
              .from('wallets')
              .select('id')
              .eq('user_id', session.id)
              .eq('address', connectedEoa)
              .maybeSingle();

            if (walletRecord) {
              const { data: authSession } = await supabase.auth.getSession();
              const token = authSession.session?.access_token;
              const limitAmountUnits = (BigInt(spendingLimit || '100') * 1_000_000n).toString();
              const periodSec = 86400 * parseInt(expiryDays || '30', 10);
              const validUntil = new Date(Date.now() + periodSec * 1000).toISOString();

              await fetch('/api/permissions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                  walletId: walletRecord.id,
                  sessionAccountAddress,
                  tokenAddress: PAYMENT_TOKEN_ADDRESS,
                  periodSeconds: 86400, // 24-hour periodic rolling window
                  limitAmount: limitAmountUnits,
                  validAfter: new Date().toISOString(),
                  validUntil,
                  grantPayload: {
                    type: 'erc20_periodic',
                    payerAddress: connectedEoa,
                    sessionAccountAddress,
                    network: 'Sepolia',
                  },
                }),
              });
            }
          }
        } catch (permErr) {
          console.warn('[Permission] Initial permission request note:', permErr);
        }
      }

      // Sync and redirect
      await getRealUserSession();

      if (selectedRole === 'merchant') {
        router.push('/merchant');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error completing onboarding';
      setWalletError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#071013] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="w-full max-w-xl space-y-6 relative z-10">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <PaidXLogo size={36} />
          </div>
          <h1 className="text-xl font-bold font-mono text-[#DFE0E2]">
            {step === 1 ? 'Step 1: Non-Custodial Wallet Setup' : 'Step 2: Profile & Role Configuration'}
          </h1>
          <p className="text-xs text-[#AAAAAA] font-mono">
            {step === 1
              ? 'Connect your wallet for Ethereum Sepolia settlement'
              : 'Customize your PaidX experience based on how you participate'}
          </p>
        </div>

        {/* Funnel Progress Indicator */}
        <div className="flex items-center justify-center gap-3">
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
              step === 1
                ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
              {step > 1 ? '✓' : '1'}
            </span>
            <span>Wallet</span>
          </div>

          <div className="w-8 h-[1px] bg-[#1A2E38]" />

          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border ${
              step === 2
                ? 'bg-[#5465FF]/20 text-[#5465FF] border-[#5465FF]'
                : 'bg-[#0B161B] text-[#666666] border-[#1A2E38]'
            }`}
          >
            <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
              2
            </span>
            <span>Role & Profile</span>
          </div>
        </div>

        {/* STEP 1: WALLET SETUP */}
        {step === 1 && (
          <Card className="space-y-6 border-[#1A2E38]">
            <div className="space-y-4">
              {/* Option: Connect MetaMask */}
              <div
                onClick={() => setWalletChoice('create')}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-3.5 ${
                  walletChoice === 'create'
                    ? 'bg-[#0E1D24] border-[#5465FF] shadow-sm shadow-[#5465FF]/20'
                    : 'bg-[#071013] border-[#1A2E38] hover:border-[#1A2E38]/80'
                }`}
              >
                <div
                  className={`p-2 rounded-lg ${
                    walletChoice === 'create'
                      ? 'bg-[#5465FF] text-white'
                      : 'bg-[#0B161B] text-[#AAAAAA]'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold text-[#DFE0E2]">
                      Connect MetaMask (Ethereum Sepolia)
                    </h3>
                    <Badge variant="info">ERC-7715 / ERC-7710</Badge>
                  </div>
                  <p className="text-[11px] font-mono text-[#AAAAAA] mt-1">
                    Connect your MetaMask account. Automatically detects smart account upgrade status
                    and configures non-custodial POS permissions.
                  </p>
                </div>
              </div>

              {/* Notice on Coinbase Wallet */}
              <div className="p-3 rounded-lg bg-[#071013] border border-[#1A2E38] flex items-center gap-2 text-[11px] font-mono text-[#888888]">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Coinbase Wallet is deferred due to delegation permissions constraints; MetaMask is the active supported provider.
                </span>
              </div>

              {walletError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs font-mono">
                  {walletError}
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              className="w-full font-mono text-xs"
              onClick={handleConnectWallet}
              isLoading={isWalletConnecting}
            >
              <span>Connect MetaMask & Verify</span>
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Card>
        )}

        {/* STEP 2: ROLE & PROFILE SELECTION */}
        {step === 2 && (
          <Card className="space-y-6 border-[#1A2E38]">
            {/* Account Status Badge */}
            <div className="p-3 rounded-lg bg-[#0E1D24] border border-[#1A2E38] flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono text-[#888888]">Connected Wallet (Sepolia)</p>
                <p className="text-xs font-mono text-[#5465FF] font-bold">
                  {truncateAddress(connectedEoa)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    smartAccountStatus === 'upgraded'
                      ? 'active'
                      : smartAccountStatus === 'eoa'
                      ? 'default'
                      : 'warning'
                  }
                >
                  {smartAccountStatus === 'upgraded'
                    ? 'Smart Account Deployed'
                    : smartAccountStatus === 'eoa'
                    ? 'Standard EOA'
                    : 'Status Unknown'}
                </Badge>
              </div>
            </div>

            {/* Non-blocking network check warning banner with retry */}
            {networkWarning && connectedEoa && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-900/60 flex items-center justify-between text-xs font-mono text-amber-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{networkWarning}</span>
                </div>
                <button
                  type="button"
                  onClick={() => checkBytecodeStatus(connectedEoa)}
                  disabled={isCheckingBytecode}
                  className="px-2.5 py-1 rounded bg-amber-900/60 hover:bg-amber-900 text-amber-200 inline-flex items-center gap-1 text-[11px] font-mono"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingBytecode ? 'animate-spin' : ''}`} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-5">
              {/* Role Cards */}
              <div className="space-y-2">
                <label className="block text-xs font-mono font-medium text-[#DFE0E2]">
                  Select Account Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Payer */}
                  <div
                    onClick={() => setSelectedRole('payer')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedRole === 'payer'
                        ? 'bg-[#0E1D24] border-[#5465FF] shadow-sm shadow-[#5465FF]/20'
                        : 'bg-[#071013] border-[#1A2E38] hover:border-[#1A2E38]/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <CreditCard className="w-4 h-4 text-[#5465FF]" />
                      <span className="text-xs font-mono font-bold text-[#DFE0E2]">Payer</span>
                    </div>
                    <p className="text-[11px] font-mono text-[#AAAAAA]">
                      Tap physical NFC card to pay at stores with spending limits.
                    </p>
                  </div>

                  {/* Merchant */}
                  <div
                    onClick={() => setSelectedRole('merchant')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedRole === 'merchant'
                        ? 'bg-[#0E1D24] border-[#5465FF] shadow-sm shadow-[#5465FF]/20'
                        : 'bg-[#071013] border-[#1A2E38] hover:border-[#1A2E38]/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Store className="w-4 h-4 text-[#5465FF]" />
                      <span className="text-xs font-mono font-bold text-[#DFE0E2]">Merchant</span>
                    </div>
                    <p className="text-[11px] font-mono text-[#AAAAAA]">
                      Accept contactless crypto payments on phone POS & manage terminals.
                    </p>
                  </div>
                </div>
              </div>

              {/* Common Fields */}
              <Input
                label="Full Name or Handle"
                placeholder="e.g. Satoshi Nakamoto"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />

              {/* Payer Specific Settings */}
              {selectedRole === 'payer' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-[#071013] border border-[#1A2E38]">
                  <h4 className="text-xs font-mono font-bold text-[#DFE0E2] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#5465FF]" />
                    <span>ERC-7715 Periodic Spending Limit</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Limit (USDC)"
                      type="number"
                      min="1"
                      value={spendingLimit}
                      onChange={(e) => setSpendingLimit(e.target.value)}
                      helperText="Spending cap per 24 hours"
                    />
                    <Input
                      label="Validity (Days)"
                      type="number"
                      min="1"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      helperText="Permission duration"
                    />
                  </div>
                </div>
              )}

              {/* Merchant Specific Fields */}
              {selectedRole === 'merchant' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-[#071013] border border-[#1A2E38]">
                  <h4 className="text-xs font-mono font-bold text-[#DFE0E2]">
                    Merchant Business Profile
                  </h4>
                  <Input
                    label="Business Name"
                    placeholder="e.g. Apex Artisan Coffee"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                  />
                  <Input
                    label="Store URL Slug"
                    placeholder="e.g. apex-coffee"
                    value={merchantSlug}
                    onChange={(e) => setMerchantSlug(e.target.value)}
                    helperText="Unique identifier for POS terminals"
                  />
                  <Input
                    label="USDC Receiving Address"
                    placeholder="0x..."
                    value={receivingAddress || connectedEoa || ''}
                    onChange={(e) => setReceivingAddress(e.target.value)}
                    helperText="Sepolia address where retail payments settle"
                  />
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full font-mono text-xs"
                isLoading={isLoading}
              >
                <span>Save Profile & Launch Console</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
