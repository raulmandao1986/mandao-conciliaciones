import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Search, Calendar, RefreshCw, ChevronLeft, ChevronRight, Filter, Info, Eye, X, ClipboardList, Loader2 } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import { formatDatetime } from '../../lib/formatters';

interface AuditLogRecord {
  id: string;
  module: string;
  action: string;
  user: string;
  timestamp: string | null;
  details?: any;
}

export function LogsAuditoriaPage() {
  const [data, setData] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModule, setFilterModule] = useState('Todos');
  const [filterDateInicio, setFilterDateInicio] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      const { data: rows, error } = await supabase
        .from('audit_logs')
        .select('log_id, module, action, occurred_at, details')
        .order('occurred_at', { ascending: false })
        .limit(500);
      if (error) {
        console.error('Error fetching audit_logs:', error.message);
        setLoading(false);
        return;
      }
      const records: AuditLogRecord[] = (rows || []).map((r: any) => ({
        id: r.log_id,
        module: r.module || 'Otros',
        action: r.action || 'Acción',
        user: r.details?.user_email || 'Sistema',
        timestamp: r.occurred_at,
        details: r.details || null
      }));
      setData(records);
      setLoading(false);
    };
    loadLogs();
  }, []);

  // Filter and process the records
  const filteredData = useMemo(() => {
    return data.filter(item => {
      // 1. Text Search query filter
      const textMatch =
        item.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.details && typeof item.details === 'object' && JSON.stringify(item.details).toLowerCase().includes(searchQuery.toLowerCase()));

      if (!textMatch) return false;

      // 2. Module / Process filter mapping
      if (filterModule !== 'Todos') {
        const normalizedItemModule = (item.module || '').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const normalizedAction = (item.action || '').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const mappedModuleFilter = filterModule.toLowerCase();

        if (mappedModuleFilter === 'verificacion' &&
            !normalizedItemModule.includes('verificac') &&
            !normalizedAction.includes('verificac')) return false;

        if (mappedModuleFilter === 'revision' &&
            !normalizedItemModule.includes('revis') &&
            !normalizedAction.includes('revis')) return false;

        if (mappedModuleFilter === 'disponibilidad' &&
            !normalizedItemModule.includes('disponibilid') &&
            !normalizedAction.includes('disponibilid')) return false;

        if (mappedModuleFilter === 'conciliaciones' &&
            !normalizedItemModule.includes('concilia') &&
            !normalizedAction.includes('concilia')) return false;

        if (mappedModuleFilter === 'facturaciones' &&
            !normalizedItemModule.includes('factura') &&
            !normalizedAction.includes('factura')) return false;

        if (mappedModuleFilter === 'programacion_pagos' &&
            !normalizedItemModule.includes('pago') &&
            !normalizedItemModule.includes('planificac') &&
            !normalizedItemModule.includes('programac') &&
            !normalizedAction.includes('pago') &&
            !normalizedAction.includes('planificac') &&
            !normalizedAction.includes('programac')) return false;

        if (mappedModuleFilter === 'gestion_negocios' &&
            !normalizedItemModule.includes('negocio') &&
            !normalizedAction.includes('negocio')) return false;

        if (mappedModuleFilter === 'gestion_mensajeros' &&
            !normalizedItemModule.includes('mensajer') &&
            !normalizedItemModule.includes('repartidor') &&
            !normalizedAction.includes('mensajer') &&
            !normalizedAction.includes('repartidor')) return false;

        if (mappedModuleFilter === 'configuraciones' &&
            !normalizedItemModule.includes('config') &&
            !normalizedItemModule.includes('rol') &&
            !normalizedItemModule.includes('usuario') &&
            !normalizedItemModule.includes('area') &&
            !normalizedItemModule.includes('metodo') &&
            !normalizedItemModule.includes('razon') &&
            !normalizedAction.includes('rol') &&
            !normalizedAction.includes('usuario') &&
            !normalizedAction.includes('area') &&
            !normalizedAction.includes('metodo') &&
            !normalizedAction.includes('razon')) return false;
      }

      // 3. Date period filter
      const logTime: Date | null = item.timestamp ? new Date(item.timestamp) : null;

      if (logTime) {
        if (filterDateInicio) {
          const startDate = new Date(filterDateInicio);
          startDate.setHours(0, 0, 0, 0);
          if (logTime < startDate) return false;
        }

        if (filterDateFin) {
          const endDate = new Date(filterDateFin);
          endDate.setHours(23, 59, 59, 999);
          if (logTime > endDate) return false;
        }
      } else if (filterDateInicio || filterDateFin) {
        return false;
      }

      return true;
    });
  }, [data, searchQuery, filterModule, filterDateInicio, filterDateFin]);

  // Sorting states
  const [sortField, setSortField] = useState<'timestamp' | 'module' | 'action' | 'user'>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Reset page whenever filters switch
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterModule, filterDateInicio, filterDateFin]);

  // Sort the filtered data
  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (sortField === 'timestamp') {
        const aTime = aVal ? new Date(aVal).getTime() : 0;
        const bTime = bVal ? new Date(bVal).getTime() : 0;
        return sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
      }

      const aStr = String(aVal || '').toLowerCase();
      const bStr = String(bVal || '').toLowerCase();
      if (aStr < bStr) return sortDirection === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortField, sortDirection]);

  // Pagination indices
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const currentLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, currentPage]);

  const handleSort = (field: 'timestamp' | 'module' | 'action' | 'user') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const renderSortIndicator = (field: 'timestamp' | 'module' | 'action' | 'user') => {
    if (sortField !== field) return <span className="ml-1 text-slate-300">↕</span>;
    return sortDirection === 'asc' ? <span className="ml-1 text-[var(--color-primary)]">▲</span> : <span className="ml-1 text-[var(--color-primary)]">▼</span>;
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setFilterModule('Todos');
    setFilterDateInicio('');
    setFilterDateFin('');
    setCurrentPage(1);
  };

  const formatLogTimestamp = (ts: string | null): string => {
    if (!ts) return 'N/R';
    try {
      return formatDatetime(new Date(ts));
    } catch {
      return 'Fecha inválida';
    }
  };

  // Helper method for badge styling
  const getModuleBadgeColor = (module: string) => {
    const m = (module || '').toLowerCase().normalize("NFD").replace(/[0300-036f]/g, "");
    if (m.includes('verificac')) {
      return 'bg-teal-50 text-teal-700 border-teal-200';
    }
    if (m.includes('revis')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (m.includes('disponibilid')) {
      return 'bg-sky-50 text-sky-700 border-sky-200';
    }
    if (m.includes('concilia')) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
    if (m.includes('factura')) {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    }
    if (m.includes('pago') || m.includes('planificac') || m.includes('programac')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (m.includes('negocio')) {
      return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (m.includes('mensajer') || m.includes('repartidor')) {
      return 'bg-orange-50 text-orange-700 border-orange-200';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  // Render modular page buttons
  const renderPageButtons = () => {
    const buttons = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      buttons.push(
        <button
          key={i}
          onClick={() => setCurrentPage(i)}
          className={cn(
            "h-10 w-10 text-xs font-bold rounded-[var(--radius-sm)] transition",
            currentPage === i
              ? "bg-[var(--color-primary)] text-white"
              : "border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          )}
        >
          {i}
        </button>
      );
    }
    return buttons;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)] tracking-tight">Logs de Siniestros y Auditoría</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Consulte y filtre las trazas auditables y los registros operacionales del ecosistema Mandao.
          </p>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-5 shadow-sm space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
          <Filter size={14} className="text-[var(--color-primary)]" />
          Filtros de Búsqueda de Logs
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Module Selector */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">Proceso</span>
            <select
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
              className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="Todos">Todos los Procesos</option>
              <option value="Verificacion">Verificaciones</option>
              <option value="Revision">Revisiones (Dif. Externas)</option>
              <option value="Disponibilidad">Disponibilidades</option>
              <option value="Conciliaciones">Conciliaciones</option>
              <option value="Facturaciones">Facturaciones</option>
              <option value="Programacion_Pagos">Programación de Pagos</option>
              <option value="Gestion_Negocios">Gestión de Negocios</option>
              <option value="Gestion_Mensajeros">Gestión de Mensajeros</option>
              <option value="Configuraciones">Configuraciones de Sistema</option>
            </select>
          </div>

          {/* Date Picker Start */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">Fecha Inicial</span>
            <div className="relative">
              <input
                type="date"
                value={filterDateInicio}
                onChange={(e) => setFilterDateInicio(e.target.value)}
                className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-3 pr-8 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20"
              />
              <Calendar className="absolute right-2.5 top-2.5 text-slate-400 shrink-0 pointer-events-none" size={14} />
            </div>
          </div>

          {/* Date Picker End */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">Fecha Final</span>
            <div className="relative">
              <input
                type="date"
                value={filterDateFin}
                onChange={(e) => setFilterDateFin(e.target.value)}
                className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-3 pr-8 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20"
              />
              <Calendar className="absolute right-2.5 top-2.5 text-slate-400 shrink-0 pointer-events-none" size={14} />
            </div>
          </div>

          {/* Free Text Search */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">Buscar por Texto</span>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por usuario, acción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] pl-8 pr-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20"
              />
              <Search className="absolute left-2.5 top-3 text-slate-400" size={14} />
            </div>
          </div>
        </div>

        {/* Clear Filters Row */}
        {(filterModule !== 'Todos' || filterDateInicio || filterDateFin || searchQuery) && (
          <div className="flex justify-end pt-2">
            <button
              onClick={handleClearFilters}
              className="text-xs font-bold text-[var(--color-primary)] hover:text-teal-700 transition flex items-center gap-1"
            >
              <RefreshCw size={12} />
              Reestablecer filtros aplicados
            </button>
          </div>
        )}
      </div>

      {/* Logs Table Area */}
      {loading ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-12 text-center flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-[var(--color-primary)] mb-3" size={32} />
          <p className="text-sm text-[var(--color-text-muted)]">Cargando bitácora de auditoría...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] p-12 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-faint)] mb-4">
            <ClipboardList size={22} />
          </div>
          <h3 className="text-sm font-bold text-[var(--color-text)]">No se hallaron registros coincidentes</h3>
          <p className="text-xs text-[var(--color-text-faint)] mt-1.5 max-w-md">
            No encontramos ninguna traza de log para los filtros especificados. Modifique los campos o limpie los rangos de fecha para volver a explorar.
          </p>
          {(filterModule !== 'Todos' || filterDateInicio || filterDateFin || searchQuery) && (
            <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-4 text-xs">
              Limpiar todos los filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden shadow-sm flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
                  <th className="py-3 px-4 text-xs font-bold text-[var(--color-text-muted)] tracking-wider cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('timestamp')}>Fecha / Hora{renderSortIndicator('timestamp')}</th>
                  <th className="py-3 px-4 text-xs font-bold text-[var(--color-text-muted)] tracking-wider cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('module')}>Proceso / Módulo{renderSortIndicator('module')}</th>
                  <th className="py-3 px-4 text-xs font-bold text-[var(--color-text-muted)] tracking-wider cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('action')}>Acción o Suceso{renderSortIndicator('action')}</th>
                  <th className="py-3 px-4 text-xs font-bold text-[var(--color-text-muted)] tracking-wider cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('user')}>Usuario{renderSortIndicator('user')}</th>
                  <th className="py-3 px-4 text-xs font-bold text-[var(--color-text-muted)] tracking-wider text-right">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {currentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-3 px-4 text-xs text-[var(--color-text)] font-semibold whitespace-nowrap">
                      {formatLogTimestamp(log.timestamp)}
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                        getModuleBadgeColor(log.module)
                      )}>
                        {log.module}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--color-text)] font-bold">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 text-xs text-[var(--color-text-muted)] font-mono">
                      {log.user}
                    </td>
                    <td className="py-3 px-4 text-xs text-right whitespace-nowrap">
                      {log.details ? (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:text-teal-700 transition font-bold"
                          title="Inspeccionar detalles técnicos estructurados"
                        >
                          <Eye size={13} />
                          Ver más
                        </button>
                      ) : (
                        <span className="text-slate-400 italic">Sin datos</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 bg-[var(--color-surface-2)] border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-[var(--color-text-muted)]">
                Mostrando <span className="font-bold text-[var(--color-text)]">{(currentPage - 1) * itemsPerPage + 1}</span> a{" "}
                <span className="font-bold text-[var(--color-text)]">
                  {Math.min(currentPage * itemsPerPage, filteredData.length)}
                </span>{" "}
                de <span className="font-bold text-[var(--color-text)]">{filteredData.length}</span> registros de logs
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-10 min-w-10 px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center gap-1 bg-[var(--color-surface)]"
                >
                  <ChevronLeft size={14} />
                  Anterior
                </button>

                <div className="flex items-center gap-1">
                  {renderPageButtons()}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="h-10 min-w-10 px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center gap-1 bg-[var(--color-surface)]"
                >
                  Siguiente
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details Side Drawer or Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden">
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                <Info size={18} className="text-[var(--color-primary)]" />
                Detalles Técnicos Ampliados del Log
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Timestamp</span>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">{formatLogTimestamp(selectedLog.timestamp)}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Proceso / Módulo</span>
                  <div className="mt-0.5">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
                      getModuleBadgeColor(selectedLog.module)
                    )}>
                      {selectedLog.module}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Acción ejecutada</span>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">{selectedLog.action}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Usuario responsable</span>
                  <div className="text-xs font-bold text-slate-800 mt-0.5 font-mono">{selectedLog.user}</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Metadatos Estructurados (Payload)</span>
                <div className="bg-slate-950 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-[300px]">
                  <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-[var(--color-border)] flex justify-end">
              <Button size="sm" onClick={() => setSelectedLog(null)}>
                Cerrar Detalles
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
