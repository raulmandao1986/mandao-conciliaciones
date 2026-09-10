import React, { useState, useMemo } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge, StatusType } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { 
  Plus, 
  Eye, 
  CalendarClock, 
  Search, 
  Filter, 
  Download, 
  CheckCircle, 
  Clock, 
  TrendingUp, 
  DollarSign, 
  Briefcase,
  AlertCircle,
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { logAuditEvent } from '../../lib/supabase';

interface ScheduledPayout {
  id: string;
  recipient: string;
  type: 'negocio' | 'mensajero';
  scheduledDate: string;
  totalOrders: number;
  amount: number;
  accountDetails: string;
  status: 'programado' | 'procesando' | 'ejecutado' | 'fallido';
}

const MOCK_SCHEDULED: ScheduledPayout[] = [
  {
    id: 'PLN-2025-01',
    recipient: 'El Bodegon del Asado',
    type: 'negocio',
    scheduledDate: '2025-05-24',
    totalOrders: 42,
    amount: 1350.25,
    accountDetails: 'Banesco Corriente *8823',
    status: 'programado'
  },
  {
    id: 'PLN-2025-02',
    recipient: 'Tyki Tyki',
    type: 'negocio',
    scheduledDate: '2025-05-24',
    totalOrders: 18,
    amount: 480.00,
    accountDetails: 'Efectivo Caja Central',
    status: 'programado'
  },
  {
    id: 'PLN-2025-03',
    recipient: 'Carlos Gómez (Mensajero #45)',
    type: 'mensajero',
    scheduledDate: '2025-05-20',
    totalOrders: 95,
    amount: 850.50,
    accountDetails: 'Banco de Venezuela Pago Móvil',
    status: 'ejecutado'
  },
  {
    id: 'PLN-2025-04',
    recipient: 'Sofía Vergara (Mensajero #09)',
    type: 'mensajero',
    scheduledDate: '2025-05-20',
    totalOrders: 64,
    amount: 540.00,
    accountDetails: 'Banesco Pago Móvil',
    status: 'ejecutado'
  },
  {
    id: 'PLN-2025-05',
    recipient: 'La Fontana Trattoria',
    type: 'negocio',
    scheduledDate: '2025-05-25',
    totalOrders: 112,
    amount: 2205.00,
    accountDetails: 'Mercantil Corriente *0911',
    status: 'programado'
  },
  {
    id: 'PLN-2025-06',
    recipient: 'Arepera Central',
    type: 'negocio',
    scheduledDate: '2025-05-24',
    totalOrders: 33,
    amount: 320.00,
    accountDetails: 'Provincial Corriente *1124',
    status: 'fallido'
  }
];

export function PlanificacionPagosPage() {
  const [activeSegment, setActiveSegment] = useState<'all' | 'negocio' | 'mensajero'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPayout, setSelectedPayout] = useState<ScheduledPayout | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Scheduling Form
  const [schedRecipient, setSchedRecipient] = useState('');
  const [schedType, setSchedType] = useState<'negocio' | 'mensajero'>('negocio');
  const [schedDate, setSchedDate] = useState(new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0]);
  const [schedAmount, setSchedAmount] = useState('100.00');
  const [schedAccount, setSchedAccount] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const filteredPayouts = useMemo(() => {
    return MOCK_SCHEDULED.filter(p => {
      const matchesType = activeSegment === 'all' || p.type === activeSegment;
      const matchesSearch = p.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [activeSegment, searchQuery]);

  const stats = useMemo(() => {
    const relevant = MOCK_SCHEDULED.filter(p => activeSegment === 'all' || p.type === activeSegment);
    const totalPipeline = relevant.reduce((acc, curr) => acc + curr.amount, 0);
    const ejecutado = relevant.filter(p => p.status === 'ejecutado').reduce((acc, curr) => acc + curr.amount, 0);
    const programado = relevant.filter(p => p.status === 'programado').reduce((acc, curr) => acc + curr.amount, 0);
    const fallido = relevant.filter(p => p.status === 'fallido').reduce((acc, curr) => acc + curr.amount, 0);

    return { totalPipeline, ejecutado, programado, fallido };
  }, [activeSegment]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-VE', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(val);
  };

  const handleCreateSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedRecipient) return;

    const newPayout: ScheduledPayout = {
      id: `PLN-2025-0${MOCK_SCHEDULED.length + 1}`,
      recipient: schedRecipient,
      type: schedType,
      scheduledDate: schedDate,
      totalOrders: 0,
      amount: parseFloat(schedAmount) || 0,
      accountDetails: schedAccount || 'Caja Especial',
      status: 'programado'
    };

    MOCK_SCHEDULED.unshift(newPayout);
    setIsScheduleOpen(false);
    showToast(`Pago programado exitosamente para el día ${schedDate}.`);
    logAuditEvent('Programacion_Pagos', 'Pago Programado', {
      id: newPayout.id,
      recipient: newPayout.recipient,
      amount: newPayout.amount,
      scheduledDate: newPayout.scheduledDate
    });
    
    // reset form
    setSchedRecipient('');
    setSchedAmount('100.00');
    setSchedAccount('');
  };

  const handleExecuteBulk = () => {
    const programados = MOCK_SCHEDULED.filter(p => p.status === 'programado');
    programados.forEach(p => p.status = 'ejecutado');
    showToast(`Ejecutados con éxito un lote de ${programados.length} pagos programados.`);
    logAuditEvent('Programacion_Pagos', 'Lote de Pagos Ejecutados', {
      cantidad: programados.length
    });
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
              <span className="font-bold text-sm">Dispersión Completada</span>
              <span className="text-[10px] opacity-90 text-white/80">{toastMessage}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Planificación y Previsión de Pagos</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Gestión del flujo de caja, colas de transferencias masivas y loteo de egresos comerciales.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExecuteBulk}>
            <CheckCircle size={16} />
            Aprobar Lote Programado
          </Button>
          <Button variant="brand" className="gap-2" onClick={() => setIsScheduleOpen(true)}>
            <Plus size={18} />
            Programar Pago
          </Button>
        </div>
      </div>

      {/* Segment Selector Tabs */}
      <div className="flex border-b border-[var(--color-border)] gap-2">
        <button 
          onClick={() => setActiveSegment('all')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'all' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Pipeline Completo
        </button>
        <button 
          onClick={() => setActiveSegment('negocio')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'negocio' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Previsión Restaurantes
        </button>
        <button 
          onClick={() => setActiveSegment('mensajero')} 
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 transition-all",
            activeSegment === 'mensajero' ? "border-[var(--color-primary)] text-[var(--color-primary)] font-bold" : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          )}
        >
          Previsión Mensajeros
        </button>
      </div>

      {/* Stats KPI Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Caja Programada Total</p>
          <p className="text-2xl font-black text-[var(--color-text)] mt-1 tabular-nums">{formatCurrency(stats.totalPipeline)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-text-faint)]">
            <Layers size={12} />
            <span>Colas totales de dispersión</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider font-semibold">Previsión Liquidada (Ejecutado)</p>
          <p className="text-2xl font-black text-[var(--color-success)] mt-1 tabular-nums">{formatCurrency(stats.ejecutado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-success)]">
            <CheckCircle size={12} />
            <span>Fondos transferidos hoy</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Próximos Pagos (Programado)</p>
          <p className="text-2xl font-black text-[var(--color-primary)] mt-1 tabular-nums">{formatCurrency(stats.programado)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-primary)]">
            <Clock size={12} />
            <span>Bloqueados en calendario</span>
          </div>
        </div>
        <div className="p-5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm">
          <p className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider text-red-500">Rechazados / Fallidos</p>
          <p className="text-2xl font-black text-[var(--color-danger)] mt-1 tabular-nums">{formatCurrency(stats.fallido)}</p>
          <div className="mt-3 flex items-center gap-1 font-medium text-xs text-[var(--color-danger)]">
            <AlertCircle size={12} />
            <span>Requieren corrección de cuenta</span>
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
              placeholder="Buscar planificación por ID, beneficiario..."
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Fecha Planificada</label>
                  <input type="date" className="w-full h-9 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none" />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" className="w-full text-xs h-9" onClick={() => { setSearchQuery(''); setShowFilters(false); }}>Restablecer</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* DataTable */}
      <DataTable<ScheduledPayout>
        columns={[
          {
            header: 'Planificación ID',
            accessor: (item) => (
              <div className="flex flex-col">
                <span className="font-bold text-sm text-[var(--color-text)]">{item.recipient}</span>
                <span className="text-[10px] text-[var(--color-text-faint)] font-mono uppercase">{item.id}</span>
              </div>
            )
          },
          {
            header: 'Fecha Planificada',
            accessor: (item) => (
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] font-medium">
                <Calendar size={12} className="opacity-60" />
                <span>{item.scheduledDate}</span>
              </div>
            )
          },
          {
            header: 'Régimen',
            accessor: (item) => (
              <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-muted)]">
                {item.type}
              </span>
            )
          },
          {
            header: 'Órdenes',
            accessor: (item) => <span className="font-semibold tabular-nums">{item.totalOrders} und</span>,
            align: 'center'
          },
          {
            header: 'Canal de Destino',
            accessor: 'accountDetails'
          },
          {
            header: 'Monto Dispersión',
            accessor: (item) => (
              <span className="tabular-nums font-black text-sm text-[var(--color-text)]">
                {formatCurrency(item.amount)}
              </span>
            ),
            align: 'right'
          },
          {
            header: 'Estado',
            accessor: (item) => {
              // Custom mapper for scheduling status tags
              const statusMapping: Record<string, string> = {
                programado: 'pendiente',
                ejecutado: 'pagado',
                fallido: 'vencido',
                procesando: 'parcial'
              };
              const mapped = statusMapping[item.status as string] || 'pendiente';
              return (
                <div className="flex items-center gap-1.5 justify-center">
                  <StatusBadge status={mapped as any} />
                  <span className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase">{item.status}</span>
                </div>
              );
            },
            align: 'center'
          },
          {
            header: 'Acciones',
            accessor: (item) => (
              <div className="flex items-center justify-end gap-2">
                <button 
                  onClick={() => { setSelectedPayout(item); setIsDetailOpen(true); }}
                  title="Ficha del Egreso"
                  className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 rounded-md transition-all"
                >
                  <Eye size={18} />
                </button>
                {item.status === 'programado' && (
                  <button 
                    onClick={() => {
                      item.status = 'ejecutado';
                      showToast(`Dispersión de ${formatCurrency(item.amount)} enviada a la cola bancaria.`);
                    }}
                    title="Ejecutar Dispersión Bancaria"
                    className="p-2 text-[var(--color-text-faint)] hover:text-white hover:bg-[var(--color-primary)] rounded-md transition-all animate-pulse"
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
        title={`Planificación de Caja: ${selectedPayout?.id}`}
        footer={
          <div className="flex gap-3">
            {selectedPayout?.status === 'programado' && (
              <Button variant="success" className="flex-grow gap-1.5" onClick={() => {
                selectedPayout.status = 'ejecutado';
                setIsDetailOpen(false);
                showToast(`Pago procesado en banco para el receptor ${selectedPayout.recipient}`);
              }}>
                <CheckCircle size={18} />
                Aprobar y Ejecutar Now
              </Button>
            )}
            <Button variant="outline" className="flex-1 gap-1.5" onClick={() => showToast("Exportando ficha de planificación...")}>
              <Download size={18} />
              Imprimir
            </Button>
          </div>
        }
      >
        {selectedPayout && (
          <div className="space-y-8">
            {/* Header section status */}
            <div className="flex flex-col items-center py-6 bg-[var(--color-surface-2)] rounded-2xl border border-[var(--color-border)] shadow-inner">
               <div className="w-16 h-16 rounded-full bg-white border border-[var(--color-border)] flex items-center justify-center shadow-sm mb-3">
                  <CalendarClock className="text-[var(--color-primary)] w-8 h-8" />
               </div>
               <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Planificación Previsional</span>
               <h2 className="text-xl font-black text-[var(--color-text)] mt-1">{selectedPayout.id}</h2>
               <div className="flex items-center gap-1.5 justify-center mt-3">
                 <StatusBadge status={(selectedPayout.status === 'ejecutado' ? 'pagado' : selectedPayout.status === 'fallido' ? 'vencido' : 'pendiente') as any} />
                 <span className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase">{selectedPayout.status}</span>
               </div>
            </div>

            {/* General detailed info */}
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Destinatario" value={selectedPayout.recipient} />
              <DetailItem label="Categoría" value={selectedPayout.type === 'negocio' ? 'Restaurante' : 'Mensajero'} />
              <DetailItem label="Fecha Programada" value={selectedPayout.scheduledDate} />
              <DetailItem label="Banco Destino" value={selectedPayout.accountDetails} containerClassName="col-span-2" />
            </div>

            {/* Financial SUMMARY details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Monto en Cola</h3>
              <div className="p-4 bg-[var(--color-brand-active)] border border-[var(--color-brand-active-border)] rounded-xl flex items-center justify-between">
                <span className="font-extrabold text-xs uppercase tracking-wider text-[var(--color-brand-ink)]">Dispersión Reservada</span>
                <span className="text-2xl font-black text-[var(--color-brand-ink)] tabular-nums">{formatCurrency(selectedPayout.amount)}</span>
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* FORM MODAL SLIDE-OVER */}
      <SlideOver
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        title="Programar Futuro Egreso de Caja"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setIsScheduleOpen(false)}>Cancelar</Button>
            <Button variant="brand" className="flex-grow font-bold" onClick={handleCreateSchedule} disabled={!schedRecipient}>
              Confirmar Programación
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateSchedule} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Tipo de Destinatario</label>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setSchedType('negocio')}
                className={cn(
                  "flex-1 h-10 border rounded-lg text-xs font-bold flex items-center justify-center gap-2",
                  schedType === 'negocio' ? "bg-teal-50 border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)] text-[var(--color-text-muted)] bg-white"
                )}
              >
                Negocio
              </button>
              <button 
                type="button"
                onClick={() => setSchedType('mensajero')}
                className={cn(
                  "flex-1 h-10 border rounded-lg text-xs font-bold flex items-center justify-center gap-2",
                  schedType === 'mensajero' ? "bg-amber-50 border-amber-500 text-amber-700" : "border-[var(--color-border)] text-[var(--color-text-muted)] bg-white"
                )}
              >
                Mensajero
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Beneficiario Comercial *</label>
            <input 
              type="text" 
              placeholder="Ej: Sabor Venezolano o Carlos Gómez"
              value={schedRecipient}
              onChange={(e) => setSchedRecipient(e.target.value)}
              required
              className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Fecha de Programación *</label>
            <input 
              type="date" 
              value={schedDate}
              onChange={(e) => setSchedDate(e.target.value)}
              required
              className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Monto Estimado de Dispersión ($) *</label>
            <input 
              type="number" 
              step="0.01"
              value={schedAmount}
              onChange={(e) => setSchedAmount(e.target.value)}
              required
              className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] font-mono outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text)]">Detalles de la Cuenta de Destino</label>
            <input 
              type="text" 
              placeholder="Ej: Banesco Corriente *8823"
              value={schedAccount}
              onChange={(e) => setSchedAccount(e.target.value)}
              className="w-full h-11 px-4 bg-white border border-[var(--color-border)] rounded-xl text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
            />
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
