'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getRealUserSession, UserSession, UserRole } from '@/lib/auth';
import { PAYMENT_TOKEN_ADDRESS, truncateAddress, getExplorerTxUrl } from '@/lib/base';
import { getBrowserPublicClient, getBrowserWalletClient, CHAIN_ID } from '@/lib/chain';
import { getUpgradeStatus, checkWalletCapabilities, triggerSmartAccountUpgrade, UpgradeStatusResult } from '@/lib/eip7702';
import { getCardRegistryAddress, CARD_REGISTRY_ABI, ERC20_ABI } from '@/lib/contracts';
import { isAddress, parseUnits, type Address, type Hash, type Hex } from 'viem';
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
  ExternalLink,
  Info,
  Clock,
  Radio,
} from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [session, setSession] = useState<UserSession | null>(null);

  // Flow role selection
  const [role, setRole] = useState<'payer' | 'merchant'>('payer');

  // Stepper state: 1 to 5
  // Step 1: Account Created & Email Confirmed (Done)
  // Step 2: Connect MetaMask (Sepolia)
  // Step 3: Upgrade to Smart Account (EIP-7702)
  // Step 4: ERC-7715 Permission Delegation
  // Step 5: Card Registration (On-Chain)
  const [step, setStep] = useState<number>(2);

  // Step 2 state: Wallet connection
  const [connectedAddress, setConnectedAddress] = useState<Address | null>(null);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Step 3 state: Smart account upgrade
  const [upgradeStatus, setUpgradeStatus] = useState<UpgradeStatusResult>({ status: 'not_upgraded' });
  const [isCheckingUpgrade, setIsCheckingUpgrade] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  // Step 4 state: ERC-7715 Permission
  const [spendingLimit, setSpendingLimit] = useState<string>('25'); // USDC
  const [customLimit, setCustomLimit] = useState<string>('');
  const [isCustomLimit, setIsCustomLimit] = useState(false);
  const [expiryDays, setExpiryDays] = useState<string>(
    process.env.NEXT_PUBLIC_PERMISSION_DEFAULT_EXPIRY_DAYS || '30'
  );
  const [isSavingPermission, setIsSavingPermission] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Step 5 state: Card Registration
  const [cardUid, setCardUid] = useState('');
  const [isRegisteringCard, setIsRegisteringCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [registeredCardTx, setRegisteredCardTx] = useState<string | null>(null);

  // Merchant Onboarding inputs
  const [businessName, setBusinessName] = useState('');
  const [merchantSlug, setMerchantSlug] = useState('');
  const [payoutAddress, setPayoutAddress] = useState('');
  const [isSubmittingMerchant, setIsSubmittingMerchant] = useState(false);
  const [merchantSuccess, setMerchantSuccess] = useState(false);

  // Load user session
  useEffect(() => {
    async function init() {
      const s = await getRealUserSession();
      if (!s) {
        router.replace('/auth');
        return;
      }
      setSession(s);
      if (s.eoaAddress && isAddress(s.eoaAddress)) {
        setConnectedAddress(s.eoaAddress as Address);
      }
      // Re-fetch primary wallet from Supabase to persist walletId across refresh
      const { data: w } = await supabase
        .from('wallets')
        .select('id, address')
        .eq('user_id', s.id)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (w) {
        setWalletId(w.id);
        if (w.address && isAddress(w.address)) {
          setConnectedAddress(w.address as Address);
          const statusRes = await getUpgradeStatus(w.address as Address);
          setUpgradeStatus(statusRes);
        }
      }
    }
    init();
  }, [router, supabase]);

  // AccountsChanged listener
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccountsChanged = async (accounts: unknown) => {
      const accList = accounts as string[];
      if (accList && accList.length > 0 && isAddress(accList[0])) {
        const newAddr = accList[0].toLowerCase() as Address;
        setConnectedAddress(newAddr);
        const statusRes = await getUpgradeStatus(newAddr);
        setUpgradeStatus(statusRes);
        const s = await getRealUserSession();
        setSession(s);
      }
    };

    window.ethereum.on?.('accountsChanged', handleAccountsChanged);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
    };
  }, []);

  const handleSwitchWallet = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
      await handleConnectWallet();
    } catch (err) {
      console.warn('[Onboarding] Switch wallet error:', err);
    }
  };

  // Ensure user is on Sepolia
  const ensureSepoliaChain = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    const currentId = parseInt(chainIdHex as string, 16);
    if (currentId !== CHAIN_ID) {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
      });
    }
  };

  // Step 2: Connect MetaMask and save via Server verification route
  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    setWalletError(null);

    try {
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask is not installed. Please install MetaMask to proceed.');
      }

      await ensureSepoliaChain();
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0 || !isAddress(accounts[0])) {
        throw new Error('No account selected in MetaMask.');
      }

      const address = accounts[0].toLowerCase() as Address;
      setConnectedAddress(address);

      // Save to server-verified route (/api/wallets/save)
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      const res = await fetch('/api/wallets/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ address }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save wallet on server');
      }

      setWalletId(data.wallet?.id);

      // Check bytecode upgrade status
      const statusRes = await getUpgradeStatus(address);
      setUpgradeStatus(statusRes);

      if (role === 'merchant') {
        setPayoutAddress(address);
      } else {
        setStep(statusRes.status === 'upgraded' ? 4 : 3);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wallet connection error';
      setWalletError(msg);
    } finally {
      setIsConnectingWallet(false);
    }
  };

  // Step 3: Trigger Smart Account Upgrade
  const handleUpgradeAccount = async () => {
    if (!connectedAddress) return;
    setIsUpgrading(true);
    setUpgradeError(null);

    try {
      const res = await triggerSmartAccountUpgrade(connectedAddress, CHAIN_ID);
      if (!res.success) {
        throw new Error(res.error || 'Upgrade call rejected');
      }

      // Poll upgrade status with backoff
      let confirmed = false;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const statusRes = await getUpgradeStatus(connectedAddress);
        if (statusRes.status === 'upgraded') {
          setUpgradeStatus(statusRes);
          confirmed = true;
          break;
        }
      }

      if (confirmed) {
        // Sync with server route
        const { data: authSession } = await supabase.auth.getSession();
        const token = authSession.session?.access_token;
        await fetch('/api/wallets/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ address: connectedAddress }),
        });

        setStep(4);
      } else {
        setUpgradeError('Upgrade transaction submitted. Please check again in a few seconds.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upgrade failed';
      setUpgradeError(msg);
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleRecheckUpgrade = async () => {
    if (!connectedAddress) return;
    setIsCheckingUpgrade(true);
    setUpgradeError(null);
    try {
      const statusRes = await getUpgradeStatus(connectedAddress);
      setUpgradeStatus(statusRes);
      if (statusRes.status === 'upgraded') {
        setStep(4);
      } else {
        setUpgradeError('Account is not yet upgraded to official MetaMask Smart Account.');
      }
    } finally {
      setIsCheckingUpgrade(false);
    }
  };

  // Step 4: Grant Spending Allowance
  const handleGrantPermission = async () => {
    if (!connectedAddress) return;
    setIsSavingPermission(true);
    setPermissionError(null);

    try {
      const activeLimit = isCustomLimit ? customLimit : spendingLimit;
      const numLimit = parseFloat(activeLimit);
      if (isNaN(numLimit) || numLimit <= 0) {
        throw new Error('Please enter a valid spending limit greater than 0.');
      }

      let effectiveWalletId = walletId;
      if (!effectiveWalletId && connectedAddress) {
        const { data: w } = await supabase
          .from('wallets')
          .select('id')
          .eq('address', connectedAddress.toLowerCase())
          .maybeSingle();
        effectiveWalletId = w?.id || null;
      }

      if (!effectiveWalletId) {
        throw new Error('Please connect your wallet before granting spending allowance.');
      }

      // Fetch backend session account
      const sessionRes = await fetch('/api/session-account').then((r) => r.json());
      const sessionAccountAddress = sessionRes?.sessionAccountAddress;
      if (!sessionAccountAddress) {
        throw new Error('Backend session account is currently unavailable.');
      }

      const limitAmountUnits = parseUnits(activeLimit, 6).toString();
      const periodSec = 86400; // 24-hour daily rolling period
      const totalValiditySec = parseInt(expiryDays, 10) * 86400;
      const validUntil = new Date(Date.now() + totalValiditySec * 1000).toISOString();

      // Sign on-chain allowance approval for Session Relayer via MetaMask
      const walletClient = await getBrowserWalletClient(connectedAddress);
      const publicClient = getBrowserPublicClient();

      const approvalTx = await walletClient.writeContract({
        account: connectedAddress,
        address: PAYMENT_TOKEN_ADDRESS as Address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [sessionAccountAddress as Address, BigInt(limitAmountUnits)],
      });

      // Wait 1 confirmation
      await publicClient.waitForTransactionReceipt({
        hash: approvalTx,
        confirmations: 1,
        timeout: 60_000,
      });

      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          walletId: effectiveWalletId,
          sessionAccountAddress,
          tokenAddress: PAYMENT_TOKEN_ADDRESS,
          periodSeconds: periodSec,
          limitAmount: limitAmountUnits,
          validAfter: new Date().toISOString(),
          validUntil,
          grantPayload: {
            type: 'erc20_periodic',
            payerAddress: connectedAddress,
            sessionAccountAddress,
            network: 'Sepolia',
            dailyCapUsdc: activeLimit,
            approvalTxHash: approvalTx,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save spending allowance');
      }

      setStep(5);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error granting permission';
      setPermissionError(msg);
    } finally {
      setIsSavingPermission(false);
    }
  };

  // Step 5: Register Card On-Chain via MetaMask
  const handleRegisterCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardUid.trim() || !connectedAddress) return;

    setIsRegisteringCard(true);
    setCardError(null);

    try {
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      // 1. Obtain salted hash from server
      const prepRes = await fetch('/api/cards/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rawUid: cardUid.trim(), prepareOnly: true }),
      });

      const prepData = await prepRes.json();
      if (!prepRes.ok || !prepData.uidHash) {
        throw new Error(prepData.error || 'Failed to prepare card hash');
      }

      const cardHash = prepData.uidHash as `0x${string}`;

      // 2. Check if already registered on-chain
      let txHash: Hex | undefined;
      const walletClient = await getBrowserWalletClient(connectedAddress);
      const publicClient = getBrowserPublicClient();
      const registryAddress = getCardRegistryAddress() as Address;

      try {
        const onChainCard = (await publicClient.readContract({
          address: registryAddress,
          abi: CARD_REGISTRY_ABI,
          functionName: 'cards',
          args: [cardHash],
        })) as [Address, number, bigint, bigint];

        const [ownerAddr] = onChainCard;
        if (ownerAddr && ownerAddr.toLowerCase() === connectedAddress.toLowerCase()) {
          console.log('[Onboarding] Card already registered on-chain to this owner, skipping registerCard tx.');
        } else if (ownerAddr && ownerAddr !== '0x0000000000000000000000000000000000000000') {
          throw new Error(`This NFC card is registered on-chain to another wallet (${ownerAddr}).`);
        } else {
          txHash = await walletClient.writeContract({
            account: connectedAddress,
            address: registryAddress,
            abi: CARD_REGISTRY_ABI,
            functionName: 'registerCard',
            args: [cardHash, connectedAddress],
          });

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
            timeout: 60_000,
          });

          if (receipt.status !== 'success') {
            throw new Error('On-chain card registration reverted on Sepolia.');
          }
        }
      } catch (checkErr: any) {
        if (checkErr.message?.includes('registered on-chain to another')) throw checkErr;
        txHash = await walletClient.writeContract({
          account: connectedAddress,
          address: registryAddress,
          abi: CARD_REGISTRY_ABI,
          functionName: 'registerCard',
          args: [cardHash, connectedAddress],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });
      }

      // 4. Save confirmed card to database
      const saveRes = await fetch('/api/cards/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rawUid: cardUid.trim(),
          registrationTxHash: txHash,
        }),
      });

      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Failed to save card in database');
      }

      if (txHash) {
        setRegisteredCardTx(txHash);
      }

      // Onboarding complete! Redirect to user dashboard after a brief moment
      setTimeout(() => {
        router.push('/dashboard');
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Card registration failed';
      setCardError(msg);
    } finally {
      setIsRegisteringCard(false);
    }
  };

  // Merchant Profile Submit
  const handleMerchantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !payoutAddress) return;

    if (!connectedAddress) {
      setWalletError('Please connect your settlement wallet before submitting merchant registration.');
      return;
    }

    if (!isAddress(payoutAddress.trim())) {
      setWalletError('Please enter a valid payout Ethereum address.');
      return;
    }

    setIsSubmittingMerchant(true);
    setWalletError(null);

    try {
      const slug = (merchantSlug || businessName.toLowerCase().replace(/[^a-z0-9]/g, '-')).replace(/^-|-$/g, '');

      const { error: dbError } = await supabase.from('merchants').upsert(
        {
          owner_user_id: session.id,
          name: businessName.trim() || 'My Retail Store',
          slug: slug || 'store',
          payout_address: payoutAddress.trim().toLowerCase(),
          status: 'pending',
        },
        { onConflict: 'owner_user_id' }
      );

      if (dbError) throw dbError;

      // Update profile role
      await supabase
        .from('profiles')
        .update({ role: 'merchant' })
        .eq('id', session.id);

      setMerchantSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting merchant application';
      setWalletError(msg);
    } finally {
      setIsSubmittingMerchant(false);
    }
  };

  // Expiration calculation for plain language summary
  const targetExpiryDate = new Date(Date.now() + parseInt(expiryDays, 10) * 86400 * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#071013] text-[#DFE0E2] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <PaidXLogo size={36} />
          </div>
          <h1 className="text-xl font-bold font-mono text-[#DFE0E2]">
            {role === 'payer' ? 'User Onboarding: Non-Custodial Retail Setup' : 'Merchant Registration'}
          </h1>
          <p className="text-xs text-[#AAAAAA] font-mono">
            Contactless Tap Payments on Ethereum Sepolia Testnet
          </p>
        </div>

        {/* Role Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-[#0E1D24] rounded-xl border border-[#1A2E38]">
          <button
            type="button"
            onClick={() => {
              setRole('payer');
              setStep(connectedAddress ? (upgradeStatus.status === 'upgraded' ? 4 : 3) : 2);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all flex items-center justify-center gap-2 ${role === 'payer' ? 'bg-[#5465FF] text-white shadow-md' : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
              }`}
          >
            <User className="w-4 h-4" />
            <span>Customer (Payer)</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('merchant')}
            className={`py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all flex items-center justify-center gap-2 ${role === 'merchant' ? 'bg-[#5465FF] text-white shadow-md' : 'text-[#AAAAAA] hover:text-[#DFE0E2]'
              }`}
          >
            <Store className="w-4 h-4" />
            <span>Retail Merchant</span>
          </button>
        </div>

        {/* 5-Step Stepper for Payer */}
        {role === 'payer' && (
          <div className="flex items-center justify-between px-2 text-xs font-mono">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${s < step
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : s === step
                      ? 'bg-[#5465FF] text-white shadow-md shadow-[#5465FF]/30'
                      : 'bg-[#0B161B] text-slate-500 border border-[#1A2E38]'
                    }`}
                >
                  {s < step ? '✓' : s}
                </div>
                <span className={`hidden sm:inline text-[10px] ${s === step ? 'text-white' : 'text-slate-500'}`}>
                  {s === 1 ? 'Auth' : s === 2 ? 'Wallet' : s === 3 ? 'Upgrade' : s === 4 ? 'Limit' : 'Card'}
                </span>
                {s < 5 && <div className="w-4 sm:w-6 h-[1px] bg-[#1A2E38] mx-0.5" />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 2: CONNECT WALLET */}
        {role === 'payer' && step === 2 && (
          <Card className="p-6 border-[#1A2E38] bg-[#0E1D24] shadow-xl space-y-5">
            <div className="space-y-1">
              <h2 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#5465FF]" />
                Step 2: Connect MetaMask on Sepolia
              </h2>
              <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed">
                Connect your self-custody MetaMask wallet. PaidX never holds your private keys; payments settle directly from your account.
              </p>
            </div>

            {walletError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{walletError}</span>
              </div>
            )}

            <Button
              onClick={handleConnectWallet}
              disabled={isConnectingWallet}
              className="w-full h-11 bg-[#5465FF] hover:bg-[#4353ea] text-white font-mono text-xs flex items-center justify-center gap-2"
            >
              {isConnectingWallet ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting MetaMask...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Connect MetaMask (Ethereum Sepolia)
                </>
              )}
            </Button>
          </Card>
        )}

        {/* STEP 3: EIP-7702 UPGRADE */}
        {role === 'payer' && step === 3 && (
          <Card className="p-6 border-[#1A2E38] bg-[#0E1D24] shadow-xl space-y-5">
            <div className="space-y-1">
              <h2 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Step 3: Upgrade to MetaMask Smart Account (EIP-7702)
              </h2>
              <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed">
                PaidX uses official MetaMask Smart Accounts to enable scoped execution permissions for physical NFC card taps.
              </p>
            </div>

            <div className="p-4 bg-[#071013] rounded-xl border border-[#1A2E38] space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-[#AAAAAA]">Account:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white select-all">{truncateAddress(connectedAddress)}</span>
                  <button
                    type="button"
                    onClick={handleSwitchWallet}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-mono"
                  >
                    Change Wallet
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#AAAAAA]">Account Status:</span>
                <Badge variant={upgradeStatus.status === 'upgraded' ? 'active' : 'warning'}>
                  {upgradeStatus.status === 'upgraded' ? 'MetaMask Smart Account' : upgradeStatus.isForeignDelegation ? 'Delegated (Foreign)' : 'EOA'}
                </Badge>
              </div>
              {upgradeStatus.warning && (
                <div className="text-[11px] text-amber-400 pt-1 border-t border-[#1A2E38]/50">
                  {upgradeStatus.warning}
                </div>
              )}
            </div>

            {upgradeError && (
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-col gap-2 font-mono">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>{upgradeError}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(4)}
                  className="w-full mt-1 font-mono text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                >
                  Continue with Standard Wallet &rarr;
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <Button
                onClick={handleUpgradeAccount}
                disabled={isUpgrading}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs flex items-center justify-center gap-2"
              >
                {isUpgrading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Waiting for Upgrade Confirmation...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Upgrade to Smart Account
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between pt-1 px-1">
                <button
                  type="button"
                  onClick={handleRecheckUpgrade}
                  disabled={isCheckingUpgrade}
                  className="text-xs font-mono text-indigo-400 hover:underline inline-flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingUpgrade ? 'animate-spin' : ''}`} />
                  Check Upgrade Status
                </button>

                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="text-xs font-mono text-emerald-400 hover:underline inline-flex items-center gap-1 font-bold"
                >
                  Skip & Continue &rarr;
                </button>
              </div>
            </div>

            {/* Manual Fallback Explanation */}
            <div className="p-3 bg-[#0B161B] rounded-lg border border-[#1A2E38] text-[11px] font-mono text-[#888888] space-y-1">
              <p className="text-slate-300 font-bold">Manual Upgrade Steps:</p>
              <p>1. Open MetaMask &rarr; Account Selector &rarr; Settings.</p>
              <p>2. Toggle on "Enable Smart Account features".</p>
              <p>3. Click "Check Upgrade Status Again" above.</p>
            </div>
          </Card>
        )}

        {/* STEP 4: DIRECT ON-CHAIN SPENDING ALLOWANCE */}
        {role === 'payer' && step === 4 && (
          <Card className="p-6 border-[#1A2E38] bg-[#0E1D24] shadow-xl space-y-5">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <h2 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Step 4: Direct On-Chain Spending Allowance
                </h2>
                <button
                  type="button"
                  onClick={handleSwitchWallet}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-mono"
                >
                  Change Wallet
                </button>
              </div>
              <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed">
                Approves a daily rolling spending allowance for the PaidX Session Relayer directly in on-chain Circle USDC. Funds remain non-custodial in your self-custody wallet until you tap at a counter terminal.
              </p>
            </div>

            {/* Presets + Custom Limit */}
            <div className="space-y-2">
              <label className="block text-xs font-mono text-slate-300">Daily Spending Limit (USDC)</label>
              <div className="grid grid-cols-4 gap-2">
                {['10', '25', '50', '100'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSpendingLimit(preset);
                      setIsCustomLimit(false);
                    }}
                    className={`py-2 rounded-lg text-xs font-mono font-bold border transition-all ${!isCustomLimit && spendingLimit === preset
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-[#071013] text-slate-400 border-[#1A2E38] hover:border-slate-600'
                      }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomLimit(!isCustomLimit)}
                  className="text-xs font-mono text-indigo-400 hover:underline"
                >
                  {isCustomLimit ? 'Choose from presets' : 'Enter custom limit'}
                </button>
                {isCustomLimit && (
                  <Input
                    type="number"
                    placeholder="e.g. 75"
                    value={customLimit}
                    onChange={(e) => setCustomLimit(e.target.value)}
                    className="mt-2 bg-[#071013] border-[#1A2E38] text-white"
                  />
                )}
              </div>
            </div>

            {/* Expiry Presets */}
            <div className="space-y-2">
              <label className="block text-xs font-mono text-slate-300">Permission Expiry</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '7 Days', val: '7' },
                  { label: '30 Days', val: '30' },
                  { label: '90 Days', val: '90' },
                ].map((exp) => (
                  <button
                    key={exp.val}
                    type="button"
                    onClick={() => setExpiryDays(exp.val)}
                    className={`py-2 rounded-lg text-xs font-mono font-medium border transition-all ${expiryDays === exp.val
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-[#071013] text-slate-400 border-[#1A2E38] hover:border-slate-600'
                      }`}
                  >
                    {exp.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Plain Language Summary */}
            <div className="p-4 bg-[#071013] rounded-xl border border-indigo-500/30 text-xs font-mono text-indigo-300 space-y-1">
              <p className="font-bold text-white flex items-center gap-1.5">
                <Info className="w-4 h-4 text-indigo-400" />
                Plain-Language Permission Summary:
              </p>
              <p className="text-slate-300">
                PaidX can spend up to{' '}
                <strong className="text-emerald-400">${isCustomLimit ? customLimit || '0' : spendingLimit} USDC</strong>{' '}
                per day until <strong className="text-white">{targetExpiryDate}</strong>.
              </p>
              <p className="text-[11px] text-slate-400">
                You can revoke or adjust this permission anytime from your dashboard.
              </p>
            </div>

            {permissionError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {permissionError}
              </div>
            )}

            <Button
              onClick={handleGrantPermission}
              disabled={isSavingPermission}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs flex items-center justify-center gap-2"
            >
              {isSavingPermission ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Sign Spending Allowance in MetaMask...
                </>
              ) : (
                <>
                  <span>Sign Allowance & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </Card>
        )}

        {/* STEP 5: ISSUE PHYSICAL NFC CARD */}
        {role === 'payer' && step === 5 && (
          <Card className="p-6 border-[#1A2E38] bg-[#0E1D24] shadow-xl space-y-5">
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <h2 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  Step 5: Issue Physical NFC Card On-Chain
                </h2>
                <button
                  type="button"
                  onClick={handleSwitchWallet}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-mono"
                >
                  Change Wallet
                </button>
              </div>
              <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed">
                Enter your physical NFC card UID. Your account will execute an on-chain registration on the Sepolia CardRegistry contract.
              </p>
            </div>

            {registeredCardTx ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center space-y-2 font-mono">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">Card Successfully Issued & Registered On-Chain!</h3>
                <a
                  href={getExplorerTxUrl(registeredCardTx)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-400 hover:underline flex items-center justify-center gap-1"
                >
                  View Receipt on Sepolia Etherscan <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-xs text-slate-400 pt-2">Redirecting to your dashboard...</p>
              </div>
            ) : (
              <form onSubmit={handleRegisterCard} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1.5">
                    Physical NFC Card UID
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. 04:A2:B3:C4:D5:E6:F7"
                    value={cardUid}
                    onChange={(e) => setCardUid(e.target.value)}
                    className="bg-[#071013] border-[#1A2E38] font-mono text-xs text-white"
                  />
                  <p className="text-[11px] text-slate-500 font-mono mt-1">
                    Raw UID is salted with CARD_UID_SALT and never stored in plain text.
                  </p>
                </div>

                {cardError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {cardError}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isRegisteringCard || !cardUid.trim()}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs flex items-center justify-center gap-2"
                >
                  {isRegisteringCard ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sign Transaction in MetaMask...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Sign On-Chain Registration (Sepolia ETH)
                    </>
                  )}
                </Button>
              </form>
            )}
          </Card>
        )}

        {/* MERCHANT ONBOARDING */}
        {role === 'merchant' && (
          <Card className="p-6 border-[#1A2E38] bg-[#0E1D24] shadow-xl space-y-5">
            <div className="space-y-1">
              <h2 className="text-sm font-mono font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-400" />
                Merchant Application & Settlement Configuration
              </h2>
              <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed">
                Register your retail store on Ethereum Sepolia. In accordance with protocol governance, merchant registrations must be approved on-chain by the protocol administrator.
              </p>
            </div>

            {merchantSuccess ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center space-y-3 font-mono">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h3 className="text-sm font-bold text-white">Application Submitted! Status: Pending</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Your store payout address is registered. Once approved on-chain by the protocol admin on the Sepolia MerchantRegistry, your store will become active.
                </p>
                <Button
                  onClick={() => router.push('/merchant')}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
                >
                  Go to Merchant Dashboard
                </Button>
              </div>
            ) : (
              <form onSubmit={handleMerchantSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1.5">
                    Business / Store Name
                  </label>
                  <Input
                    type="text"
                    required
                    placeholder="e.g. Apex Coffee & Bakery"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="bg-[#071013] border-[#1A2E38] text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono text-slate-300 mb-1.5">
                    Store URL Identifier (Slug)
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. apex-coffee"
                    value={merchantSlug}
                    onChange={(e) => setMerchantSlug(e.target.value)}
                    className="bg-[#071013] border-[#1A2E38] font-mono text-xs text-white"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-mono text-slate-300">
                      Settlement Payout Address
                    </label>
                    {connectedAddress && (
                      <button
                        type="button"
                        onClick={() => setPayoutAddress(connectedAddress)}
                        className="text-xs font-mono text-indigo-400 hover:underline"
                      >
                        Use Connected Wallet
                      </button>
                    )}
                  </div>
                  <Input
                    type="text"
                    required
                    placeholder="0x..."
                    value={payoutAddress}
                    onChange={(e) => setPayoutAddress(e.target.value)}
                    className="bg-[#071013] border-[#1A2E38] font-mono text-xs text-white"
                  />
                  <p className="text-[11px] text-slate-500 font-mono mt-1">
                    All retail USDC customer payments will settle directly to this address.
                  </p>
                </div>

                {walletError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {walletError}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmittingMerchant}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs flex items-center justify-center gap-2"
                >
                  {isSubmittingMerchant ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Submitting Application...
                    </>
                  ) : (
                    <>
                      <Store className="w-4 h-4" />
                      Submit Merchant Application
                    </>
                  )}
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
