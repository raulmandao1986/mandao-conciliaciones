import React from 'react';
import { ComingSoon } from '../../design-system/patterns/ComingSoon';

// Implementación original respaldada en AreasPage.tsx.bak (usaba src/lib/firebase, migración pendiente a Supabase).
export function AreasPage({ permissions = [] }: { permissions?: string[] }) {
  return <ComingSoon title="Gestión de Áreas y Provincias" />;
}
