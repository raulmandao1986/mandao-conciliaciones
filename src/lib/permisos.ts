import { useAuth } from './auth';
import { plantillaAccionDe } from './permisosCatalogo';

// Permisos por menú y por acción (2026-11-19c). Se configuran por Rol de
// Acceso en Configuración → Roles y Usuarios y se guardan en
// access_roles.permisos: { "<menu>": { "<accion>": true | false } }.
// Catálogo de acciones en permisosCatalogo.ts. La base de datos aplica la
// misma regla con public.tiene_permiso(menu, accion) (migración
// 2026-11-19c_permisos_por_accion.sql), así que lo que aquí se oculta
// tampoco se puede hacer por fuera de la interfaz.
//
// Regla (igual en la BD):
//   - Super Admin: todo.
//   - Menú fuera de module_keys: nada.
//   - "ver": implícito por tener el menú.
//   - Acción marcada en el rol: su valor; sin marcar: plantilla del rol base.

export type PermisosPorModulo = Record<string, Record<string, boolean>>;

export interface PermisosModulo {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  puede: (accion: string) => boolean;
}

// Marca del formato nuevo (la migración descarta los permisos anteriores que
// no la tengan).
export const FORMATO_PERMISOS = 2;

// Normaliza el jsonb leído de Supabase a { menu: { accion: boolean } }.
export function normalizarPermisos(raw: unknown): PermisosPorModulo {
  const out: PermisosPorModulo = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  if (r._formato !== FORMATO_PERMISOS) return out;
  for (const [menu, val] of Object.entries(r)) {
    if (menu.startsWith('_') || !val || typeof val !== 'object') continue;
    const acciones: Record<string, boolean> = {};
    for (const [accion, v] of Object.entries(val as Record<string, unknown>)) {
      if (typeof v === 'boolean') acciones[accion] = v;
    }
    out[menu] = acciones;
  }
  return out;
}

// Lógica pura (útil fuera de componentes).
export function puedeAccion(
  role: string | undefined,
  accessModules: string[] | null | undefined,
  permisos: PermisosPorModulo | null | undefined,
  menu: string,
  accion: string
): boolean {
  if (role === 'super_admin') return true;
  if (!role) return false;
  if (accessModules && !accessModules.includes(menu)) return false;
  if (accion === 'ver') return true;
  const v = permisos?.[menu]?.[accion];
  if (typeof v === 'boolean') return v;
  return plantillaAccionDe(role, menu, accion);
}

export function resolverPermisos(
  role: string | undefined,
  accessModules: string[] | null | undefined,
  permisos: PermisosPorModulo | null | undefined,
  menu: string
): PermisosModulo {
  const puede = (accion: string) => puedeAccion(role, accessModules, permisos, menu, accion);
  return { ver: puede('ver'), crear: puede('crear'), editar: puede('editar'), eliminar: puede('eliminar'), puede };
}

export function usePermisos(menu: string): PermisosModulo {
  const { user } = useAuth();
  return resolverPermisos(user?.role, user?.accessModules, user?.permisos, menu);
}
