import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { supabase, syncGoogleTokenToSessionStorage, renovarGoogleToken, googleTokenPorVencer, ALLOWED_EMAIL_DOMAIN, registrarDiagAuth } from './supabase';
import type { Session } from '@supabase/supabase-js';
import { normalizarPermisos, type PermisosPorModulo } from './permisos';

// Modelo de roles fijo — decisión confirmada: solo estos 4 existen.
// Se elimina por completo el cálculo de rol por patrón de email
// ('admin@...', 'mensajero@...', dominio externo) que tenía la versión
// de Firebase. El rol vive únicamente en la tabla profiles (Supabase).
export type UserRole = 'super_admin' | 'supervisor' | 'operador' | 'visitante';

export interface User {
  email: string;
  name: string;
  role: UserRole;
  domain: string;
  uid: string;
  active: boolean;
  // Rol de Acceso (tabla access_roles): capa nueva y separada, solo de UI
  // (qué módulos ve en el menú), no de seguridad — ver moduleCatalog.ts y
  // AppShell.tsx hasPermission(). null = sin asignar, se usa el comportamiento
  // histórico basado en `role`.
  accessModules: string[] | null;
  // Permisos por menú y acción (access_roles.permisos, 2026-11-19c; la BD los
  // aplica con public.tiene_permiso). null = sin Rol de
  // Acceso o columna aún no migrada. Usar siempre vía usePermisos() de
  // src/lib/permisos.ts, no directamente.
  permisos: PermisosPorModulo | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // La sesión lleva más de 10 s sin responder (red lenta / sin acceso a Supabase).
  cargaLenta: boolean;
  dejarDeEsperar: () => void;
  authError: string | null;
  logout: () => Promise<void>;
  reloadPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Desde 2026-11-19c lo que cada rol puede ejecutar se configura por menú y
// acción (usePermisos en src/lib/permisos.ts). Solo ROLE_CAN_MANAGE_CATALOGS
// sigue en uso (Usuarios y Roles = Super Admin). Texto original:
// Los 4 roles fijos y lo que cada uno puede hacer están implementados
// como políticas RLS en Supabase (ver supabase_schema.sql) y como checks
// de UI usando este mapa — no como permisos configurables en base de
// datos (a diferencia del modelo anterior de lista libre de 'permisos').
export const ROLE_CAN_MANAGE_CATALOGS = (role: UserRole) =>
  role === 'super_admin';
export const ROLE_CAN_IMPORT = (role: UserRole) =>
  role === 'super_admin' || role === 'supervisor';
export const ROLE_CAN_VERIFY = (role: UserRole) =>
  role === 'super_admin' || role === 'supervisor' || role === 'operador';

interface Profile {
  role: UserRole;
  active: boolean;
  full_name: string;
  accessModules: string[] | null;
  permisos: PermisosPorModulo | null;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  let { data, error } = await supabase
    .from('profiles')
    .select('role, active, full_name, access_roles ( module_keys, permisos )')
    .eq('id', userId)
    .single();

  // Fallback: si la migración 2026-11-19_permisos_roles.sql aún no se aplicó,
  // la columna access_roles.permisos no existe — se carga sin ella.
  if (error && /permisos/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('profiles')
      .select('role, active, full_name, access_roles ( module_keys )')
      .eq('id', userId)
      .single());
  }

  if (error) {
    console.error('[Auth] No se pudo cargar el perfil desde Supabase:', error.message);
    return null;
  }
  const row = data as any;
  return {
    role: row.role,
    active: row.active,
    full_name: row.full_name,
    accessModules: row.access_roles?.module_keys ?? null,
    permisos: row.access_roles && row.access_roles.permisos !== undefined
      ? normalizarPermisos(row.access_roles.permisos)
      : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cargaLenta, setCargaLenta] = useState(false);
  // Desde la pantalla de "conexión lenta": deja de esperar y muestra el login.
  const dejarDeEsperar = () => { setIsLoading(false); setCargaLenta(false); };
  const [authError, setAuthError] = useState<string | null>(null);

  const loadProfile = async (userId: string) => {
    try {
      const p = await fetchProfile(userId);
      setProfile(p);
    } catch (err) {
      // Sin perfil se muestra "pendiente de autorización" en vez de quedarse cargando.
      console.error('No se pudo cargar el perfil:', err);
      registrarDiagAuth(`No se pudo cargar el perfil: ${(err as Error)?.message || err}`);
      setProfile(null);
    }
  };

