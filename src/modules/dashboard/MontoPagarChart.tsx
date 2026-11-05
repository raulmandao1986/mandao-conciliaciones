import React, { useMemo, useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters';
import { cn } from '../../lib/utils';

// Resumen visual del monto a pagar (conciliado) a Negocios y Mensajeros por
// semana, en CUP. Barras agrupadas en HTML/CSS (sin librería de gráficos):
// 2 series de la paleta categórica validada (azul / naranja, ver skill
// dataviz), un solo eje, tooltip por grupo y vista de tabla.

export interface SemanaMonto {
  label: string;       // "01/09 – 07/09"
  negocios: number;    // CUP
  mensajeros: number;  // CUP
}

const SERIES = [
  { key: 'negocios' as const, label: 'Negocios', color: '#2a78d6' },
  { key: 'mensajeros' as const, label: 'Mensajeros', color: '#eb6834' },
];

const compact = (v: number) =>
  new Intl.NumberFormat('es-VE', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

// Máximo "redondo" del eje (1, 2, 2.5 o 5 × 10^k) para ticks legibles.
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

export function MontoPagarChart({ semanas }: { semanas: SemanaMonto[] }) {
  const [vista, setVista] = useState<'grafico' | 'tabla'>('grafico');
  const [hover, setHover] = useState<number | null>(null);

  const totales = useMemo(() => ({
    negocios: semanas.reduce((s, w) => s + w.negocios, 0),
    mensajeros: semanas.reduce((s, w) => s + w.mensajeros, 0),
  }), [semanas]);
  const max = niceMax(Math.max(0, ...semanas.flatMap(w => [w.negocios, w.mensajeros])));
  // 5 intervalos: con máximos 1/2/2.5/5/10 × 10^k los ticks quedan redondos.
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => t * max);
  const vacio = totales.negocios === 0 && totales.mensajeros === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Leyenda con el total de cada serie: la identidad nunca depende solo del color. */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {SERIES.map(s => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
              <strong className="text-[var(--color-text)] tabular-nums">{formatCurrency(totales[s.key], 'CUP')}</strong>
            </span>
          ))}
        </div>
        <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setVista('grafico')}
            aria-pressed={vista === 'grafico'}
            className={cn('h-8 px-2.5 inline-flex items-center gap-1', vista === 'grafico' ? 'bg-[var(--color-surface-3)] font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]')}
          >
            <BarChart3 size={13} /> Gráfico
          </button>
          <button
            type="button"
            onClick={() => setVista('tabla')}
            aria-pressed={vista === 'tabla'}
            className={cn('h-8 px-2.5 inline-flex items-center gap-1 border-l border-[var(--color-border)]', vista === 'tabla' ? 'bg-[var(--color-surface-3)] font-semibold text-[var(--color-text)]' : 'text-[var(--color-text-muted)]')}
          >
            <Table2 size={13} /> Tabla
          </button>
        </div>
      </div>

      {vacio ? (
        <div className="h-56 flex items-center justify-center text-sm text-[var(--color-text-muted)] bg-[var(--color-surface-2)] rounded-[var(--radius-sm)]">
          Sin montos a pagar conciliados en el período.
        </div>
      ) : vista === 'tabla' ? (
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            <tr>
              <th className="p-2 text-left font-bold">Semana</th>
              <th className="p-2 text-right font-bold">Negocios (CUP)</th>
              <th className="p-2 text-right font-bold">Mensajeros (CUP)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {semanas.map(w => (
              <tr key={w.label} className="h-10">
                <td className="p-2 font-mono text-xs text-[var(--color-text-muted)]">{w.label}</td>
                <td className="p-2 text-right tabular-nums">{formatCurrency(w.negocios, 'CUP')}</td>
                <td className="p-2 text-right tabular-nums">{formatCurrency(w.mensajeros, 'CUP')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative h-56 pl-12 pb-6" role="img" aria-label="Monto a pagar por semana a Negocios y Mensajeros, en CUP">
          {/* Grid y eje Y recesivos, en el mismo contenedor (y escala) que las barras */}
          <div className="absolute left-12 right-0 top-0 bottom-6" aria-hidden>
            {ticks.map(t => (
              <div key={t} className="absolute left-0 right-0" style={{ bottom: `${(t / max) * 100}%` }}>
                <span className="absolute -left-12 w-10 text-right text-[10px] text-[var(--color-text-faint)] tabular-nums translate-y-1/2 bottom-0">{compact(t)}</span>
                <div className={cn('w-full border-t', t === 0 ? 'border-[var(--color-border-strong)]' : 'border-dashed border-[var(--color-border)]')} />
              </div>
            ))}
          </div>
          <div className="absolute left-12 right-0 top-0 bottom-6 flex items-end gap-2">
            {semanas.map((w, i) => (
              <div
                key={w.label}
                className="relative flex-1 h-full flex items-end justify-center gap-0.5 cursor-default"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {hover === i && <div className="absolute inset-0 bg-[var(--color-surface-3)] rounded-[var(--radius-xs)] -z-0" aria-hidden />}
                {SERIES.map(s => (
                  <div
                    key={s.key}
                    className="relative z-10 w-full max-w-7 rounded-t-[4px] transition-[height] duration-300"
                    style={{ height: `${(w[s.key] / max) * 100}%`, background: s.color, minHeight: w[s.key] > 0 ? 2 : 0 }}
                  />
                ))}
                <span className="absolute -bottom-6 left-0 right-0 text-center text-[10px] text-[var(--color-text-faint)] font-mono truncate">{w.label}</span>
                {hover === i && (
                  <div className="absolute z-20 bottom-full mb-1 left-1/2 -translate-x-1/2 min-w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] shadow-lg p-2.5 text-xs pointer-events-none">
                    <div className="font-semibold text-[var(--color-text)] mb-1">{w.label}</div>
                    {SERIES.map(s => (
                      <div key={s.key} className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                          <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}
                        </span>
                        <span className="tabular-nums font-semibold text-[var(--color-text)]">{formatCurrency(w[s.key], 'CUP')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
