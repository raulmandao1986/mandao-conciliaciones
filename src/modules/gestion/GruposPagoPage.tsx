import React, { useEffect, useState } from 'react';
import { Layers, Loader2, Plus, Save, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { Button } from '../../design-system/primitives/Button';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';
import { cn } from '../../lib/utils';

// Configuración -> Métodos de Pago -> Grupos de Pago (rectificado 2026-10-28).
// Clasificador de las columnas del PDF de conciliación: cada método de pago
// de Órdenes elige su grupo en su propio formulario (Métodos de Pago ->
// Órdenes). Aquí solo se crean, renombran o eliminan grupos; un grupo nuevo
// queda como última columna del PDF.

interface Grupo { id: string; nombre: string; orden: number; metodos: number }

const fieldCls = 'h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20 disabled:bg-[var(--color-surface-2)]';

export function GruposPagoPage() {
  const { user } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [aEliminar, setAEliminar] = useState<Grupo | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [gRes, mRes] = await Promise.all([
      supabase.from('payment_groups').select('group_id, name, sort_order').order('sort_order'),
      supabase.from('payment_methods').select('group_id').not('group_id', 'is', null),
    ]);
    const err = gRes.error || mRes.error;
    if (err) {
      setError(/payment_groups|group_id/.test(err.message) ? 'Falta correr en Supabase la migración 2026-10-27_tipologia_moneda_grupo_pagos.sql.' : err.message);
      setLoading(false);
      return;
    }
    const uso = new Map<string, number>();
    (mRes.data || []).forEach((m: any) => uso.set(m.group_id, (uso.get(m.group_id) || 0) + 1));
    const gs: Grupo[] = (gRes.data || []).map((g: any) => ({ id: g.group_id, nombre: g.name, orden: g.sort_order ?? 0, metodos: uso.get(g.group_id) || 0 }));
    setGrupos(gs);
    setNombres(Object.fromEntries(gs.map(g => [g.id, g.nombre])));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const duplicado = (nombre: string, id?: string) =>
    grupos.some(g => g.id !== id && g.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());

  const renombrar = async (g: Grupo) => {
    const nombre = (nombres[g.id] || '').trim();
    if (!nombre || duplicado(nombre, g.id)) return;
    setGuardandoId(g.id);
    const { error: e } = await supabase.from('payment_groups').update({ name: nombre, updated_at: new Date().toISOString() }).eq('group_id', g.id);
    if (e) alert('No se pudo guardar el grupo: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Grupo de Pago Actualizado', { antes: g.nombre, despues: nombre });
      await load();
    }
    setGuardandoId(null);
  };

  const crear = async () => {
    const nombre = nuevo.trim();
    if (!nombre || duplicado(nombre)) return;
    setGuardandoId('nuevo');
    const orden = grupos.reduce((m, g) => Math.max(m, g.orden), 0) + 1;
    const { error: e } = await supabase.from('payment_groups').insert({ name: nombre, sort_order: orden });
    if (e) alert('No se pudo crear el grupo: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Grupo de Pago Creado', { nombre });
      setNuevo('');
      await load();
    }
    setGuardandoId(null);
  };

  const eliminar = async () => {
    const g = aEliminar;
    setAEliminar(null);
    if (!g) return;
    setGuardandoId(g.id);
    const { error: e } = await supabase.from('payment_groups').delete().eq('group_id', g.id);
    if (e) alert('No se pudo eliminar el grupo: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Grupo de Pago Eliminado', { nombre: g.nombre });
      await load();
    }
    setGuardandoId(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-80 animate-pulse rounded bg-[var(--color-surface-3)]" />
        <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-3)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-10 flex flex-col items-center text-center gap-3">
        <AlertTriangle className="w-10 h-10 text-[var(--color-danger)]" />
        <h2 className="text-base font-semibold text-[var(--color-text)]">No se pudieron cargar los Grupos de Pago</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md">{error}</p>
        <Button variant="outline" className="gap-2" onClick={load}><RefreshCw size={16} /> Reintentar</Button>
      </div>
    );
  }

  const nuevoDuplicado = !!nuevo.trim() && duplicado(nuevo);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl text-[var(--color-brand-ink)] bg-[var(--color-brand-subtle)]"><Layers className="w-6 h-6" /></div>
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-faint)]">Configuración / Métodos de Pago</p>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Grupos de Pago</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Columnas de la tabla de órdenes del PDF de conciliación. El grupo de cada método se elige en Métodos de Pago → Órdenes.
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
            <tr>
              <th className="p-3 font-bold">Nombre</th>
              <th className="p-3 w-48" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {grupos.length === 0 ? (
              <tr><td colSpan={2} className="p-8 text-center text-sm text-[var(--color-text-muted)]">Sin grupos de pago. Agregue el primero abajo.</td></tr>
            ) : grupos.map(g => {
              const nombre = nombres[g.id] ?? g.nombre;
              const cambiado = nombre.trim() !== g.nombre;
              const dup = cambiado && duplicado(nombre, g.id);
              return (
                <tr key={g.id} className="h-11 align-top">
                  <td className="p-3">
                    <input aria-label="Nombre del grupo" disabled={!canWrite} value={nombre} onChange={(e) => setNombres(prev => ({ ...prev, [g.id]: e.target.value }))} className={cn(fieldCls, dup && 'border-[var(--color-danger)]')} />
                    {dup && <span className="block text-xs font-medium text-[var(--color-danger)] mt-1">Ya existe un grupo con ese nombre.</span>}
                  </td>
                  <td className="p-3">
                    {canWrite && (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={!cambiado || !nombre.trim() || dup || guardandoId === g.id} onClick={() => renombrar(g)}>
                          {guardandoId === g.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Eliminar ${g.nombre}`}
                          title={g.metodos > 0 ? `No se puede eliminar: lo usan ${g.metodos} método(s) de pago` : 'Eliminar grupo'}
                          disabled={g.metodos > 0 || guardandoId === g.id}
                          onClick={() => setAEliminar(g)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {canWrite && (
          <div className="p-4 border-t border-[var(--color-border)] flex flex-wrap items-start gap-2">
            <label className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
              <span className="text-sm font-medium text-[var(--color-text)]">Nuevo grupo</span>
              <input type="text" value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Ej. Pago en Línea Exterior" className={cn(fieldCls, 'h-10', nuevoDuplicado && 'border-[var(--color-danger)]')} />
              {nuevoDuplicado && <span className="text-xs font-medium text-[var(--color-danger)]">Ya existe un grupo con ese nombre.</span>}
            </label>
            <Button variant="outline" className="gap-2 mt-7" disabled={!nuevo.trim() || nuevoDuplicado || guardandoId === 'nuevo'} onClick={crear}>
              {guardandoId === 'nuevo' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar grupo
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!aEliminar}
        title="¿Eliminar grupo de pago?"
        message={`Se eliminará el grupo "${aEliminar?.nombre}". Las conciliaciones ya registradas no cambian.`}
        confirmText="Eliminar"
        onConfirm={eliminar}
        onCancel={() => setAEliminar(null)}
      />
    </div>
  );
}
