import React from 'react';
import { cn } from '../../lib/utils';
import { formatCurrency } from '../../lib/formatters';

// Monto con su moneda (2026-11-16): "236,41 USD" / "30.920,20 CUP".
// - tono: pagar (rojo), cobrar (verde), neutro (gris, montos en 0) o texto
//   (color normal, para tablas). Sin texto "Pagar"/"Cobrar": el color lo indica.
// - CUP y USD se muestran igual; la moneda la indica el código al final
//   (rectificado 2026-11-18: sin fondo negro, para no perder el color).
// `valor` puede venir con signo (neto = Por Pagar − Por Cobrar): se muestra
// en absoluto y, si no se indica tono, se deduce del signo.

export type TonoMonto = 'pagar' | 'cobrar' | 'neutro' | 'texto';

export const tonoDeNeto = (neto: number): TonoMonto => (neto > 0.005 ? 'pagar' : neto < -0.005 ? 'cobrar' : 'neutro');

export function Monto({ valor, moneda, tono, className }: {
  valor: number;
  moneda: 'CUP' | 'USD' | string;
  tono?: TonoMonto;
  className?: string;
}) {
  const t = tono ?? tonoDeNeto(valor);
  return (
    <span
      className={cn(
        'font-bold tabular-nums whitespace-nowrap',
        t === 'pagar' ? 'text-[var(--color-danger)]' : t === 'cobrar' ? 'text-[var(--color-success)]' : t === 'texto' ? 'text-[var(--color-text)]' : 'text-[var(--color-text-faint)]',
        className
      )}
    >
      {formatCurrency(Math.abs(valor), moneda)}
    </span>
  );
}
