import React, { useState, useMemo, useEffect } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import {
  Plus,
  Store,
  Filter,
  Search,
  Edit2,
  Eye,
  ExternalLink,
  ChevronRight,
  Trash2,
  CreditCard,
  Phone,
  Mail,
  User,
  Hash,
  Globe,
  MapPin,
  Banknote,
  FileText,
  Loader2,
  Download,
  FileSpreadsheet,
  Printer,
  X
} from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';

const BANCOS = ['BANMET', 'BPA', 'BANDEC'];
const FALLBACK_METODOS_PAGO = ['Transferencia', 'Transferencia-Exterior', 'Transferencia-Especial', 'Transferencia-Efectivo', 'Transferencia-Saldo'];

interface AreaOption {
  id: string;
  nombre: string;
}

interface CuentaBancaria {
  titular: string;
  cuenta: string;
  banco: string;
  sucursal: string;
}

interface CuentaCheque {
  titular: string;
  cuenta: string;
  banco: string;
}

interface CuentaExterior {
  enabled: boolean;
  titular: string;
  cuenta: string;
  prioridad: number;
}

interface CuentaTransferenciaInternacional extends CuentaExterior {
  swift: string;
  banco: string;
  moneda: string;
  tipoCuenta: string;
  direccion: string;
  telefono: string;
  idTitular: string;
}

interface BusinessRecord {
  id: string;
  negocio: string;
  metodoPago: string;
  estado: 'activo' | 'bloqueado';
  areaId: string;
  areaNombre: string;
  contacto: string;
  telefono: string;
  correo: string;
  nombreContrato: string;
  nit: string;
  direccion: string;
  urlExterno: string;
  cuentaCUP: CuentaBancaria;
  cuentaPersonal: CuentaBancaria;
  cuentaCheque: CuentaCheque;
  exteriorZelle: CuentaExterior;
  exteriorTropipay: CuentaExterior;
  exteriorTransferencia: CuentaTransferenciaInternacional;
}

const emptyCuentaBancaria = (): CuentaBancaria => ({ titular: '', cuenta: '', banco: '', sucursal: '' });
const emptyCuentaCheque = (): CuentaCheque => ({ titular: '', cuenta: '', banco: '' });

