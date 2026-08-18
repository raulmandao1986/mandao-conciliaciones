import { createClient } from '@supabase/supabase-js';

// Variables de entorno — definir en .env.local:
//   VITE_SUPABASE_URL=https://<tu-proyecto>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<tu-anon-key>
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Supabase] Faltan SUPABASE_URL / SUPABASE_ANON_KEY en el .env.local. ' +
    'El cliente no podrá conectar hasta que se configuren.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Scopes de Google que el sistema necesita sobre la cuenta del usuario
// autenticado (RN: lectura directa de Google Sheets + envío de correo
// desde la cuenta del propio usuario, NO desde un service account).
// Se mantienen exactamente los mismos que tenía Firebase Auth.
export const GOOGLE_SCOPES =
  'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/gmail.send';

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
      queryParams: { access_type: 'offline', prompt: 'consent' },
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
export const syncGoogleTokenToSessionStorage = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.provider_token;
  if (token) {
    sessionStorage.setItem('google_access_token', token);
  } else {
    sessionStorage.removeItem('google_access_token');
  }
  return token ?? null;
};

export const logout = async () => {
  sessionStorage.removeItem('google_access_token');
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
