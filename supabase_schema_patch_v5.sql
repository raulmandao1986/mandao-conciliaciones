-- =====================================================================
-- MANDAO CONCILIACIONES — Patch v5
-- Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase, después del
-- patch v4.
--
-- Hallazgo: current_user_role() consulta public.profiles, pero
-- profiles tiene una política RLS ("read_own_profile") que llama a
-- is_admin_or_supervisor() -> que llama a current_user_role() -> que
-- vuelve a consultar profiles -> ejecuta la política de nuevo...
-- RECURSIÓN INFINITA. Postgres la corta con "stack depth limit
-- exceeded" (54001). Como insert_dispatcher_rows, insert_availability_rows,
-- insert_verification, insert_incidents, insert_changes, manage_areas
-- y manage_messengers dependen de is_admin_or_supervisor()/
-- can_execute_processes() (que a su vez dependen de current_user_role()),
-- CUALQUIER escritura en la base falla siempre, para cualquier rol
-- incluido super_admin.
--
-- Corrección estándar: marcar current_user_role() como SECURITY
-- DEFINER. Al ejecutarse con los privilegios de su dueño (el rol que
-- corrió este script, normalmente exento de RLS), la consulta interna
-- a profiles ya no vuelve a evaluar la política que depende de esta
-- misma función — se rompe el ciclo.
-- =====================================================================

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;
