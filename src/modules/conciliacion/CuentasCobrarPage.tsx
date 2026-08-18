import React, { useState, useMemo } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge, StatusType } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { 
  Plus, 
  Eye, 
  Receipt, 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  TrendingUp, 
  Clock, 
  BadgeAlert, 
  DollarSign, 
  Building2, 
  Users, 
  Coins,
  ArrowDownLeft,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface ReceivableRecord {
  id: string;
  targetName: string;
  type: 'negocio' | 'mensajero';
  period: string;
  totalOrders: number;
  commissionsDue: number;
  cashCollected: number; // COD cash
  netReceivable: number;
  dueDate: string;
  status: StatusType;
  payoutReference?: string;
}

const MOCK_RECEIVABLES: ReceivableRecord[] = [
  {
    id: 'CXC-2025-201',
    targetName: 'El Jardin de los Milagros',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 92,
    commissionsDue: 184.00,
    cashCollected: 0.00,
    netReceivable: 184.00,
    dueDate: '2025-05-24',
    status: 'pendiente'
  },
  {
    id: 'CXC-2025-202',
    targetName: 'Carlos Gómez (Mensajero #45)',
    type: 'mensajero',
    period: '08/05/2025 - 15/05/2025',
    totalOrders: 110,
    commissionsDue: 0.00,
    cashCollected: 1250.00, // Cash collected on delivery to be returned to office
    netReceivable: 1250.00,
    dueDate: '2025-05-18',
    status: 'pendiente'
  },
  {
    id: 'CXC-2025-203',
    targetName: 'La Fontana Trattoria',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 154,
    commissionsDue: 308.00,
    cashCollected: 0.00,
    netReceivable: 308.00,
    dueDate: '2025-05-24',
    status: 'pagado',
    payoutReference: 'COM-REC-9001'
  },
  {
    id: 'CXC-2025-204',
    targetName: 'Elena Rodríguez (Mensajero #18)',
    type: 'mensajero',
    period: '08/05/2025 - 15/05/2025',
    totalOrders: 45,
    commissionsDue: 0.00,
    cashCollected: 540.00,
    netReceivable: 540.00,
    dueDate: '2025-05-18',
    status: 'pagado',
    payoutReference: 'CASH-REC-2211'
  },
  {
    id: 'CXC-2025-205',
    targetName: 'Arepera Central',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    totalOrders: 60,
    commissionsDue: 120.00,
    cashCollected: 0.00,
    netReceivable: 120.00,
    dueDate: '2025-05-24',
    status: 'aprobado'
  }
];

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('es-VE', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(val);
};

export function CuentasCobrarPage() {
  const [activeSegment, setActiveSegment] = useState<'all' | 'negocio' | 'mensajero'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<ReceivableRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCollectOpen, setIsCollectOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Collection modal form
  const [collectReference, setCollectReference] = useState('');
  const [collectNote, setCollectNote] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredItems = useMemo(() => {
    return MOCK_RECEIVABLES.filter(r => {
      const matchesType = activeSegment === 'all' || r.type === activeSegment;
      const matchesSearch = r.targetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            r.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [activeSegment, searchQuery]);

  const stats = useMemo(() => {
    const relevant = MOCK_RECEIVABLES.filter(r => activeSegment === 'all' || r.type === activeSegment);
    const totalCargar = relevant.reduce((acc, curr) => acc + curr.netReceivable, 0);
    const cobrado = relevant.filter(r => r.status === 'pagado').reduce((acc, curr) => acc + curr.netReceivable, 0);
    const aprobado = relevant.filter(r => r.status === 'aprobado').reduce((acc, curr) => acc + curr.netReceivable, 0);
    const pendiente = relevant.filter(r => r.status === 'pendiente').reduce((acc, curr) => acc + curr.netReceivable, 0);

    return { totalCargar, cobrado, aprobado, pendiente };
  }, [activeSegment]);

  const handleRegisterCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    selectedItem.status = 'pagado';
    selectedItem.payoutReference = collectReference || 'REC-AUTO-102';
    setIsCollectOpen(false);
    showToast(`Cobro registrado correctamente. Referencia de Ingreso: ${selectedItem.payoutReference}`);
    setCollectReference('');
    setCollectNote('');
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
              <span className="font-bold text-sm">Cobro Procesado</span>
              <span className="text-[10px] opacity-90 text-white/80">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Cuentas por Cobrar (CXC)</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Supervisión de saldos por cobrar de restaurantes (comisiones) y entrega de efectivo recaudado por mensajeros.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => showToast("Exportando informe general de facturas por cobrar...")}>
            <Download size={16} />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Segment Selector tabs */}
      <div className="flex border-b border-[var(--color-border)] gap-2">
        <button 
          onClick={() => setActiveSegment('all')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'all' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Todas las Cuentas
        </button>
        <button 
          onClick={() => setActiveSegment('negocio')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'negocio' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Comisiones Restaurantes
        </button>
        <button 
          onClick={() => setActiveSegment('mensajero')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'mensajero' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Efectivo de Mensajeros (COD)
        </button>
      </div>

      {/* Stats KPI Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Cartera Total CXC</p>
          <p className="text-2xl font-black text-[var(--color-text)] mt-1 tabular-nums">{formatCurrency(stats.totalCargar)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-text-faint)]">
            <Coins size={12} />
            <span>Cobros totales a conciliar</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Total Recaudado (Cobrado)</p>
          <p className="text-2xl font-black text-[var(--color-success)] mt-1 tabular-nums">{formatCurrency(stats.cobrado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-success)]">
            <CheckCircle size={12} />
            <span>Fondos ingresados a tesorería</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Monto Conciliado (Aprobado)</p>
          <p className="text-2xl font-black text-[var(--color-primary)] mt-1 tabular-nums">{formatCurrency(stats.aprobado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-primary)]">
            <TrendingUp size={12} />
            <span>Verificados listos para cobrar</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Cobros Pendientes</p>
          <p className="text-2xl font-black text-[var(--color-warning)] mt-1 tabular-nums">{formatCurrency(stats.pendiente)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-warning)]">
            <Clock size={12} />
            <span>Fuera de fecha de corte o en mora</span>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-[var(--color-surface)] p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
            <input 
              type="text" 
              placeholder="Buscar cobro por ID o nombre de beneficiario..."
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

        {/* Filters Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-[var(--color-border)] pt-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Rango Vencimiento</label>
                  <input type="date" className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none" />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" className="w-full text-xs h-9" onClick={() => { setSearchQuery(''); setShowFilters(false); }}>Limpiar</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* DataTable */}
      <DataTable<ReceivableRecord>
        columns={[
          {
            header: 'ID / Beneficiario Comercial',
            accessor: (item) => (
              <div className="flex flex-col">
                <span className="font-bold text-sm text-[var(--color-text)]">{item.targetName}</span>
                <span className="text-[10px] text-[var(--color-text-faint)] font-mono uppercase">{item.id}</span>
              </div>
            )
          },
          {
            header: 'Período Operativo',
            accessor: 'period'
          },
          {
            header: 'Total Órdenes',
            accessor: (item) => <span className="font-semibold tabular-nums">{item.totalOrders} und</span>,
            align: 'center'
          },
          {
            header: 'Comisión Mandao',
            accessor: (item) => <span className="tabular-nums font-semibold">{formatCurrency(item.commissionsDue)}</span>,
            align: 'right'
          },
          {
            header: 'Efectivo Recaudado (COD)',
            accessor: (item) => <span className="tabular-nums text-[var(--color-text-muted)]">{formatCurrency(item.cashCollected)}</span>,
            align: 'right'
          },
          {
            header: 'Neto a Cobrar',
            accessor: (item) => (
              <span className="tabular-nums font-extrabold text-sm text-[var(--color-primary)]">
                {formatCurrency(item.netReceivable)}
              </span>
            ),
            align: 'right'
          },
          {
            header: 'Fecha Límite',
            accessor: (item) => (
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] font-medium">
                <Clock size={12} className="opacity-60" />
                <span>{item.dueDate}</span>
              </div>
            )
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
                  onClick={() => { setSelectedItem(item); setIsDetailOpen(true); }}
                  title="Ver Ficha Cobro"
                  className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                >
                  <Eye size={18} />
                </button>
                {item.status !== 'pagado' && (
                  <button 
                    onClick={() => { setSelectedItem(item); setIsCollectOpen(true); }}
                    title="Liquidar Ingreso"
                    className="p-2 text-[var(--color-text-faint)] hover:text-white hover:bg-[var(--color-success)] rounded-md transition-all"
                  >
                    <ArrowDownLeft size={18} />
                  </button>
                )}
              </div>
            ),
            align: 'right'
          }
        ]}
        data={filteredItems}
        onRowClick={(item) => { setSelectedItem(item); setIsDetailOpen(true); }}
      />

      {/* DETAIL SLIDE-OVER */}
      <SlideOver
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Cobro Pendiente: ${selectedItem?.id}`}
        footer={
          <div className="flex gap-3">
            {selectedItem?.status !== 'pagado' && (
              <Button variant="success" className="flex-grow gap-1.5" onClick={() => { setIsCollectOpen(true); setIsDetailOpen(false); }}>
                <ArrowDownLeft size={18} />
                Procesar Recaudación de Fondos
              </Button>
            )}
            <Button variant="outline" className="flex-1 gap-1.5" onClick={() => showToast("Exportando recibo oficial de cobros...")}>
              <Receipt size={18} />
              Recibo PDF
            </Button>
          </div>
        }
      >
        {selectedItem && (
          <div className="space-y-8">
            {/* Status Header */}
            <div className="flex flex-col items-center py-6 bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] shadow-inner">
               <div className="w-16 h-16 rounded-full bg-white border border-[var(--color-border)] flex items-center justify-center shadow-sm mb-3">
                  <Coins className="text-[var(--color-primary)] w-8 h-8" />
               </div>
               <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Cuentas por Cobrar</span>
               <h2 className="text-xl font-black text-[var(--color-text)] mt-1">{selectedItem.id}</h2>
               <StatusBadge status={selectedItem.status} className="mt-3" />
            </div>

            {/* Layout meta detail info */}
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Deudor Comercial" value={selectedItem.targetName} />
              <DetailItem label="Origen Fondos" value={selectedItem.type === 'negocio' ? 'Comisión Restaurante' : 'Efectivo Recaudado COD'} />
              <DetailItem label="Vencimiento" value={selectedItem.dueDate} />
              <DetailItem label="Rango de Fechas" value={selectedItem.period} />
              {selectedItem.payoutReference && (
                <DetailItem label="Referencia de Caja" value={selectedItem.payoutReference} containerClassName="col-span-2 font-mono text-emerald-600" />
              )}
            </div>

            {/* Financial table breakdown */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Resumen de Liquidación</h3>
              <div className="grid grid-cols-1 gap-px bg-[var(--color-border)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                {selectedItem.type === 'negocio' ? (
                  <FinancialItem label="Comisión de Venta Restaurante (Neto)" value={selectedItem.commissionsDue} />
                ) : (
                  <FinancialItem label="Efectivo en Manos de Transportista (COD)" value={selectedItem.cashCollected} />
                )}
                
                <div className="bg-[var(--color-brand)] p-4 flex justify-between items-center border-t border-[var(--color-brand-dark)]">
                  <span className="font-black text-xs uppercase text-[var(--color-brand-ink)] tracking-widest">Total por Recibir</span>
                  <span className="text-xl font-black tabular-nums text-[var(--color-brand-ink)] drop-shadow-sm">
                    {formatCurrency(selectedItem.netReceivable)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* COLLECTION DIALOG SLIDE-OVER */}
      <SlideOver
        isOpen={isCollectOpen}
        onClose={() => setIsCollectOpen(false)}
        title="Registrar Recepción de Fondos (Cobro)"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsCollectOpen(false)}>Cancelar</Button>
            <Button variant="success" className="flex-grow gap-2" onClick={handleRegisterCollection} disabled={!collectReference}>
              <CheckCircle size={18} />
              Confirmar Recepción
            </Button>
          </div>
        }
      >
        {selectedItem && (
          <form onSubmit={handleRegisterCollection} className="space-y-6">
            <div className="p-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl text-left">
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                Está asentando el ingreso financiero para <span className="font-bold text-[var(--color-text)]">{selectedItem.targetName}</span> por un importe total a cobrar de:
              </p>
              <p className="text-2xl font-black text-[var(--color-success)] mt-2 tabular-nums">{formatCurrency(selectedItem.netReceivable)}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">ID del Documento / Depósito Bancario o Caja *</label>
              <input 
                type="text" 
                placeholder="Ej: REC-99283-BNC"
                value={collectReference}
                onChange={(e) => setCollectReference(e.target.value)}
                required
                className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] font-mono outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Notas / Observaciones del Cobro</label>
              <textarea 
                rows={3}
                placeholder="Ej: Recibido efectivo en caja central del mensajero..."
                value={collectNote}
                onChange={(e) => setCollectNote(e.target.value)}
                className="w-full p-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] resize-none"
              />
            </div>
          </form>
        )}
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

function FinancialItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--color-surface)] px-4 py-3 flex justify-between items-center">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <span className="tabular-nums font-semibold text-sm text-[var(--color-text)]">
        {formatCurrency(value)}
      </span>
    </div>
  );
}
