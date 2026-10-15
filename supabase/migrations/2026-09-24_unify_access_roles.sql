-- =====================================================================
-- Unificar Roles de Acceso con los 4 roles fijos (Configuración → Roles
-- y Usuarios → pestaña "Roles"). Requiere haber corrido antes
-- 2026-09-23_access_roles.sql. Correr una sola vez en el SQL Editor del
-- proyecto Supabase real. Ya está incorporado a supabase_schema.sql
-- (fuente de verdad).
--
-- profiles.role (enum de 4 valores fijos) sigue intacta como única
-- fuente de verdad para RLS. Lo nuevo: access_roles pasa a listar
-- también los 4 roles de sistema (Super Admin/Supervisor/Operador/
-- Visitante), con sus module_keys 100% editables desde la UI, más
-- cualquier rol nuevo que se cree. Ver el comentario largo en
-- supabase_schema.sql para el razonamiento completo.

alter table public.access_roles
  add column base_role public.user_role not null default 'visitante',
  add column is_system boolean not null default false;

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
-- (hasPermission), para que nadie pierda ni gane acceso con esta
-- migración. A partir de aquí es 100% editable desde la UI.
insert into public.access_roles (name, description, base_role, is_system, module_keys) values
  ('Super Admin', 'Acceso total a todos los módulos del sistema.', 'super_admin', true, array[
    'dashboard','dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision',
    'dashboard-negocio','conciliacion-negocio','facturacion-negocio','cuentas-pagar-negocio','cuentas-cobrar-negocio','planificacion-pagos-negocio','gestion-negocios',
    'dashboard-mensajero','conciliacion-mensajero','facturacion-mensajero','cuentas-pagar-mensajero','cuentas-cobrar-mensajero','planificacion-pagos-mensajero','gestion-mensajeros',
    'roles-usuarios','areas','metodos-pago-negocios','metodos-pago-mensajeros','metodos-pago-ordenes','razon-cambio','documentos-importacion','config-logs'
  ]),
  ('Supervisor', 'Acceso total a todos los módulos del sistema.', 'supervisor', true, array[
    'dashboard','dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision',
    'dashboard-negocio','conciliacion-negocio','facturacion-negocio','cuentas-pagar-negocio','cuentas-cobrar-negocio','planificacion-pagos-negocio','gestion-negocios',
    'dashboard-mensajero','conciliacion-mensajero','facturacion-mensajero','cuentas-pagar-mensajero','cuentas-cobrar-mensajero','planificacion-pagos-mensajero','gestion-mensajeros',
    'roles-usuarios','areas','metodos-pago-negocios','metodos-pago-mensajeros','metodos-pago-ordenes','razon-cambio','documentos-importacion','config-logs'
  ]),
  ('Operador', 'Puede ejecutar Verificación en Dispatcher y Disponibilidad. Sin acceso a Gestión ni Configuración.', 'operador', true, array[
    'dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision'
  ]),
  ('Visitante', 'Solo lectura en Dispatcher y Disponibilidad.', 'visitante', true, array[
    'dispatcher-verificacion','dispatcher-revision','disponibilidad-verificacion','disponibilidad-revision'
  ])
on conflict (name) do nothing;

-- Todo perfil existente se migra al rol de sistema que corresponde a su
-- profiles.role actual (así nadie pierde acceso el día de la migración).
update public.profiles p
set access_role_id = ar.access_role_id
from public.access_roles ar
where p.access_role_id is null and ar.is_system and ar.base_role = p.role;

-- A partir de ahora, todo usuario nuevo nace con el Rol de Acceso de
-- sistema "Visitante" asignado (antes solo el enum 'visitante').
create or replace function public.handle_new_user()
returns trigger as $$
begin
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
