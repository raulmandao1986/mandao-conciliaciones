import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Store, Truck, Users, Activity, GitMerge, UserPlus, Building2, RefreshCw,
  TrendingUp, TrendingDown, Minus, Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDatetime, formatQty, formatPercent } from '../../lib/formatters';
import { fetchAllRows } from '../../lib/conciliacion/fetchAllRows';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import { MontoPagarChart, type SemanaMonto } from './MontoPagarChart';

// Dashboard General (pedido por el usuario 2026-10-07): órdenes del
// Dispatcher, conciliaciones registradas, altas de Negocios/Mensajeros y
// monto a pagar conciliado en el período elegido (por defecto, los últimos
// 30 días), comparado con el período anterior de igual duración.

interface AuditLogEntry {
  log_id: string;
  module: string;
  action: string;
  occurred_at: string;
}

interface Periodo { key: string; label: string; start: string; end: string } // end exclusivo

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function buildPeriodos(): Periodo[] {
  const hoy = new Date();
  const manana = toISODate(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1));
  const list: Periodo[] = [{ key: 'ultimos30', label: 'Últimos 30 días', start: addDays(manana, -30), end: manana }];
  for (let i = 0; i < 12; i++) {
    const ini = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() - i + 1, 1);
    const nombre = ini.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
    list.push({ key: toISODate(ini), label: nombre.charAt(0).toUpperCase() + nombre.slice(1), start: toISODate(ini), end: toISODate(fin) });
  }
  return list;
}

interface DashboardData {
  ordenes: number;
  ordenesPrev: number;
  concNegocios: number;
  concMensajeros: number;
  concPrev: number;
  incidencias: number;
  negociosTotal: number;
  negociosActivos: number;
  negociosNuevos: number;
  mensajerosTotal: number;
  mensajerosActivos: number;
  mensajerosNuevos: number;
  pagarNegociosCUP: number;
  pagarNegociosUSD: number;
  pagarMensajeros: number;
  cobrarCUP: number;
  semanas: SemanaMonto[];
  logs: AuditLogEntry[];
}

