-- =====================================================================
-- Consecutivo por moneda y formato configurable desde la app
-- (Configuración -> Formato de Consecutivo)
-- =====================================================================
-- Correr en el SQL Editor del proyecto Supabase real, después de
-- 2026-10-27b_estados_reconciliacion.sql. Se puede volver a correr sin
-- problema (también si ya se corrió la versión anterior de este archivo,
-- de 6 series por entidad: la reemplaza).
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- (Las 4 series de este archivo las reemplaza 2026-11-02_consecutivo_por_entidad.sql:
-- una serie por entidad, sentido y moneda.)
-- Rectificado con el usuario 2026-10-28: el consecutivo se numera por
-- MONEDA y sentido, compartido por Negocios y Mensajeros — 4 series:
--   Por Pagar CUP (P260001) · Por Cobrar CUP (C260001)
--   Por Pagar USD (PU260001) · Por Cobrar USD (CU260001)
-- Cada serie define prefijo, año (AA, AAAA o ninguno), separador, dígitos
-- y reinicio. La clave `serie` es fija y es la que lleva el contador en
-- conciliacion_consecutivos: cambiar el prefijo NO reinicia la numeración.
-- Mensajeros hoy siempre en CUP, pero su conciliación ya guarda la moneda
-- para poder pagarles en USD en el futuro.

-- Moneda de la conciliación de mensajeros.
alter table public.conciliaciones_messengers
  add column if not exists moneda text not null default 'CUP' check (moneda in ('CUP', 'USD'));

create table if not exists public.consecutivo_series (
  serie text primary key,
  sentido text not null check (sentido in ('pagar', 'cobrar')),
  moneda text not null check (moneda in ('CUP', 'USD')),
  prefijo text not null unique check (prefijo ~ '^[A-Za-z0-9]{1,10}$'),
  formato_anio text not null default 'AA' check (formato_anio in ('AA', 'AAAA', 'ninguno')),
  separador text not null default '' check (separador in ('', '-', '.', '_')),
  digitos integer not null default 4 check (digitos between 1 and 10),
  reinicio text not null default 'anual' check (reinicio in ('anual', 'nunca')),
  updated_at timestamptz not null default now(),
  -- Sin año en el código, reiniciar cada año repetiría números.
  constraint consecutivo_series_reinicio_sin_anio check (formato_anio <> 'ninguno' or reinicio = 'nunca')
);

-- Versión anterior (series por entidad): se reemplaza por las 4 por moneda.
delete from public.consecutivo_series where serie in ('PN', 'CN', 'PNU', 'CNU', 'PM', 'CM');
alter table public.consecutivo_series drop column if exists entidad;
create unique index if not exists uq_consecutivo_series_sentido_moneda
  on public.consecutivo_series(sentido, moneda);

insert into public.consecutivo_series (serie, sentido, moneda, prefijo) values
  ('PCUP', 'pagar',  'CUP', 'P'),
  ('CCUP', 'cobrar', 'CUP', 'C'),
  ('PUSD', 'pagar',  'USD', 'PU'),
  ('CUSD', 'cobrar', 'USD', 'CU')
on conflict (serie) do nothing;

alter table public.consecutivo_series enable row level security;
drop policy if exists "read_all_authenticated" on public.consecutivo_series;
create policy "read_all_authenticated" on public.consecutivo_series
  for select using (public.is_active_user());
drop policy if exists "manage_consecutivo_series" on public.consecutivo_series;
create policy "manage_consecutivo_series" on public.consecutivo_series
  for update using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
grant select, update on public.consecutivo_series to anon, authenticated;

-- Generador: arma el código con el formato de la serie. Con reinicio
-- 'nunca' el contador vive en anio = 0 y arranca después del mayor número
-- ya usado por la serie, para no repetir códigos al cambiar de modo.
create or replace function public.next_conciliacion_consecutivo(p_prefijo text, p_fecha date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serie public.consecutivo_series%rowtype;
  v_anio int := extract(year from coalesce(p_fecha, current_date))::int;
  v_clave int;
  v_n int;
  v_anio_txt text;
begin
  select * into v_serie from public.consecutivo_series where serie = p_prefijo;
  if not found then
    v_serie.prefijo := p_prefijo;
    v_serie.formato_anio := 'AA';
    v_serie.separador := '';
    v_serie.digitos := 4;
    v_serie.reinicio := 'anual';
  end if;

  v_clave := case when v_serie.reinicio = 'anual' then v_anio else 0 end;
  insert into public.conciliacion_consecutivos as c (prefijo, anio, ultimo)
  values (p_prefijo, v_clave,
          case when v_clave = 0
               then coalesce((select max(ultimo) from public.conciliacion_consecutivos where prefijo = p_prefijo), 0) + 1
               else 1 end)
  on conflict (prefijo, anio) do update set ultimo = c.ultimo + 1
  returning ultimo into v_n;

  v_anio_txt := case v_serie.formato_anio
    when 'AA' then lpad((v_anio % 100)::text, 2, '0')
    when 'AAAA' then v_anio::text
    else null end;

  return v_serie.prefijo
    || v_serie.separador
    || coalesce(v_anio_txt || v_serie.separador, '')
    || case when length(v_n::text) < v_serie.digitos then lpad(v_n::text, v_serie.digitos, '0') else v_n::text end;
end;
$$;

revoke execute on function public.next_conciliacion_consecutivo(text, date) from public, anon, authenticated;

-- Serie = sentido (P/C) + moneda de la fila. Se asigna al insertar y al
-- reconciliar una liquidación que antes estaba en 0; una vez asignado no cambia.
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
      case when v_cxp > v_cxc then 'P' else 'C' end || coalesce(new.moneda, 'CUP'), new.fecha);
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
      case when v_pagar > v_cobrar then 'P' else 'C' end || coalesce(new.moneda, 'CUP'), new.fecha);
  end if;
  return new;
end;
$$;

-- Menú Configuración -> Formato de Consecutivo.
update public.access_roles
set module_keys = array(select distinct unnest(module_keys || array['formato-consecutivo'])),
    updated_at = now()
where 'metodos-pago-ordenes' = any(module_keys);
