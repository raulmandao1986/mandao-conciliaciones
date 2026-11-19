-- =====================================================================
-- PERMISOS POR ACCIÓN Y POR ROL (2026-11-19c)
-- Configuración -> Roles y Usuarios: cada Rol de Acceso marca, por menú, las
-- acciones que puede ejecutar (access_roles.permisos =
-- { "<menu>": { "<accion>": true|false } }). Catálogo de menús y acciones en
-- src/lib/permisosCatalogo.ts. La base de datos las aplica aquí con
-- public.tiene_permiso(menu, accion):
--   * Super Admin: siempre true.
--   * Usuario inactivo o menú fuera de module_keys: false.
--   * Acción marcada en el rol: su valor.
--   * Acción sin marcar: plantilla del rol base (public.plantilla_permiso),
--     que reproduce lo que cada rol podía hacer antes de este cambio.
-- Usuarios y Roles siguen siendo solo de Super Admin (manage_access_roles y
-- manage_profiles_super_admin no cambian).
-- Idempotente: se puede correr más de una vez.
-- =====================================================================

create or replace function public.plantilla_permiso(p_rol public.user_role, p_menu text, p_accion text)
returns boolean
language sql immutable
as $$
  select case
    when p_rol = 'super_admin' then true
    when p_accion in ('ver', 'exportar') then true
    when p_rol = 'visitante' then false
    when p_accion in ('verificar', 'enviar_correo', 'detectar')
      and p_menu in ('dispatcher-verificacion', 'disponibilidad-verificacion', 'dispatcher-revision', 'disponibilidad-revision') then true
    when p_rol = 'operador' then false
    -- supervisor
    when p_menu in ('dispatcher-verificacion', 'disponibilidad-verificacion') then p_accion = 'importar'
    when p_menu in ('dispatcher-revision', 'disponibilidad-revision') then p_accion in ('sincronizar', 'editar', 'eliminar')
    when p_menu like 'conciliacion-%' then p_accion <> 'registrar_entidad'
    when p_menu like 'cobros-pagos-%' then p_accion = 'generar_planificacion'
    when p_menu = 'planificacion-pagos' then true
    when p_menu = 'razon-cambio' then p_accion = 'sincronizar'
    else false
  end;
$$;

create or replace function public.tiene_permiso(p_menu text, p_accion text)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_active boolean;
  v_keys text[];
  v_perm jsonb;
  v_val jsonb;
begin
  select p.role, p.active, ar.module_keys, ar.permisos
    into v_role, v_active, v_keys, v_perm
  from public.profiles p
  left join public.access_roles ar on ar.access_role_id = p.access_role_id
  where p.id = auth.uid();
  if not found or not coalesce(v_active, false) then return false; end if;
  if v_role = 'super_admin' then return true; end if;
  if v_keys is not null and not (p_menu = any(v_keys)) then return false; end if;
  if p_accion = 'ver' then return true; end if;
  v_val := v_perm -> p_menu -> p_accion;
  if v_val is not null and jsonb_typeof(v_val) = 'boolean' then return v_val = 'true'::jsonb; end if;
  return public.plantilla_permiso(v_role, p_menu, p_accion);
end;
$$;

grant execute on function public.tiene_permiso(text, text) to anon, authenticated;
grant execute on function public.plantilla_permiso(public.user_role, text, text) to anon, authenticated;

-- Los permisos guardados antes de hoy (Ver/Crear/Editar/Eliminar, marcados por
-- defecto y sin efecto real) se descartan: cada rol arranca con la plantilla
-- de su rol base y se configura de nuevo en Roles y Usuarios. Los guardados ya
-- con el formato nuevo llevan la marca "_formato": 2 y no se tocan.
update public.access_roles
set permisos = '{}'::jsonb
where permisos <> '{}'::jsonb
  and coalesce(permisos ->> '_formato', '') <> '2';

-- ---------------------------------------------------------------------
-- Dispatcher — Verificación, importación y Revisión
-- ---------------------------------------------------------------------
drop policy if exists "insert_verification" on public.dispatcher_verifications;
create policy "insert_verification" on public.dispatcher_verifications
  for insert with check (
      (select public.tiene_permiso('dispatcher-verificacion', 'verificar'))
      or (select public.tiene_permiso('dispatcher-verificacion', 'importar')));
drop policy if exists "perm_delete_dispatcher_verifications" on public.dispatcher_verifications;
create policy "perm_delete_dispatcher_verifications" on public.dispatcher_verifications
  for delete using (
      (select public.tiene_permiso('dispatcher-verificacion', 'importar')));
