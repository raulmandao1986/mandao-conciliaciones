import React, { useEffect, useState } from 'react';
import { Hash, Loader2, Save, AlertTriangle, RefreshCw, Info, Plus, Trash2 } from 'lucide-react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { cn } from '../../lib/utils';
import { notificar, confirmar } from '../../lib/notificaciones';

// Configuración -> Formato de Consecutivo (2026-10-27c).
// Una serie por Entidad × Sentido × Moneda: cada una con su formato y su
// numeración (rectificado 2026-11-02). La base de datos arma el código
// con este formato al registrar cada conciliación
// (public.next_conciliacion_consecutivo); la clave de la serie es fija, así
// que cambiar el prefijo no reinicia la numeración.
// 2026-11-19: se pueden agregar y eliminar series, y se suma la entidad
// Planificaciones (Planificación de Pagos, una serie por moneda, siempre
// Por Pagar). Migración 2026-11-19_consecutivo_series_gestion.sql.

type FormatoAnio = 'AA' | 'AAAA' | 'ninguno';
type Reinicio = 'anual' | 'nunca';
type Entidad = 'negocios' | 'mensajeros' | 'planificaciones';
type Sentido = 'pagar' | 'cobrar';
type Moneda = 'CUP' | 'USD';
interface Serie {
  serie: string;
  entidad: Entidad;
  sentido: Sentido;
  moneda: Moneda;
  prefijo: string;
  formatoAnio: FormatoAnio;
  separador: string;
  digitos: number;
  reinicio: Reinicio;
}
type Draft = Pick<Serie, 'prefijo' | 'formatoAnio' | 'separador' | 'digitos' | 'reinicio'>;
type NuevaSerie = Draft & Pick<Serie, 'entidad' | 'sentido' | 'moneda'>;
const NUEVA_INICIAL: NuevaSerie = {
  entidad: 'negocios', sentido: 'pagar', moneda: 'CUP',
  prefijo: 'PN', formatoAnio: 'AA', separador: '', digitos: 4, reinicio: 'anual',
};

const SEPARADORES: { value: string; label: string }[] = [
  { value: '', label: 'Ninguno' },
  { value: '-', label: 'Guion (-)' },
  { value: '.', label: 'Punto (.)' },
  { value: '_', label: 'Guion bajo (_)' },
];

const ENTIDADES: { value: Entidad; label: string }[] = [
  { value: 'negocios', label: 'Negocios' },
  { value: 'mensajeros', label: 'Mensajeros' },
  { value: 'planificaciones', label: 'Planificaciones' },
];
const ORDEN_ENTIDAD: Record<Entidad, number> = { negocios: 0, mensajeros: 1, planificaciones: 2 };
const etiquetaEntidad = (e: Entidad) => ENTIDADES.find(x => x.value === e)?.label ?? e;

// Misma regla que los triggers de la base de datos:
// (P pagar / C cobrar) + (N negocios / M mensajeros) + U si es USD.
// Planificaciones: PLN (CUP) / PLNU (USD), siempre Por Pagar.
export function claveSerie(entidad: Entidad, sentido: Sentido, moneda: Moneda): string {
  const usd = moneda === 'USD' ? 'U' : '';
  if (entidad === 'planificaciones') return 'PLN' + usd;
  return (sentido === 'pagar' ? 'P' : 'C') + (entidad === 'negocios' ? 'N' : 'M') + usd;
}

