-- =====================================================================
-- Planificación de Pagos (generada desde Cobros y Pagos)
-- =====================================================================
-- Correr en el SQL Editor del proyecto Supabase real, DESPUÉS de
-- 2026-11-19_consecutivo_series_gestion.sql (que crea las series de
-- consecutivo PLN / PLNU de las planificaciones). Se puede volver a correr.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Pedido 2026-11-19: en Cobros y Pagos, "Generar Planificación" registra los
-- negocios/mensajeros seleccionados (misma moneda y vía de pago) como una
-- planificación para la caja: consecutivo, fecha de emisión, cantidad, vía,
-- moneda e importes. Cada conciliación solo puede estar en UNA planificación
-- (índice único). El estado de la planificación no se guarda: se calcula del
-- estado de sus conciliaciones (todas Confirmado = Pendiente; todas
-- Pagado/Cobrado = Pagado; si no, En Proceso). Pagado / Cobrado se registran
-- en el histórico de Conciliación.

create table if not exists public.planificaciones_pago (
  planificacion_id uuid primary key default gen_random_uuid(),
  consecutivo text unique,
  fecha date not null default current_date,
  entidad text not null check (entidad in ('negocios', 'mensajeros')),
  via_pago text not null,
  moneda text not null check (moneda in ('CUP', 'USD')),
  cantidad integer not null default 0,           -- negocios / mensajeros distintos
  monto_pagar numeric(14,2) not null default 0,  -- suma de netos a pagar
  monto_cobrar numeric(14,2) not null default 0, -- suma de netos a cobrar
  neto numeric(14,2) not null default 0,         -- pagar − cobrar
  areas text[] not null default '{}',
  filtros jsonb,                                 -- filtros de Cobros y Pagos al generarla
  notas text,
  responsable text,
  responsable_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planificacion_items (
  item_id uuid primary key default gen_random_uuid(),
  planificacion_id uuid not null references public.planificaciones_pago(planificacion_id) on delete cascade,
  entidad text not null check (entidad in ('negocios', 'mensajeros')),
  conciliacion_id uuid not null,
  entidad_id uuid,
  nombre text not null,
  area text,
  consecutivo text,
  periodo_inicial date,
  periodo_final date,
  riel text,
  neto numeric(14,2) not null,   -- positivo = pagar, negativo = cobrar
  datos_pago text,               -- datos de pago al momento de planificar
  created_at timestamptz not null default now(),
  unique (entidad, conciliacion_id)
);
create index if not exists idx_planificacion_items_plan on public.planificacion_items(planificacion_id);

-- Consecutivo por moneda: series PLN (CUP) y PLNU (USD) de Formato de Consecutivo.
create or replace function public.set_consecutivo_planificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.consecutivo is null then
    new.consecutivo := public.next_conciliacion_consecutivo(
      case when new.moneda = 'USD' then 'PLNU' else 'PLN' end, new.fecha);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_consecutivo_planificacion on public.planificaciones_pago;
create trigger trg_consecutivo_planificacion
  before insert on public.planificaciones_pago
  for each row execute function public.set_consecutivo_planificacion();

alter table public.planificaciones_pago enable row level security;
alter table public.planificacion_items enable row level security;

drop policy if exists "read_all_authenticated" on public.planificaciones_pago;
create policy "read_all_authenticated" on public.planificaciones_pago for select using (public.is_active_user());
drop policy if exists "read_all_authenticated" on public.planificacion_items;
create policy "read_all_authenticated" on public.planificacion_items for select using (public.is_active_user());

-- Generar / editar / eliminar: mismo nivel que las conciliaciones (Super Admin y Supervisor).
drop policy if exists "manage_planificaciones_pago" on public.planificaciones_pago;
create policy "manage_planificaciones_pago" on public.planificaciones_pago
  for all using (public.is_admin_or_supervisor()) with check (public.is_admin_or_supervisor());
drop policy if exists "manage_planificacion_items" on public.planificacion_items;
create policy "manage_planificacion_items" on public.planificacion_items
  for all using (public.is_admin_or_supervisor()) with check (public.is_admin_or_supervisor());

grant select, insert, update, delete on public.planificaciones_pago to anon, authenticated;
grant select, insert, update, delete on public.planificacion_items to anon, authenticated;

-- Menú: "Planificación de Pagos" pasa a ser un menú propio (antes un ítem en
-- Negocios y otro en Mensajeros).
update public.access_roles
set module_keys = array(select distinct unnest(module_keys || array['planificacion-pagos'])),
    updated_at = now()
where module_keys && array['planificacion-pagos-negocio', 'planificacion-pagos-mensajero', 'cobros-pagos-negocio', 'cobros-pagos-mensajero'];
