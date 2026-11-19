import { useAuth } from './auth';

// Permisos de INTERFAZ por menú (Ver, Crear, Editar, Eliminar), definidos por
// Rol de Acceso en Configuración → Roles y Usuarios y guardados en
// access_roles.permisos (ver supabase/migrations/2026-11-19_permisos_roles.sql).
// La seguridad real sigue siendo profiles.role + RLS: estos permisos solo
// ocultan/deshabilitan acciones y siempre se combinan con las reglas por rol
// (ROLE_CAN_MANAGE_CATALOGS, etc.).
export interface PermisosModulo { ver: boolean; crear: boolean; editar: boolean; eliminar: boolean }

export type PermisosPorModulo = Record<string, PermisosModulo>;

export const PERMISOS_TODOS: PermisosModulo = { ver: true, crear: true, editar: true, eliminar: true };
export const PERMISOS_NINGUNO: PermisosModulo = { ver: false, crear: false, editar: false, eliminar: false };

// Normaliza el jsonb leído de Supabase (puede venir null, con claves
// faltantes o con valores no booleanos) a un mapa limpio.
export function normalizarPermisos(raw: unknown): PermisosPorModulo {
  const out: PermisosPorModulo = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const v = val as Record<string, unknown>;
    out[key] = {
      ver: v.ver !== false,
      crear: v.crear === true,
      editar: v.editar === true,
      eliminar: v.eliminar === true,
    };
  }
  return out;
}

// Lógica pura (útil fuera de componentes).
export function resolverPermisos(
  role: string | undefined,
  accessModules: string[] | null | undefined,
  permisos: PermisosPorModulo | null | undefined,
  moduleKey: string
): PermisosModulo {
  if (role === 'super_admin') return PERMISOS_TODOS;
  if (!role) return PERMISOS_NINGUNO;
  if (accessModules && !accessModules.includes(moduleKey)) return PERMISOS_NINGUNO;
  const entrada = permisos?.[moduleKey];
  if (!entrada) return PERMISOS_TODOS;
  // "ver" queda implícito por estar el menú en module_keys.
  return { ver: true, crear: entrada.crear, editar: entrada.editar, eliminar: entrada.eliminar };
}

export function usePermisos(moduleKey: string): PermisosModulo {
  const { user } = useAuth();
  return resolverPermisos(user?.role, user?.accessModules, user?.permisos, moduleKey);
}
