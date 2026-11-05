-- =====================================================================
-- Correcciones a Conciliación de Negocios + Conciliación de Mensajeros
-- =====================================================================
-- Requiere haber corrido antes 2026-09-24_conciliaciones_negocios.sql.
-- Correr una sola vez en el SQL Editor del proyecto Supabase real. Ya
-- está incorporado a supabase_schema.sql (fuente de verdad). Ver
-- Instrucciones Conciliaciones Mandao.md secciones 6 y 7.
--
-- Motivo: las instrucciones generales de Conciliación (que cubren
-- Negocios y Mensajeros a la vez) piden una tabla separada por entidad
-- (no una `conciliaciones` compartida) y un campo `Estado` con ciclo de
-- vida de texto (Nuevo/Enviado/Aprobado/Incorrecto/Facturado) en vez de
-- boolean.

-- 1) Renombrar conciliaciones -> conciliaciones_businesses
alter table public.conciliaciones rename to conciliaciones_businesses;
alter index uq_conciliaciones_business_range rename to uq_conciliaciones_businesses_range;

-- 2) estado: boolean -> texto con ciclo de vida (todo lo existente, que
-- solo pudo haber quedado en `true`, pasa a 'Nuevo').
alter table public.conciliaciones_businesses alter column estado drop default;
alter table public.conciliaciones_businesses
  alter column estado type text using (case when estado then 'Nuevo' else 'Nuevo' end);
alter table public.conciliaciones_businesses alter column estado set default 'Nuevo';
alter table public.conciliaciones_businesses
  add constraint conciliaciones_businesses_estado_check
  check (estado in ('Nuevo', 'Enviado', 'Aprobado', 'Incorrecto', 'Facturado'));

-- 3) Comisión de Mensajeros — valor inicial de referencia (20%, igual
-- que Negocios), editable desde Configuración -> Comisión Mandao.
insert into public.commission_settings (entity_type, percentage) values ('messengers', 20.00)
on conflict (entity_type) do nothing;

-- 4) Tabla nueva: conciliaciones_messengers (ver Instrucciones sección 7).
create table public.conciliaciones_messengers (
  conciliacion_id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  messenger_id uuid not null references public.messengers(messenger_id),
  mensajero text not null,
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
  tipo_mochila text,
  alquiler_mochila numeric(12,2) not null default 0,
  disponibilidades numeric(12,2) not null default 0,
  total_ordenes integer not null default 0,
  total_por_cobrar numeric(12,2) not null default 0,
  total_por_pagar numeric(12,2) not null default 0,
  saldo_cup numeric(12,2),
  via_pago text,
  responsable text not null,
  responsable_id uuid references auth.users(id),
  conciliacion text not null,
  estado text not null default 'Nuevo'
    check (estado in ('Nuevo', 'Enviado', 'Aprobado', 'Incorrecto', 'Facturado')),
  facturacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_conciliaciones_messengers_range
  on public.conciliaciones_messengers(messenger_id, fecha_inicial, fecha_final);

alter table public.conciliaciones_messengers enable row level security;

create policy "read_all_authenticated" on public.conciliaciones_messengers
  for select using (public.is_active_user());

create policy "manage_conciliaciones_messengers" on public.conciliaciones_messengers
  for all using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

grant select, insert, update, delete on public.conciliaciones_messengers to anon, authenticated;

-- 5) La política/policy de conciliaciones_businesses ya sigue existiendo
-- con su nombre original tras el rename de tabla (Postgres conserva las
-- políticas por OID de tabla) — no hace falta recrearla. Si quieres el
-- nombre alineado, es opcional:
alter policy "manage_conciliaciones" on public.conciliaciones_businesses
  rename to "manage_conciliaciones_businesses";
