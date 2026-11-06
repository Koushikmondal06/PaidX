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
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  // Link card input
  const [rawNfcUid, setRawNfcUid] = useState('');
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);

  const supabase = createBrowserSupabaseClient();

  const loadData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const s = await getRealUserSession();
      setSession(s);
      if (!s) return;

      // 1. Fetch real cards
      const { data: cardsData } = await supabase
        .from('cards')
        .select('*')
        .eq('user_id', s.id)
        .order('created_at', { ascending: false });

      if (cardsData) setCards(cardsData as unknown as CardRow[]);

      // 2. Fetch active permission
      const { data: permData } = await supabase
        .from('permissions')
        .select('*')
        .eq('user_id', s.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setActivePermission((permData as unknown as PermissionRow) || null);
    } catch (err: unknown) {
      console.warn('[Cards] Load error:', err);
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

      // 2. Prompt user to sign registerCard on-chain via MetaMask
      if (typeof window === 'undefined' || !window.ethereum) {
        throw new Error('MetaMask is required to sign on-chain card registration.');
      }

      const walletClient = getBrowserWalletClient();
      const publicClient = getBrowserPublicClient();
      const registryAddress = getCardRegistryAddress() as Address;

      const userAddress = (session?.smartAccountAddress || session?.eoaAddress) as Address;
      if (!userAddress) {
        throw new Error('No wallet address linked to current account.');
      }

      const txHash = await walletClient.writeContract({
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
        throw new Error('Card registration transaction reverted on Sepolia.');
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
          registrationTxHash: txHash,
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
    const newStatus = card.status === 'active' ? 'frozen' : 'active';

    try {
      const { data: authSession } = await supabase.auth.getSession();
      const token = authSession.session?.access_token;

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
            Physical NFC Cards & Spending Limits
          </h1>
          <p className="text-xs font-mono text-[#AAAAAA] mt-1">
            Manage hardware cards linked to your self-custody wallet on Ethereum Sepolia
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowClaimModal(true)}
          className="font-mono text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          <span>Link New NFC Card</span>
        </Button>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Linked Cards Section */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono font-bold text-[#DFE0E2] uppercase tracking-wider">
          Registered Physical Cards
        </h2>

        {cards.length === 0 ? (
          <Card className="border-[#1A2E38] py-8 text-center space-y-3">
            <Radio className="w-8 h-8 text-[#5465FF] mx-auto opacity-70" />
            <p className="text-xs font-mono text-[#AAAAAA]">
              No physical NFC cards linked to your account yet.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowClaimModal(true)}
              className="font-mono text-xs"
            >
              Link Your First Card
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map((card) => (
              <Card
                key={card.id}
                className={`border-[#1A2E38] space-y-4 relative overflow-hidden transition-all ${
                  card.status === 'frozen' ? 'opacity-70 bg-[#071013]' : 'bg-[#0B161B]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-lg ${
                        card.status === 'active'
                          ? 'bg-[#5465FF]/20 text-[#5465FF]'
                          : 'bg-rose-950/40 text-rose-400'
                      }`}
                    >
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-mono font-bold text-[#DFE0E2]">
                        NFC Card ({truncateAddress(card.uid_hash)})
                      </h3>
                      <p className="text-[10px] font-mono text-[#666666]">
                        Registered: {new Date(card.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <Badge variant={card.status === 'active' ? 'active' : 'frozen'}>
                    {card.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="p-3 bg-[#071013] rounded-lg border border-[#1A2E38] text-[11px] font-mono text-[#888888] space-y-1">
                  <p>
                    <span className="text-[#AAAAAA]">Hashed Identifier:</span>{' '}
                    <span className="text-indigo-300 select-all">{truncateAddress(card.uid_hash)}</span>
                  </p>
                  <p>
                    <span className="text-[#AAAAAA]">On-chain Registry:</span>{' '}
                    <span className="text-emerald-400">
                      {card.registration_tx_hash ? 'Confirmed' : 'Active'}
                    </span>
                  </p>
                </div>

                <div className="pt-2 border-t border-[#1A2E38] flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleFreeze(card)}
                    className="font-mono text-xs"
                  >
                    {card.status === 'active' ? (
                      <>
                        <Lock className="w-3 h-3 mr-1 text-rose-400" />
                        <span>Freeze Card</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3 mr-1 text-emerald-400" />
                        <span>Unfreeze Card</span>
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ERC-7715 Permission Delegation Section */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono font-bold text-[#DFE0E2] uppercase tracking-wider">
          Active Spending Delegation (ERC-7715)
        </h2>

        {activePermission ? (
          (() => {
            const daysRemaining = Math.max(
              0,
              Math.ceil((new Date(activePermission.valid_until).getTime() - Date.now()) / (86400 * 1000))
            );
            const isExpiringSoon = daysRemaining <= 3;

            return (
              <Card className="border-[#1A2E38] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono font-bold text-[#DFE0E2]">
                      Rolling 24-Hour Spending Cap: ${formatUsdc(activePermission.limit_per_period)} USDC
                    </p>
                    <p className="text-[11px] font-mono text-[#888888] mt-0.5">
                      Available in current period: ${formatUsdc(activePermission.remaining_in_period)} USDC · Expires in{' '}
                      <span className={isExpiringSoon ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                        {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
                      </span>{' '}
                      ({new Date(activePermission.valid_until).toLocaleDateString()})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isExpiringSoon && (
                      <Link href="/onboarding" className="font-mono text-xs text-amber-400 hover:underline">
                        Renew
                      </Link>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setShowRevokeModal(true)}
                      className="font-mono text-xs w-fit"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      <span>Revoke Delegation</span>
                    </Button>
                  </div>
                </div>

                {isExpiringSoon && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Delegation expires in {daysRemaining} days. Please renew to keep contactless card payments active.</span>
                  </div>
                )}
              </Card>
            );
          })()
        ) : (
          <Card className="border-[#1A2E38] py-6 text-center space-y-2">
            <p className="text-xs font-mono text-[#AAAAAA]">
              No active spending delegation found.
            </p>
            <p className="text-[11px] font-mono text-[#666666]">
              Create an account or complete wallet onboarding to configure periodic spending limits.
            </p>
          </Card>
        )}
      </div>

      {/* Link Card Modal */}
      <Modal
        isOpen={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        title="Link Physical NFC Card"
      >
        <form onSubmit={handleRegisterCard} className="space-y-4">
          <p className="text-xs font-mono text-[#AAAAAA]">
            Enter the NFC tag UID from your physical card. The raw UID is hashed server-side with
            CARD_UID_SALT and never stored in plain text.
          </p>

          <Input
            label="NFC Tag UID"
            placeholder="e.g. 04:A2:B3:C4:D5:E6:F7"
            value={rawNfcUid}
            onChange={(e) => setRawNfcUid(e.target.value)}
            helperText="Hexadecimal UID format"
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowClaimModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmittingCard}
            >
              Register Card
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
        <div className="space-y-4">
          <p className="text-xs font-mono text-[#AAAAAA]">
            Are you sure you want to revoke this ERC-7715 spending delegation?
            Physical NFC card taps will immediately be rejected until a new delegation is granted.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRevokeModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
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
