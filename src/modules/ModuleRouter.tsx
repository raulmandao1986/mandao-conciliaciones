import React from 'react';
import { Dashboard } from './dashboard/Dashboard';
import { ConciliacionPage } from './conciliacion/ConciliacionPage';
import { FacturacionPage } from './conciliacion/FacturacionPage';
import { CuentasPagarPage } from './conciliacion/CuentasPagarPage';
import { CuentasCobrarPage } from './conciliacion/CuentasCobrarPage';
import { PlanificacionPagosPage } from './conciliacion/PlanificacionPagosPage';
import { GestionNegociosPage } from './gestion/GestionNegociosPage';
import { GestionMensajerosPage } from './gestion/GestionMensajerosPage';
import { RolesUsuariosPage } from './gestion/RolesUsuariosPage';
import { AreasPage } from './gestion/AreasPage';
import { MetodosPagoPage } from './gestion/MetodosPagoPage';
import { RazonCambioPage } from './gestion/RazonCambioPage';
import { LogsAuditoriaPage } from './gestion/LogsAuditoriaPage';
import { VerificationPage } from './dispatcher/VerificationPage';
import { RevisionPage } from './dispatcher/RevisionPage';
import { DisponibilidadVerificationPage } from './disponibilidad/DisponibilidadVerificationPage';
import { DisponibilidadRevisionPage } from './disponibilidad/DisponibilidadRevisionPage';
import { StatusBadge } from '../design-system/primitives/StatusBadge';
import { Package } from 'lucide-react';

import { useAuth } from '../lib/auth';

interface ModuleRouterProps {
  activeTab: string;
  userRole?: string;
  permissions?: string[];
}

export function ModuleRouter({ activeTab }: ModuleRouterProps) {
  const { permissions = [] } = useAuth();
  switch (activeTab) {
    case 'dashboard':
    case 'dashboard-negocio':
    case 'dashboard-mensajero':
      return <Dashboard />;
    case 'dispatcher-verificacion':
      return <VerificationPage permissions={permissions} />;
    case 'dispatcher-revision':
      return <RevisionPage permissions={permissions} />;
    case 'disponibilidad-verificacion':
      return <DisponibilidadVerificationPage permissions={permissions} />;
    case 'disponibilidad-revision':
      return <DisponibilidadRevisionPage permissions={permissions} />;
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
      return <AreasPage permissions={permissions} />;
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
