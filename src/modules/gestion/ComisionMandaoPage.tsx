import React, { useState, useEffect } from 'react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { Percent, Loader2, Save, Building2, Users, Package, CalendarClock } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { formatCurrency } from '../../lib/formatters';

interface CommissionRecord {
  entityType: 'businesses' | 'messengers';
  percentage: number;
  updatedAt: string | null;
}

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

  const [records, setRecords] = useState<Record<'businesses' | 'messengers', CommissionRecord | null>>({
    businesses: null,
    messengers: null,
  });
  const [backpackRates, setBackpackRates] = useState<Record<'Pequeña' | 'Grande', BackpackRateRecord | null>>({
    'Pequeña': null,
    'Grande': null,
  });
  const [availabilityDiscount, setAvailabilityDiscount] = useState<AvailabilityDiscountRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [commissionRes, backpackRes, discountRes] = await Promise.all([
      supabase.from('commission_settings').select('entity_type, percentage, updated_at'),
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
    if (commissionRes.error) {
      console.error('Error fetching commission_settings:', commissionRes.error.message);
    } else {
      const next: Record<'businesses' | 'messengers', CommissionRecord | null> = { businesses: null, messengers: null };
      (commissionRes.data || []).forEach((r: any) => {
        next[r.entity_type as 'businesses' | 'messengers'] = {
          entityType: r.entity_type,
          percentage: Number(r.percentage),
          updatedAt: r.updated_at,
        };
      });
      setRecords(next);
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
            Cobrar (Efectivo) y Cuentas por Pagar (Transfermóvil, Saldo Mandao, Tarjeta).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
        <CommissionCard
          icon={Building2}
          label="Negocios"
          record={records.businesses}
          canWrite={canWrite}
          onSaved={load}
        />
        <CommissionCard
          icon={Users}
          label="Mensajeros"
          record={records.messengers}
          canWrite={canWrite}
          onSaved={load}
        />
      </div>

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
  icon: Icon, label, record, canWrite, onSaved, note
}: {
  icon: React.ElementType;
  label: string;
  record: CommissionRecord | null;
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
      alert('El porcentaje debe estar entre 0 y 100.');
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('commission_settings')
        .update({
          percentage: draftPercentage,
          updated_at: new Date().toISOString(),
          updated_by: userData?.user?.id || null
        })
        .eq('entity_type', record.entityType);
      if (error) throw error;
      await logAuditEvent('Configuraciones', `Comisión Mandao (${label}) Actualizada`, {
        porcentajeAnterior: record.percentage,
        porcentajeNuevo: draftPercentage
      });
      setEditing(false);
      await onSaved();
    } catch (err: any) {
      console.error('Error saving commission:', err);
      alert('Error al guardar la comisión. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)]">
        <Icon size={16} className="text-[var(--color-primary)]" />
        {label}
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
            <span className="text-3xl font-black text-[var(--color-text)] font-mono">{record?.percentage.toFixed(2) ?? '—'}%</span>
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
      alert('El porcentaje debe estar entre 0 y 100.');
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
      alert('Error al guardar el descuento. Detalle: ' + (err?.message || err));
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
      alert('La tarifa no puede ser negativa.');
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
      alert('Error al guardar la tarifa. Detalle: ' + (err?.message || err));
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
