import React, { useState, useEffect } from 'react';
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
  ChevronRight,
  LogOut,
  ExternalLink,
  Package,
  Menu,
  X,
  Settings,
  Loader2,
  MapPin,
  DollarSign,
  Shield,
  Info,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, UserRole } from '../lib/auth';
import { cn } from '../lib/utils';
import { Button } from '../design-system/primitives/Button';
import { SlideOver } from '../design-system/primitives/SlideOver';

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  subItems?: { id: string; label: string }[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
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
      { id: 'razon-cambio', label: 'Razón de Cambio', icon: DollarSign },
      { id: 'documentos-importacion', label: 'Documentos de Importación', icon: FileSpreadsheet },
      { id: 'config-logs', label: 'Log', icon: FileText },
    ]
  }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading, logout, reloadPermissions } = useAuth();
  // NOTA DE MIGRACIÓN: se eliminó el modelo de permisos por string libre
  // ('dispatcher-negocio', 'roles-usuarios:...', etc.) que venía de Firestore.
  // Ahora solo existen 4 roles fijos (super_admin/supervisor/operador/visitante),
  // ver src/lib/auth.tsx. Los módulos fuera del alcance de esta migración
  // (Negocios, Mensajeros, Gestión, etc.) quedan visibles para super_admin/
  // supervisor sin gating fino todavía — se cerrará cuando esas fases se
  // implementen (decisión de alcance confirmada por el usuario).
  const activeModules = { negocios: true, mensajeros: true };
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('active_tab') || 'dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [activeDebugTab, setActiveDebugTab] = useState<'diagnostico' | 'instrucciones'>('diagnostico');
  const [testPermissionString, setTestPermissionString] = useState('');

  useEffect(() => {
    localStorage.setItem('active_tab', activeTab);
  }, [activeTab]);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['dispatcher', 'disponibilidad']);

  const hasPermission = (itemId: string) => {
    if (!user) return false;
    if (user.role === 'super_admin') {
      return true;
    }
    if (itemId === 'areas' || itemId === 'metodos-pago' || itemId === 'metodos-pago-negocios' || itemId === 'metodos-pago-mensajeros' || itemId === 'metodos-pago-ordenes' || itemId === 'razon-cambio' || itemId === 'config-logs') {
      // Catálogos de gestión — fuera del alcance de esta migración por
      // ahora; visibles para supervisor mientras se construye esa fase.
      const allowed = user.role === 'supervisor';
      return allowed;
    }
    if (itemId === 'dispatcher-verificacion' || itemId === 'dispatcher-revision' || itemId === 'disponibilidad-verificacion' || itemId === 'disponibilidad-revision') {
      // En alcance: visibles para los 4 roles. Lo que cada rol puede
      // EJECUTAR dentro de la página (verificar/importar) se controla
      // con ROLE_CAN_VERIFY/ROLE_CAN_IMPORT + las políticas RLS de
      // Supabase, no ocultando el ítem del menú.
      const allowed = true;
      return allowed;
    }
    // Cualquier otro ítem (Negocios, Mensajeros, roles-usuarios, etc.):
    // fuera del alcance de esta migración, visible solo para supervisor.
    return user.role === 'supervisor';
  };

  const toggleMenu = (id: string) => {
    setExpandedMenus(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const filteredSections = NAV_SECTIONS.map(section => {
    if (section.title === 'Módulo Negocios' && !activeModules.negocios) {
      return { ...section, items: [] };
    }
    if (section.title === 'Módulo Mensajeros' && !activeModules.mensajeros) {
      return { ...section, items: [] };
    }
    return {
      ...section,
      items: section.items.filter(item => {
        // If item has subitems, check if user has permission for ANY subitem
        if (item.subItems) {
          return item.subItems.some(sub => hasPermission(sub.id));
        }
        return hasPermission(item.id);
      })
    };
  }).filter(section => section.items.length > 0);

  const allItems = NAV_SECTIONS.flatMap(s => [
    ...s.items,
    ...(s.items.flatMap(i => i.subItems || []))
  ]);

  const handleLogout = async () => {
    try {
      localStorage.removeItem('active_tab');
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="h-dvh w-full flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-brand)] flex items-center justify-center animate-pulse">
             <span className="font-bold text-[var(--color-brand-ink)] text-xl">M</span>
          </div>
          <p className="text-sm font-medium text-[var(--color-text-muted)] animate-pulse">
            Configurando accesos Mandao...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="grid h-dvh overflow-hidden w-full bg-[var(--color-bg)]"
      style={{ 
        gridTemplateColumns: isSidebarOpen ? "260px 1fr" : "80px 1fr",
        gridTemplateRows: "auto 1fr",
        transition: 'grid-template-columns 0.2s ease-in-out'
      }}
    >
      {/* Sidebar */}
      <aside className="row-span-2 bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.02)] relative z-20">
        <div className="h-16 flex items-center px-6 border-b border-[var(--color-border)] shrink-0">
          <div className="w-8 h-8 rounded bg-[var(--color-brand)] flex items-center justify-center shrink-0 shadow-sm">
            <span className="font-bold text-[var(--color-brand-ink)]">M</span>
          </div>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.span 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="ml-3 font-semibold text-lg whitespace-nowrap text-[var(--color-text)] tracking-tight"
              >
                Conciliaciones
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 overflow-y-auto pt-4 pb-4 px-3 space-y-6 overscroll-contain custom-scrollbar">
          {filteredSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className={cn("px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]", !isSidebarOpen && "hidden")}>
                {section.title}
              </div>
              
              {section.items.map((item) => {
                const isActive = activeTab === item.id || (item.subItems?.some(sub => activeTab === sub.id));
                const isExpanded = expandedMenus.includes(item.id);
                
                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      onClick={() => {
                        if (item.subItems) {
                          toggleMenu(item.id);
                        } else {
                          setActiveTab(item.id);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center px-3 h-10 rounded-[var(--radius-sm)] transition-all group relative overflow-hidden",
                        isActive && !item.subItems
                          ? "bg-[var(--color-brand-active)] text-[var(--color-brand-ink)] font-semibold" 
                          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                      )}
                    >
                      {isActive && !item.subItems && (
                        <motion.div 
                          layoutId="active-nav-indicator"
                          className="absolute left-0 w-1 h-6 bg-[var(--color-brand-active-border)] rounded-r-full"
                        />
                      )}
                      <item.icon className={cn("w-5 h-5 shrink-0 transition-colors", isActive ? "text-[var(--color-brand-ink)]" : "text-[var(--color-text-faint)] group-hover:text-[var(--color-text)]")} />
                      <AnimatePresence>
                        {isSidebarOpen && (
                          <motion.span 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="ml-3 text-sm truncate flex-1 text-left"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {isSidebarOpen && item.subItems && (
                        <ChevronRight className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-90")} />
                      )}
                    </button>

                    {item.subItems && isExpanded && isSidebarOpen && (
                      <div className="ml-4 pl-4 border-l border-[var(--color-border)] space-y-1 mt-1">
                        {item.subItems.map(sub => {
                          const isSubActive = activeTab === sub.id;
                          if (!hasPermission(sub.id)) return null;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => setActiveTab(sub.id)}
                              className={cn(
                                "w-full flex items-center px-3 h-8 rounded-[var(--radius-sm)] transition-all text-xs relative",
                                isSubActive
                                  ? "text-[var(--color-primary)] font-bold bg-teal-50"
                                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
                              )}
                            >
                              {isSubActive && (
                                <motion.div 
                                  layoutId="active-sub-indicator"
                                  className="absolute left-0 w-0.5 h-3 bg-[var(--color-primary)] rounded-full"
                                />
                              )}
                              {sub.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="pt-4 mt-6 border-t border-[var(--color-border)]">
             <p className={cn("px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-faint)]", !isSidebarOpen && "hidden")}>Otros Sistemas</p>
             <a 
              href="#"
              className="flex items-center px-3 h-10 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] group"
             >
                <Package className="w-5 h-5 shrink-0 text-[var(--color-text-faint)] group-hover:text-[var(--color-text)]" />
                {isSidebarOpen && <span className="ml-3 text-sm">Inventario</span>}
                {isSidebarOpen && <ExternalLink className="ml-auto w-3 h-3 opacity-0 group-hover:opacity-100" />}
             </a>
          </div>
        </nav>

        <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/50">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isSidebarOpen && <span className="ml-3">Cerrar Sesión</span>}
          </Button>
        </div>
      </aside>

      {/* Topbar */}
      <header className="h-16 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-[var(--color-surface-3)] rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors active:scale-95"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-text-faint)] hidden sm:block">Mandao Finance</span>
            <ChevronRight size={14} className="text-[var(--color-text-faint)] hidden sm:block" />
            <span className="text-[var(--color-text-faint)]">Conciliaciones</span>
            <ChevronRight size={14} className="text-[var(--color-text-faint)]" />
            <span className="font-semibold text-[var(--color-text)] capitalize">
              {allItems.find(i => i.id === activeTab)?.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => { setActiveDebugTab('instrucciones'); setIsDebugOpen(true); }}
            className="p-2 hover:bg-[var(--color-surface-3)] rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all active:scale-95 flex items-center gap-1.5 border border-[var(--color-border)] shadow-sm bg-white"
            title="Instrucciones y Ajustes del Sistema"
          >
            <Settings size={16} />
            <span className="text-xs font-semibold hidden md:inline">Instrucciones</span>
          </button>

          <div className="flex items-center gap-3 pl-4 border-l border-[var(--color-border)]">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-[var(--color-text)] leading-none">{user?.name}</p>
              <div className="mt-1 flex items-center justify-end">
                <p className="text-[10px] text-[var(--color-brand-ink)] font-bold bg-[var(--color-brand)] px-1.5 py-0.5 rounded uppercase tracking-wider inline-block">
                  {user?.role}
                </p>
              </div>
            </div>
            <div className="w-9 h-9 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-ink)] font-bold border-2 border-[var(--color-surface)] shadow-sm cursor-pointer hover:ring-2 hover:ring-[var(--color-brand)] transition-all">
              {user?.name.charAt(0)}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="overflow-y-auto overscroll-contain bg-[var(--color-bg)]">
        <div className="p-6">
          <motion.div
            key={activeTab + user?.role}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-7xl mx-auto"
          >
            {React.cloneElement(children as React.ReactElement, { activeTab, userRole: user?.role })}
          </motion.div>
        </div>
      </main>

      {/* ACCESS DIAGNOSTICS SLIDEOVER */}
      <SlideOver
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        title={activeDebugTab === 'diagnostico' ? "🕵️ Diagnóstico de Accesos y Permisos" : "📖 Guía del Ecosistema Mandao"}
        footer={
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={() => setIsDebugOpen(false)}>Cerrar</Button>
            {activeDebugTab === 'diagnostico' && (
              <Button 
                variant="brand" 
                className="flex-grow flex items-center justify-center gap-1.5"
                onClick={async () => {
                  console.log("🔄 [F12 AUTH DEBUG] Forzando sincronización inmediata con Firestore...");
                  await reloadPermissions();
                  alert("Permisos actualizados de Firestore con éxito.");
                }}
              >
                <RefreshCw size={14} className="animate-spin" />
                <span>Sincronizar Firestore</span>
              </Button>
            )}
          </div>
        }
      >
        <div className="flex border-b border-[var(--color-border)] mb-6">
          <button
            onClick={() => setActiveDebugTab('diagnostico')}
            className={cn(
              "flex-1 py-2.5 text-xs font-bold border-b-2 transition-all text-center focus:outline-none",
              activeDebugTab === 'diagnostico'
                ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-teal-50/10"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )}
          >
            🕵️ Diagnóstico
          </button>
          <button
            onClick={() => setActiveDebugTab('instrucciones')}
            className={cn(
              "flex-1 py-2.5 text-xs font-bold border-b-2 transition-all text-center focus:outline-none",
              activeDebugTab === 'instrucciones'
                ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-teal-50/10"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )}
          >
            📖 Guía del Sistema
          </button>
        </div>

        <div className="space-y-6 text-[var(--color-text)]">
          {activeDebugTab === 'instrucciones' ? (
            <div className="space-y-6 text-sm text-[var(--color-text-muted)] leading-relaxed">
              <div className="bg-[var(--color-brand-subtle)] p-4 rounded-lg border border-[var(--color-brand-active-border)]">
                <h3 className="font-bold text-sm text-[var(--color-text)] flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2563eb]"></span>
                  Mandao Conciliaciones — Ecosistema Mandao
                </h3>
                <p className="text-xs mt-1 text-[var(--color-text-muted)]">
                  Sistema externo independiente diseñado para automatizar el proceso de conciliación, facturación y planificación de pagos del servicio de delivery, reemplazando las hojas de cálculo manuales de Google Sheets.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--color-text-faint)]">Roles de Acceso</h4>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="p-3 bg-white border border-[var(--color-border)] rounded-md">
                    <span className="font-bold text-[var(--color-text)] block">👑 Super Admin / Supervisor</span>
                    <span className="text-[11px] text-gray-500">Acceso completo a todos los submódulos: verificación, importación, conciliación, configuraciones de áreas, métodos de pago y roles.</span>
                  </div>
                  <div className="p-3 bg-white border border-[var(--color-border)] rounded-md">
                    <span className="font-bold text-[var(--color-text)] block">⚡ Operador</span>
                    <span className="text-[11px] text-gray-500">Lectura y ejecución limitada. Puede verificar e identificar incidencias, pero tiene bloqueada la importación, conciliaciones y edición de configuraciones (CRUD).</span>
                  </div>
                  <div className="p-3 bg-white border border-[var(--color-border)] rounded-md">
                    <span className="font-bold text-[var(--color-text)] block">👁️ Visitante</span>
                    <span className="text-[11px] text-gray-500">Solo lectura. Puede consultar historiales, reportes, negocios y mensajeros, pero no puede ejecutar procesos ni hacer cambios.</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-[var(--color-text-faint)]">Reglas de Negocio Fundamentales</h4>
                
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <strong className="text-[var(--color-text)]">RN-001: Validación de Cambios (Dispatcher)</strong>
                    <p className="text-[11px] mt-1">Si hay registros en la hoja Cambios, deben coincidir exactamente con la hoja Orders en: <code className="bg-white px-1 rounded border">No. Orden</code>, <code className="bg-white px-1 rounded border">Mensajero</code>, <code className="bg-white px-1 rounded border">Negocio</code> y <code className="bg-white px-1 rounded border">Provincia</code>.</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <strong className="text-[var(--color-text)]">RN-012: Coincidencia Exacta de Mensajeros (Disponibilidad)</strong>
                    <p className="text-[11px] mt-1">La verificación de nombres de Mensajeros en Disponibilidad es estrictamente exacta con trim. No se permite coincidencia difusa (la cual solo aplica al Dispatcher).</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <strong className="text-[var(--color-text)]">RN-006 / RN-014: Bloqueo de Importación</strong>
                    <p className="text-[11px] mt-1">Si existe al menos una incidencia crítica (como mensajeros no encontrados o celdas vacías), el botón de Importar queda completamente bloqueado en el sistema.</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                    <strong className="text-[var(--color-text)]">RN-009 / RN-013: Control de Duplicados</strong>
                    <p className="text-[11px] mt-1">No se permite re-importar órdenes o disponibilidades que ya hayan sido importadas previamente para la misma Área y fechas de operación.</p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-teal-50 border border-teal-200 rounded-md text-xs">
                <h4 className="font-bold text-[var(--color-primary)] mb-1">💡 ¿Cómo configurar los permisos?</h4>
                <p className="text-[11px] text-teal-800 leading-normal">
                  Puedes administrar los permisos y roles de los usuarios desde la sección <strong>Configuración &gt; Roles y Usuarios</strong>. Cualquier cambio de perfil se puede sincronizar de inmediato usando el botón de diagnóstico.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Section 1: User Profile & Account Data */}
          <div className="bg-slate-50 p-4 rounded-lg border border-[var(--color-border)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-faint)] flex items-center gap-1.5">
              <Info size={14} className="text-teal-600" />
              Sesión de Usuario Activa
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[var(--color-text-faint)] block">Nombre completo:</span>
                <span className="font-bold">{user?.name || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-faint)] block">Correo electrónico:</span>
                <span className="font-bold select-all break-all text-teal-700">{user?.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-faint)] block">Rol asignado en Firestore:</span>
                <span className="font-bold uppercase bg-[var(--color-brand)] text-[var(--color-brand-ink)] px-2 py-0.5 rounded text-[10px] tracking-wide inline-block">{user?.role || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-faint)] block">Estado en Base de Datos:</span>
                <span className={cn(
                  "font-bold uppercase text-[10px] px-2 py-0.5 rounded inline-block",
                  user?.estado === 'activo' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                )}>
                  {user?.estado || 'activo'}
                </span>
              </div>
              <div className="md:col-span-2">
                <span className="text-[var(--color-text-faint)] block">ID Único de Autenticación (UID):</span>
                <span className="font-mono text-[10px] text-gray-500 break-all bg-white p-1 rounded border border-gray-100 block">{user?.uid || 'Sin UID'}</span>
              </div>
            </div>

            {user?.email && !user.email.endsWith('@mandao.app') && (
              <div className="p-2.5 bg-yellow-50 text-yellow-800 rounded text-[11px] border border-yellow-200 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-yellow-600" />
                <div>
                  <strong>Aviso de Dominio Externo:</strong> Como este correo no finaliza con <code className="bg-yellow-100 px-1 rounded font-mono font-bold">@mandao.app</code>, por defecto asume el rol de <em>negocio</em> a menos que esté registrado con un rol personalizado en la colección <code className="bg-yellow-105 px-1 rounded font-mono font-bold">users</code> de Firestore.
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Active Modules status */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Módulos de Sistema Activos</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className={cn(
                "p-3 rounded-lg border flex items-center justify-between text-xs",
                activeModules.negocios ? "bg-teal-50/50 border-teal-200" : "bg-gray-50 border-gray-200 text-gray-400"
              )}>
                <div>
                  <span className="font-bold block">Módulo Negocios</span>
                  <span className="text-[10px] text-[var(--color-text-faint)]">General, Dashboard, Conciliaciones</span>
                </div>
                {activeModules.negocios ? (
                  <span className="text-[10px] bg-green-100 text-green-800 font-bold px-1.5 py-0.5 rounded uppercase">Habilitado</span>
                ) : (
                  <span className="text-[10px] bg-gray-200 text-gray-650 font-bold px-1.5 py-0.5 rounded uppercase">Inactivo</span>
                )}
              </div>

              <div className={cn(
                "p-3 rounded-lg border flex items-center justify-between text-xs",
                activeModules.mensajeros ? "bg-indigo-50/50 border-indigo-200" : "bg-gray-50 border-gray-200 text-gray-400"
              )}>
                <div>
                  <span className="font-bold block">Módulo Mensajeros</span>
                  <span className="text-[10px] text-[var(--color-text-faint)] font-mono">Dashboard, Cuentas, Conciliación</span>
                </div>
                {activeModules.mensajeros ? (
                  <span className="text-[10px] bg-green-100 text-green-800 font-bold px-1.5 py-0.5 rounded uppercase">Habilitado</span>
                ) : (
                  <span className="text-[10px] bg-gray-200 text-gray-650 font-bold px-1.5 py-0.5 rounded uppercase">Inactivo</span>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Rol fijo del usuario (reemplaza la vieja matriz de permisos libres) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Rol del Usuario</h3>
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-2 text-xs text-teal-800">
              <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
              <div>
                <strong>Rol asignado: <code className="font-bold bg-teal-100 px-1 rounded font-mono">{user?.role ?? 'sin sesión'}</code></strong>
                <p className="text-[10px] text-teal-700 mt-0.5">Modelo fijo de 4 roles (super_admin / supervisor / operador / visitante). Ya no existen permisos configurables por usuario/rol.</p>
              </div>
            </div>
          </div>

          {/* Section 4: Live Check Simulator */}
          <div className="p-4 bg-slate-50 rounded-lg border border-[var(--color-border)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text)] flex items-center gap-1.5">
              <Settings size={14} className="text-[var(--color-primary)]" />
              Verificador de Permisos en Tiempo Real
            </h3>
            
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Escribe un ID de sección o acción (ej: <code className="font-mono bg-white p-0.5 rounded">conciliacion-negocio</code>, <code className="font-mono bg-white p-0.5 rounded">roles-usuarios</code>, <code className="font-mono bg-white p-0.5 rounded">areas</code>) para simular si tu rol tiene acceso y ver por qué.
            </p>

            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Escribe ID del menú o submenú..." 
                value={testPermissionString}
                onChange={(e) => setTestPermissionString(e.target.value.trim().toLowerCase())}
                className="flex-grow p-2.5 text-xs bg-white border border-[var(--color-border)] rounded-md outline-none focus:ring-1 focus:ring-[var(--color-primary)] focus:border-[var(--color-primary)] font-mono"
              />
            </div>

            {testPermissionString && (
              <div className={cn(
                "p-3 rounded text-xs border flex items-start gap-2.5 transition-all duration-200",
                hasPermission(testPermissionString) 
                  ? "bg-green-50 text-green-800 border-green-200" 
                  : "bg-red-50 text-red-800 border-red-200"
              )}>
                {hasPermission(testPermissionString) ? (
                  <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <span className="font-semibold block">
                    {hasPermission(testPermissionString) ? "Permiso Concedido (AUTORIZADO)" : "Permiso Denegado (DENEGADO)"}
                  </span>
                  <p className="text-[11px] text-gray-600">
                    Evaluado contra el rol fijo <code className="font-mono">{user?.role}</code>. Dispatcher/Disponibilidad son visibles para los 4 roles; el resto de módulos (fuera del alcance actual de la migración) solo son visibles para super_admin/supervisor.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Troubleshooting Guidelines Checklist */}
          <div className="space-y-2 text-xs border-t border-[var(--color-border)] pt-4">
            <h4 className="font-semibold text-[var(--color-text)] flex items-center gap-1">
              <AlertTriangle size={14} className="text-yellow-600" />
              Guía de Verificación en Otros Navegadores:
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-gray-500 pl-1 text-[11px]">
              <li><strong>Exactitud de Correo:</strong> Compruebe en Firestore que el email esté guardado en minúsculas y sin espacios. Ej: <code className="bg-slate-100 px-1 rounded font-mono">usuario@mandao.app</code> es diferente de <code className="bg-slate-100 px-1 rounded font-mono">Usuario@mandao.app</code> o <code className="bg-slate-100 px-1 rounded font-mono">usuario@mandao.app </code>.</li>
              <li><strong>Asignación del Rol:</strong> Confirme que el nombre del rol asignado al usuario (ej: <code className="bg-slate-100 px-1 rounded font-mono">Auditor</code>) sea idéntico al nombre del Rol en la colección de Roles.</li>
              <li><strong>Recarga Sincronizada:</strong> Registre el Rol o cambie el usuario en una pestaña, luego pulse el botón <strong>"Sincronizar Firestore"</strong> de abajo para testear en vivo sin reconectarse.</li>
            </ul>
          </div>
          </>
          )}
        </div>
      </SlideOver>
    </div>
  );
}
