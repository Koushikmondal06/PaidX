'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { getRealUserSession, UserSession } from '@/lib/auth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { truncateAddress, PAYMENT_TOKEN_ADDRESS, getExplorerTxUrl } from '@/lib/base';
import { formatUsdc } from '@/lib/currency';
import { getCardRegistryAddress, CARD_REGISTRY_ABI } from '@/lib/contracts';
import { getBrowserPublicClient, getBrowserWalletClient, CHAIN_ID } from '@/lib/chain';
import type { Address, Hash } from 'viem';
import {
  CreditCard,
  Sliders,
  Plus,
  Lock,
  Unlock,
  AlertTriangle,
  History,
  ShieldAlert,
  Radio,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Sparkles,
  Wifi,
} from 'lucide-react';

interface CardRow {
  id: string;
  uid_hash: string;
  status: 'active' | 'frozen' | 'revoked';
  registration_tx_hash: string | null;
  registered_at_block: number | null;
  created_at: string;
}

interface PermissionRow {
  id: string;
  limit_per_period: string;
  remaining_in_period: string;
  period_seconds: number;
  valid_until: string;
  status: 'active' | 'revoked' | 'expired';
}

export default function CardsAndLimitsPage() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [activePermission, setActivePermission] = useState<PermissionRow | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingCardId, setUpdatingCardId] = useState<string | null>(null);

  // Modals
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  // Link card input
  const [rawNfcUid, setRawNfcUid] = useState('');
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);

  const supabase = createBrowserSupabaseClient();

  const loadData = async () => {
    setIsLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const s = await getRealUserSession();
      setSession(s);
      if (!s) return;

      // 1. Fetch real cards
      const { data: cardsData, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .eq('user_id', s.id)
        .order('created_at', { ascending: false });

      if (cardsError) throw cardsError;
      if (cardsData) setCards(cardsData as unknown as CardRow[]);

      // 2. Fetch active permission
      const { data: permData, error: permError } = await supabase
        .from('permissions')
        .select('*')
        .eq('user_id', s.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (permError) throw permError;
      setActivePermission((permData as unknown as PermissionRow) || null);
    } catch (err: unknown) {
      console.warn('[Cards] Load error:', err);
      setLoadError(err instanceof Error ? err.message : 'Failed to load card and limit data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Register real NFC card via on-chain CardRegistry + API
  const handleRegisterCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawNfcUid) return;

    setIsSubmittingCard(true);
    setActionError(null);

    try {
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      // 1. Obtain salted hash from server (raw UID never stored)
      const prepRes = await fetch('/api/cards/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rawUid: rawNfcUid.trim(), prepareOnly: true }),
      });

      const prepData = await prepRes.json();
      if (!prepRes.ok || !prepData.uidHash) {
        throw new Error(prepData.error || 'Failed to prepare card hash');
      }

      const cardHash = prepData.uidHash as `0x${string}`;

      // 2. Prompt user to sign registerCard on-chain via MetaMask if not already on-chain
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask is required to sign on-chain card registration.');
      }

      const userAddress = (session?.smartAccountAddress || session?.eoaAddress) as Address;
      if (!userAddress) {
        throw new Error('No wallet address linked to current account.');
      }

      const walletClient = await getBrowserWalletClient(userAddress);
      const publicClient = getBrowserPublicClient();
      const registryAddress = getCardRegistryAddress() as Address;

      // Read on-chain card first to avoid redundant reverts or duplicate registrations
      let txHash: Hash | undefined;
      const onChainRecord = (await publicClient.readContract({
        address: registryAddress,
        abi: CARD_REGISTRY_ABI,
        functionName: 'cards',
        args: [cardHash],
      })) as [Address, number, bigint, bigint];

      const zeroAddress = '0x0000000000000000000000000000000000000000';
      if (onChainRecord && onChainRecord[0] && onChainRecord[0] !== zeroAddress) {
        if (onChainRecord[0].toLowerCase() !== userAddress.toLowerCase()) {
          throw new Error(`Card is already registered on-chain to ${onChainRecord[0]}`);
        }
        console.log('[Cards] Card already registered on-chain to current wallet, saving to DB...');
      } else {
        txHash = await walletClient.writeContract({
          account: userAddress,
          address: registryAddress,
          abi: CARD_REGISTRY_ABI,
          functionName: 'registerCard',
          args: [cardHash, userAddress],
        });

        // 3. Wait for authoritative on-chain confirmation
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
          timeout: 60_000,
        });

        if (receipt.status !== 'success') {
          throw new Error('Card registration transaction reverted on Base/Sepolia.');
        }
      }

      // 4. Save confirmed card record to database
      const res = await fetch('/api/cards/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rawUid: rawNfcUid.trim(),
          registrationTxHash: txHash || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save card in database');
      }

      setRawNfcUid('');
      setShowClaimModal(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error registering card';
      setActionError(msg);
    } finally {
      setIsSubmittingCard(false);
    }
  };

  // Toggle Card Freeze / Active state
  const handleToggleFreeze = async (card: CardRow) => {
    setActionError(null);
    setUpdatingCardId(card.id);
    const newStatus = card.status === 'active' ? 'frozen' : 'active';
    const targetStatusNum = newStatus === 'frozen' ? 2 : 1; // CardStatus.Frozen = 2, Active = 1

    try {
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      // If registered on-chain, update on-chain status via MetaMask first
      if (card.registration_tx_hash && typeof window !== 'undefined' && window.ethereum) {
        const userAddress = (session?.smartAccountAddress || session?.eoaAddress) as Address;
        if (userAddress) {
          const walletClient = await getBrowserWalletClient(userAddress);
          const publicClient = getBrowserPublicClient();
          const registryAddress = getCardRegistryAddress() as Address;

          const txHash = await walletClient.writeContract({
            account: userAddress,
            address: registryAddress,
            abi: CARD_REGISTRY_ABI,
            functionName: 'setCardStatus',
            args: [card.uid_hash as `0x${string}`, targetStatusNum],
          });

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
            timeout: 60_000,
          });

          if (receipt.status !== 'success') {
            throw new Error(`Failed to update card status on-chain (reverted)`);
          }
        }
      }

      const res = await fetch('/api/cards/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cardId: card.id, status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update card status');
      }

      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating card status';
      setActionError(msg);
    } finally {
      setUpdatingCardId(null);
    }
  };

  // Revoke active ERC-7715 permission
  const handleRevokePermission = async () => {
    if (!activePermission) return;
    setActionError(null);

    try {
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

      const res = await fetch('/api/permissions/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ permissionId: activePermission.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to revoke permission');
      }

      setShowRevokeModal(false);
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error revoking permission';
      setActionError(msg);
    }
  };

  if (!session) return null;

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
              Physical NFC Cards & Spending Limits
            </h1>
            <Badge variant="info">ERC-4337 SMART ACCOUNT</Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] font-archivo">
            Manage your hardware tap cards linked to self-custody smart account on Base L2
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowClaimModal(true)}
          className="font-archivo text-xs gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Issue a Card</span>
        </Button>
      </div>

      {loadError && (
        <div className="p-4 rounded-2xl bg-[#FEF2F2] border border-red-200 dark:border-red-900/60 text-[#EF4444] text-xs sm:text-sm font-archivo flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="text-xs shrink-0">
            Retry
          </Button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-[#FEF2F2] border border-red-200 dark:border-red-900/60 text-[#EF4444] text-xs sm:text-sm font-archivo flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Linked Physical Cards Section */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xs sm:text-[13px] font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF] uppercase tracking-wider">
            Registered Physical Cards ({cards.length})
          </h2>
          <span className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8]">
            Sub-second contactless execution
          </span>
        </div>

        {cards.length === 0 ? (
          <div className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-8 sm:p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white dark:bg-[#09152D] text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center mx-auto shadow-sm">
              <Radio className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-archivo font-semibold text-lg text-[#111111] dark:text-[#F5F8FF]">
                No physical NFC cards linked yet
              </h3>
              <p className="text-xs sm:text-sm font-archivo text-[#334155] dark:text-[#A9B9D5] mt-1.5 max-w-md mx-auto leading-relaxed">
                Link a PaidX smart card to your self-custody account for frictionless, contactless in-store checkouts without unlocking your phone.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowClaimModal(true)}
              className="mt-2"
            >
              Issue Your First Card
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {cards.map((card) => {
              const isActive = card.status === 'active';
              return (
                <div
                  key={card.id}
                  className={`bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 p-6 sm:p-7 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] space-y-5 relative overflow-hidden transition-all ${
                    !isActive ? 'opacity-75' : ''
                  }`}
                >
                  {/* Visual Card Representation inside */}
                  <div
                    className={`rounded-[18px] p-5 text-white relative overflow-hidden shadow-md flex flex-col justify-between min-h-[170px] ${
                      isActive
                        ? 'bg-gradient-to-br from-[#1749F5] via-[#1A38BE] to-[#0E1F73]'
                        : 'bg-gradient-to-br from-[#475467] to-[#1D2939]'
                    }`}
                  >
                    {/* Top Row: PaidX Brand + Contactless Icon */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-archivo font-extrabold tracking-tight text-lg text-white">
                          Paid<span className="text-[#19D9F2]">X</span>
                        </span>
                        <span className="text-[9px] font-archivo font-semibold uppercase tracking-wider text-white/70 ml-1">
                          NFC Smart Card
                        </span>
                      </div>
                      <Wifi className="w-5 h-5 rotate-90 text-white/80" />
                    </div>

                    {/* Chip Graphic & Card UID */}
                    <div className="my-3 flex items-center justify-between">
                      <div className="w-9 h-7 rounded-md bg-amber-300/80 border border-amber-200/50 flex flex-col justify-around p-1">
                        <div className="h-0.5 w-full bg-amber-600/40 rounded-full" />
                        <div className="h-0.5 w-full bg-amber-600/40 rounded-full" />
                        <div className="h-0.5 w-full bg-amber-600/40 rounded-full" />
                      </div>
                      <div className="font-mono text-xs sm:text-[13px] tracking-wider text-white/90 font-medium">
                        {truncateAddress(card.uid_hash)}
                      </div>
                    </div>

                    {/* Bottom Row: Status & Network */}
                    <div className="flex items-center justify-between text-[11px] font-archivo text-white/80 pt-1 border-t border-white/10">
                      <span>BASE L2 SMART SETTLEMENT</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20 text-white backdrop-blur-sm">
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#10B981]' : 'bg-amber-400'}`} />
                        {card.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Card Metadata info */}
                  <div className="p-4 bg-[#F8FAFC] dark:bg-white/5 rounded-xl border border-[#E2E8F0] dark:border-white/10 text-xs font-archivo space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#64748B] dark:text-[#94A3B8]">Salted Card Hash:</span>
                      <span className="text-[#1749F5] dark:text-[#5B8EFF] font-mono select-all font-medium">
                        {truncateAddress(card.uid_hash)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B] dark:text-[#94A3B8]">On-Chain Registry:</span>
                      <span className={card.registration_tx_hash ? 'text-[#10B981] font-medium' : 'text-amber-500 font-medium'}>
                        {card.registration_tx_hash ? 'Confirmed On-Chain' : 'Off-Chain Pending'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#64748B] dark:text-[#94A3B8]">Registered:</span>
                      <span className="text-[#111111] dark:text-white">
                        {new Date(card.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-[#E2E8F0] dark:border-white/10 flex items-center justify-between">
                    {card.registration_tx_hash ? (
                      <a
                        href={getExplorerTxUrl(card.registration_tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#1749F5] dark:text-[#5B8EFF] font-archivo font-medium hover:underline inline-flex items-center gap-1"
                      >
                        <span>On-Chain Receipt</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">Local Registry</span>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updatingCardId !== null}
                      isLoading={updatingCardId === card.id}
                      onClick={() => handleToggleFreeze(card)}
                      className="text-xs font-archivo"
                    >
                      {isActive ? (
                        <>
                          <Lock className="w-3.5 h-3.5 mr-1.5 text-[#EF4444]" />
                          <span>Freeze Card</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5 mr-1.5 text-[#10B981]" />
                          <span>Unfreeze Card</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ERC-7715 Permission Delegation Section */}
      <div className="space-y-5">
        <h2 className="text-xs sm:text-[13px] font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF] uppercase tracking-wider">
          Active Spending Delegation (ERC-7715)
        </h2>

        {activePermission ? (
          (() => {
            const daysRemaining = Math.max(
              0,
              Math.ceil((new Date(activePermission.valid_until).getTime() - Date.now()) / (86400 * 1000))
            );
            const isExpiringSoon = daysRemaining <= 3;
            const limit = parseFloat(formatUsdc(activePermission.limit_per_period));
            const remaining = parseFloat(formatUsdc(activePermission.remaining_in_period));
            const spent = Math.max(0, limit - remaining);
            const percentSpent = limit > 0 ? Math.round((spent / limit) * 100) : 0;

            return (
              <div className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-6 sm:p-8 space-y-5 transition-colors shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#09152D] text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center shadow-sm shrink-0">
                      <Sliders className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-archivo font-semibold text-base sm:text-lg text-[#111111] dark:text-[#F5F8FF]">
                        Rolling 24-Hour Spending Cap: ${limit.toFixed(2)} USDC
                      </h3>
                      <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] font-archivo mt-0.5">
                        Available in current cycle: <strong className="text-[#10B981] font-semibold">${remaining.toFixed(2)} USDC</strong> · Expires in{' '}
                        <span className={isExpiringSoon ? 'text-[#EF4444] font-semibold' : 'text-[#111111] dark:text-white font-medium'}>
                          {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
                        </span>{' '}
                        ({new Date(activePermission.valid_until).toLocaleDateString()})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 self-start sm:self-auto shrink-0">
                    {isExpiringSoon && (
                      <Link href="/onboarding">
                        <Button variant="primary" size="sm" className="text-xs">
                          Renew Delegation
                        </Button>
                      </Link>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setShowRevokeModal(true)}
                      className="text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      <span>Revoke Delegation</span>
                    </Button>
                  </div>
                </div>

                {/* Progress bar inside elevated card */}
                <div className="p-5 bg-white dark:bg-[#09152D] rounded-2xl border border-[#DFE3F8] dark:border-white/10 space-y-2 shadow-sm">
                  <div className="flex justify-between text-xs sm:text-[13px] font-archivo">
                    <span className="text-[#334155] dark:text-[#A9B9D5]">
                      Daily Spent: <strong className="text-[#111111] dark:text-white font-semibold">${spent.toFixed(2)} USDC</strong>
                    </span>
                    <span className="text-[#111111] dark:text-white font-semibold">
                      Daily Limit: ${limit.toFixed(2)} USDC
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-[#F1F5F9] dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        percentSpent > 85 ? 'bg-[#EF4444]' : 'bg-[#1749F5]'
                      }`}
                      style={{ width: `${percentSpent}%` }}
                    />
                  </div>
                </div>

                {isExpiringSoon && (
                  <div className="p-3.5 bg-[#FFFBEB] border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                    <span>Delegation expires in {daysRemaining} days. Renew now to avoid transaction tap declines.</span>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <div className="bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 p-8 text-center space-y-2.5 shadow-sm">
            <p className="text-sm font-archivo font-medium text-[#111111] dark:text-[#F5F8FF]">
              No active spending delegation found
            </p>
            <p className="text-xs font-archivo text-[#64748B] dark:text-[#94A3B8] max-w-sm mx-auto">
              Configure periodic spending limits to enable automatic micro-tap settlement at retail POS registers.
            </p>
          </div>
        )}
      </div>

      {/* Issue Card Modal */}
      <Modal
        isOpen={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        title="Issue Physical NFC Card"
      >
        <form onSubmit={handleRegisterCard} className="space-y-5 font-archivo">
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
            Enter the NFC tag UID from your physical card to issue and link it to your account.
            The raw UID is hashed server-side with a cryptographic salt and never stored in plain text.
          </p>

          <Input
            label="NFC Tag UID"
            placeholder="e.g. 04:A2:B3:C4:D5:E6:F7"
            value={rawNfcUid}
            onChange={(e) => setRawNfcUid(e.target.value)}
            helperText="Hexadecimal UID format from physical card"
            required
          />

          <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E2E8F0] dark:border-white/10">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowClaimModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmittingCard}
            >
              Issue Card
            </Button>
          </div>
        </form>
      </Modal>

      {/* Revoke Permission Modal */}
      <Modal
        isOpen={showRevokeModal}
        onClose={() => setShowRevokeModal(false)}
        title="Revoke Spending Permission"
      >
        <div className="space-y-5 font-archivo">
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
            Are you sure you want to revoke this ERC-7715 spending delegation?
            Physical NFC card taps will immediately be rejected until a new delegation is granted.
          </p>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E2E8F0] dark:border-white/10">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setShowRevokeModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleRevokePermission}
            >
              Confirm Revocation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
