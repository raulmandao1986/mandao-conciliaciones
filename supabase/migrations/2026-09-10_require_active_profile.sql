-- =====================================================================
-- Requerir profiles.active = true para tener acceso real al sistema
-- =====================================================================
-- Hasta ahora, cualquier cuenta de Google @mandao.app que iniciara
-- sesión quedaba automáticamente registrada como 'visitante' con
-- active = true (por el trigger handle_new_user), y las políticas de
-- lectura solo chequeaban auth.role() = 'authenticated' — es decir,
-- "está logueado en Supabase", sin verificar que un Super Admin la
-- hubiera autorizado de verdad. Este script:
--
--   1. Hace que los profiles NUEVOS entren con active = false
--      ("pendiente de autorización") en vez de true.
--   2. Hace que current_user_role() devuelva NULL para un usuario
--      inactivo, lo que automáticamente le niega TODAS las políticas
--      de escritura (ya construidas sobre current_user_role()/
--      is_admin_or_supervisor()/can_execute_processes()).
--   3. Agrega is_active_user() y lo usa en las políticas de SOLO
--      LECTURA (que no pasaban por current_user_role()).
--
-- Es seguro correrlo contra un proyecto ya en uso: create or replace
-- function y drop policy if exists + create policy son idempotentes.
-- Los profiles YA EXISTENTES no se tocan (nadie que ya tenga acceso
-- se queda afuera con este script).
--
-- Ejecutar una sola vez en el SQL Editor del proyecto Supabase real.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'visitante', false);
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.current_user_role()
returns public.user_role
language sql stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "read_all_authenticated" on public.areas;
create policy "read_all_authenticated" on public.areas for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.dispatcher;
create policy "read_all_authenticated" on public.dispatcher for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.dispatcher_verifications;
create policy "read_all_authenticated" on public.dispatcher_verifications for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.dispatcher_incidents;
create policy "read_all_authenticated" on public.dispatcher_incidents for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.dispatcher_changes;
create policy "read_all_authenticated" on public.dispatcher_changes for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.availabilities;
create policy "read_all_authenticated" on public.availabilities for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.availability_imports;
create policy "read_all_authenticated" on public.availability_imports for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.availability_verifications;
create policy "read_all_authenticated" on public.availability_verifications for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.availability_incidents;
create policy "read_all_authenticated" on public.availability_incidents for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.messengers;
create policy "read_all_authenticated" on public.messengers for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.payment_methods;
create policy "read_all_authenticated" on public.payment_methods for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.exchange_rates;
create policy "read_all_authenticated" on public.exchange_rates for select using (public.is_active_user());

drop policy if exists "read_all_authenticated" on public.businesses;
create policy "read_all_authenticated" on public.businesses for select using (public.is_active_user());

-- IMPORTANTE: verifica que tu propio usuario (y cualquier otro que ya
-- deba tener acceso hoy) tenga active = true ANTES de correr este
-- script contra producción, o quedará fuera hasta que otro super_admin
-- ya activo lo reactive desde Roles y Usuarios:
--   select email, role, active from public.profiles order by email;
