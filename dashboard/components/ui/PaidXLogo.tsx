import React from 'react';

export function PaidXLogo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div
        style={{ width: size, height: size }}
        className="rounded-lg bg-gradient-to-br from-[#5465FF] to-[#3B49DF] p-0.5 flex items-center justify-center shadow-lg shadow-[#5465FF]/20"
      >
        <div className="w-full h-full bg-[#071013] rounded-[6px] flex items-center justify-center">
          <span className="font-mono font-black text-xs text-[#5465FF] tracking-tighter">
            PX
          </span>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="font-mono font-bold tracking-tight text-sm text-[#DFE0E2] leading-none">
          Paid<span className="text-[#5465FF]">X</span>
        </span>
        <span className="text-[9px] font-mono text-[#AAAAAA] tracking-widest uppercase">
          Base L2
        </span>
      </div>
    </div>
  );
}
