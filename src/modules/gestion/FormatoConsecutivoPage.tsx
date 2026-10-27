import React, { useEffect, useState } from 'react';
import { Hash, Loader2, Save, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';

// Configuración -> Tipología de Pago -> Formato de Consecutivo (2026-10-27c).
// Una serie por Entidad × Sentido × Moneda. La base de datos arma el código
// con este formato al registrar cada conciliación
// (public.next_conciliacion_consecutivo); la clave de la serie es fija, así
// que cambiar el prefijo no reinicia la numeración.

type FormatoAnio = 'AA' | 'AAAA' | 'ninguno';
type Reinicio = 'anual' | 'nunca';
interface Serie {
  serie: string;
  entidad: 'negocios' | 'mensajeros';
  sentido: 'pagar' | 'cobrar';
  moneda: 'CUP' | 'USD';
  prefijo: string;
  formatoAnio: FormatoAnio;
  separador: string;
  digitos: number;
  reinicio: Reinicio;
}
type Draft = Pick<Serie, 'prefijo' | 'formatoAnio' | 'separador' | 'digitos' | 'reinicio'>;

const SEPARADORES: { value: string; label: string }[] = [
  { value: '', label: 'Ninguno' },
  { value: '-', label: 'Guion (-)' },
  { value: '.', label: 'Punto (.)' },
  { value: '_', label: 'Guion bajo (_)' },
];

const fieldCls = 'h-9 w-full px-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)]';

// Misma regla que la función de la base de datos.
export function vistaPreviaConsecutivo(d: Draft, numero = 1, anio = new Date().getFullYear()): string {
  const anioTxt = d.formatoAnio === 'AA' ? String(anio % 100).padStart(2, '0') : d.formatoAnio === 'AAAA' ? String(anio) : null;
  return d.prefijo + d.separador + (anioTxt !== null ? anioTxt + d.separador : '') + String(numero).padStart(d.digitos, '0');
}

function validar(d: Draft, otros: Serie[]): string | null {
  if (!/^[A-Za-z0-9]{1,10}$/.test(d.prefijo)) return 'El prefijo debe tener de 1 a 10 letras o números, sin espacios.';
  if (otros.some(o => o.prefijo.toUpperCase() === d.prefijo.toUpperCase())) return 'Ese prefijo ya lo usa otra serie.';
  if (!Number.isInteger(d.digitos) || d.digitos < 1 || d.digitos > 10) return 'Los dígitos deben estar entre 1 y 10.';
  if (d.formatoAnio === 'ninguno' && d.reinicio === 'anual') return 'Sin año en el código, el reinicio anual repetiría números: use "Nunca".';
  return null;
}

export function FormatoConsecutivoPage() {
  const { user } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');
  const [series, setSeries] = useState<Serie[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('consecutivo_series')
      .select('serie, entidad, sentido, moneda, prefijo, formato_anio, separador, digitos, reinicio')
      .order('entidad').order('moneda').order('sentido', { ascending: false });
    if (e) {
      setError(/consecutivo_series/.test(e.message) ? 'Falta correr en Supabase la migración 2026-10-27c_formato_consecutivo.sql.' : e.message);
      setLoading(false);
      return;
    }
    const ss: Serie[] = (data || []).map((r: any) => ({
      serie: r.serie, entidad: r.entidad, sentido: r.sentido, moneda: r.moneda, prefijo: r.prefijo,
      formatoAnio: r.formato_anio, separador: r.separador, digitos: r.digitos, reinicio: r.reinicio,
    }));
    setSeries(ss);
    setDrafts(Object.fromEntries(ss.map(s => [s.serie, { prefijo: s.prefijo, formatoAnio: s.formatoAnio, separador: s.separador, digitos: s.digitos, reinicio: s.reinicio }])));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const guardar = async (s: Serie) => {
    const d = drafts[s.serie];
    setGuardando(s.serie);
    const { error: e } = await supabase.from('consecutivo_series').update({
      prefijo: d.prefijo.toUpperCase(), formato_anio: d.formatoAnio, separador: d.separador,
      digitos: d.digitos, reinicio: d.reinicio, updated_at: new Date().toISOString(),
    }).eq('serie', s.serie);
    if (e) alert('No se pudo guardar el formato: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Formato de Consecutivo Actualizado', {
        serie: s.serie,
        antes: vistaPreviaConsecutivo(s),
        despues: vistaPreviaConsecutivo({ ...d, prefijo: d.prefijo.toUpperCase() }),
      });
      await load();
    }
    setGuardando(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-12 w-80 animate-pulse rounded bg-[var(--color-surface-3)]" />
        <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-3)]" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-10 flex flex-col items-center text-center gap-3">
        <AlertTriangle className="w-10 h-10 text-[var(--color-danger)]" />
        <h2 className="text-base font-semibold text-[var(--color-text)]">No se pudo cargar el Formato de Consecutivo</h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-md">{error}</p>
        <Button variant="outline" className="gap-2" onClick={load}><RefreshCw size={16} /> Reintentar</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl text-[var(--color-brand-ink)] bg-[var(--color-brand-subtle)]"><Hash className="w-6 h-6" /></div>
        <div>
          <p className="text-xs font-semibold text-[var(--color-text-faint)]">Configuración / Tipología de Pago</p>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Formato de Consecutivo</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl">
            Código que la base de datos asigna a cada conciliación con monto a pagar o a cobrar, por entidad, sentido y moneda.
            Se usa para hacer el match contra caja y en el nombre del PDF.
          </p>
        </div>
      </div>

      <div role="note" className="flex items-start gap-2 text-xs text-[var(--color-info)] bg-[var(--color-info-bg)] border border-blue-200 p-3 rounded-[var(--radius-sm)]">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          Los cambios aplican a las conciliaciones que se registren desde ahora; las ya registradas conservan su código.
          Cambiar el prefijo o el formato no reinicia la numeración de la serie.
        </span>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
              <tr>
                <th className="p-3 font-bold">Serie</th>
                <th className="p-3 font-bold w-28">Prefijo</th>
                <th className="p-3 font-bold w-32">Año</th>
                <th className="p-3 font-bold w-36">Separador</th>
                <th className="p-3 font-bold w-24">Dígitos</th>
                <th className="p-3 font-bold w-36">Reinicio</th>
                <th className="p-3 font-bold">Vista previa</th>
                <th className="p-3 w-28" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {series.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-sm text-[var(--color-text-muted)]">Sin series de consecutivo configuradas.</td></tr>
              ) : series.map(s => {
                const d = drafts[s.serie];
                const set = (patch: Partial<Draft>) => setDrafts(prev => ({ ...prev, [s.serie]: { ...d, ...patch } }));
                const cambiado = d.prefijo !== s.prefijo || d.formatoAnio !== s.formatoAnio || d.separador !== s.separador || d.digitos !== s.digitos || d.reinicio !== s.reinicio;
                const err = validar(d, series.filter(o => o.serie !== s.serie));
                return (
                  <tr key={s.serie} className="h-11 align-top">
                    <td className="p-3">
                      <span className="block font-semibold text-[var(--color-text)]">{s.entidad === 'negocios' ? 'Negocios' : 'Mensajeros'} · {s.sentido === 'pagar' ? 'Por Pagar' : 'Por Cobrar'}</span>
                      <span className="text-[11px] text-[var(--color-text-faint)]">Moneda {s.moneda}</span>
                    </td>
                    <td className="p-3"><input aria-label="Prefijo" disabled={!canWrite} value={d.prefijo} onChange={(e) => set({ prefijo: e.target.value.toUpperCase().trim() })} className={cn(fieldCls, 'font-mono uppercase')} /></td>
                    <td className="p-3">
                      <select aria-label="Año" disabled={!canWrite} value={d.formatoAnio} onChange={(e) => {
                        const formatoAnio = e.target.value as FormatoAnio;
                        set(formatoAnio === 'ninguno' ? { formatoAnio, reinicio: 'nunca' } : { formatoAnio });
                      }} className={fieldCls}>
                        <option value="AA">2 dígitos (26)</option>
                        <option value="AAAA">4 dígitos (2026)</option>
                        <option value="ninguno">Sin año</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <select aria-label="Separador" disabled={!canWrite} value={d.separador} onChange={(e) => set({ separador: e.target.value })} className={fieldCls}>
                        {SEPARADORES.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="p-3"><input type="number" min={1} max={10} aria-label="Dígitos" disabled={!canWrite} value={d.digitos} onChange={(e) => set({ digitos: Number(e.target.value) })} className={cn(fieldCls, 'text-right tabular-nums')} /></td>
                    <td className="p-3">
                      <select aria-label="Reinicio" disabled={!canWrite || d.formatoAnio === 'ninguno'} value={d.reinicio} onChange={(e) => set({ reinicio: e.target.value as Reinicio })} className={fieldCls}>
                        <option value="anual">Cada año</option>
                        <option value="nunca">Nunca</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-sm font-semibold text-[var(--color-text)]">{vistaPreviaConsecutivo(d)}</span>
                      {err && <span className="block text-xs font-medium text-[var(--color-danger)] mt-1">{err}</span>}
                    </td>
                    <td className="p-3 text-right">
                      {canWrite && (
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={!cambiado || !!err || guardando === s.serie} onClick={() => guardar(s)}>
                          {guardando === s.serie ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