drop policy if exists "insert_incidents" on public.dispatcher_incidents;
create policy "insert_incidents" on public.dispatcher_incidents
  for insert with check (
      (select public.tiene_permiso('dispatcher-verificacion', 'verificar'))
      or (select public.tiene_permiso('dispatcher-verificacion', 'importar')));
drop policy if exists "insert_changes" on public.dispatcher_changes;
create policy "insert_changes" on public.dispatcher_changes
  for insert with check (
      (select public.tiene_permiso('dispatcher-verificacion', 'verificar'))
      or (select public.tiene_permiso('dispatcher-verificacion', 'importar')));
drop policy if exists "insert_dispatcher_rows" on public.dispatcher;
create policy "insert_dispatcher_rows" on public.dispatcher
  for insert with check (
      (select public.tiene_permiso('dispatcher-verificacion', 'importar'))
      or (select public.tiene_permiso('dispatcher-revision', 'sincronizar')));
drop policy if exists "update_dispatcher_rows" on public.dispatcher;
create policy "update_dispatcher_rows" on public.dispatcher
  for update using (
      (select public.tiene_permiso('dispatcher-revision', 'editar'))
      or (select public.tiene_permiso('dispatcher-revision', 'sincronizar')))
  with check (
      (select public.tiene_permiso('dispatcher-revision', 'editar'))
      or (select public.tiene_permiso('dispatcher-revision', 'sincronizar')));
drop policy if exists "delete_dispatcher_rows" on public.dispatcher;
create policy "delete_dispatcher_rows" on public.dispatcher
  for delete using (
      (select public.tiene_permiso('dispatcher-revision', 'eliminar'))
      or (select public.tiene_permiso('dispatcher-revision', 'sincronizar')));

-- Disponibilidad
drop policy if exists "insert_verification" on public.availability_verifications;
create policy "insert_verification" on public.availability_verifications
  for insert with check (
      (select public.tiene_permiso('disponibilidad-verificacion', 'verificar'))
      or (select public.tiene_permiso('disponibilidad-verificacion', 'importar')));
drop policy if exists "insert_incidents" on public.availability_incidents;
create policy "insert_incidents" on public.availability_incidents
  for insert with check (
      (select public.tiene_permiso('disponibilidad-verificacion', 'verificar'))
      or (select public.tiene_permiso('disponibilidad-verificacion', 'importar')));
drop policy if exists "insert_import" on public.availability_imports;
create policy "insert_import" on public.availability_imports
  for insert with check (
      (select public.tiene_permiso('disponibilidad-verificacion', 'importar')));
drop policy if exists "insert_availability_rows" on public.availabilities;
create policy "insert_availability_rows" on public.availabilities
  for insert with check (
      (select public.tiene_permiso('disponibilidad-verificacion', 'importar'))
      or (select public.tiene_permiso('dispatcher-verificacion', 'importar')));
drop policy if exists "update_availability_rows" on public.availabilities;
create policy "update_availability_rows" on public.availabilities
  for update using (
      (select public.tiene_permiso('disponibilidad-revision', 'editar')))
  with check (
      (select public.tiene_permiso('disponibilidad-revision', 'editar')));
drop policy if exists "delete_availability_rows" on public.availabilities;
create policy "delete_availability_rows" on public.availabilities
  for delete using (
      (select public.tiene_permiso('disponibilidad-revision', 'eliminar')));

-- Gestión de Negocios y Mensajeros (incluye importación masiva y el alta /
-- activación desde Conciliación)
drop policy if exists "manage_businesses" on public.businesses;
drop policy if exists "perm_insert_businesses" on public.businesses;
create policy "perm_insert_businesses" on public.businesses
  for insert with check (
      (select public.tiene_permiso('gestion-negocios', 'crear'))
      or (select public.tiene_permiso('gestion-negocios', 'importar'))
      or (select public.tiene_permiso('conciliacion-negocio', 'registrar_entidad')));
drop policy if exists "perm_update_businesses" on public.businesses;
create policy "perm_update_businesses" on public.businesses
  for update using (
      (select public.tiene_permiso('gestion-negocios', 'editar'))
      or (select public.tiene_permiso('gestion-negocios', 'importar'))
      or (select public.tiene_permiso('conciliacion-negocio', 'registrar_entidad')))
  with check (
      (select public.tiene_permiso('gestion-negocios', 'editar'))
      or (select public.tiene_permiso('gestion-negocios', 'importar'))
      or (select public.tiene_permiso('conciliacion-negocio', 'registrar_entidad')));
