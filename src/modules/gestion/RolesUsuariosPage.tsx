import React from 'react';
import { ComingSoon } from '../../design-system/patterns/ComingSoon';

// Implementación original respaldada en RolesUsuariosPage.tsx.bak (usaba src/lib/firebase, migración pendiente a Supabase).
export function RolesUsuariosPage({ permissions = [] }: { permissions?: string[] }) {
  return <ComingSoon title="Control de Accesos" />;
}
