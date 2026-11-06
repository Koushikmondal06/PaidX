import React from 'react';

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#0B161B] border border-[#1A2E38] rounded-xl p-6 transition-all ${
        onClick ? 'cursor-pointer hover:border-[#5465FF]/50 hover:bg-[#0E1D24]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