drop policy if exists "perm_delete_businesses" on public.businesses;
create policy "perm_delete_businesses" on public.businesses
  for delete using (
      (select public.tiene_permiso('gestion-negocios', 'eliminar')));
drop policy if exists "manage_messengers" on public.messengers;
drop policy if exists "perm_insert_messengers" on public.messengers;
create policy "perm_insert_messengers" on public.messengers
  for insert with check (
      (select public.tiene_permiso('gestion-mensajeros', 'crear'))
      or (select public.tiene_permiso('gestion-mensajeros', 'importar'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'registrar_entidad')));
drop policy if exists "perm_update_messengers" on public.messengers;
create policy "perm_update_messengers" on public.messengers
  for update using (
      (select public.tiene_permiso('gestion-mensajeros', 'editar'))
      or (select public.tiene_permiso('gestion-mensajeros', 'importar'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'registrar_entidad')))
  with check (
      (select public.tiene_permiso('gestion-mensajeros', 'editar'))
      or (select public.tiene_permiso('gestion-mensajeros', 'importar'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'registrar_entidad')));
drop policy if exists "perm_delete_messengers" on public.messengers;
create policy "perm_delete_messengers" on public.messengers
  for delete using (
      (select public.tiene_permiso('gestion-mensajeros', 'eliminar')));

-- Catálogos de Configuración
drop policy if exists "manage_areas" on public.areas;
drop policy if exists "perm_insert_areas" on public.areas;
create policy "perm_insert_areas" on public.areas
  for insert with check (
      (select public.tiene_permiso('areas', 'crear')));
drop policy if exists "perm_update_areas" on public.areas;
create policy "perm_update_areas" on public.areas
  for update using (
      (select public.tiene_permiso('areas', 'editar')))
  with check (
      (select public.tiene_permiso('areas', 'editar')));
drop policy if exists "perm_delete_areas" on public.areas;
create policy "perm_delete_areas" on public.areas
  for delete using (
      (select public.tiene_permiso('areas', 'eliminar')));
drop policy if exists "manage_payment_methods" on public.payment_methods;
drop policy if exists "perm_insert_payment_methods" on public.payment_methods;
create policy "perm_insert_payment_methods" on public.payment_methods
  for insert with check (
      (select public.tiene_permiso('metodos-pago-negocios', 'crear'))
      or (select public.tiene_permiso('metodos-pago-mensajeros', 'crear'))
      or (select public.tiene_permiso('metodos-pago-ordenes', 'crear')));
drop policy if exists "perm_update_payment_methods" on public.payment_methods;
create policy "perm_update_payment_methods" on public.payment_methods
  for update using (
      (select public.tiene_permiso('metodos-pago-negocios', 'editar'))
      or (select public.tiene_permiso('metodos-pago-mensajeros', 'editar'))
      or (select public.tiene_permiso('metodos-pago-ordenes', 'editar')))
  with check (
      (select public.tiene_permiso('metodos-pago-negocios', 'editar'))
      or (select public.tiene_permiso('metodos-pago-mensajeros', 'editar'))
      or (select public.tiene_permiso('metodos-pago-ordenes', 'editar')));
drop policy if exists "perm_delete_payment_methods" on public.payment_methods;
create policy "perm_delete_payment_methods" on public.payment_methods
  for delete using (
      (select public.tiene_permiso('metodos-pago-negocios', 'eliminar'))
      or (select public.tiene_permiso('metodos-pago-mensajeros', 'eliminar'))
      or (select public.tiene_permiso('metodos-pago-ordenes', 'eliminar')));
drop policy if exists "manage_payment_groups" on public.payment_groups;
drop policy if exists "perm_insert_payment_groups" on public.payment_groups;
create policy "perm_insert_payment_groups" on public.payment_groups
  for insert with check (
      (select public.tiene_permiso('grupos-pago', 'crear')));
drop policy if exists "perm_update_payment_groups" on public.payment_groups;
create policy "perm_update_payment_groups" on public.payment_groups
  for update using (
      (select public.tiene_permiso('grupos-pago', 'editar')))
  with check (
      (select public.tiene_permiso('grupos-pago', 'editar')));
