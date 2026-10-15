-- =====================================================================
-- Consecutivo: las liquidaciones en 0 no se numeran
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-07b_consecutivo_conciliaciones.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Confirmado por el usuario 2026-10-07: si una conciliación sale
-- exactamente en 0 (CxP = CxC: no se paga ni se cobra) se registra SIN
-- consecutivo; la app lo muestra como notificación. Antes se numeraba
-- como "por Pagar" (PN/PM).

create or replace function public.set_consecutivo_conciliacion_negocio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cxp numeric := coalesce(new.cxp_tm, 0) + coalesce(new.cxp_sm, 0) + coalesce(new.cxp_us, 0);
  v_cxc numeric := coalesce(new.cxc_cu, 0);
begin
  if new.consecutivo is null and round(v_cxp - v_cxc, 2) <> 0 then
    new.consecutivo := public.next_conciliacion_consecutivo(
      case when v_cxp > v_cxc then 'PN' else 'CN' end, new.fecha);
  end if;
  return new;
end;
$$;

create or replace function public.set_consecutivo_conciliacion_mensajero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pagar numeric := coalesce(new.total_por_pagar, 0);
  v_cobrar numeric := coalesce(new.total_por_cobrar, 0);
begin
  if new.consecutivo is null and round(v_pagar - v_cobrar, 2) <> 0 then
    new.consecutivo := public.next_conciliacion_consecutivo(
      case when v_pagar > v_cobrar then 'PM' else 'CM' end, new.fecha);
  end if;
  return new;
end;
$$;

-- Conciliaciones en 0 que ya recibieron número con la regla anterior
-- (para revisarlas; NO se les quita el número automáticamente porque
-- dejaría huecos en una numeración que ya puede estar cruzada con caja):
--
-- select consecutivo, establecimiento as nombre, fecha from public.conciliaciones_businesses
--  where consecutivo is not null and round(cxp_tm + cxp_sm + cxp_us - cxc_cu, 2) = 0
-- union all
-- select consecutivo, mensajero, fecha from public.conciliaciones_messengers
--  where consecutivo is not null and round(total_por_pagar - total_por_cobrar, 2) = 0;
