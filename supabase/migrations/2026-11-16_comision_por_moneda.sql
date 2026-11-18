-- =====================================================================
-- Comisión Mandao por entidad y moneda
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Configuración -> Comisión Mandao permite agregar comisiones indicando a
-- quién aplica (Negocios / Mensajeros), la moneda y el porcentaje
-- (2026-11-16). La comisión en USD se aplica a las órdenes pagadas con
-- métodos en USD (Métodos de Pago -> Órdenes); si no existe, esas órdenes
-- usan la de CUP. Las comisiones actuales quedan como las de CUP.

alter table public.commission_settings
  add column if not exists currency text not null default 'CUP' check (currency in ('CUP', 'USD'));

alter table public.commission_settings drop constraint if exists commission_settings_pkey;
alter table public.commission_settings add constraint commission_settings_pkey primary key (entity_type, currency);
