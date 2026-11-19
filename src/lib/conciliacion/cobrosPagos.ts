import { supabase } from '../supabase';
import { fetchAllRows } from './fetchAllRows';
import { formatCurrency, formatDate, toLocalISODate } from '../formatters';

// Cobros y Pagos (Fase 4 "Nuevos cambios", 2026-11-05; vía de pago y
// planificación 2026-11-19): cuentas pendientes de pagar o cobrar =
// conciliaciones en estado Confirmado (ni Pagadas ni Cobradas), agrupadas por
// negocio/mensajero, moneda y vía de pago. El neto de cada grupo descuenta lo
// Por Cobrar contra lo Por Pagar y dice si hay que pagarle o cobrarle. Los
// grupos seleccionados se registran como una Planificación de Pagos.

export type EntidadCobros = 'negocios' | 'mensajeros';
export type Moneda = 'CUP' | 'USD';

// Vías de pago por actor y moneda (confirmado con el usuario 2026-11-19).
export const VIAS_PAGO: Record<EntidadCobros, Record<Moneda, string[]>> = {
  negocios: {
    CUP: ['Transferencia', 'Efectivo'],
    USD: ['Zelle', 'Tropipay', 'Transferencia Internacional'],
  },
  mensajeros: {
    CUP: ['Efectivo', 'Transferencia'],
    USD: ['Efectivo', 'Transferencia'],
  },
};
export const TODAS_LAS_VIAS = ['Transferencia', 'Efectivo', 'Zelle', 'Tropipay', 'Transferencia Internacional'];
export const SIN_CUENTA_USD = 'Sin cuenta USD';

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
  planificacion: string | null; // consecutivo de la planificación que la incluye
}

export interface DatoPago { label: string; value: string }

interface CuentaUSD { via: string; prioridad: number; dato: DatoPago }

export interface EntidadPago {
  id: string;
  nombre: string;
  viaPago: string;
  correo: string;
  cup: DatoPago[];          // cuentas CUP (Cuenta Fiscal primero)
  cuentasUSD: CuentaUSD[];  // habilitadas, por prioridad
  contacto: DatoPago[];     // CI / teléfono (mensajeros)
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
  planificaciones: string[]; // consecutivos de planificaciones que ya lo incluyen
}

const n = (v: unknown) => Number(v) || 0;
const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const importe = (v: number) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

// Conciliaciones ya incluidas en una planificación (si la tabla aún no existe, ninguna).
async function loadPlanificadas(entidad: EntidadCobros): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data, error } = await supabase
    .from('planificacion_items')
    .select('conciliacion_id, planificaciones_pago(consecutivo)')
    .eq('entidad', entidad);
  if (error) return out;
  (data || []).forEach((r: any) => out.set(r.conciliacion_id, r.planificaciones_pago?.consecutivo || 'Planificación'));
  return out;
}

export async function loadPendientes(entidad: EntidadCobros): Promise<ConciliacionPendiente[]> {
  const planificadas = await loadPlanificadas(entidad);
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
        moneda: r.moneda === 'USD' ? 'USD' : 'CUP', cxc, cxp, neto: cxp - cxc, consecutivo: r.consecutivo || null,
        conciliacion: r.conciliacion, planificacion: planificadas.get(r.conciliacion_id) || null,
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
      moneda: r.moneda === 'USD' ? 'USD' : 'CUP', cxc, cxp, neto: cxp - cxc, consecutivo: r.consecutivo || null,
      conciliacion: r.conciliacion, planificacion: planificadas.get(r.conciliacion_id) || null,
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
        cuenta('Cuenta Fiscal CUP', b.cup_account, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco'], ['sucursal', 'Sucursal']]),
        cuenta('Cuenta Personal', b.personal_account, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco'], ['sucursal', 'Sucursal']]),
        cuenta('Cuenta Cheque', b.check_account, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco']]),
      ].filter((x): x is DatoPago => !!x);
      const usd: CuentaUSD[] = [];
      const z = cuenta('Zelle', b.exterior_zelle, [['titular', 'Titular'], ['cuenta', 'Cuenta']]);
      if (z) usd.push({ via: 'Zelle', prioridad: n(b.exterior_zelle?.prioridad) || 1, dato: z });
      const t = cuenta('Tropipay', b.exterior_tropipay, [['titular', 'Titular'], ['cuenta', 'Cuenta']]);
      if (t) usd.push({ via: 'Tropipay', prioridad: n(b.exterior_tropipay?.prioridad) || 2, dato: t });
      const ti = cuenta('Transferencia Internacional', b.exterior_transfer, [['titular', 'Titular'], ['cuenta', 'Cuenta'], ['banco', 'Banco'], ['swift', 'SWIFT'], ['moneda', 'Moneda']]);
      if (ti) usd.push({ via: 'Transferencia Internacional', prioridad: n(b.exterior_transfer?.prioridad) || 3, dato: ti });
      usd.sort((a, b2) => a.prioridad - b2.prioridad);
      out.set(b.business_id, { id: b.business_id, nombre: b.name, viaPago: b.payment_method || 'N/D', correo: b.email || '', cup, cuentasUSD: usd, contacto: [] });
    });
    return out;
  }
  const { data, error } = await supabase
    .from('messengers')
    .select('messenger_id, name, payment_method, phone, ci, fiscal_card, fiscal_account')
    .in('messenger_id', ids);
  if (error) throw new Error(error.message);
  (data || []).forEach((m: any) => {
    const cup = [
      txt(m.fiscal_card) ? { label: 'Tarjeta Fiscal', value: txt(m.fiscal_card) } : null,
      txt(m.fiscal_account) ? { label: 'Cuenta Fiscal', value: txt(m.fiscal_account) } : null,
    ].filter((x): x is DatoPago => !!x);
    const contacto = [
      txt(m.ci) ? { label: 'CI', value: txt(m.ci) } : null,
      txt(m.phone) ? { label: 'Teléfono', value: txt(m.phone) } : null,
    ].filter((x): x is DatoPago => !!x);
    out.set(m.messenger_id, { id: m.messenger_id, nombre: m.name, viaPago: m.payment_method || 'N/D', correo: '', cup, cuentasUSD: [], contacto });
  });
  return out;
}

