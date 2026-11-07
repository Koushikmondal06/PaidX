'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PaidXLogo } from '@/components/ui/PaidXLogo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { getRealUserSession, UserSession } from '@/lib/auth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getMerchantRegistryAddress, MERCHANT_REGISTRY_ABI } from '@/lib/contracts';
import { getBrowserPublicClient, getBrowserWalletClient, CHAIN_ID } from '@/lib/chain';
import { getExplorerTxUrl, getExplorerAddressUrl, truncateAddress } from '@/lib/base';
import { isAddress, keccak256, stringToHex, type Address, type Hash } from 'viem';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Store,
  PauseCircle,
  PlayCircle,
  Lock,
  ArrowRight,
  UserCheck,
} from 'lucide-react';

interface MerchantRecord {
  id: string;
  name: string;
  payout_address: string;
  status: 'pending' | 'active' | 'suspended';
  register_tx_hash: string | null;
  created_at: string;
}

export default function AdminDashboardPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<Address | null>(null);
  const [onChainOwner, setOnChainOwner] = useState<Address | null>(null);

  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [merchants, setMerchants] = useState<MerchantRecord[]>([]);
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ msg: string; txHash?: string; isError?: boolean } | null>(null);

  const supabase = createBrowserSupabaseClient();

  // 1. Verify Authentication & On-Chain Owner Gating
  const verifyAdminAccess = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    try {
      const s = await getRealUserSession();
      setSession(s);

      if (!s) {
        setAuthError('You must sign in to access the protocol admin console.');
        setIsAuthorized(false);
        return;
      }

      // Check profiles.role === 'admin'
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', s.id)
        .single();

      if (profile?.role !== 'admin') {
        setAuthError('Access Denied: Your account role is not registered as admin in PaidX.');
        setIsAuthorized(false);
        return;
      }

      // Check MetaMask connected address
      if (typeof window === 'undefined' || !window.ethereum) {
        setAuthError('MetaMask browser extension is required for on-chain administrative signing.');
        setIsAuthorized(false);
        return;
      }

      const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
      if (!accounts || accounts.length === 0) {
        setAuthError('Please connect your admin MetaMask account.');
        setIsAuthorized(false);
        return;
      }

      const connected = accounts[0].toLowerCase() as Address;
      setConnectedAddress(connected);

      // Read owner() from MerchantRegistry on-chain
      const registryAddress = getMerchantRegistryAddress() as Address;
      const publicClient = getBrowserPublicClient();
      const owner = (await publicClient.readContract({
        address: registryAddress,
        abi: MERCHANT_REGISTRY_ABI,
        functionName: 'owner',
      })) as Address;

      setOnChainOwner(owner.toLowerCase() as Address);

      // Must equal owner()
      if (connected.toLowerCase() !== owner.toLowerCase()) {
        setAuthError(
          `Access Denied: Connected MetaMask address (${truncateAddress(connected)}) is not the on-chain owner of MerchantRegistry (${truncateAddress(owner)}).`
        );
        setIsAuthorized(false);
        return;
      }

      setIsAuthorized(true);
    } catch (err: unknown) {
      console.error('[Admin Auth Notice]:', err);
      const msg = err instanceof Error ? err.message : 'Error validating admin credentials';
      setAuthError(msg);
      setIsAuthorized(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, [supabase]);

  useEffect(() => {
    verifyAdminAccess();
  }, [verifyAdminAccess]);

  // 2. Fetch Merchants
  const fetchMerchants = useCallback(async () => {
    if (!isAuthorized) return;
    setIsLoadingMerchants(true);

    try {
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      const res = await fetch('/api/admin/merchants', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await res.json();
      if (res.ok && data.merchants) {
        setMerchants(data.merchants);
      }
    } catch (err) {
      console.warn('[Admin Merchants Load Error]:', err);
    } finally {
      setIsLoadingMerchants(false);
    }
  }, [isAuthorized, supabase]);

  useEffect(() => {
    if (isAuthorized) {
      fetchMerchants();
    }
  }, [isAuthorized, fetchMerchants]);

  // Connect MetaMask helper
  const handleConnect = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      await verifyAdminAccess();
    } catch (err) {
      console.warn('[Connect Error]:', err);
    }
  };

  // 3. Approve Merchant on-chain
  const handleApprove = async (merchant: MerchantRecord) => {
    setActionInProgress(merchant.id);
    setActionFeedback(null);

    try {
      if (!connectedAddress) {
        throw new Error('MetaMask admin wallet is not connected.');
      }
      const walletClient = await getBrowserWalletClient(connectedAddress);
      const publicClient = getBrowserPublicClient();
      const registryAddress = getMerchantRegistryAddress() as Address;

      const merchantIdBytes32 = keccak256(stringToHex(merchant.id));
      const payout = merchant.payout_address as Address;

      const hash = await walletClient.writeContract({
        account: connectedAddress,
        address: registryAddress,
        abi: MERCHANT_REGISTRY_ABI,
        functionName: 'registerMerchant',
        args: [merchantIdBytes32, payout],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000,
      });

      if (receipt.status !== 'success') {
        throw new Error('On-chain transaction reverted on Sepolia');
      }

      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      await fetch('/api/admin/merchants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          merchantId: merchant.id,
          status: 'active',
          txHash: hash,
        }),
      });

      setActionFeedback({
        msg: `Merchant "${merchant.name}" approved on-chain!`,
        txHash: hash,
      });
      await fetchMerchants();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval transaction failed';
      setActionFeedback({ msg, isError: true });
    } finally {
      setActionInProgress(null);
    }
  };

  // 4. Suspend / Toggle Merchant Status on-chain
  const handleToggleStatus = async (merchant: MerchantRecord, targetActive: boolean) => {
    setActionInProgress(merchant.id);
    setActionFeedback(null);

    try {
      if (!connectedAddress) {
        throw new Error('MetaMask admin wallet is not connected.');
      }
      const walletClient = await getBrowserWalletClient(connectedAddress);
      const publicClient = getBrowserPublicClient();
      const registryAddress = getMerchantRegistryAddress() as Address;

      const merchantIdBytes32 = keccak256(stringToHex(merchant.id));

      const hash = await walletClient.writeContract({
        account: connectedAddress,
        address: registryAddress,
        abi: MERCHANT_REGISTRY_ABI,
        functionName: 'setMerchantActive',
        args: [merchantIdBytes32, targetActive],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000,
      });

      if (receipt.status !== 'success') {
        throw new Error('On-chain toggle transaction reverted on Sepolia');
      }

      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      await fetch('/api/admin/merchants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          merchantId: merchant.id,
          status: targetActive ? 'active' : 'suspended',
          txHash: hash,
        }),
      });

      setActionFeedback({
        msg: `Merchant status updated to ${targetActive ? 'active' : 'suspended'}!`,
        txHash: hash,
      });
      await fetchMerchants();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status toggle failed';
      setActionFeedback({ msg, isError: true });
    } finally {
      setActionInProgress(null);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-[#1749F5] animate-spin mb-4" />
        <p className="text-[#64748B] dark:text-[#94A3B8] text-sm font-archivo">
          Verifying on-chain protocol administrative rights...
        </p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] text-[#334155] dark:text-[#A9B9D5] flex items-center justify-center p-4 font-archivo">
        <div className="max-w-md w-full p-8 bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] text-center space-y-5">
          <div className="w-16 h-16 bg-[#FEF2F2] dark:bg-red-950/40 border border-red-200 dark:border-red-800/40 rounded-2xl flex items-center justify-center mx-auto text-[#EF4444]">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-[#111111] dark:text-[#F5F8FF]">
              Admin Protocol Gated
            </h1>
            <p className="text-xs text-[#EF4444] leading-relaxed">{authError}</p>
          </div>

          <div className="pt-2 space-y-3">
            <Button
              onClick={handleConnect}
              variant="primary"
              className="w-full text-xs"
            >
              Connect Admin MetaMask Account
            </Button>
            <div>
              <Link href="/dashboard" className="text-xs text-[#64748B] dark:text-[#94A3B8] hover:text-[#1749F5] underline">
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7FC] dark:bg-[#050B1B] text-[#334155] dark:text-[#A9B9D5] p-4 sm:p-8 font-archivo">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
          <div className="flex items-center gap-4">
            <PaidXLogo size={36} />
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold text-[#111111] dark:text-[#F5F8FF] flex items-center gap-2">
                <span>Protocol Administration</span>
                <Badge variant="info">MerchantRegistry Owner</Badge>
              </h1>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Review and approve retail merchants directly to the Base/Sepolia MerchantRegistry contract
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 px-3.5 py-2 rounded-xl text-[#111111] dark:text-[#F5F8FF] shadow-sm">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            <span>Admin: {truncateAddress(connectedAddress)}</span>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`p-4 rounded-2xl border text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              actionFeedback.isError
                ? 'bg-[#FEF2F2] border-red-200 dark:border-red-800/40 text-[#EF4444]'
                : 'bg-[#ECFDF5] border-emerald-200 dark:border-emerald-800/40 text-[#10B981]'
            }`}
          >
            <span>{actionFeedback.msg}</span>
            {actionFeedback.txHash && (
              <a
                href={getExplorerTxUrl(actionFeedback.txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline font-mono text-xs font-medium"
              >
                <span>View on Explorer: {truncateAddress(actionFeedback.txHash)}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {/* Merchants Management Card following Section 5.5 */}
        <div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-[#E2E8F0] dark:border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#ECEEFF] dark:bg-white/10 text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[#111111] dark:text-[#F5F8FF]">
                  Merchant Approval Queue & Registry
                </h2>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                  On-chain merchant authorization status
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchMerchants}
              disabled={isLoadingMerchants}
              className="text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMerchants ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {merchants.length === 0 ? (
            <div className="p-12 text-center text-xs font-archivo text-[#64748B] dark:text-[#94A3B8]">
              No merchant applications found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm font-archivo">
                <thead>
                  <tr className="bg-[#F8FAFC] dark:bg-white/[0.02] border-b border-[#E2E8F0] dark:border-white/10 text-[12px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                    <th className="py-3.5 px-6">Store Name</th>
                    <th className="py-3.5 px-6">Payout Address</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">On-Chain Receipt</th>
                    <th className="py-3.5 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]/70 dark:divide-white/5">
                  {merchants.map((m) => (
                    <tr key={m.id} className="hover:bg-[#F8FAFC]/80 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6 font-semibold text-[#111111] dark:text-[#F5F8FF]">{m.name}</td>
                      <td className="py-4 px-6 font-mono text-xs">
                        <a
                          href={getExplorerAddressUrl(m.payout_address)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1"
                        >
                          <span>{truncateAddress(m.payout_address)}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="py-4 px-6">
                        <Badge
                          variant={
                            m.status === 'active'
                              ? 'active'
                              : m.status === 'pending'
                              ? 'warning'
                              : 'revoked'
                          }
                        >
                          {m.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-4 px-6">
                        {m.register_tx_hash ? (
                          <a
                            href={getExplorerTxUrl(m.register_tx_hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#1749F5] dark:text-[#5B8EFF] hover:underline inline-flex items-center gap-1 font-mono text-xs"
                          >
                            <span>{truncateAddress(m.register_tx_hash)}</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        {m.status === 'pending' && (
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={actionInProgress === m.id}
                            isLoading={actionInProgress === m.id}
                            onClick={() => handleApprove(m)}
                            className="text-xs"
                          >
                            Approve On-Chain
                          </Button>
                        )}
                        {m.status === 'active' && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={actionInProgress === m.id}
                            isLoading={actionInProgress === m.id}
                            onClick={() => handleToggleStatus(m, false)}
                            className="text-xs"
                          >
                            Suspend
                          </Button>
                        )}
                        {m.status === 'suspended' && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionInProgress === m.id}
                            isLoading={actionInProgress === m.id}
                            onClick={() => handleToggleStatus(m, true)}
                            className="text-xs text-[#10B981] hover:text-[#059669]"
                          >
                            Reactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
