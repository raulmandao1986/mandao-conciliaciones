import React, { useState, useMemo, useEffect } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge, StatusType } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { Plus, Eye, ReceiptText, Search, Filter, X, ChevronDown, Download, Calendar, DollarSign, User, FileText, CheckCircle } from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface ConciliacionMovimiento {
  id: string;
  negocio: string;
  fechaI: string;
  fechaF: string;
  metodopago: string;
  descripcion: string;
  referencia: string;
  monto: number;
  estado: StatusType;
  // Detalle adicional
  fechaRealizacion: string;
  ordenesEfectivo: number;
  cxcCU: number;
  ordenesTransfermovil: number;
  cxpTM: number;
  ordenesSaldoMandao: number;
  cxpSM: number;
  ordenesTarjeta: number;
  cxpUS: number;
  responsable: string;
  archivoPDF: string;
}

const MOCK_DATA: ConciliacionMovimiento[] = [
  { 
    id: 'CONC-2024-001', 
    negocio: 'El Bodegon del Asado', 
    fechaI: '2024-05-01', 
    fechaF: '2025-03-30', 
    metodopago: 'Transferencia', 
    descripcion: 'Pago Semanal de Ventas', 
    referencia: 'TXN12345678', 
    monto: 1250.50, 
    estado: 'pagado',
    fechaRealizacion: '2024-05-05',
    ordenesEfectivo: 150.00,
    cxcCU: 20.00,
    ordenesTransfermovil: 800.00,
    cxpTM: 5.00,
    ordenesSaldoMandao: 300.50,
    cxpSM: 0.00,
    ordenesTarjeta: 0,
    cxpUS: 0,
    responsable: 'Admin Central',
    archivoPDF: 'conciliacion_bodegon_may_1.pdf'
  },
  { 
    id: 'CONC-2024-002', 
    negocio: 'Tyki Tyki', 
    fechaI: '2024-05-01', 
    fechaF: '2025-03-30', 
    metodopago: 'Transferencia', 
    descripcion: 'Conciliación Caja Ventas', 
    referencia: 'PAY09876543', 
    monto: -340.00, 
    estado: 'pendiente',
    fechaRealizacion: '2024-05-05',
    ordenesEfectivo: 0,
    cxcCU: 10.00,
    ordenesTransfermovil: 340.00,
    cxpTM: 0,
    ordenesSaldoMandao: 0,
    cxpSM: 0,
    ordenesTarjeta: 0,
    cxpUS: 0,
    responsable: 'Raul Mandao',
    archivoPDF: 'conciliacion_tyki_may_2.pdf'
  },
  { 
    id: 'CONC-2024-003', 
    negocio: 'El Jardin de los Milagros', 
    fechaI: '2024-05-02', 
    fechaF: '2025-03-30', 
    metodopago: 'Transferencia', 
    descripcion: 'Ajuste de Saldo Mensual', 
    referencia: 'ADJ55566677', 
    monto: 15.00, 
    estado: 'aprobado',
    fechaRealizacion: '2024-05-06',
    ordenesEfectivo: 0,
    cxcCU: 0,
    ordenesTransfermovil: 15.00,
    cxpTM: 0,
    ordenesSaldoMandao: 0,
    cxpSM: 0,
    ordenesTarjeta: 0,
    cxpUS: 0,
    responsable: 'Elena Mensajería',
    archivoPDF: 'ajuste_jardin_may.pdf'
  },
];