  // Segunda capa de defensa: aunque la pantalla de consentimiento OAuth
  // de Google Cloud no esté restringida a la organización, ninguna sesión
  // de un dominio distinto a ALLOWED_EMAIL_DOMAIN debe quedar activa aquí.
  const isAllowedEmail = (email: string | undefined) =>
    !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);

  const rejectSession = async (email: string | undefined) => {
    setAuthError(
      `Acceso restringido a cuentas @${ALLOWED_EMAIL_DOMAIN}` +
        (email ? ` (se intentó entrar con ${email}).` : '.')
    );
    setProfile(null);
    setSession(null);
    sessionStorage.removeItem('google_access_token');
    sessionStorage.removeItem('google_access_token_exp');
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let activo = true;
    // Conexión lenta (2026-11-21): si a los 10 s la sesión no ha respondido
    // (al volver de Google supabase-js valida el token contra el servidor,
    // y con datos móviles lentos o sin acceso a Supabase eso se demora), NO
    // se manda al login — eso hacía que el usuario volviera a tocar
    // "Continuar con Google" y entrara en un ciclo. Se muestra "la conexión
    // está tardando" con Reintentar y el diagnóstico, y se sigue esperando.
    const limite = window.setTimeout(() => {
      if (activo) { registrarDiagAuth('La sesión no respondió en 10 s (conexión lenta con el servidor)'); setCargaLenta(true); }
    }, 10000);

    // Aplica una sesión (inicial o nueva) FUERA del callback de
    // onAuthStateChange: supabase-js documenta que esperar ahí otras llamadas
    // de Supabase (getSession, consultas) puede bloquearse indefinidamente.
    // Era la causa del loading infinito al entrar desde el móvil (2026-11-20).
    let ultima = 0;
    const aplicarSesion = async (newSession: Session | null) => {
      const turno = ++ultima;
      try {
        if (newSession?.user && !isAllowedEmail(newSession.user.email)) {
          await rejectSession(newSession.user.email);
          return;
        }
        setSession(newSession);
        if (newSession?.user) {
          setAuthError(null);
          await syncGoogleTokenToSessionStorage(newSession);
          await loadProfile(newSession.user.id);
        } else {
          setProfile(null);
          sessionStorage.removeItem('google_access_token');
          sessionStorage.removeItem('google_access_token_exp');
        }
      } catch (err) {
        console.error('Error aplicando la sesión:', err);
      } finally {
        if (activo && turno === ultima) { setIsLoading(false); setCargaLenta(false); window.clearTimeout(limite); }
      }
    };

    // Sesión inicial (evento INITIAL_SESSION), login, logout y refresh: el
    // callback es síncrono y difiere el trabajo con setTimeout.
    const { data: listener } = supabase.auth.onAuthStateChange((evento, newSession) => {
      if (evento !== 'TOKEN_REFRESHED' || !newSession) {
        registrarDiagAuth(`Evento ${evento}: ${newSession?.user ? `sesión de ${newSession.user.email}` : 'sin sesión'} (a los ${Math.round(performance.now() / 1000)} s de abrir la página)`);
      }
      window.setTimeout(() => { if (activo) void aplicarSesion(newSession); }, 0);
    });

    return () => {
      activo = false;
      window.clearTimeout(limite);
      listener.subscription.unsubscribe();
    };
  }, []);

  // Renovación automática del permiso de Google (dura 1 h): se revisa cada
  // 4 minutos y al volver a la pestaña, y se renueva antes de que venza, así
  // Sheets, Gmail y Drive siguen funcionando sin "Reconectar Google".
  useEffect(() => {
    if (!session?.user) return;
    const revisar = () => { if (googleTokenPorVencer()) void renovarGoogleToken(); };
    revisar();
    const timer = window.setInterval(revisar, 4 * 60 * 1000);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', alVolver); };
  }, [session?.user?.id]);

  const user: User | null = session?.user && profile
    ? {
        email: session.user.email || '',
        name: profile.full_name || session.user.user_metadata?.full_name || 'Usuario Mandao',
        role: profile.role,
        domain: session.user.email?.split('@')[1] || '',
        uid: session.user.id,
        active: profile.active,
        accessModules: profile.accessModules,
        permisos: profile.permisos,
      }
    : null;

  const logout = async () => {
    sessionStorage.removeItem('google_access_token');
    sessionStorage.removeItem('google_access_token_exp');
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const reloadPermissions = async () => {
    if (session?.user) {
      await loadProfile(session.user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!session?.user,
        isLoading,
        cargaLenta,
        dejarDeEsperar,
        authError,
        logout,
        reloadPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
