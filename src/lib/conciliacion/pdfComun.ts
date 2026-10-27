import { formatDate } from '../formatters';
import { supabase } from '../supabase';
import { fetchAllRows } from './fetchAllRows';
import { normalizeEntityName } from './paymentBuckets';
import {
  loadCatalogoPagos, clasificarPago, grupoDe, claveLinea, TIPOLOGIA_LABEL, type LineaGrupo,
} from './catalogoPagos';
import logoUrl from '../../assets/brand/mandao-logo.jpg';

// Piezas compartidas por los PDF "Reporte de conciliación" de Negocios y de
// Mensajeros (mismo diseño, entregado por el usuario 2026-10-15). Desde el
// 2026-10-27 las columnas son los Grupos de pago del catálogo (Configuración
// -> Tipología de Pago) guardados en el desglose de cada conciliación.

// Etiquetas sin la palabra "Mandao" (pedido del usuario 2026-10-15).
export const sinMandao = (t: string) => t.replace(/\s*\bmandao\b\s*/gi, ' ').replace(/\s+/g, ' ').trim();

export const num = (v: number) =>
  new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export const AMARILLO: [number, number, number] = [255, 191, 0];   // --color-brand
export const NEGRO: [number, number, number] = [23, 23, 23];         // --color-brand-ink
export const GRIS: [number, number, number] = [100, 116, 139];

export const PDF_MARGEN = 14;
export const BORDES = { lineColor: NEGRO, lineWidth: 0.2 };
export const CABECERA = { fillColor: AMARILLO, textColor: NEGRO, fontStyle: 'bold' as const, halign: 'center' as const, ...BORDES };

let logoPromise: Promise<string | null> | null = null;
export function getLogoDataUrl(): Promise<string | null> {
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

// Título "Reporte de conciliación" y, si corresponde, el logo arriba a la derecha.
export async function drawEncabezado(doc: any, conLogo: boolean) {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NEGRO);
  doc.text('Reporte de conciliación', PDF_MARGEN, 26);
  if (conLogo) {
    const logo = await getLogoDataUrl();
    if (logo) doc.addImage(logo, 'JPEG', pageW - PDF_MARGEN - 44, 8, 44, 44 * 154 / 272);
  }
}

// Pie de cada página: fecha de conciliación, Área y número de página.
export function drawPie(doc: any, fechaConciliacion: string, area: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text(`Conciliado el ${formatDate(fechaConciliacion)} · Área: ${area}`, PDF_MARGEN, h - 8);
  doc.text(`Página ${doc.getNumberOfPages()}`, pageW - PDF_MARGEN, h - 8, { align: 'right' });
  doc.setTextColor(...NEGRO);
}

// Una orden del PDF: `key` es la línea del desglose (grupo + tipología +
// moneda del método) a la que pertenece.
export interface OrdenPdf { fecha: string; orderId: string; key: string; paymentType: string; montoCup: number }

// Órdenes de cada conciliación leídas de `dispatcher`: misma entidad (Store
// o Driver), Área y rango, y solo las que caen en una línea del desglose de
// esa conciliación (así la fila "Transferencia" de un negocio Exterior no
// incluye las órdenes en USD). Una consulta por Área + rango.
export async function loadOrdenesConciliacion<R extends { id: string; areaId: string | null; fechaInicial: string; fechaFinal: string; desglose: LineaGrupo[] }>(
  records: R[],
  opts: { campoEntidad: 'store' | 'driver'; campoMonto: 'product_amount' | 'delivery_charge'; nombre: (r: R) => string }
): Promise<Map<string, OrdenPdf[]>> {
  const result = new Map<string, OrdenPdf[]>();
  if (records.length === 0) return result;
  const catalogo = await loadCatalogoPagos();
  const grupos = new Map<string, R[]>();
  records.forEach(r => {
    const k = `${r.areaId || ''}|${r.fechaInicial}|${r.fechaFinal}`;
    grupos.set(k, [...(grupos.get(k) || []), r]);
  });
  for (const recs of grupos.values()) {
    const { areaId, fechaInicial, fechaFinal } = recs[0];
    const rows = await fetchAllRows<any>((from, to) => {
      let q = supabase.from('dispatcher')
        .select(`order_pk, order_id, delivery_date, ${opts.campoEntidad}, payment_type, ${opts.campoMonto}`)
        .gte('delivery_date', fechaInicial)
        .lte('delivery_date', fechaFinal);
      if (areaId) q = q.eq('area_id', areaId);
      return q.order('order_pk').range(from, to);
    });
    recs.forEach(rec => {
      const nombre = normalizeEntityName(opts.nombre(rec));
      const claves = new Set(rec.desglose.map(l => l.key));
      const ordenes: OrdenPdf[] = [];
      rows.forEach((r: any) => {
        if (normalizeEntityName(r[opts.campoEntidad]) !== nombre) return;
        const metodo = clasificarPago(catalogo, r.payment_type || '');
        if (!metodo) return;
        const key = claveLinea(grupoDe(catalogo, metodo).id, metodo.tipologia, metodo.moneda);
        // Sin desglose guardado (conciliación previa a 2026-10-27): todas.
        if (claves.size > 0 && !claves.has(key)) return;
        ordenes.push({ fecha: r.delivery_date, orderId: String(r.order_id || ''), key, paymentType: String(r.payment_type || ''), montoCup: Number(r[opts.campoMonto]) || 0 });
      });
      ordenes.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orderId.localeCompare(b.orderId));
      result.set(rec.id, ordenes);
    });
  }
  return result;
}

// Detalle por orden: Mandao se queda con el % (comisión) del importe y el
// negocio/mensajero con el resto — en lo Por Cobrar (Efectivo) lo cobra
// Mandao (CxC), en lo Por Pagar lo paga (CxP); el reparto es el mismo.
export function repartir<T extends { montoCup: number }>(ordenes: T[], pct: number, factor = 1) {
  return ordenes.map(o => {
    const importe = o.montoCup * factor;
    const comision = importe * pct;
    return { ...o, importe, beneficio: importe - comision, comision };
  });
}

// Columnas del Resumen Órdenes = líneas del desglose de la conciliación.
// Si un grupo tiene líneas Por Cobrar y Por Pagar, se distinguen en el título.
export function columnasResumen(desglose: LineaGrupo[]) {
  const visibles = desglose.filter(l => l.ordenes > 0);
  const repetidos = new Set(visibles.map(l => l.grupoId).filter((g, i, a) => a.indexOf(g) !== i));
  return visibles.map(l => ({
    key: l.key,
    titulo: sinMandao(repetidos.has(l.grupoId) ? `${l.grupo} ${TIPOLOGIA_LABEL[l.tipologia]}` : l.grupo),
  }));
}

export function resumenPorLinea(
  lineas: { key: string; importe: number; beneficio: number; comision: number }[],
  claves: string[]
) {
  const porClave = (k: string) => {
    const ls = lineas.filter(l => l.key === k);
    return {
      ordenes: ls.length,
      ventas: ls.reduce((s, l) => s + l.importe, 0),
      beneficio: ls.reduce((s, l) => s + l.beneficio, 0),
      comision: ls.reduce((s, l) => s + l.comision, 0),
    };
  };
  const res = Object.fromEntries(claves.map(k => [k, porClave(k)])) as Record<string, ReturnType<typeof porClave>>;
  const tot = {
    ordenes: lineas.length,
    ventas: lineas.reduce((s, l) => s + l.importe, 0),
    beneficio: lineas.reduce((s, l) => s + l.beneficio, 0),
    comision: lineas.reduce((s, l) => s + l.comision, 0),
  };
  return { res, tot };
}
