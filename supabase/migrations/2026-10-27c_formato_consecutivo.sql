-- =====================================================================
-- Formato del consecutivo de conciliaciones, configurable desde la app
-- (Configuración -> Tipología de Pago -> Formato de Consecutivo)
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-27b_estados_reconciliacion.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Cada serie (Negocios/Mensajeros × Por Pagar/Por Cobrar × CUP/USD) define
-- prefijo, año (AA, AAAA o ninguno), separador, dígitos y reinicio. La
-- clave `serie` es fija (PN, CN, PNU, CNU, PM, CM) y es la que lleva el
-- contador en conciliacion_consecutivos: cambiar el prefijo NO reinicia la
-- numeración. Los valores iniciales generan exactamente el formato actual
-- (PN260001).

create table public.consecutivo_series (
  serie text primary key,
  entidad text not null check (entidad in ('negocios', 'mensajeros')),
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

insert into public.consecutivo_series (serie, entidad, sentido, moneda, prefijo) values
  ('PN',  'negocios',   'pagar',  'CUP', 'PN'),
  ('CN',  'negocios',   'cobrar', 'CUP', 'CN'),
  ('PNU', 'negocios',   'pagar',  'USD', 'PNU'),
  ('CNU', 'negocios',   'cobrar', 'USD', 'CNU'),
  ('PM',  'mensajeros', 'pagar',  'CUP', 'PM'),
  ('CM',  'mensajeros', 'cobrar', 'CUP', 'CM')
on conflict (serie) do nothing;

alter table public.consecutivo_series enable row level security;
create policy "read_all_authenticated" on public.consecutivo_series
  for select using (public.is_active_user());
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

-- Menú Configuración -> Tipología de Pago -> Formato de Consecutivo.
update public.access_roles
set module_keys = array(select distinct unnest(module_keys || array['formato-consecutivo'])),
    updated_at = now()
where 'tipologia-cobrar' = any(module_keys);
