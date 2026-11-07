import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'lavender' | 'subtle' | 'elevated';
  className?: string;
  onClick?: () => void;
}

export function Card({
  children,
  variant = 'default',
  className = '',
  onClick,
}: CardProps) {
  const variantStyles = {
    default:
      'bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 rounded-[20px] sm:rounded-[24px] shadow-[0_4px_20px_-2px_rgba(17,24,39,0.05)]',
    lavender:
      'bg-[#ECEEFF] dark:bg-[#0C1838] border border-[#DFE3F8] dark:border-white/10 rounded-[28px] sm:rounded-[32px] shadow-sm',
    subtle:
      'bg-[#F8FAFC] dark:bg-white/5 border border-[#E2E8F0] dark:border-white/10 rounded-[18px] sm:rounded-[20px]',
    elevated:
      'bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 rounded-[24px] sm:rounded-[28px] shadow-[0_16px_45px_rgba(31,45,88,0.08)]',
  };

  return (
    <div
      onClick={onClick}
      className={`${variantStyles[variant]} p-6 sm:p-8 transition-all ${
        onClick ? 'cursor-pointer hover:border-[#2045E8]/40 hover:shadow-md' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
