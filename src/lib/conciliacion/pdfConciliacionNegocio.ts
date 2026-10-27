import { formatDate } from '../formatters';
import type { LineaGrupo } from './catalogoPagos';
import {
  sinMandao, num, NEGRO, GRIS, PDF_MARGEN as M, BORDES as bordes, CABECERA as cabecera,
  drawEncabezado, drawPie, repartir, columnasResumen, resumenPorLinea, loadOrdenesConciliacion,
  type OrdenPdf,
} from './pdfComun';

// PDF "Reporte de conciliación" de Negocios (diseño entregado por el
// usuario 2026-10-15): encabezado, Resumen Órdenes por Grupo de pago y el
// detalle de cada orden. Uno por fila de conciliación: un negocio con vía
// Transferencia-Exterior genera dos (CUP y USD). El de USD (Exterior) va
// SIN logo de la empresa; el de CUP lo lleva. Las columnas del Resumen son
// las líneas del desglose guardado en la conciliación (2026-10-27).

export type { OrdenPdf } from './pdfComun';

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
  cxcCU: number;
  cxpTM: number;
  cxpSM: number;
  cxpUS: number;
  comisionPct: number | null;  // guardados al conciliar (migración 2026-10-15)
  tasaCambio: number | null;
  desglose: LineaGrupo[];      // desglose por grupo (migración 2026-10-27)
}

export function loadOrdenesNegocio(records: PdfNegocioRecord[]): Promise<Map<string, OrdenPdf[]>> {
  return loadOrdenesConciliacion(records, { campoEntidad: 'store', campoMonto: 'product_amount', nombre: r => r.establecimiento });
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
  // Columnas = grupos de esta conciliación (PDF en USD de un negocio
  // Exterior: los grupos de métodos en USD; PDF en CUP: los demás).
  const cols = columnasResumen(rec.desglose);
  const { res, tot } = resumenPorLinea(lineas, cols.map(c => c.key));

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

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 8.5, halign: 'center', textColor: NEGRO, cellPadding: 1.6, ...bordes },
    headStyles: cabecera,
    columnStyles: { 0: { fontStyle: 'bold' } },
    head: [
      [{ content: 'Resumen Órdenes', colSpan: cols.length + 2, styles: { halign: 'center' } }],
      ['Datos', ...cols.map(c => `${c.titulo} (${mon})`), `Totales (${mon})`],
    ],
    body: [
      ['Órdenes', ...cols.map(c => String(res[c.key].ordenes)), String(tot.ordenes)],
      ['Ventas', ...cols.map(c => num(res[c.key].ventas)), num(tot.ventas)],
      ['Beneficio Negocio', ...cols.map(c => num(res[c.key].beneficio)), num(tot.beneficio)],
      ['Comisión', ...cols.map(c => num(res[c.key].comision)), num(tot.comision)],
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
      // Tipo de pedido = dispatcher.payment_type real (no el grupo).
      ? lineas.map(l => [formatDate(l.fecha), sinMandao(l.paymentType), l.orderId, num(l.importe), num(l.beneficio), num(l.comision)])
      : [[{ content: 'No se encontraron órdenes para esta conciliación.', colSpan: 6, styles: { halign: 'center', textColor: GRIS } }]],
    // Pie de cada página: fecha de conciliación, Área y paginado.
    didDrawPage: () => drawPie(doc, rec.fecha, rec.area),
  });

  return doc;
}
