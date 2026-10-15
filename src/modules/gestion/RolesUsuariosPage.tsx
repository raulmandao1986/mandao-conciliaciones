import React, { useState, useMemo, useEffect } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';
import { supabase, logAuditEvent, ALLOWED_EMAIL_DOMAIN } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS, UserRole } from '../../lib/auth';
import { MODULE_CATALOG } from '../../lib/moduleCatalog';
import { ShieldCheck, Search, Loader2, Edit2, Trash2, Mail, Calendar, Save, Plus, UserPlus, Tags, Lock } from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/formatters';

interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  fechaAlta: string;
  accessRoleId: string | null;
  accessRoleName: string | null;
  accessRoleBaseRole: UserRole | null;
}

interface AccessRoleRecord {
  id: string;
  nombre: string;
  descripcion: string;
  baseRole: UserRole;
  isSystem: boolean;
  moduleKeys: string[];
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  supervisor: 'Supervisor',
  operador: 'Operador',
  visitante: 'Visitante'
};

const ROLE_OPTIONS: UserRole[] = ['super_admin', 'supervisor', 'operador', 'visitante'];

// MODULE_CATALOG agrupado por sección — se calcula una sola vez (es estático)
// y se usa para pintar las etiquetas de módulos/accesos en la pestaña "Roles".
const MODULE_SECTIONS: [string, typeof MODULE_CATALOG][] = (() => {
  const map = new Map<string, typeof MODULE_CATALOG>();
  MODULE_CATALOG.forEach(m => {
    if (!map.has(m.section)) map.set(m.section, []);
    map.get(m.section)!.push(m);
  });
  return Array.from(map.entries());
})();

