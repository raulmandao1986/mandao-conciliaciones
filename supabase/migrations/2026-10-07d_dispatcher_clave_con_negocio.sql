-- =====================================================================
-- Clave única de órdenes del Dispatcher: Order ID + Área + Negocio + Fecha
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-07c_consecutivo_sin_saldo_cero.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Confirmado por el usuario 2026-10-07: dos negocios distintos pueden
-- tener el mismo Order ID el mismo día en la misma Área (cada negocio
-- numera sus órdenes). La clave anterior (Order ID + Área + Delivery Date)
-- impedía importar la segunda. Se incluye el negocio (Store), comparado
-- sin distinguir mayúsculas ni espacios al inicio/fin, igual que la
-- importación en VerificationPage.tsx y la Revisión (orderKey).
--
-- La nueva clave es menos restrictiva que la anterior, así que los datos ya
-- guardados la cumplen.

drop index if exists public.uq_dispatcher_order_area_date;

create unique index uq_dispatcher_order_area_store_date
  on public.dispatcher (order_id, area_id, lower(btrim(coalesce(store, ''))), delivery_date);
