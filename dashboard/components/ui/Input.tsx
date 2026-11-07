import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({ label, error, helperText, className = '', id, ...props }: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label htmlFor={inputId} className="block text-xs sm:text-[13px] font-archivo font-medium text-[#090B12] dark:text-[#F5F8FF]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full h-11 sm:h-12 bg-[#F8FAFC] dark:bg-white/5 border ${
          error
            ? 'border-[#EF4444] focus:ring-2 focus:ring-[#EF4444]/20 focus:border-[#EF4444]'
            : 'border-[#E2E8F0] dark:border-white/15 focus:ring-2 focus:ring-[#1749F5]/20 focus:border-[#1749F5]'
        } text-[#090B12] dark:text-white placeholder:text-[#94A3B8] text-sm font-archivo rounded-xl px-4 transition-all focus:outline-none ${className}`}
        {...props}
      />
      {error && <p className="text-xs font-archivo text-[#EF4444] mt-1">{error}</p>}
      {helperText && !error && <p className="text-xs font-archivo text-[#667085] dark:text-[#94A3B8] mt-1">{helperText}</p>}
    </div>
  );
}
