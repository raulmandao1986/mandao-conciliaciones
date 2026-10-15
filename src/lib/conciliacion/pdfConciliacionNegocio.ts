import { supabase } from '../supabase';
import { formatDate } from '../formatters';
import { fetchAllRows } from './fetchAllRows';
import { mapPaymentTypeToBucket, normalizeEntityName, type PaymentBucket } from './paymentBuckets';
import logoUrl from '../../assets/brand/mandao-logo.jpg';

// PDF "Reporte de conciliación" de Negocios (diseño entregado por el
// usuario 2026-10-15): encabezado, Resumen Órdenes por método de pago y el
// detalle de cada orden. Uno por fila de conciliación: un negocio con vía
// Transferencia-Exterior genera dos (CUP y USD). El de USD (Exterior) va
// SIN logo de la empresa; el de CUP lo lleva.

export interface PdfNegocioRecord {
  id: string;
  consecutivo: string | null;
  establecimiento: string;
  areaId: string | null;
  area: string;
  fechaInicial: string;
  fechaFinal: string;
  fecha: string;
  viaPago: string;          // subtipo: Transferencia | Efectivo | Exterior
  moneda: 'CUP' | 'USD';
  responsable: string;
  ordenesEfectivo: number;
  ordenesTransfermovil: number;
  ordenesSaldoMandao: number;
  ordenesTarjeta: number;
  cxcCU: number;
  cxpTM: number;
  cxpSM: number;
  cxpUS: number;
  comisionPct: number | null;  // guardados al conciliar (migración 2026-10-15)
  tasaCambio: number | null;
}

export interface OrdenPdf {
  fecha: string;          // YYYY-MM-DD
  orderId: string;
  bucket: PaymentBucket;
  montoCup: number;       // product_amount
}

const BUCKETS: PaymentBucket[] = ['efectivo', 'transfermovil', 'saldomandao', 'tarjeta'];
const TIPO: Record<PaymentBucket, string> = {
  efectivo: 'Efectivo',
  transfermovil: 'Transfermóvil',
  saldomandao: 'Saldo Mandao',
  tarjeta: 'Tarjeta',
};

const bucketCount = (rec: PdfNegocioRecord, b: PaymentBucket) =>
  ({ efectivo: rec.ordenesEfectivo, transfermovil: rec.ordenesTransfermovil, saldomandao: rec.ordenesSaldoMandao, tarjeta: rec.ordenesTarjeta })[b] || 0;

// Órdenes de cada conciliación, leídas de `dispatcher`: mismo negocio, Área
// y rango, y solo de los métodos de pago que entran en esa fila (una fila
// "Transferencia" de un negocio Exterior no incluye Saldo Mandao/Tarjeta).
// Una sola consulta por Área + rango, aunque sean cientos de conciliaciones.
export async function loadOrdenesNegocio(records: PdfNegocioRecord[]): Promise<Map<string, OrdenPdf[]>> {
  const result = new Map<string, OrdenPdf[]>();
  const grupos = new Map<string, PdfNegocioRecord[]>();
  records.forEach(r => {
    const k = `${r.areaId || ''}|${r.fechaInicial}|${r.fechaFinal}`;
    grupos.set(k, [...(grupos.get(k) || []), r]);
  });

  for (const recs of grupos.values()) {
    const { areaId, fechaInicial, fechaFinal } = recs[0];
    const rows = await fetchAllRows<any>((from, to) => {
      let q = supabase.from('dispatcher')
        .select('order_pk, order_id, delivery_date, store, payment_type, product_amount')
        .gte('delivery_date', fechaInicial)
        .lte('delivery_date', fechaFinal);
      if (areaId) q = q.eq('area_id', areaId);
      return q.order('order_pk').range(from, to);
    });
    recs.forEach(rec => {
      const nombre = normalizeEntityName(rec.establecimiento);
      const ordenes: OrdenPdf[] = [];
      rows.forEach((r: any) => {
        if (normalizeEntityName(r.store) !== nombre) return;
        const bucket = mapPaymentTypeToBucket(r.payment_type || '');
        if (!bucket || bucketCount(rec, bucket) === 0) return;
        ordenes.push({ fecha: r.delivery_date, orderId: String(r.order_id || ''), bucket, montoCup: Number(r.product_amount) || 0 });
      });
      ordenes.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orderId.localeCompare(b.orderId));
      result.set(rec.id, ordenes);
    });
  }
  return result;
}

let logoPromise: Promise<string | null> | null = null;
function getLogoDataUrl(): Promise<string | null> {
  if (!logoPromise) {
    logoPromise = fetch(logoUrl)
      .then(r => r.blob())
      .then(blob => new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      }))
      .catch(() => null);
  }
  return logoPromise;
}

const num = (v: number) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const AMARILLO: [number, number, number] = [255, 191, 0];   // --color-brand
const NEGRO: [number, number, number] = [23, 23, 23];         // --color-brand-ink
const GRIS: [number, number, number] = [100, 116, 139];

