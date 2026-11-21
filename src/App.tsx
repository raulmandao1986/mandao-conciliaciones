import React from 'react';
import { AppShell } from './shell/AppShell';
import { AuthProvider, useAuth } from './lib/auth';
import { ModuleRouter } from './modules/ModuleRouter';
import { LoginPage } from './modules/auth/LoginPage';
import { PendingApprovalPage } from './modules/auth/PendingApprovalPage';
import { Button } from './design-system/primitives/Button';
import { probarConexionSupabase, registrarDiagAuth } from './lib/supabase';
// 'lib/seed.ts' todavía siembra contra Firestore (pendiente de migrar
// a Supabase o eliminar — ver PLAN_MIGRACION.md sección 8, punto 2).
// Se desactiva la siembra automática al iniciar sesión para no romper
// toda la app con un import roto mientras se decide su reemplazo.

function AppContent({ activeTab, userRole }: { activeTab?: string; userRole?: string }) {
  const { isAuthenticated, isLoading, cargaLenta, user } = useAuth();

  if (isLoading) {
    return (
      <div className="h-dvh overflow-y-auto flex flex-col items-center-safe justify-center gap-6 bg-[var(--color-bg)] p-4">
        <div className="w-12 h-12 border-4 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin" />
        {cargaLenta && <ConexionLenta />}
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Autenticarse con Google (@mandao.app) ya no basta para ver el sistema:
  // hace falta que un Super Admin haya registrado el profile con
  // active = true (Roles y Usuarios). 'user' es null si el profile no
  // cargó (RLS/consulta falló) — se trata igual que "sin autorizar".
  if (!user || !user.active) {
    return <PendingApprovalPage />;
  }

  return (
    <AppShell>
      <ModuleRouter activeTab={activeTab || 'dashboard'} userRole={userRole} />
    </AppShell>
  );
}

// Se muestra cuando la sesión tarda más de 10 s (red lenta o sin acceso al
// servidor). Sigue esperando en segundo plano; no manda al login para no
// iniciar otra vez el flujo de Google.
function ConexionLenta() {
  const { dejarDeEsperar } = useAuth();
  const [prueba, setPrueba] = React.useState<string>('Probando la conexión con el servidor…');
  React.useEffect(() => {
    let vivo = true;
    void probarConexionSupabase().then(r => {
      registrarDiagAuth(`Prueba de conexión con el servidor: ${r.detalle}`);
      if (vivo) setPrueba(`El servidor ${r.detalle}.`);
    });
    return () => { vivo = false; };
  }, []);
  return (
    <div className="max-w-sm w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-4 space-y-3 text-sm">
      <p className="font-semibold text-[var(--color-text)]">La conexión está tardando más de lo normal</p>
      <p className="text-[var(--color-text-muted)]">
        Se está validando tu sesión con el servidor. Si estás con datos móviles, prueba con Wi-Fi (o al revés).
      </p>
      <p className="text-xs font-mono text-[var(--color-text-muted)]">{prueba}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="brand" size="sm" onClick={() => window.location.reload()}>Reintentar</Button>
        <Button variant="ghost" size="sm" onClick={dejarDeEsperar}>Ir a la pantalla de acceso</Button>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
