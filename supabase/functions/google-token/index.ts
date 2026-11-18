// Edge Function: google-token
//
// Mantiene vigente el permiso de Google (Sheets, Gmail, Drive) del usuario sin
// obligarlo a "Reconectar Google" cada hora (2026-11-16). Google entrega en el
// login un refresh token de larga duración; canjearlo por un access token nuevo
// exige el secreto del cliente OAuth, que no puede ir en el navegador. Por eso
// se hace aquí:
//   { accion: 'guardar', refresh_token }  -> lo guarda (tabla privada google_oauth_tokens)
//   { accion: 'renovar' }                  -> devuelve { access_token, expires_in }
// Siempre para el usuario dueño del JWT de la petición (supabase.functions.invoke
// adjunta Authorization: Bearer <access_token> de la sesión).
//
// Secretos requeridos (nunca en el repo — `npx supabase secrets set NOMBRE=valor`
// o Dashboard → Edge Functions → Secrets). Son los mismos del proveedor Google
// configurado en Supabase → Authentication → Providers → Google:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Usuario autenticado de la petición.
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'Sin sesión' }, 401);
  const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userError } = await asUser.auth.getUser(jwt);
  if (userError || !userData?.user) return json({ error: 'Sesión inválida' }, 401);
  const userId = userData.user.id;

  let body: { accion?: string; refresh_token?: string } = {};
  try { body = await req.json(); } catch { /* cuerpo vacío */ }

  if (body.accion === 'guardar') {
    if (!body.refresh_token) return json({ error: 'Falta refresh_token' }, 400);
    const { error } = await admin.from('google_oauth_tokens').upsert({
      user_id: userId, refresh_token: body.refresh_token, updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  if (body.accion === 'renovar') {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    if (!clientId || !clientSecret) return json({ error: 'Faltan los secretos GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET' }, 500);

    const { data: fila, error } = await admin.from('google_oauth_tokens').select('refresh_token').eq('user_id', userId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!fila?.refresh_token) return json({ error: 'reconectar', detalle: 'No hay permiso de Google guardado para este usuario' }, 401);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: fila.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const google = await res.json().catch(() => ({}));
    if (!res.ok || !google.access_token) {
      // Permiso revocado o vencido en Google: hay que volver a iniciar sesión con Google.
      if (google.error === 'invalid_grant') await admin.from('google_oauth_tokens').delete().eq('user_id', userId);
      return json({ error: 'reconectar', detalle: google.error_description || google.error || `Google respondió ${res.status}` }, 401);
    }
    return json({ access_token: google.access_token, expires_in: google.expires_in ?? 3600 });
  }

  return json({ error: 'Acción desconocida' }, 400);
});