async function count(q: PromiseLike<{ count: number | null; error: any }>): Promise<number> {
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

async function loadDashboard(p: Periodo): Promise<DashboardData> {
  const dias = daysBetween(p.start, p.end);
  const prevStart = addDays(p.start, -dias);
  const head = { count: 'exact' as const, head: true };

  const [
    ordenes, ordenesPrev, incidencias,
    negociosTotal, negociosActivos, negociosNuevos,
    mensajerosTotal, mensajerosActivos, mensajerosNuevos,
    concPrevNeg, concPrevMen, concNeg, concMen, logsRes,
  ] = await Promise.all([
    count(supabase.from('dispatcher').select('order_pk', head).gte('delivery_date', p.start).lt('delivery_date', p.end)),
    count(supabase.from('dispatcher').select('order_pk', head).gte('delivery_date', prevStart).lt('delivery_date', p.start)),
    count(supabase.from('dispatcher_incidents').select('incident_id', head)),
    count(supabase.from('businesses').select('business_id', head)),
    count(supabase.from('businesses').select('business_id', head).eq('active', true)),
    count(supabase.from('businesses').select('business_id', head).gte('created_at', p.start).lt('created_at', p.end)),
    count(supabase.from('messengers').select('messenger_id', head)),
    count(supabase.from('messengers').select('messenger_id', head).eq('active', true)),
    count(supabase.from('messengers').select('messenger_id', head).gte('created_at', p.start).lt('created_at', p.end)),
    count(supabase.from('conciliaciones_businesses').select('conciliacion_id', head).gte('fecha', prevStart).lt('fecha', p.start)),
    count(supabase.from('conciliaciones_messengers').select('conciliacion_id', head).gte('fecha', prevStart).lt('fecha', p.start)),
    fetchAllRows<any>((from, to) => supabase.from('conciliaciones_businesses')
      .select('conciliacion_id, fecha, cxp_tm, cxp_sm, cxp_us, cxc_cu, moneda')
      .gte('fecha', p.start).lt('fecha', p.end).order('conciliacion_id').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('conciliaciones_messengers')
      .select('conciliacion_id, fecha, total_por_pagar, total_por_cobrar')
      .gte('fecha', p.start).lt('fecha', p.end).order('conciliacion_id').range(from, to)),
    supabase.from('audit_logs').select('log_id, module, action, occurred_at').order('occurred_at', { ascending: false }).limit(6),
  ]);

  // Semanas de 7 días desde el inicio del período.
  const semanas: SemanaMonto[] = [];
  for (let d = p.start; d < p.end; d = addDays(d, 7)) {
    const fin = addDays(d, 6) < p.end ? addDays(d, 6) : addDays(p.end, -1);
    semanas.push({ label: `${ddmm(d)} – ${ddmm(fin)}`, negocios: 0, mensajeros: 0 });
  }
  const semanaDe = (fecha: string) => Math.min(semanas.length - 1, Math.max(0, Math.floor(daysBetween(p.start, fecha) / 7)));

  // Monto a pagar = neto CxP − CxC de cada conciliación cuando es positivo;
  // si es negativo, es monto a cobrar.
  let pagarNegociosCUP = 0, pagarNegociosUSD = 0, pagarMensajeros = 0, cobrarCUP = 0;
  concNeg.forEach((r: any) => {
    const neto = (Number(r.cxp_tm) || 0) + (Number(r.cxp_sm) || 0) + (Number(r.cxp_us) || 0) - (Number(r.cxc_cu) || 0);
    if (neto > 0) {
      if (r.moneda === 'USD') pagarNegociosUSD += neto;
      else { pagarNegociosCUP += neto; semanas[semanaDe(r.fecha)].negocios += neto; }
    } else if (neto < 0 && r.moneda !== 'USD') cobrarCUP += -neto;
  });
  concMen.forEach((r: any) => {
    const neto = (Number(r.total_por_pagar) || 0) - (Number(r.total_por_cobrar) || 0);
    if (neto > 0) { pagarMensajeros += neto; semanas[semanaDe(r.fecha)].mensajeros += neto; }
    else if (neto < 0) cobrarCUP += -neto;
  });

  return {
    ordenes, ordenesPrev, incidencias,
    concNegocios: concNeg.length, concMensajeros: concMen.length, concPrev: concPrevNeg + concPrevMen,
    negociosTotal, negociosActivos, negociosNuevos,
    mensajerosTotal, mensajerosActivos, mensajerosNuevos,
    pagarNegociosCUP, pagarNegociosUSD, pagarMensajeros, cobrarCUP,
    semanas,
    logs: (logsRes.data as AuditLogEntry[]) ?? [],
  };
}

// Variación contra el período anterior (texto + ícono, nunca solo color).
function Delta({ actual, previo }: { actual: number; previo: number }) {
  if (previo === 0) {
    return <span className="text-[11px] text-[var(--color-text-faint)]">{actual === 0 ? 'Sin datos en el período anterior' : 'Sin datos previos para comparar'}</span>;
  }
  const pct = ((actual - previo) / previo) * 100;
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
  const color = pct > 0 ? 'text-[var(--color-success)]' : pct < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-faint)]';
  return (
    <span className={cn('text-[11px] font-semibold inline-flex items-center gap-1 tabular-nums', color)}>
      <Icon size={12} />
      {pct > 0 ? '+' : ''}{formatPercent(pct)} <span className="font-normal text-[var(--color-text-faint)]">vs. período anterior ({formatQty(previo)})</span>
    </span>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm', className)}>{children}</div>;
}

