import React, { useCallback, useRef, useState } from 'react';
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

// Progreso paso a paso de un proceso de Conciliación (Calcular / Conciliar,
// Individual y Masiva) — pedido por el usuario 2026-10-07.

export type StepStatus = 'pending' | 'running' | 'done' | 'warning' | 'error';

export interface ProcessStep {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export function useProcessSteps() {
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const startRef = useRef(0);

  const start = useCallback((defs: { key: string; label: string }[]) => {
    startRef.current = performance.now();
    setElapsedMs(null);
    setSteps(defs.map(d => ({ ...d, status: 'pending' as const })));
  }, []);

  const update = useCallback((key: string, status: StepStatus, detail?: string) => {
    setSteps(prev => prev.map(s => (s.key === key ? { ...s, status, detail: detail ?? s.detail } : s)));
  }, []);

  // Marca el fin: los pasos que quedaron pendientes/en curso pasan a error
  // si el proceso falló, o se dejan como están si terminó bien.
  const finish = useCallback((failed = false) => {
    setElapsedMs(performance.now() - startRef.current);
    if (failed) {
      setSteps(prev => prev.map(s => (s.status === 'running' ? { ...s, status: 'error' } : s)));
    }
  }, []);

  const reset = useCallback(() => {
    setSteps([]);
    setElapsedMs(null);
  }, []);

  return { steps, elapsedMs, start, update, finish, reset };
}

const ICON: Record<StepStatus, React.ReactNode> = {
  pending: <Circle size={16} className="text-slate-300" />,
  running: <Loader2 size={16} className="animate-spin text-[var(--color-primary)]" />,
  done: <CheckCircle2 size={16} className="text-[var(--color-success)]" />,
  warning: <AlertTriangle size={16} className="text-[var(--color-warning)]" />,
  error: <XCircle size={16} className="text-[var(--color-danger)]" />,
};

export function ProcesoProgreso({
  title, steps, elapsedMs, className, children,
}: {
  title: string;
  steps: ProcessStep[];
  elapsedMs: number | null;
  className?: string;
  children?: React.ReactNode; // resultado final / acciones
}) {
  if (steps.length === 0) return null;
  const finished = steps.filter(s => s.status === 'done' || s.status === 'warning').length;
  const failed = steps.some(s => s.status === 'error');
  const pct = Math.round((finished / steps.length) * 100);
  const terminado = elapsedMs !== null;

  return (
    <div className={cn('bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-4 space-y-3', className)} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[var(--color-text)]">{title}</span>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
          {terminado
            ? `${failed ? 'Detenido' : 'Completado'} en ${(elapsedMs! / 1000).toLocaleString('es-VE', { maximumFractionDigits: 1 })} s`
            : `${pct}%`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-3)] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', failed ? 'bg-[var(--color-danger)]' : 'bg-[var(--color-primary)]')}
          style={{ width: `${terminado && !failed ? 100 : pct}%` }}
        />
      </div>
      <ol className="space-y-2">
        {steps.map(s => (
          <li key={s.key} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">{ICON[s.status]}</span>
            <div className="min-w-0">
              <span className={cn('text-sm', s.status === 'pending' ? 'text-slate-400' : 'text-[var(--color-text)] font-medium')}>{s.label}</span>
              {s.detail && <span className="block text-xs text-[var(--color-text-muted)] tabular-nums">{s.detail}</span>}
            </div>
          </li>
        ))}
      </ol>
      {children}
    </div>
  );
}

// Envuelve una promesa marcando su paso como "en curso" y luego "listo"
// (con el detalle que devuelva `detail`), o "error" si falla.
export async function trackStep<T>(
  update: (key: string, status: StepStatus, detail?: string) => void,
  key: string,
  promise: Promise<T>,
  detail?: (value: T) => string
): Promise<T> {
  update(key, 'running');
  try {
    const value = await promise;
    update(key, 'done', detail ? detail(value) : undefined);
    return value;
  } catch (err) {
    update(key, 'error', (err as any)?.message);
    throw err;
  }
}
