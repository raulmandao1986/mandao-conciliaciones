import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDanger = true
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className="relative bg-white rounded-lg shadow-xl border border-[var(--color-border)] p-6 max-w-sm w-full z-10 space-y-4"
          >
            <div className="flex items-start gap-4">
              <div className={cn(
                "p-3 rounded-full flex-shrink-0",
                isDanger ? "bg-red-50 text-red-600" : "bg-teal-50 text-teal-600"
              )}>
                {isDanger ? <XCircle size={24} /> : <CheckCircle2 size={24} />}
              </div>
              <div className="space-y-1 flex-grow">
                <h3 className="text-sm font-bold text-[var(--color-text)]">{title}</h3>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
              >
                {cancelText}
              </Button>
              <Button
                variant={isDanger ? 'danger' : 'primary'}
                size="sm"
                onClick={() => {
                  onConfirm();
                  onCancel();
                }}
              >
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
