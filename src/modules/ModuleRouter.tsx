import React, { Suspense, lazy } from 'react';
import { Dashboard } from './dashboard/Dashboard';
import { VerificationPage } from './dispatcher/VerificationPage';
import { RevisionPage } from './dispatcher/RevisionPage';
import { DisponibilidadVerificationPage } from './disponibilidad/DisponibilidadVerificationPage';
import { DisponibilidadRevisionPage } from './disponibilidad/DisponibilidadRevisionPage';
import { StatusBadge } from '../design-system/primitives/StatusBadge';
import { Package } from 'lucide-react';

import { useAuth } from '../lib/auth';

// Módulos fuera de alcance de esta fase de migración (decisión #3 del
// plan): todavía usan Firestore/'../../lib/firebase' internamente, por
// lo que no compilan/ejecutan hasta que se reconstruyan desde cero en
// su propia fase. Se cargan de forma perezosa (React.lazy) para que un
// fallo de resolución de módulo en uno de ellos no tumbe el resto de la
// app (Dispatcher/Disponibilidad) al cargar.
const ConciliacionPage = lazy(() => import('./conciliacion/ConciliacionPage').then(m => ({ default: m.ConciliacionPage })));
const FacturacionPage = lazy(() => import('./conciliacion/FacturacionPage').then(m => ({ default: m.FacturacionPage })));
const CuentasPagarPage = lazy(() => import('./conciliacion/CuentasPagarPage').then(m => ({ default: m.CuentasPagarPage })));
const CuentasCobrarPage = lazy(() => import('./conciliacion/CuentasCobrarPage').then(m => ({ default: m.CuentasCobrarPage })));
const PlanificacionPagosPage = lazy(() => import('./conciliacion/PlanificacionPagosPage').then(m => ({ default: m.PlanificacionPagosPage })));
const GestionNegociosPage = lazy(() => import('./gestion/GestionNegociosPage').then(m => ({ default: m.GestionNegociosPage })));
const GestionMensajerosPage = lazy(() => import('./gestion/GestionMensajerosPage').then(m => ({ default: m.GestionMensajerosPage })));
const RolesUsuariosPage = lazy(() => import('./gestion/RolesUsuariosPage').then(m => ({ default: m.RolesUsuariosPage })));
const AreasPage = lazy(() => import('./gestion/AreasPage').then(m => ({ default: m.AreasPage })));
const MetodosPagoPage = lazy(() => import('./gestion/MetodosPagoPage').then(m => ({ default: m.MetodosPagoPage })));
const RazonCambioPage = lazy(() => import('./gestion/RazonCambioPage').then(m => ({ default: m.RazonCambioPage })));
const LogsAuditoriaPage = lazy(() => import('./gestion/LogsAuditoriaPage').then(m => ({ default: m.LogsAuditoriaPage })));

interface ModuleRouterProps {
  activeTab: string;
  userRole?: string;
  permissions?: string[];
}

export function ModuleRouter({ activeTab }: ModuleRouterProps) {
  const { user } = useAuth();
  const permissions: string[] = user?.role === 'super_admin' ? ['all'] : [];
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--color-text-muted)]">Cargando módulo…</div>}>
      {renderModule(activeTab, permissions)}
    </Suspense>
  );
}

function renderModule(activeTab: string, permissions: string[]) {
  switch (activeTab) {
    case 'dashboard':
    case 'dashboard-negocio':
    case 'dashboard-mensajero':
      return <Dashboard />;
    case 'dispatcher-verificacion':
      return <VerificationPage />;
    case 'dispatcher-revision':
      return <RevisionPage />;
    case 'disponibilidad-verificacion':
      return <DisponibilidadVerificationPage />;
    case 'disponibilidad-revision':
      return <DisponibilidadRevisionPage />;
    case 'conciliacion':
    case 'conciliacion-negocio':
    case 'conciliacion-mensajero':
      return <ConciliacionPage />;
    case 'facturacion-negocio':
    case 'facturacion-mensajero':
      return <FacturacionPage />;
    case 'cuentas-pagar-negocio':
    case 'cuentas-pagar-mensajero':
      return <CuentasPagarPage />;
    case 'cuentas-cobrar-negocio':
    case 'cuentas-cobrar-mensajero':
      return <CuentasCobrarPage />;
    case 'planificacion-pagos-negocio':
    case 'planificacion-pagos-mensajero':
      return <PlanificacionPagosPage />;
    case 'gestion-negocios':
      return <GestionNegociosPage permissions={permissions} />;
    case 'gestion-mensajeros':
      return <GestionMensajerosPage permissions={permissions} />;
    case 'roles-usuarios':
      return <RolesUsuariosPage permissions={permissions} />;
    case 'areas':
      return <AreasPage />;
    case 'metodos-pago':
    case 'metodos-pago-negocios':
      return <MetodosPagoPage permissions={permissions} type="negocios" />;
    case 'metodos-pago-mensajeros':
      return <MetodosPagoPage permissions={permissions} type="mensajeros" />;
    case 'metodos-pago-ordenes':
      return <MetodosPagoPage permissions={permissions} type="ordenes" />;
    case 'razon-cambio':
      return <RazonCambioPage permissions={permissions} />;
    case 'config-logs':
      return <LogsAuditoriaPage permissions={permissions} />;
    default:
      return (
        <div className="flex flex-col items-center justify-center py-20 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]">
          <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-6">
            <Package className="w-8 h-8 text-[var(--color-text-faint)]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Módulo en Desarrollo</h2>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-sm text-center">
            Estamos trabajando en la implementación del módulo <span className="font-semibold text-[var(--color-text)] uppercase">{activeTab.replace('-', ' ')}</span>.
          </p>
          <div className="mt-8">
             <StatusBadge status="borrador" />
          </div>
        </div>
      );
  }
}
