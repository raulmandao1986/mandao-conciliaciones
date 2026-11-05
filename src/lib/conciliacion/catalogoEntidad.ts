import { supabase, logAuditEvent } from '../supabase';
import { normalizeEntityName } from './paymentBuckets';

// Búsqueda del negocio/mensajero de las órdenes en su catálogo (Gestión de
// Negocios / Mensajeros) al conciliar. Antes solo se miraban los activos y un
// negocio Bloqueado aparecía como "sin registrar" y se volvía a crear
// (reportado 2026-11-05): ahora se distingue si existe con otro estado o en
// otra Área, y se ofrece activarlo o modificar su información.

export type EntidadCatalogo = 'negocios' | 'mensajeros';

export interface RegistroCatalogo {
  id: string;
  nombre: string;
  areaId: string | null;
  activo: boolean;
}

export type Coincidencia =
  | { tipo: 'activo'; id: string }
  | { tipo: 'inactivo'; id: string; nombre: string }
  | { tipo: 'otraArea'; id: string; nombre: string; areaId: string | null; activo: boolean }
  | { tipo: 'ninguno' };

export function buscarEnCatalogo(lista: RegistroCatalogo[], nombre: string, areaId: string): Coincidencia {
  const n = normalizeEntityName(nombre);
  const mismoNombre = lista.filter(r => normalizeEntityName(r.nombre) === n);
  const enArea = mismoNombre.filter(r => r.areaId === areaId);
  const activo = enArea.find(r => r.activo);
  if (activo) return { tipo: 'activo', id: activo.id };
  if (enArea.length > 0) return { tipo: 'inactivo', id: enArea[0].id, nombre: enArea[0].nombre };
  if (mismoNombre.length > 0) {
    const otro = mismoNombre.find(r => r.activo) || mismoNombre[0];
    return { tipo: 'otraArea', id: otro.id, nombre: otro.nombre, areaId: otro.areaId, activo: otro.activo };
  }
  return { tipo: 'ninguno' };
}

const TABLA: Record<EntidadCatalogo, { tabla: 'businesses' | 'messengers'; id: string; modulo: string; etiqueta: string }> = {
  negocios: { tabla: 'businesses', id: 'business_id', modulo: 'Gestion_Negocios', etiqueta: 'Negocio' },
  mensajeros: { tabla: 'messengers', id: 'messenger_id', modulo: 'Gestion_Mensajeros', etiqueta: 'Mensajero' },
};

// Catálogo completo (activos e inactivos) leído al momento, para no
// registrar un duplicado aunque la lista en pantalla esté desactualizada.
export async function leerCatalogo(entidad: EntidadCatalogo): Promise<RegistroCatalogo[]> {
  const t = TABLA[entidad];
  const { data, error } = await supabase.from(t.tabla).select(`${t.id}, name, area_id, active`);
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({ id: r[t.id], nombre: r.name, areaId: r.area_id, activo: !!r.active }));
}

export async function activarEnCatalogo(entidad: EntidadCatalogo, id: string, nombre: string): Promise<void> {
  const t = TABLA[entidad];
  const { error } = await supabase.from(t.tabla).update({ active: true, updated_at: new Date().toISOString() }).eq(t.id, id);
  if (error) throw new Error(error.message);
  await logAuditEvent(t.modulo, `${t.etiqueta} Reactivado desde Conciliación`, {
    id,
    nombre,
    cambios: { Estado: { antes: 'Bloqueado', despues: 'Activo' } },
  });
}

// Abre Gestión de Negocios / Mensajeros con el formulario de edición del
// registro (AppShell escucha el evento y la página de Gestión lee el pendiente).
const CLAVE_EDICION = 'mandao_gestion_editar';
export function abrirEnGestion(entidad: EntidadCatalogo, id: string) {
  sessionStorage.setItem(CLAVE_EDICION, JSON.stringify({ entidad, id }));
  window.dispatchEvent(new CustomEvent('mandao:navegar', { detail: entidad === 'negocios' ? 'gestion-negocios' : 'gestion-mensajeros' }));
}
export function tomarEdicionPendiente(entidad: EntidadCatalogo): string | null {
  try {
    const raw = sessionStorage.getItem(CLAVE_EDICION);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.entidad !== entidad) return null;
    sessionStorage.removeItem(CLAVE_EDICION);
    return typeof p.id === 'string' ? p.id : null;
  } catch {
    return null;
  }
}
