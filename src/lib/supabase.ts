import { createClient, type Session } from '@supabase/supabase-js';

// Variables de entorno — definir en .env.local:
//   VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<tu-anon-key>
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;

// En Netlify se definen como variables de entorno del sitio (se inyectan al
// compilar, ver vite.config.ts). Sin ellas, main.tsx muestra un aviso en
// vez de una página en blanco.
export const SUPABASE_CONFIGURADO = !!(supabaseUrl && supabaseAnonKey);

if (!SUPABASE_CONFIGURADO) {
  console.error(
    '[Supabase] Faltan SUPABASE_URL / SUPABASE_ANON_KEY (.env.local en local, variables de entorno en Netlify). ' +
    'El cliente no podrá conectar hasta que se configuren.'
  );
}

// ── Diagnóstico de acceso (2026-11-21) ──
// En el móvil el login con Google volvía a la pantalla de inicio sin sesión
// y sin ningún mensaje. Se guarda un registro corto (localStorage) de lo que
// pasa al volver de Google, que LoginPage muestra en "Diagnóstico de acceso".
const DIAG_KEY = 'mandao_auth_diag';
export function registrarDiagAuth(evento: string) {
  try {
    const lista: string[] = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
    lista.push(`${new Date().toLocaleString('es-VE')} · ${evento}`);
    localStorage.setItem(DIAG_KEY, JSON.stringify(lista.slice(-30)));
  } catch {
    /* almacenamiento bloqueado: se informa en LoginPage */
  }
}
export function leerDiagAuth(): string[] {
  try { return JSON.parse(localStorage.getItem(DIAG_KEY) || '[]'); } catch { return ['No se puede leer el almacenamiento del navegador (localStorage bloqueado).']; }
}
export function limpiarDiagAuth() {
  try { localStorage.removeItem(DIAG_KEY); } catch { /* nada */ }
}
export const almacenamientoDisponible = (() => {
  try { localStorage.setItem('mandao_prueba', '1'); localStorage.removeItem('mandao_prueba'); return true; } catch { return false; }
})();

// Error devuelto por Supabase/Google al volver del login (va en el hash o en
// la query de la URL) y desfase del reloj del dispositivo. Se leen ANTES de
// crear el cliente, que limpia la URL al procesarla.
export const retornoLogin: { error: string | null; desfaseSeg: number | null } = { error: null, desfaseSeg: null };
if (typeof window !== 'undefined') {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(window.location.search);
  const error = h.get('error_description') || q.get('error_description') || h.get('error') || q.get('error');
  if (error) {
    retornoLogin.error = error.replace(/\+/g, ' ');
    registrarDiagAuth(`Google/Supabase devolvió un error: ${retornoLogin.error}`);
  }
  if (h.get('access_token')) {
    const expAt = Number(h.get('expires_at'));
    const expIn = Number(h.get('expires_in'));
    if (expAt && expIn) retornoLogin.desfaseSeg = Math.round(Date.now() / 1000 - (expAt - expIn));
    registrarDiagAuth(`Volvió de Google con sesión (desfase del reloj del dispositivo ≈ ${retornoLogin.desfaseSeg ?? '?'} s)`);
  } else if (q.get('code')) {
    registrarDiagAuth('Volvió de Google con código de autorización');
  }
  if (!almacenamientoDisponible) registrarDiagAuth('localStorage no disponible: la sesión no se puede guardar');
}

// Prueba si el dispositivo llega al servidor de Supabase (para el
// diagnóstico de conexión lenta). Devuelve los ms que tardó o el error.
export async function probarConexionSupabase(): Promise<{ ok: boolean; ms: number; detalle: string }> {
  const inicio = performance.now();
  const ctrl = new AbortController();
  const corte = window.setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: supabaseAnonKey }, signal: ctrl.signal, cache: 'no-store' });
    const ms = Math.round(performance.now() - inicio);
    return { ok: r.ok, ms, detalle: r.ok ? `responde en ${ms} ms` : `respondió con error ${r.status}` };
  } catch (err: any) {
    const ms = Math.round(performance.now() - inicio);
    return { ok: false, ms, detalle: err?.name === 'AbortError' ? 'no respondió en 15 s' : `sin conexión (${err?.message || err})` };
  } finally {
    window.clearTimeout(corte);
  }
}

export const supabase = createClient(
  SUPABASE_CONFIGURADO ? supabaseUrl : 'https://sin-configurar.supabase.co',
  SUPABASE_CONFIGURADO ? supabaseAnonKey : 'sin-configurar'
);

// Scopes de Google que el sistema necesita sobre la cuenta del usuario
// autenticado (RN: lectura directa de Google Sheets + envío de correo
// desde la cuenta del propio usuario, NO desde un service account).
// Se mantienen los mismos que tenía Firebase Auth, más `drive` (2026-10-07)
// para guardar los PDF de Conciliación en la carpeta configurada en
// Configuración -> Data (`drive.file` no basta: solo permite carpetas
// creadas por la propia app). Requiere que la Google Drive API esté
// habilitada y el scope agregado en la pantalla de consentimiento OAuth.
export const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive';

// Dominio de Google Workspace autorizado a usar el sistema. La barrera
// real debe estar en la pantalla de consentimiento OAuth de Google Cloud
// (tipo "Interno"); esto es una segunda capa de defensa en el propio
// cliente/servidor para que una cuenta fuera del dominio nunca quede
// con una sesión válida, aunque el consentimiento OAuth no la bloquee.
export const ALLOWED_EMAIL_DOMAIN = 'mandao.app';

