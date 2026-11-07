'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCodeDisplay({
  value,
  size = 180,
  className = '',
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!value) return;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: {
        dark: '#111111',
        light: '#FFFFFF',
      },
    })
      .then((url) => setDataUrl(url))
      .catch((err) => console.error('QR code render error', err));
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl animate-pulse mx-auto flex items-center justify-center text-xs font-archivo text-[#64748B]"
      >
        Generating QR...
      </div>
    );
  }

  return (
    <div
      className={`p-3 bg-white border border-[#E2E8F0] rounded-2xl inline-block shadow-sm ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="Payment QR Code"
        width={size}
        height={size}
        className="rounded-xl mx-auto"
      />
    </div>
  );
}
