// Edge Function: sync-exchange-rate
//
// Sincroniza la tasa informal USD/CUP publicada por la API oficial de
// El Toque (https://tasas.eltoque.com/docs/) contra la tabla
// public.exchange_rates, en la fila de referencia "Tasa Informal (El Toque)".
//
// Se invoca de dos formas:
//   1. pg_cron (diario) -> header 'x-cron-secret' == secreto CRON_SECRET.
//   2. Botón manual en RazonCambioPage.tsx -> JWT de sesión de un usuario
//      con rol super_admin o supervisor (supabase.functions.invoke ya
//      adjunta el Authorization: Bearer <access_token> automáticamente).
//
// Secretos requeridos (nunca en el repo — configurar con
// `npx supabase secrets set NOMBRE=valor`):
//   ELTOQUE_API_TOKEN   token Bearer solicitado en tasas-token.eltoque.com
//   CRON_SECRET         string aleatoria compartida solo con el job de pg_cron
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RATE_NAME = 'Tasa Informal (El Toque)';
const ELTOQUE_URL = 'https://tasas.eltoque.com/v1/trmi';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // --- Autorización: cron compartido o usuario con rol de gestión ---
  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = !!cronSecret && cronSecret === Deno.env.get('CRON_SECRET');

  let isAuthorizedUser = false;
  if (!isCron) {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (jwt) {
      const asUser = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await asUser.auth.getUser(jwt);
      if (userData?.user) {
        const { data: profile } = await admin
          .from('profiles')
          .select('role')
          .eq('id', userData.user.id)
          .maybeSingle();
        isAuthorizedUser = profile?.role === 'super_admin' || profile?.role === 'supervisor';
      }
    }
  }

  if (!isCron && !isAuthorizedUser) {
    return jsonResponse({ error: 'No autorizado' }, 401);
  }

  // --- Consultar la API de El Toque ---
  const eltoqueToken = Deno.env.get('ELTOQUE_API_TOKEN');
  if (!eltoqueToken) {
    return jsonResponse({ error: 'ELTOQUE_API_TOKEN no está configurado como secreto de la función' }, 500);
  }

  const eltoqueRes = await fetch(ELTOQUE_URL, {
    headers: { Authorization: `Bearer ${eltoqueToken}` },
  });

  if (!eltoqueRes.ok) {
    const body = await eltoqueRes.text();
    return jsonResponse({ error: 'La API de El Toque respondió con error', status: eltoqueRes.status, body }, 502);
  }

  const payload = await eltoqueRes.json();
  // La documentación oficial (OAS 3.0) no publica un schema fijo para el
  // 200 — se soportan las formas observadas en integraciones reales:
  // { tasas: { USD: n, ... } } o { usd: n } / { USD: n } directo en la raíz.
  const usdRate = Number(payload?.tasas?.USD ?? payload?.usd ?? payload?.USD);

  if (!Number.isFinite(usdRate) || usdRate <= 0) {
    return jsonResponse({ error: 'La respuesta de El Toque no trae una tasa USD válida', raw: payload }, 502);
  }

  // --- Upsert de la fila de referencia (no toca cuál tasa está "activa") ---
  const now = new Date().toISOString();
  const { data: existing } = await admin
    .from('exchange_rates')
    .select('exchange_rate_id')
    .eq('name', RATE_NAME)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from('exchange_rates')
      .update({
        rate_cup: usdRate,
        updated_at: now,
        description: `Sincronizado automáticamente desde la API de El Toque (tasas.eltoque.com) — ${now}.`,
      })
      .eq('exchange_rate_id', existing.exchange_rate_id);
    if (error) return jsonResponse({ error: error.message }, 500);
  } else {
    const { error } = await admin.from('exchange_rates').insert({
      name: RATE_NAME,
      rate_cup: usdRate,
      description: 'Sincronizado automáticamente desde la API de El Toque (tasas.eltoque.com).',
      active: false,
    });
    if (error) return jsonResponse({ error: error.message }, 500);
  }

  await admin.from('audit_logs').insert({
    module: 'Configuraciones',
    action: 'Tasa El Toque Sincronizada',
    details: { rate_cup: usdRate, trigger: isCron ? 'cron' : 'manual' },
  });

  return jsonResponse({ ok: true, rate_cup: usdRate });
});
