-- =====================================================================
-- Conciliaciones: % de comisión y tasa de cambio usados en el cálculo
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-07e_dispatcher_rate_transaction_fee.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- El PDF de Conciliación (rediseñado 2026-10-15) detalla cada orden con su
-- Beneficio Negocio y Comisión Mandao, y en las filas "Exterior" los montos
-- en USD. Para poder regenerarlo después con exactamente los mismos números
-- se guarda el % de comisión vigente y, en las filas en USD, la tasa de
-- cambio (USD por 1 CUP) con que se calculó. Si luego cambian en
-- Configuración, las conciliaciones ya registradas no se alteran.

alter table public.conciliaciones_businesses
  add column comision_pct numeric(5,2),
  add column tasa_cambio numeric(18,8);

alter table public.conciliaciones_messengers
  add column comision_pct numeric(5,2);
