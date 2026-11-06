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
        dark: '#DFE0E2',
        light: '#071013',
      },
    })
      .then((url) => setDataUrl(url))
      .catch((err) => console.error('QR code render error', err));
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="bg-[#071013] border border-[#1A2E38] rounded-lg animate-pulse mx-auto flex items-center justify-center text-[10px] font-mono text-[#666666]"
      >
        Generating QR...
      </div>
    );
  }

  return (
    <div
      className={`p-3 bg-[#071013] border border-[#1A2E38] rounded-xl inline-block shadow-inner shadow-black/60 ${className}`}
    >
      <img
        src={dataUrl}
        alt="Payment QR Code"
        width={size}
        height={size}
        className="rounded-md mx-auto"
      />
    </div>
  );
}
