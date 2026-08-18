import { TrendingUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { motion } from 'motion/react';

export function Dashboard() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text)]">Dashboard Operativo</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Resumen general de conciliaciones y estados de cuenta.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pendientes', value: '$12,450.00', icon: Clock, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning-bg)]' },
          { label: 'Conciliados', value: '$84,200.00', icon: CheckCircle2, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-bg)]' },
          { label: 'Discrepancias', value: '4', icon: AlertCircle, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-bg)]' },
          { label: 'Efectividad', value: '98.2%', icon: TrendingUp, color: 'text-[var(--color-info)]', bg: 'bg-[var(--color-info-bg)]' },
        ].map((kpi, i) => (
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
                <p className="text-2xl font-bold text-[var(--color-text)] mt-1 tabular-nums">{kpi.value}</p>
              </div>
              <div className={`p-2.5 rounded-[var(--radius-sm)] ${kpi.bg}`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-1.5 font-medium text-xs text-[var(--color-success)]">
              <TrendingUp size={12} />
              <span>+12.5% vs mes anterior</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Recent Activity / Empty State Pattern Demo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--color-text)]">Últimas Conciliaciones</h2>
            <button className="text-sm font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">Ver todas</button>
          </div>
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-4">
              <GitMerge className="w-8 h-8 text-[var(--color-text-faint)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">Sin movimientos recientes</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
              No se han detectado nuevos movimientos bancarios para conciliar en las últimas 24 horas.
            </p>
            <button className="mt-6 h-10 px-5 bg-[var(--color-brand)] text-[var(--color-brand-ink)] font-semibold rounded-[var(--radius-sm)] hover:bg-[var(--color-brand-dark)] transition-colors inline-flex items-center gap-2">
              <TrendingUp size={18} />
              Sincronizar ahora
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-5">
            <h2 className="font-semibold text-[var(--color-text)] mb-4">Estado de Sistemas</h2>
            <div className="space-y-4">
              {[
                { name: 'Mandao Finance', status: 'online' },
                { name: 'Inventario', status: 'online' },
              ].map((sys) => (
                <div key={sys.name} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-muted)]">{sys.name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${sys.status === 'online' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                      {sys.status}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${sys.status === 'online' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-warning)]'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GitMerge(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 9v12" />
      <path d="M21 3v12" />
      <path d="M21 3c0 2.2-1.8 4-4 4h-1c-2.2 0-4 1.8-4 4v10" />
    </svg>
  );
}
