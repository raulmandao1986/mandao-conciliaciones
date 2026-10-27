import { supabase } from '../supabase';
import { normalizeCompact } from './paymentBuckets';

// Motor de clasificación de órdenes a partir del catálogo de Métodos de
// Pago (Configuración -> Métodos de Pago / Tipología de Pago, migración
// 2026-10-27). Sustituye a la tabla fija Cash -> Efectivo, Card -> Tarjeta…
// que había en paymentBuckets.ts: cada método trae su Tipología (Por
// Cobrar / Por Pagar), su Moneda (CUP / USD) y su Grupo, y la conciliación
// y los PDF agrupan por esos datos.

export type Tipologia = 'cobrar' | 'pagar';
export type Moneda = 'CUP' | 'USD';

export const TIPOLOGIA_LABEL: Record<Tipologia, string> = { cobrar: 'Por Cobrar', pagar: 'Por Pagar' };

export interface GrupoPago { id: string; nombre: string; orden: number; activo: boolean }
export interface MetodoPagoCatalogo { id: string; nombre: string; tipologia: Tipologia; moneda: Moneda; grupoId: string | null }

export interface CatalogoPagos {
  metodos: Map<string, MetodoPagoCatalogo>; // por nombre normalizado
  grupos: Map<string, GrupoPago>;
}

export const SIN_GRUPO: GrupoPago = { id: 'sin-grupo', nombre: 'Sin grupo', orden: 999, activo: true };

export async function loadCatalogoPagos(): Promise<CatalogoPagos> {
  const [metodosRes, gruposRes] = await Promise.all([
    supabase.from('payment_methods').select('payment_method_id, name, tipologia, currency, group_id, active, applies_to_orders').eq('active', true).eq('applies_to_orders', true),
    supabase.from('payment_groups').select('group_id, name, sort_order, active'),
  ]);
  if (metodosRes.error) throw new Error(`No se pudo leer el catálogo de Métodos de Pago: ${metodosRes.error.message}`);
  if (gruposRes.error) throw new Error(`No se pudieron leer los Grupos de pago (¿falta la migración 2026-10-27?): ${gruposRes.error.message}`);
  const grupos = new Map<string, GrupoPago>();
  (gruposRes.data || []).forEach((g: any) => grupos.set(g.group_id, { id: g.group_id, nombre: g.name, orden: g.sort_order ?? 0, activo: g.active }));
  const metodos = new Map<string, MetodoPagoCatalogo>();
  (metodosRes.data || []).forEach((m: any) => metodos.set(normalizeCompact(m.name), {
    id: m.payment_method_id,
    nombre: m.name,
    tipologia: m.tipologia === 'cobrar' ? 'cobrar' : 'pagar',
    moneda: m.currency === 'USD' ? 'USD' : 'CUP',
    grupoId: m.group_id || null,
  }));
  return { metodos, grupos };
}

// Método del catálogo para el payment_type de una orden (null = no está en
// el catálogo de Órdenes: la orden queda "sin clasificar").
export function clasificarPago(cat: CatalogoPagos, paymentType: string): MetodoPagoCatalogo | null {
  return cat.metodos.get(normalizeCompact(paymentType)) || null;
}

export function grupoDe(cat: CatalogoPagos, metodo: MetodoPagoCatalogo): GrupoPago {
  return (metodo.grupoId && cat.grupos.get(metodo.grupoId)) || SIN_GRUPO;
}

// Clave de una línea del desglose: un mismo grupo puede tener líneas Por
// Cobrar y Por Pagar, o métodos en CUP y en USD.
export const claveLinea = (grupoId: string, tipologia: Tipologia, moneda: Moneda) => `${grupoId}|${tipologia}|${moneda}`;

export interface LineaGrupo {
  key: string;
  grupoId: string;
  grupo: string;
  orden: number;
  tipologia: Tipologia;
  moneda: Moneda;     // moneda de los MÉTODOS (USD = parte Exterior)
  ordenes: number;
  saldo: number;      // en la moneda de la fila de conciliación
  monto: number;      // Por Cobrar: el % de comisión (CxC). Por Pagar: el (100 − %) (CxP)
  metodos: string[];
}

export interface DesgloseCalculo {
  lineas: LineaGrupo[];
  sinClasificar: { ordenes: number; saldo: number; tipos: Set<string> };
  totalCxC: number;
  totalCxP: number;
}

