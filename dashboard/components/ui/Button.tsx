import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center font-mono font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#071013] disabled:opacity-50 disabled:cursor-not-allowed select-none';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 h-8 gap-1.5',
    md: 'text-xs px-4 py-2 h-10 gap-2',
    lg: 'text-sm px-6 py-2.5 h-12 gap-2.5',
  };

  const variantStyles = {
    primary:
      'bg-[#5465FF] hover:bg-[#4353E0] text-white shadow-sm shadow-[#5465FF]/20 focus:ring-[#5465FF]',
    secondary:
      'bg-[#0E1D24] hover:bg-[#1A2E38] text-[#DFE0E2] border border-[#1A2E38] focus:ring-[#1A2E38]',
    outline:
      'bg-transparent hover:bg-[#0E1D24] text-[#DFE0E2] border border-[#1A2E38] hover:border-[#5465FF]/50 focus:ring-[#5465FF]',
    danger:
      'bg-[#EB5160] hover:bg-[#D94050] text-white shadow-sm shadow-[#EB5160]/20 focus:ring-[#EB5160]',
    ghost:
      'bg-transparent hover:bg-[#0E1D24]/60 text-[#AAAAAA] hover:text-[#DFE0E2] focus:ring-[#1A2E38]',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
