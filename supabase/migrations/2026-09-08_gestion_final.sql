-- =====================================================================
-- MIGRACIÓN INCREMENTAL FINAL — resto del módulo Gestión
-- Fecha: 2026-09-08
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, DESPUÉS de haber
-- corrido ya supabase_migration_gestion_catalogos.sql (payment_methods
-- y exchange_rates). Combina en un solo script:
--   1. Política de lectura faltante en audit_logs
--   2. Campos completos de Mensajeros
--   3. Tabla businesses (Gestión de Negocios)
--   4. Roles y Usuarios (columna email + política de UPDATE en profiles)
-- Ya está todo incorporado a supabase_schema.sql (fuente de verdad).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lectura de audit_logs (faltaba por completo)
-- ---------------------------------------------------------------------
create policy "read_audit_logs_admin_supervisor" on public.audit_logs
  for select using (public.is_admin_or_supervisor());

-- ---------------------------------------------------------------------
-- 2. Mensajeros — campos completos (la tabla ya existe como catálogo
--    mínimo id/name/active usado por Disponibilidad)
-- ---------------------------------------------------------------------
alter table public.messengers
  add column ci text,
  add column phone text,
  add column fiscal_card text,
  add column fiscal_account text,
  add column payment_method text,
  add column backpack_type text not null default 'Grande',
  add column start_date date,
  add column end_date date,
  add column area_id uuid references public.areas(area_id),
  add column comments text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();
-- RLS ya cubierta por "read_all_authenticated" y "manage_messengers" existentes.

-- ---------------------------------------------------------------------
-- 3. Negocios — tabla nueva
-- ---------------------------------------------------------------------
create table public.businesses (
  business_id uuid primary key default gen_random_uuid(),
  name text not null,
  payment_method text,
  active boolean not null default true,
  area_id uuid references public.areas(area_id),
  contact_name text,
  phone text,
  email text,
  contract_name text,
  tax_id text,
  address text,
  external_url text,
  cup_account jsonb,
  personal_account jsonb,
  check_account jsonb,
  exterior_zelle jsonb,
  exterior_tropipay jsonb,
  exterior_transfer jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.businesses enable row level security;

create policy "read_all_authenticated" on public.businesses for select using (auth.role() = 'authenticated');

create policy "manage_businesses" on public.businesses
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on public.businesses to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Roles y Usuarios — email en profiles + política de UPDATE
-- ---------------------------------------------------------------------
alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'visitante');
  return new;
end;
$$ language plpgsql security definer;

create policy "manage_profiles_super_admin" on public.profiles
  for update using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
