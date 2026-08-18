import React, { useState, useMemo, useEffect } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { db } from '../../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  getDocs,
  where,
  deleteDoc
} from 'firebase/firestore';
import { 
  UserPlus, 
  Shield, 
  Mail, 
  Key, 
  Search, 
  Eye, 
  Settings, 
  CheckCircle2, 
  XCircle, 
  ShieldCheck, 
  Trash2, 
  ChevronRight,
  MonitorCheck,
  Filter as FilterIcon,
  Download,
  Loader2,
  Calendar
} from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

type UserStatus = 'activo' | 'bloqueado';

interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  estado: UserStatus;
  ultimoAcceso: string;
  modulosActivos?: { negocios: boolean; mensajeros: boolean };
}

interface RoleRecord {
  id: string;
  nombre: string;
  descripcion: string;
  permisos: string[]; // IDs de los menús
  usuariosAsignados: number;
}

const PERMISSIONS_LIST = [
  { group: 'General', items: [{ id: 'dashboard', label: 'Dashboard General' }] },
  { 
    group: 'Módulo Negocios', 
    items: [
      { id: 'dashboard-negocio', label: 'Dashboard' },
      { id: 'dispatcher-negocio', label: 'Dispatcher' },
      { id: 'conciliacion-negocio', label: 'Conciliación' },
      { id: 'facturacion-negocio', label: 'Facturación' },
      { id: 'cuentas-pagar-negocio', label: 'Cuentas por Pagar' },
      { id: 'cuentas-cobrar-negocio', label: 'Cuentas por Cobrar' },
      { id: 'planificacion-pagos-negocio', label: 'Planificación Pagos' },
      { id: 'gestion-negocios', label: 'Gestión de Negocios' }
    ] 
  },
  { 
    group: 'Módulo Mensajeros', 
    items: [
      { id: 'dashboard-mensajero', label: 'Dashboard' },
      { id: 'dispatcher-mensajero', label: 'Dispatcher' },
      { id: 'conciliacion-mensajero', label: 'Conciliación' },
      { id: 'facturacion-mensajero', label: 'Facturación' },
      { id: 'cuentas-pagar-mensajero', label: 'Cuentas por Pagar' },
      { id: 'cuentas-cobrar-mensajero', label: 'Cuentas por Cobrar' },
      { id: 'planificacion-pagos-mensajero', label: 'Planificación Pagos' },
      { id: 'gestion-mensajeros', label: 'Gestión de Mensajeros' }
    ] 
  },
  { group: 'Configuración', items: [{ id: 'roles-usuarios', label: 'Roles y Usuarios' }] },
];

