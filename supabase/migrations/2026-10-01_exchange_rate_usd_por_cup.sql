-- =====================================================================
-- Tasa de cambio en USD por 1 CUP (admite valores menores que 1)
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-09-30e_saldo_cup_mensajeros_sin_tasa.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Confirmado por el usuario 2026-10-01: la tasa que se usa en producción
-- es 0.002, es decir 1 CUP = 0.002 USD (≈ 500 CUP por USD). Con
-- numeric(12,2) ese valor se guardaba redondeado a 0.00, así que se amplía
-- a 8 decimales. Conciliación de Negocios ("Exterior") convierte con
-- USD = CUP × tasa, y la sincronización con El Toque (que publica CUP por
-- USD) guarda el inverso 1 / tasa_el_toque.
--
-- Al 2026-10-01 la tabla no tenía filas, así que no hay valores en la
-- convención anterior (CUP por USD) que convertir.

alter table public.exchange_rates
  alter column rate_cup type numeric(18,8);

comment on column public.exchange_rates.rate_cup is
  'USD por 1 CUP (ej. 0.002 = 1 CUP vale 0.002 USD, ≈ 500 CUP por USD).';
