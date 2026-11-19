import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Search, Loader2, AlertTriangle, RefreshCw, Eye, Pencil, Trash2, FileSpreadsheet, FileText, X,
  Clock, CircleDashed, BadgeCheck, Save,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePermisos } from '../../lib/permisos';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { Monto } from '../../design-system/primitives/Monto';
import { Pagination, usePagination } from '../../design-system/patterns/Pagination';
import { EstadoConciliacionBadge } from '../../lib/conciliacion/EstadoBadge';
import { notificar, confirmar } from '../../lib/notificaciones';
import { TODAS_LAS_VIAS, accionDe, exportarPdf, exportarExcel, type Moneda } from '../../lib/conciliacion/cobrosPagos';
import {
  loadPlanificaciones, actualizarPlanificacion, quitarItem, eliminarPlanificacion, filasDePlanificacion, exportarListado,
  type Planificacion, type EstadoPlanificacion, type ItemPlanificacion,
} from '../../lib/conciliacion/planificaciones';

// Planificación de Pagos (menú propio, 2026-11-19): planificaciones generadas
// desde Cobros y Pagos de Negocios y de Mensajeros. Ver / editar (fecha,
// notas, quitar cuentas) / eliminar, filtros y exportación. El estado se
// calcula del estado de sus conciliaciones (ver lib/conciliacion/planificaciones.ts).

const fieldCls = 'h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)]';

