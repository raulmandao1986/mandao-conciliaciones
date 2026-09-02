-- =====================================================================
-- MANDAO CONCILIACIONES — Patch v4
-- Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase, después del
-- patch v3.
--
-- Hallazgo: al probar las consultas reales que usa la app contra el
-- proyecto (con la anon key, sin sesión), TODAS las tablas devuelven
-- "permission denied for schema public" (código Postgres 42501) — esto
-- NO es RLS filtrando filas (eso da resultado vacío, no error), es un
-- permiso de esquema/tabla faltante a nivel de Postgres, ANTERIOR a
-- que RLS entre a jugar. Sin este GRANT, ni siquiera un usuario
-- logueado con el rol correcto puede leer o escribir nada — la app
-- fallaría por completo en el navegador, no solo mi prueba sin sesión.
--
-- Este GRANT es exactamente el que Supabase configura automáticamente
-- por defecto en cada proyecto nuevo; volver a aplicarlo es seguro e
-- idempotente (no rompe nada si ya estaba correcto).
-- =====================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- Para que las tablas que se creen en el futuro (nuevas fases:
-- Negocios, Mensajeros, Conciliación, etc.) hereden el mismo permiso
-- sin tener que repetir este patch cada vez.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
