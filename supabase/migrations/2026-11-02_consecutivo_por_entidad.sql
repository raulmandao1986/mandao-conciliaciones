-- =====================================================================
-- Consecutivo: una serie por Entidad × Sentido × Moneda (8 series)
-- =====================================================================
-- Correr en el SQL Editor del proyecto Supabase real, después de
-- 2026-10-27c_formato_consecutivo.sql. Se puede volver a correr sin problema.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Rectificado con el usuario 2026-11-02: cada combinación tiene su propio
-- formato y numeración, para Negocios y para Mensajeros:
--   Negocios   Por Pagar CUP (PN) · Por Cobrar CUP (CN) · Por Pagar USD (PNU) · Por Cobrar USD (CNU)
--   Mensajeros Por Pagar CUP (PM) · Por Cobrar CUP (CM) · Por Pagar USD (PMU) · Por Cobrar USD (CMU)
-- Las claves de serie coinciden con las originales (PN, CN, PM, CM, PNU,
-- CNU), así que sus contadores continúan donde iban y no se repiten códigos
-- ya emitidos. Las 4 series generales de 2026-10-27c (P, C, PU, CU) se
-- eliminan; las conciliaciones que ya tengan esos códigos los conservan.

alter table public.consecutivo_series add column if not exists entidad text;

delete from public.consecutivo_series where serie in ('PCUP', 'CCUP', 'PUSD', 'CUSD');
drop index if exists public.uq_consecutivo_series_sentido_moneda;

insert into public.consecutivo_series (serie, entidad, sentido, moneda, prefijo) values
  ('PN',  'negocios',   'pagar',  'CUP', 'PN'),
  ('CN',  'negocios',   'cobrar', 'CUP', 'CN'),
  ('PNU', 'negocios',   'pagar',  'USD', 'PNU'),
  ('CNU', 'negocios',   'cobrar', 'USD', 'CNU'),
  ('PM',  'mensajeros', 'pagar',  'CUP', 'PM'),
  ('CM',  'mensajeros', 'cobrar', 'CUP', 'CM'),
  ('PMU', 'mensajeros', 'pagar',  'USD', 'PMU'),
  ('CMU', 'mensajeros', 'cobrar', 'USD', 'CMU')
on conflict (serie) do nothing;

alter table public.consecutivo_series alter column entidad set not null;
alter table public.consecutivo_series drop constraint if exists consecutivo_series_entidad_check;
alter table public.consecutivo_series add constraint consecutivo_series_entidad_check
  check (entidad in ('negocios', 'mensajeros'));
create unique index if not exists uq_consecutivo_series_entidad_sentido_moneda
  on public.consecutivo_series(entidad, sentido, moneda);

-- Serie = sentido (P/C) + entidad (N/M) + U si la fila está en USD.
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
      case when v_cxp > v_cxc then 'P' else 'C' end || 'N'
        || case when new.moneda = 'USD' then 'U' else '' end,
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
declare
  v_pagar numeric := coalesce(new.total_por_pagar, 0);
  v_cobrar numeric := coalesce(new.total_por_cobrar, 0);
begin
  if new.consecutivo is null and round(v_pagar - v_cobrar, 2) <> 0 then
    new.consecutivo := public.next_conciliacion_consecutivo(
      case when v_pagar > v_cobrar then 'P' else 'C' end || 'M'
        || case when new.moneda = 'USD' then 'U' else '' end,
      new.fecha);
  end if;
  return new;
end;
$$;
