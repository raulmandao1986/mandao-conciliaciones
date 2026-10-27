import React, { useEffect, useState } from 'react';
import { Loader2, History } from 'lucide-react';
import { cn } from '../utils';
import { formatCurrency, formatDatetime } from '../formatters';
import {
  ESTADO_CONCILIACION_CONFIG, parseEstado, transicionesEstado, loadReconciliaciones,
  type EstadoConciliacion, type Reconciliacion,
} from './estados';

export function EstadoConciliacionBadge({ estado }: { estado: string | null }) {
  const config = ESTADO_CONCILIACION_CONFIG[parseEstado(estado)];
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap', config.className)}>
      <Icon size={12} />
      {config.label}
    </span>
  );
}

// Badge + cambio de estado en línea desde la fila del histórico.
export function EstadoConciliacionControl({
  estado, neto, editable, onCambiar,
}: {
  estado: EstadoConciliacion;
  neto: number;
  editable: boolean;
  onCambiar: (nuevo: EstadoConciliacion) => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const opciones = editable ? transicionesEstado(estado, neto) : [];
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <EstadoConciliacionBadge estado={estado} />
      {opciones.length > 0 && (
        guardando ? <Loader2 size={13} className="animate-spin text-[var(--color-text-faint)]" /> : (
          <select
            aria-label="Cambiar estado"
            title="Cambiar estado"
            value=""
            onChange={async (e) => {
              const nuevo = e.target.value as EstadoConciliacion;
              if (!nuevo) return;
              setGuardando(true);
              try { await onCambiar(nuevo); } finally { setGuardando(false); }
            }}
            className="h-7 px-1.5 text-[11px] bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] text-[var(--color-text-muted)]"
          >
            <option value="">Cambiar…</option>
            {opciones.map(o => <option key={o} value={o}>{o === 'Nuevo' || (o === 'Enviado' && estado === 'Confirmado') ? `Volver a ${o}` : o}</option>)}
          </select>
        )
      )}
    </div>
  );
}

const CAMPOS: Record<string, string> = {
  cxc_cu: 'Por Cobrar (CxC)',
  cxp_tm: 'Por Pagar CUP',
  cxp_sm: 'Por Pagar USD',
  cxp_us: 'Por Pagar (otros)',
  ordenes_efectivo: 'Órdenes Por Cobrar',
  ordenes_transfermovil: 'Órdenes Por Pagar CUP',
  ordenes_saldo_mandao: 'Órdenes Por Pagar USD',
  ordenes_tarjeta: 'Órdenes (otros)',
  comision_pct: '% Comisión',
  tasa_cambio: 'Tasa de cambio',
  disponibilidades: 'Disponibilidades',
  alquiler_mochila: 'Alquiler Mochila',
  total_ordenes: 'Total Órdenes',
  total_por_cobrar: 'Total por Cobrar',
  total_por_pagar: 'Total por Pagar',
  saldo_cup: 'Saldo CUP',
};
const MONTOS = new Set(['cxc_cu', 'cxp_tm', 'cxp_sm', 'cxp_us', 'disponibilidades', 'alquiler_mochila', 'total_por_cobrar', 'total_por_pagar', 'saldo_cup']);

function valor(campo: string, v: unknown, moneda: 'CUP' | 'USD'): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (MONTOS.has(campo) && Number.isFinite(n)) return formatCurrency(n, moneda);
  if (campo === 'comision_pct') return `${n}%`;
  return String(v);
}

// Registro de reconciliaciones (valores anteriores y nuevos) de una conciliación.
export function ReconciliacionesLog({ conciliacionId, moneda, cantidad }: { conciliacionId: string; moneda: 'CUP' | 'USD'; cantidad: number }) {
  const [items, setItems] = useState<Reconciliacion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cantidad === 0) { setItems([]); return; }
    let vivo = true;
    loadReconciliaciones(conciliacionId)
      .then(r => { if (vivo) setItems(r); })
      .catch(e => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, [conciliacionId, cantidad]);

  if (cantidad === 0) return null;
  return (
    <div className="col-span-2 md:col-span-4 space-y-2">
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
        <History size={12} /> Reconciliaciones ({cantidad})
      </span>
      {error ? (
        <p className="text-xs font-medium text-[var(--color-danger)]">No se pudo cargar el registro: {error}</p>
      ) : !items ? (
        <Loader2 size={14} className="animate-spin text-[var(--color-text-faint)]" />
      ) : items.map(it => {
        const cambios = Object.keys(CAMPOS).filter(c => JSON.stringify(it.antes[c] ?? null) !== JSON.stringify(it.despues[c] ?? null));
        return (
          <div key={it.id} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white p-3">
            <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
              <span className="font-semibold text-[var(--color-text)] tabular-nums">{formatDatetime(it.fecha)}</span>
              {' · '}{it.responsable}{it.estadoAnterior ? ` · estaba ${it.estadoAnterior}` : ''}
            </p>
            {cambios.length === 0 ? (
              <p className="text-[11px] text-[var(--color-text-faint)]">Solo cambió el desglose por grupo de pago.</p>
            ) : (
              <table className="w-full max-w-xl text-[11px]">
                <thead className="text-[10px] uppercase text-[var(--color-text-faint)]">
                  <tr><th className="text-left font-bold py-1">Campo</th><th className="text-right font-bold py-1">Antes</th><th className="text-right font-bold py-1">Después</th></tr>
                </thead>
                <tbody>
                  {cambios.map(c => (
                    <tr key={c} className="border-t border-[var(--color-border)]">
                      <td className="py-1 text-[var(--color-text-muted)]">{CAMPOS[c]}</td>
                      <td className="py-1 text-right tabular-nums text-[var(--color-text-faint)] line-through">{valor(c, it.antes[c], moneda)}</td>
                      <td className="py-1 text-right tabular-nums font-semibold text-[var(--color-text)]">{valor(c, it.despues[c], moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