// Vía de pago de una conciliación pendiente.
// Negocios: riel Transferencia -> Transferencia (Cuenta Fiscal CUP); riel
// Efectivo -> Efectivo; riel Exterior -> la cuenta USD habilitada de mayor
// prioridad (Zelle / Tropipay / Transferencia Internacional).
// Mensajeros: su vía registrada (Efectivo o Transferencia).
export function viaDe(entidad: EntidadCobros, c: ConciliacionPendiente, ent?: EntidadPago): string {
  const riel = c.riel.toLowerCase();
  if (entidad === 'mensajeros') return riel.includes('efectivo') ? 'Efectivo' : 'Transferencia';
  if (riel.includes('efectivo')) return 'Efectivo';
  if (riel.includes('exterior') || c.moneda === 'USD') return ent?.cuentasUSD[0]?.via || SIN_CUENTA_USD;
  return 'Transferencia';
}

function datosDe(entidad: EntidadCobros, via: string, ent?: EntidadPago): DatoPago[] {
  if (!ent) return [];
  if (via === 'Efectivo') return [{ label: 'Efectivo', value: 'Pago en mano' }, ...ent.contacto];
  if (entidad === 'mensajeros') return [...ent.cup, ...ent.contacto];
  if (via === 'Transferencia') return ent.cup;
  const usd = ent.cuentasUSD.find(c => c.via === via);
  return usd ? [usd.dato] : ent.cuentasUSD.map(c => c.dato);
}

// Un grupo por negocio/mensajero, moneda y vía de pago (CUP y USD no se suman).
export function agrupar(entidad: EntidadCobros, pendientes: ConciliacionPendiente[], entidades: Map<string, EntidadPago>): GrupoCobro[] {
  const map = new Map<string, GrupoCobro>();
  for (const c of pendientes) {
    const ent = c.entidadId ? entidades.get(c.entidadId) : undefined;
    const via = viaDe(entidad, c, ent);
    const key = `${c.entidadId || c.nombre}|${c.moneda}|${via}`;
    let g = map.get(key);
    if (!g) {
      g = {
        key, entidadId: c.entidadId, nombre: ent?.nombre || c.nombre, areas: [], moneda: c.moneda,
        viaPago: via, conciliaciones: [], totalCxC: 0, totalCxP: 0, neto: 0,
        datosPago: datosDe(entidad, via, ent), planificaciones: [],
      };
      map.set(key, g);
    }
    g.conciliaciones.push(c);
    g.totalCxC += c.cxc;
    g.totalCxP += c.cxp;
    g.neto = g.totalCxP - g.totalCxC;
    if (c.area && !g.areas.includes(c.area)) g.areas.push(c.area);
    if (c.planificacion && !g.planificaciones.includes(c.planificacion)) g.planificaciones.push(c.planificacion);
  }
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre) || a.moneda.localeCompare(b.moneda) || a.viaPago.localeCompare(b.viaPago));
}

