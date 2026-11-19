import { supabase, logAuditEvent } from '../supabase';
import { fetchAllRows } from './fetchAllRows';
import type { EntidadCobros, FilaPlanificacion, Moneda } from './cobrosPagos';

// Planificación de Pagos (2026-11-19): registros generados desde Cobros y
// Pagos (planificaciones_pago + planificacion_items). El estado NO se guarda:
// se calcula del estado actual de sus conciliaciones, que se cambia en el
// histórico de Conciliación:
//   todas Confirmado        -> Pendiente
//   todas Pagado / Cobrado  -> Pagado
//   cualquier otra mezcla   -> En Proceso

export type EstadoPlanificacion = 'Pendiente' | 'En Proceso' | 'Pagado';

export interface ItemPlanificacion {
  id: string;
  conciliacionId: string;
  entidadId: string | null;
  nombre: string;
  area: string;
  consecutivo: string | null;
  periodoInicial: string | null;
  periodoFinal: string | null;
  via: string;
  neto: number;
  datosPago: string[];
  estadoConciliacion: string; // estado actual de la conciliación
}

export interface Planificacion {
  id: string;
  consecutivo: string;
  fecha: string;
  entidad: EntidadCobros;
  via: string;
  moneda: Moneda;
  cantidad: number;
  montoPagar: number;
  montoCobrar: number;
  neto: number;
  areas: string[];
  notas: string;
  responsable: string;
  items: ItemPlanificacion[];
  estado: EstadoPlanificacion;
}

const n = (v: unknown) => Number(v) || 0;
const CERRADOS = new Set(['Pagado', 'Cobrado']);

export function estadoDe(items: { estadoConciliacion: string }[]): EstadoPlanificacion {
  if (items.length === 0) return 'Pendiente';
  if (items.every(i => CERRADOS.has(i.estadoConciliacion))) return 'Pagado';
  if (items.every(i => i.estadoConciliacion === 'Confirmado')) return 'Pendiente';
  return 'En Proceso';
}

// Estado actual de las conciliaciones (en lotes, para no exceder la URL).
async function estadosConciliacion(tabla: 'conciliaciones_businesses' | 'conciliaciones_messengers', ids: string[]) {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from(tabla).select('conciliacion_id, estado').in('conciliacion_id', ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    (data || []).forEach((r: any) => out.set(r.conciliacion_id, r.estado));
  }
  return out;
}