export const ordenarLineas = (a: LineaGrupo, b: LineaGrupo) =>
  a.orden - b.orden || a.grupo.localeCompare(b.grupo) || a.tipologia.localeCompare(b.tipologia) || a.moneda.localeCompare(b.moneda);

export function totales(lineas: LineaGrupo[]) {
  return {
    totalCxC: lineas.filter(l => l.tipologia === 'cobrar').reduce((s, l) => s + l.monto, 0),
    totalCxP: lineas.filter(l => l.tipologia === 'pagar').reduce((s, l) => s + l.monto, 0),
    ordenes: lineas.reduce((s, l) => s + l.ordenes, 0),
  };
}

// "Saldo" de una orden = product_amount (Negocios) o delivery_charge
// (Mensajeros), lo pasa el llamador en `monto`.
export function computeDesglose(
  ordenes: { paymentType: string; monto: number }[],
  commissionPercent: number,
  cat: CatalogoPagos
): DesgloseCalculo {
  const porClave = new Map<string, LineaGrupo>();
  const sinClasificar = { ordenes: 0, saldo: 0, tipos: new Set<string>() };
  ordenes.forEach(o => {
    const metodo = clasificarPago(cat, o.paymentType);
    if (!metodo) {
      sinClasificar.ordenes += 1;
      sinClasificar.saldo += o.monto;
      sinClasificar.tipos.add(o.paymentType || '(vacío)');
      return;
    }
    const g = grupoDe(cat, metodo);
    const key = claveLinea(g.id, metodo.tipologia, metodo.moneda);
    const linea = porClave.get(key) || {
      key, grupoId: g.id, grupo: g.nombre, orden: g.orden,
      tipologia: metodo.tipologia, moneda: metodo.moneda,
      ordenes: 0, saldo: 0, monto: 0, metodos: [],
    };
    linea.ordenes += 1;
    linea.saldo += o.monto;
    if (!linea.metodos.includes(metodo.nombre)) linea.metodos.push(metodo.nombre);
    porClave.set(key, linea);
  });
  const pct = commissionPercent / 100;
  const lineas = Array.from(porClave.values()).map(l => ({
    ...l,
    monto: l.tipologia === 'cobrar' ? l.saldo * pct : l.saldo * (1 - pct),
  })).sort(ordenarLineas);
  return { lineas, sinClasificar, ...totales(lineas) };
}

// Convierte saldo y monto de las líneas (filas "Exterior": CUP -> USD).
export const convertirLineas = (lineas: LineaGrupo[], factor: number): LineaGrupo[] =>
  lineas.map(l => ({ ...l, saldo: l.saldo * factor, monto: l.monto * factor }));

// Totales para las columnas que ya existían en las tablas de conciliación
// (Dashboard y el trigger del consecutivo los usan).
export function columnasLegado(lineas: LineaGrupo[]) {
  const sum = (f: (l: LineaGrupo) => boolean) => {
    const ls = lineas.filter(f);
    return { ordenes: ls.reduce((s, l) => s + l.ordenes, 0), monto: ls.reduce((s, l) => s + l.monto, 0) };
  };
  const cobrar = sum(l => l.tipologia === 'cobrar');
  const pagarCup = sum(l => l.tipologia === 'pagar' && l.moneda === 'CUP');
  const pagarUsd = sum(l => l.tipologia === 'pagar' && l.moneda === 'USD');
  return {
    ordenes_efectivo: cobrar.ordenes, cxc_cu: cobrar.monto,
    ordenes_transfermovil: pagarCup.ordenes, cxp_tm: pagarCup.monto,
    ordenes_saldo_mandao: pagarUsd.ordenes, cxp_sm: pagarUsd.monto,
    ordenes_tarjeta: 0, cxp_us: 0,
  };
}

// Desglose guardado en la conciliación (columna `desglose`).
export function parseDesglose(raw: any): LineaGrupo[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l: any) => ({
    key: String(l.key), grupoId: String(l.grupoId), grupo: String(l.grupo), orden: Number(l.orden) || 0,
    tipologia: l.tipologia === 'cobrar' ? 'cobrar' : 'pagar', moneda: l.moneda === 'USD' ? 'USD' : 'CUP',
    ordenes: Number(l.ordenes) || 0, saldo: Number(l.saldo) || 0, monto: Number(l.monto) || 0,
    metodos: Array.isArray(l.metodos) ? l.metodos.map(String) : [],
  } as LineaGrupo)).sort(ordenarLineas);
}
