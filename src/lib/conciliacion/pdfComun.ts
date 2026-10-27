import { formatDate } from '../formatters';
import type { PaymentBucket } from './paymentBuckets';
import logoUrl from '../../assets/brand/mandao-logo.jpg';

// Piezas compartidas por los PDF "Reporte de conciliación" de Negocios y de
// Mensajeros (mismo diseño, entregado por el usuario 2026-10-15).

export const BUCKETS: PaymentBucket[] = ['efectivo', 'transfermovil', 'saldomandao', 'tarjeta'];

// Etiquetas sin la palabra "Mandao" (pedido del usuario 2026-10-15).
export const TIPO: Record<PaymentBucket, string> = {
  efectivo: 'Efectivo',
  transfermovil: 'Transfermóvil',
  saldomandao: 'Saldo',
  tarjeta: 'Tarjeta',
};
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

// Detalle por orden: Mandao se queda con el % (comisión) del importe y el
// negocio/mensajero con el resto — en Efectivo lo cobra Mandao (CxC), en
// los demás métodos lo paga (CxP); el reparto es el mismo.
export interface LineaPdf { fecha: string; orderId: string; bucket: PaymentBucket; paymentType: string; importe: number; beneficio: number; comision: number }

export function repartir<T extends { montoCup: number }>(ordenes: T[], pct: number, factor = 1) {
  return ordenes.map(o => {
    const importe = o.montoCup * factor;
    const comision = importe * pct;
    return { ...o, importe, beneficio: importe - comision, comision };
  });
}

export function resumenPorBucket(lineas: { bucket: PaymentBucket; importe: number; beneficio: number; comision: number }[]) {
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
  return { res, tot };
}
