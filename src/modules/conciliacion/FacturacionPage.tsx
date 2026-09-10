import React, { useState, useMemo } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge, StatusType } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { 
  Plus, 
  Eye, 
  FileText, 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  TrendingUp, 
  Clock, 
  BadgeAlert, 
  DollarSign, 
  Users, 
  Building2, 
  Briefcase,
  Layers,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { logAuditEvent } from '../../lib/supabase';

interface InvoiceRecord {
  id: string;
  targetName: string; // Business or Messenger name
  type: 'negocio' | 'mensajero';
  period: string;
  totalOrders: number;
  subtotal: number;
  tax: number;
  total: number;
  status: StatusType;
  invoiceDate: string;
  dueDate: string;
  payoutMethod: string;
}

const MOCK_INVOICES: InvoiceRecord[] = [
  {
    id: 'FAC-2025-001',
    targetName: 'El Bodegon del Asado',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 145,
    subtotal: 1250.50,
    tax: 125.05,
    total: 1375.55,
    status: 'pagado',
    invoiceDate: '2025-05-16',
    dueDate: '2025-05-30',
    payoutMethod: 'Transferencia Bancaria'
  },
  {
    id: 'FAC-2025-002',
    targetName: 'Tyki Tyki',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 54,
    subtotal: 480.00,
    tax: 48.00,
    total: 528.00,
    status: 'pendiente',
    invoiceDate: '2025-05-16',
    dueDate: '2025-05-30',
    payoutMethod: 'Efectivo Caja'
  },
  {
    id: 'FAC-2025-003',
    targetName: 'La Fontana Trattoria',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 98,
    subtotal: 940.20,
    tax: 94.02,
    total: 1034.22,
    status: 'aprobado',
    invoiceDate: '2025-05-17',
    dueDate: '2025-05-31',
    payoutMethod: 'Transferencia Especial'
  },
  {
    id: 'FAC-2025-004',
    targetName: 'Carlos Gómez (Mensajero #45)',
    type: 'mensajero',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 120,
    subtotal: 350.00,
    tax: 0.00,
    total: 350.00,
    status: 'pagado',
    invoiceDate: '2025-05-16',
    dueDate: '2025-05-20',
    payoutMethod: 'Pago Móvil'
  },
  {
    id: 'FAC-2025-005',
    targetName: 'Marcos Díaz (Mensajero #12)',
    type: 'mensajero',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 85,
    subtotal: 240.00,
    tax: 0.00,
    total: 240.00,
    status: 'pendiente',
    invoiceDate: '2025-05-16',
    dueDate: '2025-05-20',
    payoutMethod: 'Transferencia Bancaria'
  }
];

export function FacturacionPage() {
  const [activeType, setActiveType] = useState<'all' | 'negocio' | 'mensajero'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states
  const [formTarget, setFormTarget] = useState('');
  const [formType, setFormType] = useState<'negocio' | 'mensajero'>('negocio');
  const [formPeriod, setFormPeriod] = useState('01/05/2025 - 15/05/2025');
  const [formOrders, setFormOrders] = useState('10');
  const [formSubtotal, setFormSubtotal] = useState('100.00');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredInvoices = useMemo(() => {
    return MOCK_INVOICES.filter(inv => {
      const matchesType = activeType === 'all' || inv.type === activeType;
      const matchesSearch = inv.targetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            inv.payoutMethod.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [activeType, searchQuery]);

  const stats = useMemo(() => {
    const relevant = MOCK_INVOICES.filter(i => activeType === 'all' || i.type === activeType);
    const totalFacturado = relevant.reduce((acc, curr) => acc + curr.total, 0);
    const pendiente = relevant.filter(i => i.status === 'pendiente').reduce((acc, curr) => acc + curr.total, 0);
    const pagado = relevant.filter(i => i.status === 'pagado').reduce((acc, curr) => acc + curr.total, 0);
    const countPendiente = relevant.filter(i => i.status === 'pendiente').length;

    return { totalFacturado, pendiente, pagado, countPendiente };
  }, [activeType]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-VE', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(val);
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const ordersNum = parseInt(formOrders) || 0;
    const subtotalNum = parseFloat(formSubtotal) || 0;
    const taxNum = formType === 'negocio' ? subtotalNum * 0.1 : 0;
    const totalNum = subtotalNum + taxNum;

    const newInvoice: InvoiceRecord = {
      id: `FAC-2025-0${MOCK_INVOICES.length + 1}`,
      targetName: formTarget,
      type: formType,
      period: formPeriod,
      totalOrders: ordersNum,
      subtotal: subtotalNum,
      tax: taxNum,
      total: totalNum,
      status: 'pendiente',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0],
      payoutMethod: 'Transferencia Bancaria'
    };

    MOCK_INVOICES.unshift(newInvoice);
    setIsFormOpen(false);
    showToast(`Factura ${newInvoice.id} generada con éxito.`);
    logAuditEvent('Facturaciones', 'Factura Creada', {
      id: newInvoice.id,
      target: newInvoice.targetName,
      type: newInvoice.type,
      total: newInvoice.total
    });
    
    // Clear form
    setFormTarget('');
    setFormOrders('10');
    setFormSubtotal('100.00');
  };

  const handleMarkAsPaid = (invoice: InvoiceRecord) => {
    invoice.status = 'pagado';
    showToast(`Factura ${invoice.id} marcada como Pagada.`);
    logAuditEvent('Facturaciones', 'Factura Pagada', {
      id: invoice.id,
      target: invoice.targetName,
      total: invoice.total
    });
    setIsDetailOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-[100] bg-[var(--color-success)] text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 border border-white/20"
          >
            <CheckCircle size={20} />
            <div className="flex flex-col text-left">
              <span className="font-bold text-sm">Operación Exitosa</span>
              <span className="text-[10px] opacity-90 text-white/80">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Facturación de Conciliaciones</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Generación y control de facturas oficiales para Negocios y Mensajeros.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="brand" className="gap-2" onClick={() => setIsFormOpen(true)}>
            <Plus size={18} />
            Generar Nueva Factura
          </Button>
        </div>
      </div>

      {/* Segment Selector tabs */}
      <div className="flex border-b border-[var(--color-border)] gap-2">
        <button 
          onClick={() => setActiveType('all')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeType === 'all' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Ver Todos
        </button>
        <button 
          onClick={() => setActiveType('negocio')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeType === 'negocio' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Solo Negocios
        </button>
        <button 
          onClick={() => setActiveType('mensajero')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeType === 'mensajero' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Solo Mensajeros
        </button>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Total Facturado</p>
          <p className="text-2xl font-black text-[var(--color-text)] mt-1 tabular-nums">{formatCurrency(stats.totalFacturado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-success)]">
            <TrendingUp size={12} />
            <span>Monto total consolidado</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Total Cobrado/Pagado</p>
          <p className="text-2xl font-black text-[var(--color-success)] mt-1 tabular-nums">{formatCurrency(stats.pagado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-success)]">
            <CheckCircle size={12} />
            <span>Fondos liquidados con éxito</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Por Cobrar/Pagar</p>
          <p className="text-2xl font-black text-[var(--color-warning)] mt-1 tabular-nums">{formatCurrency(stats.pendiente)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-warning)]">
            <Clock size={12} />
            <span>Cuentas pendientes por liquidar</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Facturas Pendientes</p>
          <p className="text-2xl font-black text-[var(--color-danger)] mt-1 tabular-nums">{stats.countPendiente}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-danger)]">
            <BadgeAlert size={12} />
            <span>Requieren atención inmediata</span>
          </div>
        </div>
      </div>

      {/* Main Filter and Search Toolbar */}
      <div className="bg-[var(--color-surface)] p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
            <input 
              type="text" 
              placeholder="Buscar factura por ID, beneficiario o método..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm focus:border-[var(--color-primary)] outline-none shadow-sm transition-all"
            />
          </div>
          <Button 
            variant="outline" 
            className={cn("gap-2", showFilters && "bg-[var(--color-surface-2)] border-[var(--color-primary)]")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} />
            Filtros Avanzados
          </Button>
        </div>

        {/* Expandable Advanced Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-[var(--color-border)] pt-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Rango Emisión</label>
                  <input type="date" className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Método de Pago</label>
                  <select className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none">
                    <option>Todos</option>
                    <option>Transferencia Bancaria</option>
                    <option>Pago Móvil</option>
                    <option>Efectivo Caja</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" className="w-full text-xs h-9" onClick={() => { setSearchQuery(''); setShowFilters(false); }}>Restablecer Filtros</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* DataTable */}
      <DataTable<InvoiceRecord>
        columns={[
          {
            header: 'Factura',
            accessor: (item) => (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[var(--color-surface-3)] rounded-lg text-[var(--color-text-muted)]">
                  <FileText size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-[var(--color-text)]">{item.id}</span>
                  <span className="text-[10px] text-[var(--color-text-faint)] uppercase font-medium">{item.invoiceDate}</span>
                </div>
              </div>
            )
          },
          {
            header: 'Beneficiario',
            accessor: (item) => (
              <div className="flex items-center gap-2">
                {item.type === 'negocio' ? <Building2 size={14} className="text-[var(--color-primary)]" /> : <Users size={14} className="text-amber-600" />}
                <span className="font-semibold text-sm text-[var(--color-text)]">{item.targetName}</span>
              </div>
            )
          },
          {
            header: 'Período',
            accessor: 'period'
          },
          {
            header: 'Órdenes',
            accessor: (item) => <span className="tabular-nums font-medium">{item.totalOrders} und</span>,
            align: 'center'
          },
          {
            header: 'Monto Total',
            accessor: (item) => (
              <span className="tabular-nums font-bold text-sm text-[var(--color-text)]">
                {formatCurrency(item.total)}
              </span>
            ),
            align: 'right'
          },
          {
            header: 'Estado',
            accessor: (item) => <StatusBadge status={item.status} />,
            align: 'center'
          },
          {
            header: 'Acciones',
            accessor: (item) => (
              <div className="flex items-center justify-end gap-2">
                <button 
                  onClick={() => { setSelectedInvoice(item); setIsDetailOpen(true); }}
                  title="Ver Detalle Factura"
                  className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                >
                  <Eye size={18} />
                </button>
                {item.status === 'pendiente' && (
                  <button 
                    onClick={() => handleMarkAsPaid(item)}
                    title="Registrar Pago"
                    className="p-2 text-[var(--color-text-faint)] hover:text-white hover:bg-[var(--color-success)] rounded-md transition-all"
                  >
                    <CheckCircle size={18} />
                  </button>
                )}
              </div>
            ),
            align: 'right'
          }
        ]}
        data={filteredInvoices}
        onRowClick={(item) => { setSelectedInvoice(item); setIsDetailOpen(true); }}
      />

      {/* DETAIL SLIDE-OVER */}
      <SlideOver
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Detalle Factura Comercial: ${selectedInvoice?.id}`}
        footer={
          <div className="flex gap-3">
            {selectedInvoice?.status === 'pendiente' && (
              <Button variant="success" className="flex-grow gap-1.5" onClick={() => handleMarkAsPaid(selectedInvoice)}>
                <CheckCircle size={18} />
                Registrar Pago Completo
              </Button>
            )}
            <Button variant="outline" className="flex-1 gap-1.5" onClick={() => showToast("Exportando factura en formato PDF...")}>
              <Download size={18} />
              Exportar PDF
            </Button>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-8">
            {/* Status Header */}
            <div className="flex flex-col items-center py-6 bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] shadow-inner">
               <div className="w-16 h-16 rounded-full bg-white border border-[var(--color-border)] flex items-center justify-center shadow-sm mb-3">
                  <FileText className="text-[var(--color-primary)] w-8 h-8" />
               </div>
               <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Facturación Certificada</span>
               <h2 className="text-xl font-black text-[var(--color-text)] mt-1">{selectedInvoice.id}</h2>
               <StatusBadge status={selectedInvoice.status} className="mt-3" />
            </div>

            {/* Invoice Meta Items */}
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Emisor oficial" value="Mandao Finance C.A." />
              <DetailItem label="Beneficiario" value={selectedInvoice.targetName} />
              <DetailItem label="Fecha Emisión" value={selectedInvoice.invoiceDate} />
              <DetailItem label="Fecha Vencimiento" value={selectedInvoice.dueDate} />
              <DetailItem label="Período Operativo" value={selectedInvoice.period} containerClassName="col-span-2" />
              <DetailItem label="Vía de Pago" value={selectedInvoice.payoutMethod} containerClassName="col-span-2" />
            </div>

            {/* Financial Summary Breakdown */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-2">
                  <DollarSign size={12} className="text-[var(--color-primary)]" />
                  Desglose Fiscal
               </h3>
               
               <div className="grid grid-cols-1 gap-px bg-[var(--color-border)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                  <div className="bg-[var(--color-surface)] px-4 py-3 flex justify-between items-center">
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">Subtotal Neto ({selectedInvoice.totalOrders} órdenes)</span>
                    <span className="tabular-nums font-semibold text-sm">{formatCurrency(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.type === 'negocio' && (
                    <div className="bg-[var(--color-surface)] px-4 py-3 flex justify-between items-center border-t border-[var(--color-border)]">
                      <span className="text-xs font-medium text-[var(--color-text-faint)]">Retención de Comisión / Impuesto (10%)</span>
                      <span className="tabular-nums text-sm text-[var(--color-text-muted)]">{formatCurrency(selectedInvoice.tax)}</span>
                    </div>
                  )}
                  
                  <div className="bg-[var(--color-brand-active)] p-4 flex justify-between items-center border-t border-[var(--color-brand-active-border)]">
                    <span className="font-black text-xs uppercase text-[var(--color-brand-ink)] tracking-widest">Total Factura</span>
                    <span className="text-xl font-black tabular-nums text-[var(--color-brand-ink)] drop-shadow-sm">
                      {formatCurrency(selectedInvoice.total)}
                    </span>
                  </div>
               </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* FORM SLIDE-OVER */}
      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Generar Factura Comercial"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1" onClick={handleCreateInvoice} disabled={!formTarget}>Generar Factura</Button>
          </div>
        }
      >
        <form onSubmit={handleCreateInvoice} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Tipo de Beneficiario *</label>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => { setFormType('negocio'); setFormTarget(''); }}
                className={cn(
                  "flex-1 h-10 border rounded-lg text-xs font-bold flex items-center justify-center gap-2",
                  formType === 'negocio' ? "bg-teal-50 border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] bg-white"
                )}
              >
                <Building2 size={14} />
                Establecimiento (Negocio)
              </button>
              <button 
                type="button"
                onClick={() => { setFormType('mensajero'); setFormTarget(''); }}
                className={cn(
                  "flex-1 h-10 border rounded-lg text-xs font-bold flex items-center justify-center gap-2",
                  formType === 'mensajero' ? "bg-amber-50 border-amber-500 text-amber-700" : "border-[var(--color-border)] text-[var(--color-text-muted)] bg-white"
                )}
              >
                <Users size={14} />
                Mensajero Individual
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Beneficiario Comercial *</label>
            {formType === 'negocio' ? (
              <select 
                value={formTarget} 
                onChange={(e) => setFormTarget(e.target.value)}
                required
                className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm outline-none"
              >
                <option value="">-- Seleccionar Establecimiento --</option>
                <option value="Sabor Venezolano">Sabor Venezolano</option>
                <option value="Arepera Central">Arepera Central</option>
                <option value="Pastelería Dulce Vista">Pastelería Dulce Vista</option>
                <option value="La Fontana Trattoria">La Fontana Trattoria</option>
              </select>
            ) : (
              <select 
                value={formTarget} 
                onChange={(e) => setFormTarget(e.target.value)}
                required
                className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm outline-none"
              >
                <option value="">-- Seleccionar Mensajero --</option>
                <option value="Pedro Infante (Mensajero #02)">Pedro Infante (Mensajero #02)</option>
                <option value="Sofía Vergara (Mensajero #09)">Sofía Vergara (Mensajero #09)</option>
                <option value="Manuel Pérez (Mensajero #14)">Manuel Pérez (Mensajero #14)</option>
                <option value="Luisa Castro (Mensajero #27)">Luisa Castro (Mensajero #27)</option>
              </select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Período de Facturación</label>
            <input 
              type="text" 
              value={formPeriod}
              onChange={(e) => setFormPeriod(e.target.value)}
              className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Cant. Órdenes</label>
              <input 
                type="number" 
                value={formOrders}
                onChange={(e) => setFormOrders(e.target.value)}
                className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Monto Neto ($)</label>
              <input 
                type="number" 
                step="0.01"
                value={formSubtotal}
                onChange={(e) => setFormSubtotal(e.target.value)}
                className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm outline-none font-mono"
              />
            </div>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}

function DetailItem({ label, value, containerClassName }: { label: string; value: string; containerClassName?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 bg-white p-3 rounded-xl border border-[var(--color-border)] shadow-sm", containerClassName)}>
      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">{label}</span>
      <span className="text-sm font-bold text-[var(--color-text)]">{value}</span>
    </div>
  );
}
