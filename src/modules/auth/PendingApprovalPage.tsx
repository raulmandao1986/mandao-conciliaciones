import { Clock3, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '../../design-system/primitives/Button';
import { useAuth } from '../../lib/auth';

export function PendingApprovalPage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-[var(--color-surface)] p-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-xl text-center"
      >
        <div className="w-20 h-20 bg-[var(--color-warning-bg)] rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Clock3 className="w-10 h-10 text-[var(--color-warning)]" />
        </div>

        <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">Cuenta pendiente de aprobación</h1>
        <p className="text-[var(--color-text-muted)] text-sm mb-1">
          Tu cuenta de Google <strong>{user?.email}</strong> es válida (dominio @mandao.app), pero todavía no
          tiene acceso asignado en Mandao Conciliaciones.
        </p>
        <p className="text-[var(--color-text-muted)] text-sm mb-8">
          Pídele a un Super Admin que te registre en <strong>Configuración → Roles y Usuarios</strong> y te
          asigne un rol. En cuanto lo haga, recarga esta página.
        </p>

        <Button variant="ghost" className="w-full h-11 gap-2" onClick={() => logout()}>
          <LogOut size={16} />
          Cerrar sesión
        </Button>
      </motion.div>
    </div>
  );
}
