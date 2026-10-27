import type React from 'react';
import {
  LayoutDashboard,
  Send,
  GitMerge,
  FileText,
  CreditCard,
  Receipt,
  CalendarClock,
  Building2,
  Users,
  Settings,
  MapPin,
  DollarSign,
  Percent,
  FileSpreadsheet,
  ListChecks,
  Layers,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  subItems?: { id: string; label: string }[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

// Fuente única de verdad de la navegación del sistema: AppShell.tsx la usa
// para armar el menú lateral, y RolesUsuariosPage.tsx (pestaña "Roles") la
// usa para ofrecer, como etiquetas, todos los módulos/accesos que existen
// y que un Rol de Acceso puede marcar o desmarcar. Agregar un módulo nuevo
// aquí lo hace aparecer automáticamente en ambos lugares.
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'General',
    items: [
      { id: 'dashboard', label: 'Dashboard General', icon: LayoutDashboard },
      {
        id: 'dispatcher',
        label: 'Dispatcher',
        icon: Send,
        subItems: [
          { id: 'dispatcher-verificacion', label: 'Verificación' },
          { id: 'dispatcher-revision', label: 'Revisión' },
        ]
      },
      {
        id: 'disponibilidad',
        label: 'Disponibilidad',
        icon: CalendarClock,
        subItems: [
          { id: 'disponibilidad-verificacion', label: 'Verificación' },
          { id: 'disponibilidad-revision', label: 'Revisión' },
        ]
      },
    ]
  },
  {
    title: 'Módulo Negocios',
    items: [
      { id: 'dashboard-negocio', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'conciliacion-negocio', label: 'Conciliación', icon: GitMerge },
      { id: 'facturacion-negocio', label: 'Facturación', icon: FileText },
      { id: 'cuentas-pagar-negocio', label: 'Cuentas por Pagar', icon: CreditCard },
      { id: 'cuentas-cobrar-negocio', label: 'Cuentas por Cobrar', icon: Receipt },
      { id: 'planificacion-pagos-negocio', label: 'Planificación Pagos', icon: CalendarClock },
      { id: 'gestion-negocios', label: 'Gestión de Negocios', icon: Building2 },
    ]
  },
  {
    title: 'Módulo Mensajeros',
    items: [
      { id: 'dashboard-mensajero', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'conciliacion-mensajero', label: 'Conciliación', icon: GitMerge },
      { id: 'facturacion-mensajero', label: 'Facturación', icon: FileText },
      { id: 'cuentas-pagar-mensajero', label: 'Cuentas por Pagar', icon: CreditCard },
      { id: 'cuentas-cobrar-mensajero', label: 'Cuentas por Cobrar', icon: Receipt },
      { id: 'planificacion-pagos-mensajero', label: 'Planificación Pagos', icon: CalendarClock },
      { id: 'gestion-mensajeros', label: 'Gestión de Mensajeros', icon: Users },
    ]
  },
  {
    title: 'Configuración',
    items: [
      { id: 'roles-usuarios', label: 'Roles y Usuarios', icon: Settings },
      { id: 'areas', label: 'Áreas', icon: MapPin },
      {
        id: 'metodos-pago',
        label: 'Métodos de Pago',
        icon: CreditCard,
        subItems: [
          { id: 'metodos-pago-negocios', label: 'Negocios' },
          { id: 'metodos-pago-mensajeros', label: 'Mensajeros' },
          { id: 'metodos-pago-ordenes', label: 'Órdenes' },
        ]
      },
      {
        id: 'tipologia-pago',
        label: 'Tipología de Pago',
        icon: Layers,
        subItems: [
          { id: 'tipologia-cobrar', label: 'Cuentas por Cobrar' },
          { id: 'tipologia-pagar', label: 'Cuentas por Pagar' },
          { id: 'grupos-pago', label: 'Grupos de Pago' },
        ]
      },
      { id: 'razon-cambio', label: 'Razón de Cambio', icon: DollarSign },
      { id: 'comision-mandao', label: 'Comisión Mandao', icon: Percent },
      {
        id: 'reglas',
        label: 'Reglas',
        icon: ListChecks,
        subItems: [
          { id: 'reglas-negocios', label: 'Negocios' },
          { id: 'reglas-mensajeros', label: 'Mensajeros' },
        ]
      },
      { id: 'documentos-importacion', label: 'Data', icon: FileSpreadsheet },
      { id: 'config-logs', label: 'Log', icon: FileText },
    ]
  }
];

export interface ModuleCatalogEntry {
  id: string;
  label: string;
  section: string;
}

// Versión "plana" de NAV_SECTIONS: un renglón por cada ítem navegable
// (los que tienen subItems no son navegables por sí mismos, solo agrupan).
export const MODULE_CATALOG: ModuleCatalogEntry[] = NAV_SECTIONS.flatMap(section =>
  section.items.flatMap(item =>
    item.subItems
      ? item.subItems.map(sub => ({ id: sub.id, label: `${item.label} · ${sub.label}`, section: section.title }))
      : [{ id: item.id, label: item.label, section: section.title }]
  )
);
