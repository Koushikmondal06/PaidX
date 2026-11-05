import React from 'react';
import { Card } from './Card';

export function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-[#AAAAAA]">{title}</span>
        {icon && <div className="text-[#5465FF] p-1.5 rounded-md bg-[#0E1D24] border border-[#1A2E38]">{icon}</div>}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold font-mono tracking-tight text-[#DFE0E2]">{value}</div>
        {subtitle && <p className="text-[11px] font-mono text-[#888888] mt-1">{subtitle}</p>}
      </div>
    </Card>
  );
}
