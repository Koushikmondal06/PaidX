import React from 'react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendDirection = 'up',
  trendLabel,
  className = '',
}: StatCardProps) {
  const trendBg =
    trendDirection === 'down'
      ? 'bg-[#FEF2F2] text-[#EF4444] dark:bg-red-950/40 dark:text-red-300'
      : trendDirection === 'neutral'
      ? 'bg-[#F1F5F9] text-[#64748B] dark:bg-white/10 dark:text-[#94A3B8]'
      : 'bg-[#ECFDF5] text-[#10B981] dark:bg-emerald-950/40 dark:text-emerald-300';

  return (
    <div
      className={`bg-white dark:bg-[#09152D] rounded-[24px] border border-[#E2E8F0] dark:border-white/10 p-6 sm:p-7 shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)] flex flex-col justify-between transition-all hover:border-[#1749F5]/30 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-archivo text-xs sm:text-[13px] font-semibold uppercase tracking-wider text-[#667085] dark:text-[#94A3B8]">
          {title}
        </span>
        {icon && (
          <div className="w-10 h-10 rounded-xl bg-[#ECEEFF] dark:bg-white/10 text-[#1749F5] dark:text-[#5B8EFF] flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="font-archivo font-bold text-2xl sm:text-3xl lg:text-[32px] text-[#090B12] dark:text-[#F5F8FF] tracking-tight">
          {value}
        </h3>

        {(trend || subtitle) && (
          <div className="flex items-center gap-2 mt-2">
            {trend && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${trendBg}`}>
                {trend}
              </span>
            )}
            {(trendLabel || subtitle) && (
              <span className="text-xs font-archivo text-[#667085] dark:text-[#94A3B8]">
                {trendLabel || subtitle}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
