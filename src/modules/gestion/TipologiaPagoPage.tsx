import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Layers, Loader2, Plus, Save, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';

// Configuración -> Tipología de Pago (documento "Nuevos cambios", 2026-10-27).
//   · Cuentas por Cobrar / Cuentas por Pagar: qué métodos de pago participan
//     en cada tipología, con su Moneda y su Grupo. Todo editable desde aquí,
//     sin tocar código: la conciliación lee esta clasificación
//     (lib/conciliacion/catalogoPagos.ts).
//   · Grupos de Pago: columnas del PDF y del resumen de la conciliación.

type Tipologia = 'cobrar' | 'pagar';
type Moneda = 'CUP' | 'USD';
interface Metodo {
  id: string; nombre: string; tipologia: Tipologia; moneda: Moneda; grupoId: string | null; activo: boolean;
  negocios: boolean; mensajeros: boolean; ordenes: boolean;
}
interface Grupo { id: string; nombre: string; orden: number; activo: boolean }

const INFO: Record<Tipologia, { titulo: string; descripcion: string; icon: React.ElementType; tono: string; otra: Tipologia }> = {
  cobrar: {
    titulo: 'Cuentas por Cobrar',
    descripcion: 'El negocio o el mensajero recibe el dinero del cliente y le debe a Mandao la comisión. Marque los métodos de pago que generan una Cuenta por Cobrar.',
    icon: ArrowDownLeft,
    tono: 'text-[var(--color-danger)] bg-[var(--color-danger-bg)]',
    otra: 'pagar',
  },
  pagar: {
    titulo: 'Cuentas por Pagar',
    descripcion: 'El cliente le paga a Mandao y Mandao le debe al negocio o al mensajero su parte. Marque los métodos de pago que generan una Cuenta por Pagar.',
    icon: ArrowUpRight,
    tono: 'text-[var(--color-success)] bg-[var(--color-success-bg)]',
    otra: 'cobrar',
  },
};

const fieldCls = 'h-9 w-full px-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)]';
const MSG_MIGRACION = 'Falta correr en Supabase la migración 2026-10-27_tipologia_moneda_grupo_pagos.sql.';

function useCatalogo() {
  const [metodos, setMetodos] = useState<Metodo[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [mRes, gRes] = await Promise.all([
      supabase.from('payment_methods')
        .select('payment_method_id, name, tipologia, currency, group_id, active, applies_to_businesses, applies_to_messengers, applies_to_orders')
        .order('name'),
      supabase.from('payment_groups').select('group_id, name, sort_order, active').order('sort_order'),
    ]);
    const err = mRes.error || gRes.error;
    if (err) {
      setError(/tipologia|payment_groups|currency|group_id/.test(err.message) ? MSG_MIGRACION : err.message);
      setLoading(false);
      return;
    }
    setMetodos((mRes.data || []).map((m: any) => ({
      id: m.payment_method_id, nombre: m.name, tipologia: m.tipologia === 'cobrar' ? 'cobrar' : 'pagar',
      moneda: m.currency === 'USD' ? 'USD' : 'CUP', grupoId: m.group_id || null, activo: m.active,
      negocios: m.applies_to_businesses, mensajeros: m.applies_to_messengers, ordenes: m.applies_to_orders,
    })));
    setGrupos((gRes.data || []).map((g: any) => ({ id: g.group_id, nombre: g.name, orden: g.sort_order ?? 0, activo: g.active })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  return { metodos, setMetodos, grupos, loading, error, load };
}

function Cabecera({ icon: Icon, titulo, descripcion, tono }: { icon: React.ElementType; titulo: string; descripcion: string; tono: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('p-3 rounded-xl', tono)}><Icon className="w-6 h-6" /></div>
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-faint)]">Configuración / Tipología de Pago</p>
        <h1 className="text-xl font-bold text-[var(--color-text)]">{titulo}</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl">{descripcion}</p>
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-80 animate-pulse rounded bg-[var(--color-surface-3)]" />
      <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-3)]" />
    </div>
  );
}

function ErrorCarga({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-10 flex flex-col items-center text-center gap-3">
      <AlertTriangle className="w-10 h-10 text-[var(--color-danger)]" />
      <h2 className="text-base font-semibold text-[var(--color-text)]">No se pudo cargar la Tipología de Pago</h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-md">{error}</p>
      <Button variant="outline" className="gap-2" onClick={onRetry}><RefreshCw size={16} /> Reintentar</Button>
    </div>
  );
}