const MSG_MIGRACION = 'Falta correr en Supabase la migración 2026-11-19_consecutivo_series_gestion.sql.';

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
      .order('entidad', { ascending: false }).order('moneda').order('sentido', { ascending: false });
    if (e) {
      setError(/entidad/.test(e.message)
        ? 'Falta correr en Supabase la migración 2026-11-02_consecutivo_por_entidad.sql.'
        : /consecutivo_series/.test(e.message) ? 'Falta correr en Supabase la migración 2026-10-27c_formato_consecutivo.sql.' : e.message);
      setLoading(false);
      return;
    }
    const ss: Serie[] = (data || []).map((r: any) => ({
      serie: r.serie, entidad: r.entidad, sentido: r.sentido, moneda: r.moneda, prefijo: r.prefijo,
      formatoAnio: r.formato_anio, separador: r.separador, digitos: r.digitos, reinicio: r.reinicio,
    })).sort((a: Serie, b: Serie) => ORDEN_ENTIDAD[a.entidad] - ORDEN_ENTIDAD[b.entidad]);
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
    if (e) notificar.error('No se pudo guardar el formato: ' + e.message);
    else {
      logAuditEvent('Configuraciones', 'Formato de Consecutivo Actualizado', {
        serie: s.serie,
        antes: vistaPreviaConsecutivo(s),
        despues: vistaPreviaConsecutivo({ ...d, prefijo: d.prefijo.toUpperCase() }),
      });
      notificar.exito('Formato de la serie ' + s.serie + ' guardado.');
      await load();
    }
    setGuardando(null);
  };

  // ── Alta de serie ──
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [nueva, setNueva] = useState<NuevaSerie>(NUEVA_INICIAL);
  const [prefijoTocado, setPrefijoTocado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);

  const sentidoNueva: Sentido = nueva.entidad === 'planificaciones' ? 'pagar' : nueva.sentido;
  const claveNueva = claveSerie(nueva.entidad, sentidoNueva, nueva.moneda);
  const existeNueva = series.some(s => s.serie === claveNueva
    || (s.entidad === nueva.entidad && s.sentido === sentidoNueva && s.moneda === nueva.moneda));
  const errNueva = existeNueva
    ? `Ya existe la serie ${claveNueva} para ${etiquetaEntidad(nueva.entidad)} · ${nueva.entidad === 'planificaciones' ? '' : (sentidoNueva === 'pagar' ? 'Por Pagar · ' : 'Por Cobrar · ')}${nueva.moneda}.`
    : validar(nueva, series);

  // Mientras el usuario no edite el prefijo, se propone la clave de la serie.
  const setNuevaCombinacion = (patch: Partial<Pick<NuevaSerie, 'entidad' | 'sentido' | 'moneda'>>) => {
    setNueva(prev => {
      const sig = { ...prev, ...patch };
      if (!prefijoTocado) sig.prefijo = claveSerie(sig.entidad, sig.entidad === 'planificaciones' ? 'pagar' : sig.sentido, sig.moneda);
      return sig;
    });
  };

  const abrirNueva = () => {
    // Propone la primera combinación que todavía no existe.
    let inicial = NUEVA_INICIAL;
    outer: for (const ent of ENTIDADES) {
      for (const sen of (ent.value === 'planificaciones' ? ['pagar'] : ['pagar', 'cobrar']) as Sentido[]) {
        for (const mon of ['CUP', 'USD'] as Moneda[]) {
          if (!series.some(s => s.entidad === ent.value && s.sentido === sen && s.moneda === mon)) {
            inicial = { ...NUEVA_INICIAL, entidad: ent.value, sentido: sen, moneda: mon, prefijo: claveSerie(ent.value, sen, mon) };
            break outer;
          }
        }
      }
    }
    setNueva(inicial);
    setPrefijoTocado(false);
    setNuevaAbierta(true);
  };

  const crear = async () => {
    if (errNueva) return;
    setCreando(true);
    const fila = {
      serie: claveNueva, entidad: nueva.entidad, sentido: sentidoNueva, moneda: nueva.moneda,
      prefijo: nueva.prefijo.toUpperCase(), formato_anio: nueva.formatoAnio, separador: nueva.separador,
      digitos: nueva.digitos, reinicio: nueva.reinicio,
    };
    const { error: e } = await supabase.from('consecutivo_series').insert(fila);
    if (e) {
      notificar.error(/entidad_check|row-level security|permission denied/i.test(e.message)
        ? 'No se pudo agregar la serie. ' + MSG_MIGRACION
        : /duplicate|unique/i.test(e.message)
          ? 'No se pudo agregar la serie: ya existe esa combinación o ese prefijo.'
          : 'No se pudo agregar la serie: ' + e.message);
    } else {
      logAuditEvent('Configuraciones', 'Serie de Consecutivo Agregada', {
        serie: claveNueva,
        datos: { ...fila, vista_previa: vistaPreviaConsecutivo({ ...nueva, prefijo: fila.prefijo }) },
      });
      notificar.exito('Serie ' + claveNueva + ' agregada.');
      setNuevaAbierta(false);
      await load();
    }
    setCreando(false);
  };

  const eliminar = async (s: Serie) => {
    const ok = await confirmar(
      `Se eliminará la serie ${s.serie} (${etiquetaEntidad(s.entidad)}${s.entidad === 'planificaciones' ? '' : ' · ' + (s.sentido === 'pagar' ? 'Por Pagar' : 'Por Cobrar')} · ${s.moneda}). ` +
      `Las conciliaciones nuevas de esa combinación usarán el formato por defecto (prefijo ${s.serie}, año de 2 dígitos, sin separador, 4 dígitos, reinicio anual) hasta que se vuelva a crear la serie. ` +
      'Los códigos ya emitidos no cambian.',
      { titulo: '¿Eliminar serie de consecutivo?', textoConfirmar: 'Eliminar', peligro: true },
    );
    if (!ok) return;
    setEliminando(s.serie);
    const { data, error: e } = await supabase.from('consecutivo_series').delete().eq('serie', s.serie).select('serie');
    if (e) {
      notificar.error(/row-level security|permission denied/i.test(e.message)
        ? 'No se pudo eliminar la serie. ' + MSG_MIGRACION
        : 'No se pudo eliminar la serie: ' + e.message);
    } else if (!data || data.length === 0) {
      // RLS sin política de DELETE devuelve 0 filas sin error.
      notificar.error('No se pudo eliminar la serie. ' + MSG_MIGRACION);
    } else {
      logAuditEvent('Configuraciones', 'Serie de Consecutivo Eliminada', {
        serie: s.serie,
        datos: {
          serie: s.serie, entidad: s.entidad, sentido: s.sentido, moneda: s.moneda, prefijo: s.prefijo,
          formato_anio: s.formatoAnio, separador: s.separador, digitos: s.digitos, reinicio: s.reinicio,
          vista_previa: vistaPreviaConsecutivo(s),
        },
      });
      notificar.exito('Serie ' + s.serie + ' eliminada.');
      await load();
    }
    setEliminando(null);
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
        <div className="flex-1">
          <p className="text-xs font-semibold text-[var(--color-text-faint)]">Configuración</p>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Formato de Consecutivo</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl">
            Código que la base de datos asigna a cada conciliación con monto a pagar o a cobrar. Negocios y Mensajeros tienen
            una serie propia para cada combinación de Por Pagar / Por Cobrar y moneda; Planificaciones tiene una por moneda.
            Se usa para hacer el match contra caja y en el nombre del PDF.
          </p>
        </div>
        {canWrite && (
          <Button variant="brand" className="gap-2 shrink-0 self-start" onClick={abrirNueva}>
            <Plus size={16} /> Agregar serie
          </Button>
        )}
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
                <tr><td colSpan={8} className="p-10">
                  <div className="flex flex-col items-center text-center gap-2">
                    <Hash className="w-10 h-10 text-[var(--color-text-faint)]" />
                    <p className="text-sm font-semibold text-[var(--color-text)]">Sin series de consecutivo configuradas</p>
                    <p className="text-xs text-[var(--color-text-muted)] max-w-md">Mientras no exista la serie, la base de datos usa el formato por defecto (prefijo = clave, año de 2 dígitos, 4 dígitos).</p>
                  </div>
                </td></tr>
              ) : series.map((s, i) => {
                const d = drafts[s.serie];
                const set = (patch: Partial<Draft>) => setDrafts(prev => ({ ...prev, [s.serie]: { ...d, ...patch } }));
                const cambiado = d.prefijo !== s.prefijo || d.formatoAnio !== s.formatoAnio || d.separador !== s.separador || d.digitos !== s.digitos || d.reinicio !== s.reinicio;
                const err = validar(d, series.filter(o => o.serie !== s.serie));
                const encabezado = i === 0 || series[i - 1].entidad !== s.entidad;
                return (
                  <React.Fragment key={s.serie}>
                  {encabezado && (
                    <tr className="bg-[var(--color-surface-2)]">
                      <td colSpan={8} className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                        {etiquetaEntidad(s.entidad)}
                      </td>
                    </tr>
                  )}
                  <tr className="h-11 align-top">
                    <td className="p-3">
                      <span className="block font-semibold text-[var(--color-text)]">{s.entidad === 'planificaciones' ? '—' : s.sentido === 'pagar' ? 'Por Pagar' : 'Por Cobrar'} · {s.moneda}</span>
                      <span className="text-[11px] text-[var(--color-text-faint)]">{etiquetaEntidad(s.entidad)} · <span className="font-mono">{s.serie}</span></span>
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
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" className="gap-1.5" disabled={!cambiado || !!err || guardando === s.serie} onClick={() => guardar(s)}>
                            {guardando === s.serie ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar
                          </Button>
                          <button
                            type="button"
                            aria-label={`Eliminar serie ${s.serie}`}
                            title={`Eliminar serie ${s.serie}`}
                            disabled={eliminando === s.serie}
                            onClick={() => eliminar(s)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] transition-colors disabled:opacity-50"
                          >
                            {eliminando === s.serie ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SlideOver
        isOpen={nuevaAbierta}
        onClose={() => { if (!creando) setNuevaAbierta(false); }}
        title="Agregar serie de consecutivo"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={creando} onClick={() => setNuevaAbierta(false)}>Cancelar</Button>
            <Button variant="brand" className="gap-2" disabled={!!errNueva || creando} onClick={crear}>
              {creando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar serie
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Entidad<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
            <select value={nueva.entidad} onChange={(e) => setNuevaCombinacion({ entidad: e.target.value as Entidad })} className={cn(fieldCls, 'h-10')}>
              {ENTIDADES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Sentido<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
            {nueva.entidad === 'planificaciones' ? (
              <input disabled value="—" className={cn(fieldCls, 'h-10')} aria-label="Sentido" />
            ) : (
              <select value={nueva.sentido} onChange={(e) => setNuevaCombinacion({ sentido: e.target.value as Sentido })} className={cn(fieldCls, 'h-10')}>
                <option value="pagar">Por Pagar</option>
                <option value="cobrar">Por Cobrar</option>
              </select>
            )}
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Moneda<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
            <select value={nueva.moneda} onChange={(e) => setNuevaCombinacion({ moneda: e.target.value as Moneda })} className={cn(fieldCls, 'h-10')}>
              <option value="CUP">CUP</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2">
          <span className="text-[var(--color-text-muted)]">Clave de la serie (fija, lleva el contador)</span>
          <span className="font-mono font-semibold text-[var(--color-text)]">{claveNueva}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Prefijo<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
            <input value={nueva.prefijo} onChange={(e) => { setPrefijoTocado(true); setNueva(prev => ({ ...prev, prefijo: e.target.value.toUpperCase().trim() })); }} className={cn(fieldCls, 'h-10 font-mono uppercase')} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Año</span>
            <select value={nueva.formatoAnio} onChange={(e) => {
              const formatoAnio = e.target.value as FormatoAnio;
              setNueva(prev => ({ ...prev, formatoAnio, ...(formatoAnio === 'ninguno' ? { reinicio: 'nunca' as Reinicio } : {}) }));
            }} className={cn(fieldCls, 'h-10')}>
              <option value="AA">2 dígitos (26)</option>
              <option value="AAAA">4 dígitos (2026)</option>
              <option value="ninguno">Sin año</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Separador</span>
            <select value={nueva.separador} onChange={(e) => setNueva(prev => ({ ...prev, separador: e.target.value }))} className={cn(fieldCls, 'h-10')}>
              {SEPARADORES.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Dígitos</span>
            <input type="number" min={1} max={10} value={nueva.digitos} onChange={(e) => setNueva(prev => ({ ...prev, digitos: Number(e.target.value) }))} className={cn(fieldCls, 'h-10 text-right tabular-nums')} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Reinicio</span>
            <select disabled={nueva.formatoAnio === 'ninguno'} value={nueva.reinicio} onChange={(e) => setNueva(prev => ({ ...prev, reinicio: e.target.value as Reinicio }))} className={cn(fieldCls, 'h-10')}>
              <option value="anual">Cada año</option>
              <option value="nunca">Nunca</option>
            </select>
          </label>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">Vista previa</span>
            <span className="h-10 flex items-center font-mono text-sm font-semibold text-[var(--color-text)]">{vistaPreviaConsecutivo(nueva)}</span>
          </div>
        </div>

        {errNueva && <p className="text-xs font-medium text-[var(--color-danger)]">{errNueva}</p>}
      </SlideOver>
    </div>
  );
}
