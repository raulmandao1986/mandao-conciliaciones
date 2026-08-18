import React, { useEffect } from 'react';
import { AppShell } from './shell/AppShell';
import { AuthProvider, useAuth } from './lib/auth';
import { ModuleRouter } from './modules/ModuleRouter';
import { LoginPage } from './modules/auth/LoginPage';
import { seedDatabase } from './lib/seed';

function AppContent({ activeTab, userRole }: { activeTab?: string; userRole?: string }) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      seedDatabase().catch((err) => {
        console.warn("Failed to automatically seed database (the client may be offline):", err?.message || err);
      });
    }
  }, [isAuthenticated]);

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
