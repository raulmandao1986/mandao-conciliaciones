-- =====================================================================
-- Conciliación de Negocios (Módulo Negocios → Conciliación)
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real. Ya
-- está incorporado a supabase_schema.sql (fuente de verdad). Ver
-- "Instrucciones Conciliaciones Mandao.md" sección 6 para la
-- especificación funcional completa.

create table public.commission_settings (
  entity_type text primary key check (entity_type in ('businesses', 'messengers')),
  percentage numeric(5,2) not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.commission_settings (entity_type, percentage) values ('businesses', 20.00)
on conflict (entity_type) do nothing;

create table public.conciliaciones (
  conciliacion_id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  business_id uuid not null references public.businesses(business_id),
  establecimiento text not null,
  fecha_inicial date not null,
  fecha_final date not null,
  area_id uuid not null references public.areas(area_id),
  area text not null,
  ordenes_efectivo integer not null default 0,
  cxc_cu numeric(12,2) not null default 0,
  ordenes_transfermovil integer not null default 0,
  cxp_tm numeric(12,2) not null default 0,
  ordenes_saldo_mandao integer not null default 0,
  cxp_sm numeric(12,2) not null default 0,
  ordenes_tarjeta integer not null default 0,
  cxp_us numeric(12,2) not null default 0,
  via_pago text,
  responsable text not null,
  responsable_id uuid references auth.users(id),
  conciliacion text not null,
  estado boolean not null default true,
  facturacion text,
  descuento numeric(12,2),
  nota text,
  pagado numeric(12,2),
  saldo numeric(12,2),
  estado_pago text,
  referencia text,
  fecha_pago date,
  prioridad text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_conciliaciones_business_range
  on public.conciliaciones(business_id, fecha_inicial, fecha_final);

alter table public.commission_settings enable row level security;
alter table public.conciliaciones enable row level security;

create policy "read_all_authenticated" on public.commission_settings
  for select using (public.is_active_user());
create policy "read_all_authenticated" on public.conciliaciones
  for select using (public.is_active_user());

create policy "manage_commission_settings" on public.commission_settings
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

create policy "manage_conciliaciones" on public.conciliaciones
  for all using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

grant select, insert, update, delete on public.commission_settings to anon, authenticated;
grant select, insert, update, delete on public.conciliaciones to anon, authenticated;

-- Nuevo ítem de menú "Comisión Mandao" — se agrega a los Roles de Acceso
-- de sistema (Super Admin/Supervisor) para que no quede invisible: un
-- Rol de Acceso ya asignado solo muestra los module_keys que tenía
-- guardados cuando se creó, no se entera solo de módulos nuevos.
update public.access_roles
set module_keys = module_keys || array['comision-mandao']
where is_system and base_role in ('super_admin', 'supervisor')
  and not ('comision-mandao' = any(module_keys));
