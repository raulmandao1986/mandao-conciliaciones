import { supabase } from '../supabase';
import { fetchAllRows } from './fetchAllRows';
import { formatCurrency, formatDate, toLocalISODate } from '../formatters';

// Cobros y Pagos (Fase 4 "Nuevos cambios", 2026-11-05): cuentas pendientes de
// pagar o cobrar = conciliaciones en estado Confirmado (ni Pagadas ni
// Cobradas), agrupadas por negocio/mensajero y moneda. El neto de cada grupo
// descuenta lo Por Cobrar contra lo Por Pagar y dice si hay que pagarle o
// cobrarle. Sirve para armar la planificación de pagos de la caja.

export type EntidadCobros = 'negocios' | 'mensajeros';
export type Moneda = 'CUP' | 'USD';

export interface ConciliacionPendiente {
  id: string;
  entidadId: string | null;
  nombre: string;
  areaId: string | null;
  area: string;
  fecha: string;
  fechaInicial: string;
  fechaFinal: string;
  riel: string;
  moneda: Moneda;
  cxc: number; // Por Cobrar
  cxp: number; // Por Pagar
  neto: number; // cxp − cxc: positivo = pagar, negativo = cobrar
  consecutivo: string | null;
  conciliacion: string;
}

export interface DatoPago { label: string; value: string }

export interface EntidadPago {
  id: string;
  nombre: string;
  viaPago: string;
  correo: string;
  datos: Record<Moneda, DatoPago[]>;
}

export interface GrupoCobro {
  key: string;
  entidadId: string | null;
  nombre: string;
  areas: string[];
  moneda: Moneda;
  viaPago: string;
  conciliaciones: ConciliacionPendiente[];
  totalCxC: number;
  totalCxP: number;
  neto: number;
  datosPago: DatoPago[];
}

const n = (v: unknown) => Number(v) || 0;
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

export async function loadPendientes(entidad: EntidadCobros): Promise<ConciliacionPendiente[]> {
  if (entidad === 'negocios') {
    const rows = await fetchAllRows<any>((from, to) => supabase
      .from('conciliaciones_businesses')
      .select('conciliacion_id, business_id, establecimiento, area_id, area, fecha, fecha_inicial, fecha_final, via_pago, moneda, cxc_cu, cxp_tm, cxp_sm, cxp_us, consecutivo, conciliacion')
      .eq('estado', 'Confirmado')
      .order('conciliacion_id')
      .range(from, to));
    return rows.map(r => {
      const cxc = n(r.cxc_cu);
      const cxp = n(r.cxp_tm) + n(r.cxp_sm) + n(r.cxp_us);
      return {
        id: r.conciliacion_id, entidadId: r.business_id, nombre: r.establecimiento, areaId: r.area_id, area: r.area,
        fecha: r.fecha, fechaInicial: r.fecha_inicial, fechaFinal: r.fecha_final, riel: r.via_pago || 'N/D',
        moneda: r.moneda === 'USD' ? 'USD' : 'CUP', cxc, cxp, neto: cxp - cxc, consecutivo: r.consecutivo || null, conciliacion: r.conciliacion,
      };
    });
  }
  const rows = await fetchAllRows<any>((from, to) => supabase
    .from('conciliaciones_messengers')
    .select('conciliacion_id, messenger_id, mensajero, area_id, area, fecha, fecha_inicial, fecha_final, via_pago, moneda, total_por_cobrar, total_por_pagar, consecutivo, conciliacion')
    .eq('estado', 'Confirmado')
    .order('conciliacion_id')
    .range(from, to));
  return rows.map(r => {
    const cxc = n(r.total_por_cobrar);
    const cxp = n(r.total_por_pagar);
    return {
      id: r.conciliacion_id, entidadId: r.messenger_id, nombre: r.mensajero, areaId: r.area_id, area: r.area,
      fecha: r.fecha, fechaInicial: r.fecha_inicial, fechaFinal: r.fecha_final, riel: r.via_pago || 'N/D',
      moneda: r.moneda === 'USD' ? 'USD' : 'CUP', cxc, cxp, neto: cxp - cxc, consecutivo: r.consecutivo || null, conciliacion: r.conciliacion,
    };
  });
}

