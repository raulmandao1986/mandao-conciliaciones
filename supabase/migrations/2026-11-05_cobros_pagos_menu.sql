-- =====================================================================
-- Menú "Cobros y Pagos" (Fase 4 "Nuevos cambios")
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- En los módulos Negocios y Mensajeros, "Cobros y Pagos" reemplaza a
-- "Cuentas por Pagar" y "Cuentas por Cobrar". Se habilita en los Roles de
-- Acceso que veían alguno de esos dos ítems (o la Conciliación del módulo).
-- No hay cambios de tablas: la vista lee las conciliaciones en estado
-- Confirmado y las pasa a Pagado / Cobrado al registrar el pago o el cobro.

update public.access_roles
set module_keys = array(select distinct unnest(module_keys || array['cobros-pagos-negocio'])),
    updated_at = now()
where module_keys && array['cuentas-pagar-negocio', 'cuentas-cobrar-negocio', 'conciliacion-negocio'];

update public.access_roles
set module_keys = array(select distinct unnest(module_keys || array['cobros-pagos-mensajero'])),
    updated_at = now()
where module_keys && array['cuentas-pagar-mensajero', 'cuentas-cobrar-mensajero', 'conciliacion-mensajero'];