export const accionDe = (neto: number) => (neto > 0.005 ? 'Pagar' : neto < -0.005 ? 'Cobrar' : 'En cero');

// Totales de un conjunto de grupos, por moneda (nunca se suman monedas distintas).
export function totalesPorMoneda(grupos: { moneda: Moneda; neto: number }[]) {
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

// ---------------------------------------------------------------------------
// Filas de la planificación (exportación): una por negocio/mensajero y vía.
// Sirven tanto para lo seleccionado en Cobros y Pagos como para una
// Planificación de Pagos ya guardada.
// ---------------------------------------------------------------------------
export interface FilaPlanificacion {
  nombre: string;
  via: string;
  moneda: Moneda;
  neto: number;
  datosPago: string[];
  conceptos: { consecutivo: string | null; neto: number }[];
}

export const filaDeGrupo = (g: GrupoCobro): FilaPlanificacion => ({
  nombre: g.nombre,
  via: g.viaPago,
  moneda: g.moneda,
  neto: g.neto,
  datosPago: g.datosPago.map(d => `${d.label}: ${d.value}`),
  conceptos: g.conciliaciones.map(c => ({ consecutivo: c.consecutivo, neto: c.neto })),
});

// "PN260017 31.292,50 / CN260001 26.921,00": cada cuenta con su importe.
export const conceptoDe = (f: FilaPlanificacion) =>
  f.conceptos.map(c => `${c.consecutivo || 'Sin consecutivo'} ${importe(Math.abs(c.neto))}`).join(' / ');

const ETIQUETA: Record<EntidadCobros, string> = { negocios: 'Negocio', mensajeros: 'Mensajero' };
const PLURAL: Record<EntidadCobros, string> = { negocios: 'Negocios', mensajeros: 'Mensajeros' };

// Excel: una hoja por moneda (no se mezclan) con la estructura de la
// planificación, más la hoja "Detalle" (una cuenta por renglón).
export async function exportarExcel(entidad: EntidadCobros, filas: FilaPlanificacion[], titulo?: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  (['CUP', 'USD'] as Moneda[]).forEach(m => {
    const fs = filas.filter(f => f.moneda === m);
    if (fs.length === 0) return;
    const t = totalesPorMoneda(fs);
    const hoja = fs.map(f => ({
      [ETIQUETA[entidad]]: f.nombre,
      'Vía de Pago': f.via,
      'Importe': Number(Math.abs(f.neto).toFixed(2)),
      'Moneda': f.moneda,
      'Acción': accionDe(f.neto),
      'Datos de Pago': f.datosPago.join(' | ') || 'Sin datos registrados',
      'Concepto': conceptoDe(f),
    }));
    hoja.push({} as any);
    hoja.push({ [ETIQUETA[entidad]]: `Total a pagar (${m})`, 'Importe': Number(t[m].pagar.toFixed(2)), 'Moneda': m } as any);
    hoja.push({ [ETIQUETA[entidad]]: `Total a cobrar (${m})`, 'Importe': Number(t[m].cobrar.toFixed(2)), 'Moneda': m } as any);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja), `Planificación ${m}`);
  });
  const detalle = filas.flatMap(f => f.conceptos.map(c => ({
    [ETIQUETA[entidad]]: f.nombre,
    'Consecutivo': c.consecutivo || '',
    'Vía de Pago': f.via,
    'Importe': Number(Math.abs(c.neto).toFixed(2)),
    'Moneda': f.moneda,
    'Acción': accionDe(c.neto),
  })));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle');
  XLSX.writeFile(wb, `${titulo || `Planificacion ${PLURAL[entidad]}`} ${toLocalISODate()}.xlsx`);
}

