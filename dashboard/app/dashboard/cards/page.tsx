'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
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
} from 'lucide-react';

interface CardItem {
  id: string;
  uid: string;
  label: string;
  status: 'active' | 'frozen';
  dailyLimitUsdc: number;
  perTxLimitUsdc: number;
  spentTodayUsdc: number;
}

interface AuditLog {
  id: string;
  date: string;
  oldDaily: number;
  newDaily: number;
  reason: string;
}

export default function CardsAndLimitsPage() {
  const [cards, setCards] = useState<CardItem[]>([
    {
      id: 'c_01',
      uid: '4305-0129-8812',
      label: 'Black Matte NFC',
      status: 'active',
      dailyLimitUsdc: 25.0,
      perTxLimitUsdc: 10.0,
      spentTodayUsdc: 6.5,
    },
  ]);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: 'log_01',
      date: '2026-11-05 14:22 UTC',
      oldDaily: 15.0,
      newDaily: 25.0,
      reason: 'Upgraded daily lunch allowance',
    },
    {
      id: 'log_02',
      date: '2026-11-01 09:10 UTC',
      oldDaily: 10.0,
      newDaily: 15.0,
      reason: 'Initial card activation limit',
    },
  ]);

  // Modal states
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardItem | null>(null);

  // Edit limit form
  const [newDaily, setNewDaily] = useState('25.00');
  const [newPerTx, setNewPerTx] = useState('10.00');
  const [reason, setReason] = useState('');

  // Claim card form
  const [claimCode, setClaimCode] = useState('');
  const [cardLabel, setCardLabel] = useState('My PaidX Card');

  const handleOpenLimitModal = (card: CardItem) => {
    setSelectedCard(card);
    setNewDaily(card.dailyLimitUsdc.toString());
    setNewPerTx(card.perTxLimitUsdc.toString());
    setShowLimitModal(true);
  };

  const handleSaveLimits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCard) return;

    const dailyNum = parseFloat(newDaily);
    const perTxNum = parseFloat(newPerTx);

    setCards((prev) =>
      prev.map((c) =>
        c.id === selectedCard.id
          ? { ...c, dailyLimitUsdc: dailyNum, perTxLimitUsdc: perTxNum }
          : c
      )
    );

    // Add audit entry
    setAuditLogs((prev) => [
      {
        id: `log_${Date.now()}`,
        date: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
        oldDaily: selectedCard.dailyLimitUsdc,
        newDaily: dailyNum,
        reason: reason || 'Updated via Console',
      },
      ...prev,
    ]);

    setShowLimitModal(false);
  };

  const handleToggleFreeze = (cardId: string) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id === cardId) {
          const newStatus = c.status === 'active' ? 'frozen' : 'active';
          return { ...c, status: newStatus };
        }
        return c;
      })
    );
  };

  const handleClaimCard = (e: React.FormEvent) => {
    e.preventDefault();
    const newCard: CardItem = {
      id: `c_${Date.now()}`,
      uid: `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
      label: cardLabel || 'New PaidX Card',
      status: 'active',
      dailyLimitUsdc: 20.0,
      perTxLimitUsdc: 10.0,
      spentTodayUsdc: 0.0,
    };

    setCards((prev) => [...prev, newCard]);
    setShowClaimModal(false);
    setClaimCode('');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
            Cards & Spending Limits
          </h1>
          <p className="text-xs text-[#AAAAAA] font-mono mt-1">
            Manage your physical NFC cards and on-chain ERC-7710 delegation caps
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowClaimModal(true)}
          className="font-mono text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Claim Physical Card
        </Button>
      </div>

      {/* Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card) => (
          <Card key={card.id} className="p-6 space-y-5 border-[#1A2E38]">
            {/* Visual Card representation */}
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2E38]">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#5465FF]" />
                <span className="text-xs font-mono font-bold text-[#DFE0E2]">
                  {card.label}
                </span>
              </div>
              <Badge variant={card.status === 'active' ? 'active' : 'frozen'}>
                {card.status.toUpperCase()}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2">
              <div>
                <span className="text-[10px] font-mono text-[#888888]">DAILY LIMIT</span>
                <div className="text-base font-mono font-bold text-[#DFE0E2]">
                  ${card.dailyLimitUsdc.toFixed(2)} USDC
                </div>
              </div>
              <div>
                <span className="text-[10px] font-mono text-[#888888]">PER-TRANSACTION</span>
                <div className="text-base font-mono font-bold text-[#DFE0E2]">
                  ${card.perTxLimitUsdc.toFixed(2)} USDC
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#071013] border border-[#1A2E38] space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono">
                <span className="text-[#AAAAAA]">Today's Usage:</span>
                <span className="text-[#DFE0E2]">
                  ${card.spentTodayUsdc.toFixed(2)} / ${card.dailyLimitUsdc.toFixed(2)}
                </span>
              </div>
              <div className="w-full bg-[#0E1D24] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#5465FF] h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (card.spentTodayUsdc / card.dailyLimitUsdc) * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs font-mono"
                onClick={() => handleOpenLimitModal(card)}
              >
                <Sliders className="w-3.5 h-3.5 mr-1 text-[#5465FF]" />
                Adjust Limits
              </Button>

              <Button
                variant={card.status === 'active' ? 'danger' : 'secondary'}
                size="sm"
                className="flex-1 text-xs font-mono"
                onClick={() => handleToggleFreeze(card.id)}
              >
                {card.status === 'active' ? (
                  <>
                    <Lock className="w-3.5 h-3.5 mr-1" />
                    Pause Card
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 mr-1" />
                    Unfreeze
                  </>
                )}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Audit Log Table */}
      <Card className="p-6">
        <div className="pb-4 border-b border-[#1A2E38] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#5465FF]" />
            <h3 className="text-xs font-mono font-bold text-[#DFE0E2]">
              Spending Limit Audit Logs
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[#888888]">
            Immutable record of all policy adjustments
          </span>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1A2E38] text-[#888888]">
                <th className="py-2.5">Date & Time</th>
                <th className="py-2.5">Previous Daily Cap</th>
                <th className="py-2.5">New Daily Cap</th>
                <th className="py-2.5">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2E38]">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#0E1D24]/40">
                  <td className="py-3 text-[#DFE0E2]">{log.date}</td>
                  <td className="py-3 text-[#AAAAAA]">${log.oldDaily.toFixed(2)} USDC</td>
                  <td className="py-3 text-emerald-400 font-bold">${log.newDaily.toFixed(2)} USDC</td>
                  <td className="py-3 text-[#AAAAAA]">{log.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Adjust Limits Modal */}
      <Modal
        isOpen={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        title="Adjust Scoped Delegation Limits"
      >
        <form onSubmit={handleSaveLimits} className="space-y-4">
          <Input
            label="Daily Spending Cap (USDC)"
            type="number"
            step="0.01"
            value={newDaily}
            onChange={(e) => setNewDaily(e.target.value)}
            helperText="Maximum allowed per 24-hour UTC window"
            required
          />

          <Input
            label="Per-Transaction Maximum (USDC)"
            type="number"
            step="0.01"
            value={newPerTx}
            onChange={(e) => setNewPerTx(e.target.value)}
            helperText="Single tap cannot exceed this amount"
            required
          />

          <Input
            label="Reason for Adjustment"
            placeholder="e.g. Travel allowance or weekly adjustment"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          <div className="p-3 rounded-lg bg-[#071013] border border-[#1A2E38] text-[11px] font-mono text-[#AAAAAA]">
            Note: Increasing daily limits requires signing an on-chain caveat update via your
            MetaMask Smart Account.
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="md"
              className="w-1/3"
              onClick={() => setShowLimitModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" className="w-2/3">
              Confirm & Update
            </Button>
          </div>
        </form>
      </Modal>

      {/* Claim Physical Card Modal */}
      <Modal
        isOpen={showClaimModal}
        onClose={() => setShowClaimModal(false)}
        title="Pair Physical PaidX NFC Card"
      >
        <form onSubmit={handleClaimCard} className="space-y-4">
          <Input
            label="Packaging Claim Secret"
            placeholder="PAIDX-PKG-XXXX-XXXX"
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value)}
            helperText="Found inside the physical packaging sleeve"
            required
          />

          <Input
            label="Card Label / Name"
            placeholder="e.g. Primary Matte Black"
            value={cardLabel}
            onChange={(e) => setCardLabel(e.target.value)}
            required
          />

          <Button type="submit" variant="primary" size="md" className="w-full">
            Pair & Activate Card
          </Button>
        </form>
      </Modal>
    </div>
  );
}
