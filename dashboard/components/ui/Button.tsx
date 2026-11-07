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
    'inline-flex items-center justify-center font-archivo font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-[#050B1B] disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 h-8 gap-1.5 rounded-lg',
    md: 'text-sm px-4 py-2 h-10 gap-2 rounded-xl',
    lg: 'text-base px-6 py-2.5 h-12 gap-2.5 rounded-xl',
  };

  const variantStyles = {
    primary:
      'bg-[#1749F5] hover:bg-[#113AC8] text-white shadow-sm focus:ring-[#1749F5]',
    secondary:
      'bg-white dark:bg-[#09152D] hover:bg-[#F8FAFC] dark:hover:bg-white/5 text-[#303747] dark:text-[#F5F8FF] border border-[#E2E8F0] dark:border-white/10 shadow-sm focus:ring-[#E2E8F0]',
    outline:
      'bg-transparent hover:bg-[#ECEEFF]/60 dark:hover:bg-white/5 text-[#303747] dark:text-[#F5F8FF] border border-[#E2E8F0] dark:border-white/10 hover:border-[#1749F5] focus:ring-[#1749F5]',
    danger:
      'bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-sm focus:ring-[#EF4444]',
    ghost:
      'bg-transparent hover:bg-[#ECEEFF]/60 dark:hover:bg-white/5 text-[#667085] hover:text-[#1749F5] dark:hover:text-[#5B8EFF] focus:ring-transparent',
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
