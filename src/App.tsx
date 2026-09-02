import React from 'react';
import { AppShell } from './shell/AppShell';
import { AuthProvider, useAuth } from './lib/auth';
import { ModuleRouter } from './modules/ModuleRouter';
import { LoginPage } from './modules/auth/LoginPage';
// 'lib/seed.ts' todavía siembra contra Firestore (pendiente de migrar
// a Supabase o eliminar — ver PLAN_MIGRACION.md sección 8, punto 2).
// Se desactiva la siembra automática al iniciar sesión para no romper
// toda la app con un import roto mientras se decide su reemplazo.

function AppContent({ activeTab, userRole }: { activeTab?: string; userRole?: string }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="w-12 h-12 border-4 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <ModuleRouter activeTab={activeTab || 'dashboard'} userRole={userRole} />
    </AppShell>
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
