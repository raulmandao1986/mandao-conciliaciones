import React, { useState, useMemo } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge, StatusType } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { 
  Plus, 
  Eye, 
  CreditCard, 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  Building2, 
  Users, 
  Activity,
  ArrowUpRight,
  HandCoins,
  Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface PayoutRecord {
  id: string;
  targetName: string;
  type: 'negocio' | 'mensajero';
  period: string;
  ordersAmount: number;
  adjustments: number; // positive or negative
  taxDeduction: number;
  netPayout: number;
  dueDate: string;
  status: StatusType;
  bankAccount: string;
}

const MOCK_PAYOUTS: PayoutRecord[] = [
  {
    id: 'CXP-2025-101',
    targetName: 'Sabor Venezolano',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    ordersAmount: 1850.00,
    adjustments: -50.00, // discount
    taxDeduction: 185.00,
    netPayout: 1615.00,
    dueDate: '2025-05-24',
    status: 'pendiente',
    bankAccount: 'Banesco Corriente *8823'
  },
  {
    id: 'CXP-2025-102',
    targetName: 'Pedro Infante (Mensajero #02)',
    type: 'mensajero',
    period: '01/05/2025 - 07/05/2025',
    ordersAmount: 320.00,
    adjustments: 15.00, // bonus
    taxDeduction: 0.00,
    netPayout: 335.00,
    dueDate: '2025-05-20',
    status: 'aprobado',
    bankAccount: 'Banco de Venezuela Pago Móvil'
  },
  {
    id: 'CXP-2025-103',
    targetName: 'La Fontana Trattoria',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    ordersAmount: 2450.00,
    adjustments: 0.00,
    taxDeduction: 245.00,
    netPayout: 2205.00,
    dueDate: '2025-05-25',
    status: 'pagado',
    bankAccount: 'Mercantil Corriente *0911'
  },
  {
    id: 'CXP-2025-104',
    targetName: 'Sofía Vergara (Mensajero #09)',
    type: 'mensajero',
    period: '01/05/2025 - 07/05/2025',
    ordersAmount: 410.00,
    adjustments: 0.00,
    taxDeduction: 0.00,
    netPayout: 410.00,
    dueDate: '2025-05-20',
    status: 'pagado',
    bankAccount: 'Banesco Pago Móvil'
  },
  {
    id: 'CXP-2025-105',
    targetName: 'Pastelería Dulce Vista',
    type: 'negocio',
    period: '01/05/2025 - 15/05/2025',
    ordersAmount: 620.00,
    adjustments: -12.50,
    taxDeduction: 62.00,
    netPayout: 545.50,
    dueDate: '2025-05-26',
    status: 'pendiente',
    bankAccount: 'Provincial Corriente *4511'
  }
];

export function CuentasPagarPage() {
  const [activeSegment, setActiveSegment] = useState<'all' | 'negocio' | 'mensajero'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayout, setSelectedPayout] = useState<PayoutRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form payment details
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredPayouts = useMemo(() => {
    return MOCK_PAYOUTS.filter(p => {
      const matchesType = activeSegment === 'all' || p.type === activeSegment;
      const matchesSearch = p.targetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.bankAccount.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [activeSegment, searchQuery]);

  const stats = useMemo(() => {
    const relevant = MOCK_PAYOUTS.filter(p => activeSegment === 'all' || p.type === activeSegment);
    const totalPagar = relevant.reduce((acc, curr) => acc + curr.netPayout, 0);
    const pagado = relevant.filter(p => p.status === 'pagado').reduce((acc, curr) => acc + curr.netPayout, 0);
    const aprobado = relevant.filter(p => p.status === 'aprobado').reduce((acc, curr) => acc + curr.netPayout, 0);
    const pendiente = relevant.filter(p => p.status === 'pendiente').reduce((acc, curr) => acc + curr.netPayout, 0);

    return { totalPagar, pagado, aprobado, pendiente };
  }, [activeSegment]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-VE', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(val);
  };

  const handleProcessPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayout) return;

    selectedPayout.status = 'pagado';
    setIsPayOpen(false);
    showToast(`Pago liquidado con éxito. Referencia: ${paymentReference || 'TXN-AUTO-992'}`);
    setPaymentReference('');
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
              <span className="font-bold text-sm">Transferencia Ejecutada</span>
              <span className="text-[10px] opacity-90 text-white/80">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Cuentas por Pagar (CXP)</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Saldos pendientes y programación de egresos semanales a proveedores y transportistas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => showToast("Exportando listado de transferencias en lote para banco...")}>
            <Download size={16} />
            Exportar Lote TXT
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
          Todos los Egresos
        </button>
        <button 
          onClick={() => setActiveSegment('negocio')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'negocio' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Establecimientos
        </button>
        <button 
          onClick={() => setActiveSegment('mensajero')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'mensajero' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Mensajeros
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Total CXP Cargado</p>
          <p className="text-2xl font-black text-[var(--color-text)] mt-1 tabular-nums">{formatCurrency(stats.totalPagar)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-text-faint)]">
            <Activity size={12} />
            <span>Monto bruto procesado</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Total Liquidado</p>
          <p className="text-2xl font-black text-[var(--color-success)] mt-1 tabular-nums">{formatCurrency(stats.pagado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-success)]">
            <CheckCircle size={12} />
            <span>Pagado con soporte bancario</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Total Aprobado</p>
          <p className="text-2xl font-black text-[var(--color-primary)] mt-1 tabular-nums">{formatCurrency(stats.aprobado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-primary)]">
            <HandCoins size={12} />
            <span>Listo para ejecutar dispersión</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Por Procesar (Pendiente)</p>
          <p className="text-2xl font-black text-[var(--color-warning)] mt-1 tabular-nums">{formatCurrency(stats.pendiente)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-warning)]">
            <Clock size={12} />
            <span>Pendiente de autorización</span>
          </div>
        </div>
      </div>

      {/* Filter and Search toolbar */}
      <div className="bg-[var(--color-surface)] p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-faint)]" />
            <input 
              type="text" 
              placeholder="Buscar egreso por ID, beneficiario o cuenta..."
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

        {/* Expandable Filters */}
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
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Rango Vencimiento</label>
                  <input type="date" className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Estado de Aprobación</label>
                  <select className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none">
                    <option>Todos</option>
                    <option>Pendiente</option>
                    <option>Aprobado</option>
                    <option>Pagado</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" className="w-full text-xs h-9" onClick={() => { setSearchQuery(''); setShowFilters(false); }}>Restablecer</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Table */}
      <DataTable<PayoutRecord>
        columns={[
          {
            header: 'ID / Beneficiario',
            accessor: (item) => (
              <div className="flex flex-col">
                <span className="font-bold text-sm text-[var(--color-text)]">{item.targetName}</span>
                <span className="text-[10px] text-[var(--color-text-faint)] font-mono uppercase">{item.id}</span>
              </div>
            )
          },
          {
            header: 'Período',
            accessor: 'period'
          },
          {
            header: 'Monto Órdenes',
            accessor: (item) => <span className="tabular-nums font-medium">{formatCurrency(item.ordersAmount)}</span>,
            align: 'right'
          },
          {
            header: 'Ajustes',
            accessor: (item) => (
              <span className={cn(
                "tabular-nums font-medium",
                item.adjustments < 0 ? "text-[var(--color-danger)]" : item.adjustments > 0 ? "text-[var(--color-success)]" : "text-[var(--color-text-faint)]"
              )}>
                {item.adjustments > 0 ? '+' : ''}{formatCurrency(item.adjustments)}
              </span>
            ),
            align: 'right'
          },
          {
            header: 'Monto Neto a Pagar',
            accessor: (item) => (
              <span className="tabular-nums font-extrabold text-sm text-[var(--color-text)]">
                {formatCurrency(item.netPayout)}
              </span>
            ),
            align: 'right'
          },
          {
            header: 'Fecha Vence',
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
                  onClick={() => { setSelectedPayout(item); setIsDetailOpen(true); }}
                  title="Detalle del Pago"
                  className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                >
                  <Eye size={18} />
                </button>
                {item.status !== 'pagado' && (
                  <button 
                    onClick={() => { setSelectedPayout(item); setIsPayOpen(true); }}
                    title="Liquidar Transferencia"
                    className="p-2 text-[var(--color-text-faint)] hover:text-white hover:bg-[var(--color-primary)] rounded-md transition-all"
                  >
                    <ArrowUpRight size={18} />
                  </button>
                )}
              </div>
            ),
            align: 'right'
          }
        ]}
        data={filteredPayouts}
        onRowClick={(item) => { setSelectedPayout(item); setIsDetailOpen(true); }}
      />

      {/* DETAIL SLIDE-OVER */}
      <SlideOver
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Egreso Proveedor: ${selectedPayout?.id}`}
        footer={
          <div className="flex gap-3">
            {selectedPayout?.status !== 'pagado' && (
              <Button variant="success" className="flex-grow gap-1.5" onClick={() => { setIsPayOpen(true); setIsDetailOpen(false); }}>
                <ArrowUpRight size={18} />
                Liquidar en Banco Now
              </Button>
            )}
            <Button variant="outline" className="flex-1 gap-1.5" onClick={() => showToast("Exportando recibo de dispersión comercial...")}>
              <Receipt size={18} />
              Imprimir Recibo
            </Button>
          </div>
        }
      >
        {selectedPayout && (
          <div className="space-y-8">
            {/* Header section status */}
            <div className="flex flex-col items-center py-6 bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] shadow-inner">
               <div className="w-16 h-16 rounded-full bg-white border border-[var(--color-border)] flex items-center justify-center shadow-sm mb-3">
                  <CreditCard className="text-[var(--color-primary)] w-8 h-8" />
               </div>
               <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Cuentas por Pagar</span>
               <h2 className="text-xl font-black text-[var(--color-text)] mt-1">{selectedPayout.id}</h2>
               <StatusBadge status={selectedPayout.status} className="mt-3" />
            </div>

            {/* Granular layout detail */}
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Destinatario" value={selectedPayout.targetName} />
              <DetailItem label="Régimen" value={selectedPayout.type === 'negocio' ? 'Establecimiento' : 'Transportista'} />
              <DetailItem label="Vence el" value={selectedPayout.dueDate} />
              <DetailItem label="Período" value={selectedPayout.period} />
              <DetailItem label="Canal Liquidación" value={selectedPayout.bankAccount} containerClassName="col-span-2" />
            </div>

            {/* Granular table */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Cuadro Neto de Operación</h3>
              <div className="grid grid-cols-1 gap-px bg-[var(--color-border)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                <FinancialItem label="Importe Bruto de Ventas" value={selectedPayout.ordersAmount} />
                <FinancialItem label="Retenciones / Impuestos (10%)" value={-selectedPayout.taxDeduction} />
                {selectedPayout.adjustments !== 0 && (
                  <FinancialItem label="Bonos / Deducciones Especiales" value={selectedPayout.adjustments} />
                )}
                <div className="bg-[var(--color-brand)] p-4 flex justify-between items-center border-t border-[var(--color-brand-dark)]">
                  <span className="font-black text-xs uppercase text-[var(--color-brand-ink)] tracking-widest">Neto Liquidar</span>
                  <span className="text-xl font-black tabular-nums text-[var(--color-brand-ink)] drop-shadow-sm">
                    {formatCurrency(selectedPayout.netPayout)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* PAYMENT MODAL SLIDEOVER */}
      <SlideOver
        isOpen={isPayOpen}
        onClose={() => setIsPayOpen(false)}
        title="Confirmar Liquidación de CXP"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsPayOpen(false)}>Cancelar</Button>
            <Button variant="success" className="flex-grow gap-2" onClick={handleProcessPayment} disabled={!paymentReference}>
              <CheckCircle size={18} />
              Confirmar Pago Realizado
            </Button>
          </div>
        }
      >
        {selectedPayout && (
          <form onSubmit={handleProcessPayment} className="space-y-6">
            <div className="p-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl">
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                Está registrando el egreso financiero para el beneficiario <span className="font-bold text-[var(--color-text)]">{selectedPayout.targetName}</span> por un importe total neto de:
              </p>
              <p className="text-2xl font-black text-[var(--color-primary)] mt-2 tabular-nums">{formatCurrency(selectedPayout.netPayout)}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Cuenta Destino</label>
              <input 
                type="text" 
                value={selectedPayout.bankAccount}
                disabled
                className="w-full h-11 px-4 bg-gray-50 border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text-muted)] cursor-not-allowed outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Referencia de Transferencia (Banco) *</label>
              <input 
                type="text" 
                placeholder="Ej: TXN-0199283"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                required
                className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] font-mono outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Fecha de Operación</label>
              <input 
                type="date" 
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] outline-none"
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
      <span className={cn(
        "tabular-nums font-semibold text-sm",
        value < 0 ? "text-[var(--color-danger)]" : "text-[var(--color-text)]"
      )}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('es-VE', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(val);
}
