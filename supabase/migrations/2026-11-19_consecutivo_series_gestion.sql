-- =====================================================================
-- Consecutivo: gestión de series (agregar / eliminar) + Planificaciones
-- =====================================================================
-- Correr en el SQL Editor del proyecto Supabase real, después de
-- 2026-11-02_consecutivo_por_entidad.sql. Se puede volver a correr sin problema.
--
-- 2026-11-19:
--   * Configuración -> Formato de Consecutivo permite AGREGAR y ELIMINAR
--     series (solo super_admin), además de editarlas.
--   * Nueva entidad 'planificaciones' (Planificación de Pagos), con una serie
--     por moneda y sentido fijo 'pagar':
--       Planificaciones Por Pagar CUP (PLN) · Por Pagar USD (PLNU)
--   * Si se elimina una serie, next_conciliacion_consecutivo usa el formato
--     por defecto (prefijo = clave, AA, sin separador, 4 dígitos, reinicio
--     anual) hasta que se vuelva a crear. Los códigos ya emitidos no cambian.

-- Ampliar las entidades permitidas.
alter table public.consecutivo_series drop constraint if exists consecutivo_series_entidad_check;
alter table public.consecutivo_series add constraint consecutivo_series_entidad_check
  check (entidad in ('negocios', 'mensajeros', 'planificaciones'));

-- Series de Planificación de Pagos.
insert into public.consecutivo_series (serie, entidad, sentido, moneda, prefijo) values
  ('PLN',  'planificaciones', 'pagar', 'CUP', 'PLN'),
  ('PLNU', 'planificaciones', 'pagar', 'USD', 'PLNU')
on conflict (serie) do nothing;

-- Altas y bajas: solo super_admin (la lectura y la edición ya existen).
drop policy if exists "insert_consecutivo_series" on public.consecutivo_series;
create policy "insert_consecutivo_series" on public.consecutivo_series
  for insert with check (public.current_user_role() = 'super_admin');
drop policy if exists "delete_consecutivo_series" on public.consecutivo_series;
create policy "delete_consecutivo_series" on public.consecutivo_series
  for delete using (public.current_user_role() = 'super_admin');
grant insert, delete on public.consecutivo_series to anon, authenticated;
