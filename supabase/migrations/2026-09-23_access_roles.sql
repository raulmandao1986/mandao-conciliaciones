-- =====================================================================
-- Roles de Acceso (Configuración → Roles y Usuarios → pestaña "Roles")
-- =====================================================================
-- Capa NUEVA y SEPARADA del modelo de seguridad. NO reemplaza ni toca
-- profiles.role (los 4 roles fijos siguen siendo la única fuente de
-- verdad para las políticas RLS de todo el sistema). "Roles de Acceso"
-- es solo un agrupador configurable de qué ítems de menú ve un usuario
-- en la UI. Correr una sola vez en el SQL Editor del proyecto Supabase
-- real. Ya está incorporado a supabase_schema.sql (fuente de verdad).

create table public.access_roles (
  access_role_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  module_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column access_role_id uuid references public.access_roles(access_role_id) on delete set null;

alter table public.access_roles enable row level security;

create policy "read_all_authenticated" on public.access_roles
  for select using (public.is_active_user());

create policy "manage_access_roles" on public.access_roles
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on public.access_roles to anon, authenticated;
