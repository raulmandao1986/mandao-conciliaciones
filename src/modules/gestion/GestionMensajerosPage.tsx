import React from 'react';
import { ComingSoon } from '../../design-system/patterns/ComingSoon';

// Implementación original respaldada en GestionMensajerosPage.tsx.bak (usaba src/lib/firebase, migración pendiente a Supabase).
export function GestionMensajerosPage({ permissions = [] }: { permissions?: string[] }) {
  return <ComingSoon title="Gestión de Mensajeros" />;
}