// MODELO DE AUTORIZACIÓN (2026-09-10): autenticarse con Google @mandao.app
// ya no da acceso por sí solo. Todo profile nuevo entra con active = false
// ("pendiente de autorización") — App.tsx muestra una pantalla de espera
// en vez del sistema hasta que un Super Admin lo autoriza aquí (asignando
// rol y marcándolo Autorizado). "Nuevo Usuario" hace lo mismo por
// adelantado, invitando a alguien que todavía no ha iniciado sesión.
//
// ROLES DE ACCESO — UNIFICADO (2026-09-24): esta página tiene dos
// pestañas — Usuarios (CRUD de profiles) y Roles de Acceso (CRUD de
// access_roles). Ya NO hay dos selects de rol por separado: un usuario
// tiene un único "Rol" (una fila de access_roles), que trae consigo
// tanto el nivel de seguridad real (base_role, copiado a profiles.role
// al asignarlo — eso es lo único que consultan las políticas RLS) como
// los módulos visibles en el menú (module_keys). Los 4 roles de sistema
// (Super Admin/Supervisor/Operador/Visitante) vienen sembrados y no se
// pueden eliminar ni perder su base_role fijo (protegido con trigger en
// Supabase) — pero sus módulos SÍ son 100% editables. Se pueden crear
// roles nuevos, libres en todo. Ver el comentario largo en
// supabase_schema.sql (sección "ROLES DE ACCESO") para el detalle
// completo, y AppShell.tsx (hasPermission) para cómo se usa el menú.
export function RolesUsuariosPage() {
  const { user: authUser } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(authUser?.role || 'visitante');

  const [activeSection, setActiveSection] = useState<'usuarios' | 'roles'>('usuarios');

  const [accessRoles, setAccessRoles] = useState<AccessRoleRecord[]>([]);
  const [accessRolesLoading, setAccessRolesLoading] = useState(true);

  const loadAccessRoles = async () => {
    setAccessRolesLoading(true);
    const { data, error } = await supabase
      .from('access_roles')
      .select('access_role_id, name, description, base_role, is_system, module_keys')
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching access_roles:', error.message);
      setAccessRolesLoading(false);
      return;
    }
    const records: AccessRoleRecord[] = (data || []).map((r: any) => ({
      id: r.access_role_id,
      nombre: r.name,
      descripcion: r.description || '',
      baseRole: r.base_role,
      isSystem: r.is_system,
      moduleKeys: r.module_keys || []
    }));
    setAccessRoles(records);
    setAccessRolesLoading(false);
  };

  useEffect(() => {
    loadAccessRoles();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
            <ShieldCheck className="w-6 h-6 text-brand-ink" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Roles y Usuarios</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Autenticarse con Google @mandao.app no da acceso por sí solo: solo quien esté registrado
              aquí, con un rol asignado, ve el sistema.
            </p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-[var(--color-border)]">
        <button
          onClick={() => setActiveSection('usuarios')}
          className={cn(
            "px-4 py-2.5 text-sm font-bold border-b-2 transition-all -mb-px flex items-center gap-2",
            activeSection === 'usuarios'
              ? "border-[var(--color-primary)] text-[var(--color-primary)]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          <UserPlus size={15} />
          Usuarios
        </button>
        <button
          onClick={() => setActiveSection('roles')}
          className={cn(
            "px-4 py-2.5 text-sm font-bold border-b-2 transition-all -mb-px flex items-center gap-2",
            activeSection === 'roles'
              ? "border-[var(--color-primary)] text-[var(--color-primary)]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          <Tags size={15} />
          Roles
        </button>
      </div>

      {activeSection === 'usuarios' ? (
        <UsuariosTab canWrite={canWrite} accessRoles={accessRoles} />
      ) : (
        <RolesTab
          canWrite={canWrite}
          accessRoles={accessRoles}
          loading={accessRolesLoading}
          onReload={loadAccessRoles}
        />
      )}
    </div>
  );
}

// =====================================================================
// PESTAÑA: USUARIOS — CRUD de profiles. Un solo select de Rol (una fila
// de access_roles), que fija a la vez profiles.role (seguridad real) y
// profiles.access_role_id (menú visible).
// =====================================================================
function UsuariosTab({ canWrite, accessRoles }: { canWrite: boolean; accessRoles: AccessRoleRecord[] }) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [formData, setFormData] = useState({ activo: true, accessRoleId: '' });
  const [saving, setSaving] = useState(false);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteAccessRoleId, setInviteAccessRoleId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, active, created_at, access_role_id, access_roles ( name, base_role )')
      .order('full_name', { ascending: true });
    if (error) {
      console.error('Error fetching profiles:', error.message);
      setLoading(false);
      return;
    }
    const records: UserRecord[] = (rows || []).map((p: any) => ({
      id: p.id,
      nombre: p.full_name,
      email: p.email || 'N/D',
      activo: p.active,
      fechaAlta: p.created_at,
      accessRoleId: p.access_role_id || null,
      accessRoleName: p.access_roles?.name || null,
      accessRoleBaseRole: p.access_roles?.base_role || null
    }));
    setUsers(records);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const pendingCount = useMemo(() => users.filter(u => !u.activo).length, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u =>
      u.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.accessRoleName || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const visitanteRoleId = useMemo(
    () => accessRoles.find(r => r.isSystem && r.baseRole === 'visitante')?.id || accessRoles[0]?.id || '',
    [accessRoles]
  );

  const handleEdit = (u: UserRecord) => {
    setSelectedUser(u);
    setFormData({ activo: u.activo, accessRoleId: u.accessRoleId || visitanteRoleId });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    const chosenRole = accessRoles.find(r => r.id === formData.accessRoleId);
    if (!chosenRole) {
      alert('Selecciona un Rol válido.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role: chosenRole.baseRole,
          active: formData.activo,
          access_role_id: chosenRole.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedUser.id);
      if (error) throw error;
      logAuditEvent('Configuraciones', 'Rol de Usuario Actualizado', {
        usuarioId: selectedUser.id,
        usuarioEmail: selectedUser.email,
        nuevoRol: chosenRole.nombre,
        nuevoNivelSeguridad: chosenRole.baseRole,
        nuevoEstado: formData.activo ? 'activo' : 'bloqueado'
      });
      setIsFormOpen(false);
      await loadUsers();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      alert('Error al actualizar el usuario. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInvite = () => {
    setInviteEmail('');
    setInviteAccessRoleId(visitanteRoleId);
    setInviteError(null);
    setIsInviteOpen(true);
  };

  // No existe una forma de "crear" un usuario directamente: profiles.id
  // referencia auth.users(id), y esa fila solo la crea Supabase Auth
  // cuando alguien inicia sesión de verdad. signInWithOtp({ shouldCreateUser: true })
  // es la única vía que no requiere la Service Role Key (que nunca debe
  // vivir en el frontend): registra al usuario y le envía un enlace de
  // acceso por correo. El trigger handle_new_user() crea su profile con
  // rol 'visitante' en el mismo instante; aquí lo ajustamos al rol elegido.
  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    setInviteError(null);

    if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      setInviteError(`El correo debe ser de dominio @${ALLOWED_EMAIL_DOMAIN}.`);
      return;
    }
    const chosenRole = accessRoles.find(r => r.id === inviteAccessRoleId);
    if (!chosenRole) {
      setInviteError('Selecciona un Rol válido.');
      return;
    }

    setInviting(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      });
      if (otpError) throw otpError;

      // El trigger ya creó (con active = false) o ya existía el profile —
      // como este alta la hace explícitamente un Super Admin, se autoriza
      // de inmediato con el rol elegido en vez de dejarlo pendiente.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          role: chosenRole.baseRole,
          active: true,
          access_role_id: chosenRole.id,
          updated_at: new Date().toISOString()
        })
        .eq('email', email);
      if (updateError) throw updateError;

      logAuditEvent('Configuraciones', 'Usuario Invitado', { email, rolAsignado: chosenRole.nombre });
      setIsInviteOpen(false);
      await loadUsers();
    } catch (err: any) {
      console.error('Error inviting user:', err);
      setInviteError(err?.message || 'No se pudo enviar la invitación.');
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canWrite && (
          <Button variant="brand" className="gap-2 shrink-0" onClick={handleOpenInvite}>
            <Plus size={18} />
            Nuevo Usuario
          </Button>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-[var(--color-warning)] bg-[var(--color-warning-bg)] p-3 rounded-[var(--radius-sm)]">
          <ShieldCheck size={16} />
          {pendingCount === 1
            ? 'Hay 1 usuario pendiente de autorización.'
            : `Hay ${pendingCount} usuarios pendientes de autorización.`}
        </div>
      )}

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar por nombre, correo o rol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-sans"
            />
          </div>
          <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums">{filteredUsers.length} usuarios</span>
        </div>

        <DataTable<UserRecord>
          columns={[
            {
              header: 'Usuario',
              accessor: (item) => (
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-[var(--color-text)]">{item.nombre}</span>
                  <span className="text-xs text-[var(--color-text-faint)] flex items-center gap-1">
                    <Mail size={11} />
                    {item.email}
                  </span>
                </div>
              )
            },
            {
              header: 'Rol',
              accessor: (item) => (
                item.accessRoleName ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 w-fit">
                      {item.accessRoleName}
                    </span>
                    {item.accessRoleBaseRole && (
                      <span className="text-[10px] text-[var(--color-text-faint)]">
                        Seguridad: {ROLE_LABELS[item.accessRoleBaseRole]}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-[var(--color-danger)] italic">Sin rol asignado</span>
                )
              )
            },
            {
              header: 'Fecha de Alta',
              accessor: (item) => (
                <span className="text-xs font-mono text-[var(--color-text-muted)] flex items-center gap-1">
                  <Calendar size={11} />
                  {formatDate(item.fechaAlta)}
                </span>
              )
            },
            {
              header: 'Estado',
              accessor: (item) => <StatusBadge status={item.activo ? 'activo' : 'pendiente'} />
            },
            {
              header: 'Acciones',
              accessor: (item) => (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                    title={canWrite ? 'Editar rol' : 'Ver detalles'}
                    className={cn(
                      "p-2 rounded-md transition-all",
                      canWrite ? "text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10" : "opacity-0 invisible select-none"
                    )}
                    disabled={!canWrite}
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
              )
            }
          ]}
          data={filteredUsers}
          searchQuery=""
          onSearchChange={() => {}}
        />

        {filteredUsers.length === 0 && (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-4">
              <ShieldCheck className="w-8 h-8 text-[var(--color-text-faint)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">No se encontraron usuarios</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
              Ningún usuario coincide con los criterios de búsqueda especificados.
            </p>
          </div>
        )}
      </div>

      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={`Editar Usuario: ${selectedUser?.nombre}`}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar Cambios
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="p-4 bg-[var(--color-surface-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Mail size={14} />
            {selectedUser?.email}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Rol</label>
            <select
              value={formData.accessRoleId}
              onChange={(e) => setFormData(p => ({ ...p, accessRoleId: e.target.value }))}
              className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
            >
              {accessRoles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
            {(() => {
              const chosen = accessRoles.find(r => r.id === formData.accessRoleId);
              return chosen ? (
                <p className="text-[10px] text-[var(--color-text-faint)]">
                  Nivel de seguridad: <strong>{ROLE_LABELS[chosen.baseRole]}</strong> · define qué módulos ve y qué puede ejecutar/modificar.
                  Se administra en la pestaña "Roles".
                </p>
              ) : null;
            })()}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)] block mb-2">
              Estado de Acceso
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData(p => ({ ...p, activo: true }))}
                className={cn(
                  'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                  formData.activo ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                )}
              >
                Autorizado
              </button>
              <button
                type="button"
                onClick={() => setFormData(p => ({ ...p, activo: false }))}
                className={cn(
                  'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                  !formData.activo ? 'bg-red-50 border-red-500 text-red-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                )}
              >
                Pendiente / Sin acceso
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-faint)] pt-1">
              Solo "Autorizado" permite iniciar sesión en el sistema.
            </p>
          </div>
        </div>
      </SlideOver>

      <SlideOver
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invitar Nuevo Usuario"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsInviteOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleInvite} disabled={!inviteEmail || inviting}>
              {inviting ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <UserPlus size={16} className="mr-2 inline" />}
              Enviar Invitación
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            No existe un formulario de "crear usuario": las cuentas se autentican con Google. Esto le
            enviará un enlace de acceso a su correo y lo autoriza de una vez con el rol que elijas aquí —
            de lo contrario, cualquiera que se autentique por su cuenta queda pendiente de aprobación
            hasta que alguien lo autorice desde esta misma página.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Correo (@{ALLOWED_EMAIL_DOMAIN})</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={`nombre@${ALLOWED_EMAIL_DOMAIN}`}
              className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Rol</label>
            <select
              value={inviteAccessRoleId}
              onChange={(e) => setInviteAccessRoleId(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
            >
              {accessRoles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>

          {inviteError && (
            <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-bg)] p-3 rounded-[var(--radius-sm)]">
              {inviteError}
            </div>
          )}
        </div>
      </SlideOver>
    </div>
  );
}

