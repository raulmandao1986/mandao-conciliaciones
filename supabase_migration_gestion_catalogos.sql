-- =====================================================================
-- MIGRACIÓN INCREMENTAL — Catálogos de Gestión (Métodos de Pago, Razón de Cambio)
-- Fecha: 2026-09-08
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (proyecto ewmjfyjgzocbgzewhotc).
-- Ya está incorporada a supabase_schema.sql (fuente de verdad del esquema
-- completo); este archivo es solo el delta a correr sobre una base de
-- datos que ya tiene el esquema v2/v5 original (Dispatcher/Disponibilidad).
-- =====================================================================

-- 13. PAYMENT_METHODS (= colección Firestore 'MetodosPago')
create table public.payment_methods (
  payment_method_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  applies_to_businesses boolean not null default true,
  applies_to_messengers boolean not null default true,
  applies_to_orders boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14. EXCHANGE_RATES (= colección Firestore 'RazonCambio')
create table public.exchange_rates (
  exchange_rate_id uuid primary key default gen_random_uuid(),
  name text not null,
  rate_cup numeric(12,2) not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_methods enable row level security;
alter table public.exchange_rates enable row level security;

create policy "read_all_authenticated" on public.payment_methods for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.exchange_rates for select using (auth.role() = 'authenticated');

create policy "manage_payment_methods" on public.payment_methods
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_exchange_rates" on public.exchange_rates
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- Grants: la base ya tiene "alter default privileges ... grant ... to anon,
-- authenticated" desde el esquema original (ver supabase_schema.sql, sección
-- GRANTS). Si esta migración se corre con el mismo rol propietario que
-- ejecutó esa sentencia (el caso normal al usar el SQL Editor de Supabase),
-- estas 2 tablas nuevas heredan los grants automáticamente. Si por alguna
-- razón no fuera así, correr estas 3 líneas de más como respaldo:
grant select, insert, update, delete on public.payment_methods to anon, authenticated;
grant select, insert, update, delete on public.exchange_rates to anon, authenticated;
