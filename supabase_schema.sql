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
  role public.user_role not null default 'visitante',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Extiende auth.users con el rol de negocio (Super Admin/Supervisor/Operador/Visitante) definido en la Constitución.';

-- Trigger: crear profile automáticamente al registrar un usuario en Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'visitante');
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
create or replace function public.current_user_role()
returns public.user_role
language sql stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin_or_supervisor()
returns boolean
language sql stable
as $$
  select public.current_user_role() in ('super_admin', 'supervisor');
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
  promocode text,
  area_id uuid not null references public.areas(area_id),
  verification_id uuid,   -- FK lógica a dispatcher_verifications (se define abajo con alter)
  created_at timestamptz not null default now()
);

-- RN-009: una orden no puede importarse dos veces para la misma área y fecha operativa
create unique index uq_dispatcher_order_area_date
  on public.dispatcher(order_id, area_id, delivery_date);

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

-- Índice para acelerar coincidencia difusa (RN-005) usada en Dispatcher
create index idx_messengers_name_trgm on public.messengers using gin (name gin_trgm_ops);

-- =====================================================================
-- MÓDULO GESTIÓN — CATÁLOGOS (agregado 2026-09-08)
-- =====================================================================
-- Traducción directa de las colecciones Firestore 'MetodosPago' y
-- 'RazonCambio' (src/modules/gestion/MetodosPagoPage.tsx.bak y
-- RazonCambioPage.tsx.bak) — se mantienen los mismos campos y la misma
-- lógica de negocio, solo cambia el nombre de columna a snake_case.

-- 13. PAYMENT_METHODS (= 'MetodosPago'). Un solo catálogo compartido
-- por Negocios/Mensajeros/Órdenes, filtrado por los 3 booleanos
-- 'applies_to_*' — igual que hacía MetodosPagoPage con su prop `type`.
create table public.payment_methods (
  payment_method_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  applies_to_businesses boolean not null default true,
  applies_to_messengers boolean not null default true,
  applies_to_orders boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14. EXCHANGE_RATES (= 'RazonCambio'). RN-010 "Tasa de Cambio Única
-- Activa": al activar una tasa, todas las demás deben quedar inactivas
-- — esa regla se aplica en la UI (RazonCambioPage), igual que en el
-- código original, no como constraint de base de datos.
create table public.exchange_rates (
  exchange_rate_id uuid primary key default gen_random_uuid(),
  name text not null,
  rate_cup numeric(12,2) not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
alter table public.exchange_rates enable row level security;

-- Lectura: los 3 roles pueden leer (Visitante = solo lectura, según matriz de permisos)
create policy "read_all_authenticated" on public.areas for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.dispatcher for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.dispatcher_verifications for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.dispatcher_incidents for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.dispatcher_changes for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.availabilities for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.availability_imports for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.availability_verifications for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.availability_incidents for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.messengers for select using (auth.role() = 'authenticated');
create policy "read_own_profile" on public.profiles for select using (auth.uid() = id or public.is_admin_or_supervisor());
create policy "read_all_authenticated" on public.payment_methods for select using (auth.role() = 'authenticated');
create policy "read_all_authenticated" on public.exchange_rates for select using (auth.role() = 'authenticated');

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
create policy "manage_exchange_rates" on public.exchange_rates
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

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
