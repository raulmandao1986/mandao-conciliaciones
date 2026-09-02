import React, { useState, useMemo, useEffect } from 'react';
import { DataTable } from '../../design-system/patterns/DataTable';
import { StatusBadge } from '../../design-system/primitives/StatusBadge';
import { Button } from '../../design-system/primitives/Button';
import { db, logAuditEvent } from '../../lib/firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
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
  Mail,
  User,
  Hash,
  MapPin,
  Banknote,
  Calendar,
  MessageSquare,
  IdCard,
  Loader2
} from 'lucide-react';
import { SlideOver } from '../../design-system/primitives/SlideOver';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';

const AREAS = ['La Habana', 'Isla de la Juventud', 'Matanzas', 'Santa Clara', 'Trinidad', 'Cienfuegos', 'Holguín'];
// VIAS_PAGO is now loaded dynamically from Firestore 'MetodosPago' collection with aplicaMensajeros: true
const BANCOS = ['BANMET', 'BPA', 'BANDEC'];

interface MessengerRecord {
  id: string;
  nombre: string;
  viaPago: string;
  fechaAlta: string;
  fechaBaja?: string;
  estado: 'activo' | 'bloqueado';
  area: string;
  comentarios?: string;
  ci: string;
  telefono: string;
  correo?: string;
  noContrato: string;
  cuentaFiscal?: {
    titular: string;
    cuenta: string;
    banco: string;
    sucursal: string;
  };
  cuentaPersonal?: {
    titular: string;
    cuenta: string;
    banco: string;
    sucursal: string;
  };
}

