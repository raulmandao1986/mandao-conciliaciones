import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Info, LogOut, Mail, Shield, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';

// Menú del usuario en la barra superior (2026-11-16): al hacer clic en la
// inicial se despliegan "Información" (nombre, correo y rol) y "Cerrar Sesión".
// Reemplaza al "Cerrar Sesión" que estaba al final del menú lateral.

const ROL_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  supervisor: 'Supervisor',
  operador: 'Operador',
  visitante: 'Visitante',
};

export function UserMenu({ nombre, correo, rol, onLogout }: {
  nombre: string;
  correo: string;
  rol: string;
  onLogout: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [verInfo, setVerInfo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setAbierto(a => !a); setVerInfo(false); }}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label="Menú del usuario"
        title="Menú del usuario"
        className={cn(
          'w-9 h-9 rounded-full bg-[var(--color-brand)] flex items-center justify-center text-[var(--color-brand-ink)] font-bold border-2 border-[var(--color-surface)] shadow-sm transition-all hover:ring-2 hover:ring-[var(--color-brand)]',
          abierto && 'ring-2 ring-[var(--color-brand)]'
        )}
      >
        {(nombre || correo || '?').charAt(0).toUpperCase()}
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-72 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-lg overflow-hidden">
          <button
            type="button"
            role="menuitem"
            onClick={() => setVerInfo(v => !v)}
            aria-expanded={verInfo}
            className="w-full h-10 px-3 flex items-center gap-2 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
          >
            <Info size={16} className="text-[var(--color-text-muted)]" />
            Información
            {verInfo ? <ChevronUp size={14} className="ml-auto text-[var(--color-text-faint)]" /> : <ChevronDown size={14} className="ml-auto text-[var(--color-text-faint)]" />}
          </button>
          {verInfo && (
            <dl className="px-3 pb-3 pt-1 space-y-2 text-xs bg-[var(--color-surface-2)] border-y border-[var(--color-border)]">
              <div className="flex items-start gap-2 pt-2">
                <UserIcon size={14} className="mt-0.5 text-[var(--color-text-faint)] shrink-0" />
                <div><dt className="text-[var(--color-text-faint)]">Nombre</dt><dd className="font-semibold text-[var(--color-text)] break-words">{nombre || '—'}</dd></div>
              </div>
              <div className="flex items-start gap-2">
                <Mail size={14} className="mt-0.5 text-[var(--color-text-faint)] shrink-0" />
                <div><dt className="text-[var(--color-text-faint)]">Correo</dt><dd className="font-semibold text-[var(--color-text)] break-all">{correo || '—'}</dd></div>
              </div>
              <div className="flex items-start gap-2">
                <Shield size={14} className="mt-0.5 text-[var(--color-text-faint)] shrink-0" />
                <div><dt className="text-[var(--color-text-faint)]">Rol</dt><dd className="font-semibold text-[var(--color-text)]">{ROL_LABEL[rol] || rol || '—'}</dd></div>
              </div>
            </dl>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setAbierto(false); onLogout(); }}
            className="w-full h-10 px-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
          >
            <LogOut size={16} />
            Cerrar Sesión
          </button>
        </div>
      )}
    </div>
  );
}
