import { supabase } from '../supabase';
import { formatDate } from '../formatters';
import { fetchAllRows } from './fetchAllRows';
import { mapPaymentTypeToBucket, normalizeEntityName, type PaymentBucket } from './paymentBuckets';
import {
  BUCKETS, TIPO, sinMandao, num, NEGRO, GRIS, PDF_MARGEN as M, BORDES as bordes, CABECERA as cabecera,
  drawEncabezado, drawPie, repartir, resumenPorBucket,
} from './pdfComun';

// PDF "Reporte de conciliación" de Mensajeros: mismo diseño que el de
// Negocios (pdfConciliacionNegocio.ts), sobre el Delivery Charge de cada
// orden y todo en CUP, con logo. Agrega la liquidación propia del
// mensajero: Disponibilidades (netas del % de descuento) y Alquiler de
// Mochila, tal como quedaron registrados en la conciliación.

export interface PdfMensajeroRecord {
  id: string;
  mensajero: string;
  areaId: string | null;
  area: string;
  fechaInicial: string;
  fechaFinal: string;
  fecha: string;
  viaPago: string;
  tipoMochila: string;
  ordenesEfectivo: number;
  ordenesTransfermovil: number;
  ordenesSaldoMandao: number;
  ordenesTarjeta: number;
  cxcCU: number;
  cxpTM: number;
  cxpSM: number;
  cxpUS: number;
  disponibilidades: number;
  alquilerMochila: number;
  totalPorCobrar: number;
  totalPorPagar: number;
  comisionPct: number | null;  // guardado al conciliar (migración 2026-10-15)
}

export interface OrdenMensajeroPdf {
  fecha: string;
  orderId: string;
  bucket: PaymentBucket;
  paymentType: string;
  montoCup: number;       // delivery_charge
}

const bucketCount = (rec: PdfMensajeroRecord, b: PaymentBucket) =>
  ({ efectivo: rec.ordenesEfectivo, transfermovil: rec.ordenesTransfermovil, saldomandao: rec.ordenesSaldoMandao, tarjeta: rec.ordenesTarjeta })[b] || 0;

// Órdenes de cada conciliación (mismo mensajero, Área y rango), una sola
// consulta por Área + rango aunque sean muchos mensajeros.
export async function loadOrdenesMensajero(records: PdfMensajeroRecord[]): Promise<Map<string, OrdenMensajeroPdf[]>> {
  const result = new Map<string, OrdenMensajeroPdf[]>();
  const grupos = new Map<string, PdfMensajeroRecord[]>();
  records.forEach(r => {
    const k = `${r.areaId || ''}|${r.fechaInicial}|${r.fechaFinal}`;
    grupos.set(k, [...(grupos.get(k) || []), r]);
  });

  for (const recs of grupos.values()) {
    const { areaId, fechaInicial, fechaFinal } = recs[0];
    const rows = await fetchAllRows<any>((from, to) => {
      let q = supabase.from('dispatcher')
        .select('order_pk, order_id, delivery_date, driver, payment_type, delivery_charge')
        .gte('delivery_date', fechaInicial)
        .lte('delivery_date', fechaFinal);
      if (areaId) q = q.eq('area_id', areaId);
      return q.order('order_pk').range(from, to);
    });
    recs.forEach(rec => {
      const nombre = normalizeEntityName(rec.mensajero);
      const ordenes: OrdenMensajeroPdf[] = [];
      rows.forEach((r: any) => {
        if (normalizeEntityName(r.driver) !== nombre) return;
        const bucket = mapPaymentTypeToBucket(r.payment_type || '');
        if (!bucket || bucketCount(rec, bucket) === 0) return;
        ordenes.push({ fecha: r.delivery_date, orderId: String(r.order_id || ''), bucket, paymentType: String(r.payment_type || ''), montoCup: Number(r.delivery_charge) || 0 });
      });
      ordenes.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orderId.localeCompare(b.orderId));
      result.set(rec.id, ordenes);
    });
  }
  return result;
}

