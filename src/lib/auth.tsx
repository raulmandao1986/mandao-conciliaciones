import { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { supabase, syncGoogleTokenToSessionStorage } from './supabase';
import type { Session } from '@supabase/supabase-js';

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
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  reloadPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

async function fetchProfile(userId: string): Promise<{ role: UserRole; active: boolean; full_name: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, active, full_name')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[Auth] No se pudo cargar el perfil desde Supabase:', error.message);
    return null;
  }
  return data as any;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ role: UserRole; active: boolean; full_name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const p = await fetchProfile(userId);
    setProfile(p);
  };

  useEffect(() => {
    // Sesión inicial al cargar la app
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        await syncGoogleTokenToSessionStorage();
        await loadProfile(data.session.user.id);
      }
      setIsLoading(false);
    });

    // Cambios de sesión (login, logout, refresh de token)
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        await syncGoogleTokenToSessionStorage();
        await loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        sessionStorage.removeItem('google_access_token');
      }
      setIsLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user && profile
    ? {
        email: session.user.email || '',
        name: profile.full_name || session.user.user_metadata?.full_name || 'Usuario Mandao',
        role: profile.role,
        domain: session.user.email?.split('@')[1] || '',
        uid: session.user.id,
        active: profile.active,
      }
    : null;

  const logout = async () => {
    sessionStorage.removeItem('google_access_token');
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
