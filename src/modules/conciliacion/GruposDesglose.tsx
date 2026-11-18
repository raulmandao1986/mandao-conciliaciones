import React from 'react';
import { formatCurrency } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { Monto } from '../../design-system/primitives/Monto';
import { TIPOLOGIA_LABEL, type LineaGrupo, type Moneda } from '../../lib/conciliacion/catalogoPagos';

// Desglose de una conciliación por Grupo de pago (Métodos de Pago -> Órdenes):
// una fila por grupo + tipología, con sus métodos, el saldo y la Cuenta por
// Cobrar (CxC, verde: Mandao cobra) o por Pagar (CxP, rojo: Mandao paga), con
// el mismo criterio de color que el resto del sistema; USD en fondo negro.
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
            <span className="flex items-center gap-1.5 shrink-0 text-sm">
              <span className="text-[10px] font-bold text-[var(--color-text-faint)]">{cobrar ? 'CxC' : 'CxP'}</span>
              <Monto valor={l.monto} moneda={moneda} tono={cobrar ? 'cobrar' : 'pagar'} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
