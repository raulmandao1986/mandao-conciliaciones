-- =====================================================================
-- MANDAO CONCILIACIONES — Patch v3
-- Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase, contra el
-- proyecto donde ya corrió supabase_schema.sql (v2).
--
-- Corrige dos huecos encontrados al migrar el código real de
-- VerificationPage.tsx / RevisionPage.tsx / DisponibilidadVerificationPage.tsx /
-- DisponibilidadRevisionPage.tsx de Firestore a Supabase. Ver
-- PLAN_MIGRACION.md sección "Correcciones v3" para el detalle.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Políticas RLS de UPDATE/DELETE faltantes.
--    El esquema v2 solo tenía SELECT/INSERT para 'dispatcher' y
--    'availabilities'. Sin política de UPDATE/DELETE, Postgres deniega
--    la operación por defecto para TODOS los roles (incluido
--    super_admin) — RevisionPage.tsx y DisponibilidadRevisionPage.tsx
--    necesitan editar/eliminar registros manualmente y sincronizar
--    discrepancias contra el Google Sheet.
--    Alcance: solo super_admin/supervisor (igual que las políticas de
--    insert ya existentes) — Operador solo verifica, no edita ni borra.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2. dispatcher_changes: corrección de estructura.
--    El esquema v2 la diseñó como un log de diffs genérico
--    (field_changed/old_value/new_value), pero el código real de
--    VerificationPage.tsx importa la FILA COMPLETA de la pestaña
--    "Cambios" del Google Sheet (negocio, mensajero, tipo de pago,
--    monto de producto, monto de delivery, detalle, fecha) — no un
--    diff campo a campo. Se corrige para no perder esa información.
-- ---------------------------------------------------------------------
alter table public.dispatcher_changes drop column if exists field_changed;
alter table public.dispatcher_changes drop column if exists old_value;
alter table public.dispatcher_changes drop column if exists new_value;

alter table public.dispatcher_changes add column if not exists store text;
alter table public.dispatcher_changes add column if not exists driver text;
alter table public.dispatcher_changes add column if not exists payment_type text;
alter table public.dispatcher_changes add column if not exists product_amount numeric(12,2) default 0;
alter table public.dispatcher_changes add column if not exists delivery_charge numeric(12,2) default 0;
alter table public.dispatcher_changes add column if not exists detail text;
alter table public.dispatcher_changes add column if not exists change_date date;

comment on table public.dispatcher_changes is 'Copia real de las filas de la pestaña "Cambios" del Google Sheet del Dispatcher, asociadas a la verificación que las importó (corregido en v3 — v2 asumía un log de diffs genérico que no coincide con el código real).';
