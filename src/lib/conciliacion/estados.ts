import { CircleDot, Send, CheckCircle2, BadgeCheck, HandCoins, type LucideIcon } from 'lucide-react';
import { supabase, logAuditEvent } from '../supabase';

// Ciclo de vida de una conciliación (conciliaciones_businesses /
// conciliaciones_messengers), documento "Nuevos cambios" 2026-10-27:
//   Nuevo      -> registrada; se puede reconciliar.
//   Enviado    -> PDF enviado al negocio/mensajero; se puede reconciliar
//                 (vuelve a Nuevo para reenviar el PDF corregido).
//   Confirmado -> el negocio/mensajero dio conformidad; montos bloqueados.
//   Pagado     -> Mandao pagó el neto (Por Pagar).
//   Cobrado    -> Mandao cobró el neto (Por Cobrar).
// La base de datos bloquea cambiar montos desde Confirmado y registra cada
// reconciliación (migración 2026-10-27b).
export type EstadoConciliacion = 'Nuevo' | 'Enviado' | 'Confirmado' | 'Pagado' | 'Cobrado';

export const ESTADO_CONCILIACION_OPTIONS: EstadoConciliacion[] = ['Nuevo', 'Enviado', 'Confirmado', 'Pagado', 'Cobrado'];

export const ESTADO_CONCILIACION_CONFIG: Record<EstadoConciliacion, { label: string; icon: LucideIcon; className: string }> = {
  Nuevo: { label: 'Nuevo', icon: CircleDot, className: 'bg-[var(--color-neutral-bg)] text-[var(--color-text-muted)] border-[var(--color-border)]' },
  Enviado: { label: 'Enviado', icon: Send, className: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-blue-200' },
  Confirmado: { label: 'Confirmado', icon: CheckCircle2, className: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-amber-200' },
  Pagado: { label: 'Pagado', icon: BadgeCheck, className: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-green-200' },
  Cobrado: { label: 'Cobrado', icon: HandCoins, className: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-green-200' },
};

export const parseEstado = (raw: string | null | undefined): EstadoConciliacion =>
  (ESTADO_CONCILIACION_OPTIONS as string[]).includes(raw || '') ? (raw as EstadoConciliacion) : 'Nuevo';

export const puedeReconciliar = (estado: EstadoConciliacion) => estado === 'Nuevo' || estado === 'Enviado';

// Estados a los que puede pasar una conciliación. `neto` = Por Pagar − Por
// Cobrar: decide si el cierre es Pagado o Cobrado (en 0 no hay cierre).
export function transicionesEstado(estado: EstadoConciliacion, neto: number): EstadoConciliacion[] {
  switch (estado) {
    case 'Nuevo': return ['Enviado'];
    case 'Enviado': return ['Confirmado', 'Nuevo'];
    case 'Confirmado': {
      const cierre: EstadoConciliacion[] = Math.abs(neto) < 0.005 ? [] : [neto > 0 ? 'Pagado' : 'Cobrado'];
      return [...cierre, 'Enviado'];
    }
    default: return [];
  }
}

export type TablaConciliacion = 'conciliaciones_businesses' | 'conciliaciones_messengers';

export async function cambiarEstadoConciliacion(
  table: TablaConciliacion,
  rec: { id: string; estado: EstadoConciliacion; nombre: string; consecutivo: string | null },
  nuevo: EstadoConciliacion
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .update({ estado: nuevo, updated_at: new Date().toISOString() })
    .eq('conciliacion_id', rec.id)
    .eq('estado', rec.estado) // evita pisar un cambio hecho por otro usuario
    .select('conciliacion_id');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(`La conciliación ya no está en estado ${rec.estado} (otro usuario la cambió). Actualice la página.`);
  }
  await logAuditEvent('Conciliaciones', 'Estado de Conciliación Actualizado', {
    entidad: table === 'conciliaciones_businesses' ? 'Negocios' : 'Mensajeros',
    conciliacion: rec.nombre,
    consecutivo: rec.consecutivo,
    antes: rec.estado,
    despues: nuevo,
  });
}

export interface Reconciliacion {
  id: string;
  fecha: string;
  responsable: string;
  estadoAnterior: string | null;
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}

export async function loadReconciliaciones(conciliacionId: string): Promise<Reconciliacion[]> {
  const { data, error } = await supabase
    .from('conciliaciones_reconciliaciones')
    .select('reconciliacion_id, created_at, responsable, estado_anterior, antes, despues')
    .eq('conciliacion_id', conciliacionId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r: any) => ({
    id: r.reconciliacion_id,
    fecha: r.created_at,
    responsable: r.responsable || '—',
    estadoAnterior: r.estado_anterior,
    antes: r.antes || {},
    despues: r.despues || {},
  }));
}
