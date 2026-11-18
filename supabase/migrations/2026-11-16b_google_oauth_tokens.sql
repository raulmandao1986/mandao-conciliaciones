-- =====================================================================
-- Renovación automática del permiso de Google (Edge Function google-token)
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- Guarda el refresh token de Google de cada usuario para que la Edge
-- Function `google-token` renueve el permiso (Sheets, Gmail, Drive) sin pedir
-- "Reconectar Google" cada hora (2026-11-16). Tabla privada: RLS activo y
-- SIN políticas, así que desde la app (anon / authenticated) no se puede leer
-- ni escribir; solo la Edge Function con la service role.

create table if not exists public.google_oauth_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;
revoke all on public.google_oauth_tokens from anon, authenticated;