drop policy if exists "perm_delete_payment_groups" on public.payment_groups;
create policy "perm_delete_payment_groups" on public.payment_groups
  for delete using (
      (select public.tiene_permiso('grupos-pago', 'eliminar')));
drop policy if exists "manage_exchange_rates" on public.exchange_rates;
drop policy if exists "perm_insert_exchange_rates" on public.exchange_rates;
create policy "perm_insert_exchange_rates" on public.exchange_rates
  for insert with check (
      (select public.tiene_permiso('razon-cambio', 'crear'))
      or (select public.tiene_permiso('razon-cambio', 'sincronizar')));
drop policy if exists "perm_update_exchange_rates" on public.exchange_rates;
create policy "perm_update_exchange_rates" on public.exchange_rates
  for update using (
      (select public.tiene_permiso('razon-cambio', 'editar'))
      or (select public.tiene_permiso('razon-cambio', 'sincronizar')))
  with check (
      (select public.tiene_permiso('razon-cambio', 'editar'))
      or (select public.tiene_permiso('razon-cambio', 'sincronizar')));
drop policy if exists "perm_delete_exchange_rates" on public.exchange_rates;
create policy "perm_delete_exchange_rates" on public.exchange_rates
  for delete using (
      (select public.tiene_permiso('razon-cambio', 'eliminar')));
drop policy if exists "manage_import_sources" on public.import_sources;
drop policy if exists "perm_insert_import_sources" on public.import_sources;
create policy "perm_insert_import_sources" on public.import_sources
  for insert with check (
      (select public.tiene_permiso('documentos-importacion', 'crear')));
drop policy if exists "perm_update_import_sources" on public.import_sources;
create policy "perm_update_import_sources" on public.import_sources
  for update using (
      (select public.tiene_permiso('documentos-importacion', 'editar')))
  with check (
      (select public.tiene_permiso('documentos-importacion', 'editar')));
drop policy if exists "perm_delete_import_sources" on public.import_sources;
create policy "perm_delete_import_sources" on public.import_sources
  for delete using (
      (select public.tiene_permiso('documentos-importacion', 'eliminar')));
drop policy if exists "manage_commission_settings" on public.commission_settings;
drop policy if exists "perm_insert_commission_settings" on public.commission_settings;
create policy "perm_insert_commission_settings" on public.commission_settings
  for insert with check (
      (select public.tiene_permiso('comision-mandao', 'crear')));
drop policy if exists "perm_update_commission_settings" on public.commission_settings;
create policy "perm_update_commission_settings" on public.commission_settings
  for update using (
      (select public.tiene_permiso('comision-mandao', 'editar')))
  with check (
      (select public.tiene_permiso('comision-mandao', 'editar')));
drop policy if exists "perm_delete_commission_settings" on public.commission_settings;
create policy "perm_delete_commission_settings" on public.commission_settings
  for delete using (
      (select public.tiene_permiso('comision-mandao', 'eliminar')));
drop policy if exists "manage_backpack_rental_rates" on public.backpack_rental_rates;
drop policy if exists "perm_insert_backpack_rental_rates" on public.backpack_rental_rates;
create policy "perm_insert_backpack_rental_rates" on public.backpack_rental_rates
  for insert with check (
      (select public.tiene_permiso('comision-mandao', 'editar')));
drop policy if exists "perm_update_backpack_rental_rates" on public.backpack_rental_rates;
create policy "perm_update_backpack_rental_rates" on public.backpack_rental_rates
  for update using (
      (select public.tiene_permiso('comision-mandao', 'editar')))
  with check (
      (select public.tiene_permiso('comision-mandao', 'editar')));
drop policy if exists "manage_availability_discount_settings" on public.availability_discount_settings;
drop policy if exists "perm_insert_availability_discount_settings" on public.availability_discount_settings;
create policy "perm_insert_availability_discount_settings" on public.availability_discount_settings
  for insert with check (
      (select public.tiene_permiso('comision-mandao', 'editar')));
drop policy if exists "perm_update_availability_discount_settings" on public.availability_discount_settings;
create policy "perm_update_availability_discount_settings" on public.availability_discount_settings
  for update using (
      (select public.tiene_permiso('comision-mandao', 'editar')))
  with check (
      (select public.tiene_permiso('comision-mandao', 'editar')));
-- app_settings: plantilla de correo y carpetas de Drive (Data).
drop policy if exists "manage_app_settings" on public.app_settings;
drop policy if exists "perm_insert_app_settings" on public.app_settings;
create policy "perm_insert_app_settings" on public.app_settings
  for insert with check (
      (select public.tiene_permiso('correo-conciliacion', 'editar'))
      or (select public.tiene_permiso('documentos-importacion', 'editar')));
