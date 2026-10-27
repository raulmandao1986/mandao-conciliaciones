import { supabase } from '../supabase';
import { formatDate } from '../formatters';
import { fetchAllRows } from './fetchAllRows';
import { mapPaymentTypeToBucket, normalizeEntityName, type PaymentBucket } from './paymentBuckets';
import {
  BUCKETS, TIPO, sinMandao, num, NEGRO, GRIS, PDF_MARGEN as M, BORDES as bordes, CABECERA as cabecera,
  drawEncabezado, drawPie, repartir, resumenPorBucket,
} from './pdfComun';

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
  paymentType: string;    // dispatcher.payment_type tal cual (Card, Crédito o Débito…)
  montoCup: number;       // product_amount
}

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
        ordenes.push({ fecha: r.delivery_date, orderId: String(r.order_id || ''), bucket, paymentType: String(r.payment_type || ''), montoCup: Number(r.product_amount) || 0 });
      });
      ordenes.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orderId.localeCompare(b.orderId));
      result.set(rec.id, ordenes);
    });
  }
  return result;
}

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

  const lineas = repartir(ordenes, pct, tasa);
  const { res, tot } = resumenPorBucket(lineas);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Encabezado: título + logo (solo en el PDF en CUP).
  await drawEncabezado(doc, !esUSD);

  autoTable(doc, {
    startY: 40,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 8.5, halign: 'center', textColor: NEGRO, cellPadding: 1.6, ...bordes },
    headStyles: cabecera,
    head: [['Establecimiento', 'Fecha Inicio', 'Fecha Fin', 'Vía de pago']],
    body: [[
      rec.establecimiento,
      formatDate(rec.fechaInicial),
      formatDate(rec.fechaFinal),
      `${rec.viaPago} (${mon})`,
    ]],
  });

  // Resumen Órdenes: solo las columnas de esta conciliación. PDF en USD
  // (Exterior): Saldo y Tarjeta. PDF en CUP: los métodos con órdenes en esta
  // fila (un negocio "Transferencia" normal sí tiene Saldo/Tarjeta en CUP; el
  // PDF en CUP de un negocio Exterior queda con Efectivo y Transfermóvil).
  const col = (b: PaymentBucket) => res[b];
  const conOrdenes = BUCKETS.filter(b => bucketCount(rec, b) > 0);
  const cols: PaymentBucket[] = esUSD
    ? ['saldomandao', 'tarjeta']
    : (conOrdenes.length > 0 ? conOrdenes : ['efectivo', 'transfermovil']);
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 8.5, halign: 'center', textColor: NEGRO, cellPadding: 1.6, ...bordes },
    headStyles: cabecera,
    columnStyles: { 0: { fontStyle: 'bold' } },
    head: [
      [{ content: 'Resumen Órdenes', colSpan: cols.length + 2, styles: { halign: 'center' } }],
      ['Datos', ...cols.map(b => `${TIPO[b]} (${mon})`), `Totales (${mon})`],
    ],
    body: [
      ['Órdenes', ...cols.map(b => String(col(b).ordenes)), String(tot.ordenes)],
      ['Ventas', ...cols.map(b => num(col(b).ventas)), num(tot.ventas)],
      ['Beneficio Negocio', ...cols.map(b => num(col(b).beneficio)), num(tot.beneficio)],
      ['Comisión', ...cols.map(b => num(col(b).comision)), num(tot.comision)],
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
    head: [['Fecha', 'Tipo de pedido', 'Número de orden', `Importe Total (${mon})`, 'Beneficio Negocio', 'Comisión']],
    body: lineas.length > 0
      // Tipo de pedido = dispatcher.payment_type real (no la categoría).
      ? lineas.map(l => [formatDate(l.fecha), sinMandao(l.paymentType) || TIPO[l.bucket], l.orderId, num(l.importe), num(l.beneficio), num(l.comision)])
      : [[{ content: 'No se encontraron órdenes para esta conciliación.', colSpan: 6, styles: { halign: 'center', textColor: GRIS } }]],
    // Pie de cada página: fecha de conciliación, Área y paginado.
    didDrawPage: () => drawPie(doc, rec.fecha, rec.area),
  });

  return doc;
}
