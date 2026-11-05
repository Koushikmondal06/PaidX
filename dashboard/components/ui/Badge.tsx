import React from 'react';

export function Badge({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'active' | 'posted' | 'frozen' | 'revoked' | 'warning' | 'info';
  className?: string;
}) {
  const variantStyles = {
    default: 'bg-[#1A2E38]/50 text-[#DFE0E2] border-[#1A2E38]',
    active: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60',
    posted: 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60',
    frozen: 'bg-amber-950/40 text-amber-400 border-amber-800/60',
    revoked: 'bg-rose-950/40 text-rose-400 border-rose-800/60',
    warning: 'bg-amber-950/40 text-amber-400 border-amber-800/60',
    info: 'bg-[#5465FF]/10 text-[#5465FF] border-[#5465FF]/30',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
        variantStyles[variant] || variantStyles.default
      } ${className}`}
    >
      {children}
    </span>
  );
}