const ESTADO: Record<EstadoPlanificacion, { icon: React.ElementType; clase: string }> = {
  'Pendiente': { icon: Clock, clase: 'bg-[var(--color-neutral-bg)] text-[var(--color-text-muted)] border-[var(--color-border)]' },
  'En Proceso': { icon: CircleDashed, clase: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-blue-200' },
  'Pagado': { icon: BadgeCheck, clase: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-green-200' },
};

function EstadoBadge({ estado }: { estado: EstadoPlanificacion }) {
  const { icon: Icon, clase } = ESTADO[estado];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border whitespace-nowrap', clase)}>
      <Icon size={12} /> {estado}
    </span>
  );
}

const actorLabel = (e: string) => (e === 'negocios' ? 'Negocios' : 'Mensajeros');

export function PlanificacionesPage() {
  const { user } = useAuth();
  const permisos = usePermisos('planificacion-pagos');
  const puedeEditar = permisos.puede('editar');
  const puedeEliminar = permisos.puede('eliminar');
  const puedeExportar = permisos.puede('exportar');

  const [lista, setLista] = useState<Planificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [actor, setActor] = useState('');
  const [via, setVia] = useState('');
  const [area, setArea] = useState('');
  const [moneda, setMoneda] = useState<'' | Moneda>('');
  const [estado, setEstado] = useState<'' | EstadoPlanificacion>('');

  const [viendo, setViendo] = useState<Planificacion | null>(null);
  const [editando, setEditando] = useState<Planificacion | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const l = await loadPlanificaciones();
      setLista(l);
      // Refresca los paneles abiertos con los datos nuevos.
      setViendo(v => (v ? l.find(p => p.id === v.id) || null : v));
      setEditando(v => (v ? l.find(p => p.id === v.id) || null : v));
    } catch (err: any) {
      setError(/planificaciones_pago|planificacion_items/.test(err?.message || '')
        ? 'Falta correr en Supabase la migración 2026-11-19b_planificacion_pagos.sql.'
        : err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const areasDisponibles = useMemo(() => Array.from(new Set(lista.flatMap(p => p.areas))).sort(), [lista]);
  const filtrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return lista.filter(p =>
      (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta)
      && (!actor || p.entidad === actor) && (!via || p.via === via) && (!moneda || p.moneda === moneda)
      && (!estado || p.estado === estado) && (!area || p.areas.includes(area))
      && (!q || p.consecutivo.toLowerCase().includes(q) || p.responsable.toLowerCase().includes(q) || p.notas.toLowerCase().includes(q)
        || p.items.some(i => i.nombre.toLowerCase().includes(q) || (i.consecutivo || '').toLowerCase().includes(q))));
  }, [lista, busqueda, desde, hasta, actor, via, area, moneda, estado]);
  const pag = usePagination(filtrada, 20, [filtrada]);
  const hayFiltros = !!(busqueda || desde || hasta || actor || via || area || moneda || estado);
  const limpiar = () => { setBusqueda(''); setDesde(''); setHasta(''); setActor(''); setVia(''); setArea(''); setMoneda(''); setEstado(''); };

  const exportar = async (formato: 'excel' | 'pdf') => {
    setExportando(formato);
    try { await exportarListado(formato, filtrada); } catch (err: any) { notificar.error('No se pudo exportar: ' + (err?.message || err)); }
    finally { setExportando(null); }
  };

  const descargar = async (p: Planificacion, formato: 'excel' | 'pdf') => {
    setExportando(p.id + formato);
    try {
      const filas = filasDePlanificacion(p);
      const titulo = `Planificación ${p.consecutivo} — ${actorLabel(p.entidad)} · ${p.via} · ${p.moneda}`;
      if (formato === 'pdf') await exportarPdf(p.entidad, filas, p.responsable, { titulo, subtitulo: `Emitida el ${formatDate(p.fecha)} por ${p.responsable} · Estado: ${p.estado}` });
      else await exportarExcel(p.entidad, filas, `Planificacion ${p.consecutivo}`);
    } catch (err: any) {
      notificar.error('No se pudo descargar: ' + (err?.message || err));
    } finally {
      setExportando(null);
    }
  };

  const eliminar = async (p: Planificacion) => {
    if (p.estado !== 'Pendiente') {
      notificar.advertencia(`La planificación ${p.consecutivo} está ${p.estado}: solo se pueden eliminar las Pendientes (ninguna cuenta pagada ni cobrada).`);
      return;
    }
    const ok = await confirmar(`Se eliminará la planificación ${p.consecutivo} (${p.items.length} cuenta(s)). Sus cuentas vuelven a quedar disponibles en Cobros y Pagos. Esta acción no se puede deshacer.`, { titulo: '¿Eliminar planificación?', textoConfirmar: 'Eliminar' });
    if (!ok) return;
    try {
      await eliminarPlanificacion(p);
      notificar.exito(`Planificación ${p.consecutivo} eliminada.`);
      await load();
    } catch (err: any) {
      notificar.error('No se pudo eliminar: ' + (err?.message || err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-[var(--color-brand-subtle)] rounded-xl border border-[var(--color-brand-active-border)]">
          <CalendarClock className="w-6 h-6 text-[var(--color-brand-ink)]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Planificación de Pagos</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl">
            Planificaciones generadas desde Cobros y Pagos de Negocios y Mensajeros. Su estado avanza solo a medida que se registran
            como Pagado o Cobrado las conciliaciones en el histórico: <strong>Pendiente</strong> (todas Confirmadas),
            <strong> En Proceso</strong> y <strong>Pagado</strong> (todas pagadas o cobradas).
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 flex-[2_1_14rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Buscar</span>
            <span className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Consecutivo, negocio, mensajero, cuenta…" className={cn(fieldCls, 'pl-8')} />
            </span>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[9.5rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={cn(fieldCls, 'font-mono text-xs')} />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[9.5rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={cn(fieldCls, 'font-mono text-xs')} />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[9rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Actor</span>
            <select value={actor} onChange={(e) => setActor(e.target.value)} className={fieldCls}>
              <option value="">Todos</option>
              <option value="negocios">Negocios</option>
              <option value="mensajeros">Mensajeros</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[11rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Vía de pago</span>
            <select value={via} onChange={(e) => setVia(e.target.value)} className={fieldCls}>
              <option value="">Todas</option>
              {TODAS_LAS_VIAS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[9rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Área</span>
            <select value={area} onChange={(e) => setArea(e.target.value)} className={fieldCls}>
              <option value="">Todas</option>
              {areasDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[8rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Moneda</span>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as '' | Moneda)} className={fieldCls}>
              <option value="">Todas</option>
              <option value="CUP">CUP</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[9rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value as '' | EstadoPlanificacion)} className={fieldCls}>
              <option value="">Todos</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En Proceso">En Proceso</option>
              <option value="Pagado">Pagado</option>
            </select>
          </label>
          {hayFiltros && <Button variant="ghost" size="sm" className="gap-1" onClick={limpiar}><X size={14} /> Limpiar</Button>}
        </div>

        <div className="px-4 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[var(--color-text-muted)]">{filtrada.length} planificación(es)</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!puedeExportar || filtrada.length === 0 || !!exportando} onClick={() => exportar('excel')}>
              {exportando === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Exportar Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!puedeExportar || filtrada.length === 0 || !!exportando} onClick={() => exportar('pdf')}>
              {exportando === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Exportar PDF
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <tr>
                <th className="p-3 font-bold">Consecutivo</th>
                <th className="p-3 font-bold">Fecha</th>
                <th className="p-3 font-bold">Actor</th>
                <th className="p-3 font-bold text-right">Cantidad</th>
                <th className="p-3 font-bold">Vía de pago</th>
                <th className="p-3 font-bold text-right">Importe</th>
                <th className="p-3 font-bold">Moneda</th>
                <th className="p-3 font-bold">Estado</th>
                <th className="p-3 font-bold text-right w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-11">{Array.from({ length: 9 }).map((__, j) => <td key={j} className="p-3"><div className="animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-3)] h-4 w-full" /></td>)}</tr>
                ))
              ) : error ? (
                <tr><td colSpan={9} className="p-10">
                  <div className="flex flex-col items-center text-center gap-3">
                    <AlertTriangle className="w-10 h-10 text-[var(--color-danger)]" />
                    <p className="text-sm font-semibold text-[var(--color-text)]">No se pudieron cargar las planificaciones</p>
                    <p className="text-xs text-[var(--color-text-muted)] max-w-md">{error}</p>
                    <Button variant="outline" className="gap-2" onClick={load}><RefreshCw size={16} /> Reintentar</Button>
                  </div>
                </td></tr>
              ) : filtrada.length === 0 ? (
                <tr><td colSpan={9} className="p-10">
                  <div className="flex flex-col items-center text-center gap-2">
                    <CalendarClock className="w-10 h-10 text-[var(--color-text-faint)]" />
                    <p className="text-sm font-semibold text-[var(--color-text)]">{hayFiltros ? 'Sin resultados con estos filtros' : 'Sin planificaciones de pago'}</p>
                    <p className="text-xs text-[var(--color-text-muted)] max-w-md">Se generan desde Cobros y Pagos (Negocios o Mensajeros): marque los registros y pulse "Generar Planificación".</p>
                    {hayFiltros && <Button variant="outline" size="sm" onClick={limpiar}>Limpiar filtros</Button>}
                  </div>
                </td></tr>
              ) : pag.pageItems.map(p => (
                <tr key={p.id} className="group h-11 hover:bg-[var(--color-surface-2)]">
                  <td className="p-3 font-mono text-xs font-semibold">{p.consecutivo || '—'}</td>
                  <td className="p-3 font-mono text-xs text-[var(--color-text-muted)]">{formatDate(p.fecha)}</td>
                  <td className="p-3 text-xs">{actorLabel(p.entidad)}</td>
                  <td className="p-3 text-right tabular-nums text-xs">{p.cantidad}</td>
                  <td className="p-3 text-xs text-[var(--color-text-muted)]">{p.via}</td>
                  <td className="p-3 text-right text-sm"><Monto valor={p.neto} moneda={p.moneda} /></td>
                  <td className="p-3 font-mono text-xs font-semibold">{p.moneda}</td>
                  <td className="p-3"><EstadoBadge estado={p.estado} /></td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => setViendo(p)} aria-label={`Ver ${p.consecutivo}`} title="Ver detalles" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)]"><Eye size={15} /></button>
                      {puedeEditar && (
                        <button type="button" onClick={() => setEditando(p)} aria-label={`Editar ${p.consecutivo}`} title="Editar" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-3)]"><Pencil size={15} /></button>
                      )}
                      {puedeEliminar && (
                        <button type="button" onClick={() => { void eliminar(p); }} aria-label={`Eliminar ${p.consecutivo}`} title="Eliminar" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"><Trash2 size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !error && filtrada.length > 0 && <Pagination {...pag} />}
      </div>

      <SlideOver
        isOpen={!!viendo}
        onClose={() => setViendo(null)}
        title={viendo ? `Planificación ${viendo.consecutivo}` : ''}
        width="max-w-3xl"
        footer={viendo && (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="gap-1.5" disabled={!puedeExportar || !!exportando} onClick={() => descargar(viendo, 'excel')}>
              {exportando === viendo.id + 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
            </Button>
            <Button variant="brand" className="gap-1.5" disabled={!puedeExportar || !!exportando} onClick={() => descargar(viendo, 'pdf')}>
              {exportando === viendo.id + 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Planificación PDF
            </Button>
          </div>
        )}
      >
        {viendo && <DetallePlanificacion p={viendo} />}
      </SlideOver>

      {editando && (
        <EditarPlanificacion p={editando} onCerrar={() => setEditando(null)} onGuardado={load} />
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{label}</p>
      <div className="text-sm font-semibold text-[var(--color-text)] mt-0.5">{children}</div>
    </div>
  );
}

function DetallePlanificacion({ p }: { p: Planificacion }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Campo label="Fecha de emisión">{formatDate(p.fecha)}</Campo>
        <Campo label="Actor">{actorLabel(p.entidad)}</Campo>
        <Campo label="Estado"><EstadoBadge estado={p.estado} /></Campo>
        <Campo label="Vía de pago">{p.via}</Campo>
        <Campo label="Moneda">{p.moneda}</Campo>
        <Campo label="Cantidad">{p.cantidad} {p.entidad === 'negocios' ? 'negocio(s)' : 'mensajero(s)'}</Campo>
        <Campo label="A pagar"><Monto valor={p.montoPagar} moneda={p.moneda} tono="pagar" /></Campo>
        <Campo label="A cobrar"><Monto valor={p.montoCobrar} moneda={p.moneda} tono="cobrar" /></Campo>
        <Campo label="Neto"><Monto valor={p.neto} moneda={p.moneda} /></Campo>
        <Campo label="Área">{p.areas.join(', ') || '—'}</Campo>
        <Campo label="Responsable">{p.responsable || '—'}</Campo>
        <Campo label="Notas">{p.notas || '—'}</Campo>
      </div>
      <TablaItems items={p.items} moneda={p.moneda} />
      <p className="text-xs text-[var(--color-text-muted)]">
        Para registrar el pago o el cobro, cambie la conciliación a Pagado o Cobrado en el histórico de Conciliación (también de forma masiva).
      </p>
    </div>
  );
}

function TablaItems({ items, moneda, accion }: { items: ItemPlanificacion[]; moneda: Moneda; accion?: (i: ItemPlanificacion) => React.ReactNode }) {
  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden">
      <table className="w-full text-left text-xs">
        <thead className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          <tr>
            <th className="p-2 font-bold">Nombre</th>
            <th className="p-2 font-bold">Consecutivo</th>
            <th className="p-2 font-bold">Período</th>
            <th className="p-2 font-bold text-right">Importe</th>
            <th className="p-2 font-bold">Acción</th>
            <th className="p-2 font-bold">Estado</th>
            {accion && <th className="p-2 w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {items.length === 0 ? (
            <tr><td colSpan={accion ? 7 : 6} className="p-4 text-center text-[var(--color-text-muted)]">Sin cuentas.</td></tr>
          ) : items.map(i => (
            <tr key={i.id} className="h-10">
              <td className="p-2 font-semibold text-[var(--color-text)]">{i.nombre}</td>
              <td className="p-2 font-mono">{i.consecutivo || '—'}</td>
              <td className="p-2 font-mono text-[var(--color-text-muted)] whitespace-nowrap">{i.periodoInicial ? `${formatDate(i.periodoInicial)} — ${formatDate(i.periodoFinal || i.periodoInicial)}` : '—'}</td>
              <td className="p-2 text-right"><Monto valor={i.neto} moneda={moneda} /></td>
              <td className="p-2 font-semibold text-[var(--color-text-muted)]">{accionDe(i.neto)}</td>
              <td className="p-2">{i.estadoConciliacion === 'Eliminada' ? <span className="text-[var(--color-text-faint)]">Eliminada</span> : <EstadoConciliacionBadge estado={i.estadoConciliacion} />}</td>
              {accion && <td className="p-2 text-right">{accion(i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditarPlanificacion({ p, onCerrar, onGuardado }: { p: Planificacion; onCerrar: () => void; onGuardado: () => Promise<void> }) {
  const [fecha, setFecha] = useState(p.fecha);
  const [notas, setNotas] = useState(p.notas);
  const [guardando, setGuardando] = useState(false);
  const cambiado = fecha !== p.fecha || notas.trim() !== p.notas;

  const guardar = async () => {
    if (!fecha) return;
    setGuardando(true);
    try {
      await actualizarPlanificacion(p, { fecha, notas });
      notificar.exito(`Planificación ${p.consecutivo} actualizada.`);
      await onGuardado();
      onCerrar();
    } catch (err: any) {
      notificar.error('No se pudo guardar: ' + (err?.message || err));
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (i: ItemPlanificacion) => {
    if (p.items.length === 1) { notificar.advertencia('Es la única cuenta de la planificación: elimine la planificación completa.'); return; }
    const ok = await confirmar(`Se quitará ${i.nombre} (${i.consecutivo || 'sin consecutivo'}) de la planificación ${p.consecutivo}. Volverá a quedar disponible en Cobros y Pagos.`, { titulo: '¿Quitar cuenta?', textoConfirmar: 'Quitar' });
    if (!ok) return;
    try {
      await quitarItem(p, i);
      notificar.exito('Cuenta quitada de la planificación.');
      await onGuardado();
    } catch (err: any) {
      notificar.error('No se pudo quitar: ' + (err?.message || err));
    }
  };

  return (
    <SlideOver
      isOpen
      onClose={onCerrar}
      title={`Editar planificación ${p.consecutivo}`}
      width="max-w-3xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>Cerrar</Button>
          <Button variant="brand" className="gap-1.5" disabled={!cambiado || !fecha || guardando} onClick={() => { void guardar(); }}>
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar cambios
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Fecha de emisión<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={cn(fieldCls, 'h-10 font-mono')} />
          </label>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Vía de pago · Moneda</span>
            <span className="h-10 flex items-center text-sm text-[var(--color-text-muted)]">{p.via} · {p.moneda} (no se cambian: dependen de las cuentas incluidas)</span>
          </div>
          <label className="grid gap-1.5 md:col-span-2">
            <span className="text-sm font-medium text-[var(--color-text)]">Notas</span>
            <textarea rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full px-3 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)]" placeholder="Observaciones para la caja" />
          </label>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--color-text)]">Cuentas incluidas</p>
          <p className="text-xs text-[var(--color-text-muted)]">Solo se pueden quitar las que siguen en Confirmado (no pagadas ni cobradas).</p>
          <TablaItems
            items={p.items}
            moneda={p.moneda}
            accion={i => i.estadoConciliacion === 'Confirmado' || i.estadoConciliacion === 'Eliminada' ? (
              <button type="button" onClick={() => { void quitar(i); }} aria-label={`Quitar ${i.nombre}`} title="Quitar de la planificación" className="p-1 rounded text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]">
                <X size={14} />
              </button>
            ) : null}
          />
        </div>
      </div>
    </SlideOver>
  );
}