const chip = 'px-1.5 py-0.5 rounded-[var(--radius-xs)] text-[10px] font-bold border border-[var(--color-border)] bg-[var(--color-surface-3)] text-[var(--color-text-muted)]';

// ---------------------------------------------------------------------------
// Cuentas por Cobrar / Cuentas por Pagar
// ---------------------------------------------------------------------------
export function TipologiaPagoPage({ tipologia }: { tipologia: Tipologia }) {
  const { user } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');
  const { metodos, setMetodos, grupos, loading, error, load } = useCatalogo();
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [aplica, setAplica] = useState<'todos' | 'ordenes' | 'negocios' | 'mensajeros'>('ordenes');
  const [soloParticipantes, setSoloParticipantes] = useState(false);
  const info = INFO[tipologia];

  const nombreGrupo = (id: string | null) => grupos.find(g => g.id === id)?.nombre || 'Sin grupo';

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return metodos
      .filter(m => aplica === 'todos' || m[aplica])
      .filter(m => !soloParticipantes || m.tipologia === tipologia)
      .filter(m => !q || m.nombre.toLowerCase().includes(q))
      .sort((a, b) => Number(b.tipologia === tipologia) - Number(a.tipologia === tipologia) || a.nombre.localeCompare(b.nombre));
  }, [metodos, aplica, soloParticipantes, busqueda, tipologia]);

  const participantes = metodos.filter(m => m.tipologia === tipologia);
  const sinGrupo = participantes.filter(m => m.activo && !m.grupoId).length;

  const actualizar = async (m: Metodo, cambios: Partial<Pick<Metodo, 'tipologia' | 'moneda' | 'grupoId'>>) => {
    setGuardandoId(m.id);
    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (cambios.tipologia) payload.tipologia = cambios.tipologia;
    if (cambios.moneda) payload.currency = cambios.moneda;
    if ('grupoId' in cambios) payload.group_id = cambios.grupoId || null;
    const { error: e } = await supabase.from('payment_methods').update(payload).eq('payment_method_id', m.id);
    if (e) {
      alert('No se pudo guardar el cambio: ' + e.message);
    } else {
      setMetodos(prev => prev.map(x => (x.id === m.id ? { ...x, ...cambios } : x)));
      const grupoNuevo = 'grupoId' in cambios ? cambios.grupoId ?? null : m.grupoId;
      logAuditEvent('Configuraciones', 'Tipología de Método de Pago Actualizada', {
        metodo: m.nombre,
        antes: { tipologia: m.tipologia, moneda: m.moneda, grupo: nombreGrupo(m.grupoId) },
        despues: { tipologia: cambios.tipologia ?? m.tipologia, moneda: cambios.moneda ?? m.moneda, grupo: nombreGrupo(grupoNuevo) },
      });
    }
    setGuardandoId(null);
  };

  if (loading) return <Cargando />;
  if (error) return <ErrorCarga error={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Cabecera icon={info.icon} titulo={info.titulo} descripcion={info.descripcion} tono={info.tono} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">Métodos que participan</p>
          <p className="text-2xl font-bold text-[var(--color-text)] tabular-nums mt-1">{participantes.length}</p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">En CUP / en USD</p>
          <p className="text-2xl font-bold text-[var(--color-text)] tabular-nums mt-1">
            {participantes.filter(m => m.moneda === 'CUP').length} / {participantes.filter(m => m.moneda === 'USD').length}
          </p>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
          <p className="text-xs font-semibold text-[var(--color-text-muted)]">Sin grupo asignado</p>
          <p className={cn('text-2xl font-bold tabular-nums mt-1', sinGrupo > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text)]')}>{sinGrupo}</p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        {/* Filtros */}
        <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Buscar método</span>
            <span className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Nombre del método" className={cn(fieldCls, 'pl-8')} />
            </span>
          </label>
          <label className="flex flex-col gap-1 w-44">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Aplica a</span>
            <select value={aplica} onChange={(e) => setAplica(e.target.value as typeof aplica)} className={fieldCls}>
              <option value="ordenes">Órdenes</option>
              <option value="negocios">Negocios</option>
              <option value="mensajeros">Mensajeros</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <label className="flex items-center gap-2 h-9 text-sm text-[var(--color-text)]">
            <input type="checkbox" checked={soloParticipantes} onChange={(e) => setSoloParticipantes(e.target.checked)} className="w-4 h-4" />
            Solo los que participan
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <tr>
                <th className="p-3 font-bold w-24">Participa</th>
                <th className="p-3 font-bold">Método de pago</th>
                <th className="p-3 font-bold">Aplica a</th>
                <th className="p-3 font-bold w-28">Moneda</th>
                <th className="p-3 font-bold w-56">Grupo</th>
                <th className="p-3 font-bold w-24">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {lista.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-sm text-[var(--color-text-muted)]">No hay métodos de pago con estos filtros.</td></tr>
              ) : lista.map(m => {
                const participa = m.tipologia === tipologia;
                const ocupado = !canWrite || guardandoId === m.id;
                return (
                  <tr key={m.id} className={cn('h-11 hover:bg-[var(--color-surface-2)]', !participa && 'text-[var(--color-text-faint)]')}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`${m.nombre} participa en ${info.titulo}`}
                        title={participa ? `Quitar de ${info.titulo} (pasa a ${INFO[info.otra].titulo})` : `Agregar a ${info.titulo}`}
                        disabled={ocupado}
                        checked={participa}
                        onChange={(e) => actualizar(m, { tipologia: e.target.checked ? tipologia : info.otra })}
                        className="w-4 h-4"
                      />
                    </td>
                    <td className="p-3">
                      <span className={cn('inline-flex items-center gap-2 font-semibold', participa ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]')}>
                        {m.nombre}
                        {guardandoId === m.id && <Loader2 size={12} className="animate-spin text-[var(--color-text-faint)]" />}
                      </span>
                      {!participa && <span className="block text-[11px]">En {INFO[info.otra].titulo}</span>}
                    </td>
                    <td className="p-3">
                      <span className="flex flex-wrap gap-1">
                        {m.ordenes && <span className={chip}>Órdenes</span>}
                        {m.negocios && <span className={chip}>Negocios</span>}
                        {m.mensajeros && <span className={chip}>Mensajeros</span>}
                      </span>
                    </td>
                    <td className="p-3">
                      <select aria-label={`Moneda de ${m.nombre}`} disabled={ocupado || !participa} value={m.moneda} onChange={(e) => actualizar(m, { moneda: e.target.value as Moneda })} className={fieldCls}>
                        <option value="CUP">CUP</option>
                        <option value="USD">USD</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <select aria-label={`Grupo de ${m.nombre}`} disabled={ocupado || !participa} value={m.grupoId || ''} onChange={(e) => actualizar(m, { grupoId: e.target.value || null })} className={fieldCls}>
                        <option value="">Sin grupo</option>
                        {grupos.filter(g => g.activo || g.id === m.grupoId).map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                      </select>
                    </td>
                    <td className="p-3 text-xs font-semibold">
                      {m.activo ? <span className="text-[var(--color-success)]">Activo</span> : <span className="text-[var(--color-text-faint)]">Inactivo</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)]">
          Cada método pertenece a una sola tipología: al desmarcarlo aquí pasa a {INFO[info.otra].titulo}. La conciliación clasifica cada orden
          por su "Payment Type" según los métodos que aplican a Órdenes. Moneda USD = parte "Exterior" de los negocios con vía Transferencia-Exterior.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grupos de Pago
// ---------------------------------------------------------------------------
export function GruposPagoPage() {
  const { user } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');
  const { metodos, grupos, loading, error, load } = useCatalogo();
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [nuevoGrupo, setNuevoGrupo] = useState('');
  const [draft, setDraft] = useState<Record<string, { nombre: string; orden: number; activo: boolean }>>({});

  useEffect(() => {
    setDraft(Object.fromEntries(grupos.map(g => [g.id, { nombre: g.nombre, orden: g.orden, activo: g.activo }])));
  }, [grupos]);

  const guardar = async (g: Grupo) => {
    const d = draft[g.id];
    if (!d?.nombre.trim()) return;
    setGuardandoId(g.id);
    const { error: e } = await supabase.from('payment_groups')
      .update({ name: d.nombre.trim(), sort_order: d.orden, active: d.activo, updated_at: new Date().toISOString() })
      .eq('group_id', g.id);
    if (e) alert(e.code === '23505' ? 'Ya existe un grupo con ese nombre.' : 'No se pudo guardar el grupo: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Grupo de Pago Actualizado', { antes: g.nombre, despues: d.nombre.trim(), orden: d.orden, activo: d.activo });
      await load();
    }
    setGuardandoId(null);
  };

  const crear = async () => {
    const nombre = nuevoGrupo.trim();
    if (!nombre) return;
    setGuardandoId('nuevo');
    const orden = grupos.reduce((m, g) => Math.max(m, g.orden), 0) + 1;
    const { error: e } = await supabase.from('payment_groups').insert({ name: nombre, sort_order: orden });
    if (e) alert(e.code === '23505' ? 'Ya existe un grupo con ese nombre.' : 'No se pudo crear el grupo: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Grupo de Pago Creado', { nombre, orden });
      setNuevoGrupo('');
      await load();
    }
    setGuardandoId(null);
  };

  if (loading) return <Cargando />;
  if (error) return <ErrorCarga error={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Cabecera
        icon={Layers}
        titulo="Grupos de Pago"
        descripcion="Agrupan los métodos de pago en las columnas del PDF de conciliación y del resumen del período, en el orden indicado. Asigne cada método a un grupo desde Cuentas por Cobrar o Cuentas por Pagar."
        tono="text-[var(--color-brand-ink)] bg-[var(--color-brand-subtle)]"
      />

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <tr>
                <th className="p-3 font-bold w-24">Orden</th>
                <th className="p-3 font-bold">Nombre</th>
                <th className="p-3 font-bold">Métodos (Por Cobrar / Por Pagar)</th>
                <th className="p-3 font-bold w-20">Activo</th>
                <th className="p-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {grupos.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-sm text-[var(--color-text-muted)]">Sin grupos de pago. Agregue el primero abajo.</td></tr>
              ) : grupos.map(g => {
                const d = draft[g.id] || { nombre: g.nombre, orden: g.orden, activo: g.activo };
                const cambiado = d.nombre !== g.nombre || d.orden !== g.orden || d.activo !== g.activo;
                const set = (patch: Partial<typeof d>) => setDraft(prev => ({ ...prev, [g.id]: { ...d, ...patch } }));
                const delGrupo = metodos.filter(m => m.grupoId === g.id);
                return (
                  <tr key={g.id} className="h-11">
                    <td className="p-3"><input type="number" aria-label="Orden" disabled={!canWrite} value={d.orden} onChange={(e) => set({ orden: Number(e.target.value) })} className={cn(fieldCls, 'text-right tabular-nums')} /></td>
                    <td className="p-3"><input type="text" aria-label="Nombre del grupo" disabled={!canWrite} value={d.nombre} onChange={(e) => set({ nombre: e.target.value })} className={fieldCls} /></td>
                    <td className="p-3 text-xs text-[var(--color-text-muted)]">
                      {delGrupo.length === 0 ? '—' : delGrupo.map(m => `${m.nombre} (${m.tipologia === 'cobrar' ? 'CxC' : 'CxP'} · ${m.moneda})`).join(', ')}
                    </td>
                    <td className="p-3"><input type="checkbox" aria-label="Grupo activo" disabled={!canWrite} checked={d.activo} onChange={(e) => set({ activo: e.target.checked })} className="w-4 h-4" /></td>
                    <td className="p-3 text-right">
                      {canWrite && (
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={!cambiado || !d.nombre.trim() || guardandoId === g.id} onClick={() => guardar(g)}>
                          {guardandoId === g.id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canWrite && (
          <div className="p-4 border-t border-[var(--color-border)] flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5 flex-1 min-w-[14rem]">
              <span className="text-sm font-medium text-[var(--color-text)]">Nuevo grupo</span>
              <input type="text" value={nuevoGrupo} onChange={(e) => setNuevoGrupo(e.target.value)} placeholder="Ej. Pago en Línea Exterior" className={cn(fieldCls, 'h-10')} />
            </label>
            <Button variant="outline" className="gap-2" disabled={!nuevoGrupo.trim() || guardandoId === 'nuevo'} onClick={crear}>
              {guardandoId === 'nuevo' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar grupo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
