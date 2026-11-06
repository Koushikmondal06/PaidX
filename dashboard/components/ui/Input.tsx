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
        <label htmlFor={inputId} className="block text-xs font-mono font-medium text-[#DFE0E2]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full bg-[#071013] border ${
          error ? 'border-[#EB5160] focus:ring-[#EB5160]' : 'border-[#1A2E38] focus:ring-[#5465FF]'
        } text-[#DFE0E2] placeholder-[#666666] text-xs font-mono rounded-lg px-3.5 py-2.5 transition-all focus:outline-none focus:ring-1 focus:border-transparent ${className}`}
        {...props}
      />
      {error && <p className="text-[11px] font-mono text-[#EB5160] mt-1">{error}</p>}
      {helperText && !error && <p className="text-[11px] font-mono text-[#AAAAAA] mt-1">{helperText}</p>}
    </div>
  );
}
