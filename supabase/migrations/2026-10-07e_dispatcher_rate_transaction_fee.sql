-- =====================================================================
-- Dispatcher: columnas "Rate" y "Transaction Fee"
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-07d_dispatcher_clave_con_negocio.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Reportado por el usuario 2026-10-07: la tabla dispatcher no tenía las
-- columnas "Rate" ni "Transaction Fee" de la hoja Orders, y la importación
-- leía "Transaction Fee" (con "Tax" solo como respaldo) y lo guardaba en
-- `tax`. La Revisión compara "Tax" del Sheet contra `tax` de la BD, así que
-- marcaba diferencias críticas en órdenes recién importadas.
--
-- Desde ahora cada columna se guarda en la suya (src/lib/dispatcherOrders.ts).
-- Para las órdenes ya importadas, `tax` contiene en realidad el
-- Transaction Fee: se mueve a `transaction_fee` y `tax` queda en 0. El Tax
-- y el Rate reales de esas órdenes se completan desde la Revisión
-- ("Sincronizar" las diferencias que marque).

alter table public.dispatcher
  add column rate numeric(18,6),
  add column transaction_fee numeric(12,2);

update public.dispatcher
set transaction_fee = tax,
    tax = 0
where transaction_fee is null;
