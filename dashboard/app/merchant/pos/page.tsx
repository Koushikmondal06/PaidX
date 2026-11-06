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
      label: 'Main Checkout Register 01',
      status: 'active',
      firmware: 'v1.2.0-esp32',
      lastActive: '2 minutes ago',
    },
  ]);

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [label, setLabel] = useState('Counter Register 02');
  const [provisionedSecret, setProvisionedSecret] = useState<{
    uuid: string;
    secret: string;
  } | null>(null);

  const handleRegisterDevice = (e: React.FormEvent) => {
    e.preventDefault();
    const newUuid = crypto.randomUUID();
    const newSecret = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    const newDevice: DeviceItem = {
      id: `dev_${Date.now()}`,
      uuid: newUuid,
      label: label || 'New ESP32 POS',
      status: 'active',
      firmware: 'v1.2.0-esp32',
      lastActive: 'Just registered',
    };

    setDevices((prev) => [...prev, newDevice]);
    setProvisionedSecret({ uuid: newUuid, secret: newSecret });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#1A2E38]">
        <div>
          <h1 className="text-xl font-bold font-mono tracking-tight text-[#DFE0E2]">
            Physical ESP32 POS Devices
          </h1>
          <p className="text-xs text-[#AAAAAA] font-mono mt-1">
            Provision and manage dedicated hardware counter terminals running PaidX firmware
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setProvisionedSecret(null);
            setShowRegisterModal(true);
          }}
          className="font-mono text-xs"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Provision New Device
        </Button>
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {devices.map((device) => (
          <Card key={device.id} className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1A2E38]">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-[#DFE0E2]">
                  {device.label}
                </span>
              </div>
              <Badge variant={device.status === 'active' ? 'active' : 'revoked'}>
                {device.status.toUpperCase()}
              </Badge>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between text-[#AAAAAA]">
                <span>Device UUID:</span>
                <span className="text-[#DFE0E2]">{device.uuid.slice(0, 18)}...</span>
              </div>
              <div className="flex justify-between text-[#AAAAAA]">
                <span>Firmware:</span>
                <span className="text-[#DFE0E2]">{device.firmware}</span>
              </div>
              <div className="flex justify-between text-[#AAAAAA]">
                <span>Heartbeat:</span>
                <span className="text-emerald-400">{device.lastActive}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#1A2E38] flex items-center justify-between text-[11px] font-mono text-[#888888]">
              <div className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>NFC & TFT Online</span>
              </div>
              <Button variant="ghost" size="sm" className="text-rose-400 hover:text-rose-300">
                <Trash2 className="w-3 h-3 mr-1" />
                Revoke
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Register Modal */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title={provisionedSecret ? 'Device Provisioned Successfully' : 'Provision Hardware Terminal'}
      >
        {!provisionedSecret ? (
          <form onSubmit={handleRegisterDevice} className="space-y-4">
            <Input
              label="Terminal Label / Location"
              placeholder="e.g. Counter Register 02"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
            />

            <div className="p-3 rounded-lg bg-[#071013] border border-[#1A2E38] text-[11px] font-mono text-[#AAAAAA]">
              A unique Device UUID and device secret token will be generated to burn into the ESP32
              firmware's <code className="text-[#5465FF]">paidx_secrets.h</code>.
            </div>

            <Button type="submit" variant="primary" size="md" className="w-full">
              Generate Pairing Token
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800 text-xs font-mono space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Pairing Token Created</span>
              </div>
              <div>
                <span className="text-[10px] text-[#888888] block">PAIDX_DEVICE_UUID:</span>
                <span className="text-emerald-300 select-all break-all">{provisionedSecret.uuid}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#888888] block">PAIDX_DEVICE_TOKEN:</span>
                <span className="text-emerald-300 select-all break-all">{provisionedSecret.secret}</span>
              </div>
            </div>

            <p className="text-[11px] font-mono text-[#AAAAAA]">
              Copy these constants into <code className="text-[#5465FF]">esp/paidx_secrets.h</code> and flash your ESP32 board.
            </p>

            <Button
              variant="outline"
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