export function GestionMensajerosPage({ permissions = [] }: { permissions?: string[] }) {
  const [data, setData] = useState<MessengerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMessenger, setSelectedMessenger] = useState<MessengerRecord | null>(null);
  const [viasPago, setViasPago] = useState<string[]>([]);

  // Real-time payment methods listener
  useEffect(() => {
    const q = query(collection(db, 'MetodosPago'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeMethods = snapshot.docs
        .map(docSub => docSub.data() as any)
        .filter(m => m.aplicaMensajeros !== false && m.estado !== 'inactivo')
        .map(m => m.nombre);
      setViasPago(activeMethods);
    }, (error) => {
      console.error("Error fetching MetodosPago:", error);
      setViasPago([]);
    });
    return () => unsubscribe();
  }, []);
  
  // Real-time listener
  useEffect(() => {
    const q = query(collection(db, 'messengers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MessengerRecord[];
      setData(records);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching messengers:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Form State
  const [showHelp, setShowHelp] = useState(false);
  const [formData, setFormData] = useState<any>({
    nombre: '',
    ci: '',
    telefono: '',
    tarjetaFiscal: '',
    cuentaFiscal: '',
    viaPago: 'Transferencia',
    tipoMochila: 'Grande',
    fechaAlta: new Date().toISOString().split('T')[0],
    fechaBaja: '',
    estado: 'activo',
    area: 'La Habana',
    comentarios: ''
  });

  // Filter State
  const [filters, setFilters] = useState({
    area: '',
    nombre: '',
    ci: '',
    telefono: '',
    tipoMochila: '',
    viaPago: '',
    estado: 'activo'
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [messengerIdToDelete, setMessengerIdToDelete] = useState<string | null>(null);

  // Permission checks
  const canWrite = permissions.includes('all') || permissions.includes('gestion-mensajeros:write');

  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Solo muestra visiblemente los mensajeros que tienen estado Activo
      if (item.estado !== 'activo') return false;

      const matchArea = !filters.area || item.area === filters.area;
      const matchNombre = !filters.nombre || item.nombre.toLowerCase().includes(filters.nombre.toLowerCase());
      const matchCI = !filters.ci || (item.ci || '').includes(filters.ci);
      const matchTelefono = !filters.telefono || (item.telefono || '').includes(filters.telefono);
      const matchMochila = !filters.tipoMochila || (item as any).tipoMochila === filters.tipoMochila;
      const matchVia = !filters.viaPago || item.viaPago === filters.viaPago;
      return matchArea && matchNombre && matchCI && matchTelefono && matchMochila && matchVia;
    });
  }, [data, filters]);

  const handleEdit = (messenger: MessengerRecord) => {
    setSelectedMessenger(messenger);
    setFormData({
      ...messenger,
      tarjetaFiscal: (messenger as any).tarjetaFiscal || '',
      cuentaFiscal: typeof messenger.cuentaFiscal === 'object' ? (messenger.cuentaFiscal?.cuenta || '') : (messenger.cuentaFiscal || ''),
      tipoMochila: (messenger as any).tipoMochila || 'Grande',
      fechaAlta: messenger.fechaAlta || new Date().toISOString().split('T')[0],
      fechaBaja: messenger.fechaBaja || '',
      comentarios: messenger.comentarios || ''
    });
    setShowHelp(false);
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setSelectedMessenger(null);
    setFormData({
      nombre: '',
      ci: '',
      telefono: '',
      tarjetaFiscal: '',
      cuentaFiscal: '',
      viaPago: 'Transferencia',
      tipoMochila: 'Grande',
      fechaAlta: new Date().toISOString().split('T')[0],
      fechaBaja: '',
      estado: 'activo',
      area: 'La Habana',
      comentarios: ''
    });
    setShowHelp(false);
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    try {
      const recordData = {
        ...formData,
        updatedAt: serverTimestamp(),
      };

      if (selectedMessenger) {
        await updateDoc(doc(db, 'messengers', selectedMessenger.id), recordData);
        logAuditEvent('Gestion_Mensajeros', 'Mensajero Actualizado', {
          id: selectedMessenger.id,
          nombre: formData.nombre,
          area: formData.area
        });
      } else {
        const docRef = await addDoc(collection(db, 'messengers'), {
          ...recordData,
          createdAt: serverTimestamp()
        });
        logAuditEvent('Gestion_Mensajeros', 'Mensajero Creado', {
          id: docRef.id,
          nombre: formData.nombre,
          area: formData.area
        });
      }
      setIsFormOpen(false);
    } catch (error) {
      console.error("Error saving messenger:", error);
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
      await deleteDoc(doc(db, 'messengers', messengerIdToDelete));
      logAuditEvent('Gestion_Mensajeros', 'Mensajero Eliminado', {
        id: messengerIdToDelete,
        nombre: target?.nombre || messengerIdToDelete
      });
    } catch (err: any) {
      console.error("Error deleting messenger:", err);
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
        {canWrite && (
          <Button variant="brand" className="gap-2" onClick={handleNew}>
            <Plus size={18} />
            Nuevo Mensajero
          </Button>
        )}
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
                    value={filters.area}
                    onChange={(e) => setFilters(prev => ({ ...prev, area: e.target.value }))}
                  >
                    <option value="">Todas las áreas</option>
                    {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                   <Button variant="ghost" className="text-xs h-9 w-full sm:w-auto" onClick={() => setFilters({ area: '', nombre: '', ci: '', telefono: '', tipoMochila: '', viaPago: '', estado: 'activo' })}>Limpiar Filtros</Button>
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
                <span className="text-sm">{item.area}</span>
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
                  <DetailItem icon={MapPin} label="Área" value={selectedMessenger?.area} />
                  <DetailItem icon={Bike} label="Tipo de Mochila" value={(selectedMessenger as any)?.tipoMochila || 'Grande'} />
                  <DetailItem icon={Calendar} label="Fecha Alta" value={selectedMessenger?.fechaAlta} />
                  <DetailItem icon={Calendar} label="Fecha Baja" value={selectedMessenger?.fechaBaja || 'Vigente'} />
                  <DetailItem icon={MessageSquare} label="Comentarios" value={selectedMessenger?.comentarios} />
               </div>
            </FormSection>

            <FormSection title="Configuración de Cuentas">
               <div className="space-y-4">
                  <DetailItem icon={CreditCard} label="Tarjeta Fiscal" value={(selectedMessenger as any)?.tarjetaFiscal || 'N/A'} />
                  <DetailItem icon={CreditCard} label="Cuenta Fiscal" value={typeof selectedMessenger?.cuentaFiscal === 'object' ? (selectedMessenger.cuentaFiscal?.cuenta || 'N/A') : (selectedMessenger?.cuentaFiscal || 'N/A')} />
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
             <Button variant="brand" className="flex-1" onClick={handleSave}>Guardar</Button>
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
                   value={formData.area}
                   onChange={(e) => setFormData(prev => ({ ...prev, area: e.target.value }))}
                   required
                   containerClassName="sm:col-span-2"
                >
                   {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
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