drop policy if exists "perm_update_app_settings" on public.app_settings;
create policy "perm_update_app_settings" on public.app_settings
  for update using (
      (select public.tiene_permiso('correo-conciliacion', 'editar'))
      or (select public.tiene_permiso('documentos-importacion', 'editar')))
  with check (
      (select public.tiene_permiso('correo-conciliacion', 'editar'))
      or (select public.tiene_permiso('documentos-importacion', 'editar')));
drop policy if exists "manage_dispatcher_rules" on public.dispatcher_rules;
drop policy if exists "perm_insert_dispatcher_rules" on public.dispatcher_rules;
create policy "perm_insert_dispatcher_rules" on public.dispatcher_rules
  for insert with check (
      (select public.tiene_permiso('reglas-negocios', 'crear'))
      or (select public.tiene_permiso('reglas-mensajeros', 'crear')));
drop policy if exists "perm_update_dispatcher_rules" on public.dispatcher_rules;
create policy "perm_update_dispatcher_rules" on public.dispatcher_rules
  for update using (
      (select public.tiene_permiso('reglas-negocios', 'editar'))
      or (select public.tiene_permiso('reglas-mensajeros', 'editar')))
  with check (
      (select public.tiene_permiso('reglas-negocios', 'editar'))
      or (select public.tiene_permiso('reglas-mensajeros', 'editar')));
drop policy if exists "perm_delete_dispatcher_rules" on public.dispatcher_rules;
create policy "perm_delete_dispatcher_rules" on public.dispatcher_rules
  for delete using (
      (select public.tiene_permiso('reglas-negocios', 'eliminar'))
      or (select public.tiene_permiso('reglas-mensajeros', 'eliminar')));
drop policy if exists "insert_consecutivo_series" on public.consecutivo_series;
drop policy if exists "delete_consecutivo_series" on public.consecutivo_series;
drop policy if exists "manage_consecutivo_series" on public.consecutivo_series;
drop policy if exists "perm_insert_consecutivo_series" on public.consecutivo_series;
create policy "perm_insert_consecutivo_series" on public.consecutivo_series
  for insert with check (
      (select public.tiene_permiso('formato-consecutivo', 'crear')));
drop policy if exists "perm_update_consecutivo_series" on public.consecutivo_series;
create policy "perm_update_consecutivo_series" on public.consecutivo_series
  for update using (
      (select public.tiene_permiso('formato-consecutivo', 'editar')))
  with check (
      (select public.tiene_permiso('formato-consecutivo', 'editar')));
drop policy if exists "perm_delete_consecutivo_series" on public.consecutivo_series;
create policy "perm_delete_consecutivo_series" on public.consecutivo_series
  for delete using (
      (select public.tiene_permiso('formato-consecutivo', 'eliminar')));

-- Conciliaciones: conciliar (crear), reconciliar, cambiar estado, enviar
-- (marca Enviado y guarda el PDF de Drive).
drop policy if exists "manage_conciliaciones_businesses" on public.conciliaciones_businesses;
drop policy if exists "perm_insert_conciliaciones_businesses" on public.conciliaciones_businesses;
create policy "perm_insert_conciliaciones_businesses" on public.conciliaciones_businesses
  for insert with check (
      (select public.tiene_permiso('conciliacion-negocio', 'conciliar')));
drop policy if exists "perm_update_conciliaciones_businesses" on public.conciliaciones_businesses;
create policy "perm_update_conciliaciones_businesses" on public.conciliaciones_businesses
  for update using (
      (select public.tiene_permiso('conciliacion-negocio', 'conciliar'))
      or (select public.tiene_permiso('conciliacion-negocio', 'reconciliar'))
      or (select public.tiene_permiso('conciliacion-negocio', 'cambiar_estado'))
      or (select public.tiene_permiso('conciliacion-negocio', 'enviar_correo')))
  with check (
      (select public.tiene_permiso('conciliacion-negocio', 'conciliar'))
      or (select public.tiene_permiso('conciliacion-negocio', 'reconciliar'))
      or (select public.tiene_permiso('conciliacion-negocio', 'cambiar_estado'))
      or (select public.tiene_permiso('conciliacion-negocio', 'enviar_correo')));
