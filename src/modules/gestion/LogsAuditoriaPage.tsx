import React from 'react';
import { ComingSoon } from '../../design-system/patterns/ComingSoon';

// Implementación original respaldada en LogsAuditoriaPage.tsx.bak (usaba src/lib/firebase, migración pendiente a Supabase).
export function LogsAuditoriaPage({ permissions = [] }: { permissions?: string[] }) {
  return <ComingSoon title="Logs de Auditoría" />;
}
