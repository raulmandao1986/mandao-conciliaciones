import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { MapPin, Plus, Edit2, Trash2, Loader2, Save, Search, Map } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { DataTable } from '../../design-system/patterns/DataTable';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';

interface AreaRecord {
  id: string;
  nombre: string;
  provincia: string; // 'Habana' | 'Holguin' | 'Provincias'
  descripcion: string;
  estado: 'activo' | 'inactivo';
  spreadsheetId: string;
}

export function AreasPage() {
  const { user } = useAuth();
  // RLS "manage_areas" en Supabase ya restringe la escritura a Super Admin
  // a nivel de base de datos — este check es solo para ocultar la UI.
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [data, setData] = useState<AreaRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<AreaRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    provincia: 'Habana',
    descripcion: '',
    estado: 'activo' as 'activo' | 'inactivo',
    spreadsheetId: ''
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [areaIdToDelete, setAreaIdToDelete] = useState<string | null>(null);

  const loadAreas = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('areas')
      .select('area_id, name, province, sheet_document_id, description, active')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching Areas:', error.message);
      setLoading(false);
      return;
    }
    const records: AreaRecord[] = (rows || []).map((a: any) => ({
      id: a.area_id,
      nombre: a.name,
      provincia: a.province || 'Habana',
      descripcion: a.description || '',
      estado: a.active ? 'activo' : 'inactivo',
      spreadsheetId: a.sheet_document_id || ''
    }));
    setData(records);
    setLoading(false);
  };

  useEffect(() => {
    loadAreas();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(item =>
      item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.provincia.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.descripcion.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const handleEdit = (area: AreaRecord) => {
    setSelectedArea(area);
    setFormData({
      nombre: area.nombre,
      provincia: area.provincia || 'Habana',
      descripcion: area.descripcion || '',
      estado: area.estado || 'activo',
      spreadsheetId: area.spreadsheetId || ''
    });
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedArea(null);
    setFormData({
      nombre: '',
      provincia: 'Habana',
      descripcion: '',
      estado: 'activo',
      spreadsheetId: ''
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    // RN sección 15: el ID del Documento Google Sheet en Áreas es obligatorio
    // (valida antes de ejecutar Verificación) — coincide con el constraint
    // "sheet_document_id not null" de la tabla en Supabase.
    if (!formData.nombre || !formData.spreadsheetId) return;

    setSaving(true);
    try {
      const payload = {
        name: formData.nombre,
        province: formData.provincia,
        description: formData.descripcion,
        active: formData.estado === 'activo',
        sheet_document_id: formData.spreadsheetId
      };

      if (selectedArea) {
        const { error } = await supabase.from('areas').update(payload).eq('area_id', selectedArea.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('areas').insert(payload);
        if (error) throw error;
      }
      setIsFormOpen(false);
      await loadAreas();
    } catch (err: any) {
      console.error('Error saving area:', err);
      alert('Error al guardar el área. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setAreaIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!areaIdToDelete) return;
    try {
      const { error } = await supabase.from('areas').delete().eq('area_id', areaIdToDelete);
      if (error) throw error;
      await loadAreas();
    } catch (err: any) {
      console.error('Error deleting area:', err);
      alert('Error al eliminar el área. Detalle: ' + (err?.message || err));
    } finally {
      setDeleteConfirmOpen(false);
      setAreaIdToDelete(null);
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
            <MapPin className="w-6 h-6 text-brand-ink" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Gestión de Áreas y Provincias</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Configure las provincias y áreas de entrega operadas por el sistema de conciliación.
            </p>
          </div>
        </div>
        {canWrite && (
          <Button variant="brand" className="gap-2" onClick={handleNew}>
            <Plus size={18} />
            Nueva Área
          </Button>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar área por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-sans"
            />
          </div>
          <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums">{filteredData.length} registros</span>
        </div>

        <DataTable<AreaRecord>
          columns={[
            {
              header: 'Nombre del Área',
              accessor: (item) => (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                  <span className="font-bold text-[var(--color-text)]">{item.nombre}</span>
                </div>
              )
            },
            {
              header: 'Centro / Provincia',
              accessor: (item) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800 capitalize">
                  {item.provincia}
                </span>
              )
            },
            {
              header: 'Google Sheet ID',
              accessor: (item) => (
                <span className="text-xs font-mono text-[var(--color-text-muted)] truncate max-w-[150px] inline-block" title={item.spreadsheetId || 'No configurado'}>
                  {item.spreadsheetId ? (
                    <span className="text-[var(--color-text)] font-semibold">{item.spreadsheetId}</span>
                  ) : (
                    <span className="text-rose-500 font-medium italic">No configurado</span>
                  )}
                </span>
              )
            },
            {
              header: 'Descripción',
              accessor: (item) => <span className="text-sm text-[var(--color-text-muted)]">{item.descripcion || 'Sin descripción'}</span>
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
                    title={canWrite ? 'Editar Área' : 'Ver detalles'}
                    className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  {canWrite && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteRequest(item.id); }}
                      title="Eliminar Área"
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
              <Map className="w-8 h-8 text-[var(--color-text-faint)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">No se encontraron áreas</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
              No existen registros de áreas para conciliar con los criterios de búsqueda especificados.
            </p>
          </div>
        )}
      </div>

      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedArea ? 'Editar Área' : 'Registrar Nueva Área'}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={!formData.nombre || !formData.spreadsheetId || saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar Área
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Nombre de la Zona/Área *</span>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej. Matanzas Central"
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                required
              />
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Centro de Operación / Provincia *</label>
              <select
                value={formData.provincia}
                onChange={(e) => setFormData(p => ({ ...p, provincia: e.target.value }))}
                className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
              >
                <option value="Habana">Habana</option>
                <option value="Holguin">Holguín</option>
                <option value="Provincias">Provincias</option>
              </select>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">ID del Documento Google Sheet (Durable) *</span>
              <input
                type="text"
                value={formData.spreadsheetId}
                onChange={(e) => setFormData(p => ({ ...p, spreadsheetId: e.target.value }))}
                placeholder="Ej. 1z_p9aB8N_9QWdf..."
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-mono"
                required
              />
              <span className="text-[10px] text-[var(--color-text-muted)] block leading-normal">
                Obligatorio: se valida antes de ejecutar Verificación (sección 15). Se obtiene de la URL de tu hoja de cálculo.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Descripción</span>
              <textarea
                rows={4}
                value={formData.descripcion}
                onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
                placeholder="Indique las fronteras físicas o particularidades de esta demarcación..."
                className="p-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all resize-none"
              />
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Estado de Operación</label>
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
        message="¿Está seguro de que desea eliminar esta zona/provincia? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setAreaIdToDelete(null);
        }}
        isDanger={true}
      />
    </div>
  );
}
