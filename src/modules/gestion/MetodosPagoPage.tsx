import React from 'react';
import { ComingSoon } from '../../design-system/patterns/ComingSoon';

// Implementación original respaldada en MetodosPagoPage.tsx.bak (usaba src/lib/firebase, migración pendiente a Supabase).
export function MetodosPagoPage({ permissions = [], type }: { permissions?: string[]; type?: 'negocios' | 'mensajeros' | 'ordenes' }) {
  return <ComingSoon title="Métodos de Pago" />;
}