function Kpi({ label, value, icon: Icon, tone, children }: {
  label: string; value: React.ReactNode; icon: React.ElementType; tone: 'info' | 'success' | 'warning' | 'neutral'; children?: React.ReactNode;
}) {
  const tones = {
    info: 'text-[var(--color-info)] bg-[var(--color-info-bg)]',
    success: 'text-[var(--color-success)] bg-[var(--color-success-bg)]',
    warning: 'text-[var(--color-warning)] bg-[var(--color-warning-bg)]',
    neutral: 'text-[var(--color-text-muted)] bg-[var(--color-neutral-bg)]',
  };
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-[var(--color-text)] mt-1 tabular-nums">{value}</p>
        </div>
        <div className={cn('p-2.5 rounded-[var(--radius-sm)] shrink-0', tones[tone])}><Icon className="w-5 h-5" /></div>
      </div>
      {children && <div className="mt-2">{children}</div>}
    </Card>
  );
}

function ActivosTotal({ label, icon: Icon, activos, total, nuevos }: { label: string; icon: React.ElementType; activos: number; total: number; nuevos: number }) {
  const pct = total > 0 ? (activos / total) * 100 : 0;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-2">
          <Icon size={14} /> {label}
        </p>
        <span className="text-[11px] text-[var(--color-text-faint)] tabular-nums">{formatPercent(pct)} activos</span>
      </div>
      <p className="text-2xl font-bold text-[var(--color-text)] mt-1 tabular-nums">
        {formatQty(activos)} <span className="text-base font-semibold text-[var(--color-text-faint)]">/ {formatQty(total)}</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--color-surface-3)] overflow-hidden" aria-hidden>
        <div className="h-full rounded-full bg-[var(--color-success)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
        Activos / Total registrados · <strong className="text-[var(--color-text)] tabular-nums">{formatQty(total - activos)}</strong> inactivos · <strong className="text-[var(--color-text)] tabular-nums">{formatQty(nuevos)}</strong> nuevos en el período
      </p>
    </Card>
  );
}

function SkeletonCard({ tall }: { tall?: boolean }) {
  return (
    <Card className={cn('animate-pulse space-y-2', tall && 'h-72')}>
      <div className="h-3 w-24 rounded bg-[var(--color-surface-3)]" />
      <div className="h-7 w-32 rounded bg-[var(--color-surface-3)]" />
    </Card>
  );
}