export async function loadPlanificaciones(): Promise<Planificacion[]> {
  const cabs = await fetchAllRows<any>((from, to) => supabase
    .from('planificaciones_pago')
    .select('*')
    .order('fecha', { ascending: false })
    .order('consecutivo', { ascending: false })
    .range(from, to));
  const items = await fetchAllRows<any>((from, to) => supabase
    .from('planificacion_items')
    .select('*')
    .order('item_id')
    .range(from, to));

  const idsNeg = items.filter(i => i.entidad === 'negocios').map(i => i.conciliacion_id);
  const idsMen = items.filter(i => i.entidad === 'mensajeros').map(i => i.conciliacion_id);
  const [estNeg, estMen] = await Promise.all([
    estadosConciliacion('conciliaciones_businesses', idsNeg),
    estadosConciliacion('conciliaciones_messengers', idsMen),
  ]);

  const porPlan = new Map<string, ItemPlanificacion[]>();
  items.forEach(i => {
    const est = (i.entidad === 'negocios' ? estNeg : estMen).get(i.conciliacion_id) || 'Eliminada';
    const item: ItemPlanificacion = {
      id: i.item_id, conciliacionId: i.conciliacion_id, entidadId: i.entidad_id, nombre: i.nombre, area: i.area || '',
      consecutivo: i.consecutivo, periodoInicial: i.periodo_inicial, periodoFinal: i.periodo_final, via: i.riel || '',
      neto: n(i.neto), datosPago: (i.datos_pago || '').split('\n').filter(Boolean), estadoConciliacion: est,
    };
    const l = porPlan.get(i.planificacion_id) || [];
    l.push(item);
    porPlan.set(i.planificacion_id, l);
  });

  return cabs.map(c => {
    const its = (porPlan.get(c.planificacion_id) || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
    return {
      id: c.planificacion_id, consecutivo: c.consecutivo || '', fecha: c.fecha, entidad: c.entidad, via: c.via_pago,
      moneda: c.moneda === 'USD' ? 'USD' : 'CUP', cantidad: c.cantidad, montoPagar: n(c.monto_pagar), montoCobrar: n(c.monto_cobrar),
      neto: n(c.neto), areas: c.areas || [], notas: c.notas || '', responsable: c.responsable || '', items: its, estado: estadoDe(its),
    } as Planificacion;
  });
}

// Totales de la cabecera a partir de sus ítems (al quitar uno).
function totalesItems(items: { entidadId: string | null; nombre: string; neto: number; area: string }[]) {
  const pagar = items.filter(i => i.neto > 0).reduce((s, i) => s + i.neto, 0);
  const cobrar = items.filter(i => i.neto < 0).reduce((s, i) => s - i.neto, 0);
  return {
    cantidad: new Set(items.map(i => i.entidadId || i.nombre)).size,
    monto_pagar: Number(pagar.toFixed(2)),
    monto_cobrar: Number(cobrar.toFixed(2)),
    neto: Number((pagar - cobrar).toFixed(2)),
    areas: Array.from(new Set(items.map(i => i.area).filter(Boolean))).sort(),
  };
}

export async function actualizarPlanificacion(p: Planificacion, cambios: { fecha: string; notas: string }) {
  const { error } = await supabase.from('planificaciones_pago')
    .update({ fecha: cambios.fecha, notas: cambios.notas.trim() || null, updated_at: new Date().toISOString() })
    .eq('planificacion_id', p.id);
  if (error) throw new Error(error.message);
  const c: Record<string, { antes: unknown; despues: unknown }> = {};
  if (p.fecha !== cambios.fecha) c['Fecha'] = { antes: p.fecha, despues: cambios.fecha };
  if (p.notas !== cambios.notas.trim()) c['Notas'] = { antes: p.notas || '—', despues: cambios.notas.trim() || '—' };
  await logAuditEvent('Planificacion_Pagos', 'Planificación de Pagos Actualizada', { consecutivo: p.consecutivo, cambios: c });
}

// Quita una cuenta de la planificación: vuelve a quedar disponible en Cobros y Pagos.
export async function quitarItem(p: Planificacion, item: ItemPlanificacion) {
  const { error } = await supabase.from('planificacion_items').delete().eq('item_id', item.id);
  if (error) throw new Error(error.message);
  const restantes = p.items.filter(i => i.id !== item.id);
  const { error: e2 } = await supabase.from('planificaciones_pago')
    .update({ ...totalesItems(restantes), updated_at: new Date().toISOString() })
    .eq('planificacion_id', p.id);
  if (e2) throw new Error(e2.message);
  await logAuditEvent('Planificacion_Pagos', 'Cuenta Quitada de la Planificación', {
    consecutivo: p.consecutivo, nombre: item.nombre, cuenta: item.consecutivo, importe: item.neto,
  });
}

export async function eliminarPlanificacion(p: Planificacion) {
  const { error } = await supabase.from('planificaciones_pago').delete().eq('planificacion_id', p.id);
  if (error) throw new Error(error.message);
  await logAuditEvent('Planificacion_Pagos', 'Planificación de Pagos Eliminada', {
    consecutivo: p.consecutivo, datos: { 'Actor': p.entidad === 'negocios' ? 'Negocios' : 'Mensajeros', 'Vía de pago': p.via, 'Moneda': p.moneda, 'Cuentas': p.items.length, 'Neto': p.neto },
  });
}

// Filas para el PDF / Excel de la caja: una por negocio/mensajero y vía.
export function filasDePlanificacion(p: Planificacion): FilaPlanificacion[] {
  const map = new Map<string, FilaPlanificacion>();
  p.items.forEach(i => {
    const key = `${i.entidadId || i.nombre}|${i.via}`;
    const f = map.get(key) || { nombre: i.nombre, via: i.via || p.via, moneda: p.moneda, neto: 0, datosPago: i.datosPago, conceptos: [] };
    f.neto += i.neto;
    f.conceptos.push({ consecutivo: i.consecutivo, neto: i.neto });
    map.set(key, f);
  });
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Listado de planificaciones (Excel / PDF de la vista).
export async function exportarListado(formato: 'excel' | 'pdf', lista: Planificacion[]) {
  const filas = lista.map(p => ({
    'Consecutivo': p.consecutivo,
    'Fecha': p.fecha,
    'Actor': p.entidad === 'negocios' ? 'Negocios' : 'Mensajeros',
    'Cantidad': p.cantidad,
    'Vía de pago': p.via,
    'A pagar': Number(p.montoPagar.toFixed(2)),
    'A cobrar': Number(p.montoCobrar.toFixed(2)),
    'Neto': Number(p.neto.toFixed(2)),
    'Moneda': p.moneda,
    'Área': p.areas.join(', '),
    'Estado': p.estado,
    'Responsable': p.responsable,
  }));
  const hoy = new Date().toISOString().slice(0, 10);
  if (formato === 'excel') {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    // Una hoja por moneda: no se mezclan importes de monedas distintas.
    (['CUP', 'USD'] as Moneda[]).forEach(m => {
      const fs = filas.filter(f => f.Moneda === m);
      if (fs.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fs), `Planificaciones ${m}`);
    });
    if (wb.SheetNames.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), 'Planificaciones');
    XLSX.writeFile(wb, `Planificaciones de Pagos ${hoy}.xlsx`);
    return;
  }
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'Planificaciones de Pagos' });
  doc.viewerPreferences({ DisplayDocTitle: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Planificaciones de Pagos', 12, 16);
  let y = 24;
  const fmt = (v: number) => new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  (['CUP', 'USD'] as Moneda[]).forEach(m => {
    const fs = lista.filter(p => p.moneda === m);
    if (fs.length === 0) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Moneda ${m}`, 12, y);
    autoTable(doc, {
      startY: y + 3,
      margin: { left: 12, right: 12 },
      head: [['Consecutivo', 'Fecha', 'Actor', 'Cant.', 'Vía de pago', 'A pagar', 'A cobrar', 'Neto', 'Moneda', 'Estado']],
      body: fs.map(p => [p.consecutivo, p.fecha, p.entidad === 'negocios' ? 'Negocios' : 'Mensajeros', String(p.cantidad), p.via, fmt(p.montoPagar), fmt(p.montoCobrar), fmt(p.neto), p.moneda, p.estado]),
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: [23, 23, 23], lineWidth: 0.1 },
      headStyles: { fillColor: [255, 191, 0], textColor: [23, 23, 23], fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right', fontStyle: 'bold' } },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  });
  doc.save(`Planificaciones de Pagos ${hoy}.pdf`);
}
