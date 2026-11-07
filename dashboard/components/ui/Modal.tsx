'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div
        className={`w-full ${maxWidth} bg-white dark:bg-[#09152D] border border-[#E2E8F0] dark:border-white/10 rounded-[24px] shadow-2xl p-6 sm:p-8 relative transition-all`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0] dark:border-white/10">
          <h3 className="text-base sm:text-lg font-archivo font-semibold text-[#111111] dark:text-[#F5F8FF]">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-[#64748B] hover:text-[#111111] dark:text-[#94A3B8] dark:hover:text-white rounded-lg hover:bg-[#F1F5F9] dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
