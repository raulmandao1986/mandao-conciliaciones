import React, { useState, useMemo, useEffect } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import {
  Plus,
  Bike,
  Filter,
  Search,
  Edit2,
  Eye,
  ChevronRight,
  Trash2,
  CreditCard,
  Phone,
  MapPin,
  Banknote,
  Calendar,
  MessageSquare,
  IdCard,
  Loader2,
  FileSpreadsheet,
  Download,
  Printer
} from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';
import { BulkImportModal } from './components/BulkImportModal';

interface AreaOption {
  id: string;
  nombre: string;
  provincia: string;
}

interface MessengerRecord {
  id: string;
  nombre: string;
  ci: string;
  telefono: string;
  tarjetaFiscal: string;
  cuentaFiscal: string;
  viaPago: string;
  tipoMochila: string;
  fechaAlta: string;
  fechaBaja: string;
  estado: 'activo' | 'bloqueado';
  areaId: string;
  areaNombre: string;
  comentarios: string;
}

export function GestionMensajerosPage() {
  const { user } = useAuth();
  // RLS "manage_messengers" en Supabase ya restringe la escritura a Super
  // Admin a nivel de base de datos — este check es solo para la UI.
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [data, setData] = useState<MessengerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMessenger, setSelectedMessenger] = useState<MessengerRecord | null>(null);
  const [viasPago, setViasPago] = useState<string[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const loadPaymentMethods = async () => {
    const { data: rows, error } = await supabase
      .from('payment_methods')
      .select('name')
      .eq('applies_to_messengers', true)
      .eq('active', true);
    if (error) {
      console.error('Error fetching payment_methods:', error.message);
      setViasPago([]);
      return;
    }
    setViasPago((rows || []).map((m: any) => m.name));
  };

  const loadAreas = async () => {
    const { data: rows, error } = await supabase
      .from('areas')
      .select('area_id, name, province')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching areas:', error.message);
      setAreas([]);
      return;
    }
    setAreas((rows || []).map((a: any) => ({ id: a.area_id, nombre: a.name, provincia: a.province || '' })));
  };

  const loadMessengers = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('messengers')
      .select('messenger_id, name, ci, phone, fiscal_card, fiscal_account, payment_method, backpack_type, start_date, end_date, area_id, comments, active, areas(name)')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching messengers:', error.message);
      setLoading(false);
      return;
    }
    const records: MessengerRecord[] = (rows || []).map((m: any) => ({
      id: m.messenger_id,
      nombre: m.name,
      ci: m.ci || '',
      telefono: m.phone || '',
      tarjetaFiscal: m.fiscal_card || '',
      cuentaFiscal: m.fiscal_account || '',
      viaPago: m.payment_method || '',
      tipoMochila: m.backpack_type || 'Grande',
      fechaAlta: m.start_date || '',
      fechaBaja: m.end_date || '',
      estado: m.active ? 'activo' : 'bloqueado',
      areaId: m.area_id || '',
      areaNombre: m.areas?.name || 'N/A',
      comentarios: m.comments || ''
    }));
    setData(records);
    setLoading(false);
  };

  useEffect(() => {
    loadPaymentMethods();
    loadAreas();
    loadMessengers();
  }, []);

  // Form State
  const [showHelp, setShowHelp] = useState(false);
  const emptyForm = () => ({
    nombre: '',
    ci: '',
    telefono: '',
    tarjetaFiscal: '',
    cuentaFiscal: '',
    viaPago: 'Transferencia',
    tipoMochila: 'Grande',
    fechaAlta: new Date().toISOString().split('T')[0],
    fechaBaja: '',
    estado: 'activo' as 'activo' | 'bloqueado',
    areaId: areas[0]?.id || '',
    comentarios: ''
  });
  const [formData, setFormData] = useState<any>(emptyForm());

  // Filter State
  const [filters, setFilters] = useState({
    areaId: '',
    nombre: '',
    ci: '',
    telefono: '',
    tipoMochila: '',
    viaPago: '',
    estado: 'activo'
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messengerIdToDelete, setMessengerIdToDelete] = useState<string | null>(null);

  const filteredData = useMemo(() => {
    // Igual que en GestionNegociosPage: con una búsqueda de texto activa se
    // ignora el filtro "Activo" por defecto (para poder encontrar un
    // bloqueado por nombre/CI/teléfono sin tener que cambiar el filtro).
    const hasSearchQuery = !!(filters.nombre.trim() || filters.ci.trim() || filters.telefono.trim());

    return data.filter(item => {
      const matchArea = !filters.areaId || item.areaId === filters.areaId;
      const matchNombre = !filters.nombre || item.nombre.toLowerCase().includes(filters.nombre.toLowerCase());
      const matchCI = !filters.ci || (item.ci || '').includes(filters.ci);
      const matchTelefono = !filters.telefono || (item.telefono || '').includes(filters.telefono);
      const matchMochila = !filters.tipoMochila || item.tipoMochila === filters.tipoMochila;
      const matchVia = !filters.viaPago || item.viaPago === filters.viaPago;
      if (!(matchArea && matchNombre && matchCI && matchTelefono && matchMochila && matchVia)) return false;

      if (filters.estado === 'activo') {
        if (!hasSearchQuery && item.estado === 'bloqueado') return false;
      } else if (filters.estado === 'bloqueado') {
        if (item.estado !== 'bloqueado') return false;
      }

      return true;
    });
  }, [data, filters]);

  const handleExportExcel = () => {
    setShowExportMenu(false);
    const headers = ['Nombre', 'CI', 'Teléfono', 'Tarjeta Fiscal', 'Cuenta Fiscal', 'Vía de Pago', 'Tipo de Mochila', 'Fecha Alta', 'Fecha Baja', 'Estado', 'Área', 'Comentarios'];
    const rows = filteredData.map(item => [
      `"${(item.nombre || '').replace(/"/g, '""')}"`,
      `"${(item.ci || '').replace(/"/g, '""')}"`,
      `"${(item.telefono || '').replace(/"/g, '""')}"`,
      `"${(item.tarjetaFiscal || '').replace(/"/g, '""')}"`,
      `"${(item.cuentaFiscal || '').replace(/"/g, '""')}"`,
      `"${(item.viaPago || '').replace(/"/g, '""')}"`,
      `"${(item.tipoMochila || '').replace(/"/g, '""')}"`,
      `"${(item.fechaAlta || '').replace(/"/g, '""')}"`,
      `"${(item.fechaBaja || '').replace(/"/g, '""')}"`,
      `"${(item.estado || 'activo').replace(/"/g, '""')}"`,
      `"${(item.areaNombre || '').replace(/"/g, '""')}"`,
      `"${(item.comentarios || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `listado_mensajeros_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF
  const handleExportPDF = () => {
    setShowExportMenu(false);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Listado de Mensajeros - Mandao Conciliaciones</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
            h1 { font-size: 20px; margin: 0; color: #0f172a; }
            p.subtitle { font-size: 11px; color: #64748b; margin: 4px 0 0 0; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
            th { background-color: #f8fafc; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; font-weight: bold; color: #475569; text-transform: uppercase; font-size: 9px; }
            td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .badge { padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9px; text-transform: uppercase; display: inline-block; }
            .badge-activo { background: #dcfce7; color: #15803d; }
            .badge-bloqueado { background: #fee2e2; color: #b91c1c; }
            .footer { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Mandao Conciliaciones - Listado de Mensajeros</h1>
              <p class="subtitle">Reporte oficial generado el ${new Date().toLocaleString('es-ES')} | Registros exportados: ${filteredData.length}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>CI</th>
                <th>Teléfono</th>
                <th>Vía de Pago</th>
                <th>Mochila</th>
                <th>Fecha Alta</th>
                <th>Fecha Baja</th>
                <th>Estado</th>
                <th>Área</th>
                <th>Comentarios</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(item => `
                <tr>
                  <td><strong>${item.nombre || '-'}</strong></td>
                  <td>${item.ci || '-'}</td>
                  <td>${item.telefono || '-'}</td>
                  <td>${item.viaPago || '-'}</td>
                  <td>${item.tipoMochila || '-'}</td>
                  <td>${item.fechaAlta || '-'}</td>
                  <td>${item.fechaBaja || '-'}</td>
                  <td><span class="badge ${item.estado === 'bloqueado' ? 'badge-bloqueado' : 'badge-activo'}">${(item.estado || 'activo')}</span></td>
                  <td>${item.areaNombre || '-'}</td>
                  <td>${item.comentarios || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">Sistema de Conciliaciones Mandao Finance — Confidencial</div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleEdit = (messenger: MessengerRecord) => {
    setSelectedMessenger(messenger);
    setFormData({
      nombre: messenger.nombre,
      ci: messenger.ci,
      telefono: messenger.telefono,
      tarjetaFiscal: messenger.tarjetaFiscal,
      cuentaFiscal: messenger.cuentaFiscal,
      viaPago: messenger.viaPago || 'Transferencia',
      tipoMochila: messenger.tipoMochila || 'Grande',
      fechaAlta: messenger.fechaAlta || new Date().toISOString().split('T')[0],
      fechaBaja: messenger.fechaBaja || '',
      estado: messenger.estado,
      areaId: messenger.areaId,
      comentarios: messenger.comentarios || ''
    });
    setShowHelp(false);
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedMessenger(null);
    setFormData(emptyForm());
    setShowHelp(false);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nombre || !formData.ci || !formData.telefono || !formData.areaId) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.nombre,
        ci: formData.ci,
        phone: formData.telefono,
        fiscal_card: formData.tarjetaFiscal || null,
        fiscal_account: formData.cuentaFiscal || null,
        payment_method: formData.viaPago,
        backpack_type: formData.tipoMochila,
        start_date: formData.fechaAlta || null,
        end_date: formData.fechaBaja || null,
        area_id: formData.areaId,
        comments: formData.comentarios || null,
        active: formData.estado === 'activo',
        updated_at: new Date().toISOString()
      };

      if (selectedMessenger) {
        const { error } = await supabase.from('messengers').update(payload).eq('messenger_id', selectedMessenger.id);
        if (error) throw error;
        logAuditEvent('Gestion_Mensajeros', 'Mensajero Actualizado', {
          id: selectedMessenger.id,
          nombre: formData.nombre,
          area: formData.areaId
        });
      } else {
        const { data: inserted, error } = await supabase.from('messengers').insert(payload).select('messenger_id').single();
        if (error) throw error;
        logAuditEvent('Gestion_Mensajeros', 'Mensajero Creado', {
          id: inserted?.messenger_id,
          nombre: formData.nombre,
          area: formData.areaId
        });
      }
      setIsFormOpen(false);
      await loadMessengers();
    } catch (error: any) {
      console.error('Error saving messenger:', error);
      alert('Error al guardar el mensajero. Detalle: ' + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setMessengerIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!messengerIdToDelete) return;
    try {
      const target = data.find(m => m.id === messengerIdToDelete);
      const { error } = await supabase.from('messengers').delete().eq('messenger_id', messengerIdToDelete);
      if (error) throw error;
      logAuditEvent('Gestion_Mensajeros', 'Mensajero Eliminado', {
        id: messengerIdToDelete,
        nombre: target?.nombre || messengerIdToDelete
      });
      await loadMessengers();
    } catch (err: any) {
      console.error('Error deleting messenger:', err);
      alert('Error al eliminar el mensajero. Detalle: ' + (err?.message || err));
    } finally {
      setDeleteConfirmOpen(false);
      setMessengerIdToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--color-brand-subtle)] rounded-xl border border-[var(--color-brand-active-border)] shadow-sm">
             <Bike className="w-6 h-6 text-[var(--color-brand-ink)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Gestión de Mensajeros</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Control de flota, vinculación de mensajeros y configuración de pagos.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowExportMenu(!showExportMenu)}
            >
              <Download size={16} />
              Exportar
            </Button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-[var(--color-border)] rounded-lg shadow-lg z-30 py-1">
                <button
                  onClick={handleExportExcel}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-2)] flex items-center gap-2"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" />
                  Exportar a Excel (.csv)
                </button>
                <button
                  onClick={handleExportPDF}
                  className="w-full px-4 py-2 text-left text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-2)] flex items-center gap-2"
                >
                  <Printer size={15} className="text-blue-600" />
                  Exportar a PDF
                </button>
              </div>
            )}
          </div>

          {canWrite && (
            <Button variant="outline" className="gap-2" onClick={() => setIsBulkImportOpen(true)}>
              <FileSpreadsheet size={16} />
              Importación Masiva
            </Button>
          )}

          {canWrite && (
            <Button variant="brand" className="gap-2" onClick={handleNew}>
              <Plus size={18} />
              Nuevo Mensajero
            </Button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
            <input
              type="text"
              placeholder="Buscar por nombre completo..."
              className="w-full h-10 pl-10 pr-4 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] shadow-sm"
              value={filters.nombre}
              onChange={(e) => setFilters(prev => ({ ...prev, nombre: e.target.value }))}
            />
          </div>
          <Button
            variant="outline"
            className={cn("gap-2", showFilters && "bg-[var(--color-surface-2)] border-[var(--color-primary)]")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filtros
          </Button>
          {loading && <Loader2 size={20} className="animate-spin text-[var(--color-primary)]" />}
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-md)] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Nombre</label>
                  <input
                    type="text"
                    placeholder="Filtrar por nombre..."
                    className="w-full h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] shadow-sm"
                    value={filters.nombre}
                    onChange={(e) => setFilters(prev => ({ ...prev, nombre: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">CI</label>
                  <input
                    type="text"
                    placeholder="Filtrar por CI..."
                    className="w-full h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] shadow-sm"
                    value={filters.ci}
                    onChange={(e) => setFilters(prev => ({ ...prev, ci: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Teléfono</label>
                  <input
                    type="text"
                    placeholder="Filtrar por teléfono..."
                    className="w-full h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] shadow-sm"
                    value={filters.telefono}
                    onChange={(e) => setFilters(prev => ({ ...prev, telefono: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Tipo de Mochila</label>
                  <select
                    className="w-full h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none"
                    value={filters.tipoMochila}
                    onChange={(e) => setFilters(prev => ({ ...prev, tipoMochila: e.target.value }))}
                  >
                    <option value="">Todas</option>
                    <option value="Grande">Grande</option>
                    <option value="Pequeña">Pequeña</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Vía de Pago</label>
                  <select
                    className="w-full h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none"
                    value={filters.viaPago}
                    onChange={(e) => setFilters(prev => ({ ...prev, viaPago: e.target.value }))}
                  >
                    <option value="">Todas las vías</option>
                    {viasPago.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Estado</label>
                  <select
                    className="w-full h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none"
                    value={filters.estado}
                    onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value }))}
                  >
                    <option value="Todos">Todos</option>
                    <option value="activo">Activo</option>
                    <option value="bloqueado">Bloqueado</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Área (Provincia)</label>
                  <select
                    className="w-full h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none"
                    value={filters.areaId}
                    onChange={(e) => setFilters(prev => ({ ...prev, areaId: e.target.value }))}
                  >
                    <option value="">Todas las áreas</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                   <Button variant="ghost" className="text-xs h-9 w-full sm:w-auto" onClick={() => setFilters({ areaId: '', nombre: '', ci: '', telefono: '', tipoMochila: '', viaPago: '', estado: 'activo' })}>Limpiar Filtros</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DataTable<MessengerRecord>
        columns={[
          {
            header: 'Mensajero',
            accessor: (item: MessengerRecord) => (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--color-brand)] flex items-center justify-center border border-[var(--color-brand-active-border)] shadow-sm font-bold text-[var(--color-brand-ink)]">
                   {item.nombre.charAt(0)}{item.nombre.split(' ')[1]?.charAt(0)}
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-[var(--color-text)]">{item.nombre}</span>
                  <span className="text-[10px] font-mono text-[var(--color-text-faint)]">ID: {item.id}</span>
                </div>
              </div>
            )
          },
          {
            header: 'Vía de Pago',
            accessor: (item: MessengerRecord) => (
              <div className="flex items-center gap-2">
                <Banknote size={14} className="text-[var(--color-text-faint)]" />
                <span className="text-sm font-medium">{item.viaPago}</span>
              </div>
            )
          },
          { header: 'Fecha Alta', accessor: (item: MessengerRecord) => item.fechaAlta, className: 'text-sm font-mono' },
          {
            header: 'Área',
            accessor: (item: MessengerRecord) => (
              <div className="flex items-center gap-1.5">
                <MapPin size={12} className="text-[var(--color-text-faint)]" />
                <span className="text-sm">{item.areaNombre}</span>
              </div>
            )
          },
          {
            header: 'Estado',
            accessor: (item: MessengerRecord) => <StatusBadge status={item.estado} />,
            align: 'center'
          },
          {
            header: 'Acciones',
            accessor: (item: MessengerRecord) => (
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedMessenger(item); setIsDetailsOpen(true); }}
                  className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all group"
                >
                  <Eye size={18} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                  className={cn(
                    "p-2 rounded-md transition-all group",
                    canWrite ? "text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10" : "opacity-0 invisible select-none"
                  )}
                  title="Editar Mensajero"
                  disabled={!canWrite}
                >
                  <Edit2 size={18} />
                </button>
                {canWrite && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRequest(item.id); }}
                    className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all group"
                    title="Eliminar Mensajero"
                  >
                    <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                  </button>
                )}
              </div>
            )
          }
        ]}
        data={filteredData}
      />

      {/* DETAILS SLIDEOVER */}
      <SlideOver
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title={`Detalles: ${selectedMessenger?.nombre}`}
      >
        <div className="space-y-8">
           <div className="flex flex-col items-center py-6">
              <div className="w-24 h-24 rounded-full bg-[var(--color-brand)] flex items-center justify-center border-4 border-white shadow-xl mb-4 text-2xl font-bold text-[var(--color-brand-ink)]">
                 {selectedMessenger?.nombre.charAt(0)}{selectedMessenger?.nombre.split(' ')[1]?.charAt(0)}
              </div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">{selectedMessenger?.nombre}</h3>
              <StatusBadge status={selectedMessenger?.estado || 'activo'} className="mt-2" />
           </div>

            <FormSection title="Información Personal">
               <div className="space-y-4">
                  <DetailItem icon={IdCard} label="CI" value={selectedMessenger?.ci} />
                  <DetailItem icon={Phone} label="Teléfono" value={selectedMessenger?.telefono} />
                  <DetailItem icon={MapPin} label="Área" value={selectedMessenger?.areaNombre} />
                  <DetailItem icon={Bike} label="Tipo de Mochila" value={selectedMessenger?.tipoMochila || 'Grande'} />
                  <DetailItem icon={Calendar} label="Fecha Alta" value={selectedMessenger?.fechaAlta} />
                  <DetailItem icon={Calendar} label="Fecha Baja" value={selectedMessenger?.fechaBaja || 'Vigente'} />
                  <DetailItem icon={MessageSquare} label="Comentarios" value={selectedMessenger?.comentarios} />
               </div>
            </FormSection>

            <FormSection title="Configuración de Cuentas">
               <div className="space-y-4">
                  <DetailItem icon={CreditCard} label="Tarjeta Fiscal" value={selectedMessenger?.tarjetaFiscal || 'N/A'} />
                  <DetailItem icon={CreditCard} label="Cuenta Fiscal" value={selectedMessenger?.cuentaFiscal || 'N/A'} />
                  <DetailItem icon={Banknote} label="Vía de Pago" value={selectedMessenger?.viaPago} />
               </div>
            </FormSection>
        </div>
      </SlideOver>

      {/* FORM SLIDEOVER */}
      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedMessenger ? "Editar Mensajero" : "Nuevo Mensajero"}
        footer={
          <div className="flex gap-3">
             <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
             <Button variant="brand" className="flex-1" onClick={handleSave} disabled={saving}>
               {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : null}
               Guardar
             </Button>
          </div>
        }
      >
        <div className="space-y-6 relative">
          {/* Botón de Ayuda en la esquina superior derecha */}
          <div className="absolute -top-12 right-0 flex items-center gap-2">
             <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full border text-sm font-bold transition-all shadow-sm",
                  showHelp
                    ? "bg-amber-100 text-amber-700 border-amber-300 scale-105"
                    : "bg-[var(--color-surface-2)] text-[var(--color-text-faint)] border-[var(--color-border)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]"
                )}
                title="Guía de llenado de datos"
             >
                ?
             </button>
          </div>

          <AnimatePresence>
             {showHelp && (
                <motion.div
                   initial={{ opacity: 0, height: 0 }}
                   animate={{ opacity: 1, height: "auto" }}
                   exit={{ opacity: 0, height: 0 }}
                   className="overflow-hidden bg-amber-50/75 border border-amber-200/80 rounded-xl p-4 shadow-sm text-xs text-amber-900 space-y-3"
                >
                   <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">
                      <span>💡 Guía de Ayuda: Llenado de Datos (Mensajeros)</span>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                         <p className="font-bold underline mb-1">Datos Personales</p>
                         <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Nombre Completo:</strong> Nombre y apellidos completos.</li>
                            <li><strong>CI:</strong> Carnet de identidad (máximo 11 dígitos).</li>
                            <li><strong>Teléfono:</strong> Número de contacto telefónico.</li>
                         </ul>
                      </div>
                      <div>
                         <p className="font-bold underline mb-1">Configuración de Cuentas</p>
                         <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Tarjeta Fiscal:</strong> Solo números de la tarjeta fiscal.</li>
                            <li><strong>Cuenta Fiscal:</strong> Solo números de la cuenta bancaria.</li>
                            <li><strong>Vía de pago:</strong> Efectivo o Transferencia.</li>
                         </ul>
                      </div>
                      <div>
                         <p className="font-bold underline mb-1">Datos</p>
                         <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Mochila:</strong> Tipo Pequeña o Grande.</li>
                            <li><strong>Vigencia:</strong> Fecha de Alta y opcionalmente de Baja.</li>
                            <li><strong>Estado:</strong> Activo o Bloqueado.</li>
                         </ul>
                      </div>
                   </div>
                </motion.div>
             )}
          </AnimatePresence>

          {/* Secciones de Formulario */}
          <FormSection title="Datos Personales">
             <div className="grid grid-cols-1 gap-4">
                <TextField
                   label="Nombre Completo"
                   value={formData.nombre}
                   onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                   required
                   placeholder="Nombre y Apellidos"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <TextField
                      label="CI (Carnet de Identidad)"
                      value={formData.ci}
                      onChange={(e) => {
                         const val = e.target.value.replace(/\D/g, '');
                         if (val.length <= 11) {
                            setFormData(prev => ({ ...prev, ci: val }));
                         }
                      }}
                      required
                      maxLength={11}
                      placeholder="Ej: 98010212345"
                   />
                   <TextField
                      label="Teléfono"
                      value={formData.telefono}
                      onChange={(e) => {
                         const val = e.target.value.replace(/\D/g, '');
                         setFormData(prev => ({ ...prev, telefono: val }));
                      }}
                      required
                      placeholder="Ej: 53123456"
                   />
                </div>
             </div>
          </FormSection>

          <FormSection title="Configuración de Cuentas">
             <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <TextField
                      label="Tarjeta Fiscal"
                      value={formData.tarjetaFiscal || ''}
                      onChange={(e) => {
                         const val = e.target.value.replace(/\D/g, '');
                         setFormData(prev => ({ ...prev, tarjetaFiscal: val }));
                      }}
                      placeholder="Solo números"
                   />
                   <TextField
                      label="Cuenta Fiscal"
                      value={formData.cuentaFiscal || ''}
                      onChange={(e) => {
                         const val = e.target.value.replace(/\D/g, '');
                         setFormData(prev => ({ ...prev, cuentaFiscal: val }));
                      }}
                      placeholder="Solo números"
                   />
                </div>
                <SelectField
                   label="Vía de Pago"
                   value={formData.viaPago}
                   onChange={(e) => setFormData(prev => ({ ...prev, viaPago: e.target.value }))}
                   required
                >
                   <option value="Transferencia">Transferencia</option>
                   <option value="Efectivo">Efectivo</option>
                   {viasPago.filter(v => v !== 'Transferencia' && v !== 'Efectivo').map(v => <option key={v} value={v}>{v}</option>)}
                </SelectField>
             </div>
          </FormSection>

          <FormSection title="Datos">
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField
                   label="Tipo de Mochila"
                   value={formData.tipoMochila || 'Grande'}
                   onChange={(e) => setFormData(prev => ({ ...prev, tipoMochila: e.target.value }))}
                   required
                >
                   <option value="Grande">Grande</option>
                   <option value="Pequeña">Pequeña</option>
                </SelectField>
                <SelectField
                   label="Estado"
                   value={formData.estado}
                   onChange={(e) => setFormData(prev => ({ ...prev, estado: e.target.value }))}
                   required
                >
                   <option value="activo">Activo</option>
                   <option value="bloqueado">Bloqueado</option>
                </SelectField>
                <TextField
                   label="Fecha Alta"
                   type="date"
                   value={formData.fechaAlta || ''}
                   onChange={(e) => setFormData(prev => ({ ...prev, fechaAlta: e.target.value }))}
                   required
                />
                <TextField
                   label="Fecha Baja"
                   type="date"
                   value={formData.fechaBaja || ''}
                   onChange={(e) => setFormData(prev => ({ ...prev, fechaBaja: e.target.value }))}
                />
                <SelectField
                   label="Área"
                   value={formData.areaId}
                   onChange={(e) => setFormData(prev => ({ ...prev, areaId: e.target.value }))}
                   required
                   containerClassName="sm:col-span-2"
                >
                   {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </SelectField>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                   <span className="text-xs font-bold text-[var(--color-text)]">Comentario</span>
                   <textarea
                      value={formData.comentarios || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, comentarios: e.target.value }))}
                      rows={3}
                      className="px-3 py-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none shadow-sm focus:border-[var(--color-primary)] transition-all placeholder:text-[var(--color-text-faint)]"
                      placeholder="Notas adicionales..."
                   />
                </label>
             </div>
          </FormSection>
        </div>
      </SlideOver>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="¿Confirmar eliminación?"
        message="¿Está seguro de que desea eliminar este mensajero? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setMessengerIdToDelete(null);
        }}
        isDanger={true}
      />

      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        entityType="messengers"
        areas={areas}
        onImported={loadMessengers}
      />
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-2">
        <ChevronRight size={10} className="text-[var(--color-brand)]" />
        {title}
      </h3>
      <div className="p-4 bg-[var(--color-surface-2)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
        {children}
      </div>
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3">
       <div className="p-2 rounded-lg bg-white border border-[var(--color-border)] shadow-sm">
          <Icon size={14} className="text-[var(--color-text-faint)]" />
       </div>
       <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">{label}</p>
          <p className="text-sm font-semibold text-[var(--color-text)]">{value || 'N/A'}</p>
       </div>
    </div>
  );
}

function TextField({ label, hint, containerClassName, ...props }: { label: string; hint?: string; containerClassName?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex flex-col gap-1.5", containerClassName)}>
      <span className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1">
        {label}
        {props.required && <span className="text-red-500">*</span>}
      </span>
      <input
        {...props}
        className={cn(
          "h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none shadow-sm",
          "focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/10 transition-all placeholder:text-[var(--color-text-faint)]",
          props.disabled && "bg-gray-100 cursor-not-allowed opacity-60"
        )}
      />
      {hint && <span className="text-[9px] text-[var(--color-text-faint)]">{hint}</span>}
    </label>
  );
}

function SelectField({ label, children, hint, containerClassName, ...props }: { label: string; children: React.ReactNode; hint?: string; containerClassName?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cn("flex flex-col gap-1.5", containerClassName)}>
      <span className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1">
        {label}
        {props.required && <span className="text-red-500">*</span>}
      </span>
      <select
        {...props}
        className={cn(
          "h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none shadow-sm",
          "focus:border-[var(--color-primary)] transition-all",
          props.disabled && "bg-gray-100 cursor-not-allowed opacity-60"
        )}
      >
        {children}
      </select>
      {hint && <span className="text-[10px] text-amber-600 font-medium">{hint}</span>}
    </label>
  );
}