// Cuenta bancaria (jsonb de Gestión de Negocios) como una línea legible.
function cuenta(nombre: string, c: any, campos: [string, string][]): DatoPago | null {
  if (!c || typeof c !== 'object') return null;
  if (c.enabled === false) return null;
  const partes = campos.map(([k, label]) => (txt(c[k]) ? `${label}: ${txt(c[k])}` : '')).filter(Boolean);
  return partes.length > 0 && txt(c.cuenta) ? { label: nombre, value: partes.join(' · ') } : null;
}

export async function loadEntidadesPago(entidad: EntidadCobros, ids: string[]): Promise<Map<string, EntidadPago>> {
  const out = new Map<string, EntidadPago>();
  if (ids.length === 0) return out;
  if (entidad === 'negocios') {
    const { data, error } = await supabase
      .from('businesses')
      .select('business_id, name, payment_method, email, cup_account, personal_account, check_account, exterior_zelle, exterior_tropipay, exterior_transfer')
      .in('business_id', ids);
    if (error) throw new Error(error.message);
    (data || []).forEach((b: any) => {
      const cup = [
        cuenta('Cuenta CUP', b.cup_account, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco'], ['sucursal', 'Sucursal']]),
        cuenta('Cuenta Personal', b.personal_account, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco'], ['sucursal', 'Sucursal']]),
        cuenta('Cuenta Cheque', b.check_account, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco']]),
      ].filter((x): x is DatoPago => !!x);
      const usd = [
        cuenta('Zelle', b.exterior_zelle, [['titular', 'Titular'], ['cuenta', 'Cuenta']]),
        cuenta('Tropipay', b.exterior_tropipay, [['titular', 'Titular'], ['cuenta', 'Cuenta']]),
        cuenta('Transferencia Internacional', b.exterior_transfer, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco'], ['swift', 'SWIFT'], ['moneda', 'Moneda']]),
      ].filter((x): x is DatoPago => !!x);
      out.set(b.business_id, { id: b.business_id, nombre: b.name, viaPago: b.payment_method || 'N/D', correo: b.email || '', datos: { CUP: cup, USD: usd } });
    });
    return out;
  }
  const { data, error } = await supabase
    .from('messengers')
    .select('messenger_id, name, payment_method, phone, ci, fiscal_card, fiscal_account')
    .in('messenger_id', ids);
  if (error) throw new Error(error.message);
  (data || []).forEach((m: any) => {
    const datos = [
      txt(m.fiscal_card) ? { label: 'Tarjeta Fiscal', value: txt(m.fiscal_card) } : null,
      txt(m.fiscal_account) ? { label: 'Cuenta Fiscal', value: txt(m.fiscal_account) } : null,
      txt(m.ci) ? { label: 'CI', value: txt(m.ci) } : null,
      txt(m.phone) ? { label: 'Teléfono', value: txt(m.phone) } : null,
    ].filter((x): x is DatoPago => !!x);
    out.set(m.messenger_id, { id: m.messenger_id, nombre: m.name, viaPago: m.payment_method || 'N/D', correo: '', datos: { CUP: datos, USD: datos } });
  });
  return out;
}

// Un grupo por negocio/mensajero y moneda (CUP y USD no se suman).
export function agrupar(pendientes: ConciliacionPendiente[], entidades: Map<string, EntidadPago>): GrupoCobro[] {
  const map = new Map<string, GrupoCobro>();
  for (const c of pendientes) {
    const key = `${c.entidadId || c.nombre}|${c.moneda}`;
    let g = map.get(key);
    if (!g) {
      const ent = c.entidadId ? entidades.get(c.entidadId) : undefined;
      g = {
        key, entidadId: c.entidadId, nombre: ent?.nombre || c.nombre, areas: [], moneda: c.moneda,
        viaPago: ent?.viaPago || c.riel, conciliaciones: [], totalCxC: 0, totalCxP: 0, neto: 0,
        datosPago: ent?.datos[c.moneda] || [],
      };
      map.set(key, g);
    }
    g.conciliaciones.push(c);
    g.totalCxC += c.cxc;
    g.totalCxP += c.cxp;
    g.neto = g.totalCxP - g.totalCxC;
    if (c.area && !g.areas.includes(c.area)) g.areas.push(c.area);
  }
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre) || a.moneda.localeCompare(b.moneda));
}

export const accionDe = (neto: number) => (neto > 0.005 ? 'Pagar' : neto < -0.005 ? 'Cobrar' : 'En cero');

// Totales de un conjunto de grupos, por moneda.
export function totalesPorMoneda(grupos: GrupoCobro[]) {
  const t: Record<Moneda, { pagar: number; cobrar: number; grupos: number }> = {
    CUP: { pagar: 0, cobrar: 0, grupos: 0 },
    USD: { pagar: 0, cobrar: 0, grupos: 0 },
  };
  for (const g of grupos) {
    t[g.moneda].grupos += 1;
    if (g.neto > 0.005) t[g.moneda].pagar += g.neto;
    else if (g.neto < -0.005) t[g.moneda].cobrar += -g.neto;
  }
  return t;
}

const ETIQUETA: Record<EntidadCobros, string> = { negocios: 'Negocio', mensajeros: 'Mensajero' };

// Excel: hoja "Planificación" (un renglón por grupo) y hoja "Detalle" (una
// conciliación por renglón).
export async function exportarExcel(entidad: EntidadCobros, grupos: GrupoCobro[]) {
  const XLSX = await import('xlsx');
  const plan = grupos.map(g => ({
    [ETIQUETA[entidad]]: g.nombre,
    'Área': g.areas.join(', '),
    'Vía de pago': g.viaPago,
    'Moneda': g.moneda,
    'Conciliaciones': g.conciliaciones.length,
    'Por Cobrar': Number(g.totalCxC.toFixed(2)),
    'Por Pagar': Number(g.totalCxP.toFixed(2)),
    'Acción': accionDe(g.neto),
    'Monto': Number(Math.abs(g.neto).toFixed(2)),
    'Datos de pago': g.datosPago.map(d => `${d.label}: ${d.value}`).join(' | ') || 'Sin datos registrados',
  }));
  const detalle = grupos.flatMap(g => g.conciliaciones.map(c => ({
    [ETIQUETA[entidad]]: g.nombre,
    'Consecutivo': c.consecutivo || '',
    'Período': `${formatDate(c.fechaInicial)} - ${formatDate(c.fechaFinal)}`,
    'Riel': c.riel,
    'Moneda': c.moneda,
    'Por Cobrar': Number(c.cxc.toFixed(2)),
    'Por Pagar': Number(c.cxp.toFixed(2)),
    'Neto': Number(c.neto.toFixed(2)),
    'Área': c.area,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plan), 'Planificación');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle');
  XLSX.writeFile(wb, `Cobros y Pagos ${entidad === 'negocios' ? 'Negocios' : 'Mensajeros'} ${toLocalISODate()}.xlsx`);
}

// PDF "Planificación de pagos" para la caja.
export async function exportarPdf(entidad: EntidadCobros, grupos: GrupoCobro[], responsable: string) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const M = 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Planificación de pagos y cobros — ${entidad === 'negocios' ? 'Negocios' : 'Mensajeros'}`, M, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generado el ${formatDate(toLocalISODate())} por ${responsable} · ${grupos.length} ${entidad === 'negocios' ? 'negocio(s)' : 'mensajero(s)'}`, M, 22);

  const t = totalesPorMoneda(grupos);
  const resumen = (['CUP', 'USD'] as Moneda[]).filter(m => t[m].grupos > 0)
    .map(m => `${m}: a pagar ${formatCurrency(t[m].pagar, m)} · a cobrar ${formatCurrency(t[m].cobrar, m)}`).join('     ');
  doc.text(resumen, M, 27);

  autoTable(doc, {
    startY: 31,
    margin: { left: M, right: M },
    head: [[ETIQUETA[entidad], 'Moneda', 'Vía de pago', 'Por Cobrar', 'Por Pagar', 'Acción', 'Monto', 'Datos de pago']],
    body: grupos.map(g => [
      g.nombre, g.moneda, g.viaPago,
      formatCurrency(g.totalCxC, g.moneda), formatCurrency(g.totalCxP, g.moneda),
      accionDe(g.neto), formatCurrency(Math.abs(g.neto), g.moneda),
      g.datosPago.map(d => `${d.label}: ${d.value}`).join('\n') || 'Sin datos registrados',
    ]),
    styles: { fontSize: 8, cellPadding: 1.8, valign: 'top', lineColor: [23, 23, 23], lineWidth: 0.1 },
    headStyles: { fillColor: [255, 191, 0], textColor: [23, 23, 23], fontStyle: 'bold' },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 6: { halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 90 } },
  });
  doc.save(`Planificacion de pagos ${entidad === 'negocios' ? 'Negocios' : 'Mensajeros'} ${toLocalISODate()}.pdf`);
}
