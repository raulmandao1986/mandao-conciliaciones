-- =====================================================================
-- MANDAO CONCILIACIONES — Esquema Supabase (Postgres) — v2
-- Traducción del modelo de datos REAL usado por el código exportado
-- (mandao-conciliaciones.zip), NO del documento de instrucciones —
-- se detectaron colecciones documentadas que el código nunca usa
-- (Dispatcher, Dispatcher_Imports, EmailGroups/EmailTemplates sin uso
-- confirmado) y colecciones reales no documentadas (dispatcher_cambios,
-- dispatcher_orders, verification_history). Ver PLAN_MIGRACION.md
-- sección 1 para el detalle de cada discrepancia.
--
-- Alcance original: SOLO Dispatcher y Disponibilidad (decisión #3).
-- AMPLIADO 2026-09-08: se agregan los catálogos del módulo Gestión
-- (payment_methods, exchange_rates) necesarios para que Verificación/
-- Revisión del Dispatcher puedan probarse con datos reales — ver
-- sección "MÓDULO GESTIÓN — CATÁLOGOS" más abajo. Sigue sin incluir
-- Negocios/Mensajeros completos/Conciliación/Facturación/Cuentas por
-- Cobrar-Pagar (esos se migran en fases siguientes).
--
-- Roles: super_admin / supervisor / operador / visitante (decisión #2).
-- Se elimina cualquier otro esquema de rol (Super Admin/admin/mensajero/
-- negocio calculado por patrón de email en src/lib/auth.tsx).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONES
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";        -- para RN-005 (coincidencia difusa)
create extension if not exists "unaccent";       -- para RN-005 (tildes/diacríticos)

-- ---------------------------------------------------------------------
-- 1. ROLES Y USUARIOS (sustituye Firebase Auth -> Supabase Auth)
-- ---------------------------------------------------------------------
-- Supabase Auth ya gestiona auth.users (email, password, sesión).
-- Esta tabla extiende cada usuario con su rol de negocio.

create type public.user_role as enum ('super_admin', 'supervisor', 'operador', 'visitante');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role public.user_role not null default 'visitante',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Extiende auth.users con el rol de negocio (Super Admin/Supervisor/Operador/Visitante) definido en la Constitución.';

-- 'email' agregado 2026-09-08 — RolesUsuariosPage (reconstruida, ver
-- sección 19.3 del documento de instrucciones) necesita listar usuarios
-- con su email sin acceso a auth.users desde el cliente (PostgREST no
-- expone ese esquema). Se copia aquí en el registro y queda disponible
-- para lectura vía la política "read_own_profile" existente.

-- Trigger: crear profile automáticamente al registrar un usuario en Supabase Auth.
-- MODELO DE AUTORIZACIÓN (agregado 2026-09-10): pertenecer al dominio
-- @mandao.app permite AUTENTICARSE, pero no da acceso al sistema por sí
-- solo. Todo profile nuevo entra con active = false ("pendiente de
-- autorización"); un Super Admin debe encontrarlo en Roles y Usuarios,
-- asignarle un rol real y activarlo. Antes de esto, la app muestra una
-- pantalla de "pendiente de aprobación" en vez del sistema (ver
-- src/lib/auth.tsx e Instrucciones Conciliaciones Mandao.md sección 19.3.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- access_role_id: asigna el Rol de Acceso de sistema "Visitante" (ver
  -- sección "MÓDULO GESTIÓN — ROLES DE ACCESO" más abajo en este archivo)
  -- para que el perfil nazca siempre con uno asignado. public.access_roles
  -- se crea más adelante en este mismo script — es una referencia diferida,
  -- válida porque plpgsql no resuelve nombres hasta que la función corre.
  insert into public.profiles (id, full_name, email, role, active, access_role_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'visitante',
    false,
    (select access_role_id from public.access_roles where is_system and base_role = 'visitante' limit 1)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper para políticas RLS: rol del usuario autenticado actual
-- SECURITY DEFINER es obligatorio aquí (agregado en v5): sin esto,
-- esta consulta a 'profiles' se evalúa con el RLS del rol que llama,
-- y la política 'read_own_profile' de profiles vuelve a llamar a
-- is_admin_or_supervisor() -> current_user_role() -> profiles...
-- recursión infinita ("stack depth limit exceeded") que rompía
-- CUALQUIER escritura en toda la base, para cualquier rol.
-- AMPLIADO 2026-09-10: un usuario con active = false (pendiente de
-- autorización, o desactivado por un Super Admin) no tiene rol efectivo
-- para NINGUNA política — devolver NULL aquí hace que is_admin_or_supervisor()
-- y can_execute_processes() (ambas construidas sobre esta función) nieguen
-- automáticamente, sin tener que tocar cada política una por una.
create or replace function public.current_user_role()
returns public.user_role
language sql stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql stable
as $$
  select public.current_user_role() in ('super_admin', 'supervisor');
$$;

-- Usado por las políticas de SELECT "read_all_authenticated": estas no
-- pasaban por current_user_role() (solo chequeaban auth.role() =
-- 'authenticated', es decir, "está logueado en Supabase", sin mirar
-- profiles.active en absoluto) — por eso necesitan su propio helper.
create or replace function public.is_active_user()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_execute_processes()
returns boolean
language sql stable
as $$
  -- Operador puede ejecutar Verificaciones (ver RN de roles), pero no Importar/Conciliar/Facturar
  select public.current_user_role() in ('super_admin', 'supervisor', 'operador');
$$;

-- ---------------------------------------------------------------------
-- 2. AREAS
-- ---------------------------------------------------------------------
create table public.areas (
  area_id uuid primary key default gen_random_uuid(),
  name text not null,
  province text,
  sheet_document_id text not null,   -- ID del Google Sheet del Dispatcher (obligatorio, RN sección 15)
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. AUDIT LOGS (trazabilidad obligatoria — RN-008)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  log_id uuid primary key default gen_random_uuid(),
  module text not null,               -- 'dispatcher' | 'disponibilidad' | ...
  action text not null,               -- 'verificacion' | 'importacion' | ...
  user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index idx_audit_logs_module_action on public.audit_logs(module, action);

-- ---------------------------------------------------------------------
-- 4. EMAIL GROUPS / TEMPLATES — ELIMINADAS EN v2
-- ---------------------------------------------------------------------
-- Las instrucciones documentan 'EmailGroups'/'EmailTemplates', pero no
-- existe NINGUNA referencia a estas colecciones en el código real
-- (confirmado con búsqueda exhaustiva en src/). No se crean estas tablas
-- hasta que el módulo de envío de correo se implemente de verdad desde
-- Claude Code — crearlas ahora sería adelantarse a una fase no
-- construida (decisión #3).

-- =====================================================================
-- MÓDULO DISPATCHER
-- =====================================================================
-- NOTA DE RECONCILIACIÓN (v2): las instrucciones documentan colecciones
-- 'Dispatcher' / 'Dispatcher_Imports' / 'Dispatcher_Incidents', pero el
-- código real exportado (VerificationPage.tsx, RevisionPage.tsx) NUNCA
-- las usa. Usa en su lugar 'dispatcher_orders', 'dispatcher_cambios' y
-- 'verification_history'. Este esquema sigue el código real, no el
-- documento, porque es lo que hay que migrar de verdad.
-- Pendiente de tu confirmación: si 'orders' (usada solo por
-- DispatcherPage.tsx, una vista de rastreo en tiempo real sin relación
-- con Google Sheets ni con RN-001..RN-009) se descarta del alcance.

-- 5. DISPATCHER (equivalente real de la colección 'dispatcher_orders')
create table public.dispatcher (
  order_pk uuid primary key default gen_random_uuid(),
  delivery_date date,
  order_date date,
  payment_type text,
  customer text,
  customer_number text,
  driver text,
  store text,
  order_id text not null,
  product_amount numeric(12,2) default 0,
  store_offer numeric(12,2) default 0,
  processing_fee numeric(12,2) default 0,
  store_admin_charge numeric(12,2) default 0,
  delivery_charge numeric(12,2) default 0,
  extra_delivery_charge numeric(12,2) default 0,
  driver_admin_charge numeric(12,2) default 0,
  complementary_delivery text,   -- string/number en origen -> se conserva como text
  tax numeric(12,2) default 0,
  rate numeric(18,6),              -- columna "Rate" (2026-10-07, migración 2026-10-07e)
  transaction_fee numeric(12,2),   -- columna "Transaction Fee" (antes se guardaba en tax)
  promocode text,
  area_id uuid not null references public.areas(area_id),
  verification_id uuid,   -- FK lógica a dispatcher_verifications (se define abajo con alter)
  created_at timestamptz not null default now()
);

-- RN-009: una orden no puede importarse dos veces para el mismo negocio,
-- área y fecha operativa. Incluye el negocio desde 2026-10-07 (migración
-- 2026-10-07d): dos negocios pueden repetir Order ID el mismo día.
create unique index uq_dispatcher_order_area_store_date
  on public.dispatcher (order_id, area_id, lower(btrim(coalesce(store, ''))), delivery_date);

-- 6. DISPATCHER_VERIFICATIONS (equivalente real de 'verification_history')
-- Incluye import_completed_at porque el código real NO tiene una colección
-- separada de "imports": el propio registro de verificación funciona
-- también como el registro de auditoría de la importación.
create table public.dispatcher_verifications (
  verification_id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(area_id),
  start_date date not null,
  end_date date not null,
  verification_date timestamptz not null default now(),
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('correcta', 'con_incidencias')),
  total_orders int not null default 0,
  total_changes int not null default 0,
  total_incidents int not null default 0,
  imported_by uuid references auth.users(id),
  import_completed_at timestamptz
);

alter table public.dispatcher
  add constraint fk_dispatcher_verification
  foreign key (verification_id) references public.dispatcher_verifications(verification_id);

-- 7. DISPATCHER_INCIDENTS (las instrucciones la documentan como
-- 'Dispatcher_Incidents' — aquí sí coincide en concepto, aunque en el
-- código las incidencias vienen embebidas en el flujo de verification_history;
-- se normaliza a tabla propia porque es mejor práctica relacional)
create table public.dispatcher_incidents (
  incident_id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.dispatcher_verifications(verification_id) on delete cascade,
  order_id text not null,
  severity text not null check (severity in ('critica', 'advertencia', 'informativa')),
  rule_code text not null,     -- 'RN-001', 'RN-002', ...
  description text not null,
  status text
);

-- 8. DISPATCHER_CHANGES (equivalente real de 'dispatcher_cambios' —
-- NO documentada en las instrucciones, pero SÍ usada activamente por
-- VerificationPage.tsx para registrar cambios detectados entre la hoja
-- de Google y lo ya importado)
-- CORREGIDO EN v3: la v2 asumía un log de diffs genérico
-- (field_changed/old_value/new_value), pero el código real importa la
-- fila COMPLETA de la pestaña "Cambios" del Google Sheet — se corrigió
-- la estructura para no perder esa información al migrar.
create table public.dispatcher_changes (
  change_id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.dispatcher_verifications(verification_id) on delete cascade,
  order_id text not null,
  store text,
  driver text,
  payment_type text,
  product_amount numeric(12,2) default 0,
  delivery_charge numeric(12,2) default 0,
  detail text,
  change_date date,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- MÓDULO DISPONIBILIDAD
-- =====================================================================
-- NOTA DE RECONCILIACIÓN (v2): el código real escribe el mismo registro
-- dos veces, en 'dispatcher_disponibilidades' Y en 'Availabilities'
-- (DisponibilidadVerificationPage.tsx líneas 814-815) — es una
-- duplicación heredada, no dos conceptos de negocio distintos. Esta
-- tabla 'availabilities' es la única fuente de verdad en Supabase; si
-- el Dispatcher necesita generar una disponibilidad, inserta aquí
-- directamente, sin tabla paralela.

-- 9. AVAILABILITIES (copia exacta de la hoja "Disponibilidades")
create table public.availabilities (
  availability_id uuid primary key default gen_random_uuid(),
  ts timestamptz,                 -- columna origen "Timestamp"
  email_address text,
  order_id text,
  availability_date date not null,
  reason text,
  requested_by text,              -- columna origen "Area o persona que solicta la transportacion" (typo intencional, no corregir en el mapeo de origen)
  messenger_name text not null,
  amount_to_pay numeric(12,2) not null default 0,
  province text,
  comment text,
  area_id uuid not null references public.areas(area_id),
  import_id uuid,
  created_at timestamptz not null default now()
);

-- 10. AVAILABILITY_IMPORTS
create table public.availability_imports (
  import_id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(area_id),
  start_date date not null,
  end_date date not null,
  imported_by uuid not null references auth.users(id),
  import_date timestamptz not null default now(),
  records_imported int not null default 0
);

alter table public.availabilities
  add constraint fk_availability_import
  foreign key (import_id) references public.availability_imports(import_id);

-- RN-013: no se puede importar más de una vez para la misma área y rango de fechas
create unique index uq_availability_import_area_range
  on public.availability_imports(area_id, start_date, end_date);

-- 11. AVAILABILITY_VERIFICATIONS
create table public.availability_verifications (
  verification_id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(area_id),
  start_date date not null,
  end_date date not null,
  verification_date timestamptz not null default now(),
  user_id uuid not null references auth.users(id),
  status text not null check (status in ('correcta', 'con_incidencias')),
  total_records int not null default 0,
  total_incidents int not null default 0
);

-- 12. AVAILABILITY_INCIDENTS
create table public.availability_incidents (
  incident_id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.availability_verifications(verification_id) on delete cascade,
  row_number int,
  messenger_name text,
  availability_date date,
  severity text not null check (severity in ('critica')),
  rule_code text not null,     -- 'RN-012', 'RN-014'
  description text not null
);

-- =====================================================================
-- MENSAJEROS (tabla mínima necesaria como referencia para RN-012 —
-- NO es un módulo activo, solo el catálogo que el módulo Disponibilidad
-- necesita consultar para la coincidencia exacta de nombres)
-- =====================================================================
create table public.messengers (
  messenger_id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true
);

-- AMPLIADO 2026-09-08 — GestionMensajerosPage.tsx.bak (Firestore 'messengers')
-- usa esta misma tabla con muchos más campos: se agregan por ALTER en vez
-- de rehacer el CREATE, para no romper el uso mínimo que ya tenía
-- Disponibilidad. 'area' se traduce a area_id (FK a public.areas) en vez
-- de la lista de provincias hardcodeada que tenía el código original —
-- unifica con la misma tabla que ya usan Verificación/Revisión.
alter table public.messengers
  add column ci text,
  add column phone text,
  add column fiscal_card text,
  add column fiscal_account text,
  add column payment_method text,
  add column backpack_type text not null default 'Grande',
  add column start_date date,
  add column end_date date,
  add column area_id uuid references public.areas(area_id),
  add column comments text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

-- Índice para acelerar coincidencia difusa (RN-005) usada en Dispatcher
create index idx_messengers_name_trgm on public.messengers using gin (name gin_trgm_ops);

-- =====================================================================
-- MÓDULO GESTIÓN — CATÁLOGOS (agregado 2026-09-08)
-- =====================================================================
-- Traducción directa de las colecciones Firestore 'MetodosPago' y
-- 'RazonCambio' (src/modules/gestion/MetodosPagoPage.tsx.bak y
-- RazonCambioPage.tsx.bak) — se mantienen los mismos campos y la misma
-- lógica de negocio, solo cambia el nombre de columna a snake_case.

-- 12b. PAYMENT_GROUPS (2026-10-27). Grupos con que se arman el PDF y los
-- resúmenes de la conciliación (Efectivo, Pago en Línea, Pago en Línea
-- Exterior; configurable en Configuración -> Tipología de Pago).
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

-- 13. PAYMENT_METHODS (= 'MetodosPago'). Un solo catálogo compartido
-- por Negocios/Mensajeros/Órdenes, filtrado por los 3 booleanos
-- 'applies_to_*' — igual que hacía MetodosPagoPage con su prop `type`.
-- tipologia/currency/group_id (2026-10-27): clasificación de las órdenes
-- en la conciliación — 'cobrar' (Cuenta por Cobrar, hoy solo Efectivo) o
-- 'pagar'; moneda CUP/USD (USD = parte "Exterior" de los negocios con vía
-- Transferencia-Exterior) y grupo del PDF.
create table public.payment_methods (
  payment_method_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  applies_to_businesses boolean not null default true,
  applies_to_messengers boolean not null default true,
  applies_to_orders boolean not null default true,
  active boolean not null default true,
  tipologia text not null default 'pagar' check (tipologia in ('cobrar', 'pagar')),
  currency text not null default 'CUP' check (currency in ('CUP', 'USD')),
  group_id uuid references public.payment_groups(group_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14. EXCHANGE_RATES (= 'RazonCambio'). RN-010 "Tasa de Cambio Única
-- Activa": al activar una tasa, todas las demás deben quedar inactivas
-- — esa regla se aplica en la UI (RazonCambioPage), igual que en el
-- código original, no como constraint de base de datos.
-- rate_cup = USD por 1 CUP (ej. 0.002 ≈ 500 CUP por USD), puede ser menor
-- que 1 — ver migración 2026-10-01_exchange_rate_usd_por_cup.sql.
create table public.exchange_rates (
  exchange_rate_id uuid primary key default gen_random_uuid(),
  name text not null,
  rate_cup numeric(18,8) not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- MÓDULO GESTIÓN — NEGOCIOS (agregado 2026-09-08)
-- =====================================================================
-- Traducción directa de la colección Firestore 'businesses'
-- (GestionNegociosPage.tsx.bak). Las cuentas bancarias/pasarelas
-- (CUP, Personal, Cheque, Zelle, Tropipay, Transferencia Internacional)
-- se guardan como jsonb — igual que en Firestore, son sub-objetos de
-- forma variable según el método de pago elegido, no relaciones propias.
-- 'area' se traduce a area_id (FK a public.areas), igual que Mensajeros.
create table public.businesses (
  business_id uuid primary key default gen_random_uuid(),
  name text not null,
  payment_method text,
  active boolean not null default true,
  area_id uuid references public.areas(area_id),
  contact_name text,
  phone text,
  email text,
  contract_name text,
  tax_id text,
  address text,
  external_url text,
  cup_account jsonb,
  personal_account jsonb,
  check_account jsonb,
  exterior_zelle jsonb,
  exterior_tropipay jsonb,
  exterior_transfer jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- MÓDULO GESTIÓN — DOCUMENTOS DE IMPORTACIÓN (agregado 2026-09-22)
-- =====================================================================
-- Catálogo de IDs de Google Sheet registrados para la Importación Masiva
-- de Gestión de Negocios/Mensajeros (Configuración → Documentos de
-- Importación). No guarda datos importados — solo el ID del documento
-- de origen; la hoja/pestaña a importar se elige en el momento de
-- ejecutar la importación, listando las pestañas reales del documento
-- vía la API de Google Sheets.
create table public.import_sources (
  import_source_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('businesses', 'messengers')),
  name text not null,
  sheet_document_id text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- MÓDULO GESTIÓN — ROLES DE ACCESO (agregado 2026-09-23, UNIFICADO 2026-09-24)
-- =====================================================================
-- profiles.role (enum de 4 valores fijos) sigue siendo, intacta, la
-- única fuente de verdad que consultan las políticas RLS de TODO el
-- sistema (current_user_role() = 'super_admin', etc. — decisión #2,
-- ver cabecera de este archivo). Eso NO cambia y no se vuelve editable.
--
-- Lo que SÍ es 100% editable desde la UI (RolesUsuariosPage → pestaña
-- "Roles") es esta tabla: qué módulos/ítems de menú ve cada rol
-- (module_keys, ids de MODULE_CATALOG en moduleCatalog.ts). Se
-- siembran 4 filas "de sistema" (is_system = true) — Super Admin,
-- Supervisor, Operador, Visitante — con base_role apuntando 1:1 a los
-- 4 valores del enum. Esas 4 filas NO se pueden eliminar (protegido
-- también a nivel de trigger, ver más abajo) porque son el ancla entre
-- "qué rol de acceso ve un usuario" y "qué puede ejecutar/modificar
-- según RLS" — pero sus module_keys sí se editan libremente. Un
-- Super Admin puede además crear roles nuevos (is_system = false),
-- libres en todo: nombre, descripción, módulos, y a cuál de los 4
-- niveles de seguridad (base_role) se atan.
create table public.access_roles (
  access_role_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  base_role public.user_role not null default 'visitante',
  is_system boolean not null default false,
  module_keys text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Protección: las 4 filas de sistema no se pueden eliminar ni perder su
-- marca is_system, ni siquiera vía SQL directo — son el único puente
-- entre un Rol de Acceso y el nivel de seguridad real (profiles.role).
create or replace function public.protect_system_access_roles()
returns trigger as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'No se puede eliminar el Rol de Acceso de sistema "%".', old.name;
    end if;
    return old;
  end if;
  if old.is_system and not new.is_system then
    raise exception 'No se puede quitar la marca de sistema del Rol de Acceso "%".', old.name;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_protect_system_access_roles
  before update or delete on public.access_roles
  for each row execute function public.protect_system_access_roles();

-- Semilla de los 4 roles de sistema — module_keys replica exactamente
-- el comportamiento que antes estaba hardcodeado en AppShell.tsx
-- (hasPermission), para que nadie pierda ni gane acceso el día de la
-- migración. A partir de aquí es 100% editable desde la UI.
insert into public.access_roles (name, description, base_role, is_system, module_keys) values
  ('Super Admin', 'Acceso total a todos los módulos del sistema.', 'super_admin', true, array[
    'dashboard','dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision',
    'dashboard-negocio','conciliacion-negocio','facturacion-negocio','cuentas-pagar-negocio','cuentas-cobrar-negocio','planificacion-pagos-negocio','gestion-negocios',
    'dashboard-mensajero','conciliacion-mensajero','facturacion-mensajero','cuentas-pagar-mensajero','cuentas-cobrar-mensajero','planificacion-pagos-mensajero','gestion-mensajeros',
    'roles-usuarios','areas','metodos-pago-negocios','metodos-pago-mensajeros','metodos-pago-ordenes','tipologia-cobrar','tipologia-pagar','grupos-pago','razon-cambio','comision-mandao','documentos-importacion','config-logs'
  ]),
  ('Supervisor', 'Acceso total a todos los módulos del sistema.', 'supervisor', true, array[
    'dashboard','dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision',
    'dashboard-negocio','conciliacion-negocio','facturacion-negocio','cuentas-pagar-negocio','cuentas-cobrar-negocio','planificacion-pagos-negocio','gestion-negocios',
    'dashboard-mensajero','conciliacion-mensajero','facturacion-mensajero','cuentas-pagar-mensajero','cuentas-cobrar-mensajero','planificacion-pagos-mensajero','gestion-mensajeros',
    'roles-usuarios','areas','metodos-pago-negocios','metodos-pago-mensajeros','metodos-pago-ordenes','tipologia-cobrar','tipologia-pagar','grupos-pago','razon-cambio','comision-mandao','documentos-importacion','config-logs'
  ]),
  ('Operador', 'Puede ejecutar Verificación en Dispatcher y Disponibilidad. Sin acceso a Gestión ni Configuración.', 'operador', true, array[
    'dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision'
  ]),
  ('Visitante', 'Solo lectura en Dispatcher y Disponibilidad.', 'visitante', true, array[
    'dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision'
  ])
on conflict (name) do nothing;

alter table public.profiles
  add column access_role_id uuid references public.access_roles(access_role_id) on delete set null;

-- Todo usuario tiene siempre un Rol de Acceso asignado (se respalda con
-- el fallback de compatibilidad en AppShell.tsx hasPermission() por si
-- alguna fila quedara en NULL). Los perfiles existentes se migran al rol
-- de sistema que corresponde a su profiles.role actual.
update public.profiles p
set access_role_id = ar.access_role_id
from public.access_roles ar
where p.access_role_id is null and ar.is_system and ar.base_role = p.role;

-- =====================================================================
-- MÓDULO NEGOCIOS/MENSAJEROS — CONCILIACIÓN (agregado 2026-09-24,
-- UNIFICADO/CORREGIDO 2026-09-30)
-- =====================================================================
-- Ver "Instrucciones Conciliaciones Mandao.md" secciones 6 (Negocios) y
-- 7 (Mensajeros) para la especificación funcional completa (reglas de
-- negocio, mapeo de Payment Type a los 4 baldes, fórmula de CxC/CxP).
-- 2026-09-30: renombrada `conciliaciones` -> `conciliaciones_businesses`
-- y `estado` pasó de boolean a un ciclo de vida de texto (Nuevo/Enviado/
-- Aprobado/Incorrecto/Facturado), para alinear con las instrucciones
-- generales de Conciliación (que cubren Negocios y Mensajeros a la vez
-- y usan una tabla separada por entidad, no una compartida).

-- Comisión que retiene Mandao por las órdenes de cada tipo de entidad.
-- Un solo valor vigente por entity_type — sin historial de tasas pasadas
-- como exchange_rates, porque no se pidió esa función; si hace falta
-- más adelante se amplía igual que RazonCambioPage.
create table public.commission_settings (
  entity_type text primary key check (entity_type in ('businesses', 'messengers')),
  percentage numeric(5,2) not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- El 20% de Mensajeros es un valor inicial de referencia (igual que
-- Negocios) — confirmado por el usuario 2026-09-30: Negocios inicia en
-- 20%, Mensajeros inicia en 10%. Ambos ajustables desde Configuración ->
-- Comisión Mandao.
insert into public.commission_settings (entity_type, percentage) values
  ('businesses', 20.00),
  ('messengers', 10.00)
on conflict (entity_type) do nothing;

-- Tarifa de Alquiler de Mochila (Mensajeros), por tipo de mochila — se
-- gestiona en el mismo submódulo "Comisión Mandao" (Configuración). Sin
-- valor inicial confirmado por el usuario todavía: arranca en 0.00,
-- editable desde la UI antes de que afecte ninguna conciliación real.
create table public.backpack_rental_rates (
  backpack_type text primary key check (backpack_type in ('Pequeña', 'Grande')),
  rate numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.backpack_rental_rates (backpack_type, rate) values
  ('Pequeña', 0.00),
  ('Grande', 0.00)
on conflict (backpack_type) do nothing;

-- Ajustes generales clave/valor (ej. carpeta de Drive de los PDF de
-- Conciliación). Ver migración 2026-10-07_conciliaciones_pdf_google_drive.sql.
create table public.app_settings (
  setting_key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- % de descuento sobre Disponibilidades en Conciliación de Mensajeros
-- (Configuración -> Comisión Mandao). Ver migración 2026-10-01b.
create table public.availability_discount_settings (
  entity_type text primary key check (entity_type = 'messengers'),
  percentage numeric(5,2) not null default 0 check (percentage >= 0 and percentage <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.availability_discount_settings (entity_type, percentage) values
  ('messengers', 0.00)
on conflict (entity_type) do nothing;

-- Reglas de excepción de la Verificación del Dispatcher (Configuración ->
-- Reglas). Ver migración 2026-09-30d_dispatcher_rules.sql para el detalle.
create table public.dispatcher_rules (
  rule_id uuid primary key default gen_random_uuid(),
  actor text not null check (actor in ('negocios', 'mensajeros')),
  name text not null,
  store text,
  when_empty text[] not null default '{}',
  description text,
  columns jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Reglas iniciales: reproducen exactamente lo que la Verificación ya
-- toleraba antes, para que su comportamiento no cambie al desplegar.
insert into public.dispatcher_rules (actor, name, store, when_empty, description, columns) values
  ('negocios', 'Columnas opcionales', null, '{}',
   'Columnas que hasta hoy la Verificación nunca exigía (se registran en 0 o vacías).',
   '[{"column":"customerNumber","action":"permitir"},{"column":"processingFee","action":"permitir"},{"column":"tax","action":"permitir"},{"column":"rate","action":"permitir"},{"column":"transactionFee","action":"permitir"},{"column":"promocode","action":"permitir"},{"column":"area","action":"permitir"}]'::jsonb),
  ('mensajeros', 'Cargos de entrega opcionales', null, '{}',
   'Los cargos de entrega pueden venir vacíos.',
   '[{"column":"deliveryCharge","action":"permitir"},{"column":"extraDeliveryCharge","action":"permitir"},{"column":"driverAdminCharge","action":"permitir"},{"column":"complementaryDelivery","action":"permitir"}]'::jsonb),
  ('negocios', 'Mandao Express', 'Mandao Express', '{}',
   'Servicio propio de Mandao: no registra monto de producto, oferta ni cargo de administración del negocio.',
   '[{"column":"productAmount","action":"permitir"},{"column":"storeOffer","action":"permitir"},{"column":"storeAdminCharge","action":"permitir"}]'::jsonb),
  ('mensajeros', 'Recogida en el establecimiento', null,
   array['deliveryCharge','extraDeliveryCharge','driverAdminCharge','complementaryDelivery'],
   'RN-003: el cliente recoge en el negocio; sin cargos de entrega no interviene mensajero.',
   '[{"column":"driver","action":"permitir"}]'::jsonb);

-- Historial de conciliaciones de Negocios. `establecimiento`/`area`
-- quedan denormalizados (igual que dispatcher.store) para que el
-- histórico no cambie de texto si el negocio se renombra después;
-- business_id/area_id sí son FK reales, usados para el chequeo de
-- duplicidad (RN sección 6.4.2) y para filtrar.
--
-- CÁLCULO POR MÉTODO DE PAGO DEL NEGOCIO (confirmado por el usuario
-- 2026-09-30, ver Instrucciones sección 6.4 para el detalle completo):
-- el dispatcher siempre registra los montos en CUP; el método de pago
-- registrado del negocio (`businesses.payment_method`, catálogo
-- Configuración → Métodos de Pago → Negocios) decide cuántas filas se
-- generan por rango y si alguna se convierte a USD:
--   'Transferencia'            -> 1 fila, todo en CUP:
--                                 0.8*(TM+SM+US) - CXC_CU
--   'Transferencia-Efectivo'   -> 2 filas, ambas en CUP:
--                                 "Transferencia" = 0.8*TM
--                                 "Efectivo"      = 0.8*(SM+US) - CXC_CU
--   'Transferencia-Exterior'   -> 2 filas:
--                                 "Transferencia" (CUP) = 0.8*TM - CXC_CU
--                                 "Exterior" (USD, vía tasa de cambio activa)
--                                          = 0.8*(SM+US) convertido a USD
-- En todos los casos cada fila solo llena los baldes que le corresponden
-- (los demás quedan en 0) para que el total de esa fila siga saliendo de
-- la misma fórmula universal `cxp_tm+cxp_sm+cxp_us-cxc_cu`.
create table public.conciliaciones_businesses (
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
  -- via_pago: antes guardaba el método de pago crudo del negocio; desde
  -- 2026-09-30 guarda el "riel" de liquidación de ESTA fila concreta
  -- ('Transferencia' / 'Efectivo' / 'Exterior') — ver sección 6.4 y el
  -- comentario grande más abajo. moneda indica en qué está expresada
  -- esta fila (los CxP/CxC "Exterior" van en USD, el resto en CUP).
  via_pago text,
  moneda text not null default 'CUP' check (moneda in ('CUP', 'USD')),
  responsable text not null,
  responsable_id uuid references auth.users(id),
  conciliacion text not null,
  estado text not null default 'Nuevo'
    check (estado in ('Nuevo', 'Enviado', 'Aprobado', 'Incorrecto', 'Facturado')),
  facturacion text,
  descuento numeric(12,2),
  nota text,
  pagado numeric(12,2),
  saldo numeric(12,2),
  estado_pago text,
  referencia text,
  fecha_pago date,
  prioridad text,
  pdf_drive_file_id text,   -- PDF subido a Google Drive (2026-10-07)
  pdf_drive_url text,
  comision_pct numeric(5,2),     -- % de comisión usado (2026-10-15, migración 2026-10-15)
  tasa_cambio numeric(18,8),     -- USD por 1 CUP usada en filas Exterior (2026-10-15)
  desglose jsonb,                -- desglose por grupo de pago (2026-10-27)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RN sección 6.4.2 "Duplicidad", ampliada 2026-09-30: un negocio con
-- Método de Pago "Transferencia-Efectivo" o "Transferencia-Exterior"
-- genera DOS filas por rango (una por cada riel de liquidación) — el
-- índice único ahora incluye `via_pago` para permitir esas dos filas
-- coexistiendo, sin dejar de bloquear un duplicado real de la misma fila.
create unique index uq_conciliaciones_businesses_range
  on public.conciliaciones_businesses(business_id, fecha_inicial, fecha_final, via_pago);

-- Historial de conciliaciones de Mensajeros — ver Instrucciones sección
-- 7. `disponibilidades` (suma de availabilities.amount_to_pay del mismo
-- mensajero en el rango) SÍ está implementado; `alquiler_mochila` queda
-- en 0 por ahora — pendiente de que el usuario defina su fuente/monto
-- (sección 7.4). `saldo_cup` es el neto (Total por Pagar - Total por
-- Cobrar) en CUP, sin conversión: los mensajeros siempre cobran y pagan en
-- CUP (corregido 2026-09-30, ver migración 2026-09-30e).
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
  pdf_drive_file_id text,   -- PDF subido a Google Drive (2026-10-07)
  pdf_drive_url text,
  comision_pct numeric(5,2),     -- % de comisión usado (2026-10-15, migración 2026-10-15)
  desglose jsonb,                -- desglose por grupo de pago (2026-10-27)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_conciliaciones_messengers_range
  on public.conciliaciones_messengers(messenger_id, fecha_inicial, fecha_final);

-- =====================================================================
-- RLS — Row Level Security alineado a los 3 roles del sistema
-- =====================================================================
alter table public.areas enable row level security;
alter table public.audit_logs enable row level security;
alter table public.dispatcher enable row level security;
alter table public.dispatcher_verifications enable row level security;
alter table public.dispatcher_incidents enable row level security;
alter table public.dispatcher_changes enable row level security;
alter table public.availabilities enable row level security;
alter table public.availability_imports enable row level security;
alter table public.availability_verifications enable row level security;
alter table public.availability_incidents enable row level security;
alter table public.messengers enable row level security;
alter table public.profiles enable row level security;
alter table public.payment_methods enable row level security;
alter table public.payment_groups enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.businesses enable row level security;
alter table public.import_sources enable row level security;
alter table public.access_roles enable row level security;
alter table public.commission_settings enable row level security;
alter table public.backpack_rental_rates enable row level security;
alter table public.availability_discount_settings enable row level security;
alter table public.app_settings enable row level security;
alter table public.dispatcher_rules enable row level security;
alter table public.conciliaciones_businesses enable row level security;
alter table public.conciliaciones_messengers enable row level security;

-- Lectura: los 4 roles pueden leer (Visitante = solo lectura, según matriz de
-- permisos) — PERO solo si profiles.active = true (public.is_active_user()).
-- Antes de 2026-09-10 esto solo chequeaba auth.role() = 'authenticated', es
-- decir "está logueado en Supabase", sin mirar si un Super Admin lo autorizó
-- realmente — cualquier cuenta @mandao.app auto-registrada por el trigger
-- ya leía todo el sistema como si fuera un Visitante legítimo.
create policy "read_all_authenticated" on public.areas for select using (public.is_active_user());
create policy "read_all_authenticated" on public.dispatcher for select using (public.is_active_user());
create policy "read_all_authenticated" on public.dispatcher_verifications for select using (public.is_active_user());
create policy "read_all_authenticated" on public.dispatcher_incidents for select using (public.is_active_user());
create policy "read_all_authenticated" on public.dispatcher_changes for select using (public.is_active_user());
create policy "read_all_authenticated" on public.availabilities for select using (public.is_active_user());
create policy "read_all_authenticated" on public.availability_imports for select using (public.is_active_user());
create policy "read_all_authenticated" on public.availability_verifications for select using (public.is_active_user());
create policy "read_all_authenticated" on public.availability_incidents for select using (public.is_active_user());
create policy "read_all_authenticated" on public.messengers for select using (public.is_active_user());
create policy "read_all_authenticated" on public.availability_discount_settings for select using (public.is_active_user());
create policy "read_all_authenticated" on public.app_settings for select using (public.is_active_user());
create policy "read_all_authenticated" on public.dispatcher_rules for select using (public.is_active_user());
create policy "read_own_profile" on public.profiles for select using (auth.uid() = id or public.is_admin_or_supervisor());
-- Edición de perfiles (cambiar rol/estado de otros usuarios): agregado
-- 2026-09-08 — faltaba por completo, sin esto nadie (ni super_admin)
-- podía actualizar el perfil de otro usuario desde RolesUsuariosPage.
create policy "manage_profiles_super_admin" on public.profiles
  for update using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "read_all_authenticated" on public.payment_methods for select using (public.is_active_user());
create policy "read_all_authenticated" on public.payment_groups for select using (public.is_active_user());
create policy "read_all_authenticated" on public.exchange_rates for select using (public.is_active_user());
create policy "read_all_authenticated" on public.businesses for select using (public.is_active_user());
create policy "read_all_authenticated" on public.import_sources for select using (public.is_active_user());
create policy "read_all_authenticated" on public.access_roles for select using (public.is_active_user());
create policy "read_all_authenticated" on public.commission_settings for select using (public.is_active_user());
create policy "read_all_authenticated" on public.backpack_rental_rates for select using (public.is_active_user());
create policy "read_all_authenticated" on public.conciliaciones_businesses for select using (public.is_active_user());
create policy "read_all_authenticated" on public.conciliaciones_messengers for select using (public.is_active_user());

-- Escritura de Verificaciones: Super Admin, Supervisor, Operador (Operador SÍ puede ejecutar verificaciones)
create policy "insert_verification" on public.dispatcher_verifications
  for insert with check (public.can_execute_processes());
create policy "insert_verification" on public.availability_verifications
  for insert with check (public.can_execute_processes());
create policy "insert_incidents" on public.dispatcher_incidents
  for insert with check (public.can_execute_processes());
create policy "insert_incidents" on public.availability_incidents
  for insert with check (public.can_execute_processes());

-- Escritura de Importaciones: SOLO Super Admin/Supervisor (RN-007 aplicada también en backend, no solo UI)
create policy "insert_import" on public.availability_imports
  for insert with check (public.is_admin_or_supervisor());
create policy "insert_dispatcher_rows" on public.dispatcher
  for insert with check (public.is_admin_or_supervisor());
create policy "insert_availability_rows" on public.availabilities
  for insert with check (public.is_admin_or_supervisor());
-- dispatcher_changes se genera durante la Verificación (no es una "importación"
-- separada en el código real), por eso el permiso es el de ejecución de procesos,
-- igual que insert_verification/insert_incidents
create policy "insert_changes" on public.dispatcher_changes
  for insert with check (public.can_execute_processes());

-- Audit logs: cualquier usuario autenticado con permiso de ejecución puede insertar su propio log
create policy "insert_own_audit_log" on public.audit_logs
  for insert with check (auth.uid() = user_id);
-- Lectura de Logs de Auditoría: agregado 2026-09-08 — faltaba por completo
-- una política de SELECT (con RLS activado y sin política, Postgres deniega
-- todo select por defecto, incluso a super_admin). Visible a Super
-- Admin/Supervisor, igual que el resto de "Configuraciones" (sección 4).
create policy "read_audit_logs_admin_supervisor" on public.audit_logs
  for select using (public.is_admin_or_supervisor());

-- Edición/eliminación manual en Revisión: solo Super Admin/Supervisor
-- (agregado en v3 — sin estas políticas, Postgres deniega UPDATE/DELETE
-- por defecto para todos los roles, incluido super_admin).
create policy "update_dispatcher_rows" on public.dispatcher
  for update using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());
create policy "delete_dispatcher_rows" on public.dispatcher
  for delete using (public.is_admin_or_supervisor());
create policy "update_availability_rows" on public.availabilities
  for update using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());
create policy "delete_availability_rows" on public.availabilities
  for delete using (public.is_admin_or_supervisor());

-- Áreas, mensajeros: gestión (CRUD) solo Super Admin
create policy "manage_areas" on public.areas
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_messengers" on public.messengers
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- Métodos de Pago, Razón de Cambio: gestión (CRUD) solo Super Admin,
-- mismo criterio que Áreas/Mensajeros (ROLE_CAN_MANAGE_CATALOGS en auth.tsx)
create policy "manage_payment_methods" on public.payment_methods
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_payment_groups" on public.payment_groups
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_exchange_rates" on public.exchange_rates
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_businesses" on public.businesses
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_import_sources" on public.import_sources
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_access_roles" on public.access_roles
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_commission_settings" on public.commission_settings
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_backpack_rental_rates" on public.backpack_rental_rates
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_app_settings" on public.app_settings
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_availability_discount_settings" on public.availability_discount_settings
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');
create policy "manage_dispatcher_rules" on public.dispatcher_rules
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

-- Conciliaciones: ejecutar el proceso (insertar) y corregir registros
-- (editar/eliminar) queda al mismo nivel que Importación (ROLE_CAN_IMPORT
-- en auth.tsx) — Super Admin/Supervisor, no Operador, por ser un proceso
-- que mueve dinero (a diferencia de Verificar, que Operador sí puede).
create policy "manage_conciliaciones_businesses" on public.conciliaciones_businesses
  for all using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());
create policy "manage_conciliaciones_messengers" on public.conciliaciones_messengers
  for all using (public.is_admin_or_supervisor())
  with check (public.is_admin_or_supervisor());

-- =====================================================================
-- FUNCIÓN DE APOYO — RN-005: Coincidencia difusa (Dispatcher)
-- normaliza texto quitando tildes, mayúsculas y espacios dobles
-- =====================================================================
create or replace function public.normalize_fuzzy(input text)
returns text
language sql immutable
as $$
  select trim(regexp_replace(lower(unaccent(input)), '\s+', ' ', 'g'));
$$;

-- Ejemplo de uso en la verificación del Dispatcher (RN-005):
-- select * from public.messengers
--   where public.normalize_fuzzy(name) = public.normalize_fuzzy('CAFÉ  Habana');
-- (para similitud tipo "Habana" ≈ "Havana" combinar con similarity() de pg_trgm)

-- =====================================================================
-- FUNCIÓN DE APOYO — RN-012: Coincidencia EXACTA con trim (Disponibilidad)
-- Diferencia clave: NO usa unaccent ni lower — comparación exacta post-trim
-- =====================================================================
create or replace function public.normalize_exact(input text)
returns text
language sql immutable
as $$
  select trim(regexp_replace(input, '\s+', ' ', 'g'));
$$;

-- =====================================================================
-- GRANTS — agregado en v4. Necesario ADEMÁS de las políticas RLS: un
-- GRANT de esquema/tabla es un permiso de Postgres previo a RLS. Sin
-- esto, anon/authenticated no pueden leer ni escribir NADA (ni
-- siquiera un super_admin logueado), sin importar las políticas RLS.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;

-- =====================================================================
-- CONSECUTIVO DE CONCILIACIONES (PN/CN/PM/CM + año + número) — agregado
-- 2026-10-07, ver migraciones 2026-10-07b y 2026-10-07c (las liquidaciones
-- en 0 no se numeran).
-- Va al final porque revoca el execute que otorgan los GRANT de arriba.
-- =====================================================================
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

alter table public.conciliaciones_businesses add column consecutivo text unique;
alter table public.conciliaciones_messengers add column consecutivo text unique;

create trigger trg_consecutivo_conciliacion_negocio
  before insert on public.conciliaciones_businesses
  for each row execute function public.set_consecutivo_conciliacion_negocio();

create trigger trg_consecutivo_conciliacion_mensajero
  before insert on public.conciliaciones_messengers
  for each row execute function public.set_consecutivo_conciliacion_mensajero();

-- Solo los triggers deben llamar al generador.
revoke execute on function public.next_conciliacion_consecutivo(text, date) from public, anon, authenticated;
