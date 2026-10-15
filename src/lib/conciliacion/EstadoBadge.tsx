import React from 'react';
import { cn } from '../utils';
import { ESTADO_CONCILIACION_CONFIG, EstadoConciliacion } from './paymentBuckets';

export function EstadoConciliacionBadge({ estado }: { estado: string | null }) {
  const config = ESTADO_CONCILIACION_CONFIG[(estado || 'Nuevo') as EstadoConciliacion] || ESTADO_CONCILIACION_CONFIG.Nuevo;
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border', config.className)}>
      {config.label}
    </span>
  );
}
