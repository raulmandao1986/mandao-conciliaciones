import React, { useState, useMemo, useEffect } from 'react';
import { Search, Filter, MoreHorizontal, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../primitives/Button';

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  title?: string;
  actions?: React.ReactNode;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  pageSize?: number;
}

export function DataTable<T>({ 
  columns, 
  data, 
  isLoading, 
  onRowClick, 
  title, 
  actions,
  searchQuery,
  onSearchChange,
  pageSize = 10
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when data size or search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [data.length, searchQuery]);

  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalItems);

  const paginatedData = useMemo(() => {
    return data.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [data, currentPage, pageSize]);

  const getVisiblePages = () => {
    const half = 2;
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, currentPage + half);

    if (currentPage <= half) {
      end = Math.min(totalPages, 5);
    } else if (currentPage + half >= totalPages) {
      start = Math.max(1, totalPages - 4);
    }

    const pages = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden flex flex-col h-full">
      {/* FilterBar (Sticky) */}
      <div className="sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 py-3 flex items-center justify-between gap-4">
        {title && <h2 className="font-semibold text-[var(--color-text)] whitespace-nowrap">{title}</h2>}
        
        <div className="flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
          <input 
            type="text" 
            placeholder="Buscar registros..."
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full h-9 pl-9 pr-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm focus:border-[var(--color-primary)] outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" className="gap-2">
             <Filter size={14} />
             Filtros
           </Button>
           <Button variant="outline" size="sm" className="gap-2">
             <Download size={14} />
             Exportar
           </Button>
           {actions}
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
            <tr>
              <th className="w-12 px-6 py-3 border-b border-[var(--color-border)]">
                <input type="checkbox" className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
              </th>
              {columns.map((col, i) => (
                <th 
                  key={i} 
                  className={cn(
                    "px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border)] whitespace-nowrap",
                    col.align === 'right' && "text-right",
                    col.align === 'center' && "text-center"
                  )}
                >
                  {col.header}
                </th>
              ))}
              <th className="w-16 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]" title="Acciones"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {isLoading ? (
               Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4"><div className="h-4 w-4 bg-[var(--color-surface-3)] rounded" /></td>
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-4 w-full bg-[var(--color-surface-3)] rounded" /></td>
                  ))}
                  <td className="px-6 py-4"><div className="h-4 w-8 bg-[var(--color-surface-3)] rounded" /></td>
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
               <tr>
                 <td colSpan={columns.length + 2} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                       <div className="w-12 h-12 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center">
                          <Search className="w-6 h-6 text-[var(--color-text-faint)]" />
                       </div>
                       <p className="text-sm font-medium text-[var(--color-text-muted)]">No se encontraron resultados</p>
                    </div>
                 </td>
               </tr>
            ) : (
              paginatedData.map((item, i) => (
                <tr 
                  key={i} 
                  onClick={() => onRowClick?.(item)}
                  className="group hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3">
                    <input type="checkbox" onClick={e => e.stopPropagation()} className="rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]" />
                  </td>
                  {columns.map((col, j) => (
                    <td 
                      key={j} 
                      className={cn(
                        "px-4 py-3 text-sm text-[var(--color-text)] whitespace-nowrap",
                        col.align === 'right' && "text-right",
                        col.align === 'center' && "text-center",
                        col.className
                      )}
                    >
                      {typeof col.accessor === 'function' ? col.accessor(item) : (item[col.accessor] as React.ReactNode)}
                    </td>
                  ))}
                  <td className="px-6 py-3 text-right">
                    <button className="p-1.5 hover:bg-[var(--color-surface-3)] rounded text-[var(--color-text-faint)] opacity-0 group-hover:opacity-100 transition-all">
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-3 bg-[var(--color-surface-2)] border-t border-[var(--color-border)] flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)] tracking-tight">
          Mostrando <span className="font-semibold text-[var(--color-text)]">{startIndex}-{endIndex}</span> de <span className="font-semibold text-[var(--color-text)]">{totalItems}</span> resultados
        </p>
        <div className="flex items-center gap-1">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0" 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
          </Button>

          {visiblePages.map((pageNum) => (
            <Button
              key={pageNum}
              variant={currentPage === pageNum ? "secondary" : "outline"}
              size="sm"
              className={cn(
                "h-8 w-8 p-0",
                currentPage === pageNum && "border border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-brand-active)]"
              )}
              onClick={() => setCurrentPage(pageNum)}
            >
              {pageNum}
            </Button>
          ))}

          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0" 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
