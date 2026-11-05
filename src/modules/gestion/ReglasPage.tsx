import React, { useState, useMemo, useEffect } from 'react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { ListChecks, Plus, Edit2, Trash2, Loader2, Save, Search, AlertTriangle, RefreshCw, Store as StoreIcon } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { DataTable } from '../../design-system/patterns/DataTable';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';
import { cn } from '../../lib/utils';
import {
  ORDER_COLUMNS,
  RULE_COLUMN_KEYS,
  ACTIONS,
  ALL_STORES_LABEL,
  RULE_SELECT,
  mapRuleRow,
  normalizeStore,
  describeCondition,
  type DispatcherRule,
  type RuleActor,
  type RuleAction,
  type RuleColumn,
  type RuleColumnEntry,
} from '../../lib/dispatcherRules';

const inputCls = 'h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)]';

interface FormState {
  nombre: string;
  todosLosNegocios: boolean;
  cuandoVacias: RuleColumn[];
  store: string;
  descripcion: string;
  columnas: RuleColumnEntry[];
  activo: boolean;
}

const emptyForm = (): FormState => ({
  nombre: '',
  todosLosNegocios: false,
  cuandoVacias: [],
  store: '',
  descripcion: '',
  columnas: [],
  activo: true,
});

// Configuración -> Reglas: por cada Store (o para todos los negocios), y
// opcionalmente solo cuando ciertas columnas vienen vacías/0, qué columnas
// de la hoja "Orders" pueden venir vacías sin que la Verificación del
// Dispatcher frene la importación. Todas las excepciones (incluidas las
// iniciales Mandao Express y Recogida) se editan o eliminan desde aquí.
// Ver src/lib/dispatcherRules.ts.
export function ReglasPage({ actor }: { actor: RuleActor }) {
  const { user } = useAuth();
  // RLS "manage_dispatcher_rules" ya restringe la escritura a Super Admin.
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [data, setData] = useState<DispatcherRule[]>([]);
  const [storeNames, setStoreNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selected, setSelected] = useState<DispatcherRule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<DispatcherRule | null>(null);

  const actorLabel = actor === 'negocios' ? 'Negocios' : 'Mensajeros';
  // Todas las columnas exceptuables de "Orders", en ambos submódulos: una
  // regla de Negocios puede necesitar exceptuar una columna de entrega y
  // viceversa.
  const availableColumns = RULE_COLUMN_KEYS;
  const storeLabel = (r: DispatcherRule) => r.store ?? ALL_STORES_LABEL;

  const loadRules = async () => {
    setLoading(true);
    setLoadError(null);
    const [rulesRes, businessesRes] = await Promise.all([
      supabase.from('dispatcher_rules').select(RULE_SELECT).eq('actor', actor),
      supabase.from('businesses').select('name').order('name', { ascending: true }),
    ]);
    if (rulesRes.error) {
      setLoadError(rulesRes.error.message);
    } else {
      const rules = (rulesRes.data || []).map(mapRuleRow).sort((a, b) => a.nombre.localeCompare(b.nombre));
      setData(rules);
    }
    if (!businessesRes.error) {
      setStoreNames(Array.from(new Set((businessesRes.data || []).map((b: any) => b.name).filter(Boolean))));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRules();
  }, [actor]);

  const filteredData = useMemo(() => {
    const q = normalizeStore(searchQuery);
    return data.filter(r =>
      normalizeStore(r.nombre).includes(q) ||
      normalizeStore(storeLabel(r)).includes(q) ||
      r.columnas.some(c => normalizeStore(ORDER_COLUMNS[c.column]?.label).includes(q))
    );
  }, [data, searchQuery]);

  const handleNew = () => {
    setSelected(null);
    setForm(emptyForm());
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleEdit = (rule: DispatcherRule) => {
    setSelected(rule);
    setForm({
      nombre: rule.nombre,
      todosLosNegocios: rule.store === null,
      cuandoVacias: [...rule.cuandoVacias],
      store: rule.store ?? '',
      descripcion: rule.descripcion,
      columnas: rule.columnas.map(c => ({ ...c })),
      activo: rule.activo,
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  // Se guardan en el mismo orden que la hoja "Orders".
  const toggleColumna = (col: RuleColumn) => {
    setForm(p => {
      const exists = p.columnas.some(c => c.column === col);
      const next: RuleColumnEntry[] = exists
        ? p.columnas.filter(c => c.column !== col)
        : [...p.columnas, { column: col, action: 'permitir' }];
      next.sort((a, b) => availableColumns.indexOf(a.column) - availableColumns.indexOf(b.column));
      return { ...p, columnas: next };
    });
  };

  const setColumnaAction = (col: RuleColumn, action: RuleAction) => {
    setForm(p => ({ ...p, columnas: p.columnas.map(c => (c.column === col ? { ...c, action } : c)) }));
  };

  const toggleCondicion = (col: RuleColumn) => {
    setForm(p => ({
      ...p,
      cuandoVacias: p.cuandoVacias.includes(col) ? p.cuandoVacias.filter(c => c !== col) : [...p.cuandoVacias, col],
      // Una columna de la condición no puede ser a la vez columna permitida.
      columnas: p.cuandoVacias.includes(col) ? p.columnas : p.columnas.filter(c => c.column !== col),
    }));
  };

  const validate = (): string | null => {
    if (!form.nombre.trim()) return 'Indique un nombre para la regla.';
    if (!form.todosLosNegocios && !form.store.trim()) return 'Indique el nombre del Store o marque "Todos los negocios".';
    if (form.columnas.length === 0) return 'Agregue al menos una columna.';
    const circular = form.columnas.find(c => form.cuandoVacias.includes(c.column));
    if (circular) return `"${ORDER_COLUMNS[circular.column].label}" no puede ser a la vez condición y columna permitida.`;
    return null;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const err = validate();
    setFormError(err);
    if (err) return;

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        actor,
        name: form.nombre.trim(),
        when_empty: form.cuandoVacias,
        store: form.todosLosNegocios ? null : form.store.trim().replace(/\s+/g, ' '),
        description: form.descripcion.trim(),
        columns: form.columnas,
        active: form.activo,
        updated_at: new Date().toISOString(),
        updated_by: userData?.user?.id ?? null,
      };

      const { error } = selected
        ? await supabase.from('dispatcher_rules').update(payload).eq('rule_id', selected.id)
        : await supabase.from('dispatcher_rules').insert(payload);
      if (error) {
        throw error;
      }
      logAuditEvent('Configuraciones', selected ? 'Regla de Dispatcher actualizada' : 'Regla de Dispatcher creada', {
        actor,
        nombre: payload.name,
        aplicaA: describeCondition({ store: payload.store, cuandoVacias: payload.when_empty }),
        columnas: payload.columns.map(c => `${ORDER_COLUMNS[c.column].label}: ${ACTIONS[c.action].label}`),
        activo: payload.active,
      });
      setIsFormOpen(false);
      await loadRules();
    } catch (err: any) {
      setFormError('No se pudo guardar la regla: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!ruleToDelete) return;
    try {
      const { error } = await supabase.from('dispatcher_rules').delete().eq('rule_id', ruleToDelete.id);
      if (error) throw error;
      logAuditEvent('Configuraciones', 'Regla de Dispatcher eliminada', { actor, nombre: ruleToDelete.nombre, aplicaA: describeCondition(ruleToDelete) });
      await loadRules();
    } catch (err: any) {
      alert('Error al eliminar la regla. Detalle: ' + (err?.message || err));
    } finally {
      setRuleToDelete(null);
    }
  };

  const tableColumns: any[] = [
    {
      header: 'Regla',
      accessor: (r: DispatcherRule) => (
        <div className="flex flex-col">
          <span className="font-bold text-[var(--color-text)]">{r.nombre}</span>
          {r.descripcion && <span className="text-xs text-[var(--color-text-muted)]">{r.descripcion}</span>}
        </div>
      ),
    },
    {
      header: 'Aplica a',
      accessor: (r: DispatcherRule) => (
        <div className="flex flex-col">
          <span className={cn('text-sm text-[var(--color-text)]', r.store === null && 'italic')}>{storeLabel(r)}</span>
          {r.cuandoVacias.length > 0 && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Cuando estén vacías/0: {r.cuandoVacias.map(c => ORDER_COLUMNS[c]?.label || c).join(', ')}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Columnas que pueden venir vacías',
      accessor: (r: DispatcherRule) => (
        <div className="flex flex-wrap gap-1">
          {r.columnas.map(c => (
            <span
              key={c.column}
              title={ACTIONS[c.action].label}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-xs)] text-[11px] font-semibold border',
                c.action === 'permitir'
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-text)] border-[var(--color-border)]'
                  : 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning)]/30'
              )}
            >
              {c.action === 'advertencia' && <AlertTriangle size={11} />}
              {ORDER_COLUMNS[c.column]?.label || c.column}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Estado',
      accessor: (r: DispatcherRule) => <StatusBadge status={r.activo ? 'activo' : 'bloqueado'} />,
    },
    {
      header: 'Acciones',
      align: 'right',
      accessor: (r: DispatcherRule) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleEdit(r); }}
            title={canWrite ? 'Editar regla' : 'Ver detalles'}
            aria-label={canWrite ? 'Editar regla' : 'Ver detalles'}
            className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
          >
            <Edit2 size={16} />
          </button>
          {canWrite && (
            <button
              onClick={(e) => { e.stopPropagation(); setRuleToDelete(r); }}
              title="Eliminar regla"
              aria-label="Eliminar regla"
              className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--color-brand-subtle)] rounded-xl border border-[var(--color-brand-active-border)] shadow-sm">
            <ListChecks className="w-6 h-6 text-[var(--color-brand-ink)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Reglas - {actorLabel}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-3xl">
              La Verificación del Dispatcher exige valor en todas las columnas de "Orders". Aquí se indica, por Store
              o para todos los negocios, qué columnas pueden venir vacías sin frenar la importación. Todas las reglas,
              incluidas las iniciales del sistema, se pueden editar, desactivar o eliminar.
            </p>
          </div>
        </div>
        {canWrite && (
          <Button variant="brand" className="gap-2" onClick={handleNew}>
            <Plus size={18} />
            Nueva Regla
          </Button>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar por regla, Store o columna..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
            />
          </div>
          <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums">{filteredData.length} reglas</span>
        </div>

        {loadError ? (
          <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-[var(--color-danger)]" />
            <h3 className="text-base font-semibold text-[var(--color-text)]">No se pudieron cargar las reglas</h3>
            <p className="text-sm text-[var(--color-text-muted)] max-w-md">{loadError}</p>
            <Button variant="outline" className="gap-2" onClick={loadRules}>
              <RefreshCw size={16} /> Reintentar
            </Button>
          </div>
        ) : (
          <>
            <DataTable<DispatcherRule>
              columns={tableColumns}
              data={filteredData}
              isLoading={loading}
              searchQuery=""
              onSearchChange={() => {}}
            />
            {!loading && filteredData.length === 0 && (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <ListChecks className="w-10 h-10 text-[var(--color-text-faint)] mb-4" />
                <h3 className="text-base font-semibold text-[var(--color-text)]">Sin reglas registradas para {actorLabel}</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-sm">
                  Cree una regla cuando un Store registre órdenes con columnas vacías de forma legítima.
                </p>
                {canWrite && (
                  <Button variant="outline" className="gap-2 mt-4" onClick={handleNew}>
                    <Plus size={16} /> Nueva Regla
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selected ? (canWrite ? 'Editar Regla' : 'Detalle de Regla') : `Nueva Regla - ${actorLabel}`}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>
              {canWrite ? 'Cancelar' : 'Cerrar'}
            </Button>
            {canWrite && (
              <Button variant="brand" className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
                Guardar Regla
              </Button>
            )}
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-6">
          <fieldset disabled={!canWrite} className="space-y-6">
            <div className="space-y-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[var(--color-text)]">
                  Nombre de la regla<span className="text-[var(--color-danger)] ml-0.5">*</span>
                </span>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej. Mandao Express, Recogida en el establecimiento"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[var(--color-text)]">
                  Store<span className="text-[var(--color-danger)] ml-0.5">*</span>
                </span>
                <div className="relative">
                  <StoreIcon className="absolute left-3 top-3 h-4 w-4 text-[var(--color-text-faint)]" />
                  <input
                    type="text"
                    list="reglas-store-names"
                    value={form.todosLosNegocios ? '' : form.store}
                    disabled={form.todosLosNegocios}
                    onChange={(e) => setForm(p => ({ ...p, store: e.target.value }))}
                    placeholder={form.todosLosNegocios ? ALL_STORES_LABEL : 'Nombre exacto del Store en el Dispatcher'}
                    className={cn(inputCls, 'w-full pl-9')}
                  />
                  <datalist id="reglas-store-names">
                    {storeNames.map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">
                  Puede elegir un negocio registrado o escribir un nombre nuevo. Se compara con la columna "Store" sin distinguir mayúsculas ni tildes.
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.todosLosNegocios}
                  onChange={(e) => setForm(p => ({ ...p, todosLosNegocios: e.target.checked }))}
                  className="w-4 h-4 rounded text-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-text)]">Aplica a todos los negocios</span>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[var(--color-text)]">Descripción</span>
                <textarea
                  rows={2}
                  value={form.descripcion}
                  onChange={(e) => setForm(p => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Por qué este Store registra las órdenes de esta forma..."
                  className="p-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all resize-none"
                />
              </label>
            </div>

            <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
              <div>
                <span className="text-sm font-medium text-[var(--color-text)] block">Condición (opcional)</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  La regla solo aplica a las órdenes donde TODAS las columnas marcadas vienen vacías o en 0.
                  Ej.: Recogida en el establecimiento = los 4 cargos de entrega vacíos. Sin marcar, aplica siempre.
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RULE_COLUMN_KEYS.map(col => {
                  const on = form.cuandoVacias.includes(col);
                  return (
                    <button
                      key={col}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCondicion(col)}
                      className={cn(
                        'h-8 px-2.5 rounded-[var(--radius-xs)] border text-xs font-medium transition-colors',
                        on
                          ? 'bg-[var(--color-info-bg)] border-[var(--color-info)] text-[var(--color-info)]'
                          : 'bg-white border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]'
                      )}
                    >
                      {ORDER_COLUMNS[col].label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
              <span className="text-sm font-medium text-[var(--color-text)] block">
                Columnas que pueden venir vacías<span className="text-[var(--color-danger)] ml-0.5">*</span>
              </span>
              <span className="text-xs text-[var(--color-text-muted)] block -mt-1 tabular-nums">
                {form.columnas.length} de {availableColumns.length} columnas seleccionadas
              </span>
              {/* Las 17 columnas a la vista (sin desplegable): se marca la columna y al lado se elige el resultado. */}
              <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] divide-y divide-[var(--color-border)]">
                {availableColumns.map(col => {
                  const entry = form.columnas.find(c => c.column === col);
                  const isCondition = form.cuandoVacias.includes(col);
                  return (
                    <div
                      key={col}
                      className={cn('grid grid-cols-[1fr_11rem] gap-3 items-center h-11 px-3', entry && 'bg-teal-50')}
                    >
                      <label className={cn('flex items-center gap-3 cursor-pointer', isCondition && 'cursor-not-allowed opacity-50')}>
                        <input
                          type="checkbox"
                          checked={!!entry}
                          disabled={isCondition}
                          onChange={() => toggleColumna(col)}
                          className="w-4 h-4 rounded text-[var(--color-primary)]"
                        />
                        <span className="text-sm text-[var(--color-text)]">{ORDER_COLUMNS[col].label}</span>
                        {isCondition && <span className="text-[11px] text-[var(--color-text-faint)]">(usada en la condición)</span>}
                      </label>
                      <select
                        aria-label={`Resultado para ${ORDER_COLUMNS[col].label}`}
                        value={entry?.action ?? 'permitir'}
                        disabled={!entry}
                        onChange={(e) => setColumnaAction(col, e.target.value as RuleAction)}
                        className={cn(inputCls, 'h-9')}
                      >
                        {(Object.keys(ACTIONS) as RuleAction[]).map(a => <option key={a} value={a}>{ACTIONS[a].label}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                <strong>{ACTIONS.permitir.label}:</strong> {ACTIONS.permitir.hint} <strong>{ACTIONS.advertencia.label}:</strong> {ACTIONS.advertencia.hint}
              </p>
            </div>

            <label className="flex items-center gap-3 border-t border-[var(--color-border)] pt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={form.activo}
                onChange={(e) => setForm(p => ({ ...p, activo: e.target.checked }))}
                className="w-4 h-4 rounded text-[var(--color-primary)]"
              />
              <span className="text-sm font-medium text-[var(--color-text)]">Regla activa</span>
            </label>
          </fieldset>

          {formError && <p className="text-xs font-medium text-[var(--color-danger)]">{formError}</p>}
        </form>
      </SlideOver>

      <ConfirmDialog
        isOpen={!!ruleToDelete}
        title="¿Eliminar regla?"
        message={`La regla "${ruleToDelete?.nombre ?? ''}" dejará de aplicarse en la próxima Verificación. Si solo quiere suspenderla, márquela como inactiva.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setRuleToDelete(null)}
        isDanger={true}
      />
    </div>
  );
}
