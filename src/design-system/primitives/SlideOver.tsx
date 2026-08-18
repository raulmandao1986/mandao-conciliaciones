import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface SlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export function SlideOver({ isOpen, onClose, title, children, footer, width = 'max-w-2xl' }: SlideOverProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 transition-opacity"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "fixed inset-y-0 right-0 w-full z-50 bg-[var(--color-surface)] shadow-2xl flex flex-col",
              width
            )}
          >
            {/* Header */}
            <div className="h-16 px-6 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-[var(--color-text)] tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[var(--color-surface-2)] rounded-[var(--radius-sm)] text-[var(--color-text-faint)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/50 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
