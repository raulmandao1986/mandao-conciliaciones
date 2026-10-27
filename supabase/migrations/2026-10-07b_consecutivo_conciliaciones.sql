-- =====================================================================
-- Consecutivo de Conciliaciones (match contra caja)
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-07_conciliaciones_pdf_google_drive.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Pedido por el usuario 2026-10-07: cada conciliación registrada lleva un
-- consecutivo con el que se cruza contra la caja:
--   PN[AA]XXXX  Cuenta por Pagar   de Negocios   (ej. PN260001)
--   CN[AA]XXXX  Cuenta por Cobrar  de Negocios   (ej. CN260001)
--   PM[AA]XXXX  Cuenta por Pagar   de Mensajeros (ej. PM260001)
--   CM[AA]XXXX  Cuenta por Cobrar  de Mensajeros (ej. CM260001)
-- Es "por Pagar" si el total CxP es mayor o igual que el CxC (Mandao le
-- paga al negocio/mensajero) y "por Cobrar" si el CxC es mayor. [AA] es el
-- año de la fecha de la conciliación; la numeración reinicia cada año y es
-- independiente por prefijo.
--
-- Se asigna en la base de datos (trigger BEFORE INSERT) con un contador por
-- prefijo+año que se incrementa de forma atómica: dos conciliaciones
-- registradas a la vez nunca reciben el mismo número. Una vez asignado no
-- cambia, aunque luego se corrijan montos.

create table public.conciliacion_consecutivos (
  prefijo text not null,
  anio int not null,
  ultimo int not null default 0,
  primary key (prefijo, anio)
);

alter table public.conciliacion_consecutivos enable row level security;
-- Sin políticas: solo lo usa la función SECURITY DEFINER de abajo.

create or replace function public.next_conciliacion_consecutivo(p_prefijo text, p_fecha date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio int := extract(year from coalesce(p_fecha, current_date))::int;
  v_n int;
begin
  insert into public.conciliacion_consecutivos as c (prefijo, anio, ultimo)
  values (p_prefijo, v_anio, 1)
  on conflict (prefijo, anio) do update set ultimo = c.ultimo + 1
  returning ultimo into v_n;
  -- 4 dígitos (0001); si un año supera 9999 se usan los dígitos necesarios.
  return p_prefijo || lpad((v_anio % 100)::text, 2, '0')
    || case when v_n < 10000 then lpad(v_n::text, 4, '0') else v_n::text end;
end;
$$;

create or replace function public.set_consecutivo_conciliacion_negocio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.consecutivo is null then
    new.consecutivo := public.next_conciliacion_consecutivo(
      case when coalesce(new.cxp_tm, 0) + coalesce(new.cxp_sm, 0) + coalesce(new.cxp_us, 0) >= coalesce(new.cxc_cu, 0)
           then 'PN' else 'CN' end,
      new.fecha);
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
begin
  if new.consecutivo is null then
    new.consecutivo := public.next_conciliacion_consecutivo(
      case when coalesce(new.total_por_pagar, 0) >= coalesce(new.total_por_cobrar, 0)
           then 'PM' else 'CM' end,
      new.fecha);
  end if;
  return new;
end;
$$;

alter table public.conciliaciones_businesses add column consecutivo text unique;
alter table public.conciliaciones_messengers add column consecutivo text unique;

-- Conciliaciones ya registradas: se numeran en el orden en que se crearon.
do $$
declare r record;
begin
  for r in select conciliacion_id, fecha, cxp_tm, cxp_sm, cxp_us, cxc_cu
           from public.conciliaciones_businesses where consecutivo is null order by created_at, conciliacion_id loop
    update public.conciliaciones_businesses
      set consecutivo = public.next_conciliacion_consecutivo(
        case when coalesce(r.cxp_tm, 0) + coalesce(r.cxp_sm, 0) + coalesce(r.cxp_us, 0) >= coalesce(r.cxc_cu, 0) then 'PN' else 'CN' end,
        r.fecha)
      where conciliacion_id = r.conciliacion_id;
  end loop;
  for r in select conciliacion_id, fecha, total_por_pagar, total_por_cobrar
           from public.conciliaciones_messengers where consecutivo is null order by created_at, conciliacion_id loop
    update public.conciliaciones_messengers
      set consecutivo = public.next_conciliacion_consecutivo(
        case when coalesce(r.total_por_pagar, 0) >= coalesce(r.total_por_cobrar, 0) then 'PM' else 'CM' end,
        r.fecha)
      where conciliacion_id = r.conciliacion_id;
  end loop;
end $$;

create trigger trg_consecutivo_conciliacion_negocio
  before insert on public.conciliaciones_businesses
  for each row execute function public.set_consecutivo_conciliacion_negocio();

create trigger trg_consecutivo_conciliacion_mensajero
  before insert on public.conciliaciones_messengers
  for each row execute function public.set_consecutivo_conciliacion_mensajero();

-- Solo los triggers deben llamar al generador.
revoke execute on function public.next_conciliacion_consecutivo(text, date) from public, anon, authenticated;
