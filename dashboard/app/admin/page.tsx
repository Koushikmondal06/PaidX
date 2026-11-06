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

      // Convert UUID to bytes32 via keccak256
      const merchantIdBytes32 = keccak256(stringToHex(merchant.id));
      const payout = merchant.payout_address as Address;

      // Send transaction in MetaMask
      const hash = await walletClient.writeContract({
        account: connectedAddress,
        address: registryAddress,
        abi: MERCHANT_REGISTRY_ABI,
        functionName: 'registerMerchant',
        args: [merchantIdBytes32, payout],
      });

      // Wait for on-chain confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000,
      });

      if (receipt.status !== 'success') {
        throw new Error('On-chain transaction reverted on Sepolia');
      }

      // Sync status to database
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
      <div className="min-h-screen bg-[#071013] flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-400 text-sm">Verifying on-chain protocol administrative rights...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#071013] text-[#DFE0E2] flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 sm:p-8 border-rose-900/50 bg-slate-900/90 text-center space-y-5">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 rounded-full flex items-center justify-center mx-auto text-rose-400">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">Admin Protocol Gated</h1>
            <p className="text-xs text-rose-300/90 leading-relaxed">{authError}</p>
          </div>

          <div className="pt-2 space-y-3">
            <Button
              onClick={handleConnect}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
            >
              Connect Admin MetaMask Account
            </Button>
            <div>
              <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white underline">
                Return to Dashboard
              </Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071013] text-[#DFE0E2] p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <PaidXLogo size={32} />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                Protocol Administration
                <Badge variant="info" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs">
                  MerchantRegistry Owner
                </Badge>
              </h1>
              <p className="text-xs text-slate-400">
                Review and approve retail merchants directly to the Sepolia MerchantRegistry contract.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Admin: {truncateAddress(connectedAddress)}</span>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div
            className={`p-4 rounded-xl border text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              actionFeedback.isError
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <span>{actionFeedback.msg}</span>
            {actionFeedback.txHash && (
              <a
                href={getExplorerTxUrl(actionFeedback.txHash)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline font-mono text-xs"
              >
                View on Etherscan: {truncateAddress(actionFeedback.txHash)} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {/* Merchants Management Card */}
        <Card className="p-6 border-slate-800 bg-slate-900/90 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-indigo-400" />
              Merchant Approval Queue & Registry
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMerchants}
              disabled={isLoadingMerchants}
              className="border-slate-700 text-slate-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMerchants ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {merchants.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No merchant applications found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3">Store Name</th>
                    <th className="py-3 px-3">Payout Address</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">On-Chain Receipt</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {merchants.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-3 font-sans font-medium text-white">{m.name}</td>
                      <td className="py-3.5 px-3">
                        <a
                          href={getExplorerAddressUrl(m.payout_address)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          {truncateAddress(m.payout_address)} <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                      <td className="py-3.5 px-3">
                        <Badge
                          variant={
                            m.status === 'active'
                              ? 'active'
                              : m.status === 'pending'
                              ? 'warning'
                              : 'revoked'
                          }
                          className="capitalize text-[11px]"
                        >
                          {m.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-3">
                        {m.register_tx_hash ? (
                          <a
                            href={getExplorerTxUrl(m.register_tx_hash)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline flex items-center gap-1"
                          >
                            {truncateAddress(m.register_tx_hash)} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right space-x-2">
                        {m.status === 'pending' && (
                          <Button
                            size="sm"
                            disabled={actionInProgress === m.id}
                            onClick={() => handleApprove(m)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                          >
                            {actionInProgress === m.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              'Approve On-Chain'
                            )}
                          </Button>
                        )}
                        {m.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionInProgress === m.id}
                            onClick={() => handleToggleStatus(m, false)}
                            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs h-8"
                          >
                            {actionInProgress === m.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              'Suspend'
                            )}
                          </Button>
                        )}
                        {m.status === 'suspended' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionInProgress === m.id}
                            onClick={() => handleToggleStatus(m, true)}
                            className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 text-xs h-8"
                          >
                            {actionInProgress === m.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              'Reactivate'
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

