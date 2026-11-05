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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div
        className={`w-full ${maxWidth} bg-[#0B161B] border border-[#1A2E38] rounded-xl shadow-2xl p-6 relative`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#1A2E38]">
          <h3 className="text-sm font-mono font-bold text-[#DFE0E2]">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-[#AAAAAA] hover:text-[#DFE0E2] rounded-md hover:bg-[#0E1D24] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