export function Dashboard() {
  const periodos = useMemo(buildPeriodos, []);
  const [periodoKey, setPeriodoKey] = useState('ultimos30');
  const periodo = periodos.find(x => x.key === periodoKey) || periodos[0];
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadDashboard(periodo)
      .then(d => { if (!cancelled) setData(d); })
      .catch(err => { if (!cancelled) setError(err?.message || String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [periodo.key, reload]);

  const rango = `${ddmm(periodo.start)}/${periodo.start.slice(0, 4)} – ${ddmm(addDays(periodo.end, -1))}/${addDays(periodo.end, -1).slice(0, 4)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Dashboard General</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Dispatcher, conciliaciones y catálogos de Negocios y Mensajeros · <span className="tabular-nums">{rango}</span>
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Período</span>
          <select
            value={periodoKey}
            onChange={(e) => setPeriodoKey(e.target.value)}
            className="h-9 px-3 text-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20"
          >
            {periodos.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
      </div>

      {error ? (
        <Card className="flex flex-col items-center text-center gap-3 py-10">
          <AlertCircle className="w-10 h-10 text-[var(--color-danger)]" />
          <h2 className="text-base font-semibold text-[var(--color-text)]">No se pudo cargar el Dashboard</h2>
          <p className="text-sm text-[var(--color-text-muted)] max-w-md">{error}</p>
          <Button variant="outline" className="gap-2" onClick={() => setReload(r => r + 1)}><RefreshCw size={16} /> Reintentar</Button>
        </Card>
      ) : isLoading || !data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <React.Fragment key={i}><SkeletonCard /></React.Fragment>)}</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{[0, 1, 2].map(i => <React.Fragment key={i}><SkeletonCard /></React.Fragment>)}</div>
          <SkeletonCard tall />
        </>
      ) : (
        <>
          {/* Actividad del período */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Órdenes Dispatcher" value={formatQty(data.ordenes)} icon={Truck} tone="info">
              <Delta actual={data.ordenes} previo={data.ordenesPrev} />
            </Kpi>
            <Kpi label="Conciliaciones registradas" value={formatQty(data.concNegocios + data.concMensajeros)} icon={GitMerge} tone="success">
              <p className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                Negocios <strong className="text-[var(--color-text)]">{formatQty(data.concNegocios)}</strong> · Mensajeros <strong className="text-[var(--color-text)]">{formatQty(data.concMensajeros)}</strong>
              </p>
              <Delta actual={data.concNegocios + data.concMensajeros} previo={data.concPrev} />
            </Kpi>
            <Kpi label="Nuevos Negocios" value={formatQty(data.negociosNuevos)} icon={Building2} tone="neutral">
              <p className="text-[11px] text-[var(--color-text-muted)]">Registrados en el período</p>
            </Kpi>
            <Kpi label="Nuevos Mensajeros" value={formatQty(data.mensajerosNuevos)} icon={UserPlus} tone="neutral">
              <p className="text-[11px] text-[var(--color-text-muted)]">Registrados en el período</p>
            </Kpi>
          </div>

          {/* Catálogos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ActivosTotal label="Negocios" icon={Store} activos={data.negociosActivos} total={data.negociosTotal} nuevos={data.negociosNuevos} />
            <ActivosTotal label="Mensajeros" icon={Users} activos={data.mensajerosActivos} total={data.mensajerosTotal} nuevos={data.mensajerosNuevos} />
            <Kpi label="Incidencias Dispatcher" value={formatQty(data.incidencias)} icon={AlertCircle} tone="warning">
              <p className="text-[11px] text-[var(--color-text-muted)]">Total registradas en verificaciones</p>
            </Kpi>
          </div>

          {/* Resumen visual: monto a pagar conciliado */}
          <Card className="space-y-4">
            <div>
              <h2 className="font-semibold text-[var(--color-text)] flex items-center gap-2"><Wallet size={16} className="text-[var(--color-primary)]" /> Resumen visual · Monto a pagar a Negocios y Mensajeros</h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Neto a pagar (CxP − CxC) de las conciliaciones registradas en el período, por semana de registro. Los montos en USD
                (Negocios con vía Transferencia-Exterior) se informan aparte para no mezclar monedas.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Negocios (CUP)', value: formatCurrency(data.pagarNegociosCUP, 'CUP'), dot: '#2a78d6' },
                { label: 'Mensajeros (CUP)', value: formatCurrency(data.pagarMensajeros, 'CUP'), dot: '#eb6834' },
                { label: 'Negocios exterior (USD)', value: formatCurrency(data.pagarNegociosUSD, 'USD') },
                { label: 'A cobrar (CUP)', value: formatCurrency(data.cobrarCUP, 'CUP') },
              ].map(t => (
                <div key={t.label} className="p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                  <p className="text-[11px] font-medium text-[var(--color-text-muted)] flex items-center gap-1.5">
                    {t.dot && <span className="w-2 h-2 rounded-sm" style={{ background: t.dot }} aria-hidden />}{t.label}
                  </p>
                  <p className="text-lg font-bold text-[var(--color-text)] tabular-nums mt-0.5">{t.value}</p>
                </div>
              ))}
            </div>
            <MontoPagarChart semanas={data.semanas} />
          </Card>

          {/* Actividad reciente */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="font-semibold text-[var(--color-text)]">Actividad Reciente</h2>
            </div>
            {data.logs.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <Activity className="w-10 h-10 text-[var(--color-text-faint)] mb-4" />
                <h3 className="text-base font-semibold text-[var(--color-text)]">Sin actividad reciente</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
                  No hay registros en el log de auditoría todavía, o tu rol no tiene permiso para verlos
                  (solo Super Admin y Supervisor).
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {data.logs.map((log) => (
                  <li key={log.log_id} className="px-6 py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <Activity size={16} className="text-[var(--color-text-faint)]" />
                      <span className="font-medium text-[var(--color-text)]">{log.module}</span>
                      <span className="text-[var(--color-text-muted)]">{log.action}</span>
                    </div>
                    <span className="text-xs text-[var(--color-text-faint)] tabular-nums">{formatDatetime(log.occurred_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
