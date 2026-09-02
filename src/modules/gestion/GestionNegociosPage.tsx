import React from 'react';
import { ComingSoon } from '../../design-system/patterns/ComingSoon';

// Implementación original respaldada en GestionNegociosPage.tsx.bak (usaba src/lib/firebase, migración pendiente a Supabase).
export function GestionNegociosPage({ permissions = [] }: { permissions?: string[] }) {
  return <ComingSoon title="Gestión de Negocios" />;
}
