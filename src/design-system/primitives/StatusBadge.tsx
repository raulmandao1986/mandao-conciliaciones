import { cn } from '../../lib/utils';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  XCircle, 
  FileEdit, 
  CircleDashed, 
  BadgeCheck, 
  AlertTriangle, 
  AlertOctagon,
  Lock
} from 'lucide-react';

export type StatusType = 
  | 'borrador' 
  | 'pendiente' 
  | 'aprobado' 
  | 'parcial' 
  | 'pagado' 
  | 'por_vencer' 
  | 'vencido' 
  | 'cancelado' 
  | 'bloqueado'
  | 'activo'
  | 'stock_bajo'
  | 'agotado';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; icon: any; color: string; bg: string }> = {
  borrador: { label: 'Borrador', icon: FileEdit, color: 'text-[var(--color-info)]', bg: 'bg-[var(--color-info-bg)]' },
  pendiente: { label: 'Pendiente', icon: Clock, color: 'text-[var(--color-text-faint)]', bg: 'bg-[var(--color-neutral-bg)]' },
  aprobado: { label: 'Aprobado', icon: CheckCircle2, color: 'text-[var(--color-info)]', bg: 'bg-[var(--color-info-bg)]' },
  parcial: { label: 'Pago parcial', icon: CircleDashed, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning-bg)]' },
  pagado: { label: 'Pagado', icon: BadgeCheck, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-bg)]' },
  por_vencer: { label: 'Por vencer', icon: AlertTriangle, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning-bg)]' },
  vencido: { label: 'Vencido', icon: AlertOctagon, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-bg)]' },
  cancelado: { label: 'Cancelado', icon: XCircle, color: 'text-[var(--color-text-faint)]', bg: 'bg-[var(--color-neutral-bg)]' },
  bloqueado: { label: 'Bloqueado', icon: Lock, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-bg)]' },
  activo: { label: 'Activo', icon: CheckCircle2, color: 'text-[var(--color-success)]', bg: 'bg-[var(--color-success-bg)]' },
  stock_bajo: { label: 'Stock bajo', icon: AlertTriangle, color: 'text-[var(--color-warning)]', bg: 'bg-[var(--color-warning-bg)]' },
  agotado: { label: 'Agotado', icon: AlertOctagon, color: 'text-[var(--color-danger)]', bg: 'bg-[var(--color-danger-bg)]' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap leading-none",
      config.bg,
      config.color,
      className
    )}>
      <Icon size={14} className="shrink-0" />
      <span>{config.label}</span>
    </div>
  );
}
