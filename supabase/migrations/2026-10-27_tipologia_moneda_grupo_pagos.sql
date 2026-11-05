-- =====================================================================
-- Métodos de Pago: Tipología, Moneda y Grupo (Fase 1 "Nuevos cambios")
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-15_conciliaciones_comision_tasa.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Documento "Nuevos cambios" (usuario, 2026-10-27): la clasificación de las
-- órdenes deja de estar fija en el código (Cash -> Efectivo, Card -> Tarjeta…)
-- y pasa al catálogo de Métodos de Pago:
--   tipologia  'cobrar' (Cuenta por Cobrar: el negocio/mensajero cobró al
--              cliente y le debe a Mandao, hoy solo Efectivo) o 'pagar'
--              (Cuenta por Pagar: obligación de Mandao).
--   currency   'CUP' o 'USD'. Los métodos en USD forman la parte "Exterior"
--              de los negocios con vía Transferencia-Exterior; para el resto
--              de los negocios todo se liquida en CUP (confirmado 2026-10-27).
--   group_id   Grupo con el que se arma el PDF y los resúmenes (Efectivo,
--              Pago en Línea, Pago en Línea Exterior, configurable).

create table public.payment_groups (
  group_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.payment_groups (name, sort_order) values
  ('Efectivo', 1),
  ('Pago en Línea', 2),
  ('Pago en Línea Exterior', 3)
on conflict (name) do nothing;

alter table public.payment_groups enable row level security;
create policy "read_all_authenticated" on public.payment_groups
  for select using (public.is_active_user());
create policy "manage_payment_groups" on public.payment_groups
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
grant select, insert, update, delete on public.payment_groups to anon, authenticated;

alter table public.payment_methods
  add column tipologia text not null default 'pagar' check (tipologia in ('cobrar', 'pagar')),
  add column currency text not null default 'CUP' check (currency in ('CUP', 'USD')),
  add column group_id uuid references public.payment_groups(group_id) on delete set null;

-- Clasificación inicial = la que hoy aplica el código, para que ninguna
-- conciliación cambie al desplegar. Comparación sin mayúsculas, tildes ni
-- espacios (como normalizeCompact en la app).
update public.payment_methods pm
set tipologia = 'cobrar', currency = 'CUP',
    group_id = (select group_id from public.payment_groups where name = 'Efectivo')
where lower(regexp_replace(translate(pm.name, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), '[^A-Za-z0-9]', '', 'g')) in ('cash', 'efectivo');

update public.payment_methods pm
set tipologia = 'pagar', currency = 'CUP',
    group_id = (select group_id from public.payment_groups where name = 'Pago en Línea')
where lower(regexp_replace(translate(pm.name, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), '[^A-Za-z0-9]', '', 'g')) in ('transfermovil', 'enzona');

update public.payment_methods pm
set tipologia = 'pagar', currency = 'USD',
    group_id = (select group_id from public.payment_groups where name = 'Pago en Línea Exterior')
where lower(regexp_replace(translate(pm.name, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), '[^A-Za-z0-9]', '', 'g'))
  in ('saldomandao', 'card', 'creditoodebito', 'tropipaybalance');

-- Desglose por grupo de cada conciliación (el PDF y el histórico lo leen).
-- Las columnas ordenes_*/cxc_cu/cxp_* se siguen llenando con los totales:
-- ordenes_efectivo/cxc_cu = todo lo Por Cobrar, ordenes_transfermovil/cxp_tm
-- = Por Pagar en métodos CUP, ordenes_saldo_mandao/cxp_sm = Por Pagar en
-- métodos USD (Dashboard y el trigger del consecutivo usan esos totales).
alter table public.conciliaciones_businesses add column desglose jsonb;
alter table public.conciliaciones_messengers add column desglose jsonb;

-- Menú Configuración -> Tipología de Pago (Cuentas por Cobrar, Cuentas por
-- Pagar, Grupos de Pago): se habilita en los Roles de Acceso que ya ven
-- Métodos de Pago de Órdenes. El resto se activa desde Roles y Usuarios.
update public.access_roles
set module_keys = array(select distinct unnest(module_keys || array['tipologia-cobrar', 'tipologia-pagar', 'grupos-pago'])),
    updated_at = now()
where 'metodos-pago-ordenes' = any(module_keys);
