-- =====================================================================
-- Conciliación de Negocios calculada por Método de Pago del negocio
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real. Ya
-- está incorporado a supabase_schema.sql (fuente de verdad). Ver
-- Instrucciones Conciliaciones Mandao.md sección 6.4 para la
-- especificación funcional completa (fórmulas por método de pago).
--
-- Confirmado por el usuario 2026-09-30: un negocio con Método de Pago
-- "Transferencia-Efectivo" o "Transferencia-Exterior" genera DOS filas
-- de conciliación por rango de fechas (una por cada riel de
-- liquidación), no una sola. El índice único debe permitir esas dos
-- filas coexistiendo.

alter table public.conciliaciones_businesses
  add column moneda text not null default 'CUP' check (moneda in ('CUP', 'USD'));

drop index if exists public.uq_conciliaciones_businesses_range;

create unique index uq_conciliaciones_businesses_range
  on public.conciliaciones_businesses(business_id, fecha_inicial, fecha_final, via_pago);
