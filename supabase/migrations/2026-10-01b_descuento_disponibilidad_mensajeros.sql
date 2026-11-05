-- =====================================================================
-- % de descuento sobre Disponibilidades (Conciliación de Mensajeros)
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-01_exchange_rate_usd_por_cup.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Pedido por el usuario 2026-10-01: en Configuración -> Comisión Mandao se
-- configura un % que se descuenta de las Disponibilidades del mensajero.
-- Conciliación de Mensajeros muestra y suma a Total por Pagar el monto ya
-- descontado: Disponibilidades = suma(amount_to_pay) × (1 − % / 100).
-- Arranca en 0% para que ninguna conciliación cambie hasta que se defina.
-- Tabla propia (no commission_settings) porque no es una comisión con
-- baldes CxC/CxP, igual que backpack_rental_rates.

create table public.availability_discount_settings (
  entity_type text primary key check (entity_type = 'messengers'),
  percentage numeric(5,2) not null default 0 check (percentage >= 0 and percentage <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.availability_discount_settings (entity_type, percentage) values
  ('messengers', 0.00)
on conflict (entity_type) do nothing;

alter table public.availability_discount_settings enable row level security;

create policy "read_all_authenticated" on public.availability_discount_settings
  for select using (public.is_active_user());

create policy "manage_availability_discount_settings" on public.availability_discount_settings
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on public.availability_discount_settings to anon, authenticated;
