-- =====================================================================
-- Corrección de comisión de Mensajeros + Tarifa de Alquiler de Mochila
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-09-30_conciliaciones_mensajeros_y_correcciones.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Confirmado por el usuario 2026-09-30: la comisión inicial de
-- Mensajeros es 10% (no 20% como se sembró por error) y el Alquiler de
-- Mochila se gestiona también desde Configuración -> Comisión Mandao,
-- con una tarifa configurable por tipo de mochila (Pequeña/Grande).

-- Corrige el valor sembrado solo si nadie lo ha tocado todavía desde la
-- UI (sigue en el 20% por defecto que pusimos por error).
update public.commission_settings
set percentage = 10.00, updated_at = now()
where entity_type = 'messengers' and percentage = 20.00;

create table public.backpack_rental_rates (
  backpack_type text primary key check (backpack_type in ('Pequeña', 'Grande')),
  rate numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.backpack_rental_rates (backpack_type, rate) values
  ('Pequeña', 0.00),
  ('Grande', 0.00)
on conflict (backpack_type) do nothing;

alter table public.backpack_rental_rates enable row level security;

create policy "read_all_authenticated" on public.backpack_rental_rates
  for select using (public.is_active_user());

create policy "manage_backpack_rental_rates" on public.backpack_rental_rates
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on public.backpack_rental_rates to anon, authenticated;