// PDF "Planificación de pagos" para la caja. Regla: nunca se mezclan monedas
// (2026-11-19): una sección por moneda, cada una con sus propios totales.
export async function exportarPdf(entidad: EntidadCobros, filas: FilaPlanificacion[], responsable: string, opciones: { titulo?: string; subtitulo?: string } = {}) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const M = 12;
  const titulo = opciones.titulo || `Planificación de pagos y cobros — ${PLURAL[entidad]}`;
  doc.setProperties({ title: titulo });
  doc.viewerPreferences({ DisplayDocTitle: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(titulo, M, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(opciones.subtitulo || `Generado el ${formatDate(toLocalISODate())} por ${responsable}`, M, 22);

  let y = 28;
  (['CUP', 'USD'] as Moneda[]).forEach(m => {
    const fs = filas.filter(f => f.moneda === m);
    if (fs.length === 0) return;
    const t = totalesPorMoneda(fs);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Moneda ${m} · ${fs.length} ${fs.length === 1 ? ETIQUETA[entidad].toLowerCase() : PLURAL[entidad].toLowerCase()}`, M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Total a pagar: ${formatCurrency(t[m].pagar, m)}    Total a cobrar: ${formatCurrency(t[m].cobrar, m)}`, M, y + 5);
    autoTable(doc, {
      startY: y + 8,
      margin: { left: M, right: M },
      head: [[ETIQUETA[entidad], 'Vía de Pago', 'Importe', 'Moneda', 'Acción', 'Datos de Pago', 'Concepto']],
      body: fs.map(f => [
        f.nombre, f.via, importe(Math.abs(f.neto)), f.moneda, accionDe(f.neto),
        f.datosPago.join('\n') || 'Sin datos registrados',
        conceptoDe(f),
      ]),
      styles: { fontSize: 8, cellPadding: 1.8, valign: 'top', lineColor: [23, 23, 23], lineWidth: 0.1 },
      headStyles: { fillColor: [255, 191, 0], textColor: [23, 23, 23], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' }, 5: { cellWidth: 75 }, 6: { cellWidth: 70 } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 16; }
  });
  doc.save(`${titulo.replace(/[\\/:*?"<>|]+/g, '-')} ${toLocalISODate()}.pdf`);
}

// ---------------------------------------------------------------------------
// Generar Planificación: registra los grupos seleccionados (una sola moneda y
// una sola vía) en planificaciones_pago + planificacion_items.
// ---------------------------------------------------------------------------
export async function generarPlanificacion(params: {
  entidad: EntidadCobros;
  grupos: GrupoCobro[];
  filtros: Record<string, string>;
  responsable: string;
  responsableId: string | null;
}): Promise<string> {
  const { entidad, grupos } = params;
  const monedas = new Set(grupos.map(g => g.moneda));
  const vias = new Set(grupos.map(g => g.viaPago));
  if (grupos.length === 0) throw new Error('Seleccione al menos un registro.');
  if (monedas.size > 1) throw new Error('No se pueden mezclar monedas en una planificación: seleccione solo CUP o solo USD.');
  if (vias.size > 1) throw new Error('Una planificación es de una sola vía de pago: filtre o seleccione registros con la misma vía.');
  if (grupos.some(g => g.planificaciones.length > 0)) throw new Error('Hay registros que ya están en otra planificación.');
  const moneda = grupos[0].moneda;
  const t = totalesPorMoneda(grupos)[moneda];
  const areas = Array.from(new Set(grupos.flatMap(g => g.areas))).sort();

  const { data: cab, error } = await supabase.from('planificaciones_pago').insert({
    entidad,
    via_pago: grupos[0].viaPago,
    moneda,
    cantidad: new Set(grupos.map(g => g.entidadId || g.nombre)).size,
    monto_pagar: Number(t.pagar.toFixed(2)),
    monto_cobrar: Number(t.cobrar.toFixed(2)),
    neto: Number((t.pagar - t.cobrar).toFixed(2)),
    areas,
    filtros: params.filtros,
    responsable: params.responsable,
    responsable_id: params.responsableId,
  }).select('planificacion_id, consecutivo').single();
  if (error) {
    throw new Error(/planificaciones_pago/.test(error.message)
      ? 'Falta correr en Supabase la migración 2026-11-19b_planificacion_pagos.sql.'
      : error.message);
  }

  const items = grupos.flatMap(g => g.conciliaciones.map(c => ({
    planificacion_id: cab.planificacion_id,
    entidad,
    conciliacion_id: c.id,
    entidad_id: c.entidadId,
    nombre: g.nombre,
    area: c.area,
    consecutivo: c.consecutivo,
    periodo_inicial: c.fechaInicial,
    periodo_final: c.fechaFinal,
    riel: g.viaPago,
    neto: Number(c.neto.toFixed(2)),
    datos_pago: g.datosPago.map(d => `${d.label}: ${d.value}`).join('\n'),
  })));
  const { error: e2 } = await supabase.from('planificacion_items').insert(items);
  if (e2) {
    // Sin ítems la planificación no sirve: se deshace la cabecera.
    await supabase.from('planificaciones_pago').delete().eq('planificacion_id', cab.planificacion_id);
    throw new Error(e2.code === '23505' ? 'Alguna de las cuentas ya fue incluida en otra planificación. Actualice la página.' : e2.message);
  }
  return cab.consecutivo || '';
}
