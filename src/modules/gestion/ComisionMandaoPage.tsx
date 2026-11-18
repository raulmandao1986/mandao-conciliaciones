import React, { useState, useEffect } from 'react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { Percent, Loader2, Save, Building2, Users, Package, CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { formatCurrency } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { notificar, confirmar } from '../../lib/notificaciones';

type Entidad = 'businesses' | 'messengers';
type Moneda = 'CUP' | 'USD';
// Comisión por entidad y moneda (2026-11-16). La de USD se aplica a las órdenes
// pagadas con métodos en USD; si no existe, esas órdenes usan la de CUP.
interface CommissionRecord {
  entityType: Entidad;
  currency: Moneda;
  percentage: number;
  updatedAt: string | null;
}
const ENTIDAD_LABEL: Record<Entidad, string> = { businesses: 'Negocios', messengers: 'Mensajeros' };

interface AvailabilityDiscountRecord {
  percentage: number;
  updatedAt: string | null;
}

interface BackpackRateRecord {
  backpackType: 'Pequeña' | 'Grande';
  rate: number;
  updatedAt: string | null;
}

// Comisión que retiene Mandao por cada orden, usada por Conciliación para
// calcular CxC (Efectivo) / CxP (Transfermóvil, Saldo Mandao, Tarjeta) —
// ver Instrucciones Conciliaciones Mandao.md secciones 6.5 y 7.5. Antes
// de esta página el 20% de Negocios estaba fijo en el código; ahora es
// editable aquí para ambas entidades (Conciliación siempre lee el valor
// vigente). Negocios inicia en 20%, Mensajeros en 10% (confirmado por el
// usuario 2026-09-30). La tarifa de Alquiler de Mochila (por tipo,
// Pequeña/Grande — sección 7.4) vive en este mismo submódulo y alimenta
// `conciliaciones_messengers.alquiler_mochila`.
export function ComisionMandaoPage() {
  const { user } = useAuth();
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [records, setRecords] = useState<CommissionRecord[]>([]);
  // false = falta la migración 2026-11-16 (sin columna currency): solo CUP.
  const [conMoneda, setConMoneda] = useState(true);
  const [agregando, setAgregando] = useState(false);
  const [backpackRates, setBackpackRates] = useState<Record<'Pequeña' | 'Grande', BackpackRateRecord | null>>({
    'Pequeña': null,
    'Grande': null,
  });
  const [availabilityDiscount, setAvailabilityDiscount] = useState<AvailabilityDiscountRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [commissionRes, backpackRes, discountRes] = await Promise.all([
      supabase.from('commission_settings').select('entity_type, currency, percentage, updated_at'),
      supabase.from('backpack_rental_rates').select('backpack_type, rate, updated_at'),
      supabase.from('availability_discount_settings').select('percentage, updated_at').eq('entity_type', 'messengers').maybeSingle(),
    ]);
    if (discountRes.error) {
      console.error('Error fetching availability_discount_settings:', discountRes.error.message);
      setAvailabilityDiscount(null);
    } else {
      setAvailabilityDiscount(discountRes.data
        ? { percentage: Number(discountRes.data.percentage), updatedAt: discountRes.data.updated_at }
        : null);
    }
    let comisiones: any = commissionRes;
    const sinMoneda = !!commissionRes.error && /currency/.test(commissionRes.error.message || '');
    if (sinMoneda) comisiones = await supabase.from('commission_settings').select('entity_type, percentage, updated_at');
    setConMoneda(!sinMoneda);
    if (comisiones.error) {
      console.error('Error fetching commission_settings:', comisiones.error.message);
    } else {
      const orden = (r: CommissionRecord) => `${r.entityType}|${r.currency === 'CUP' ? 0 : 1}`;
      setRecords((comisiones.data || []).map((r: any) => ({
        entityType: r.entity_type,
        currency: r.currency === 'USD' ? 'USD' : 'CUP',
        percentage: Number(r.percentage),
        updatedAt: r.updated_at,
      } as CommissionRecord)).sort((a: CommissionRecord, b: CommissionRecord) => orden(a).localeCompare(orden(b))));
    }
    if (backpackRes.error) {
      console.error('Error fetching backpack_rental_rates:', backpackRes.error.message);
    } else {
      const next: Record<'Pequeña' | 'Grande', BackpackRateRecord | null> = { 'Pequeña': null, 'Grande': null };
      (backpackRes.data || []).forEach((r: any) => {
        next[r.backpack_type as 'Pequeña' | 'Grande'] = {
          backpackType: r.backpack_type,
          rate: Number(r.rate),
          updatedAt: r.updated_at,
        };
      });
      setBackpackRates(next);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
          <Percent className="w-6 h-6 text-brand-ink" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Comisión Mandao</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Porcentaje que retiene Mandao por cada orden. La Conciliación lo usa para calcular Cuentas por
            Cobrar (Efectivo) y Cuentas por Pagar (Transfermóvil, Saldo Mandao, Tarjeta). La comisión en USD
            se aplica a las órdenes pagadas con métodos en USD; si no se define, se usa la de CUP.
          </p>
        </div>
      </div>

      <div className="space-y-3 max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
            <Percent size={16} className="text-[var(--color-primary)]" />
            Comisiones
          </h2>
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!conMoneda || records.length >= 4}
              title={!conMoneda ? 'Falta correr la migración 2026-11-16_comision_por_moneda.sql' : records.length >= 4 ? 'Ya están definidas todas las combinaciones' : 'Agregar comisión'}
              onClick={() => setAgregando(true)}
            >
              <Plus size={14} /> Agregar comisión
            </Button>
          )}
        </div>
        {!conMoneda && (
          <p className="text-xs text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-amber-200 rounded-[var(--radius-sm)] p-2">
            Para agregar comisiones por moneda falta correr en Supabase la migración 2026-11-16_comision_por_moneda.sql.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {records.map(r => (
            <React.Fragment key={`${r.entityType}|${r.currency}`}>
              <CommissionCard
                icon={r.entityType === 'businesses' ? Building2 : Users}
                label={`${ENTIDAD_LABEL[r.entityType]} · ${r.currency}`}
                record={r}
                conMoneda={conMoneda}
                canWrite={canWrite}
                onSaved={load}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
      {agregando && (
        <NuevaComisionDialog
          existentes={records}
          onCerrar={() => setAgregando(false)}
          onGuardada={async () => { setAgregando(false); await load(); }}
        />
      )}

      <div className="space-y-3 max-w-3xl">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
            <Package size={16} className="text-[var(--color-primary)]" />
            Alquiler de Mochila (Mensajeros)
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Tarifa fija por tipo de mochila, descontada del Total por Pagar en cada Conciliación de Mensajero
            (columna `alquiler_mochila`, ver Instrucciones sección 7.4).
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BackpackRateCard label="Pequeña" record={backpackRates['Pequeña']} canWrite={canWrite} onSaved={load} />
          <BackpackRateCard label="Grande" record={backpackRates['Grande']} canWrite={canWrite} onSaved={load} />
        </div>
      </div>

      <div className="space-y-3 max-w-3xl">
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
            <CalendarClock size={16} className="text-[var(--color-primary)]" />
            Descuento de Disponibilidad (Mensajeros)
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Porcentaje que se descuenta de las Disponibilidades del mensajero en cada Conciliación de Mensajero.
            La conciliación muestra y suma a Total por Pagar el monto ya descontado.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AvailabilityDiscountCard record={availabilityDiscount} canWrite={canWrite} onSaved={load} />
        </div>
      </div>
    </div>
  );
}

function CommissionCard({
  icon: Icon, label, record, conMoneda, canWrite, onSaved, note
}: {
  icon: React.ElementType;
  label: string;
  record: CommissionRecord | null;
  conMoneda: boolean;
  canWrite: boolean;
  onSaved: () => Promise<void>;
  note?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draftPercentage, setDraftPercentage] = useState(record?.percentage ?? 20);
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setDraftPercentage(record?.percentage ?? 20);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!record) return;
    if (draftPercentage < 0 || draftPercentage > 100) {
      notificar('El porcentaje debe estar entre 0 y 100.');
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      let q = supabase
        .from('commission_settings')
        .update({
          percentage: draftPercentage,
          updated_at: new Date().toISOString(),
          updated_by: userData?.user?.id || null
        })
        .eq('entity_type', record.entityType);
      if (conMoneda) q = q.eq('currency', record.currency);
      const { error } = await q;
      if (error) throw error;
      await logAuditEvent('Configuraciones', `Comisión Mandao (${label}) Actualizada`, {
        porcentajeAnterior: record.percentage,
        porcentajeNuevo: draftPercentage
      });
      setEditing(false);
      await onSaved();
    } catch (err: any) {
      console.error('Error saving commission:', err);
      notificar('Error al guardar la comisión. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async () => {
    if (!record) return;
    const ok = await confirmar(`Se eliminará la comisión ${label} (${record.percentage.toFixed(2)}%). Las órdenes en USD volverán a usar la comisión en CUP en las conciliaciones nuevas.`, { titulo: '¿Eliminar comisión?', textoConfirmar: 'Eliminar' });
    if (!ok) return;
    const { error } = await supabase.from('commission_settings').delete().eq('entity_type', record.entityType).eq('currency', record.currency);
    if (error) { notificar.error('No se pudo eliminar la comisión: ' + error.message); return; }
    await logAuditEvent('Configuraciones', 'Comisión Mandao Eliminada', { comision: label, porcentaje: record.percentage });
    notificar.exito(`Comisión ${label} eliminada.`);
    await onSaved();
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <Icon size={16} className="text-[var(--color-primary)]" />
        {label}
        {canWrite && record?.currency === 'USD' && !editing && (
          <button
            type="button"
            onClick={() => { void handleEliminar(); }}
            aria-label={`Eliminar comisión ${label}`}
            title="Eliminar comisión"
            className="ml-auto p-1 rounded text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[var(--color-text)]">Porcentaje de Comisión (%)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={draftPercentage}
              onChange={(e) => setDraftPercentage(Number(e.target.value))}
              className="h-11 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-lg font-mono font-bold outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            />
            <span className="text-[10px] text-[var(--color-text-faint)]">
              Efectivo: se cobra este % (CxC). Transfermóvil/Saldo Mandao/Tarjeta: se paga el {(100 - draftPercentage).toFixed(2)}% restante (CxP).
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-black text-[var(--color-text)] font-mono">{record?.percentage.toFixed(2) ?? '—'}%</span>
            <p className="text-xs text-[var(--color-text-faint)] mt-1">
              {record?.updatedAt ? `Actualizado: ${new Date(record.updatedAt).toLocaleString('es-VE')}` : 'Sin actualizar'}
            </p>
          </div>
          {canWrite && (
            <Button variant="outline" onClick={handleEdit}>Editar</Button>
          )}
        </div>
      )}

      {note && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">{note}</p>
      )}
    </div>
  );
}

function AvailabilityDiscountCard({
  record, canWrite, onSaved
}: {
  record: AvailabilityDiscountRecord | null;
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(record?.percentage ?? 0);
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setDraft(record?.percentage ?? 0);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!record) return;
    if (!(draft >= 0 && draft <= 100)) {
      notificar('El porcentaje debe estar entre 0 y 100.');
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('availability_discount_settings')
        .update({
          percentage: draft,
          updated_at: new Date().toISOString(),
          updated_by: userData?.user?.id || null
        })
        .eq('entity_type', 'messengers');
      if (error) throw error;
      await logAuditEvent('Configuraciones', 'Descuento de Disponibilidad (Mensajeros) Actualizado', {
        porcentajeAnterior: record.percentage,
        porcentajeNuevo: draft
      });
      setEditing(false);
      await onSaved();
    } catch (err: any) {
      console.error('Error saving availability discount:', err);
      notificar('Error al guardar el descuento. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Ejemplo con 1.000 CUP para que el efecto del % sea evidente al editar.
  const ejemplo = (pct: number) => formatCurrency(1000 * (1 - pct / 100), 'CUP');

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <CalendarClock size={16} className="text-[var(--color-primary)]" />
        Disponibilidad
      </div>

      {!record ? (
        <p className="text-xs text-[var(--color-danger)] font-medium">
          No se pudo cargar el descuento. Verifique que la migración 2026-10-01b_descuento_disponibilidad_mensajeros.sql se haya ejecutado.
        </p>
      ) : editing ? (
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[var(--color-text)]">Porcentaje de Descuento (%)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={draft}
              onChange={(e) => setDraft(Number(e.target.value))}
              className="h-11 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-lg font-mono font-bold outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            />
            <span className="text-[10px] text-[var(--color-text-faint)]">
              Ej.: una Disponibilidad de {formatCurrency(1000, 'CUP')} se paga como {ejemplo(draft)}.
            </span>
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-3xl font-black text-[var(--color-text)] font-mono">{record.percentage.toFixed(2)}%</span>
            <p className="text-xs text-[var(--color-text-faint)] mt-1">
              {record.updatedAt ? `Actualizado: ${new Date(record.updatedAt).toLocaleString('es-VE')}` : 'Sin actualizar'}
            </p>
          </div>
          {canWrite && (
            <Button variant="outline" onClick={handleEdit}>Editar</Button>
          )}
        </div>
      )}
    </div>
  );
}

function BackpackRateCard({
  label, record, canWrite, onSaved
}: {
  label: 'Pequeña' | 'Grande';
  record: BackpackRateRecord | null;
  canWrite: boolean;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftRate, setDraftRate] = useState(record?.rate ?? 0);
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setDraftRate(record?.rate ?? 0);
    setEditing(true);
  };

  const handleSave = async () => {
    if (draftRate < 0) {
      notificar('La tarifa no puede ser negativa.');
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('backpack_rental_rates')
        .update({
          rate: draftRate,
          updated_at: new Date().toISOString(),
          updated_by: userData?.user?.id || null
        })
        .eq('backpack_type', label);
      if (error) throw error;
      await logAuditEvent('Configuraciones', `Alquiler de Mochila (${label}) Actualizado`, {
        tarifaAnterior: record?.rate,
        tarifaNueva: draftRate
      });
      setEditing(false);
      await onSaved();
    } catch (err: any) {
      console.error('Error saving backpack rate:', err);
      notificar('Error al guardar la tarifa. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <Package size={16} className="text-[var(--color-primary)]" />
        Mochila {label}
      </div>

      {editing ? (
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-[var(--color-text)]">Tarifa de Alquiler (CUP)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={draftRate}
              onChange={(e) => setDraftRate(Number(e.target.value))}
              className="h-11 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-lg font-mono font-bold outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            />
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-3xl font-black text-[var(--color-text)] font-mono">{record ? formatCurrency(record.rate, 'CUP') : '—'}</span>
            <p className="text-xs text-[var(--color-text-faint)] mt-1">
              {record?.updatedAt ? `Actualizado: ${new Date(record.updatedAt).toLocaleString('es-VE')}` : 'Sin actualizar'}
            </p>
          </div>
          {canWrite && (
            <Button variant="outline" onClick={handleEdit}>Editar</Button>
          )}
        </div>
      )}
    </div>
  );
}

function NuevaComisionDialog({ existentes, onCerrar, onGuardada }: {
  existentes: CommissionRecord[];
  onCerrar: () => void;
  onGuardada: () => Promise<void>;
}) {
  const libres = (['businesses', 'messengers'] as Entidad[]).flatMap(e => (['CUP', 'USD'] as Moneda[]).map(m => ({ e, m })))
    .filter(x => !existentes.some(r => r.entityType === x.e && r.currency === x.m));
  const [entidad, setEntidad] = useState<Entidad>(libres[0]?.e || 'businesses');
  const [moneda, setMoneda] = useState<Moneda>(libres.find(x => x.e === (libres[0]?.e || 'businesses'))?.m || 'USD');
  const [porcentaje, setPorcentaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const yaExiste = existentes.some(r => r.entityType === entidad && r.currency === moneda);
  const pct = Number(porcentaje);
  const errPct = porcentaje === '' ? null : !(pct >= 0 && pct <= 100) ? 'El porcentaje debe estar entre 0 y 100.' : null;

  const guardar = async () => {
    if (yaExiste || errPct || porcentaje === '') return;
    setGuardando(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('commission_settings').insert({
      entity_type: entidad, currency: moneda, percentage: pct,
      updated_at: new Date().toISOString(), updated_by: userData?.user?.id || null,
    });
    setGuardando(false);
    if (error) { notificar.error('No se pudo agregar la comisión: ' + error.message); return; }
    await logAuditEvent('Configuraciones', 'Comisión Mandao Agregada', { datos: { 'Aplica a': ENTIDAD_LABEL[entidad], 'Moneda': moneda, 'Porcentaje': `${pct}%` } });
    notificar.exito(`Comisión ${ENTIDAD_LABEL[entidad]} · ${moneda} agregada (${pct}%).`);
    await onGuardada();
  };

  const campo = 'h-10 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20';
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onCerrar} />
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-nueva-comision" className="relative bg-[var(--color-surface)] rounded-[var(--radius-md)] shadow-xl border border-[var(--color-border)] p-6 w-full max-w-sm space-y-4">
        <h2 id="titulo-nueva-comision" className="text-base font-bold text-[var(--color-text)]">Agregar comisión</h2>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Aplica a<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
          <select value={entidad} onChange={(e) => setEntidad(e.target.value as Entidad)} className={campo}>
            <option value="businesses">Negocios</option>
            <option value="messengers">Mensajeros</option>
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Moneda<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} className={campo}>
            <option value="CUP">CUP</option>
            <option value="USD">USD</option>
          </select>
          {yaExiste
            ? <span className="text-xs font-medium text-[var(--color-danger)]">Ya existe la comisión {ENTIDAD_LABEL[entidad]} · {moneda}: edítela en su tarjeta.</span>
            : <span className="text-xs text-[var(--color-text-muted)]">{moneda === 'USD' ? 'Se aplica a las órdenes pagadas con métodos en USD.' : 'Se aplica a las órdenes pagadas con métodos en CUP.'}</span>}
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text)]">Porcentaje (%)<span className="text-[var(--color-danger)] ml-0.5">*</span></span>
          <input type="number" step="0.01" min="0" max="100" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={cn(campo, 'text-right tabular-nums')} placeholder="Ej. 15" />
          {errPct && <span className="text-xs font-medium text-[var(--color-danger)]">{errPct}</span>}
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button variant="brand" className="gap-2" disabled={guardando || yaExiste || !!errPct || porcentaje === ''} onClick={() => { void guardar(); }}>
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar
          </Button>
        </div>
      </div>
    </div>
  );
}
