import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'active' | 'posted' | 'frozen' | 'revoked' | 'warning' | 'info' | 'purple';
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  dot = false,
  className = '',
}: BadgeProps) {
  const variantStyles = {
    default:
      'bg-[#F1F5F9] text-[#334155] border-[#E2E8F0] dark:bg-white/10 dark:text-[#D3DEF1] dark:border-white/10',
    active:
      'bg-[#ECFDF5] text-[#10B981] border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
    posted:
      'bg-[#ECFDF5] text-[#10B981] border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
    frozen:
      'bg-[#FFFBEB] text-[#D97706] border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
    warning:
      'bg-[#FFFBEB] text-[#D97706] border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
    revoked:
      'bg-[#FEF2F2] text-[#EF4444] border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/40',
    info:
      'bg-[#ECEEFF] text-[#1749F5] border-[#DFE3F8] dark:bg-blue-950/40 dark:text-[#5B8EFF] dark:border-blue-800/40',
    purple:
      'bg-[#F3E8FF] text-[#9333EA] border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40',
  };

  const dotColors = {
    default: 'bg-[#667085]',
    active: 'bg-[#10B981]',
    posted: 'bg-[#10B981]',
    frozen: 'bg-[#F59E0B]',
    warning: 'bg-[#F59E0B]',
    revoked: 'bg-[#EF4444]',
    info: 'bg-[#1749F5] dark:bg-[#5B8EFF]',
    purple: 'bg-[#9333EA]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-archivo font-semibold uppercase tracking-wider border select-none ${
        variantStyles[variant] || variantStyles.default
      } ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${dotColors[variant] || 'bg-current'} animate-pulse`}
        />
      )}
      {children}
    </span>
  );
}
