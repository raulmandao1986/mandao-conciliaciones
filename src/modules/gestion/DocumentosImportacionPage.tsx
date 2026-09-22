import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { FileSpreadsheet, Plus, Edit2, Trash2, Loader2, Save, Search } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { DataTable } from '../../design-system/patterns/DataTable';
import { cn } from '../../lib/utils';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';

type EntityType = 'businesses' | 'messengers';

interface ImportSourceRecord {
  id: string;
  entityType: EntityType;
  nombre: string;
  spreadsheetId: string;
  estado: 'activo' | 'inactivo';
}

const ENTITY_LABELS: Record<EntityType, string> = {
  businesses: 'Negocios',
  messengers: 'Mensajeros',
};

// Catálogo de IDs de Google Sheet registrados para la Importación Masiva
// de Gestión de Negocios/Mensajeros (ver botón "Importación Masiva" en
// esas páginas). No guarda datos importados — solo el ID del documento;
// la hoja/pestaña a usar se elige en el momento de importar, listando
// las pestañas reales del documento vía la API de Google Sheets.
export function DocumentosImportacionPage() {
  const { user } = useAuth();
  // RLS "manage_import_sources" en Supabase ya restringe la escritura a
  // Super Admin a nivel de base de datos — este check es solo para la UI.
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [data, setData] = useState<ImportSourceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ImportSourceRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    entityType: 'businesses' as EntityType,
    nombre: '',
    spreadsheetId: '',
    estado: 'activo' as 'activo' | 'inactivo',
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [sourceIdToDelete, setSourceIdToDelete] = useState<string | null>(null);

  const loadSources = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('import_sources')
      .select('import_source_id, entity_type, name, sheet_document_id, active')
      .order('entity_type', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching import_sources:', error.message);
      setLoading(false);
      return;
    }
    const records: ImportSourceRecord[] = (rows || []).map((r: any) => ({
      id: r.import_source_id,
      entityType: r.entity_type,
      nombre: r.name,
      spreadsheetId: r.sheet_document_id || '',
      estado: r.active ? 'activo' : 'inactivo',
    }));
    setData(records);
    setLoading(false);
  };

  useEffect(() => {
    loadSources();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(item =>
      item.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ENTITY_LABELS[item.entityType].toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const handleEdit = (source: ImportSourceRecord) => {
    setSelectedSource(source);
    setFormData({
      entityType: source.entityType,
      nombre: source.nombre,
      spreadsheetId: source.spreadsheetId,
      estado: source.estado,
    });
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedSource(null);
    setFormData({ entityType: 'businesses', nombre: '', spreadsheetId: '', estado: 'activo' });
    setIsFormOpen(true);
  };

  const handleSave = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!formData.nombre || !formData.spreadsheetId) return;

    setSaving(true);
    try {
      const payload = {
        entity_type: formData.entityType,
        name: formData.nombre,
        sheet_document_id: formData.spreadsheetId,
        active: formData.estado === 'activo',
        updated_at: new Date().toISOString(),
      };

      if (selectedSource) {
        const { error } = await supabase.from('import_sources').update(payload).eq('import_source_id', selectedSource.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('import_sources').insert(payload);
        if (error) throw error;
      }
      setIsFormOpen(false);
      await loadSources();
    } catch (err: any) {
      console.error('Error saving import source:', err);
      alert('Error al guardar el documento. Detalle: ' + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setSourceIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sourceIdToDelete) return;
    try {
      const { error } = await supabase.from('import_sources').delete().eq('import_source_id', sourceIdToDelete);
      if (error) throw error;
      await loadSources();
    } catch (err: any) {
      console.error('Error deleting import source:', err);
      alert('Error al eliminar el documento. Detalle: ' + (err?.message || err));
    } finally {
      setDeleteConfirmOpen(false);
      setSourceIdToDelete(null);
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
            <FileSpreadsheet className="w-6 h-6 text-brand-ink" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Documentos de Importación</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Registre los IDs de los Google Sheet de origen para la Importación Masiva de Negocios y Mensajeros.
            </p>
          </div>
        </div>
        {canWrite && (
          <Button variant="brand" className="gap-2" onClick={handleNew}>
            <Plus size={18} />
            Nuevo Documento
          </Button>
        )}
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar por nombre o tipo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-sans"
            />
          </div>
          <span className="text-xs font-bold text-[var(--color-text-faint)] tabular-nums">{filteredData.length} documentos</span>
        </div>

        <DataTable<ImportSourceRecord>
          columns={[
            {
              header: 'Nombre',
              accessor: (item) => (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                  <span className="font-bold text-[var(--color-text)]">{item.nombre}</span>
                </div>
              )
            },
            {
              header: 'Aplica a',
              accessor: (item) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
                  {ENTITY_LABELS[item.entityType]}
                </span>
              )
            },
            {
              header: 'Google Sheet ID',
              accessor: (item) => (
                <span className="text-xs font-mono text-[var(--color-text)] font-semibold truncate max-w-[220px] inline-block" title={item.spreadsheetId}>
                  {item.spreadsheetId}
                </span>
              )
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
                    title={canWrite ? 'Editar documento' : 'Ver detalles'}
                    className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                  >
                    <Edit2 size={16} />
                  </button>
                  {canWrite && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteRequest(item.id); }}
                      title="Eliminar documento"
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
              <FileSpreadsheet className="w-8 h-8 text-[var(--color-text-faint)]" />
            </div>
            <h3 className="text-base font-semibold text-[var(--color-text)]">No hay documentos registrados</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">
              Registre el ID de un Google Sheet para poder usarlo en la Importación Masiva de Negocios o Mensajeros.
            </p>
          </div>
        )}
      </div>

      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedSource ? 'Editar Documento' : 'Registrar Nuevo Documento'}
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleSave} disabled={!formData.nombre || !formData.spreadsheetId || saving}>
              {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : <Save size={16} className="mr-2 inline" />}
              Guardar Documento
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Aplica a *</label>
              <select
                value={formData.entityType}
                onChange={(e) => setFormData(p => ({ ...p, entityType: e.target.value as EntityType }))}
                className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
              >
                <option value="businesses">Negocios</option>
                <option value="messengers">Mensajeros</option>
              </select>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">Nombre de Referencia *</span>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Ej. Catálogo Maestro de Negocios"
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-[var(--color-text)]">ID del Documento Google Sheet *</span>
              <input
                type="text"
                value={formData.spreadsheetId}
                onChange={(e) => setFormData(p => ({ ...p, spreadsheetId: e.target.value }))}
                placeholder="Ej. 1z_p9aB8N_9QWdf..."
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all font-mono"
                required
              />
              <span className="text-[10px] text-[var(--color-text-muted)] block leading-normal">
                Se obtiene de la URL del documento (entre "/d/" y "/edit"). Al importar, se listarán las pestañas reales de este documento para elegir cuál contiene los datos.
              </span>
            </label>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Estado</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, estado: 'activo' }))}
                  className={cn(
                    'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                    formData.estado === 'activo' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                  )}
                >
                  Activo
                </button>
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, estado: 'inactivo' }))}
                  className={cn(
                    'flex-1 h-10 rounded-md border text-xs font-bold flex items-center justify-center gap-2 transition-all',
                    formData.estado === 'inactivo' ? 'bg-red-50 border-red-500 text-red-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
                  )}
                >
                  Inactivo
                </button>
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)] pt-1">
                Solo los documentos "Activo" aparecen como opción al iniciar una Importación Masiva.
              </p>
            </div>
          </div>
        </form>
      </SlideOver>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="¿Confirmar eliminación?"
        message="¿Está seguro de que desea eliminar este documento de importación? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setSourceIdToDelete(null);
        }}
        isDanger={true}
      />
    </div>
  );
}
