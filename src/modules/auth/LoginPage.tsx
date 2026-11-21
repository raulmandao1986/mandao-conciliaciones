import React from 'react';
import { Button } from '../../design-system/primitives/Button';
import { signInWithGoogle, retornoLogin, leerDiagAuth, limpiarDiagAuth, almacenamientoDisponible } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { LogIn, ShieldCheck, AlertTriangle, Clock, Copy } from 'lucide-react';
import { motion } from 'motion/react';

const fmtDesfase = (seg: number) => {
  const min = Math.round(Math.abs(seg) / 60);
  return `${min} min ${seg > 0 ? 'adelantado' : 'atrasado'}`;
};

export function LoginPage() {
  const { authError } = useAuth();
  const [diag, setDiag] = React.useState<string[]>(() => leerDiagAuth());
  const [copiado, setCopiado] = React.useState(false);
  const desfase = retornoLogin.desfaseSeg;
  const relojDesfasado = desfase !== null && Math.abs(desfase) > 300;

  const textoDiag = () => [
    `Navegador: ${navigator.userAgent}`,
    `Hora del dispositivo: ${new Date().toString()}`,
    `Dirección: ${window.location.origin}`,
    `Almacenamiento: ${almacenamientoDisponible ? 'disponible' : 'BLOQUEADO'}`,
    ...diag,
  ].join('\n');

  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoDiag()); setCopiado(true); window.setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  return (
    <div className="h-dvh overflow-y-auto bg-[var(--color-bg)] flex items-center-safe justify-center p-4">
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
          {!authError && retornoLogin.error && (
            <div className="flex items-start gap-2 text-left bg-[var(--color-danger-bg)] text-[var(--color-danger)] rounded-[var(--radius-md)] p-3 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>No se pudo iniciar sesión: {retornoLogin.error}</span>
            </div>
          )}
          {relojDesfasado && (
            <div className="flex items-start gap-2 text-left bg-[var(--color-warning-bg)] text-[var(--color-warning)] rounded-[var(--radius-md)] p-3 text-sm">
              <Clock size={18} className="shrink-0 mt-0.5" />
              <span>
                La hora de este dispositivo está desfasada (≈ {fmtDesfase(desfase!)}). Activa la fecha y hora automáticas
                en los ajustes del teléfono y vuelve a entrar: con la hora desfasada la sesión se da por vencida.
              </span>
            </div>
          )}
          {!almacenamientoDisponible && (
            <div className="flex items-start gap-2 text-left bg-[var(--color-warning-bg)] text-[var(--color-warning)] rounded-[var(--radius-md)] p-3 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>El navegador no permite guardar datos de este sitio (modo privado estricto o cookies bloqueadas), así que la sesión no se puede mantener.</span>
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

          {diag.length > 0 && (
            <details className="text-left border border-[var(--color-border)] rounded-[var(--radius-sm)] bg-[var(--color-surface-2)]">
              <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
                Diagnóstico de acceso ({diag.length})
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <ul className="max-h-48 overflow-y-auto space-y-1 font-mono text-[10px] text-[var(--color-text-muted)] break-words">
                  {diag.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={copiar}>
                    <Copy size={13} /> {copiado ? 'Copiado' : 'Copiar'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { limpiarDiagAuth(); setDiag([]); }}>
                    Limpiar
                  </Button>
                </div>
              </div>
            </details>
          )}
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
