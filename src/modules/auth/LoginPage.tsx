import React from 'react';
import { Button } from '../../design-system/primitives/Button';
import { signInWithGoogle } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { LogIn, ShieldCheck, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

export function LoginPage() {
  const { authError } = useAuth();

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-[var(--color-surface)] p-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-xl text-center"
      >
        <div className="w-20 h-20 bg-[var(--color-brand)] rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg rotate-3 group hover:rotate-0 transition-transform">
           <ShieldCheck className="w-10 h-10 text-[var(--color-brand-ink)]" />
        </div>
        
        <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">Mandao Conciliaciones</h1>
        <p className="text-[var(--color-text-muted)] mb-8 text-sm">
          Plataforma centralizada de gestión administrativa y financiera para el ecosistema Mandao.
        </p>

        <div className="space-y-4">
          {authError && (
            <div className="flex items-start gap-2 text-left bg-red-500/10 border border-red-500/30 text-red-500 rounded-[var(--radius-md)] p-3 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <Button
            variant="brand"
            className="w-full h-12 gap-3 text-base shadow-sm"
            onClick={handleLogin}
          >
            <LogIn size={20} />
            Continuar con Google
          </Button>

          <p className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-widest font-bold">
            Acceso restringido a @mandao.app
          </p>
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--color-border)] flex items-center justify-center gap-6">
           <div className="flex flex-col items-center gap-1 opacity-40">
             <div className="w-2 h-2 rounded-full bg-green-500" />
             <span className="text-[9px] font-bold">FINANCE</span>
           </div>
           <div className="flex flex-col items-center gap-1 opacity-40">
             <div className="w-2 h-2 rounded-full bg-blue-500" />
             <span className="text-[9px] font-bold">INVENTARIO</span>
           </div>
           <div className="flex flex-col items-center gap-1 opacity-40">
             <div className="w-2 h-2 rounded-full bg-brand-dark" />
             <span className="text-[9px] font-bold">CONCIL</span>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
