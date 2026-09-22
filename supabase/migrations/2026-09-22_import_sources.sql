-- =====================================================================
-- Documentos de Importación (Configuración → Documentos de Importación)
-- =====================================================================
-- Catálogo de IDs de Google Sheet para la Importación Masiva de Gestión
-- de Negocios/Mensajeros. Correr una sola vez en el SQL Editor del
-- proyecto Supabase real. Ya está incorporado a supabase_schema.sql
-- (fuente de verdad).

create table public.import_sources (
  import_source_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('businesses', 'messengers')),
  name text not null,
  sheet_document_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.import_sources enable row level security;

create policy "read_all_authenticated" on public.import_sources
  for select using (public.is_active_user());

create policy "manage_import_sources" on public.import_sources
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on public.import_sources to anon, authenticated;
