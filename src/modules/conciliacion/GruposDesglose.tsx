import React from 'react';
import { formatCurrency } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { TIPOLOGIA_LABEL, type LineaGrupo, type Moneda } from '../../lib/conciliacion/catalogoPagos';

// Desglose de una conciliación por Grupo de pago (Configuración -> Tipología
// de Pago): una fila por grupo + tipología, con sus métodos, el saldo y la
// Cuenta por Cobrar (CxC) o por Pagar (CxP) que genera.
export function GruposDesglose({ lineas, moneda, className }: { lineas: LineaGrupo[]; moneda: Moneda; className?: string }) {
  const visibles = lineas.filter(l => l.ordenes > 0);
  if (visibles.length === 0) return null;
  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] overflow-hidden', className)}>
      {visibles.map(l => {
        const cobrar = l.tipologia === 'cobrar';
        return (
          <div key={l.key} className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-100 last:border-0">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold text-[var(--color-text)]">
                {l.grupo} <span className="font-medium text-[var(--color-text-faint)]">· {TIPOLOGIA_LABEL[l.tipologia]}</span>
              </span>
              <span className="text-[10px] text-slate-400 truncate" title={l.metodos.join(', ')}>
                {l.ordenes} órdenes · {l.metodos.join(', ')} · Saldo {formatCurrency(l.saldo, moneda)}
              </span>
            </div>
            <span className={cn('font-mono font-black text-sm tabular-nums shrink-0', cobrar ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
              {cobrar ? 'CxC ' : 'CxP '}{formatCurrency(l.monto, moneda)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