drop policy if exists "perm_delete_conciliaciones_businesses" on public.conciliaciones_businesses;
create policy "perm_delete_conciliaciones_businesses" on public.conciliaciones_businesses
  for delete using (
      (select public.tiene_permiso('conciliacion-negocio', 'conciliar')));
drop policy if exists "manage_conciliaciones_messengers" on public.conciliaciones_messengers;
drop policy if exists "perm_insert_conciliaciones_messengers" on public.conciliaciones_messengers;
create policy "perm_insert_conciliaciones_messengers" on public.conciliaciones_messengers
  for insert with check (
      (select public.tiene_permiso('conciliacion-mensajero', 'conciliar')));
drop policy if exists "perm_update_conciliaciones_messengers" on public.conciliaciones_messengers;
create policy "perm_update_conciliaciones_messengers" on public.conciliaciones_messengers
  for update using (
      (select public.tiene_permiso('conciliacion-mensajero', 'conciliar'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'reconciliar'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'cambiar_estado'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'enviar_correo')))
  with check (
      (select public.tiene_permiso('conciliacion-mensajero', 'conciliar'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'reconciliar'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'cambiar_estado'))
      or (select public.tiene_permiso('conciliacion-mensajero', 'enviar_correo')));
drop policy if exists "perm_delete_conciliaciones_messengers" on public.conciliaciones_messengers;
create policy "perm_delete_conciliaciones_messengers" on public.conciliaciones_messengers
  for delete using (
      (select public.tiene_permiso('conciliacion-mensajero', 'conciliar')));

-- Planificación de Pagos: se genera desde Cobros y Pagos; se edita o elimina
-- desde su propio menú.
drop policy if exists "manage_planificaciones_pago" on public.planificaciones_pago;
drop policy if exists "perm_insert_planificaciones_pago" on public.planificaciones_pago;
create policy "perm_insert_planificaciones_pago" on public.planificaciones_pago
  for insert with check (
      (select public.tiene_permiso('cobros-pagos-negocio', 'generar_planificacion'))
      or (select public.tiene_permiso('cobros-pagos-mensajero', 'generar_planificacion')));
drop policy if exists "perm_update_planificaciones_pago" on public.planificaciones_pago;
create policy "perm_update_planificaciones_pago" on public.planificaciones_pago
  for update using (
      (select public.tiene_permiso('planificacion-pagos', 'editar')))
  with check (
      (select public.tiene_permiso('planificacion-pagos', 'editar')));
drop policy if exists "perm_delete_planificaciones_pago" on public.planificaciones_pago;
create policy "perm_delete_planificaciones_pago" on public.planificaciones_pago
  for delete using (
      (select public.tiene_permiso('planificacion-pagos', 'eliminar'))
      or (select public.tiene_permiso('cobros-pagos-negocio', 'generar_planificacion'))
      or (select public.tiene_permiso('cobros-pagos-mensajero', 'generar_planificacion')));
drop policy if exists "manage_planificacion_items" on public.planificacion_items;
drop policy if exists "perm_insert_planificacion_items" on public.planificacion_items;
create policy "perm_insert_planificacion_items" on public.planificacion_items
  for insert with check (
      (select public.tiene_permiso('cobros-pagos-negocio', 'generar_planificacion'))
      or (select public.tiene_permiso('cobros-pagos-mensajero', 'generar_planificacion')));
drop policy if exists "perm_update_planificacion_items" on public.planificacion_items;
create policy "perm_update_planificacion_items" on public.planificacion_items
  for update using (
      (select public.tiene_permiso('planificacion-pagos', 'editar')))
  with check (
      (select public.tiene_permiso('planificacion-pagos', 'editar')));
drop policy if exists "perm_delete_planificacion_items" on public.planificacion_items;
create policy "perm_delete_planificacion_items" on public.planificacion_items
  for delete using (
      (select public.tiene_permiso('planificacion-pagos', 'editar'))
      or (select public.tiene_permiso('planificacion-pagos', 'eliminar'))
      or (select public.tiene_permiso('cobros-pagos-negocio', 'generar_planificacion'))
      or (select public.tiene_permiso('cobros-pagos-mensajero', 'generar_planificacion')));

-- Log de auditoría: lectura para quien tenga el menú Log.
drop policy if exists "read_audit_logs_admin_supervisor" on public.audit_logs;
create policy "read_audit_logs_admin_supervisor" on public.audit_logs
  for select using (public.is_admin_or_supervisor() or (select public.tiene_permiso('config-logs', 'ver')));
