-- =====================================================================
-- PERMISOS POR MENÚ EN ROLES DE ACCESO (2026-11-19)
-- =====================================================================
-- Agrega a public.access_roles la matriz de permisos por menú (Ver, Crear,
-- Editar, Eliminar) que se administra en Configuración → Roles y Usuarios.
--
-- Formato de la columna `permisos` (jsonb):
--   {
--     "<moduleKey>": { "ver": bool, "crear": bool, "editar": bool, "eliminar": bool },
--     ...
--   }
-- donde <moduleKey> es el id de un ítem de MODULE_CATALOG
-- (src/lib/moduleCatalog.ts), p. ej. "gestion-negocios".
--
-- Reglas de interpretación (src/lib/permisos.ts → usePermisos):
--   * "ver" equivale a que el menú esté en module_keys (module_keys sigue
--     siendo la fuente de verdad de la visibilidad del menú).
--   * Un menú presente en module_keys SIN entrada en `permisos` conserva el
--     comportamiento anterior: todas las acciones permitidas, salvo lo que
--     ya impida la seguridad real por rol (profiles.role vía RLS).
--   * El rol base 'super_admin' siempre tiene todo, ignore lo que diga aquí.
--
-- Estos permisos son de INTERFAZ (ocultar/deshabilitar acciones). La
-- seguridad real sigue siendo profiles.role + políticas RLS, que esta
-- migración NO modifica.
-- =====================================================================

alter table public.access_roles
  add column if not exists permisos jsonb not null default '{}'::jsonb;

comment on column public.access_roles.permisos is
  'Permisos de interfaz por menú: { "<moduleKey>": { "ver": bool, "crear": bool, "editar": bool, "eliminar": bool } }. '
  'Menú en module_keys sin entrada aquí = todas las acciones permitidas (limitadas solo por profiles.role/RLS). '
  'super_admin siempre tiene todo.';
