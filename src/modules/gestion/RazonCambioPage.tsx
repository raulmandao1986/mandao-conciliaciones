import React from 'react';
import { ComingSoon } from '../../design-system/patterns/ComingSoon';

// Implementación original respaldada en RazonCambioPage.tsx.bak (usaba src/lib/firebase, migración pendiente a Supabase).
export function RazonCambioPage({ permissions = [] }: { permissions?: string[] }) {
  return <ComingSoon title="Razón de Cambio de Referencia" />;
}
