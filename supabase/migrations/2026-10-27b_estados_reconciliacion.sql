-- =====================================================================
-- Conciliaciones: estados nuevos, consecutivo por moneda y reconciliación
-- (Fase 2 "Nuevos cambios")
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-27_tipologia_moneda_grupo_pagos.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- 1. Estados (confirmado por el usuario 2026-10-27, "Reemplazar"):
--      Nuevo -> Enviado -> Confirmado -> Pagado (Mandao paga) / Cobrado (Mandao cobra)
--    Los anteriores se migran: Aprobado -> Confirmado, Incorrecto -> Nuevo,
--    Facturado -> Pagado o Cobrado según el signo del neto.
-- 2. Consecutivo por moneda ("por riel, número por moneda"): las filas en
--    USD (riel Exterior) llevan su propia numeración con una U:
--    PN260001 (CUP) y PNU260001 (USD). Mensajeros siempre en CUP.
-- 3. Reconciliación: una conciliación en Nuevo o Enviado puede volver a
--    calcularse; se actualizan los montos, se mantiene el consecutivo y la
--    base registra los valores anteriores y nuevos en
--    conciliaciones_reconciliaciones. Desde Confirmado los montos quedan
--    bloqueados.

-- 1. Estados -----------------------------------------------------------
alter table public.conciliaciones_businesses drop constraint if exists conciliaciones_businesses_estado_check;
alter table public.conciliaciones_messengers drop constraint if exists conciliaciones_messengers_estado_check;

update public.conciliaciones_businesses set estado = case
    when estado = 'Aprobado' then 'Confirmado'
    when estado = 'Incorrecto' then 'Nuevo'
    when estado = 'Facturado' then case when cxp_tm + cxp_sm + cxp_us >= cxc_cu then 'Pagado' else 'Cobrado' end
    else estado end
where estado in ('Aprobado', 'Incorrecto', 'Facturado');

update public.conciliaciones_messengers set estado = case
    when estado = 'Aprobado' then 'Confirmado'
    when estado = 'Incorrecto' then 'Nuevo'
    when estado = 'Facturado' then case when total_por_pagar >= total_por_cobrar then 'Pagado' else 'Cobrado' end
    else estado end
where estado in ('Aprobado', 'Incorrecto', 'Facturado');

alter table public.conciliaciones_businesses add constraint conciliaciones_businesses_estado_check
  check (estado in ('Nuevo', 'Enviado', 'Confirmado', 'Pagado', 'Cobrado'));
alter table public.conciliaciones_messengers add constraint conciliaciones_messengers_estado_check
  check (estado in ('Nuevo', 'Enviado', 'Confirmado', 'Pagado', 'Cobrado'));

alter table public.conciliaciones_businesses
  add column estado_at timestamptz,
  add column reconciliaciones integer not null default 0,
  add column reconciliado_at timestamptz;
alter table public.conciliaciones_messengers
  add column estado_at timestamptz,
  add column reconciliaciones integer not null default 0,
  add column reconciliado_at timestamptz;

-- 2. Consecutivo por moneda --------------------------------------------
-- Se asigna al insertar y también al reconciliar una liquidación que antes
-- estaba en 0 (sin consecutivo). Una vez asignado no cambia.
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
      case when v_cxp > v_cxc then 'PN' else 'CN' end
        || case when new.moneda = 'USD' then 'U' else '' end,
      new.fecha);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consecutivo_conciliacion_negocio on public.conciliaciones_businesses;
create trigger trg_consecutivo_conciliacion_negocio
  before insert or update on public.conciliaciones_businesses
  for each row execute function public.set_consecutivo_conciliacion_negocio();

drop trigger if exists trg_consecutivo_conciliacion_mensajero on public.conciliaciones_messengers;
create trigger trg_consecutivo_conciliacion_mensajero
  before insert or update on public.conciliaciones_messengers
  for each row execute function public.set_consecutivo_conciliacion_mensajero();

-- 3. Reconciliación ----------------------------------------------------
create table public.conciliaciones_reconciliaciones (
  reconciliacion_id uuid primary key default gen_random_uuid(),
  entidad text not null check (entidad in ('negocios', 'mensajeros')),
  conciliacion_id uuid not null,
  consecutivo text,
  estado_anterior text,
  antes jsonb not null,
  despues jsonb not null,
  responsable text,
  responsable_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_conciliaciones_reconciliaciones_conc
  on public.conciliaciones_reconciliaciones(conciliacion_id, created_at desc);

alter table public.conciliaciones_reconciliaciones enable row level security;
-- Solo lectura desde la app: las filas las escribe el trigger (security definer).
create policy "read_all_authenticated" on public.conciliaciones_reconciliaciones
  for select using (public.is_active_user());
grant select on public.conciliaciones_reconciliaciones to anon, authenticated;

-- Corre después del trigger del consecutivo (orden alfabético: trg_consecutivo_* < trg_reconciliacion_*).
create or replace function public.reconciliacion_conciliacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entidad text := case when tg_table_name = 'conciliaciones_businesses' then 'negocios' else 'mensajeros' end;
  v_campos text[];
  v_antes jsonb;
  v_despues jsonb;
begin
  if new.estado is distinct from old.estado then
    new.estado_at := now();
  end if;

  v_campos := case when v_entidad = 'negocios' then
    array['ordenes_efectivo', 'cxc_cu', 'ordenes_transfermovil', 'cxp_tm', 'ordenes_saldo_mandao', 'cxp_sm',
          'ordenes_tarjeta', 'cxp_us', 'comision_pct', 'tasa_cambio', 'desglose']
  else
    array['ordenes_efectivo', 'cxc_cu', 'ordenes_transfermovil', 'cxp_tm', 'ordenes_saldo_mandao', 'cxp_sm',
          'ordenes_tarjeta', 'cxp_us', 'comision_pct', 'disponibilidades', 'alquiler_mochila', 'total_ordenes',
          'total_por_cobrar', 'total_por_pagar', 'saldo_cup', 'desglose']
  end;
  select jsonb_object_agg(c, to_jsonb(old) -> c), jsonb_object_agg(c, to_jsonb(new) -> c)
    into v_antes, v_despues
  from unnest(v_campos) as c;

  if v_antes is not distinct from v_despues then
    return new; -- no es una reconciliación (cambio de estado, PDF, etc.)
  end if;

  if old.estado not in ('Nuevo', 'Enviado') then
    raise exception 'La conciliación % está % y ya no se puede reconciliar (solo en Nuevo o Enviado).',
      coalesce(old.consecutivo, old.conciliacion), old.estado;
  end if;

  -- El consecutivo se mantiene (si antes estaba en 0, el trigger anterior
  -- ya le asignó uno nuevo).
  new.consecutivo := coalesce(old.consecutivo, new.consecutivo);
  new.reconciliaciones := coalesce(old.reconciliaciones, 0) + 1;
  new.reconciliado_at := now();

  insert into public.conciliaciones_reconciliaciones
    (entidad, conciliacion_id, consecutivo, estado_anterior, antes, despues, responsable, responsable_id)
  values
    (v_entidad, old.conciliacion_id, new.consecutivo, old.estado, v_antes, v_despues,
     (select full_name from public.profiles where id = auth.uid()), auth.uid());
  return new;
end;
$$;

create trigger trg_reconciliacion_conciliacion_negocio
  before update on public.conciliaciones_businesses
  for each row execute function public.reconciliacion_conciliacion();
create trigger trg_reconciliacion_conciliacion_mensajero
  before update on public.conciliaciones_messengers
  for each row execute function public.reconciliacion_conciliacion();
