import React, { useState, useMemo, useEffect } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS, UserRole } from '../../lib/auth';
import { ShieldCheck, Search, Loader2, Edit2, Mail, Calendar, Save } from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/formatters';

interface UserRecord {
  id: string;
  nombre: string;
  email: string;
  rol: UserRole;
  activo: boolean;
  fechaAlta: string;
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  supervisor: 'Supervisor',
  operador: 'Operador',
  visitante: 'Visitante'
};

const ROLE_OPTIONS: UserRole[] = ['super_admin', 'supervisor', 'operador', 'visitante'];

// NOTA: esta página reemplaza el modelo anterior de Firestore (colecciones
// 'users' + 'roles', con permisos configurables por checklist). Ese modelo
// ya no aplica — auth.tsx migró el sistema a 4 roles FIJOS (sección 19.3
// del documento de instrucciones), definidos en profiles.role, sin tabla
// de roles configurables. Esta página administra el rol de usuarios ya
// registrados (vía Google OAuth); no crea usuarios nuevos.
export function RolesUsuariosPage() {
  const { user: authUser } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(authUser?.role || 'visitante');

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [formData, setFormData] = useState({ rol: 'visitante' as UserRole, activo: true });
  const [saving, setSaving] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, active, created_at')
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
      rol: p.role,
      activo: p.active,
      fechaAlta: p.created_at
    }));
    setUsers(records);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(u =>
      u.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ROLE_LABELS[u.rol].toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [users, searchQuery]);

  const handleEdit = (u: UserRecord) => {
    setSelectedUser(u);
    setFormData({ rol: u.rol, activo: u.activo });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: formData.rol, active: formData.activo, updated_at: new Date().toISOString() })
        .eq('id', selectedUser.id);
      if (error) throw error;
      logAuditEvent('Configuraciones', 'Rol de Usuario Actualizado', {
        usuarioId: selectedUser.id,
        usuarioEmail: selectedUser.email,
        nuevoRol: formData.rol,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
          <ShieldCheck className="w-6 h-6 text-brand-ink" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Roles y Usuarios</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Administre el rol de cada usuario registrado. El sistema usa 4 roles fijos: Super Admin, Supervisor, Operador y Visitante.
          </p>
        </div>
      </div>

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
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                  {ROLE_LABELS[item.rol]}
                </span>
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
              accessor: (item) => <StatusBadge status={item.activo ? 'activo' : 'bloqueado'} />
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
        title={`Editar Rol: ${selectedUser?.nombre}`}
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
            <label className="text-xs font-bold text-[var(--color-text)]">Rol del Sistema</label>
            <select
              value={formData.rol}
              onChange={(e) => setFormData(p => ({ ...p, rol: e.target.value as UserRole }))}
              className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
            >
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)] block mb-2">Estado</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData(p => ({ ...p, activo: true }))}
                className={cn(
                  'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                  formData.activo ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                )}
              >
                Activo
              </button>
              <button
                type="button"
                onClick={() => setFormData(p => ({ ...p, activo: false }))}
                className={cn(
                  'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                  !formData.activo ? 'bg-red-50 border-red-500 text-red-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                )}
              >
                Bloqueado
              </button>
            </div>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
