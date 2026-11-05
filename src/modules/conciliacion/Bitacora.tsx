import React, { useEffect, useMemo, useState } from 'react';
import { FileText, History, RotateCcw } from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import { formatCurrency, formatDate, formatDatetime } from '../../lib/formatters';
import { EstadoConciliacionBadge, ReconciliacionesLog } from '../../lib/conciliacion/EstadoBadge';
import type { EstadoConciliacion } from '../../lib/conciliacion/estados';
import type { LineaGrupo } from '../../lib/conciliacion/catalogoPagos';
import { GruposDesglose } from './GruposDesglose';

// Bitácora de conciliaciones de un negocio/mensajero (pedido 2026-11-05):
//   · desde el detalle del histórico ("Bitácora"): todas sus conciliaciones;
//   · antes de reconciliar: solo las del período en cuestión, con la acción
//     para continuar con la reconciliación.
// Al seleccionar una se ve su información, su desglose y sus versiones
// anteriores (registro de reconciliaciones: antes / después).

export interface BitacoraRegistro {
  id: string;
  fechaInicial: string;
  fechaFinal: string;
  riel: string;
  moneda: 'CUP' | 'USD';
  consecutivo: string | null;
  estado: EstadoConciliacion;
  neto: number; // Por Pagar − Por Cobrar
  fecha: string;
  responsable: string;
  reconciliaciones: number;
  enviadoAt: string | null;
  enviadoA: string | null;
  desglose: LineaGrupo[];
  extras: { label: string; value: string }[];
}

const solapa = (r: BitacoraRegistro, fi: string, ff: string) => r.fechaInicial <= ff && r.fechaFinal >= fi;

function Neto({ neto, moneda }: { neto: number; moneda: 'CUP' | 'USD' }) {
  if (neto > 0.005) return <span className="font-semibold text-[var(--color-danger)] tabular-nums">Pagar {formatCurrency(neto, moneda)}</span>;
  if (neto < -0.005) return <span className="font-semibold text-[var(--color-success)] tabular-nums">Cobrar {formatCurrency(-neto, moneda)}</span>;
  return <span className="font-semibold text-[var(--color-text-faint)] tabular-nums">{formatCurrency(0, moneda)}</span>;
}

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{label}</span>
      <span className="text-xs font-semibold text-[var(--color-text)]">{value}</span>
    </div>
  );
}

export function BitacoraConciliaciones({
  abierta, onCerrar, nombre, registros, periodo, seleccionInicial, onAbrirPdf, accion,
}: {
  abierta: boolean;
  onCerrar: () => void;
  nombre: string;
  registros: BitacoraRegistro[];
  periodo?: { fechaInicial: string; fechaFinal: string } | null; // solo este período
  seleccionInicial?: string | null;
  onAbrirPdf?: (id: string) => void;
  accion?: { label: string; onClick: () => void } | null;
}) {
  const lista = useMemo(() => {
    const base = periodo ? registros.filter(r => solapa(r, periodo.fechaInicial, periodo.fechaFinal)) : registros;
    return [...base].sort((a, b) => b.fechaInicial.localeCompare(a.fechaInicial) || a.riel.localeCompare(b.riel));
  }, [registros, periodo]);
  const [selId, setSelId] = useState<string | null>(null);
  useEffect(() => {
    if (abierta) setSelId(seleccionInicial && lista.some(r => r.id === seleccionInicial) ? seleccionInicial : lista[0]?.id || null);
  }, [abierta, seleccionInicial, lista]);
  const sel = lista.find(r => r.id === selId) || null;

  return (
    <SlideOver
      isOpen={abierta}
      onClose={onCerrar}
      title={`Bitácora · ${nombre}`}
      width="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>Cerrar</Button>
          {accion && (
            <Button variant="brand" className="gap-2" onClick={accion.onClick}>
              <RotateCcw size={16} /> {accion.label}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
          <History size={13} />
          {periodo
            ? <>Conciliaciones del período <strong className="text-[var(--color-text)]">{formatDate(periodo.fechaInicial)} — {formatDate(periodo.fechaFinal)}</strong> (incluye las que se solapan con él).</>
            : <>Todas las conciliaciones registradas ({lista.length}).</>}
        </p>

        <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <tr>
                <th className="p-3 font-bold">Período</th>
                <th className="p-3 font-bold">Riel</th>
                <th className="p-3 font-bold">Consecutivo</th>
                <th className="p-3 font-bold">Estado</th>
                <th className="p-3 font-bold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {lista.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-sm text-[var(--color-text-muted)]">Sin conciliaciones registradas{periodo ? ' en este período' : ''}.</td></tr>
              ) : lista.map(r => (
                <tr
                  key={r.id}
                  onClick={() => setSelId(r.id)}
                  className={cn('h-11 cursor-pointer transition-colors', r.id === selId ? 'bg-teal-50' : 'hover:bg-[var(--color-surface-2)]')}
                >
                  <td className="p-3 text-xs font-mono text-[var(--color-text-muted)] whitespace-nowrap">{formatDate(r.fechaInicial)} — {formatDate(r.fechaFinal)}</td>
                  <td className="p-3 text-xs text-[var(--color-text-muted)]">{r.riel} <span className="text-[10px] text-[var(--color-text-faint)]">({r.moneda})</span></td>
                  <td className="p-3 text-xs font-mono">{r.consecutivo || <span className="text-[var(--color-text-faint)]">—</span>}</td>
                  <td className="p-3"><EstadoConciliacionBadge estado={r.estado} /></td>
                  <td className="p-3 text-right text-xs"><Neto neto={r.neto} moneda={r.moneda} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sel && (
          <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 space-y-4 bg-[var(--color-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--color-text)]">
                {sel.consecutivo || 'Sin consecutivo'} · {sel.riel} ({sel.moneda})
              </h3>
              {onAbrirPdf && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onAbrirPdf(sel.id)}>
                  <FileText size={13} /> Ver PDF
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Campo label="Período" value={`${formatDate(sel.fechaInicial)} — ${formatDate(sel.fechaFinal)}`} />
              <Campo label="Total" value={<Neto neto={sel.neto} moneda={sel.moneda} />} />
              <Campo label="Estado" value={<EstadoConciliacionBadge estado={sel.estado} />} />
              <Campo label="Fecha de Conciliación" value={formatDate(sel.fecha)} />
              <Campo label="Responsable" value={sel.responsable} />
              <Campo label="Último envío" value={sel.enviadoAt ? `${formatDatetime(sel.enviadoAt)} · ${sel.enviadoA || ''}` : 'No enviado'} />
              {sel.extras.map(x => <React.Fragment key={x.label}><Campo label={x.label} value={x.value} /></React.Fragment>)}
            </div>
            {sel.desglose.length > 0 && (
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)] mb-1">Desglose por grupo de pago</span>
                <GruposDesglose lineas={sel.desglose} moneda={sel.moneda} />
              </div>
            )}
            {sel.reconciliaciones > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ReconciliacionesLog conciliacionId={sel.id} moneda={sel.moneda} cantidad={sel.reconciliaciones} />
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-faint)]">Esta conciliación no se ha reconciliado: es su versión original.</p>
            )}
          </div>
        )}
      </div>
    </SlideOver>
  );
}
