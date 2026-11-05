-- =====================================================================
-- PDF de Conciliación en Google Drive
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-01b_descuento_disponibilidad_mensajeros.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Pedido por el usuario 2026-10-07: el PDF de cada conciliación que se
-- registra (Negocios y Mensajeros) se genera y se guarda en una carpeta de
-- Google Drive, configurada en Configuración -> Data.
--
-- app_settings: ajustes generales clave/valor del sistema. La carpeta se
-- guarda en la clave 'conciliaciones_drive_folder_id' (ID de la carpeta).
-- La subida la hace el navegador con el token de Google del usuario que
-- concilia (scope drive), así que esa persona debe tener acceso de
-- edición a la carpeta.

create table public.app_settings (
  setting_key text primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.app_settings enable row level security;

create policy "read_all_authenticated" on public.app_settings
  for select using (public.is_active_user());

create policy "manage_app_settings" on public.app_settings
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on public.app_settings to anon, authenticated;

-- Enlace al PDF subido a Drive (null si la subida no se hizo o falló; el
-- histórico permite reintentarla).
alter table public.conciliaciones_businesses
  add column pdf_drive_file_id text,
  add column pdf_drive_url text;

alter table public.conciliaciones_messengers
  add column pdf_drive_file_id text,
  add column pdf_drive_url text;
