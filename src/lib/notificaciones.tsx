import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertOctagon, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from './utils';
import { ConfirmDialog } from '../design-system/primitives/ConfirmDialog';

// Avisos y confirmaciones del sistema (2026-11-16): reemplazan a alert() y
// window.confirm() del navegador. Se usan desde cualquier archivo, sin
// Provider: notificar('…'), notificar.error('…'), await confirmar('…').
// <CentroNotificaciones /> (montado en main.tsx) los dibuja.

export type TipoAviso = 'exito' | 'error' | 'advertencia' | 'info';
interface Aviso { id: number; tipo: TipoAviso; mensaje: string }
interface Confirmacion { mensaje: string; titulo: string; textoConfirmar: string; peligro: boolean; resolver: (ok: boolean) => void }

let avisos: Aviso[] = [];
let confirmacion: Confirmacion | null = null;
let siguienteId = 1;
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach(f => f());

// Sin tipo explícito se deduce del texto (los mensajes del sistema empiezan
// con "Error…", "No se pudo…", "¡…con éxito!", etc.).
function deducirTipo(m: string): TipoAviso {
  if (/^\s*(error|no se pudo|no se pudieron|fallo|falló)|error rn-|token de google no disponible/i.test(m)) return 'error';
  if (/éxito|correctamente|guardad[oa]s?\b|copiad[oa]s|se eliminaron|finalizada|actualizados/i.test(m)) return 'exito';
  if (/^\s*(por favor|selecciona|debes|no hay|ningún|el porcentaje|la tarifa)|ya existe/i.test(m)) return 'advertencia';
  return 'info';
}

function cerrar(id: number) {
  avisos = avisos.filter(a => a.id !== id);
  emitir();
}

function agregar(mensaje: unknown, tipo?: TipoAviso) {
  const texto = String(mensaje ?? '');
  const aviso: Aviso = { id: siguienteId++, tipo: tipo || deducirTipo(texto), mensaje: texto };
  avisos = [...avisos.slice(-4), aviso];
  emitir();
  const duracion = aviso.tipo === 'error' ? 12000 : aviso.tipo === 'advertencia' ? 8000 : 5000;
  window.setTimeout(() => cerrar(aviso.id), duracion);
}

export const notificar = Object.assign((mensaje: unknown, tipo?: TipoAviso) => agregar(mensaje, tipo), {
  exito: (m: unknown) => agregar(m, 'exito'),
  error: (m: unknown) => agregar(m, 'error'),
  advertencia: (m: unknown) => agregar(m, 'advertencia'),
  info: (m: unknown) => agregar(m, 'info'),
});

export function confirmar(
  mensaje: string,
  opciones: { titulo?: string; textoConfirmar?: string; peligro?: boolean } = {}
): Promise<boolean> {
  return new Promise(resolver => {
    confirmacion?.resolver(false);
    confirmacion = {
      mensaje,
      titulo: opciones.titulo || '¿Confirmar acción?',
      textoConfirmar: opciones.textoConfirmar || 'Confirmar',
      peligro: opciones.peligro ?? true,
      resolver,
    };
    emitir();
  });
}

function responder(ok: boolean) {
  const c = confirmacion;
  confirmacion = null;
  emitir();
  c?.resolver(ok);
}

const ESTILO: Record<TipoAviso, { icon: React.ElementType; clase: string }> = {
  exito: { icon: CheckCircle2, clase: 'border-green-200 text-[var(--color-success)]' },
  error: { icon: AlertOctagon, clase: 'border-red-200 text-[var(--color-danger)]' },
  advertencia: { icon: AlertTriangle, clase: 'border-amber-200 text-[var(--color-warning)]' },
  info: { icon: Info, clase: 'border-blue-200 text-[var(--color-info)]' },
};

export function CentroNotificaciones() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const f = () => setVersion(v => v + 1);
    oyentes.add(f);
    return () => { oyentes.delete(f); };
  }, []);

  return (
    <>
      <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 w-[min(26rem,calc(100vw-2rem))]" aria-live="polite">
        <AnimatePresence initial={false}>
          {avisos.map(a => {
            const { icon: Icon, clase } = ESTILO[a.tipo];
            return (
              <motion.div
                key={a.id}
                role={a.tipo === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
                exit={{ opacity: 0, x: 16, transition: { duration: 0.18 } }}
                className={cn('flex items-start gap-3 bg-[var(--color-surface)] border rounded-[var(--radius-md)] shadow-lg p-3', clase)}
              >
                <Icon size={18} className="shrink-0 mt-0.5" />
                <p className="flex-1 text-sm font-medium text-[var(--color-text)] whitespace-pre-line break-words">{a.mensaje}</p>
                <button
                  type="button"
                  onClick={() => cerrar(a.id)}
                  aria-label="Cerrar aviso"
                  title="Cerrar"
                  className="shrink-0 p-0.5 rounded text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <ConfirmDialog
        isOpen={!!confirmacion}
        title={confirmacion?.titulo || ''}
        message={confirmacion?.mensaje || ''}
        confirmText={confirmacion?.textoConfirmar}
        onConfirm={() => responder(true)}
        onCancel={() => responder(false)}
        isDanger={confirmacion?.peligro ?? true}
      />
    </>
  );
}