export async function buildPdfMensajero(
  rec: PdfMensajeroRecord,
  ordenes: OrdenMensajeroPdf[],
  defaults: { comisionPct: number }
) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const pct = (rec.comisionPct ?? defaults.comisionPct) / 100;
  const lineas = repartir(ordenes, pct);
  const { res, tot } = resumenPorBucket(lineas);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await drawEncabezado(doc, true);

  const tabla = { margin: { left: M, right: M }, theme: 'grid' as const, styles: { fontSize: 8.5, halign: 'center' as const, textColor: NEGRO, cellPadding: 1.6, ...bordes }, headStyles: cabecera };

  autoTable(doc, {
    ...tabla,
    startY: 40,
    head: [['Mensajero', 'Fecha Inicio', 'Fecha Fin', 'Vía de pago']],
    body: [[rec.mensajero, formatDate(rec.fechaInicial), formatDate(rec.fechaFinal), `${rec.viaPago} (CUP)`]],
  });

  // Resumen Órdenes: solo los métodos con órdenes en esta conciliación.
  const conOrdenes = BUCKETS.filter(b => bucketCount(rec, b) > 0);
  const cols: PaymentBucket[] = conOrdenes.length > 0 ? conOrdenes : ['efectivo', 'transfermovil'];
  autoTable(doc, {
    ...tabla,
    startY: (doc as any).lastAutoTable.finalY + 6,
    columnStyles: { 0: { fontStyle: 'bold' } },
    head: [
      [{ content: 'Resumen Órdenes', colSpan: cols.length + 2, styles: { halign: 'center' } }],
      ['Datos', ...cols.map(b => `${TIPO[b]} (CUP)`), 'Totales (CUP)'],
    ],
    body: [
      ['Órdenes', ...cols.map(b => String(res[b].ordenes)), String(tot.ordenes)],
      ['Monto Delivery', ...cols.map(b => num(res[b].ventas)), num(tot.ventas)],
      ['Beneficio Mensajero', ...cols.map(b => num(res[b].beneficio)), num(tot.beneficio)],
      ['Comisión', ...cols.map(b => num(res[b].comision)), num(tot.comision)],
    ],
  });

  // Liquidación con los montos registrados en la conciliación. Signos con
  // guion ASCII: la fuente Helvetica del PDF no trae el carácter "−".
  const cxp = rec.cxpTM + rec.cxpSM + rec.cxpUS;
  const neto = rec.totalPorPagar - rec.totalPorCobrar;
  autoTable(doc, {
    ...tabla,
    startY: (doc as any).lastAutoTable.finalY + 6,
    tableWidth: 120,
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' } },
    head: [[{ content: 'Liquidación (CUP)', colSpan: 2, styles: { halign: 'center' } }]],
    body: [
      ['Comisión a cobrar por órdenes en Efectivo', `- ${num(rec.cxcCU)}`],
      ['A pagar por órdenes Transfermóvil, Saldo y Tarjeta', num(cxp)],
      ['Disponibilidades (netas)', `+ ${num(rec.disponibilidades)}`],
      [`Alquiler de Mochila (${rec.tipoMochila})`, `- ${num(rec.alquilerMochila)}`],
      [{ content: Math.abs(neto) < 0.005 ? 'Saldo (no se paga ni se cobra)' : neto > 0 ? 'Total a Pagar al Mensajero' : 'Total a Cobrar al Mensajero', styles: { fontStyle: 'bold' } },
       { content: num(Math.abs(neto)), styles: { fontStyle: 'bold' } }],
    ],
  });

  // Detalle de órdenes.
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    margin: { left: M, right: M, bottom: 16 },
    theme: 'plain',
    styles: { fontSize: 8, textColor: NEGRO, cellPadding: { top: 1.1, bottom: 1.1, left: 1.5, right: 1.5 } },
    headStyles: { ...cabecera, lineWidth: 0.2 },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    head: [['Fecha', 'Tipo de pedido', 'Número de orden', 'Monto Delivery (CUP)', 'Beneficio Mensajero', 'Comisión']],
    body: lineas.length > 0
      // Tipo de pedido = dispatcher.payment_type real (no la categoría).
      ? lineas.map(l => [formatDate(l.fecha), sinMandao(l.paymentType) || TIPO[l.bucket], l.orderId, num(l.importe), num(l.beneficio), num(l.comision)])
      : [[{ content: 'No se encontraron órdenes para esta conciliación.', colSpan: 6, styles: { halign: 'center', textColor: GRIS } }]],
    didDrawPage: () => drawPie(doc, rec.fecha, rec.area),
  });

  return doc;
}
