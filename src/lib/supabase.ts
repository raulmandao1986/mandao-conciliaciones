import { createClient } from '@supabase/supabase-js';

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
export const syncGoogleTokenToSessionStorage = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.provider_token;
  if (token && token !== sessionStorage.getItem('google_access_token')) {
    sessionStorage.setItem('google_access_token', token);
    sessionStorage.setItem(GOOGLE_TOKEN_EXP_KEY, String(Date.now() + 55 * 60 * 1000));
  }
  return token ?? sessionStorage.getItem('google_access_token');
};

export const logout = async () => {
  sessionStorage.removeItem('google_access_token');
  sessionStorage.removeItem(GOOGLE_TOKEN_EXP_KEY);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
