import { useEffect, useState } from 'react';
import { AlertCircle, Store, Truck, Users, Activity, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { formatDatetime, formatQty } from '../../lib/formatters';

interface DashboardStats {
  dispatcherOrdersThisMonth: number;
  dispatcherIncidentsTotal: number;
  activeBusinesses: number;
  activeMessengers: number;
}

interface AuditLogEntry {
  log_id: string;
  module: string;
  action: string;
  occurred_at: string;
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const toISODate = (d: Date) => d.toISOString().split('T')[0];
  return { start: toISODate(start), end: toISODate(end) };
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { start, end } = currentMonthRange();

      const [ordersRes, incidentsRes, businessesRes, messengersRes, logsRes] = await Promise.all([
        supabase
          .from('dispatcher')
          .select('order_pk', { count: 'exact', head: true })
          .gte('delivery_date', start)
          .lt('delivery_date', end),
        supabase
          .from('dispatcher_incidents')
          .select('incident_id', { count: 'exact', head: true }),
        supabase
          .from('businesses')
          .select('business_id', { count: 'exact', head: true })
          .eq('active', true),
        supabase
          .from('messengers')
          .select('messenger_id', { count: 'exact', head: true })
          .eq('active', true),
        supabase
          .from('audit_logs')
          .select('log_id, module, action, occurred_at')
          .order('occurred_at', { ascending: false })
          .limit(6),
      ]);

      if (cancelled) return;

      setStats({
        dispatcherOrdersThisMonth: ordersRes.count ?? 0,
        dispatcherIncidentsTotal: incidentsRes.count ?? 0,
        activeBusinesses: businessesRes.count ?? 0,
        activeMessengers: messengersRes.count ?? 0,
      });
      setRecentLogs(logsRes.data ?? []);
      setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpis = [
    {
      label: 'Órdenes Dispatcher (mes)',
      value: stats ? formatQty(stats.dispatcherOrdersThisMonth) : '—',
      icon: Truck,
      color: 'text-[var(--color-info)]',
      bg: 'bg-[var(--color-info-bg)]',
    },
    {
      label: 'Incidencias Dispatcher',
      value: stats ? formatQty(stats.dispatcherIncidentsTotal) : '—',
      icon: AlertCircle,
      color: 'text-[var(--color-danger)]',
      bg: 'bg-[var(--color-danger-bg)]',
    },
    {
      label: 'Negocios Activos',
      value: stats ? formatQty(stats.activeBusinesses) : '—',
      icon: Store,
      color: 'text-[var(--color-success)]',
      bg: 'bg-[var(--color-success-bg)]',
    },
    {
      label: 'Mensajeros Activos',
      value: stats ? formatQty(stats.activeMessengers) : '—',
      icon: Users,
      color: 'text-[var(--color-warning)]',
      bg: 'bg-[var(--color-warning-bg)]',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Dashboard Operativo</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Resumen general de Dispatcher, Disponibilidad y catálogos activos.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">{kpi.label}</p>
                <p className="text-2xl font-bold text-[var(--color-text)] mt-1 tabular-nums">
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-faint)]" /> : kpi.value}
                </p>
              </div>
              <div className={`p-2.5 rounded-[var(--radius-sm)] ${kpi.bg}`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-text)]">Actividad Reciente</h2>
          </div>

          {isLoading ? (
            <div className="p-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-faint)]" />
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="p-12 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-4">
                <Activity className="w-8 h-8 text-[var(--color-text-faint)]" />
              </div>
              <h3 className="text-base font-semibold text-[var(--color-text)]">Sin actividad reciente</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
                No hay registros en el log de auditoría todavía, o tu rol no tiene permiso para verlos
                (solo Super Admin y Supervisor).
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {recentLogs.map((log) => (
                <li key={log.log_id} className="px-6 py-3 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <Activity size={16} className="text-[var(--color-text-faint)]" />
                    <span className="font-medium text-[var(--color-text)]">{log.module}</span>
                    <span className="text-[var(--color-text-muted)]">{log.action}</span>
                  </div>
                  <span className="text-xs text-[var(--color-text-faint)] tabular-nums">
                    {formatDatetime(log.occurred_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