export function GestionNegociosPage() {
  const { user } = useAuth();
  // RLS "manage_businesses" en Supabase ya restringe la escritura a Super
  // Admin a nivel de base de datos — este check es solo para la UI.
  const canWrite = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [data, setData] = useState<BusinessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessRecord | null>(null);
  const [metodosPago, setMetodosPago] = useState<string[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [saving, setSaving] = useState(false);

  const loadPaymentMethods = async () => {
    const { data: rows, error } = await supabase
      .from('payment_methods')
      .select('name')
      .eq('applies_to_businesses', true)
      .eq('active', true);
    if (error) {
      console.error('Error fetching payment_methods:', error.message);
      setMetodosPago(FALLBACK_METODOS_PAGO);
      return;
    }
    const activeMethods = (rows || []).map((m: any) => m.name);
    setMetodosPago(activeMethods.length === 0 ? FALLBACK_METODOS_PAGO : activeMethods);
  };

  const loadAreas = async () => {
    const { data: rows, error } = await supabase
      .from('areas')
      .select('area_id, name')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching areas:', error.message);
      setAreas([]);
      return;
    }
    setAreas((rows || []).map((a: any) => ({ id: a.area_id, nombre: a.name })));
  };

  const loadBusinesses = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('businesses')
      .select('business_id, name, payment_method, active, area_id, contact_name, phone, email, contract_name, tax_id, address, external_url, cup_account, personal_account, check_account, exterior_zelle, exterior_tropipay, exterior_transfer, areas(name)')
      .order('name', { ascending: true });
    if (error) {
      console.error('Error fetching businesses:', error.message);
      setLoading(false);
      return;
    }
    const records: BusinessRecord[] = (rows || []).map((b: any) => ({
      id: b.business_id,
      negocio: b.name,
      metodoPago: b.payment_method || '',
      estado: b.active ? 'activo' : 'bloqueado',
      areaId: b.area_id || '',
      areaNombre: b.areas?.name || 'N/A',
      contacto: b.contact_name || '',
      telefono: b.phone || '',
      correo: b.email || '',
      nombreContrato: b.contract_name || '',
      nit: b.tax_id || '',
      direccion: b.address || '',
      urlExterno: b.external_url || '',
      cuentaCUP: b.cup_account || emptyCuentaBancaria(),
      cuentaPersonal: b.personal_account || emptyCuentaBancaria(),
      cuentaCheque: b.check_account || emptyCuentaCheque(),
      exteriorZelle: b.exterior_zelle || { enabled: false, titular: '', cuenta: '', prioridad: 1 },
      exteriorTropipay: b.exterior_tropipay || { enabled: false, titular: '', cuenta: '', prioridad: 2 },
      exteriorTransferencia: b.exterior_transfer || { enabled: false, titular: '', cuenta: '', swift: '', banco: '', moneda: 'USD', tipoCuenta: 'Ahorro', direccion: '', telefono: '', idTitular: '', prioridad: 3 }
    }));
    setData(records);
    setLoading(false);
  };

  useEffect(() => {
    loadPaymentMethods();
    loadAreas();
    loadBusinesses();
  }, []);

  // Form State
  const [showHelp, setShowHelp] = useState(false);
  const emptyForm = () => ({
    negocio: '',
    metodoPago: '',
    estado: 'activo',
    areaId: areas[0]?.id || '',
    contacto: '',
    telefono: '',
    correo: '',
    nombreContrato: '',
    nit: '',
    direccion: '',
    urlExterno: '',
    cuentaCUP: emptyCuentaBancaria(),
    cuentaPersonal: emptyCuentaBancaria(),
    cuentaCheque: emptyCuentaCheque(),
    exteriorZelle: { enabled: false, titular: '', cuenta: '', prioridad: 1 },
    exteriorTropipay: { enabled: false, titular: '', cuenta: '', prioridad: 2 },
    exteriorTransferencia: { enabled: false, titular: '', cuenta: '', swift: '', banco: '', moneda: 'USD', tipoCuenta: 'Ahorro', direccion: '', telefono: '', idTitular: '', prioridad: 3 }
  });
  const [formData, setFormData] = useState<any>(emptyForm());

  // Comprehensive Filter State
  const [filters, setFilters] = useState({
    negocio: '',
    metodoPago: '',
    estado: 'activo', // Default: 'activo'
    contacto: '',
    telefono: '',
    correo: '',
    nombreContrato: '',
    nit: '',
    direccion: '',
    areaId: ''
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [businessIdToDelete, setBusinessIdToDelete] = useState<string | null>(null);

  // Filter logic: Default show active businesses, but allow finding blocked businesses via search or explicit state filter
  const filteredData = useMemo(() => {
    const hasSearchQuery = !!(
      filters.negocio.trim() ||
      filters.contacto.trim() ||
      filters.telefono.trim() ||
      filters.correo.trim() ||
      filters.nombreContrato.trim() ||
      filters.nit.trim() ||
      filters.direccion.trim()
    );

    return data.filter(item => {
      if (filters.areaId && item.areaId !== filters.areaId) return false;
      if (filters.metodoPago && item.metodoPago !== filters.metodoPago) return false;

      if (filters.negocio && !item.negocio.toLowerCase().includes(filters.negocio.toLowerCase())) return false;
      if (filters.contacto && !(item.contacto || '').toLowerCase().includes(filters.contacto.toLowerCase())) return false;
      if (filters.telefono && !(item.telefono || '').toLowerCase().includes(filters.telefono.toLowerCase())) return false;
      if (filters.correo && !(item.correo || '').toLowerCase().includes(filters.correo.toLowerCase())) return false;
      if (filters.nombreContrato && !(item.nombreContrato || '').toLowerCase().includes(filters.nombreContrato.toLowerCase())) return false;
      if (filters.nit && !(item.nit || '').toLowerCase().includes(filters.nit.toLowerCase())) return false;
      if (filters.direccion && !(item.direccion || '').toLowerCase().includes(filters.direccion.toLowerCase())) return false;

      if (filters.estado === 'activo') {
        if (!hasSearchQuery && item.estado === 'bloqueado') {
          return false;
        }
      } else if (filters.estado === 'bloqueado') {
        if (item.estado !== 'bloqueado') return false;
      }

      return true;
    });
  }, [data, filters]);

  const handleResetFilters = () => {
    setFilters({
      negocio: '',
      metodoPago: '',
      estado: 'activo',
      contacto: '',
      telefono: '',
      correo: '',
      nombreContrato: '',
      nit: '',
      direccion: '',
      areaId: ''
    });
  };

  // Export to Excel (.csv format with UTF-8 BOM)
  const handleExportExcel = () => {
    setShowExportMenu(false);
    const headers = ['Nombre Negocio', 'Método de Pago', 'Estado', 'Contacto', 'Teléfono', 'Correo', 'Nombre Contrato', 'NIT', 'Dirección', 'Área'];
    const rows = filteredData.map(item => [
      `"${(item.negocio || '').replace(/"/g, '""')}"`,
      `"${(item.metodoPago || '').replace(/"/g, '""')}"`,
      `"${(item.estado || 'activo').replace(/"/g, '""')}"`,
      `"${(item.contacto || '').replace(/"/g, '""')}"`,
      `"${(item.telefono || '').replace(/"/g, '""')}"`,
      `"${(item.correo || '').replace(/"/g, '""')}"`,
      `"${(item.nombreContrato || '').replace(/"/g, '""')}"`,
      `"${(item.nit || '').replace(/"/g, '""')}"`,
      `"${(item.direccion || '').replace(/"/g, '""')}"`,
      `"${(item.areaNombre || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `listado_negocios_${new Date().toISOString().split('T')[0]}.csv`);
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
          <title>Listado de Negocios - Mandao Conciliaciones</title>
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
              <h1>Mandao Conciliaciones - Listado de Negocios</h1>
              <p class="subtitle">Reporte oficial generado el ${new Date().toLocaleString('es-ES')} | Registros exportados: ${filteredData.length}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Negocio</th>
                <th>Método de Pago</th>
                <th>Estado</th>
                <th>Contacto</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Contrato</th>
                <th>NIT</th>
                <th>Dirección</th>
                <th>Área</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(item => `
                <tr>
                  <td><strong>${item.negocio || '-'}</strong></td>
                  <td>${item.metodoPago || '-'}</td>
                  <td><span class="badge ${item.estado === 'bloqueado' ? 'badge-bloqueado' : 'badge-activo'}">${(item.estado || 'activo')}</span></td>
                  <td>${item.contacto || '-'}</td>
                  <td>${item.telefono || '-'}</td>
                  <td>${item.correo || '-'}</td>
                  <td>${item.nombreContrato || '-'}</td>
                  <td>${item.nit || '-'}</td>
                  <td>${item.direccion || '-'}</td>
                  <td>${item.areaNombre || '-'}</td>
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

  const handleEdit = (business: BusinessRecord) => {
    setSelectedBusiness(business);
    setFormData({
      negocio: business.negocio || '',
      metodoPago: business.metodoPago || '',
      estado: business.estado || 'activo',
      areaId: business.areaId,
      contacto: business.contacto || '',
      telefono: business.telefono || '',
      correo: business.correo || '',
      nombreContrato: business.nombreContrato || '',
      nit: business.nit || '',
      direccion: business.direccion || '',
      urlExterno: business.urlExterno || '',
      cuentaCUP: business.cuentaCUP || emptyCuentaBancaria(),
      cuentaPersonal: business.cuentaPersonal || emptyCuentaBancaria(),
      cuentaCheque: business.cuentaCheque || emptyCuentaCheque(),
      exteriorZelle: business.exteriorZelle || { enabled: false, titular: '', cuenta: '', prioridad: 1 },
      exteriorTropipay: business.exteriorTropipay || { enabled: false, titular: '', cuenta: '', prioridad: 2 },
      exteriorTransferencia: business.exteriorTransferencia || { enabled: false, titular: '', cuenta: '', swift: '', banco: '', moneda: 'USD', tipoCuenta: 'Ahorro', direccion: '', telefono: '', idTitular: '', prioridad: 3 }
    });
    setShowHelp(false);
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedBusiness(null);
    setFormData(emptyForm());
    setShowHelp(false);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!formData.negocio || !formData.metodoPago || !formData.areaId) return;
    setSaving(true);
    try {
      const payload = {
        name: formData.negocio,
        payment_method: formData.metodoPago,
        active: formData.estado === 'activo',
        area_id: formData.areaId,
        contact_name: formData.contacto || null,
        phone: formData.telefono || null,
        email: formData.correo || null,
        contract_name: formData.nombreContrato || null,
        tax_id: formData.nit || null,
        address: formData.direccion || null,
        external_url: formData.urlExterno || null,
        cup_account: formData.cuentaCUP,
        personal_account: formData.cuentaPersonal,
        check_account: formData.cuentaCheque,
        exterior_zelle: formData.exteriorZelle,
        exterior_tropipay: formData.exteriorTropipay,
        exterior_transfer: formData.exteriorTransferencia,
        updated_at: new Date().toISOString()
      };

      if (selectedBusiness) {
        const { error } = await supabase.from('businesses').update(payload).eq('business_id', selectedBusiness.id);
        if (error) throw error;
        logAuditEvent('Gestion_Negocios', 'Negocio Actualizado', {
          id: selectedBusiness.id,
          negocio: formData.negocio,
          area: formData.areaId
        });
      } else {
        const { data: inserted, error } = await supabase.from('businesses').insert(payload).select('business_id').single();
        if (error) throw error;
        logAuditEvent('Gestion_Negocios', 'Negocio Creado', {
          id: inserted?.business_id,
          negocio: formData.negocio,
          area: formData.areaId
        });
      }
      setIsFormOpen(false);
      await loadBusinesses();
    } catch (error: any) {
      console.error('Error saving business:', error);
      alert('Error al guardar el negocio. Detalle: ' + (error?.message || error));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequest = (id: string) => {
    setBusinessIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!businessIdToDelete) return;
    try {
      const target = data.find(b => b.id === businessIdToDelete);
      const { error } = await supabase.from('businesses').delete().eq('business_id', businessIdToDelete);
      if (error) throw error;
      logAuditEvent('Gestion_Negocios', 'Negocio Eliminado', {
        id: businessIdToDelete,
        negocio: target?.negocio || businessIdToDelete
      });
      await loadBusinesses();
    } catch (err: any) {
      console.error('Error deleting business:', err);
      alert('Error al eliminar el negocio. Detalle: ' + (err?.message || err));
    } finally {
      setDeleteConfirmOpen(false);
      setBusinessIdToDelete(null);
    }
  };

  const rawMethodLower = (formData.metodoPago || '').trim().toLowerCase();
  const isTransferencia = rawMethodLower === 'transferencia';
  const isEfectivo = rawMethodLower === 'efectivo' || rawMethodLower.includes('efectivo');
  const isCheque = rawMethodLower === 'cheque' || rawMethodLower.includes('cheque');

  const normalizedMethod = (formData.metodoPago || '').replace(/\s+/g, '').replace(/-/g, '').toLowerCase();
  const isTransferenciaEfectivo = normalizedMethod === 'transferenciaefectivo';
  const isTransferenciaExterior = normalizedMethod === 'transferenciaexterior';
  const isTransferenciaEspecial = normalizedMethod === 'transferenciaespecial';

  const showCupSection = isTransferencia || isTransferenciaEfectivo || isTransferenciaExterior || isTransferenciaEspecial;
  const showExteriorSection = isTransferenciaExterior;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--color-brand-subtle)] rounded-xl border border-[var(--color-brand-active-border)] shadow-sm">
             <Store className="w-6 h-6 text-[var(--color-brand-ink)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">Gestión de Negocios</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1 text-balance">Administración y configuración de perfiles operativos de establecimientos.</p>
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
            <Button variant="brand" className="gap-2" onClick={handleNew}>
              <Plus size={18} />
              Nuevo Negocio
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
              placeholder="Buscar por nombre del negocio..."
              className="w-full h-10 pl-10 pr-4 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] shadow-sm"
              value={filters.negocio}
              onChange={(e) => setFilters(prev => ({ ...prev, negocio: e.target.value }))}
            />
          </div>
          <Button
            variant="outline"
            className={cn("gap-2", showFilters && "bg-[var(--color-surface-2)] border-[var(--color-primary)]")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filtros {Object.values(filters).filter(v => v && v !== 'activo').length > 0 && `(${Object.values(filters).filter(v => v && v !== 'activo').length})`}
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
              <div className="p-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-md)] space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                  <span className="text-xs font-bold text-[var(--color-text)] flex items-center gap-2">
                    <Filter size={14} className="text-[var(--color-primary)]" />
                    Filtros de Búsqueda Avanzada
                  </span>
                  <Button variant="ghost" className="text-xs h-7 gap-1" onClick={handleResetFilters}>
                    <X size={12} /> Limpiar Filtros
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Nombre Negocio</label>
                    <input
                      type="text"
                      placeholder="Filtrar por negocio..."
                      className="w-full h-8 px-2.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)]"
                      value={filters.negocio}
                      onChange={(e) => setFilters(prev => ({ ...prev, negocio: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Método de Pago</label>
                    <select
                      className="w-full h-8 px-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none"
                      value={filters.metodoPago}
                      onChange={(e) => setFilters(prev => ({ ...prev, metodoPago: e.target.value }))}
                    >
                      <option value="">Todos los métodos</option>
                      {metodosPago.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Estado</label>
                    <select
                      className="w-full h-8 px-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none"
                      value={filters.estado}
                      onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value }))}
                    >
                      <option value="activo">Activo (Predeterminado)</option>
                      <option value="bloqueado">Bloqueado</option>
                      <option value="Todos">Todos</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Área (Provincia)</label>
                    <select
                      className="w-full h-8 px-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none"
                      value={filters.areaId}
                      onChange={(e) => setFilters(prev => ({ ...prev, areaId: e.target.value }))}
                    >
                      <option value="">Todas las áreas</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Contacto</label>
                    <input
                      type="text"
                      placeholder="Contacto..."
                      className="w-full h-8 px-2.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)]"
                      value={filters.contacto}
                      onChange={(e) => setFilters(prev => ({ ...prev, contacto: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Teléfono</label>
                    <input
                      type="text"
                      placeholder="Teléfono..."
                      className="w-full h-8 px-2.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)]"
                      value={filters.telefono}
                      onChange={(e) => setFilters(prev => ({ ...prev, telefono: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Correo</label>
                    <input
                      type="text"
                      placeholder="Correo..."
                      className="w-full h-8 px-2.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)]"
                      value={filters.correo}
                      onChange={(e) => setFilters(prev => ({ ...prev, correo: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Nombre Contrato</label>
                    <input
                      type="text"
                      placeholder="Contrato..."
                      className="w-full h-8 px-2.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)]"
                      value={filters.nombreContrato}
                      onChange={(e) => setFilters(prev => ({ ...prev, nombreContrato: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">NIT</label>
                    <input
                      type="text"
                      placeholder="NIT..."
                      className="w-full h-8 px-2.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)]"
                      value={filters.nit}
                      onChange={(e) => setFilters(prev => ({ ...prev, nit: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Dirección</label>
                    <input
                      type="text"
                      placeholder="Dirección..."
                      className="w-full h-8 px-2.5 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)]"
                      value={filters.direccion}
                      onChange={(e) => setFilters(prev => ({ ...prev, direccion: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Table with Pagination */}
      <DataTable<BusinessRecord>
        columns={[
          {
            header: 'Negocio',
            accessor: (item: BusinessRecord) => (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-brand-active)] flex items-center justify-center border border-[var(--color-brand-active-border)] shadow-sm">
                   <Store className="w-5 h-5 text-[var(--color-brand-ink)]" />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-[var(--color-text)]">{item.negocio}</span>
                  <span className="text-[10px] font-mono text-[var(--color-text-faint)]">ID: {item.id}</span>
                </div>
              </div>
            )
          },
          {
            header: 'Método de Pago',
            accessor: (item: BusinessRecord) => (
              <div className="flex items-center gap-2">
                <Banknote size={14} className="text-[var(--color-text-faint)]" />
                <span className="text-sm font-medium">{item.metodoPago}</span>
              </div>
            )
          },
          {
            header: 'Contacto / Teléfono',
            accessor: (item: BusinessRecord) => (
              <div className="flex flex-col text-xs">
                <span className="font-semibold text-[var(--color-text)]">{item.contacto || 'N/A'}</span>
                <span className="text-[var(--color-text-faint)]">{item.telefono || item.correo || 'S/D'}</span>
              </div>
            )
          },
          {
            header: 'Contrato / NIT',
            accessor: (item: BusinessRecord) => (
              <div className="flex flex-col text-xs font-mono">
                <span className="text-[var(--color-text)]">{item.nombreContrato || 'N/A'}</span>
                <span className="text-[var(--color-text-faint)]">NIT: {item.nit || 'N/A'}</span>
              </div>
            )
          },
          {
            header: 'Área',
            accessor: (item: BusinessRecord) => (
              <div className="flex items-center gap-1.5">
                <MapPin size={12} className="text-[var(--color-text-faint)]" />
                <span className="text-sm">{item.areaNombre}</span>
              </div>
            )
          },
          {
            header: 'Estado',
            accessor: (item: BusinessRecord) => <StatusBadge status={item.estado} />,
            align: 'center'
          },
          {
            header: 'Acciones',
            accessor: (item: BusinessRecord) => (
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedBusiness(item); setIsDetailsOpen(true); }}
                  className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all group"
                  title="Ver Detalles"
                >
                  <Eye size={18} className="group-hover:scale-110 transition-transform" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                  className={cn(
                    "p-2 rounded-md transition-all group",
                    canWrite ? "text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10" : "opacity-0 invisible select-none"
                  )}
                  title="Editar Negocio"
                  disabled={!canWrite}
                >
                  <Edit2 size={18} className="group-hover:scale-110 transition-transform" />
                </button>
                {canWrite && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRequest(item.id); }}
                    className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-all group"
                    title="Eliminar Negocio"
                  >
                    <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                  </button>
                )}
              </div>
            )
          }
        ]}
        data={filteredData}
        pageSize={10}
      />

      {/* DETAILS SLIDEOVER */}
      <SlideOver
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        title={`Detalles del Negocio: ${selectedBusiness?.negocio}`}
        footer={<Button variant="outline" className="w-full" onClick={() => setIsDetailsOpen(false)}>Cerrar Panel</Button>}
      >
        <div className="space-y-8">
           <div className="flex flex-col items-center py-6">
              <div className="w-24 h-24 rounded-2xl bg-[var(--color-brand-active)] flex items-center justify-center border-4 border-white shadow-xl mb-4">
                 <Store size={48} className="text-[var(--color-brand-ink)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">{selectedBusiness?.negocio}</h3>
              <StatusBadge status={selectedBusiness?.estado || 'activo'} className="mt-2" />
           </div>

           <FormSection title="Información Operativa">
              <div className="space-y-4">
                 <DetailItem icon={MapPin} label="Provincia/Área" value={selectedBusiness?.areaNombre} />
                 <DetailItem icon={Banknote} label="Método de Pago" value={selectedBusiness?.metodoPago} />
                 <DetailItem icon={Hash} label="Nombre Contrato" value={selectedBusiness?.nombreContrato} />
                 <DetailItem icon={FileText} label="NIT (Identificación Tributaria)" value={selectedBusiness?.nit} />
                 <DetailItem icon={MapPin} label="Dirección Física" value={selectedBusiness?.direccion} />
              </div>
           </FormSection>

           <FormSection title="Datos de Contacto">
              <div className="space-y-4">
                 <DetailItem icon={User} label="Persona de Contacto" value={selectedBusiness?.contacto} />
                 <DetailItem icon={Phone} label="Teléfono Directo" value={selectedBusiness?.telefono} />
                 <DetailItem icon={Mail} label="Correo Electrónico" value={selectedBusiness?.correo} />
              </div>
           </FormSection>

           {selectedBusiness?.urlExterno && (
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between">
                 <div>
                    <h4 className="text-sm font-bold text-teal-900">Formulario Externo</h4>
                    <p className="text-xs text-teal-700">Visualizar ficha completa del negocio</p>
                 </div>
                 <Button variant="brand" className="h-8 text-xs gap-2" onClick={() => window.open(selectedBusiness.urlExterno, '_blank')}>
                    <ExternalLink size={14} /> Abrir
                 </Button>
              </div>
           )}

           <FormSection title="Cuentas Bancarias Vinculadas">
              {selectedBusiness?.cuentaCUP && selectedBusiness?.cuentaCUP?.cuenta ? (
                <div className="p-4 bg-white border border-[var(--color-border)] rounded-lg shadow-sm">
                   <div className="flex items-center gap-3 mb-2">
                     <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
                        <CreditCard size={16} className="text-teal-600" />
                     </div>
                     <div>
                        <p className="text-sm font-bold">Cuenta Fiscal CUP (Prioridad 1)</p>
                        <p className="text-[10px] text-teal-600 font-mono">{selectedBusiness.cuentaCUP.cuenta}</p>
                     </div>
                   </div>
                   <div className="text-[10px] grid grid-cols-2 gap-2 text-[var(--color-text-faint)]">
                      <span>Titular: {selectedBusiness.cuentaCUP.titular}</span>
                      <span>Banco: {selectedBusiness.cuentaCUP.banco}</span>
                      <span>Sucursal: {selectedBusiness.cuentaCUP.sucursal}</span>
                   </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--color-text-faint)] italic text-center py-2">Sin cuenta CUP registrada</p>
              )}

              {selectedBusiness?.exteriorZelle?.enabled && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg shadow-sm">
                   <div className="flex items-center gap-3 mb-2">
                     <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Globe size={16} className="text-blue-600" />
                     </div>
                     <div>
                        <p className="text-sm font-bold">Zelle (Prioridad {selectedBusiness.exteriorZelle.prioridad})</p>
                        <p className="text-[10px] text-blue-600 font-mono">{selectedBusiness.exteriorZelle.cuenta}</p>
                     </div>
                   </div>
                   <div className="text-[10px] text-[var(--color-text-faint)]">
                      <span>Titular: {selectedBusiness.exteriorZelle.titular}</span>
                   </div>
                </div>
              )}

              {selectedBusiness?.exteriorTropipay?.enabled && (
                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-lg shadow-sm">
                   <div className="flex items-center gap-3 mb-2">
                     <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <Globe size={16} className="text-indigo-600" />
                     </div>
                     <div>
                        <p className="text-sm font-bold">Tropipay (Prioridad {selectedBusiness.exteriorTropipay.prioridad})</p>
                        <p className="text-[10px] text-indigo-600 font-mono">{selectedBusiness.exteriorTropipay.cuenta}</p>
                     </div>
                   </div>
                   <div className="text-[10px] text-[var(--color-text-faint)]">
                      <span>Titular: {selectedBusiness.exteriorTropipay.titular}</span>
                   </div>
                </div>
              )}

              {selectedBusiness?.exteriorTransferencia?.enabled && (
                <div className="mt-4 p-4 bg-purple-50 border border-purple-100 rounded-lg shadow-sm">
                   <div className="flex items-center gap-3 mb-2">
                     <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Globe size={16} className="text-purple-600" />
                     </div>
                     <div>
                        <p className="text-sm font-bold">Transferencia Internacional (Prioridad {selectedBusiness.exteriorTransferencia.prioridad})</p>
                        <p className="text-[10px] text-purple-600 font-mono">No. {selectedBusiness.exteriorTransferencia.cuenta}</p>
                     </div>
                   </div>
                   <div className="text-[10px] grid grid-cols-2 gap-x-2 gap-y-1 text-[var(--color-text-faint)]">
                      <span>Titular: {selectedBusiness.exteriorTransferencia.titular}</span>
                      <span>Banco: {selectedBusiness.exteriorTransferencia.banco}</span>
                      <span>Swift: {selectedBusiness.exteriorTransferencia.swift}</span>
                      <span>Moneda: {selectedBusiness.exteriorTransferencia.moneda}</span>
                      <span>Tipo: {selectedBusiness.exteriorTransferencia.tipoCuenta}</span>
                      <span>ID: {selectedBusiness.exteriorTransferencia.idTitular}</span>
                      <span className="col-span-2">Dir: {selectedBusiness.exteriorTransferencia.direccion}</span>
                   </div>
                </div>
              )}
           </FormSection>
        </div>
      </SlideOver>

      {/* FORM SLIDEOVER */}
      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={selectedBusiness ? "Editar Negocio" : "Registrar Nuevo Negocio"}
        footer={
          <div className="flex gap-3">
             <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
             <Button variant="brand" className="flex-1" onClick={handleSave} disabled={saving}>
               {saving ? <Loader2 size={16} className="mr-2 inline animate-spin" /> : null}
               Guardar Negocio
             </Button>
          </div>
        }
      >
        <div className="space-y-8 relative">
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
                      <span>💡 Guía de Ayuda: Registro de Establecimientos</span>
                   </div>
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                         <p className="font-bold underline mb-1">Información General</p>
                         <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Nombre del Negocio:</strong> Razón social o nombre comercial.</li>
                            <li><strong>Método de pago:</strong> Selecciona el método operativo principal.</li>
                            <li><strong>Estado:</strong> Activo o Bloqueado temporalmente.</li>
                         </ul>
                      </div>
                      <div>
                         <p className="font-bold underline mb-1">Datos Operativos</p>
                         <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Nombre Contrato:</strong> Nombre o número que valida el contrato.</li>
                            <li><strong>NIT:</strong> Identificación tributaria (solo números).</li>
                            <li><strong>Área:</strong> Provincia donde opera.</li>
                         </ul>
                      </div>
                      <div>
                         <p className="font-bold underline mb-1">Configuración Bancaria</p>
                         <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Transferencia:</strong> Requiere completar Cuenta Fiscal CUP.</li>
                            <li><strong>Exterior:</strong> Permite habilitar pasarelas como Zelle, Tropipay o Cuenta Internacional con su respectiva prioridad.</li>
                         </ul>
                      </div>
                   </div>
                </motion.div>
             )}
          </AnimatePresence>

          <FormSection title="Información General">
             <div className="grid grid-cols-1 gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <TextField
                      label="Nombre del Negocio"
                      value={formData.negocio}
                      onChange={(e) => setFormData(prev => ({ ...prev, negocio: e.target.value }))}
                      required
                   />
                   <SelectField
                     label="Método de Pago"
                     value={formData.metodoPago}
                     onChange={(e) => setFormData(prev => ({ ...prev, metodoPago: e.target.value }))}
                     required
                   >
                      <option value="">Seleccione...</option>
                      {metodosPago.map(m => <option key={m} value={m}>{m}</option>)}
                   </SelectField>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      label="Nombre de Contacto"
                      value={formData.contacto}
                      onChange={(e) => setFormData(prev => ({ ...prev, contacto: e.target.value }))}
                      placeholder="Nombre de la persona responsable"
                   />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <TextField
                      label="Teléfono"
                      value={formData.telefono}
                      onChange={(e) => {
                         const val = e.target.value.replace(/\D/g, '');
                         setFormData(prev => ({ ...prev, telefono: val }));
                      }}
                      placeholder="Solo números"
                      required
                   />
                   <TextField
                      label="Correo Electrónico"
                      value={formData.correo}
                      onChange={(e) => setFormData(prev => ({ ...prev, correo: e.target.value }))}
                      placeholder="negocio@correo.cu"
                   />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <TextField
                     label="Nombre Contrato"
                     value={formData.nombreContrato}
                     onChange={(e) => setFormData(prev => ({ ...prev, nombreContrato: e.target.value }))}
                     placeholder="Ej: Contrato La Habana Cafe"
                     required
                   />
                   <TextField
                     label="NIT (Identificación Tributaria)"
                     value={formData.nit || ''}
                     onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setFormData(prev => ({ ...prev, nit: val }));
                     }}
                     placeholder="Solo números"
                     required
                   />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <TextField
                      label="Dirección Física Completa"
                      value={formData.direccion || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
                      placeholder="Ej: Calle 23 #456 e/ F y G, Vedado"
                      required
                   />
                   <SelectField
                     label="Área (Provincia)"
                     value={formData.areaId}
                     onChange={(e) => setFormData(prev => ({ ...prev, areaId: e.target.value }))}
                     required
                   >
                      {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                   </SelectField>
                </div>

                <TextField
                   label="Enlace de Formulario Externo (Opcional)"
                   value={formData.urlExterno}
                   onChange={(e) => setFormData(prev => ({ ...prev, urlExterno: e.target.value }))}
                   placeholder="https://..."
                />
             </div>
          </FormSection>

          {isTransferencia && (
            <FormSection
              title="Configuración de Cuentas (Transferencia)"
              badge={<span className="bg-teal-100 text-teal-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">MULTICUENTA</span>}
            >
               <div className="space-y-6">
                  <div className="p-4 bg-white border border-[var(--color-border)] rounded-xl relative overflow-hidden shadow-sm space-y-4">
                     <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
                        <CreditCard size={18} className="text-[var(--color-primary)]" />
                        <h4 className="text-xs font-bold text-[var(--color-text)]">Prioridad 1: Cuenta Fiscal</h4>
                     </div>
                     <div className="space-y-4">
                        <TextField
                           label="Titular de la Cuenta"
                           value={formData.cuentaCUP?.titular || ''}
                           onChange={(e) => setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, titular: e.target.value } }))}
                           placeholder="Nombre completo del titular"
                           required
                        />
                        <TextField
                           label="No. Cuenta (16 dígitos)"
                           value={formData.cuentaCUP?.cuenta || ''}
                           onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              if (val.length <= 16) {
                                 setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, cuenta: val } }));
                              }
                           }}
                           placeholder="Ej: 0526245000341519"
                           maxLength={16}
                           hint="Debe tener exactamente 16 dígitos"
                           required
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <SelectField
                              label="Banco"
                              value={formData.cuentaCUP?.banco || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, banco: e.target.value } }))}
                              required
                           >
                              <option value="">Seleccione banco...</option>
                              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                           </SelectField>
                           <TextField
                              label="Sucursal"
                              value={formData.cuentaCUP?.sucursal || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, sucursal: e.target.value } }))}
                              placeholder="Código o Nombre"
                              required
                           />
                        </div>
                     </div>
                  </div>

                  <div className="p-4 bg-white border border-[var(--color-border)] rounded-xl relative overflow-hidden shadow-sm space-y-4">
                     <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
                        <CreditCard size={18} className="text-blue-600" />
                        <h4 className="text-xs font-bold text-[var(--color-text)]">Prioridad 2: Cuenta Personal</h4>
                     </div>
                     <div className="space-y-4">
                        <TextField
                           label="Titular de la Cuenta"
                           value={formData.cuentaPersonal?.titular || ''}
                           onChange={(e) => setFormData(prev => ({ ...prev, cuentaPersonal: { ...prev.cuentaPersonal, titular: e.target.value } }))}
                           placeholder="Nombre completo del titular"
                           required
                        />
                        <TextField
                           label="No. Cuenta (16 dígitos)"
                           value={formData.cuentaPersonal?.cuenta || ''}
                           onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              if (val.length <= 16) {
                                 setFormData(prev => ({ ...prev, cuentaPersonal: { ...prev.cuentaPersonal, cuenta: val } }));
                              }
                           }}
                           placeholder="Ej: 0526245000341519"
                           maxLength={16}
                           hint="Debe tener exactamente 16 dígitos"
                           required
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                           <SelectField
                              label="Banco"
                              value={formData.cuentaPersonal?.banco || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, cuentaPersonal: { ...prev.cuentaPersonal, banco: e.target.value } }))}
                              required
                           >
                              <option value="">Seleccione banco...</option>
                              {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                           </SelectField>
                           <TextField
                              label="Sucursal"
                              value={formData.cuentaPersonal?.sucursal || ''}
                              onChange={(e) => setFormData(prev => ({ ...prev, cuentaPersonal: { ...prev.cuentaPersonal, sucursal: e.target.value } }))}
                              placeholder="Código o Nombre"
                              required
                           />
                        </div>
                     </div>
                  </div>
               </div>
            </FormSection>
          )}

          {isEfectivo && (
            <FormSection title="Configuración de Cuentas (Efectivo)">
               <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                  Para los pagos en Efectivo no es necesario registrar cuentas bancarias.
               </div>
            </FormSection>
          )}

          {isCheque && (
            <FormSection title="Configuración de Cuentas (Cheque)">
               <div className="p-4 bg-white border border-[var(--color-border)] rounded-xl relative overflow-hidden shadow-sm space-y-4">
                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
                     <CreditCard size={18} className="text-purple-600" />
                     <h4 className="text-xs font-bold text-[var(--color-text)]">Cuenta para Cheques</h4>
                  </div>
                  <div className="space-y-4">
                     <TextField
                        label="Titular de la Cuenta para Cheques"
                        value={formData.cuentaCheque?.titular || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, cuentaCheque: { ...prev.cuentaCheque, titular: e.target.value } }))}
                        placeholder="Titular para Cheques"
                        required
                     />
                     <TextField
                        label="No. Cuenta o Referencia"
                        value={formData.cuentaCheque?.cuenta || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, cuentaCheque: { ...prev.cuentaCheque, cuenta: e.target.value } }))}
                        placeholder="No. Cuenta o Referencia"
                        required
                     />
                     <SelectField
                        label="Banco"
                        value={formData.cuentaCheque?.banco || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, cuentaCheque: { ...prev.cuentaCheque, banco: e.target.value } }))}
                        required
                     >
                        <option value="">Seleccione banco...</option>
                        {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                     </SelectField>
                  </div>
               </div>
            </FormSection>
          )}

          {showCupSection && !isTransferencia && !isEfectivo && !isCheque && (
            <FormSection
              title="Configuración de Cuenta en CUP"
              badge={<span className="bg-teal-100 text-teal-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">SEGURA</span>}
            >
               <div className="p-4 bg-white border border-[var(--color-border)] rounded-xl relative overflow-hidden shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                     <CreditCard size={18} className="text-[var(--color-primary)]" />
                     <h4 className="text-xs font-bold text-[var(--color-text)]">Cuenta Fiscal en CUP (Prioridad 1)</h4>
                  </div>
                  <div className="space-y-4">
                     <TextField
                        label="Titular de la Cuenta"
                        value={formData.cuentaCUP?.titular || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, titular: e.target.value } }))}
                        placeholder="Nombre completo del titular"
                        required
                     />
                     <TextField
                        label="No. Cuenta (16 dígitos)"
                        value={formData.cuentaCUP?.cuenta || ''}
                        onChange={(e) => {
                           const val = e.target.value.replace(/\D/g, '');
                           if (val.length <= 16) {
                              setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, cuenta: val } }));
                           }
                        }}
                        placeholder="Ej: 0526245000341519"
                        maxLength={16}
                        hint="Debe tener exactamente 16 dígitos"
                        required
                     />
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SelectField
                           label="Banco"
                           value={formData.cuentaCUP?.banco || ''}
                           onChange={(e) => setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, banco: e.target.value } }))}
                           required
                        >
                           <option value="">Seleccione banco...</option>
                           {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                        </SelectField>
                        <TextField
                           label="Sucursal"
                           value={formData.cuentaCUP?.sucursal || ''}
                           onChange={(e) => setFormData(prev => ({ ...prev, cuentaCUP: { ...prev.cuentaCUP, sucursal: e.target.value } }))}
                           placeholder="Código o Nombre"
                           required
                        />
                     </div>
                  </div>
               </div>
            </FormSection>
          )}

          {showExteriorSection && (
            <FormSection
              title="Configuración de Pasarelas Internacionales"
              badge={<span className="bg-blue-100 text-blue-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">MULTICUENTA</span>}
            >
               <div className="space-y-6">
                  <div className="p-4 bg-white border border-[var(--color-border)] rounded-xl relative overflow-hidden shadow-sm space-y-4">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input
                           type="checkbox"
                           checked={formData.exteriorZelle?.enabled || false}
                           onChange={(e) => setFormData(prev => ({
                             ...prev,
                             exteriorZelle: { ...prev.exteriorZelle, enabled: e.target.checked }
                           }))}
                           className="w-4 h-4 text-[var(--color-primary)] border-gray-300 rounded focus:ring-teal-500"
                        />
                        <span className="text-xs font-bold text-[var(--color-text)]">Habilitar Pago vía Zelle</span>
                     </label>

                     <AnimatePresence>
                        {formData.exteriorZelle?.enabled && (
                           <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden space-y-4 pt-2 border-t border-gray-100"
                           >
                              <TextField
                                 label="Titular de Zelle"
                                 value={formData.exteriorZelle?.titular || ''}
                                 onChange={(e) => setFormData(prev => ({ ...prev, exteriorZelle: { ...prev.exteriorZelle, titular: e.target.value } }))}
                                 placeholder="Nombre de la persona o negocio"
                                 required
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 <TextField
                                    label="Cuenta (Correo o Teléfono)"
                                    value={formData.exteriorZelle?.cuenta || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorZelle: { ...prev.exteriorZelle, cuenta: e.target.value } }))}
                                    placeholder="zelle@negocio.com"
                                    required
                                 />
                                 <SelectField
                                    label="Prioridad de Uso"
                                    value={formData.exteriorZelle?.prioridad || 1}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorZelle: { ...prev.exteriorZelle, prioridad: Number(e.target.value) } }))}
                                    required
                                 >
                                    <option value={1}>1 (Máxima prioridad)</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3 (Mínima prioridad)</option>
                                 </SelectField>
                              </div>
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </div>

                  <div className="p-4 bg-white border border-[var(--color-border)] rounded-xl relative overflow-hidden shadow-sm space-y-4">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input
                           type="checkbox"
                           checked={formData.exteriorTropipay?.enabled || false}
                           onChange={(e) => setFormData(prev => ({
                             ...prev,
                             exteriorTropipay: { ...prev.exteriorTropipay, enabled: e.target.checked }
                           }))}
                           className="w-4 h-4 text-[var(--color-primary)] border-gray-300 rounded focus:ring-teal-500"
                        />
                        <span className="text-xs font-bold text-[var(--color-text)]">Habilitar Pago vía Tropipay</span>
                     </label>

                     <AnimatePresence>
                        {formData.exteriorTropipay?.enabled && (
                           <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden space-y-4 pt-2 border-t border-gray-100"
                           >
                              <TextField
                                 label="Titular de Tropipay"
                                 value={formData.exteriorTropipay?.titular || ''}
                                 onChange={(e) => setFormData(prev => ({ ...prev, exteriorTropipay: { ...prev.exteriorTropipay, titular: e.target.value } }))}
                                 placeholder="Nombre de la persona o negocio"
                                 required
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 <TextField
                                    label="Cuenta o ID Tropipay"
                                    value={formData.exteriorTropipay?.cuenta || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTropipay: { ...prev.exteriorTropipay, cuenta: e.target.value } }))}
                                    placeholder="email@tropipay.cu"
                                    required
                                 />
                                 <SelectField
                                    label="Prioridad de Uso"
                                    value={formData.exteriorTropipay?.prioridad || 2}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTropipay: { ...prev.exteriorTropipay, prioridad: Number(e.target.value) } }))}
                                    required
                                 >
                                    <option value={1}>1 (Máxima prioridad)</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3 (Mínima prioridad)</option>
                                 </SelectField>
                              </div>
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </div>

                  <div className="p-4 bg-white border border-[var(--color-border)] rounded-xl relative overflow-hidden shadow-sm space-y-4">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input
                           type="checkbox"
                           checked={formData.exteriorTransferencia?.enabled || false}
                           onChange={(e) => setFormData(prev => ({
                             ...prev,
                             exteriorTransferencia: { ...prev.exteriorTransferencia, enabled: e.target.checked }
                           }))}
                           className="w-4 h-4 text-[var(--color-primary)] border-gray-300 rounded focus:ring-teal-500"
                        />
                        <span className="text-xs font-bold text-[var(--color-text)]">Habilitar Transferencia Internacional</span>
                     </label>

                     <AnimatePresence>
                        {formData.exteriorTransferencia?.enabled && (
                           <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden space-y-4 pt-2 border-t border-gray-100"
                           >
                              <TextField
                                 label="Titular de la Cuenta"
                                 value={formData.exteriorTransferencia?.titular || ''}
                                 onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, titular: e.target.value } }))}
                                 placeholder="Nombre y Apellidos completos del titular"
                                 required
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                 <TextField
                                    label="No. Cuenta Bancaria"
                                    value={formData.exteriorTransferencia?.cuenta || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, cuenta: e.target.value } }))}
                                    placeholder="Ej: 1234567890"
                                    required
                                 />
                                 <TextField
                                    label="Swift / ACH Routing"
                                    value={formData.exteriorTransferencia?.swift || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, swift: e.target.value } }))}
                                    placeholder="Ej: BOFAUS3N"
                                    required
                                 />
                                 <TextField
                                    label="Banco Destino"
                                    value={formData.exteriorTransferencia?.banco || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, banco: e.target.value } }))}
                                    placeholder="Ej: Bank of America"
                                    required
                                 />
                                 <TextField
                                    label="Moneda"
                                    value={formData.exteriorTransferencia?.moneda || 'USD'}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, moneda: e.target.value } }))}
                                    placeholder="Ej: USD, EUR"
                                    required
                                 />
                                 <TextField
                                    label="Tipo de Cuenta"
                                    value={formData.exteriorTransferencia?.tipoCuenta || 'Ahorro'}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, tipoCuenta: e.target.value } }))}
                                    placeholder="Corriente, Ahorros, etc."
                                    required
                                 />
                                 <TextField
                                    label="Teléfono del Titular"
                                    value={formData.exteriorTransferencia?.telefono || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, telefono: e.target.value } }))}
                                    placeholder="Ej: +1 305 123 4567"
                                    required
                                 />
                                 <TextField
                                    label="Dirección Completa (Titular)"
                                    value={formData.exteriorTransferencia?.direccion || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, direccion: e.target.value } }))}
                                    placeholder="Ej: 123 Main St, Miami FL, 33101"
                                    containerClassName="sm:col-span-2"
                                    required
                                 />
                                 <TextField
                                    label="ID del Titular"
                                    value={formData.exteriorTransferencia?.idTitular || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, idTitular: e.target.value } }))}
                                    placeholder="Ej: PASAPORTE / DNI"
                                    containerClassName="sm:col-span-2"
                                    required
                                 />
                                 <SelectField
                                    label="Prioridad de Uso"
                                    value={formData.exteriorTransferencia?.prioridad || 3}
                                    onChange={(e) => setFormData(prev => ({ ...prev, exteriorTransferencia: { ...prev.exteriorTransferencia, prioridad: Number(e.target.value) } }))}
                                    containerClassName="sm:col-span-2"
                                    required
                                 >
                                    <option value={1}>1 (Máxima prioridad)</option>
                                    <option value={2}>2</option>
                                    <option value={3}>3 (Mínima prioridad)</option>
                                 </SelectField>
                              </div>
                           </motion.div>
                        )}
                     </AnimatePresence>
                  </div>
               </div>
            </FormSection>
          )}
        </div>
      </SlideOver>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="¿Confirmar eliminación?"
        message="¿Está seguro de que desea eliminar este negocio? Esta acción no se puede deshacer."
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setBusinessIdToDelete(null);
        }}
        isDanger={true}
      />
    </div>
  );
}

// Support Components
function FormSection({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-2">
          <ChevronRight size={10} className="text-[var(--color-brand)]" />
          {title}
        </h3>
        {badge}
      </div>
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

function SelectField({ label, children, containerClassName, ...props }: { label: string; children: React.ReactNode; containerClassName?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
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
    </label>
  );
}
