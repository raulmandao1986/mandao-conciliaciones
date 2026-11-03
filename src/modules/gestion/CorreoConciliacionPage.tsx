import React, { useEffect, useState } from 'react';
import { Mail, Loader2, Save, AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { formatDate, toLocalISODate } from '../../lib/formatters';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import {
  CORREO_KEYS, PLANTILLA_DEFECTO, VARIABLES_CORREO, loadPlantillaCorreo, aplicarPlantilla, parseCorreos,
  type PlantillaCorreo,
} from '../../lib/conciliacion/envioCorreo';

// Configuración -> Correo de Conciliación (2026-10-27d): asunto, cuerpo y
// copia del correo con que se envían los PDF de conciliación a negocios y
// mensajeros. Se guarda en app_settings.

const fieldCls = 'w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20 disabled:bg-[var(--color-surface-2)]';

const hoy = toLocalISODate();
const EJEMPLO = {
  nombre: 'Burger Queen',
  area: 'La Habana',
  periodo: `${formatDate(hoy.slice(0, 8) + '01')} al ${formatDate(hoy)}`,
  detalle: '• Transferencia (CUP): a pagar al negocio CUP 2.340,00\n• Exterior (USD): a pagar al negocio USD 137,47',
};

export function CorreoConciliacionPage() {
  const { user } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');
  const [guardada, setGuardada] = useState<PlantillaCorreo | null>(null);
  const [form, setForm] = useState<PlantillaCorreo>(PLANTILLA_DEFECTO);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await loadPlantillaCorreo();
      setGuardada(p);
      setForm(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const ccInvalidos = form.cc.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).filter(s => !parseCorreos(s).length);
  const errAsunto = !form.asunto.trim() ? 'El asunto es obligatorio.' : null;
  const errCuerpo = !form.cuerpo.trim() ? 'El cuerpo es obligatorio.' : null;
  const errCc = ccInvalidos.length > 0 ? `Correo(s) no válido(s): ${ccInvalidos.join(', ')}` : null;
  const cambiado = !!guardada && (form.asunto !== guardada.asunto || form.cuerpo !== guardada.cuerpo || form.cc !== guardada.cc);

  const guardar = async () => {
    setGuardando(true);
    const ahora = new Date().toISOString();
    const { error: e } = await supabase.from('app_settings').upsert([
      { setting_key: CORREO_KEYS.asunto, value: form.asunto.trim(), updated_at: ahora, updated_by: user?.id || null },
      { setting_key: CORREO_KEYS.cuerpo, value: form.cuerpo.trim(), updated_at: ahora, updated_by: user?.id || null },
      { setting_key: CORREO_KEYS.cc, value: parseCorreos(form.cc).join(', '), updated_at: ahora, updated_by: user?.id || null },
    ], { onConflict: 'setting_key' });
    if (e) alert('No se pudo guardar la plantilla: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Plantilla de Correo de Conciliación Actualizada', { asunto: form.asunto.trim(), cc: parseCorreos(form.cc) });
      await load();
    }
    setGuardando(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-80 animate-pulse rounded bg-[var(--color-surface-3)]" />
        <div className="h-80 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-3)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-10 flex flex-col items-center text-center gap-3">
        <AlertTriangle className="w-10 h-10 text-[var(--color-danger)]" />
        <h2 className="text-base font-semibold text-[var(--color-text)]">No se pudo cargar la plantilla de correo</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md">{error}</p>
        <Button variant="outline" className="gap-2" onClick={load}><RefreshCw size={16} /> Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl text-[var(--color-brand-ink)] bg-[var(--color-brand-subtle)]"><Mail className="w-6 h-6" /></div>
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-faint)]">Configuración</p>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Correo de Conciliación</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl">
            Plantilla del correo con que se envían los PDF de conciliación a cada negocio o mensajero (botón "Enviar" del histórico).
            Se envía desde la cuenta de Google del usuario conectado; al enviarse, la conciliación pasa a Enviado.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-5 space-y-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Asunto<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
            <input disabled={!canWrite} value={form.asunto} onChange={(e) => setForm(f => ({ ...f, asunto: e.target.value }))} className={cn(fieldCls, 'h-10')} />
            {errAsunto && <span className="text-xs font-medium text-[var(--color-danger)]">{errAsunto}</span>}
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Cuerpo<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
            <textarea disabled={!canWrite} rows={12} value={form.cuerpo} onChange={(e) => setForm(f => ({ ...f, cuerpo: e.target.value }))} className={cn(fieldCls, 'py-2 leading-relaxed')} />
            {errCuerpo && <span className="text-xs font-medium text-[var(--color-danger)]">{errCuerpo}</span>}
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Copia (CC)</span>
            <input disabled={!canWrite} value={form.cc} onChange={(e) => setForm(f => ({ ...f, cc: e.target.value }))} placeholder="contabilidad@mandao.app, caja@mandao.app" className={cn(fieldCls, 'h-10')} />
            {errCc
              ? <span className="text-xs font-medium text-[var(--color-danger)]">{errCc}</span>
              : <span className="text-xs text-[var(--color-text-muted)]">Opcional. Varios correos separados por coma; reciben copia de todos los envíos.</span>}
          </label>

          <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
            <p className="text-xs font-semibold text-[var(--color-text)] mb-2">Variables disponibles</p>
            <ul className="grid gap-1 text-xs text-[var(--color-text-muted)]">
              {VARIABLES_CORREO.map(v => (
                <li key={v.clave}><code className="font-mono text-[var(--color-text)]">{v.clave}</code> — {v.descripcion}</li>
              ))}
            </ul>
          </div>

          {canWrite && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" className="gap-2" onClick={() => setForm(PLANTILLA_DEFECTO)} disabled={guardando}>
                <RotateCcw size={16} /> Restaurar texto por defecto
              </Button>
              <Button variant="primary" className="gap-2" onClick={guardar} disabled={!cambiado || !!errAsunto || !!errCuerpo || !!errCc || guardando}>
                {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar plantilla
              </Button>
            </div>
          )}
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden h-fit">
          <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <h2 className="text-sm font-bold text-[var(--color-text)]">Vista previa</h2>
            <p className="text-xs text-[var(--color-text-muted)]">Con datos de ejemplo.</p>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <p><span className="text-[var(--color-text-faint)]">Para:</span> <span className="text-[var(--color-text)]">correo del negocio o mensajero</span></p>
            {parseCorreos(form.cc).length > 0 && <p><span className="text-[var(--color-text-faint)]">CC:</span> {parseCorreos(form.cc).join(', ')}</p>}
            <p><span className="text-[var(--color-text-faint)]">Asunto:</span> <strong className="text-[var(--color-text)]">{aplicarPlantilla(form.asunto, EJEMPLO)}</strong></p>
            <div className="border-t border-[var(--color-border)] pt-3 whitespace-pre-line text-[var(--color-text)] leading-relaxed">{aplicarPlantilla(form.cuerpo, EJEMPLO)}</div>
            <p className="text-xs text-[var(--color-text-faint)] border-t border-[var(--color-border)] pt-3">Adjuntos: un PDF por conciliación (CUP y USD del mismo período van juntos).</p>
          </div>
        </div>
      </div>
    </div>
  );
}
