import React from 'react';

// Detalle legible de un registro del Log de Auditoría (pedido 2026-11-05):
// tabla de cambios (antes / después), datos del registro creado o eliminado
// y el resto de la información, sin tener que leer el JSON técnico.

const OCULTOS = new Set(['user_email', 'cambios', 'antes', 'despues', 'datos']);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const ETIQUETA: Record<string, string> = {
  id: 'ID', nombre: 'Nombre', negocio: 'Negocio', area: 'Área', metodo: 'Método', serie: 'Serie',
  conciliacion: 'Conciliación', consecutivo: 'Consecutivo', entidad: 'Entidad', destinatarios: 'Destinatarios',
  conciliaciones: 'Conciliaciones', cantidad: 'Cantidad', rangoFechas: 'Rango de fechas', reconciliadas: 'Reconciliadas',
};
const etiqueta = (k: string) => ETIQUETA[k] || k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

function texto(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.length === 0 ? '—' : v.map(texto).join(', ');
  if (esObjeto(v)) return Object.entries(v).map(([k, x]) => `${etiqueta(k)}: ${texto(x)}`).join(' · ');
  return String(v);
}

// Cambios a mostrar: details.cambios, o details.antes / details.despues.
function cambiosDe(d: Record<string, unknown>): { campo: string; antes: unknown; despues: unknown }[] {
  if (esObjeto(d.cambios)) {
    return Object.entries(d.cambios).map(([campo, c]) => ({
      campo, antes: esObjeto(c) ? c.antes : undefined, despues: esObjeto(c) ? c.despues : c,
    }));
  }
  if ('antes' in d || 'despues' in d) {
    if (esObjeto(d.antes) || esObjeto(d.despues)) {
      const a = esObjeto(d.antes) ? d.antes : {};
      const b = esObjeto(d.despues) ? d.despues : {};
      return Array.from(new Set([...Object.keys(a), ...Object.keys(b)]))
        .filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
        .map(k => ({ campo: etiqueta(k), antes: a[k], despues: b[k] }));
    }
    return [{ campo: 'Valor', antes: d.antes, despues: d.despues }];
  }
  return [];
}

export function resumenCambios(details: unknown): string | null {
  if (!esObjeto(details)) return null;
  const n = cambiosDe(details).length;
  if (n > 0) return `${n} campo${n === 1 ? '' : 's'} modificado${n === 1 ? '' : 's'}`;
  if ('cambios' in details) return 'Sin cambios';
  return null;
}

const Titulo = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{children}</span>
);

export function DetallesLog({ details }: { details: unknown }) {
  if (!esObjeto(details)) return null;
  const cambios = cambiosDe(details);
  const datos = esObjeto(details.datos) ? details.datos : null;
  const resto = Object.entries(details).filter(([k, v]) => !OCULTOS.has(k) && v !== undefined);

  return (
    <div className="space-y-4">
      {(cambios.length > 0 || 'cambios' in details) && (
        <div className="space-y-1.5">
          <Titulo>Qué se modificó</Titulo>
          {cambios.length === 0 ? (
            <p className="text-xs text-slate-500">Se guardó sin cambios en los datos.</p>
          ) : (
            <div className="border border-[var(--color-border)] rounded-[var(--radius-sm)] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface-2)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
                  <tr>
                    <th className="text-left font-bold p-2">Campo</th>
                    <th className="text-left font-bold p-2">Antes</th>
                    <th className="text-left font-bold p-2">Después</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {cambios.map(c => (
                    <tr key={c.campo}>
                      <td className="p-2 font-semibold text-[var(--color-text)]">{c.campo}</td>
                      <td className="p-2 text-[var(--color-text-faint)] line-through break-words">{texto(c.antes)}</td>
                      <td className="p-2 font-semibold text-[var(--color-text)] break-words">{texto(c.despues)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {datos && (
        <div className="space-y-1.5">
          <Titulo>Datos del registro</Titulo>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {Object.entries(datos).map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-400">{k}</dt>
                <dd className="font-semibold text-slate-800 break-words">{texto(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {resto.length > 0 && (
        <div className="space-y-1.5">
          <Titulo>Información</Titulo>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {resto.map(([k, v]) => (
              <div key={k}>
                <dt className="text-slate-400">{etiqueta(k)}</dt>
                <dd className="font-semibold text-slate-800 break-words">{texto(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
