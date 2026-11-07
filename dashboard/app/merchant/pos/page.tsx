'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  Cpu,
  Plus,
  ShieldCheck,
  Radio,
  CheckCircle2,
  Trash2,
  Copy,
  Terminal,
  Wifi,
  ExternalLink,
  Check,
} from 'lucide-react';

interface DeviceItem {
  id: string;
  uuid: string;
  label: string;
  status: 'active' | 'revoked';
  firmware: string;
  lastActive: string;
}

export default function PosHardwarePage() {
  const [devices, setDevices] = useState<DeviceItem[]>([
    {
      id: 'dev_01',
      uuid: 'd8a2f910-3841-49fa-9876-0123456789ab',
      label: 'Main Checkout Register 01 (ESP32-PN532)',
      status: 'active',
      firmware: 'v2.4.1-esp32',
      lastActive: 'Just now • Wi-Fi 98%',
    },
  ]);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [label, setLabel] = useState('Countertop Terminal 02');
  const [provisionedSecret, setProvisionedSecret] = useState<{
    uuid: string;
    secret: string;
  } | null>(null);

  const [copiedUuid, setCopiedUuid] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  const handleRegisterDevice = (e: React.FormEvent) => {
    e.preventDefault();
    const newUuid = crypto.randomUUID();
    const newSecret = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const newDevice: DeviceItem = {
      id: `dev_${Date.now()}`,
      uuid: newUuid,
      label: label ? `${label} (ESP32-PN532)` : 'Countertop Terminal 02 (ESP32-PN532)',
      status: 'active',
      firmware: 'v2.4.1-esp32',
      lastActive: 'Just registered • Wi-Fi 100%',
    };

    setDevices((prev) => [...prev, newDevice]);
    setProvisionedSecret({ uuid: newUuid, secret: newSecret });
  };

  const handleRevokeDevice = (deviceId: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, status: 'revoked' as const } : d))
    );
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E2E8F0] dark:border-white/10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-2xl sm:text-3xl font-semibold font-archivo tracking-tight text-[#111111] dark:text-[#F5F8FF]">
              Physical ESP32 POS Devices
            </h1>
            <Badge variant="active" dot>HARDWARE FLEET</Badge>
          </div>
          <p className="text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8] font-archivo">
            Provision and manage dedicated countertop hardware terminals running PaidX firmware
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setProvisionedSecret(null);
            setShowRegisterModal(true);
          }}
          className="font-archivo text-xs gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Provision New Device</span>
        </Button>
      </div>

      {/* Device List following Section 5.6 Hardware Terminal Device Card */}
      <div className="space-y-5">
        <h2 className="text-xs sm:text-[13px] font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF] uppercase tracking-wider">
          Countertop Hardware Registers ({devices.length})
        </h2>

        <div className="space-y-4">
          {devices.map((device) => {
            const isActive = device.status === 'active';
            return (
              <div
                key={device.id}
                className="bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 transition-colors shadow-sm"
              >
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 flex items-center justify-center text-[#1749F5] dark:text-[#5B8EFF] shadow-sm shrink-0">
                    <Radio className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-archivo font-semibold uppercase tracking-wider bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/40 dark:text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                          ONLINE & READY
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-archivo font-semibold uppercase tracking-wider bg-[#FEF2F2] text-[#EF4444] dark:bg-red-950/40 dark:text-red-300">
                          REVOKED
                        </div>
                      )}
                      <span className="text-xs font-mono text-[#64748B] dark:text-[#94A3B8]">
                        UUID: {device.uuid.slice(0, 14)}...
                      </span>
                    </div>

                    <h4 className="font-archivo font-semibold text-lg sm:text-xl text-[#111111] dark:text-[#F5F8FF] mt-1">
                      {device.label}
                    </h4>
                    <p className="font-archivo text-xs sm:text-sm text-[#64748B] dark:text-[#94A3B8]">
                      Firmware {device.firmware} • {device.lastActive} • Tap latency &lt; 1.2s
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end md:self-center shrink-0">
                  {isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevokeDevice(device.id)}
                      className="text-xs text-[#EF4444] hover:text-[#DC2626] hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      <span>Revoke Terminal</span>
                    </Button>
                  ) : (
                    <span className="text-xs font-archivo font-medium text-[#EF4444]">
                      Terminal Disconnected
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Register Modal */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title={provisionedSecret ? 'Device Provisioned Successfully' : 'Provision Hardware Terminal'}
      >
        {!provisionedSecret ? (
          <form onSubmit={handleRegisterDevice} className="space-y-5 font-archivo">
            <Input
              label="Terminal Label / Location"
              placeholder="e.g. Counter Register 02"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />

            <div className="p-4 rounded-xl bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
              A unique Device UUID and cryptographic authentication token will be generated to pair this ESP32 countertop terminal with your account.
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E2E8F0] dark:border-white/10">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => setShowRegisterModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="md">
                Generate Pairing Token
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-5 font-archivo">
            <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-emerald-200 dark:border-emerald-800/40 text-xs space-y-3">
              <div className="flex items-center gap-2 text-[#10B981] font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                <span>Pairing Token Created</span>
              </div>
              <div>
                <span className="text-[11px] text-[#64748B] block font-medium">PAIDX_DEVICE_UUID:</span>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[#111111] font-mono select-all break-all">{provisionedSecret.uuid}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(provisionedSecret.uuid);
                      setCopiedUuid(true);
                      setTimeout(() => setCopiedUuid(false), 2000);
                    }}
                    className="p-1 text-[#64748B] hover:text-[#1749F5]"
                  >
                    {copiedUuid ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-[11px] text-[#64748B] block font-medium">PAIDX_DEVICE_TOKEN:</span>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-[#111111] font-mono select-all break-all">{provisionedSecret.secret}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(provisionedSecret.secret);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                    className="p-1 text-[#64748B] hover:text-[#1749F5]"
                  >
                    {copiedToken ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
              Copy these constants into <code className="text-[#1749F5] dark:text-[#5B8EFF] font-mono">esp/paidx_secrets.h</code> and flash your ESP32 board.
            </p>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => setShowRegisterModal(false)}
            >
              Done
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
