import React from 'react';
import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title?: string;
}

export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6">
      <div className="p-4 bg-brand-subtle rounded-2xl border border-brand-active-border mb-4">
        <Construction className="w-8 h-8 text-brand-ink" />
      </div>
      {title && <h1 className="text-lg font-bold text-[var(--color-text)] mb-1">{title}</h1>}
      <p className="text-sm text-[var(--color-text-muted)] max-w-sm">
        Este módulo estará disponible próximamente.
      </p>
    </div>
  );
}
