import React, { useEffect, useMemo, useState } from 'react';
import {
  HandCoins, Search, Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, FileSpreadsheet, FileText,
  CalendarPlus, X, Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { usePermisos } from '../../lib/permisos';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/formatters';
import { Button } from '../../design-system/primitives/Button';
import { Monto as MontoDS } from '../../design-system/primitives/Monto';
import { Pagination, usePagination } from '../../design-system/patterns/Pagination';
import { notificar, confirmar } from '../../lib/notificaciones';
import {
  loadPendientes, loadEntidadesPago, agrupar, accionDe, totalesPorMoneda, exportarExcel, exportarPdf,
  generarPlanificacion, filaDeGrupo, VIAS_PAGO,
  type EntidadCobros, type GrupoCobro, type Moneda, type ConciliacionPendiente, type EntidadPago,
} from '../../lib/conciliacion/cobrosPagos';

// Módulo Negocios / Mensajeros -> Cobros y Pagos (Fase 4, 2026-11-05; vía de
// pago y "Generar Planificación" 2026-11-19). Lista lo pendiente
// (conciliaciones Confirmadas), agrupado por negocio/mensajero, moneda y vía
// de pago, con el neto a pagar o a cobrar. Los grupos marcados (una moneda y
// una vía) se registran como Planificación de Pagos; los ya planificados se
// muestran marcados y no se pueden volver a incluir.

const fieldCls = 'h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)]';

function Monto({ neto, moneda }: { neto: number; moneda: Moneda }) {
  return <MontoDS valor={neto} moneda={moneda} />;
}

export function CobrosPagosPage({ entidad }: { entidad: EntidadCobros }) {
  const { user } = useAuth();
  const permisos = usePermisos(entidad === 'negocios' ? 'cobros-pagos-negocio' : 'cobros-pagos-mensajero');
  const puedeGenerar = permisos.puede('generar_planificacion');
  const puedeExportar = permisos.puede('exportar');
  const e = entidad === 'negocios'
    ? { uno: 'negocio', Uno: 'Negocio', varios: 'negocios', modulo: 'Negocios' }
    : { uno: 'mensajero', Uno: 'Mensajero', varios: 'mensajeros', modulo: 'Mensajeros' };

  const [pendientes, setPendientes] = useState<ConciliacionPendiente[]>([]);
  const [entidades, setEntidades] = useState<Map<string, EntidadPago>>(new Map());
  const [areas, setAreas] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [moneda, setMoneda] = useState<'' | Moneda>('');
  const [via, setVia] = useState('');
  const [tipo, setTipo] = useState<'' | 'pagar' | 'cobrar'>('');
  const [areaId, setAreaId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);
  const [generando, setGenerando] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pend, ar] = await Promise.all([
        loadPendientes(entidad),
        supabase.from('areas').select('area_id, name').order('name'),
      ]);
      const ids = Array.from(new Set(pend.map(p => p.entidadId).filter((x): x is string => !!x)));
      setEntidades(await loadEntidadesPago(entidad, ids));
      setPendientes(pend);
      setAreas((ar.data || []).map((a: any) => ({ id: a.area_id, nombre: a.name })));
      setSeleccion({});
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [entidad]);

  // Vías de pago disponibles según la moneda elegida.
  const viasDisponibles = moneda
    ? VIAS_PAGO[entidad][moneda]
    : Array.from(new Set([...VIAS_PAGO[entidad].CUP, ...VIAS_PAGO[entidad].USD]));
  useEffect(() => { if (via && !viasDisponibles.includes(via)) setVia(''); }, [moneda]);

  // Área y período se aplican a las conciliaciones; vía y Cobrar/Pagar, al grupo.
  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = pendientes.filter(c =>
      (!moneda || c.moneda === moneda)
      && (!areaId || c.areaId === areaId)
      && (!desde || c.fechaFinal >= desde)
      && (!hasta || c.fechaInicial <= hasta)
      && (!q || c.nombre.toLowerCase().includes(q) || (c.consecutivo || '').toLowerCase().includes(q)));
    return agrupar(entidad, base, entidades).filter(g =>
      (!via || g.viaPago === via)
      && (!tipo || (tipo === 'pagar' ? g.neto > 0.005 : g.neto < -0.005)));
  }, [pendientes, entidades, entidad, busqueda, moneda, via, tipo, areaId, desde, hasta]);
  const pag = usePagination(grupos, 25, [grupos]);

  const seleccionables = grupos.filter(g => g.planificaciones.length === 0);
  const seleccionados = seleccionables.filter(g => seleccion[g.key]);
  const todosMarcados = seleccionables.length > 0 && seleccionados.length === seleccionables.length;
  const totSel = totalesPorMoneda(seleccionados);
  const totAll = totalesPorMoneda(grupos);
  const hayFiltros = !!(busqueda || moneda || via || tipo || areaId || desde || hasta);
  const paraExportar = seleccionados.length > 0 ? seleccionados : grupos;
  const limpiar = () => { setBusqueda(''); setMoneda(''); setVia(''); setTipo(''); setAreaId(''); setDesde(''); setHasta(''); };

  // Una planificación es de una sola moneda y una sola vía.
  const monedasSel = new Set(seleccionados.map(g => g.moneda));
  const viasSel = new Set(seleccionados.map(g => g.viaPago));
  const motivoNoGenerar = seleccionados.length === 0
    ? 'Marque los registros a incluir'
    : monedasSel.size > 1 ? 'No se pueden mezclar CUP y USD: filtre por moneda'
    : viasSel.size > 1 ? 'Una planificación es de una sola vía de pago: filtre por vía'
    : null;

  const exportar = async (formato: 'excel' | 'pdf') => {
    setExportando(formato);
    try {
      const filas = paraExportar.map(filaDeGrupo);
      if (formato === 'excel') await exportarExcel(entidad, filas, `Cobros y Pagos ${e.modulo}`);
      else await exportarPdf(entidad, filas, user?.name || user?.email || '');
    } catch (err: any) {
      notificar.error('No se pudo exportar: ' + (err?.message || err));
    } finally {
      setExportando(null);
    }
  };

  const generar = async () => {
    if (motivoNoGenerar) { notificar.advertencia(motivoNoGenerar); return; }
    const m = seleccionados[0].moneda;
    const t = totSel[m];
    const ok = await confirmar(
      `Se generará una Planificación de Pagos con ${seleccionados.length} registro(s) de ${e.varios} · ${seleccionados[0].viaPago} · ${m}: a pagar ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t.pagar)} ${m}, a cobrar ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t.cobrar)} ${m}. Esos registros quedarán marcados "En planificación" y no se podrán incluir en otra.`,
      { titulo: 'Generar Planificación', textoConfirmar: 'Generar', peligro: false },
    );
    if (!ok) return;
    setGenerando(true);
    try {
      const consecutivo = await generarPlanificacion({
        entidad,
        grupos: seleccionados,
        filtros: { busqueda, moneda, via, tipo, area: areas.find(a => a.id === areaId)?.nombre || '', desde, hasta },
        responsable: user?.name || user?.email || '',
        responsableId: user?.uid || null,
      });
      notificar.exito(`Planificación ${consecutivo} generada. Puede verla en el menú Planificación de Pagos.`);
      await load();
    } catch (err: any) {
      notificar.error('No se pudo generar la planificación: ' + (err?.message || err));
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-[var(--color-brand-subtle)] rounded-xl border border-[var(--color-brand-active-border)]">
          <HandCoins className="w-6 h-6 text-[var(--color-brand-ink)]" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-faint)]">Módulo {e.modulo}</p>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Cobros y Pagos</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl">
            Cuentas pendientes de pagar o cobrar: las conciliaciones Confirmadas que todavía no se pagaron ni se cobraron, agrupadas
            por {e.uno}, moneda y vía de pago. Marque las que va a incluir y genere la planificación de pagos para la caja.
          </p>
        </div>
      </div>

      {/* Totales del filtro (por moneda, sin mezclarlas) */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['CUP', 'USD'] as Moneda[]).map(m => (
            <div key={m} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4">
              <p className="text-xs font-semibold text-[var(--color-text-muted)]">{m} · {totAll[m].grupos} registro(s) con saldo pendiente</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2">
                <span className="text-sm text-[var(--color-text-muted)]">A pagar <MontoDS valor={totAll[m].pagar} moneda={m} tono="pagar" className="text-lg" /></span>
                <span className="text-sm text-[var(--color-text-muted)]">A cobrar <MontoDS valor={totAll[m].cobrar} moneda={m} tono="cobrar" className="text-lg" /></span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        {/* FilterBar */}
        <div className="p-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 flex-[2_1_14rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">{e.Uno} o consecutivo</span>
            <span className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder={`Buscar ${e.uno}…`} className={cn(fieldCls, 'pl-8')} />
            </span>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[8rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Moneda</span>
            <select value={moneda} onChange={(ev) => setMoneda(ev.target.value as '' | Moneda)} className={fieldCls}>
              <option value="">Todas</option>
              <option value="CUP">CUP</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[11rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Vía de pago{moneda ? ` (${moneda})` : ''}</span>
            <select value={via} onChange={(ev) => setVia(ev.target.value)} className={fieldCls}>
              <option value="">Todas</option>
              {viasDisponibles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[11rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Cuenta</span>
            <select value={tipo} onChange={(ev) => setTipo(ev.target.value as '' | 'pagar' | 'cobrar')} className={fieldCls}>
              <option value="">Por Pagar y Por Cobrar</option>
              <option value="pagar">Por Pagar (a pagar al {e.uno})</option>
              <option value="cobrar">Por Cobrar (a cobrar al {e.uno})</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[10rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Provincia / Área</span>
            <select value={areaId} onChange={(ev) => setAreaId(ev.target.value)} className={fieldCls}>
              <option value="">Todas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[9.5rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Período desde</span>
            <input type="date" value={desde} onChange={(ev) => setDesde(ev.target.value)} className={cn(fieldCls, 'font-mono text-xs')} />
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-[9.5rem]">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">Período hasta</span>
            <input type="date" value={hasta} onChange={(ev) => setHasta(ev.target.value)} className={cn(fieldCls, 'font-mono text-xs')} />
          </label>
          {hayFiltros && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={limpiar}>
              <X size={14} /> Limpiar
            </Button>
          )}
        </div>

        {/* Barra de selección / acciones */}
        <div className={cn('px-4 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3', seleccionados.length > 0 && 'bg-teal-50')}>
          <div className="text-sm text-[var(--color-text-muted)]">
            {seleccionados.length === 0 ? (
              <span>Marque los registros a planificar (una moneda y una vía). Sin marcar, se exporta todo lo filtrado ({grupos.length}).</span>
            ) : (
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                <strong className="text-[var(--color-text)]">{seleccionados.length} seleccionado(s)</strong>
                {(['CUP', 'USD'] as Moneda[]).filter(m => totSel[m].grupos > 0).map(m => (
                  <span key={m} className="tabular-nums">
                    {m}: a pagar <MontoDS valor={totSel[m].pagar} moneda={m} tono="pagar" />
                    {' · '}a cobrar <MontoDS valor={totSel[m].cobrar} moneda={m} tono="cobrar" />
                  </span>
                ))}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!puedeExportar || grupos.length === 0 || !!exportando} onClick={() => exportar('excel')}>
              {exportando === 'excel' ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Exportar Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!puedeExportar || grupos.length === 0 || !!exportando} onClick={() => exportar('pdf')}>
              {exportando === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Planificación PDF
            </Button>
            {puedeGenerar && (
              <Button
                variant="brand"
                size="sm"
                className="gap-1.5"
                disabled={!!motivoNoGenerar || generando}
                title={motivoNoGenerar || 'Registrar los seleccionados como Planificación de Pagos'}
                onClick={() => { void generar(); }}
              >
                {generando ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />} Generar Planificación
              </Button>
            )}
          </div>
        </div>
        {seleccionados.length > 0 && motivoNoGenerar && (
          <p className="px-4 py-2 text-xs font-medium text-[var(--color-warning)] bg-[var(--color-warning-bg)] border-b border-amber-200">{motivoNoGenerar}.</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <tr>
                <th className="w-10 pl-4 py-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 align-middle"
                    aria-label={`Marcar todos los registros del filtro que no están en una planificación`}
                    disabled={seleccionables.length === 0}
                    checked={todosMarcados}
                    onChange={(ev) => setSeleccion(ev.target.checked ? Object.fromEntries(seleccionables.map(g => [g.key, true])) : {})}
                  />
                </th>
                <th className="w-8 py-3" />
                <th className="p-3 font-bold">{e.Uno}</th>
                <th className="p-3 font-bold">Vía de pago</th>
                <th className="p-3 font-bold">Moneda</th>
                <th className="p-3 font-bold text-right">Cuentas</th>
                <th className="p-3 font-bold text-right">Importe</th>
                <th className="p-3 font-bold">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="h-11">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="p-3"><div className="animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-3)] h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : error ? (
                <tr><td colSpan={8} className="p-10">
                  <div className="flex flex-col items-center text-center gap-3">
                    <AlertTriangle className="w-10 h-10 text-[var(--color-danger)]" />
                    <p className="text-sm font-semibold text-[var(--color-text)]">No se pudieron cargar las cuentas pendientes</p>
                    <p className="text-xs text-[var(--color-text-muted)] max-w-md">{error}</p>
                    <Button variant="outline" className="gap-2" onClick={load}><RefreshCw size={16} /> Reintentar</Button>
                  </div>
                </td></tr>
              ) : grupos.length === 0 ? (
                <tr><td colSpan={8} className="p-10">
                  <div className="flex flex-col items-center text-center gap-2">
                    <HandCoins className="w-10 h-10 text-[var(--color-text-faint)]" />
                    <p className="text-sm font-semibold text-[var(--color-text)]">{hayFiltros ? 'Sin resultados con estos filtros' : 'Sin cuentas pendientes de pagar o cobrar'}</p>
                    <p className="text-xs text-[var(--color-text-muted)] max-w-md">
                      Aquí aparecen las conciliaciones de {e.varios} en estado <strong>Confirmado</strong>. Cuando el {e.uno} confirme su
                      conciliación, cámbiela a Confirmado en el histórico de Conciliación.
                    </p>
                    {hayFiltros && <Button variant="outline" size="sm" onClick={limpiar}>Limpiar filtros</Button>}
                  </div>
                </td></tr>
              ) : pag.pageItems.map(g => {
                const abierto = expandido === g.key;
                const planificado = g.planificaciones.length > 0;
                return (
                  <React.Fragment key={g.key}>
                    <tr className={cn('h-11 cursor-pointer transition-colors hover:bg-[var(--color-surface-2)]', seleccion[g.key] && 'bg-teal-50')} onClick={() => setExpandido(abierto ? null : g.key)}>
                      <td className="pl-4" onClick={(ev) => ev.stopPropagation()}>
                        {planificado ? (
                          <span title={`Ya está en la planificación ${g.planificaciones.join(', ')}`} aria-label="En planificación">
                            <Lock size={14} className="text-[var(--color-text-faint)]" />
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            className="w-4 h-4 align-middle"
                            aria-label={`Marcar ${g.nombre} (${g.viaPago} ${g.moneda})`}
                            checked={!!seleccion[g.key]}
                            onChange={(ev) => setSeleccion(prev => ({ ...prev, [g.key]: ev.target.checked }))}
                          />
                        )}
                      </td>
                      <td>{abierto ? <ChevronUp size={14} className="text-[var(--color-primary)]" /> : <ChevronDown size={14} className="text-[var(--color-text-faint)]" />}</td>
                      <td className="p-3">
                        <span className="block font-semibold text-[var(--color-text)]">{g.nombre}</span>
                        <span className="text-[11px] text-[var(--color-text-faint)]">{g.areas.join(', ')}</span>
                        {planificado && (
                          <span className="ml-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-xs)] text-[10px] font-bold bg-[var(--color-info-bg)] text-[var(--color-info)]">
                            <Lock size={10} /> En planificación {g.planificaciones.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-[var(--color-text-muted)]">{g.viaPago}</td>
                      <td className="p-3 text-xs font-mono font-semibold">{g.moneda}</td>
                      <td className="p-3 text-right tabular-nums text-xs">{g.conciliaciones.length}</td>
                      <td className="p-3 text-right text-sm"><Monto neto={g.neto} moneda={g.moneda} /></td>
                      <td className="p-3 text-xs font-semibold text-[var(--color-text-muted)]">{accionDe(g.neto)}</td>
                    </tr>
                    {abierto && <DetalleGrupo grupo={g} entidad={entidad} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && !error && grupos.length > 0 && <Pagination {...pag} />}
      </div>
    </div>
  );
}

function DetalleGrupo({ grupo: g, entidad }: { grupo: GrupoCobro; entidad: EntidadCobros }) {
  return (
    <tr className="bg-[var(--color-surface-2)]">
      <td colSpan={8} className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                <tr>
                  <th className="text-left font-bold p-2">Consecutivo</th>
                  <th className="text-left font-bold p-2">Período</th>
                  <th className="text-left font-bold p-2">Vía de pago</th>
                  <th className="text-right font-bold p-2">Importe</th>
                  <th className="text-left font-bold p-2">Moneda</th>
                  <th className="text-left font-bold p-2">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {g.conciliaciones.map(c => (
                  <tr key={c.id} className="h-10">
                    <td className="p-2 font-mono">{c.consecutivo || '—'}</td>
                    <td className="p-2 font-mono text-[var(--color-text-muted)] whitespace-nowrap">{formatDate(c.fechaInicial)} — {formatDate(c.fechaFinal)}</td>
                    <td className="p-2 text-[var(--color-text-muted)]">{g.viaPago}</td>
                    <td className="p-2 text-right"><Monto neto={c.neto} moneda={c.moneda} /></td>
                    <td className="p-2 font-mono">{c.moneda}</td>
                    <td className="p-2 font-semibold text-[var(--color-text-muted)]">{accionDe(c.neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Datos de pago ({g.viaPago} · {g.moneda})</p>
            {g.datosPago.length === 0 ? (
              <p className="text-xs text-[var(--color-warning)] font-medium">
                Sin datos de pago registrados para esta vía. Complételos en Gestión de {entidad === 'negocios' ? 'Negocios' : 'Mensajeros'}.
              </p>
            ) : g.datosPago.map(d => (
              <div key={d.label} className="text-xs">
                <span className="block font-semibold text-[var(--color-text)]">{d.label}</span>
                <span className="text-[var(--color-text-muted)] break-words">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </td>
    </tr>
  );
}