// =====================================================================
// PESTAÑA: ROLES — CRUD unificado de access_roles. Incluye los 4 roles
// de sistema (no eliminables, base_role fijo — protegido con trigger en
// Supabase) y los roles personalizados que se creen (100% libres).
// =====================================================================
function RolesTab({
  canWrite,
  accessRoles,
  loading,
  onReload
}: {
  canWrite: boolean;
  accessRoles: AccessRoleRecord[];
  loading: boolean;
  onReload: () => Promise<void>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AccessRoleRecord | null>(null);
  const [formData, setFormData] = useState({ nombre: '', descripcion: '', baseRole: 'visitante' as UserRole, moduleKeys: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [roleIdToDelete, setRoleIdToDelete] = useState<string | null>(null);

  const filteredRoles = useMemo(() => {
    return accessRoles.filter(r =>
      r.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.descripcion.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [accessRoles, searchQuery]);

  const handleNew = () => {
    setSelectedRole(null);
    setFormData({ nombre: '', descripcion: '', baseRole: 'visitante', moduleKeys: [] });
    setIsFormOpen(true);
  };

  const handleEdit = (r: AccessRoleRecord) => {
    setSelectedRole(r);
    setFormData({ nombre: r.nombre, descripcion: r.descripcion, baseRole: r.baseRole, moduleKeys: [...r.moduleKeys] });
    setIsFormOpen(true);
  };

  const toggleModule = (id: string) => {
    setFormData(p => ({
      ...p,
      moduleKeys: p.moduleKeys.includes(id) ? p.moduleKeys.filter(m => m !== id) : [...p.moduleKeys, id]
    }));
  };

  const handleSave = async () => {
    if (!formData.nombre.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.nombre.trim(),
        description: formData.descripcion.trim() || null,
        base_role: formData.baseRole,
        module_keys: formData.moduleKeys
      };
      if (selectedRole) {
        const { error } = await supabase.from('access_roles').update(payload).eq('access_role_id', selectedRole.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('access_roles').insert(payload);
        if (error) throw error;
      }
      setIsFormOpen(false);
      await onReload();
    } catch (err: any) {
      console.error('Error saving access role:', err);
      alert('Error al guardar el rol. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setRoleIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roleIdToDelete) return;
    try {
      const { error } = await supabase.from('access_roles').delete().eq('access_role_id', roleIdToDelete);
      if (error) throw error;
      await onReload();
    } catch (err: any) {
      console.error('Error deleting access role:', err);
      alert('Error al eliminar el rol. Detalle: ' + (err?.message || err));
    } finally {
      setDeleteConfirmOpen(false);
      setRoleIdToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-muted)] max-w-2xl">
          Los roles <strong>Super Admin, Supervisor, Operador y Visitante</strong> vienen del sistema y no
          se pueden eliminar (definen el nivel de seguridad real), pero sus módulos/accesos sí son
          editables. Puedes además crear roles nuevos, libres en todo.
        </p>
        {canWrite && (
          <Button variant="brand" className="gap-2 shrink-0" onClick={handleNew}>
            <Plus size={18} />
            Nuevo Rol
          </Button>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar por nombre o descripción..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-sans"
            />
          </div>
          <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums">{filteredRoles.length} roles</span>
        </div>

        <DataTable<AccessRoleRecord>
          columns={[
            {
              header: 'Nombre',
              accessor: (r) => (
                <div className="flex items-center gap-1.5">
                  {r.isSystem && <Lock size={12} className="text-[var(--color-text-faint)]" />}
                  <span className="font-bold text-sm text-[var(--color-text)]">{r.nombre}</span>
                </div>
              )
            },
            {
              header: 'Nivel de Seguridad',
              accessor: (r) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                  {ROLE_LABELS[r.baseRole]}
                </span>
              )
            },
            {
              header: 'Descripción',
              accessor: (r) => <span className="text-sm text-[var(--color-text-muted)]">{r.descripcion || 'Sin descripción'}</span>
            },
            {
              header: 'Módulos Habilitados',
              accessor: (r) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                  {r.moduleKeys.length} de {MODULE_CATALOG.length}
                </span>
              )
            },
            {
              header: 'Acciones',
              accessor: (r) => (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(r); }}
                    title={canWrite ? 'Editar rol' : 'Ver detalles'}
                    className={cn(
                      "p-2 rounded-md transition-all",
                      canWrite ? "text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10" : "opacity-0 invisible select-none"
                    )}
                    disabled={!canWrite}
                  >
                    <Edit2 size={16} />
                  </button>
                  {canWrite && (
                    r.isSystem ? (
                      <span
                        title="Rol de sistema — no se puede eliminar"
                        className="p-2 text-[var(--color-text-faint)] opacity-40 cursor-not-allowed"
                      >
                        <Trash2 size={16} />
                      </span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteRequest(r.id); }}
                        title="Eliminar Rol"
                        className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    )
                  )}
                </div>
              )
            }
          ]}
          data={filteredRoles}
          searchQuery=""
          onSearchChange={() => {}}
        />

        {filteredRoles.length === 0 && (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-4">
              <Tags className="w-8 h-8 text-[var(--color-text-faint)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">No se encontraron roles</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
              Crea uno nuevo para organizar qué módulos ve cada tipo de usuario en el menú.
            </p>
          </div>
        )}
      </div>

      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedRole ? `Editar Rol: ${selectedRole.nombre}` : 'Nuevo Rol'}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={!formData.nombre.trim() || saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar Rol
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {selectedRole?.isSystem && (
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-2)] p-3 rounded-[var(--radius-sm)] border border-[var(--color-border)]">
              <Lock size={14} className="shrink-0" />
              Este es un rol de sistema: no se puede eliminar y su Nivel de Seguridad no se puede cambiar, pero sus módulos sí.
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[var(--color-text)]">Nombre *</span>
            <input
              type="text"
              value={formData.nombre}
              onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej. Analista de Negocios"
              className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[var(--color-text)]">Descripción</span>
            <textarea
              rows={2}
              value={formData.descripcion}
              onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
              placeholder="Para qué se usa este rol..."
              className="p-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all resize-none"
            />
          </label>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Nivel de Seguridad *</label>
            <select
              value={formData.baseRole}
              onChange={(e) => setFormData(p => ({ ...p, baseRole: e.target.value as UserRole }))}
              disabled={!!selectedRole?.isSystem}
              className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)]"
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <p className="text-[10px] text-[var(--color-text-faint)]">
              Controla qué puede ejecutar o modificar un usuario con este rol (seguridad real, vía RLS en Supabase).
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[var(--color-text)] block">Módulos y Accesos</label>
              <p className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                Click en cada etiqueta para marcar/desmarcar los módulos que este rol podrá ver en el menú. ({formData.moduleKeys.length} seleccionados)
              </p>
            </div>

            {MODULE_SECTIONS.map(([section, items]) => (
              <div key={section} className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{section}</span>
                <div className="flex flex-wrap gap-1.5">
                  {items.map(m => {
                    const selected = formData.moduleKeys.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleModule(m.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                          selected
                            ? 'bg-teal-50 border-teal-500 text-teal-700'
                            : 'bg-white border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                        )}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SlideOver>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="¿Confirmar eliminación?"
        message="¿Está seguro de que desea eliminar este rol? Los usuarios que lo tengan asignado se quedarán sin rol y deberán reasignarse. Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setRoleIdToDelete(null);
        }}
        isDanger={true}
      />
    </div>
  );
}
