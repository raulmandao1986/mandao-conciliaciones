import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { DollarSign, Plus, Edit2, Trash2, Loader2, Save, Search, TrendingUp, RefreshCw } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { DataTable } from '../../design-system/patterns/DataTable';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';

interface ExchangeRateRecord {
  id: string;
  nombre: string;
  tasaCUP: number; // e.g. 350.00
  descripcion: string;
  estado: 'activo' | 'inactivo';
  fechaActualizacion: string;
}

export function RazonCambioPage({ permissions = [] }: { permissions?: string[] }) {
  const [data, setData] = useState<ExchangeRateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<ExchangeRateRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    nombre: 'Tasa de Cambio Oficial',
    tasaCUP: 120,
    descripcion: '',
    estado: 'activo' as 'activo' | 'inactivo'
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rateIdToDelete, setRateIdToDelete] = useState<string | null>(null);

  const canWrite = permissions.includes('all') || 
                   permissions.includes('razon-cambio:write') || 
                   permissions.includes('roles-usuarios:config') ||
                   permissions.includes('roles-usuarios:write') ||
                   permissions.includes('roles-usuarios');

  useEffect(() => {
    const q = query(collection(db, 'RazonCambio'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(docSub => ({
        id: docSub.id,
        ...docSub.data()
      })) as ExchangeRateRecord[];
      setData(records);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching RazonCambio:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(item => 
      item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const activeRate = useMemo(() => {
    return data.find(r => r.estado === 'activo');
  }, [data]);

  const handleEdit = (rate: ExchangeRateRecord) => {
    setSelectedRate(rate);
    setFormData({
      nombre: rate.nombre,
      tasaCUP: rate.tasaCUP,
      descripcion: rate.descripcion || '',
      estado: rate.estado || 'activo'
    });
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedRate(null);
    setFormData({
      nombre: 'Tasa de Cambio',
      tasaCUP: 120,
      descripcion: '',
      estado: 'activo'
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.tasaCUP) return;

    try {
      // If we are setting this one as active, set all others to inactive first
      if (formData.estado === 'activo') {
        const activeRates = data.filter(r => r.estado === 'activo' && r.id !== selectedRate?.id);
        for (const r of activeRates) {
          await updateDoc(doc(db, 'RazonCambio', r.id), { estado: 'inactivo' });
        }
      }

      const payload = {
        ...formData,
        tasaCUP: Number(formData.tasaCUP),
        fechaActualizacion: new Date().toLocaleDateString('es-ES', { 
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        }),
        updatedAt: serverTimestamp()
      };

      if (selectedRate) {
        await updateDoc(doc(db, 'RazonCambio', selectedRate.id), payload);
      } else {
        await addDoc(collection(db, 'RazonCambio'), payload);
      }
      setIsFormOpen(false);
    } catch (err) {
      console.error("Error saving exchange rate:", err);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setRateIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!rateIdToDelete) return;
    try {
      await deleteDoc(doc(db, 'RazonCambio', rateIdToDelete));
    } catch (err) {
      console.error("Error deleting exchange rate:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-brand)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
            <DollarSign className="w-6 h-6 text-brand-ink" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Razón de Cambio de Referencia</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Fije las tasas de conversión cambiaria (USD/CUP) necesarias en la facturación y conciliaciones.
            </p>
          </div>
        </div>
        {canWrite && (
          <Button variant="brand" className="gap-2" onClick={handleNew}>
            <Plus size={18} />
            Nueva Tasa
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-[var(--color-brand-active)] border border-[var(--color-brand)] p-6 rounded-[var(--radius-md)] flex flex-col justify-between">
          <div>
            <span className="text-xs uppercase font-extrabold text-[var(--color-brand-ink)] tracking-widest block opacity-70">Tasa de Cambio Vigente</span>
            <span className="text-4xl font-black text-[var(--color-brand-ink)] mt-3 block font-sans tracking-tight">
              1 USD = {activeRate ? `${activeRate.tasaCUP.toFixed(2)} CUP` : 'No definida'}
            </span>
            <p className="text-xs text-[var(--color-brand-ink)] opacity-80 mt-2 font-mono">
              Ref: {activeRate ? activeRate.nombre : 'Por favor configure una tasa activa'}
            </p>
          </div>
          <div className="mt-6 pt-4 border-t border-[var(--color-brand)]/25 flex items-center gap-2 text-xs text-[var(--color-brand-ink)] font-semibold">
            <TrendingUp size={14} />
            <span>Última actualización: {activeRate ? activeRate.fechaActualizacion : 'Nunca'}</span>
          </div>
        </div>

        <div className="md:col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] p-6 rounded-[var(--radius-md)] flex flex-col justify-between">
          <h3 className="text-sm font-bold text-[var(--color-text)] mb-2 flex items-center gap-2">
            <RefreshCw size={16} className="text-[var(--color-primary)]" />
            Impacto en Conciliación de Negocios
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            La tasa marcada como <strong>Activa</strong> es utilizada automáticamente por el motor de conciliación y facturación para calcular los montos liquidados en divisa internacional. El historial contable almacena la tasa de referencia correspondiente al período liquidado de forma inalterable.
          </p>
          <div className="pt-4 border-t border-[var(--color-border)] text-xs text-[var(--color-text-faint)] italic">
            * Se recomienda actualizar semanalmente según cotizaciones oficiales correspondientes.
          </div>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden flex-1">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar tasa por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-sans"
            />
          </div>
          <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums">{filteredData.length} registros</span>
        </div>

        <DataTable<ExchangeRateRecord>
          columns={[
            {
              header: 'Nombre de Referencia',
              accessor: (item) => (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-brand)]" />
                  <span className="font-bold text-[var(--color-text)]">{item.nombre}</span>
                </div>
              )
            },
            {
              header: 'Valor Cambiario',
              accessor: (item) => (
                <span className="font-mono text-sm font-bold text-[var(--color-text)] tabular-nums">
                  1.00 USD = {item.tasaCUP.toFixed(2)} CUP
                </span>
              )
            },
            {
              header: 'Actualización',
              accessor: (item) => <span className="text-xs font-mono text-[var(--color-text-muted)]">{item.fechaActualizacion}</span>
            },
            {
              header: 'Estado',
              accessor: (item) => <StatusBadge status={item.estado === 'activo' ? 'activo' : 'bloqueado'} />
            },
            {
              header: 'Acciones',
              accessor: (item) => (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                    title={canWrite ? "Editar Tasa" : "Ver detalles"}
                    className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  {canWrite && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteRequest(item.id); }}
                      title="Eliminar Tasa"
                      className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )
            }
          ]}
          data={filteredData}
          searchQuery=""
          onSearchChange={() => {}}
        />

        {filteredData.length === 0 && (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center mb-4">
              <DollarSign className="w-8 h-8 text-[var(--color-text-faint)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">No se encontraron tasas</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
              No existen referencias registradasen las bases de datos para estos criterios.
            </p>
          </div>
        )}
      </div>

      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedRate ? "Editar Tasa Cambiaria" : "Registrar Nueva Tasa Cambiaria"}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={!formData.nombre || !formData.tasaCUP}>
              <Save size={16} className="mr-2 inline" />
              Guardar Tasa
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Nombre de Referencia *</span>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej. Tasa Informal El Toque"
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-sans"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Tasa en CUP por 1 USD *</span>
              <input
                type="number"
                step="0.01"
                min="1"
                value={formData.tasaCUP}
                onChange={(e) => setFormData(p => ({ ...p, tasaCUP: Number(e.target.value) }))}
                placeholder="Ej. 350.00"
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-mono"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Descripción o Notas</span>
              <textarea
                rows={4}
                value={formData.descripcion}
                onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Indique las fuentes utilizadas para la cotización de este factor de cambio de referencia..."
                className="p-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all resize-none font-sans"
              />
            </label>

            <div className="space-y-1.5 border-t border-[var(--color-border)] pt-4">
              <span className="text-xs font-bold text-[var(--color-text)] block mb-2">Estado de Referencia</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, estado: 'activo' }))}
                  className={cn(
                    "flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                    formData.estado === 'activo' ? "bg-teal-50 border-teal-500 text-teal-700" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50"
                  )}
                >
                  Activa (Vigente)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, estado: 'inactivo' }))}
                  className={cn(
                    "flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all",
                    formData.estado === 'inactivo' ? "bg-red-50 border-red-500 text-red-700" : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50"
                  )}
                >
                  Histórica
                </button>
              </div>
            </div>
          </div>
        </form>
      </SlideOver>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="¿Confirmar eliminación?"
        message="¿Está seguro de que desea eliminar esta tasa de cambio de referencia? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setRateIdToDelete(null);
        }}
        isDanger={true}
      />
    </div>
  );
}
