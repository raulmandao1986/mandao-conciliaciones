import React from 'react';
import { BarChart3 } from 'lucide-react';
import { formatCurrency } from '../../lib/formatters';
import type { PaymentBucket, BucketBreakdown } from '../../lib/conciliacion/paymentBuckets';

// Resumen del período en la Conciliación Masiva (pedido por el usuario
// 2026-10-07): órdenes, ventas, beneficio (negocio/mensajero) y comisión
// Mandao por método de pago de las órdenes y por moneda. Es solo
// informativo: no cambia ningún cálculo de la conciliación.

export interface ResumenFila {
  key: string;
  metodo: string;
  moneda: 'CUP' | 'USD';
  ordenes: number;
  ventas: number;
  beneficio: number | null;  // null = no aplica (órdenes sin clasificar)
  comision: number | null;
}

const BUCKET_ORDER: PaymentBucket[] = ['efectivo', 'transfermovil', 'saldomandao', 'tarjeta'];
const BUCKET_LABEL: Record<PaymentBucket, string> = {
  efectivo: 'Efectivo',
  transfermovil: 'Transfermóvil',
  saldomandao: 'Saldo Mandao',
  tarjeta: 'Tarjeta (exterior)',
};

// Acumulador por método+moneda. `factorVentas` convierte el saldo (siempre
// en CUP) a la moneda de la fila; el monto CxC/CxP ya viene en esa moneda.
// Efectivo: la comisión Mandao es lo que se cobra (CxC) y el beneficio es el
// resto. Resto de métodos: el beneficio es lo que se paga (CxP) y la
// comisión es la diferencia.
export class ResumenBuilder {
  private filas = new Map<string, ResumenFila>();

  addBuckets(buckets: Record<PaymentBucket, BucketBreakdown>, moneda: 'CUP' | 'USD', factorVentas = 1) {
    BUCKET_ORDER.forEach(b => {
      const bk = buckets[b];
      if (!bk || bk.ordenes === 0) return;
      const ventas = bk.saldo * factorVentas;
      const beneficio = b === 'efectivo' ? ventas - bk.monto : bk.monto;
      const comision = ventas - beneficio;
      this.add({ key: `${b}|${moneda}`, metodo: BUCKET_LABEL[b], moneda, ordenes: bk.ordenes, ventas, beneficio, comision });
    });
  }

  addSinClasificar(ordenes: number, saldoCup: number) {
    if (ordenes === 0) return;
    this.add({ key: 'sinclasificar|CUP', metodo: 'Sin clasificar', moneda: 'CUP', ordenes, ventas: saldoCup, beneficio: null, comision: null });
  }

  private add(f: ResumenFila) {
    const prev = this.filas.get(f.key);
    if (!prev) { this.filas.set(f.key, { ...f }); return; }
    prev.ordenes += f.ordenes;
    prev.ventas += f.ventas;
    prev.beneficio = prev.beneficio === null || f.beneficio === null ? null : prev.beneficio + f.beneficio;
    prev.comision = prev.comision === null || f.comision === null ? null : prev.comision + f.comision;
  }

  build(): ResumenFila[] {
    const rank = (k: string) => {
      const [b, m] = k.split('|');
      const i = BUCKET_ORDER.indexOf(b as PaymentBucket);
      return (i === -1 ? 99 : i) * 2 + (m === 'USD' ? 1 : 0);
    };
    return Array.from(this.filas.values()).sort((a, b) => rank(a.key) - rank(b.key));
  }
}

export function ResumenMetodosPago({
  filas, ventasLabel, beneficioLabel, nota, extra,
}: {
  filas: ResumenFila[];
  ventasLabel: string;      // "Ventas" (Negocios) / "Monto Delivery" (Mensajeros)
  beneficioLabel: string;   // "Beneficio Negocio" / "Beneficio Mensajero"
  nota?: string;
  extra?: React.ReactNode;  // datos adicionales debajo de la tabla
}) {
  const totalOrdenes = filas.reduce((s, f) => s + f.ordenes, 0);
  const totales = (['CUP', 'USD'] as const)
    .map(moneda => {
      const fs = filas.filter(f => f.moneda === moneda);
      return {
        moneda,
        ordenes: fs.reduce((s, f) => s + f.ordenes, 0),
        ventas: fs.reduce((s, f) => s + f.ventas, 0),
        beneficio: fs.reduce((s, f) => s + (f.beneficio ?? 0), 0),
        comision: fs.reduce((s, f) => s + (f.comision ?? 0), 0),
      };
    })
    .filter(t => t.ordenes > 0);

  const num = 'p-3 text-right tabular-nums';
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[var(--color-text)] flex items-center gap-2">
            <BarChart3 size={16} className="text-[var(--color-primary)]" />
            Resumen del período por método de pago
          </h3>
          {nota && <p className="text-xs text-slate-500 mt-0.5">{nota}</p>}
        </div>
        <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums shrink-0">{totalOrdenes.toLocaleString('es-VE')} órdenes</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="bg-slate-50 border-b border-[var(--color-border)]">
            <tr className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider">
              <th className="p-3">Método de pago</th>
              <th className="p-3">Moneda</th>
              <th className="p-3 text-right">Órdenes</th>
              <th className="p-3 text-right">{ventasLabel}</th>
              <th className="p-3 text-right">{beneficioLabel}</th>
              <th className="p-3 text-right">Comisión Mandao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-400 font-bold">Sin órdenes en el rango.</td></tr>
            ) : filas.map(f => (
              <tr key={f.key} className="h-11">
                <td className="p-3 font-semibold text-[var(--color-text)]">{f.metodo}</td>
                <td className="p-3 text-xs font-mono text-slate-500">{f.moneda}</td>
                <td className={num}>{f.ordenes.toLocaleString('es-VE')}</td>
                <td className={`${num} font-semibold`}>{formatCurrency(f.ventas, f.moneda)}</td>
                <td className={num}>{f.beneficio === null ? '—' : formatCurrency(f.beneficio, f.moneda)}</td>
                <td className={num}>{f.comision === null ? '—' : formatCurrency(f.comision, f.moneda)}</td>
              </tr>
            ))}
          </tbody>
          {totales.length > 0 && (
            <tfoot className="border-t-2 border-[var(--color-border)] bg-slate-50">
              {totales.map(t => (
                <tr key={t.moneda} className="h-11 font-black">
                  <td className="p-3 text-[var(--color-text)]">Total {t.moneda}</td>
                  <td className="p-3 text-xs font-mono text-slate-500">{t.moneda}</td>
                  <td className={num}>{t.ordenes.toLocaleString('es-VE')}</td>
                  <td className={num}>{formatCurrency(t.ventas, t.moneda)}</td>
                  <td className={num}>{formatCurrency(t.beneficio, t.moneda)}</td>
                  <td className={num}>{formatCurrency(t.comision, t.moneda)}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      {extra && <div className="p-4 border-t border-[var(--color-border)] text-xs text-slate-600">{extra}</div>}
    </div>
  );
}
