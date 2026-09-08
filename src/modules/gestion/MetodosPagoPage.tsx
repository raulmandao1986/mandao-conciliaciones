import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { CreditCard, Plus, Edit2, Trash2, Loader2, Save, Search } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { DataTable } from '../../design-system/patterns/DataTable';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';

interface PaymentMethodRecord {
  id: string;
  nombre: string;
  descripcion: string;
  aplicaNegocios: boolean;
  aplicaMensajeros: boolean;
  aplicaOrdenes: boolean;
  estado: 'activo' | 'inactivo';
}

export function MetodosPagoPage({ type }: { type?: 'negocios' | 'mensajeros' | 'ordenes' }) {
  const { user } = useAuth();
  // RLS "manage_payment_methods" en Supabase ya restringe la escritura a
  // Super Admin a nivel de base de datos — este check es solo para la UI.
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [data, setData] = useState<PaymentMethodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    aplicaNegocios: true,
    aplicaMensajeros: true,
    aplicaOrdenes: true,
    estado: 'activo' as 'activo' | 'inactivo'
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [methodIdToDelete, setMethodIdToDelete] = useState<string | null>(null);

  const loadMethods = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('payment_methods')
      .select('payment_method_id, name, description, applies_to_businesses, applies_to_messengers, applies_to_orders, active')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching payment_methods:', error.message);
      setLoading(false);
      return;
    }
    const records: PaymentMethodRecord[] = (rows || []).map((m: any) => ({
      id: m.payment_method_id,
      nombre: m.name,
      descripcion: m.description || '',
      aplicaNegocios: m.applies_to_businesses,
      aplicaMensajeros: m.applies_to_messengers,
      aplicaOrdenes: m.applies_to_orders,
      estado: m.active ? 'activo' : 'inactivo'
    }));
    setData(records);
    setLoading(false);
  };

  useEffect(() => {
    loadMethods();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (type === 'negocios' && !item.aplicaNegocios) return false;
      if (type === 'mensajeros' && !item.aplicaMensajeros) return false;
      if (type === 'ordenes' && !item.aplicaOrdenes) return false;

      return item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.descripcion.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [data, searchQuery, type]);

  const handleEdit = (method: PaymentMethodRecord) => {
    setSelectedMethod(method);
    setFormData({
      nombre: method.nombre,
      descripcion: method.descripcion || '',
      aplicaNegocios: method.aplicaNegocios !== false,
      aplicaMensajeros: method.aplicaMensajeros !== false,
      aplicaOrdenes: method.aplicaOrdenes !== false,
      estado: method.estado || 'activo'
    });
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedMethod(null);
    setFormData({
      nombre: '',
      descripcion: '',
      aplicaNegocios: type === 'negocios' || !type,
      aplicaMensajeros: type === 'mensajeros' || !type,
      aplicaOrdenes: type === 'ordenes' || !type,
      estado: 'activo'
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.nombre) return;

    setSaving(true);
    try {
      const payload = {
        name: formData.nombre,
        description: formData.descripcion,
        applies_to_businesses: formData.aplicaNegocios,
        applies_to_messengers: formData.aplicaMensajeros,
        applies_to_orders: formData.aplicaOrdenes,
        active: formData.estado === 'activo',
        updated_at: new Date().toISOString()
      };

      if (selectedMethod) {
        const { error } = await supabase.from('payment_methods').update(payload).eq('payment_method_id', selectedMethod.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('payment_methods').insert(payload);
        if (error) throw error;
      }
      setIsFormOpen(false);
      await loadMethods();
    } catch (err: any) {
      console.error('Error saving payment method:', err);
      alert('Error al guardar el método de pago. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setMethodIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!methodIdToDelete) return;
    try {
      const { error } = await supabase.from('payment_methods').delete().eq('payment_method_id', methodIdToDelete);
      if (error) throw error;
      await loadMethods();
    } catch (err: any) {
      console.error('Error deleting payment method:', err);
      alert('Error al eliminar el método de pago. Detalle: ' + (err?.message || err));
    } finally {
      setDeleteConfirmOpen(false);
      setMethodIdToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  const pageTitle = type === 'negocios'
    ? 'Métodos de Pago - Negocios'
    : type === 'mensajeros'
      ? 'Métodos de Pago - Mensajeros'
      : type === 'ordenes'
        ? 'Métodos de Pago - Órdenes'
        : 'Métodos de Pago';

  const pageDesc = type === 'negocios'
    ? 'Defina los métodos y vías de cobro autorizados para los Negocios en Mandao.'
    : type === 'mensajeros'
      ? 'Defina las vías de liquidación y pago aplicadas a los Mensajeros (asociados a la columna Payment Type del Dispatcher).'
      : type === 'ordenes'
        ? 'Defina los métodos y vías de pago aplicados a las Órdenes en Mandao.'
        : 'Defina las vías y mecanismos de pago utilizados en las conciliaciones de Mandao.';

  const tableColumns: any[] = [
    {
      header: 'Método de Pago',
      accessor: (item: PaymentMethodRecord) => (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--color-brand)]" />
          <span className="font-bold text-[var(--color-text)]">{item.nombre}</span>
        </div>
      )
    }
  ];

  // Solo muestra la columna "Uso en Sub-sistemas" cuando no hay un `type` específico activo
  if (!type) {
    tableColumns.push({
      header: 'Uso en Sub-sistemas',
      accessor: (item: PaymentMethodRecord) => (
        <div className="flex items-center gap-3">
          {item.aplicaNegocios && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
              Negocios
            </span>
          )}
          {item.aplicaMensajeros && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              Mensajeros
            </span>
          )}
          {item.aplicaOrdenes && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
              Órdenes
            </span>
          )}
        </div>
      )
    });
  }

  tableColumns.push(
    {
      header: 'Cómo funciona (Lógica)',
      accessor: (item: PaymentMethodRecord) => <span className="text-sm text-[var(--color-text-muted)]">{item.descripcion || 'Sin descripción descriptiva'}</span>
    },
    {
      header: 'Estado',
      accessor: (item: PaymentMethodRecord) => <StatusBadge status={item.estado === 'activo' ? 'activo' : 'bloqueado'} />
    },
    {
      header: 'Acciones',
      accessor: (item: PaymentMethodRecord) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
            title={canWrite ? 'Editar Método' : 'Ver detalles'}
            className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
          >
            <Edit2 size={16} />
          </button>
          {canWrite && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteRequest(item.id); }}
              title="Eliminar Método"
              className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )
    }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--color-brand-subtle)] rounded-xl border border-[var(--color-brand-active-border)] shadow-sm">
            <CreditCard className="w-6 h-6 text-[var(--color-brand-ink)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{pageTitle}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {pageDesc}
            </p>
          </div>
        </div>
        {canWrite && (
          <Button variant="brand" className="gap-2" onClick={handleNew}>
            <Plus size={18} />
            Nuevo Método
          </Button>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar método de pago..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-sans"
            />
          </div>
          <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums">{filteredData.length} registros</span>
        </div>

        <DataTable<PaymentMethodRecord>
          columns={tableColumns}
          data={filteredData}
          searchQuery=""
          onSearchChange={() => {}}
        />

        {filteredData.length === 0 && (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-4">
              <CreditCard className="w-8 h-8 text-[var(--color-text-faint)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">No se encontraron métodos</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
              No existen registros de métodos de pago definidos para este sub-sistema.
            </p>
          </div>
        )}
      </div>

      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedMethod ? 'Editar Método de Pago' : 'Registrar Nuevo Método'}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={!formData.nombre || saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar Método
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Nombre del Método de Pago *</span>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej. Transferencia - Especial"
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Descripción Lógica (Cómo funciona en el sistema)</span>
              <textarea
                rows={4}
                value={formData.descripcion}
                onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Explique el tratamiento contable u operativo que requiere este método..."
                className="p-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all resize-none"
              />
            </label>

            {!type && (
              <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
                <span className="text-xs font-bold text-[var(--color-text)] block mb-2">Destinatarios Aplicables</span>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer bg-white hover:border-[var(--color-primary)] transition-all">
                  <input
                    type="checkbox"
                    checked={formData.aplicaNegocios}
                    onChange={(e) => setFormData(p => ({ ...p, aplicaNegocios: e.target.checked }))}
                    className="w-4 h-4 rounded text-[var(--color-primary)]"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[var(--color-text)]">Aplica a Negocios</span>
                    <span className="text-xs text-[var(--color-text-faint)]">Restaurantes, Cafeterías, Establecimientos comerciales</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer bg-white hover:border-[var(--color-primary)] transition-all mt-2">
                  <input
                    type="checkbox"
                    checked={formData.aplicaMensajeros}
                    onChange={(e) => setFormData(p => ({ ...p, aplicaMensajeros: e.target.checked }))}
                    className="w-4 h-4 rounded text-[var(--color-primary)]"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[var(--color-text)]">Aplica a Mensajeros</span>
                    <span className="text-xs text-[var(--color-text-faint)]">Drivers de reparto y mensajería oficial Mandao</span>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--color-border)] cursor-pointer bg-white hover:border-[var(--color-primary)] transition-all mt-2">
                  <input
                    type="checkbox"
                    checked={formData.aplicaOrdenes}
                    onChange={(e) => setFormData(p => ({ ...p, aplicaOrdenes: e.target.checked }))}
                    className="w-4 h-4 rounded text-[var(--color-primary)]"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[var(--color-text)]">Aplica a Órdenes</span>
                    <span className="text-xs text-[var(--color-text-faint)]">Gestión y control de Órdenes directas de reparto</span>
                  </div>
                </label>
              </div>
            )}

            <div className="space-y-1.5 border-t border-[var(--color-border)] pt-4">
              <span className="text-xs font-bold text-[var(--color-text)] block mb-2">Estado de Operación</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, estado: 'activo' }))}
                  className={cn(
                    'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                    formData.estado === 'activo' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                  )}
                >
                  Activa
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, estado: 'inactivo' }))}
                  className={cn(
                    'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                    formData.estado === 'inactivo' ? 'bg-red-50 border-red-500 text-red-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                  )}
                >
                  Inactiva
                </button>
              </div>
            </div>
          </div>
        </form>
      </SlideOver>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="¿Confirmar eliminación?"
        message="¿Está seguro de que desea eliminar este método de pago? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setMethodIdToDelete(null);
        }}
        isDanger={true}
      />
    </div>
  );
}
