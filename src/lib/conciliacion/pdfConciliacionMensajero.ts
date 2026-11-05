import { formatDate } from '../formatters';
import type { LineaGrupo } from './catalogoPagos';
import {
  sinMandao, num, NEGRO, GRIS, PDF_MARGEN as M, BORDES as bordes, CABECERA as cabecera,
  drawEncabezado, drawPie, repartir, columnasResumen, resumenPorLinea, loadOrdenesConciliacion,
  type OrdenPdf,
} from './pdfComun';

// PDF "Reporte de conciliación" de Mensajeros: mismo diseño que el de
// Negocios (pdfConciliacionNegocio.ts), sobre el Delivery Charge de cada
// orden y todo en CUP, con logo. Agrega la liquidación propia del
// mensajero: Disponibilidades (netas del % de descuento) y Alquiler de
// Mochila, tal como quedaron registrados en la conciliación. Columnas del
// Resumen = Grupos de pago del desglose guardado (2026-10-27).

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
  cxcCU: number;
  cxpTM: number;
  cxpSM: number;
  cxpUS: number;
  disponibilidades: number;
  alquilerMochila: number;
  totalPorCobrar: number;
  totalPorPagar: number;
  comisionPct: number | null;  // guardado al conciliar (migración 2026-10-15)
  desglose: LineaGrupo[];      // desglose por grupo (migración 2026-10-27)
}

export type OrdenMensajeroPdf = OrdenPdf;

export function loadOrdenesMensajero(records: PdfMensajeroRecord[]): Promise<Map<string, OrdenPdf[]>> {
  return loadOrdenesConciliacion(records, { campoEntidad: 'driver', campoMonto: 'delivery_charge', nombre: r => r.mensajero });
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
  const cols = columnasResumen(rec.desglose);
  const { res, tot } = resumenPorLinea(lineas, cols.map(c => c.key));

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await drawEncabezado(doc, true);

  const tabla = { margin: { left: M, right: M }, theme: 'grid' as const, styles: { fontSize: 8.5, halign: 'center' as const, textColor: NEGRO, cellPadding: 1.6, ...bordes }, headStyles: cabecera };

  autoTable(doc, {
    ...tabla,
    startY: 40,
    head: [['Mensajero', 'Fecha Inicio', 'Fecha Fin', 'Vía de pago']],
    body: [[rec.mensajero, formatDate(rec.fechaInicial), formatDate(rec.fechaFinal), `${rec.viaPago} (CUP)`]],
  });

  // Resumen Órdenes: los Grupos de pago de esta conciliación.
  autoTable(doc, {
    ...tabla,
    startY: (doc as any).lastAutoTable.finalY + 6,
    columnStyles: { 0: { fontStyle: 'bold' } },
    head: [
      [{ content: 'Resumen Órdenes', colSpan: cols.length + 2, styles: { halign: 'center' } }],
      ['Datos', ...cols.map(c => `${c.titulo} (CUP)`), 'Totales (CUP)'],
    ],
    body: [
      ['Órdenes', ...cols.map(c => String(res[c.key].ordenes)), String(tot.ordenes)],
      ['Monto Delivery', ...cols.map(c => num(res[c.key].ventas)), num(tot.ventas)],
      ['Beneficio Mensajero', ...cols.map(c => num(res[c.key].beneficio)), num(tot.beneficio)],
      ['Comisión', ...cols.map(c => num(res[c.key].comision)), num(tot.comision)],
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
      ['Comisión a cobrar (órdenes Por Cobrar)', `- ${num(rec.cxcCU)}`],
      ['A pagar (órdenes Por Pagar)', num(cxp)],
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
      ? lineas.map(l => [formatDate(l.fecha), sinMandao(l.paymentType), l.orderId, num(l.importe), num(l.beneficio), num(l.comision)])
      : [[{ content: 'No se encontraron órdenes para esta conciliación.', colSpan: 6, styles: { halign: 'center', textColor: GRIS } }]],
    didDrawPage: () => drawPie(doc, rec.fecha, rec.area),
  });

  return doc;
}
