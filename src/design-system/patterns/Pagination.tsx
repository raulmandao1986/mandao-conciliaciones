import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

// Paginación para tablas propias (las que no usan DataTable). Uso:
//   const pag = usePagination(rows, 20, [filtros...]);
//   pag.pageItems.map(...)   y debajo de la tabla:  <Pagination {...pag} />
export function usePagination<T>(items: T[], pageSize = 20, resetKeys: unknown[] = []) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Vuelve a la primera página cuando cambian los filtros/datos.
  useEffect(() => { setPage(1); }, resetKeys); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );
  return { page, setPage, totalPages, pageItems, total: items.length, pageSize };
}

function visiblePages(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('…');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('…');
  pages.push(total);
  return pages;
}

export function Pagination({
  page, setPage, totalPages, total, pageSize, className,
}: {
  page: number;
  setPage: (p: number) => void;
  totalPages: number;
  total: number;
  pageSize: number;
  className?: string;
}) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = 'h-8 min-w-8 px-2 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-xs font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none';

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]', className)}>
      <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
        {from.toLocaleString('es-VE')}–{to.toLocaleString('es-VE')} de {total.toLocaleString('es-VE')}
      </span>
      <nav className="flex items-center gap-1" aria-label="Paginación">
        <button type="button" className={cn(btn, 'hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)]')} onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Página anterior" title="Página anterior">
          <ChevronLeft size={14} />
        </button>
        {visiblePages(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-[var(--color-text-faint)]">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(btn, 'tabular-nums', p === page
                ? 'bg-[var(--color-brand-active)] border border-[var(--color-brand-active-border)] text-[var(--color-brand-ink)]'
                : 'hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)]')}
            >
              {p}
            </button>
          )
        )}
        <button type="button" className={cn(btn, 'hover:bg-[var(--color-surface-3)] text-[var(--color-text-muted)]')} onClick={() => setPage(page + 1)} disabled={page === totalPages} aria-label="Página siguiente" title="Página siguiente">
          <ChevronRight size={14} />
        </button>
      </nav>
    </div>
  );
}
