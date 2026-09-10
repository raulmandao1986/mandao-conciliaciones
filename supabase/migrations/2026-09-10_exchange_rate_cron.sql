-- =====================================================================
-- Sincronización diaria de la tasa de El Toque (RazonCambioPage)
-- =====================================================================
-- Programa un job de pg_cron que llama a la Edge Function
-- 'sync-exchange-rate' todos los días, vía pg_net (HTTP saliente desde
-- Postgres). La función en sí vive en supabase/functions/sync-exchange-rate.
--
-- PASOS MANUALES REQUERIDOS (no se pueden commitear al repo):
--
-- 1. Habilitar las extensiones pg_cron y pg_net si no están activas:
--    Dashboard -> Database -> Extensions (o correr las líneas de abajo).
--
-- 2. Desplegar la función y configurar sus secretos:
--      npx supabase functions deploy sync-exchange-rate --no-verify-jwt
--      npx supabase secrets set ELTOQUE_API_TOKEN=<token de tasas-token.eltoque.com>
--      npx supabase secrets set CRON_SECRET=<una cadena aleatoria larga>
--
-- 3. Guardar ESE MISMO valor de CRON_SECRET en el Vault de la base de
--    datos (correr una sola vez en el SQL Editor del dashboard, NUNCA
--    en un archivo versionado):
--      select vault.create_secret('<el-mismo-valor-de-CRON_SECRET>', 'cron_shared_secret');
--
-- 4. Reemplazar <PROJECT_REF> abajo por el ref real del proyecto
--    (la parte de https://<PROJECT_REF>.supabase.co) antes de correr
--    este archivo en el SQL Editor.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sync-exchange-rate-daily',
  '0 12 * * *', -- 08:00 America/Havana (UTC-4) todos los días
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-exchange-rate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Para revisar las ejecuciones del job:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Para desprogramarlo:
--   select cron.unschedule('sync-exchange-rate-daily');
