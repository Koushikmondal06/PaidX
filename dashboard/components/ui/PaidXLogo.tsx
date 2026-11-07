import React from 'react';

export function PaidXLogo({
  size = 32,
  showConsole = true,
  className = '',
}: {
  size?: number;
  showConsole?: boolean;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-02.png"
        alt="PaidX Logo"
        width={size}
        height={size}
        className="rounded-[8px] object-cover shadow-sm transition-transform hover:scale-105"
        style={{ width: size, height: size }}
      />
      <div className="flex flex-col justify-center">
        <span className="font-archivo font-extrabold tracking-tight text-xl sm:text-2xl text-black dark:text-white leading-none">
          PaidX
        </span>
        {showConsole && (
          <span className="text-[10px] font-archivo font-semibold text-[#667085] dark:text-[#A9B9D5] tracking-widest uppercase mt-0.5 leading-none">
            Console
          </span>
        )}
      </div>
    </div>
  );
}