export function RolesUsuariosPage({ permissions = [] }: { permissions?: string[] }) {
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'usuarios' | 'roles'>('usuarios');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isUsersInRoleOpen, setIsUsersInRoleOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleRecord | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Custom confirmation & notification states
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [notificationState, setNotificationState] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'info';
    message: string;
  }>({
    isOpen: false,
    type: 'success',
    message: '',
  });

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotificationState({ isOpen: true, type, message });
    setTimeout(() => {
      setNotificationState(prev => prev.message === message ? { ...prev, isOpen: false } : prev);
    }, 4000);
  };

  const showConfirm = (options: {
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
  }) => {
    setConfirmState({ ...options, isOpen: true });
  };

  // Permission checks
  const canWrite = permissions.includes('all') || permissions.includes('roles-usuarios:write');
  const canConfig = permissions.includes('all') || permissions.includes('roles-usuarios:config');
  const canDelete = permissions.includes('all') || permissions.includes('roles-usuarios:delete');

  useEffect(() => {
    // Listen to users
    const usersUnsubscribe = onSnapshot(collection(db, 'users'), 
      (snapshot) => {
        const userList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserRecord[];
        setUsers(userList);
      },
      (error) => {
        console.error("Error listening to users collection:", error);
      }
    );

    // Listen to roles
    const rolesUnsubscribe = onSnapshot(collection(db, 'roles'), 
      (snapshot) => {
        const roleList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RoleRecord[];
        setRoles(roleList);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to roles collection:", error);
        setLoading(false);
      }
    );

    return () => {
      usersUnsubscribe();
      rolesUnsubscribe();
    };
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.rol.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const filteredRoles = useMemo(() => {
    return roles.filter(r => 
      r.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.descripcion.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [roles, searchQuery]);

  // Form states
  const [userFormData, setUserFormData] = useState({
    nombre: '',
    email: '',
    rol: '',
    estado: 'activo' as UserStatus,
    modulosActivos: { negocios: true, mensajeros: true }
  });

  const [roleFormData, setRoleFormData] = useState({
    nombre: '',
    descripcion: '',
    permisos: [] as string[]
  });

  const toggleUserStatus = async (user: UserRecord) => {
    try {
      const newStatus = user.estado === 'activo' ? 'bloqueado' : 'activo';
      await updateDoc(doc(db, 'users', user.id), { estado: newStatus });
      showNotification('success', `Usuario ${newStatus === 'activo' ? 'desbloqueado' : 'bloqueado'} con éxito.`);
    } catch (error) {
      console.error("Error toggling user status:", error);
      showNotification('error', "No se pudo cambiar el estado del usuario.");
    }
  };

  const handleExport = () => {
    const dataToExport = activeTab === 'usuarios' ? filteredUsers : filteredRoles;
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab.toUpperCase());
    XLSX.writeFile(workbook, `mandao_${activeTab}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleRoleClickFromUser = (roleName: string) => {
    const role = roles.find(r => r.nombre === roleName);
    if (role) {
      setSelectedRole(role);
      setRoleFormData({
        nombre: role.nombre,
        descripcion: role.descripcion,
        permisos: role.permisos
      });
      setIsRoleModalOpen(true);
    }
  };

  const handleUserCountClick = async (role: RoleRecord) => {
    setSelectedRole(role);
    setIsUsersInRoleOpen(true);
  };

  const saveUser = async () => {
    try {
      if (!userFormData.nombre) {
        showNotification('error', "Por favor, ingrese el nombre del usuario.");
        return;
      }
      if (!userFormData.email) {
        showNotification('error', "Por favor, ingrese el correo electrónico.");
        return;
      }
      const normalizedEmail = userFormData.email.trim().toLowerCase();
      const updatedData = {
        ...userFormData,
        email: normalizedEmail
      };

      if (selectedUser) {
        await updateDoc(doc(db, 'users', selectedUser.id), { ...updatedData, updatedAt: serverTimestamp() });
        showNotification('success', "Usuario actualizado con éxito.");
      } else {
        await addDoc(collection(db, 'users'), { ...updatedData, createdAt: serverTimestamp(), ultimoAcceso: 'Nunca' });
        showNotification('success', "Usuario creado con éxito.");
      }
      setIsUserModalOpen(false);
      setSelectedUser(null);
    } catch (error: any) {
      console.error("Error saving user:", error);
      showNotification('error', "Error al guardar el usuario. Detalle: " + (error?.message || error));
    }
  };

  const saveRole = async () => {
    try {
      if (!roleFormData.nombre) {
        showNotification('error', "Por favor, ingrese el nombre del rol.");
        return;
      }
      if (selectedRole) {
        await updateDoc(doc(db, 'roles', selectedRole.id), { ...roleFormData, updatedAt: serverTimestamp() });
        showNotification('success', "Rol actualizado con éxito.");
      } else {
        await addDoc(collection(db, 'roles'), { ...roleFormData, usuariosAsignados: 0, createdAt: serverTimestamp() });
        showNotification('success', "Rol creado con éxito.");
      }
      setIsRoleModalOpen(false);
      setSelectedRole(null);
    } catch (error: any) {
      console.error("Error saving role:", error);
      showNotification('error', "Error al guardar el rol. Detalle: " + (error?.message || error));
    }
  };

  const deleteRole = async (roleId: string) => {
    showConfirm({
      title: '¿Confirmar eliminación?',
      message: '¿Está seguro de eliminar este rol? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'roles', roleId));
          showNotification('success', "Rol eliminado con éxito.");
        } catch (error: any) {
          console.error("Error deleting role:", error);
          showNotification('error', "Error al eliminar el rol. Detalle: " + (error?.message || error));
        }
      }
    });
  };

  const deleteUser = async (userId: string) => {
    showConfirm({
      title: '¿Confirmar eliminación?',
      message: '¿Está seguro de eliminar este usuario? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', userId));
          showNotification('success', "Usuario eliminado con éxito.");
        } catch (error: any) {
          console.error("Error deleting user:", error);
          showNotification('error', "Error al eliminar el usuario. Detalle: " + (error?.message || error));
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
             <Shield className="w-6 h-6 text-brand-ink" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Control de Accesos</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Configuración de seguridad RBAC para el ecosistema Mandao.</p>
          </div>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" className="gap-2" onClick={handleExport}>
             <Download size={18} />
             Exportar Excel
           </Button>
           {activeTab === 'usuarios' && canWrite ? (
             <Button variant="brand" className="gap-2" onClick={() => { setSelectedUser(null); setUserFormData({ nombre: '', email: '', rol: '', estado: 'activo', modulosActivos: { negocios: true, mensajeros: true } }); setIsUserModalOpen(true); }}>
               <UserPlus size={18} />
               Registrar Usuario
             </Button>
           ) : activeTab === 'roles' && canConfig ? (
             <Button variant="brand" className="gap-2" onClick={() => { setSelectedRole(null); setRoleFormData({ nombre: '', descripcion: '', permisos: [] }); setIsRoleModalOpen(true); }}>
               <ShieldCheck size={18} />
               Crear Nuevo Rol
             </Button>
           ) : null}
        </div>
      </div>

      {/* Tabs Control */}
      <div className="flex p-1 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg w-fit">
        <button 
          onClick={() => setActiveTab('usuarios')}
          className={cn(
            "px-6 py-2 text-sm font-bold rounded-md transition-all",
            activeTab === 'usuarios' ? "bg-white text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
          )}
        >
          Usuarios
        </button>
        <button 
          onClick={() => setActiveTab('roles')}
          className={cn(
            "px-6 py-2 text-sm font-bold rounded-md transition-all",
            activeTab === 'roles' ? "bg-white text-[var(--color-text)] shadow-sm" : "text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
          )}
        >
          Roles de Sistema
        </button>
      </div>

      {activeTab === 'usuarios' ? (
        <DataTable<UserRecord>
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          columns={[
            { 
              header: 'Usuario', 
              accessor: (item) => (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[var(--color-brand)] flex items-center justify-center font-bold text-[var(--color-brand-ink)] border border-[var(--color-brand-active-border)] shadow-sm">
                    {item.nombre.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-sm text-[var(--color-text)]">{item.nombre}</span>
                    <span className="text-[10px] text-[var(--color-text-faint)] font-mono">{item.email}</span>
                  </div>
                </div>
              )
            },
            { 
              header: 'Rol Asignado', 
              accessor: (item) => (
                <button 
                  onClick={() => handleRoleClickFromUser(item.rol)}
                  className="flex items-center gap-2 hover:bg-[var(--color-surface-3)] p-1 rounded transition-colors group cursor-pointer"
                >
                  <Key size={14} className="text-[var(--color-primary)]" />
                  <span className="font-semibold text-sm group-hover:text-[var(--color-primary)] underline underline-offset-4 decoration-dotted">{item.rol}</span>
                </button>
              ) 
            },
            { 
              header: 'Estado', 
              accessor: (item) => (
                <button 
                  onClick={(e) => { 
                    if (!canWrite) return;
                    e.stopPropagation(); 
                    toggleUserStatus(item); 
                  }}
                  className={cn("group", canWrite ? "cursor-pointer" : "cursor-default")}
                  title={canWrite ? "Cambiar estado" : ""}
                >
                  <StatusBadge status={item.estado} className={cn(canWrite && "group-hover:opacity-80 transition-opacity")} />
                </button>
              ),
              align: 'center'
            },
            { 
              header: 'Último Acceso', 
              accessor: (item) => (
                <span className="text-xs text-[var(--color-text-muted)]">
                  {item.ultimoAcceso || 'Nunca'}
                </span>
              )
            },
            {
              header: 'Acciones',
              accessor: (item) => (
                <div className="flex items-center justify-end gap-2">
                  <button 
                    onClick={() => { setSelectedUser(item); setUserFormData({ nombre: item.nombre, email: item.email, rol: item.rol, estado: item.estado, modulosActivos: item.modulosActivos || { negocios: true, mensajeros: true } }); setIsUserModalOpen(true); }}
                    title={canWrite ? "Editar Usuario" : "Ver Perfil"}
                    className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                  >
                    {canWrite ? <Settings size={16} /> : <Eye size={16} />}
                  </button>
                  {canDelete && (
                    <button 
                      onClick={() => deleteUser(item.id)}
                      title="Eliminar Usuario"
                      className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            }
          ]}
          data={filteredUsers}
        />
      ) : (
        <DataTable<RoleRecord>
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          columns={[
            { 
              header: 'Nombre del Rol', 
              accessor: (item) => (
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-[var(--color-text)]">{item.nombre}</span>
                  <p className="text-[10px] text-[var(--color-text-faint)] max-w-xs truncate">{item.descripcion}</p>
                </div>
              )
            },
            { 
              header: 'Usuarios', 
              accessor: (item) => (
                <button 
                  onClick={() => handleUserCountClick(item)}
                  className="inline-flex items-center gap-2 px-2 py-1 rounded bg-[var(--color-surface-2)] text-xs font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-all cursor-pointer"
                >
                  <MonitorCheck size={12} />
                  <span>
                    {users.filter(u => 
                      u.rol === item.nombre || 
                      u.rol === item.id || 
                      (u.rol && item.nombre && u.rol.trim().toLowerCase() === item.nombre.trim().toLowerCase()) ||
                      (u.rol && item.id && u.rol.trim().toLowerCase() === item.id.trim().toLowerCase())
                    ).length} usuarios
                  </span>
                </button>
              ),
              align: 'center'
            },
            { 
              header: 'Acceso y Permisos', 
              accessor: (item) => (
                <div className="flex flex-wrap gap-1">
                  {item.permisos.includes('all') ? (
                    <span className="text-[9px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-1.5 rounded">Acceso Total</span>
                  ) : (
                    item.permisos.slice(0, 3).map(p => (
                      <span key={p} className="text-[9px] font-bold uppercase tracking-wider bg-[var(--color-surface-3)] text-[var(--color-text-muted)] px-1.5 rounded">
                        {p.split('-')[0]}
                      </span>
                    ))
                  )}
                  {item.permisos.length > 3 && !item.permisos.includes('all') && (
                    <span className="text-[9px] font-bold text-[var(--color-text-faint)]">+{item.permisos.length - 3}</span>
                  )}
                </div>
              )
            },
            {
              header: 'Acciones',
              accessor: (item) => (
                <div className="flex items-center justify-end gap-2">
                  <button 
                    onClick={() => { setSelectedRole(item); setRoleFormData({ nombre: item.nombre, descripcion: item.descripcion, permisos: item.permisos }); setIsRoleModalOpen(true); }}
                    title={canConfig ? "Editar Rol" : "Ver Rol"}
                    className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                  >
                    {canConfig ? <Settings size={16} /> : <Eye size={16} />}
                  </button>
                  {canDelete && (
                    <button 
                      onClick={() => deleteRole(item.id)}
                      title="Eliminar Rol"
                      className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            }
          ]}
          data={filteredRoles}
        />
      )}

      {/* LIST OF USERS BY ROLE MODAL */}
      <SlideOver
        isOpen={isUsersInRoleOpen}
        onClose={() => setIsUsersInRoleOpen(false)}
        title={`Usuarios con Rol: ${selectedRole?.nombre}`}
        footer={
          <Button variant="outline" className="w-full" onClick={() => setIsUsersInRoleOpen(false)}>Cerrar Listado</Button>
        }
      >
        <div className="space-y-4">
           <p className="text-sm text-[var(--color-text-muted)] italic">A continuación se muestran los usuarios que tienen asignado este rol actualmente.</p>
           <div className="divide-y divide-[var(--color-border)] bg-[var(--color-surface-2)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {users.filter(u => u.rol === selectedRole?.nombre).map(user => (
                <div key={user.id} className="p-4 flex items-center justify-between hover:bg-white transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-surface-3)] flex items-center justify-center font-bold text-xs">
                      {user.nombre.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-[var(--color-text)]">{user.nombre}</span>
                      <span className="text-xs text-[var(--color-text-faint)]">{user.email}</span>
                    </div>
                  </div>
                  <StatusBadge status={user.estado} />
                </div>
              ))}
              {users.filter(u => u.rol === selectedRole?.nombre).length === 0 && (
                <div className="p-8 text-center text-xs text-[var(--color-text-faint)]">
                   No hay usuarios registrados con este rol en Firestore.
                </div>
              )}
           </div>
        </div>
      </SlideOver>

      {/* ROLE MODAL */}
      <SlideOver
        isOpen={isRoleModalOpen}
        onClose={() => { setIsRoleModalOpen(false); setSelectedRole(null); }}
        title={selectedRole ? "Configurar Rol de Sistema" : "Crear Nuevo Rol"}
        footer={
          <div className="flex gap-3">
             <Button variant="ghost" className="flex-1" onClick={() => setIsRoleModalOpen(false)}>
               Cancelar
             </Button>
             <Button variant="brand" className="flex-1" onClick={saveRole}>
               {selectedRole ? "Guardar Cambios" : "Crear Rol"}
             </Button>
          </div>
        }
      >
        <div className="space-y-8">
           <FormSection title="Datos Generales">
              <div className="space-y-4">
                <TextField 
                  label="Nombre del Rol" 
                  value={roleFormData.nombre}
                  onChange={(e) => setRoleFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Ej: Auditor Contable" 
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-[var(--color-text)]">Descripción</span>
                  <textarea 
                    rows={3}
                    value={roleFormData.descripcion}
                    onChange={(e) => setRoleFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                    className="w-full p-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all resize-none"
                    placeholder="Explique el propósito y alcance de este rol..."
                  />
                </label>
              </div>
           </FormSection>

           <FormSection title="Matriz de Permisos">
              <p className="text-xs text-[var(--color-text-muted)] mb-4 italic">Accesos y permisos configurados para los menús de la aplicación.</p>
              <div className="space-y-6">
                {PERMISSIONS_LIST.map((group) => (
                  <div key={group.group} className="space-y-3">
                    <div className="flex items-center gap-2">
                       <div className="h-4 w-1 bg-[var(--color-brand)] rounded-full" />
                       <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text)]">{group.group}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 pl-3">
                      {group.items.map((item) => {
                        const isModuleActive = roleFormData.permisos.some(p => p.startsWith(item.id)) || roleFormData.permisos.includes('all');
                        
                        return (
                          <div key={item.id} className="space-y-2">
                            <label className={cn(
                              "flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer transition-all hover:border-[var(--color-primary)] group ",
                              isModuleActive ? "bg-teal-50 border-teal-200" : "bg-white"
                            )}>
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                checked={isModuleActive}
                                onChange={(e) => {
                                  let newPerms = [...roleFormData.permisos];
                                  if (e.target.checked) {
                                    newPerms.push(`${item.id}:read`);
                                  } else {
                                    newPerms = newPerms.filter(p => !p.startsWith(`${item.id}:`) && p !== item.id);
                                  }
                                  setRoleFormData(prev => ({ ...prev, permisos: Array.from(new Set(newPerms)) }));
                                }} 
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">{item.label}</span>
                                <span className="text-[10px] text-[var(--color-text-faint)] font-mono">ID: {item.id}</span>
                              </div>
                            </label>

                            <AnimatePresence>
                              {isModuleActive && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="ml-8 grid grid-cols-3 gap-2 overflow-hidden"
                                >
                                  {[
                                    { id: 'read', label: 'Lectura' },
                                    { id: 'write', label: 'Editar' },
                                    { id: 'config', label: 'Configurar' }
                                  ].map(action => {
                                    const actionId = `${item.id}:${action.id}`;
                                    const isActionChecked = roleFormData.permisos.includes(actionId) || roleFormData.permisos.includes('all');
                                    
                                    return (
                                      <label key={actionId} className={cn(
                                        "flex items-center gap-2 p-2 rounded border border-[var(--color-border)] cursor-pointer transition-all hover:bg-[var(--color-surface-3)]",
                                        isActionChecked ? "bg-white border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "bg-white text-[var(--color-text-muted)]"
                                      )}>
                                        <input 
                                          type="checkbox"
                                          className="w-3 h-3 rounded text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                          checked={isActionChecked}
                                          onChange={(e) => {
                                            const newPerms = e.target.checked
                                              ? [...roleFormData.permisos, actionId]
                                              : roleFormData.permisos.filter(p => p !== actionId);
                                            setRoleFormData(prev => ({ ...prev, permisos: newPerms }));
                                          }}
                                        />
                                        <span className="text-[10px] uppercase">{action.label}</span>
                                      </label>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
           </FormSection>
        </div>
      </SlideOver>

      {/* USER MODAL */}
      <SlideOver
        isOpen={isUserModalOpen}
        onClose={() => { setIsUserModalOpen(false); setSelectedUser(null); }}
        title={selectedUser ? "Perfil de Usuario" : "Registro de Usuario"}
        footer={
          <div className="flex gap-3">
             <Button variant="ghost" className="flex-1" onClick={() => setIsUserModalOpen(false)}>Cancelar</Button>
             <Button variant="brand" className="flex-1" onClick={saveUser}>{selectedUser ? "Actualizar Perfil" : "Finalizar Registro"}</Button>
          </div>
        }
      >
        <div className="space-y-8">
           <div className="flex flex-col items-center py-6">
              <div className="w-24 h-24 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-3xl font-bold text-[var(--color-brand-ink)] border-4 border-white shadow-xl mb-4">
                {userFormData.nombre.charAt(0) || <UserPlus size={40} />}
              </div>
              <h3 className="text-lg font-bold text-[var(--color-text)]">{userFormData.nombre || "Nuevo Usuario"}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">{userFormData.email || "usuario@mandao.app"}</p>
           </div>

           <FormSection title="Información de Cuenta">
              <div className="grid grid-cols-1 gap-4">
                <TextField 
                  label="Nombre Completo" 
                  value={userFormData.nombre}
                  onChange={(e) => setUserFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  placeholder="Juan Pérez" 
                />
                <TextField 
                   label="Correo Electrónico" 
                   value={userFormData.email}
                   onChange={(e) => setUserFormData(prev => ({ ...prev, email: e.target.value }))}
                   disabled={!!selectedUser}
                   placeholder="usuario@mandao.app" 
                />
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text)]">Rol Asignado</label>
                  <select 
                    className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)]"
                    value={userFormData.rol}
                    onChange={(e) => setUserFormData(prev => ({ ...prev, rol: e.target.value }))}
                  >
                    <option value="">Seleccione un rol...</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.nombre}>{r.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text)]">Estado de Acceso</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setUserFormData(prev => ({ ...prev, estado: 'activo' }))}
                      className={cn(
                        "flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        userFormData.estado === 'activo' ? "bg-teal-50 border-teal-500 text-teal-700" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50"
                      )}
                    >
                      <CheckCircle2 size={14} /> Activo
                    </button>
                    <button 
                      onClick={() => setUserFormData(prev => ({ ...prev, estado: 'bloqueado' }))}
                      className={cn(
                        "flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                        userFormData.estado === 'bloqueado' ? "bg-red-50 border-red-500 text-red-700" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50"
                      )}
                    >
                      <XCircle size={14} /> Bloqueado
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                  <label className="text-xs font-bold text-[var(--color-text)] block mb-1">Sub-sistemas Activos</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-[var(--color-border)] transition-all">
                      <input 
                        type="checkbox"
                        checked={userFormData.modulosActivos.negocios}
                        onChange={(e) => setUserFormData(prev => ({ 
                          ...prev, 
                          modulosActivos: { ...prev.modulosActivos, negocios: e.target.checked }
                        }))}
                        className="w-4 h-4 rounded text-[var(--color-primary)]"
                      />
                      <span className="text-xs font-semibold text-[var(--color-text)]">Acceso a Módulo Negocios</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded hover:bg-white border border-transparent hover:border-[var(--color-border)] transition-all">
                      <input 
                        type="checkbox"
                        checked={userFormData.modulosActivos.mensajeros}
                        onChange={(e) => setUserFormData(prev => ({ 
                          ...prev, 
                          modulosActivos: { ...prev.modulosActivos, mensajeros: e.target.checked }
                        }))}
                        className="w-4 h-4 rounded text-[var(--color-primary)]"
                      />
                      <span className="text-xs font-semibold text-[var(--color-text)]">Acceso a Módulo Mensajeros</span>
                    </label>
                  </div>
                </div>
              </div>
           </FormSection>

           {selectedUser && (
             <FormSection title="Auditoría de Actividad">
                <div className="space-y-3">
                  <div className="flex justify-between text-xs items-center">
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                      <Calendar size={12} />
                      <span>Registro inicial:</span>
                    </div>
                    <span className="font-semibold">12/01/2024</span>
                  </div>
                  <div className="flex justify-between text-xs items-center">
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                      <MonitorCheck size={12} />
                      <span>Último acceso:</span>
                    </div>
                    <span className="font-semibold">{selectedUser.ultimoAcceso}</span>
                  </div>
                </div>
             </FormSection>
           )}
        </div>
      </SlideOver>

      {/* CUSTOM CONFIRMATION DIALOG */}
      <AnimatePresence>
        {confirmState.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="relative bg-white rounded-lg shadow-xl border border-[var(--color-border)] p-6 max-w-sm w-full z-10 space-y-4"
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "p-3 rounded-full flex-shrink-0",
                  confirmState.isDanger ? "bg-red-50 text-red-600" : "bg-teal-50 text-teal-600"
                )}>
                  {confirmState.isDanger ? <XCircle size={24} /> : <CheckCircle2 size={24} />}
                </div>
                <div className="space-y-1 flex-grow">
                  <h3 className="text-sm font-bold text-[var(--color-text)]">{confirmState.title}</h3>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{confirmState.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                >
                  {confirmState.cancelText || 'Cancelar'}
                </Button>
                <Button
                  variant={confirmState.isDanger ? 'danger' : 'primary'}
                  size="sm"
                  onClick={() => {
                    confirmState.onConfirm();
                    setConfirmState(prev => ({ ...prev, isOpen: false }));
                  }}
                >
                  {confirmState.confirmText || 'Confirmar'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CUSTOM TOAST NOTIFICATION */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {notificationState.isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={cn(
                "p-4 rounded-lg shadow-lg border flex items-start justify-between gap-3 pointer-events-auto",
                notificationState.type === 'success' && "bg-emerald-50 border-emerald-200 text-emerald-800",
                notificationState.type === 'error' && "bg-red-50 border-red-200 text-red-800",
                notificationState.type === 'info' && "bg-blue-50 border-blue-200 text-blue-800"
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 mt-0.5">
                  {notificationState.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600" />}
                  {notificationState.type === 'error' && <XCircle size={16} className="text-red-600" />}
                  {notificationState.type === 'info' && <Shield size={16} className="text-blue-600" />}
                </div>
                <p className="text-xs font-semibold leading-relaxed">{notificationState.message}</p>
              </div>
              <button
                onClick={() => setNotificationState(prev => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
              >
                &times;
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-2">
        <ChevronRight size={10} className="text-[var(--color-brand)]" />
        {title}
      </h3>
      <div className="p-4 bg-[var(--color-surface-2)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
        {children}
      </div>
    </div>
  );
}

function TextField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-[var(--color-text)]">{label}</span>
      <input 
        {...props}
        className={cn(
          "h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none shadow-sm",
          "focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/10 transition-all",
          props.disabled && "bg-gray-100 cursor-not-allowed opacity-60"
        )}
      />
    </label>
  );
}