export type AuditLogModule =
  | 'Verificacion'
  | 'Revision'
  | 'Disponibilidad'
  | 'Conciliaciones'
  | 'Facturaciones'
  | 'Programacion_Pagos'
  | 'Gestion_Negocios'
  | 'Gestion_Mensajeros'
  | 'Configuraciones'
  | (string & {});

// Mismo contrato que el logAuditEvent original de firebase.ts, para que
// ningún archivo que ya lo use tenga que cambiar su forma de llamarlo.
export const logAuditEvent = async (
  module: AuditLogModule,
  action: string,
  details: any = {}
) => {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userEmail = userData?.user?.email || 'raul@mandao.app';
    const { error } = await supabase.from('audit_logs').insert({
      module,
      action,
      user_id: userData?.user?.id ?? null,
      details: { ...(details || {}), user_email: userEmail },
    });
    if (error) throw error;
    console.log(`[AuditLog] Logged successfully: [${module}] ${action}`);
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

// Sustituye a signInWithPopup(auth, googleProvider) de Firebase.
// Supabase usa redirect en vez de popup: al volver, session.provider_token
// trae el access_token de Google (equivalente a credential.accessToken).
export const signInWithGoogle = async () => {
  registrarDiagAuth(`Inicio de login con Google (volverá a ${window.location.origin})`);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: GOOGLE_SCOPES,
      queryParams: { access_type: 'offline', prompt: 'consent', hd: ALLOWED_EMAIL_DOMAIN },
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
};

// Reemplaza el patrón "reconectar Google" que VerificationPage.tsx y
// RevisionPage.tsx implementan hoy manualmente con signInWithPopup +
// GoogleAuthProvider. Con Supabase, reconectar es lo mismo que volver
// a iniciar el flujo OAuth pidiendo consentimiento explícito de nuevo.
export const reconnectGoogle = signInWithGoogle;

// Lee el access_token de Google de la sesión actual de Supabase y lo
// deja en sessionStorage bajo la MISMA key que usaba Firebase, para que
// el resto del código (que hoy hace sessionStorage.getItem('google_access_token'))
// siga funcionando sin cambios mientras se migran esos archivos.
//
// Supabase solo entrega provider_token justo después del login con Google:
// cuando renueva su propia sesión (cada ~1 h) la sesión nueva ya no lo trae.
// Antes eso borraba el token guardado y Enviar / Drive fallaban con "No hay
// sesión de Google activa" (2026-11-05). Ahora se conserva el último token
// con su vencimiento (los de Google duran 1 h); se borra solo al cerrar sesión.
export const GOOGLE_TOKEN_EXP_KEY = 'google_access_token_exp';
// Recibe la sesión cuando se llama al aplicar un cambio de sesión: así no se
// vuelve a pedir supabase.auth.getSession() mientras supabase-js procesa el
// login (bloqueo documentado que dejaba la app en el loading en el móvil).
export const syncGoogleTokenToSessionStorage = async (sesion?: Session | null) => {
  const data = { session: sesion !== undefined ? sesion : (await supabase.auth.getSession()).data.session };
  const token = data.session?.provider_token;
  if (token && token !== sessionStorage.getItem('google_access_token')) {
    sessionStorage.setItem('google_access_token', token);
    sessionStorage.setItem(GOOGLE_TOKEN_EXP_KEY, String(Date.now() + 55 * 60 * 1000));
    // Recién iniciada la sesión con Google: se guarda el refresh token en el
    // servidor (Edge Function google-token) para renovar el permiso solo.
    const refresh = data.session?.provider_refresh_token;
    if (refresh) {
      supabase.functions.invoke('google-token', { body: { accion: 'guardar', refresh_token: refresh } })
        .catch(() => { /* sin la función desplegada se sigue pidiendo reconectar */ });
    }
  }
  return token ?? sessionStorage.getItem('google_access_token');
};

// Renueva el permiso de Google sin volver a pasar por el login (2026-11-16).
// Devuelve el token nuevo, o null si no se pudo (función sin desplegar o
// permiso revocado): en ese caso la app pide "Reconectar Google" como antes.
let renovacionEnCurso: Promise<string | null> | null = null;
export const renovarGoogleToken = (): Promise<string | null> => {
  if (renovacionEnCurso) return renovacionEnCurso;
  renovacionEnCurso = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-token', { body: { accion: 'renovar' } });
      if (error || !data?.access_token) return null;
      const vence = Date.now() + (Number(data.expires_in) || 3600) * 1000 - 5 * 60 * 1000;
      sessionStorage.setItem('google_access_token', data.access_token);
      sessionStorage.setItem(GOOGLE_TOKEN_EXP_KEY, String(vence));
      return data.access_token as string;
    } catch {
      return null;
    } finally {
      renovacionEnCurso = null;
    }
  })();
  return renovacionEnCurso;
};

// ¿Falta el permiso de Google o vence en menos de 10 minutos?
export const googleTokenPorVencer = () => {
  const token = sessionStorage.getItem('google_access_token');
  const exp = Number(sessionStorage.getItem(GOOGLE_TOKEN_EXP_KEY) || 0);
  return !token || (exp > 0 && exp - Date.now() < 10 * 60 * 1000);
};

export const logout = async () => {
  sessionStorage.removeItem('google_access_token');
  sessionStorage.removeItem(GOOGLE_TOKEN_EXP_KEY);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