export function ConciliacionPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedConc, setSelectedConc] = useState<ConciliacionMovimiento | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-VE', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(val);
  };

  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return MOCK_DATA.filter(item => 
      item.negocio.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.metodopago.toLowerCase().includes(q) ||
      item.referencia.toLowerCase().includes(q) ||
      item.responsable.toLowerCase().includes(q) ||
      item.estado.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const handleFacturar = (item: ConciliacionMovimiento) => {
    setSelectedConc(item);
    setBillingSuccess(true);
    setTimeout(() => setBillingSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Toast Mock */}
      <AnimatePresence>
        {billingSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 right-6 z-[100] bg-[var(--color-success)] text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 border border-white/20"
          >
            <CheckCircle size={20} />
            <div className="flex flex-col">
              <span className="font-bold text-sm">Facturación Iniciada</span>
              <span className="text-[10px] opacity-90 text-white/80">Procesando movimiento {selectedConc?.id}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Módulo de Conciliación</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Gestión de movimientos bancarios y cuadre de caja técnico.</p>
        </div>
        <Button variant="brand" className="gap-2" onClick={() => setIsFormOpen(true)}>
          <Plus size={18} />
          Nueva Conciliación
        </Button>
      </div>

      {/* Search and Filter Toolbar */}
      <div className="bg-[var(--color-surface)] p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
            <input 
              type="text" 
              placeholder="Buscar por negocio, ID, referencia o responsable..."
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
            Filtros
          </Button>
        </div>

        {/* Expandable Filter Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-[var(--color-border)] pt-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Rango de Fecha</label>
                  <input type="date" className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Estado</label>
                  <select className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none">
                    <option>Todos</option>
                    <option>Pagado</option>
                    <option>Pendiente</option>
                    <option>Aprobado</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Método de Pago</label>
                  <select className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none">
                    <option>Todos</option>
                    <option>Transferencia</option>
                    <option>Efectivo</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" className="w-full text-xs h-9" onClick={() => setSearchQuery('')}>Limpiar Filtros</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Table */}
      <DataTable<ConciliacionMovimiento>
        columns={[
          {
            header: 'Establecimiento',
            accessor: (item) => (
              <div className="flex flex-col">
                <span className="font-bold text-sm text-[var(--color-text)]">{item.negocio}</span>
                <span className="text-[10px] font-mono text-[var(--color-text-faint)] uppercase">{item.id}</span>
              </div>
            )
          },
          {
            header: 'Período',
            accessor: (item) => (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-medium">
                <span>{item.fechaI}</span>
                <ChevronDown size={12} className="-rotate-90 opacity-40" />
                <span>{item.fechaF}</span>
              </div>
            ),
            align: 'center'
          },
          {
             header: 'Método',
             accessor: 'metodopago'
          },
          {
            header: 'Monto',
            accessor: (item) => (
              <span className={cn(
                "tabular-nums font-bold text-sm",
                item.monto < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"
              )}>
                {formatCurrency(item.monto)}
              </span>
            ),
            align: 'right'
          },
          {
            header: 'Estado',
            accessor: (item) => <StatusBadge status={item.estado} />,
            align: 'center'
          },
          {
            header: 'Acciones',
            accessor: (item) => (
              <div className="flex items-center justify-end gap-2">
                <button 
                  onClick={() => { setSelectedConc(item); setIsDetailOpen(true); }}
                  title="Ver Detalle Completo"
                  className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all group"
                >
                  <Eye size={18} className="group-hover:scale-110 transition-transform" />
                </button>
                <button 
                  onClick={() => handleFacturar(item)}
                  title="Generar Factura"
                  className="p-2 text-[var(--color-text-faint)] hover:text-white hover:bg-[var(--color-success)] rounded-md transition-all group"
                >
                  <ReceiptText size={18} className="group-hover:rotate-12 transition-transform" />
                </button>
              </div>
            ),
            align: 'right'
          }
        ]}
        data={filteredData}
      />

      {/* DETAIL SLIDE-OVER */}
      <SlideOver
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Detalle de Conciliación: ${selectedConc?.id}`}
        footer={
          <div className="flex gap-3">
             <Button variant="success" className="flex-1 gap-2" onClick={() => { handleFacturar(selectedConc!); setIsDetailOpen(false); }}>
               <ReceiptText size={18} />
               Facturar Ahora
             </Button>
             <Button variant="outline" className="flex-1 gap-2" onClick={() => setIsDetailOpen(false)}>
               <Download size={18} />
               Descargar PDF
             </Button>
          </div>
        }
      >
        {selectedConc && (
          <div className="space-y-8">
            {/* Header Status */}
            <div className="flex flex-col items-center py-6 bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] shadow-inner">
               <div className="w-16 h-16 rounded-full bg-white border border-[var(--color-border)] flex items-center justify-center shadow-sm mb-3">
                  <FileText className="text-[var(--color-brand-ink)] w-8 h-8" />
               </div>
               <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Movimiento Oficial</span>
               <h2 className="text-xl font-black text-[var(--color-text)] mt-1">{selectedConc.id}</h2>
               <StatusBadge status={selectedConc.estado} className="mt-3" />
            </div>

            {/* General Info */}
            <div className="grid grid-cols-2 gap-4">
               <DetailItem icon={Calendar} label="Fecha Realización" value={selectedConc.fechaRealizacion} />
               <DetailItem icon={User} label="Responsable" value={selectedConc.responsable} />
               <DetailItem icon={FileText} label="Establecimiento" value={selectedConc.negocio} containerClassName="col-span-2" />
               <DetailItem icon={Calendar} label="Período" value={`${selectedConc.fechaI} al ${selectedConc.fechaF}`} containerClassName="col-span-2" />
               <DetailItem icon={DollarSign} label="Método de Pago" value={selectedConc.metodopago} />
               <DetailItem icon={Download} label="Archivo PDF" value={selectedConc.archivoPDF} valueClassName="truncate text-blue-600 underline cursor-pointer" />
            </div>

            {/* Financial Sections */}
            <div className="space-y-4">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] flex items-center gap-2">
                  <DollarSign size={12} className="text-[var(--color-primary)]" />
                  Desglose Operativo
               </h3>
               
               <div className="grid grid-cols-1 gap-px bg-[var(--color-border)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                  <FinancialItem label="Órdenes Efectivo" value={selectedConc.ordenesEfectivo} />
                  <FinancialItem label="CXC CU" value={selectedConc.cxcCU} isSub />
                  <FinancialItem label="Órdenes Transfermóvil" value={selectedConc.ordenesTransfermovil} />
                  <FinancialItem label="CXP TM" value={selectedConc.cxpTM} isSub />
                  <FinancialItem label="Órdenes Saldo Mandao" value={selectedConc.ordenesSaldoMandao} />
                  <FinancialItem label="CXP SM" value={selectedConc.cxpSM} isSub />
                  <FinancialItem label="Órdenes Tarjeta" value={selectedConc.ordenesTarjeta} />
                  <FinancialItem label="CXP US" value={selectedConc.cxpUS} isSub />
                  
                  <div className="bg-[var(--color-brand)] p-4 flex justify-between items-center">
                    <span className="font-black text-xs uppercase text-[var(--color-brand-ink)] tracking-widest">Total Conciliado</span>
                    <span className="text-xl font-black tabular-nums text-[var(--color-brand-ink)] drop-shadow-sm">
                      {formatCurrency(selectedConc.monto)}
                    </span>
                  </div>
               </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* NEW CONCILIATION FORM */}
      <SlideOver
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="Nueva Conciliación"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-1">Guardar Conciliación</Button>
          </div>
        }
      >
        <div className="space-y-8">
           <FormSection title="Datos del Establecimiento">
              <div className="grid grid-cols-1 gap-4">
                 <TextField label="Negocio / Establecimiento" placeholder="Busque el negocio..." required />
                 <div className="grid grid-cols-2 gap-4">
                    <TextField label="Fecha Inicio" type="date" required />
                    <TextField label="Fecha Final" type="date" required />
                 </div>
                 <TextField label="Método de Pago Predeterminado" placeholder="Ej: Transferencia-Especial" />
              </div>
           </FormSection>

           <FormSection title="Detalle de Órdenes y CX">
              <div className="grid grid-cols-2 gap-4">
                 <TextField label="Órdenes Efectivo" placeholder="0.00" type="number" step="0.01" />
                 <TextField label="CXC CU" placeholder="0.00" type="number" step="0.01" />
                 <TextField label="Órdenes Transfermóvil" placeholder="0.00" type="number" step="0.01" />
                 <TextField label="CXP TM" placeholder="0.00" type="number" step="0.01" />
                 <TextField label="Órdenes Saldo Mandao" placeholder="0.00" type="number" step="0.01" />
                 <TextField label="CXP SM" placeholder="0.00" type="number" step="0.01" />
                 <TextField label="Órdenes Tarjeta" placeholder="0.00" type="number" step="0.01" />
                 <TextField label="CXP US" placeholder="0.00" type="number" step="0.01" />
              </div>
           </FormSection>

           <FormSection title="Soportes y Firma">
              <div className="space-y-4">
                 <TextField label="Responsable del Proceso" placeholder="Usuario operativo" />
                 <div className="group border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] rounded-xl p-8 text-center transition-all bg-[var(--color-surface)] shadow-inner">
                    <Download className="w-8 h-8 text-[var(--color-text-faint)] mx-auto mb-2 opacity-50 group-hover:scale-110 transition-transform" />
                    <p className="text-sm font-bold text-[var(--color-text)]">Cargar Comprobante PDF</p>
                    <p className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider mt-1">Máximo 10MB</p>
                 </div>
              </div>
           </FormSection>
        </div>
      </SlideOver>
    </div>
  );
}

// Helpers
function DetailItem({ icon: Icon, label, value, containerClassName, valueClassName }: { icon: any; label: string; value: string; containerClassName?: string; valueClassName?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 b-white p-3 rounded-xl border border-[var(--color-border)] shadow-sm bg-white", containerClassName)}>
      <div className="flex items-center gap-1.5 opacity-60">
        <Icon size={12} className="text-[var(--color-text-faint)]" />
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">{label}</span>
      </div>
      <span className={cn("text-sm font-bold text-[var(--color-text)]", valueClassName)}>{value}</span>
    </div>
  );
}

function FinancialItem({ label, value, isSub }: { label: string; value: number; isSub?: boolean }) {
  return (
    <div className={cn(
      "flex justify-between items-center px-4 py-3 bg-[var(--color-surface)]",
      isSub && "bg-slate-50/80 pl-8"
    )}>
      <span className={cn("text-xs font-medium", isSub ? "text-[var(--color-text-faint)] italic" : "text-[var(--color-text)]")}>{label}</span>
      <span className={cn("tabular-nums font-bold text-sm", isSub ? "text-[var(--color-text-muted)]" : "text-[var(--color-text)]")}>
        {new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(value)}
      </span>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-faint)] flex items-center gap-2">
        <ChevronDown size={12} className="text-[var(--color-brand)]" />
        {title}
      </h3>
      <div className="p-5 bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] shadow-inner space-y-4">
        {children}
      </div>
    </div>
  );
}

function TextField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1">
        {label}
        {props.required && <span className="text-red-500">*</span>}
      </span>
      <input 
        {...props}
        className={cn(
          "h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm outline-none shadow-sm",
          "focus:border-[var(--color-primary)] focus:ring-4 focus:ring-teal-500/5 transition-all placeholder:text-[var(--color-text-faint)]",
          props.disabled && "bg-gray-100 cursor-not-allowed opacity-50"
        )}
      />
    </label>
  );
}