export async function buildPdfNegocio(
  rec: PdfNegocioRecord,
  ordenes: OrdenPdf[],
  defaults: { comisionPct: number; tasaCambio: number | null }
) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const esUSD = rec.moneda === 'USD';
  const pct = (rec.comisionPct ?? defaults.comisionPct) / 100;
  const tasa = esUSD ? (rec.tasaCambio ?? defaults.tasaCambio ?? 0) : 1;
  const mon = rec.moneda;

  // Detalle por orden: Efectivo -> Mandao cobra el % (comisión) y el
  // negocio se queda el resto; demás métodos -> Mandao paga (100 − %).
  const lineas = ordenes.map(o => {
    const importe = o.montoCup * tasa;
    const comision = importe * pct;
    return { ...o, importe, beneficio: importe - comision, comision };
  });
  const porBucket = (b: PaymentBucket) => {
    const ls = lineas.filter(l => l.bucket === b);
    return {
      ordenes: ls.length,
      ventas: ls.reduce((s, l) => s + l.importe, 0),
      beneficio: ls.reduce((s, l) => s + l.beneficio, 0),
      comision: ls.reduce((s, l) => s + l.comision, 0),
    };
  };
  const res = Object.fromEntries(BUCKETS.map(b => [b, porBucket(b)])) as Record<PaymentBucket, ReturnType<typeof porBucket>>;
  const tot = BUCKETS.reduce((t, b) => ({
    ordenes: t.ordenes + res[b].ordenes,
    ventas: t.ventas + res[b].ventas,
    beneficio: t.beneficio + res[b].beneficio,
    comision: t.comision + res[b].comision,
  }), { ordenes: 0, ventas: 0, beneficio: 0, comision: 0 });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 14;

  // Encabezado: título + logo (solo en el PDF en CUP).
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NEGRO);
  doc.text('Reporte de conciliación', M, 26);
  if (!esUSD) {
    const logo = await getLogoDataUrl();
    if (logo) doc.addImage(logo, 'JPEG', pageW - M - 44, 8, 44, 44 * 154 / 272);
  }

  const bordes = { lineColor: NEGRO, lineWidth: 0.2 };
  const cabecera = { fillColor: AMARILLO, textColor: NEGRO, fontStyle: 'bold' as const, halign: 'center' as const, ...bordes };

  autoTable(doc, {
    startY: 40,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 8.5, halign: 'center', textColor: NEGRO, cellPadding: 1.6, ...bordes },
    headStyles: cabecera,
    head: [['Consecutivo', 'Fecha Inicio', 'Fecha Fin', 'Establecimiento', 'Vía de pago']],
    body: [[
      rec.consecutivo || 'Sin consecutivo (saldo 0)',
      formatDate(rec.fechaInicial),
      formatDate(rec.fechaFinal),
      rec.establecimiento,
      `${rec.viaPago} (${mon})`,
    ]],
  });

  // Resumen Órdenes: Efectivo y Transfermóvil siempre en CUP; Saldo Mandao
  // y Tarjeta en la moneda del documento (USD en Exterior).
  const col = (b: PaymentBucket) => res[b];
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 8.5, halign: 'center', textColor: NEGRO, cellPadding: 1.6, ...bordes },
    headStyles: cabecera,
    columnStyles: { 0: { fontStyle: 'bold' } },
    head: [
      [{ content: 'Resumen Órdenes', colSpan: 6, styles: { halign: 'center' } }],
      ['Datos', 'Efectivo (CUP)', 'Transfermóvil (CUP)', `Saldo Mandao (${mon})`, `Tarjeta (${mon})`, `Totales (${mon})`],
    ],
    body: [
      ['Órdenes', ...BUCKETS.map(b => String(col(b).ordenes)), String(tot.ordenes)],
      ['Ventas', ...BUCKETS.map(b => num(col(b).ventas)), num(tot.ventas)],
      ['Beneficio Negocio', ...BUCKETS.map(b => num(col(b).beneficio)), num(tot.beneficio)],
      ['Comisión Mandao', ...BUCKETS.map(b => num(col(b).comision)), num(tot.comision)],
    ],
  });

  // Total a pagar / cobrar de la conciliación (lo registrado en la BD).
  const totalCxP = rec.cxpTM + rec.cxpSM + rec.cxpUS;
  const neto = totalCxP - rec.cxcCU;
  let y = (doc as any).lastAutoTable.finalY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    Math.abs(neto) < 0.005
      ? `Saldo de la conciliación: 0,00 ${mon} (no se paga ni se cobra)`
      : neto > 0
        ? `Total a Pagar al Negocio: ${num(neto)} ${mon}`
        : `Total a Cobrar al Negocio: ${num(-neto)} ${mon}`,
    M, y
  );
  y += 5;

  // Detalle de órdenes.
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 16 },
    theme: 'plain',
    styles: { fontSize: 8, textColor: NEGRO, cellPadding: { top: 1.1, bottom: 1.1, left: 1.5, right: 1.5 } },
    headStyles: { ...cabecera, lineWidth: 0.2 },
    columnStyles: {
      3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
    },
    head: [['Fecha', 'Tipo de pedido', 'Número de orden', `Importe Total (${mon})`, 'Beneficio Negocio', 'Comisión Mandao']],
    body: lineas.length > 0
      ? lineas.map(l => [formatDate(l.fecha), TIPO[l.bucket], l.orderId, num(l.importe), num(l.beneficio), num(l.comision)])
      : [[{ content: 'No se encontraron órdenes para esta conciliación.', colSpan: 6, styles: { halign: 'center', textColor: GRIS } }]],
    // Pie de cada página: responsable / fecha de conciliación y paginado.
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(`Conciliado el ${formatDate(rec.fecha)} por ${rec.responsable} · Área: ${rec.area}`, M, h - 8);
      doc.text(`Página ${doc.getNumberOfPages()}`, pageW - M, h - 8, { align: 'right' });
      doc.setTextColor(...NEGRO);
    },
  });

  return doc;
}
