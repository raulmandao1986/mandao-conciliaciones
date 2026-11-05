-- =====================================================================
-- Envío por correo de las conciliaciones (Fase 3 "Nuevos cambios")
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-10-27c_formato_consecutivo.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- "Enviar" manda por Gmail (cuenta de Google del usuario conectado) los PDF
-- de cada negocio/mensajero y pasa la conciliación a "Enviado". Se guarda
-- cuándo y a quién se envió. La plantilla del correo (asunto, cuerpo y CC)
-- se edita en Configuración -> Correo de Conciliación (app_settings).

-- Correo del mensajero (los negocios ya tienen businesses.email). Admite
-- varios separados por coma o punto y coma.
alter table public.messengers add column email text;

alter table public.conciliaciones_businesses
  add column enviado_at timestamptz,
  add column enviado_a text;
alter table public.conciliaciones_messengers
  add column enviado_at timestamptz,
  add column enviado_a text;

insert into public.app_settings (setting_key, value) values
  ('conciliacion_correo_asunto', 'Conciliación {periodo} · {nombre}'),
  ('conciliacion_correo_cuerpo', E'Hola {nombre}:\n\nAdjuntamos la conciliación del período {periodo}:\n\n{detalle}\n\nPor favor revise los documentos y confírmenos su conformidad respondiendo a este correo.\n\nSaludos,\nEquipo de Conciliaciones'),
  ('conciliacion_correo_cc', '')
on conflict (setting_key) do nothing;

-- Menú Configuración -> Correo de Conciliación.
update public.access_roles
set module_keys = array(select distinct unnest(module_keys || array['correo-conciliacion'])),
    updated_at = now()
where 'comision-mandao' = any(module_keys);
