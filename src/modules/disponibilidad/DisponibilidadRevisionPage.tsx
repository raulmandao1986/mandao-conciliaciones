import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Mail, 
  Plus, 
  Edit2, 
  Trash2, 
  Calendar,
  MapPin,
  Loader2,
  MoreVertical,
  X,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  ShieldCheck,
  RefreshCw,
  Info,
  Check,
  Eye,
  Database,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Clock,
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import { supabase, logAuditEvent, reconnectGoogle } from '../../lib/supabase';
import { useAuth, ROLE_CAN_IMPORT } from '../../lib/auth';

interface DisponibilidadRecord {
  id: string;
  fecha: string;
  mensajero: string;
  monto: number;
  detalle: string;
  orden?: string;
  area: string;
  areaId: string;
  importedAt?: string;
  importedBy?: string;
  status?: string;
}

// Normalized header helper
function normalizeHeader(h: string): string {
  if (!h) return '';
  return h.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]/g, ''); 
}

const buildHeaderMap = (headersRow: string[]): Record<string, number> => {
  const map: Record<string, number> = {};
  if (!headersRow) return map;
  headersRow.forEach((val, idx) => {
    const normalized = normalizeHeader(val);
    if (normalized) {
      map[normalized] = idx;
    }
  });
  return map;
};

// Fuzzy normalization string comparison
function fuzzyNormalizedString(str: any): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/\s+/g, ' ') 
    .replace(/[^a-z0-9 ]/g, ''); 
}

function parseCellNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  let str = String(val).trim();
  if (str === '') return 0;
  str = str.replace(/[$€%\s]/g, '');
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      const parts = str.split(',');
      const integerPartWithDots = parts[0];
      const decimalPart = parts[1] || '';
      const segments = integerPartWithDots.split('.');
      let integerPart = segments[0] || '';
      for (let i = 1; i < segments.length; i++) {
        integerPart += segments[i].padStart(3, '0');
      }
      str = integerPart + '.' + decimalPart;
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    const parts = str.split(',');
    const decimals = parts[parts.length - 1];
    if (decimals.length === 1 || decimals.length === 2) {
      str = parts.slice(0, -1).join('') + '.' + decimals;
    } else {
      str = str.replace(/,/g, '');
    }
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function isCellEmpty(val: any): boolean {
  if (val === undefined || val === null) return true;
  const str = String(val).trim();
  const lower = str.toLowerCase();
  return (
    str === '' || 
    str === '-' || 
    str === '—' || 
    lower === 'n/a' || 
    lower === 'null'
  );
}

function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const dmY = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmY) {
    const day = parseInt(dmY[1], 10);
    const month = parseInt(dmY[2], 10);
    const year = parseInt(dmY[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  const Ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (Ymd) {
    const year = parseInt(Ymd[1], 10);
    const month = parseInt(Ymd[2], 10);
    const day = parseInt(Ymd[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDateStr(dateStr: string): string {
  const parsed = parseDateString(dateStr);
  return parsed ? formatDateToYYYYMMDD(parsed) : '';
}

export function DisponibilidadRevisionPage() {
  const { user } = useAuth();
  const [areas, setAreas] = useState<any[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [googleToken, setGoogleToken] = useState<string | null>(() => sessionStorage.getItem('google_access_token'));

  // Database records state
  const [records, setRecords] = useState<DisponibilidadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Comparison/audit state
  const [auditing, setAuditing] = useState(false);
  const [auditLogs, setAuditLogs] = useState<string[]>([]);
  const [auditDiffs, setAuditDiffs] = useState<{
    id: string;
    type: 'sheets_only' | 'db_only' | 'amount_mismatch';
    mensajero: string;
    fecha: string;
    sheetMonto?: number;
    dbMonto?: number;
    detalle: string;
    sheetRow?: number;
  }[]>([]);
  const [showAuditResult, setShowAuditResult] = useState(false);

  // Filters state
  const [formData, setFormData] = useState({
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: new Date().toISOString().split('T')[0],
    search: '',
  });

  // Edit/Delete modals state
  const [editingRecord, setEditingRecord] = useState<DisponibilidadRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<DisponibilidadRecord | null>(null);
  const [editForm, setEditForm] = useState({
    mensajero: '',
    monto: 0,
    detalle: '',
    fecha: '',
    orden: ''
  });

  // La edición/eliminación manual de disponibilidades solo la permiten
  // super_admin/supervisor — coincide con las políticas RLS de
  // UPDATE/DELETE de la tabla 'availabilities'.
  const canWrite = ROLE_CAN_IMPORT(user?.role || 'visitante');

  const loadRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('availabilities')
      .select('availability_id, ts, email_address, order_id, availability_date, reason, requested_by, messenger_name, amount_to_pay, province, comment, area_id')
      .order('availability_date', { ascending: false });

    if (error) {
      console.error("Error loading availabilities:", error.message);
      setLoading(false);
      return;
    }

    const allRecords = (data || []).map((r: any) => ({
      id: r.availability_id,
      fecha: r.availability_date || '',
      mensajero: r.messenger_name || '',
      monto: Number(r.amount_to_pay) || 0,
      detalle: r.reason || r.comment || 'Disponibilidad',
      orden: r.order_id || '',
      area: '',
      areaId: r.area_id,
      emailAddress: r.email_address || '',
      requestedBy: r.requested_by || '',
      province: r.province || ''
    })) as DisponibilidadRecord[];

    setRecords(allRecords);
    setLoading(false);
  };

  // Load Areas and active records on mount or parameter changes
  useEffect(() => {
    const loadAreas = async () => {
      const { data, error } = await supabase
        .from('areas')
        .select('area_id, name, province, sheet_document_id, active');
      if (error) {
        console.error('Error loading Areas:', error.message);
        return;
      }
      setAreas((data || []).map(a => ({
        id: a.area_id,
        nombre: a.name,
        provincia: a.province,
        spreadsheetId: a.sheet_document_id,
        estado: a.active ? 'activo' : 'inactivo'
      })));
    };

    loadAreas();
  }, []);

  const handleAreaChange = (areaId: string) => {
    setSelectedAreaId(areaId);
    const selectedArea = areas.find(a => a.id === areaId);
    if (selectedArea) {
      setSpreadsheetId(selectedArea.spreadsheetId || '');
    } else {
      setSpreadsheetId('');
    }
  };

  // Pre-select first area
  useEffect(() => {
    if (!selectedAreaId && areas.length > 0) {
      const firstWithSheet = areas.find(a => a.estado === 'activo' && a.spreadsheetId);
      if (firstWithSheet) {
        handleAreaChange(firstWithSheet.id);
      } else if (areas[0]) {
        handleAreaChange(areas[0].id);
      }
    }
  }, [areas, selectedAreaId]);

  // Load availability records once on mount (Supabase no usa listeners en tiempo real aquí)
  useEffect(() => {
    loadRecords();
  }, []);

  // Filter records based on selected params
  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      // Filter by AreaId
      if (selectedAreaId && rec.areaId !== selectedAreaId) return false;

      // Filter by Date Range
      const dateVal = normalizeDateStr(rec.fecha);
      if (dateVal) {
        if (dateVal < formData.fechaInicio || dateVal > formData.fechaFin) return false;
      }

      // Filter by search string (Driver or Detail)
      const queryStr = formData.search.trim().toLowerCase();
      if (queryStr) {
        const matchDriver = rec.mensajero?.toLowerCase().includes(queryStr);
        const matchDetalle = rec.detalle?.toLowerCase().includes(queryStr);
        const matchOrden = rec.orden?.toLowerCase().includes(queryStr);
        if (!matchDriver && !matchDetalle && !matchOrden) return false;
      }

      return true;
    });
  }, [records, selectedAreaId, formData.fechaInicio, formData.fechaFin, formData.search]);

  // Row selection state
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});
  const [isAllSelected, setIsAllSelected] = useState(false);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setIsAllSelected(checked);
    const newSelected: Record<string, boolean> = {};
    if (checked) {
      filteredRecords.forEach(r => {
        newSelected[r.id] = true;
      });
    }
    setSelectedRows(newSelected);
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const newSelected = { ...selectedRows, [id]: checked };
    setSelectedRows(newSelected);
    
    const allFilteredSelected = filteredRecords.every(r => newSelected[r.id]);
    setIsAllSelected(allFilteredSelected);
  };

  const toggleRowExpanded = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Con Supabase, reconectar Google es un redirect completo de página.
  const handleConnectGoogle = async (): Promise<null> => {
    try {
      await reconnectGoogle();
    } catch (error: any) {
      console.error("Auth Error:", error);
      alert("Error al conectar con Google G-Suite: " + error.message);
    }
    return null;
  };

  // Compare local database against Google Sheet
  const handleAuditCompare = async () => {
    if (!spreadsheetId.trim()) {
      alert("Por favor, selecciona un Dispatcher con Spreadsheet ID configurado.");
      return;
    }

    setAuditing(true);
    setShowAuditResult(true);
    setAuditDiffs([]);
    setAuditLogs(['Iniciando auditoría cruzada de Disponibilidad...', 'Paso 1: Estableciendo conexión con Google Sheets API...']);

    let activeToken = googleToken;
    if (!activeToken) {
      setAuditLogs(prev => [...prev, 'Token de Google no disponible o expirado. Redirigiendo para reconectar...']);
      await handleConnectGoogle();
      setAuditing(false);
      return;
    }

    try {
      setAuditLogs(prev => [...prev, '✓ Token de Google G-Suite verificado.', 'Paso 2: Descargando pestañas del documento...']);
      
      let metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (!metaRes.ok) {
        if (metaRes.status === 401) {
          setAuditLogs(prev => [...prev, 'La sesión o el token de acceso de Google ha expirado (401). Redirigiendo para reconectar...']);
          setGoogleToken(null);
          sessionStorage.removeItem('google_access_token');
          await handleConnectGoogle();
          throw new Error("Sesión de Google expirada. Serás redirigido para reconectar — vuelve a intentar la auditoría al regresar.");
        } else {
          throw new Error(`Fallo consulta de metadatos de Google Sheets (Status: ${metaRes.status})`);
        }
      }

      const metaData = await metaRes.json();
      const sheetTitles = metaData.sheets?.map((s: any) => s.properties?.title) || [];
      const dispsTab = sheetTitles.find((name: string) => name.toLowerCase().includes('disponib')) || 'Disponibilidades';

      setAuditLogs(prev => [...prev, `✓ Hoja localizada: "${dispsTab}"`, 'Paso 3: Recuperando filas de la hoja de cálculo...']);

      const sheetRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dispsTab)}!A:Z`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (!sheetRes.ok) {
        throw new Error(`Fallo consulta de celdas en la hoja "${dispsTab}"`);
      }

      const sheetData = await sheetRes.json();
      const rows = sheetData.values || [];

      if (rows.length === 0) {
        throw new Error('La hoja está vacía.');
      }

      const headers = rows[0] || [];
      const dispsMap = buildHeaderMap(headers);

      setAuditLogs(prev => [...prev, `✓ ${rows.length - 1} filas cargadas desde Google Sheets.`, 'Paso 4: Mapeando registros de la hoja...']);

      const allSheetDisps = rows.slice(1).map((row: any[], idx: number) => {
        const getVal = (keys: string[]) => {
          for (const key of keys) {
            const idxKey = dispsMap[key];
            if (idxKey !== undefined && idxKey < row.length) return row[idxKey];
          }
          return '';
        };
        const getNum = (keys: string[]) => {
          const val = getVal(keys);
          return parseCellNumber(val);
        };
        return {
          mensajero: getVal(['driver', 'mensajero', 'repartidor', 'conductor']) || '',
          monto: getNum(['monto', 'amount', 'pago', 'montoextra']),
          detalle: getVal(['detalle', 'descripcion', 'nota', 'motivo']) || 'Disponibilidad',
          fecha: getVal(['fechadeladisponibilidad', 'fechadisponibilidad', 'fecha', 'date']) || '',
          orden: getVal(['noorden', 'orderid', 'orden']) || '',
          sheetRow: idx + 2
        };
      }).filter((d: any) => !isCellEmpty(d.mensajero));

      // Filter sheet records matching selected date range
      const startDateStr = formData.fechaInicio;
      const endDateStr = formData.fechaFin;

      const filteredSheetDisps = allSheetDisps.filter((d: any) => {
        const norm = normalizeDateStr(d.fecha);
        return norm && norm >= startDateStr && norm <= endDateStr;
      });

      setAuditLogs(prev => [
        ...prev, 
        `✓ ${filteredSheetDisps.length} registros del rango en Google Sheets.`, 
        `✓ ${filteredRecords.length} registros del rango en Base de Datos (Firestore).`,
        'Paso 5: Iniciando comparación de correspondencias uno-a-uno...'
      ]);

      const diffs: any[] = [];

      // 1. Check for records that exist in Sheets but are MISSING in Firestore, or have mismatching amounts
      filteredSheetDisps.forEach((sheetItem: any) => {
        const matchingDbItem = filteredRecords.find(dbItem => {
          const sameDriver = (dbItem.mensajero || '').trim() === (sheetItem.mensajero || '').trim();
          const sameDate = dbItem.fecha && sheetItem.fecha && (normalizeDateStr(dbItem.fecha) === normalizeDateStr(sheetItem.fecha));
          const sameDetalle = (dbItem.detalle || '').trim() === (sheetItem.detalle || '').trim();
          return sameDriver && sameDate && sameDetalle;
        });

        if (!matchingDbItem) {
          diffs.push({
            id: `sheet-${sheetItem.sheetRow}`,
            type: 'sheets_only',
            mensajero: sheetItem.mensajero,
            fecha: normalizeDateStr(sheetItem.fecha) || sheetItem.fecha,
            sheetMonto: sheetItem.monto,
            detalle: sheetItem.detalle,
            sheetRow: sheetItem.sheetRow
          });
        } else if (Math.abs((matchingDbItem.monto || 0) - (sheetItem.monto || 0)) > 0.02) {
          diffs.push({
            id: `mismatch-${matchingDbItem.id}`,
            type: 'amount_mismatch',
            mensajero: sheetItem.mensajero,
            fecha: normalizeDateStr(sheetItem.fecha) || sheetItem.fecha,
            sheetMonto: sheetItem.monto,
            dbMonto: matchingDbItem.monto,
            detalle: sheetItem.detalle,
            sheetRow: sheetItem.sheetRow
          });
        }
      });

      // 2. Check for records that exist in Firestore but are MISSING in Google Sheets
      filteredRecords.forEach((dbItem: any) => {
        const matchingSheetItem = filteredSheetDisps.some(sheetItem => {
          const sameDriver = (sheetItem.mensajero || '').trim() === (dbItem.mensajero || '').trim();
          const sameDate = sheetItem.fecha && dbItem.fecha && (normalizeDateStr(sheetItem.fecha) === normalizeDateStr(dbItem.fecha));
          const sameDetalle = (sheetItem.detalle || '').trim() === (dbItem.detalle || '').trim();
          return sameDriver && sameDate && sameDetalle;
        });

        if (!matchingSheetItem) {
          diffs.push({
            id: `db-${dbItem.id}`,
            type: 'db_only',
            mensajero: dbItem.mensajero,
            fecha: normalizeDateStr(dbItem.fecha) || dbItem.fecha,
            dbMonto: dbItem.monto,
            detalle: dbItem.detalle
          });
        }
      });

      setAuditDiffs(diffs);
      setAuditLogs(prev => [
        ...prev, 
        '✓ Análisis finalizado.', 
        `✓ Auditoría completada. Se detectaron ${diffs.length} discrepancias.`
      ]);

      // Log audit event
      const selectedAreaName = areas.find(a => a.id === selectedAreaId)?.nombre || 'Habana';
      logAuditEvent('Revision', 'Auditoría de Disponibilidades Completada', {
        area: selectedAreaName,
        rangoFechas: `${formData.fechaInicio} - ${formData.fechaFin}`,
        totalDiferencias: diffs.length
      });

    } catch (err: any) {
      console.error("Audit error:", err);
      setAuditLogs(prev => [...prev, `✖ Fallo de auditoría: ${err.message}`]);
    } finally {
      setAuditing(false);
    }
  };

  // Record modification operations
  const handleOpenEdit = (rec: DisponibilidadRecord) => {
    setEditingRecord(rec);
    setEditForm({
      mensajero: rec.mensajero || '',
      monto: rec.monto || 0,
      detalle: rec.detalle || '',
      fecha: normalizeDateStr(rec.fecha) || rec.fecha || '',
      orden: rec.orden || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    try {
      const { error } = await supabase.from('availabilities').update({
        messenger_name: editForm.mensajero,
        amount_to_pay: editForm.monto,
        reason: editForm.detalle,
        availability_date: normalizeDateStr(editForm.fecha) || null,
        order_id: editForm.orden
      }).eq('availability_id', editingRecord.id);

      if (error) throw new Error(error.message);

      await logAuditEvent('Revision', 'Disponibilidad Editada', {
        id: editingRecord.id,
        mensajeroAnterior: editingRecord.mensajero,
        mensajeroNuevo: editForm.mensajero,
        montoNuevo: editForm.monto
      });

      alert("¡Registro actualizado con éxito!");
      setEditingRecord(null);
      await loadRecords();
    } catch (e: any) {
      alert("Error actualizando registro: " + e.message);
    }
  };

  const handleConfirmDelete = (rec: DisponibilidadRecord) => {
    setDeletingRecord(rec);
  };

  const handleDeleteRecord = async () => {
    if (!deletingRecord) return;
    try {
      const { error } = await supabase.from('availabilities').delete().eq('availability_id', deletingRecord.id);
      if (error) throw new Error(error.message);

      await logAuditEvent('Revision', 'Disponibilidad Eliminada', {
        id: deletingRecord.id,
        mensajero: deletingRecord.mensajero,
        monto: deletingRecord.monto
      });

      alert("Registro de disponibilidad eliminado correctamente.");
      setDeletingRecord(null);
      await loadRecords();
    } catch (e: any) {
      alert("Error al eliminar registro: " + e.message);
    }
  };

  const handleDeleteSelected = async () => {
    const selectedIds = Object.keys(selectedRows).filter(k => selectedRows[k]);
    if (selectedIds.length === 0) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar permanentemente los ${selectedIds.length} registros seleccionados?`)) return;

    try {
      setLoading(true);
      const { error } = await supabase.from('availabilities').delete().in('availability_id', selectedIds);
      if (error) throw new Error(error.message);

      await logAuditEvent('Revision', 'Eliminación Masiva de Disponibilidades', {
        cantidadEliminados: selectedIds.length
      });

      alert(`Se eliminaron con éxito ${selectedIds.length} registros.`);
      setSelectedRows({});
      setIsAllSelected(false);
      await loadRecords();
    } catch (e: any) {
      alert("Error en la eliminación masiva: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const hasWritePermission = canWrite;

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-150 shadow-sm text-blue-700">
             <FileSearch className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 uppercase tracking-widest">General</span>
              <span className="text-xs text-[var(--color-text-faint)]">•</span>
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">Módulo Disponibilidad</span>
            </div>
            <h1 className="text-xl font-black text-[var(--color-text)] tracking-tight mt-1">
              Revisión de Disponibilidad
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Filtra, consulta y compara los registros extras importados en base de datos contra el Google Sheet en tiempo real.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            className="h-10 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50"
            onClick={handleAuditCompare}
            disabled={auditing || !selectedAreaId}
          >
            {auditing ? (
              <>
                <Loader2 size={14} className="animate-spin mr-2" />
                AUDITANDO...
              </>
            ) : (
              <>
                <Database size={14} className="mr-2" />
                AUDITAR CON GOOGLE SHEET
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Audit Drawer Compare (collapsible) */}
      {showAuditResult && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 shadow-inner relative">
          <button 
            onClick={() => setShowAuditResult(false)}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"
          >
            <X size={16} />
          </button>

          <h3 className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
            <ShieldCheck size={16} className="text-teal-600" />
            Resultado de Auditoría vs Google Sheet
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Logs console */}
            <div className="lg:col-span-1 bg-slate-900 text-slate-300 font-mono text-[11px] p-4 rounded-lg h-44 overflow-y-auto space-y-1.5 custom-scrollbar">
              {auditLogs.map((log, i) => (
                <div key={i} className="leading-relaxed">{log}</div>
              ))}
            </div>

            {/* Diffs list */}
            <div className="lg:col-span-2 flex flex-col justify-center">
              {auditing ? (
                <div className="flex flex-col items-center py-10 opacity-60">
                  <Loader2 size={32} className="animate-spin text-slate-400 mb-2" />
                  <p className="text-xs font-bold font-mono">EJECUTANDO CRUCE DE DATOS...</p>
                </div>
              ) : auditDiffs.length === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-emerald-900 text-center flex flex-col items-center justify-center">
                  <CheckCircle2 size={32} className="text-emerald-600 mb-2" />
                  <h4 className="font-bold text-sm text-emerald-800">✓ Cero Descuadres Detectados</h4>
                  <p className="text-xs mt-1 max-w-sm">
                    Toda la información registrada en Firestore concuerda al centavo y en filas con la pestaña de "Disponibilidad" del Google Sheet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-44 pr-2 custom-scrollbar">
                  <p className="text-xs font-black text-rose-700 uppercase tracking-widest">
                     ⚠ Discrepancias encontradas ({auditDiffs.length}):
                  </p>
                  <div className="divide-y divide-slate-200/60 font-medium">
                    {auditDiffs.map((diff, i) => (
                      <div key={diff.id || i} className="py-2.5 flex items-center justify-between text-xs gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-800">{diff.mensajero}</span>
                          <span className="text-[10px] text-slate-500 font-mono">Motivo: {diff.detalle} • Fecha: {diff.fecha}</span>
                        </div>
                        <div className="text-right">
                          {diff.type === 'sheets_only' ? (
                            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                              Sheets ($ {diff.sheetMonto?.toFixed(2)}) • No Importada
                            </span>
                          ) : diff.type === 'db_only' ? (
                            <span className="text-[10px] bg-red-50 text-red-800 border border-red-200 px-2 py-0.5 rounded-full font-bold">
                              DB ($ {diff.dbMonto?.toFixed(2)}) • Sin correlación en Sheets
                            </span>
                          ) : (
                            <span className="text-[10px] bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full font-bold">
                              Diferencia: Sheets (${diff.sheetMonto?.toFixed(2)}) vs DB (${diff.dbMonto?.toFixed(2)})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters and search layout */}
      <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Dispatcher (Área)</label>
            <select 
              className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] font-medium"
              value={selectedAreaId}
              onChange={(e) => handleAreaChange(e.target.value)}
            >
              <option value="">Todos los Dispatchers</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Desde</label>
            <input 
              type="date" 
              className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] font-mono font-medium"
              value={formData.fechaInicio}
              onChange={(e) => setFormData(p => ({ ...p, fechaInicio: e.target.value }))}
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Hasta</label>
            <input 
              type="date" 
              className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] font-mono font-medium"
              value={formData.fechaFin}
              onChange={(e) => setFormData(p => ({ ...p, fechaFin: e.target.value }))}
            />
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Buscador Rápido</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
              <input 
                type="text" 
                placeholder="Mensajero, detalle, orden..."
                className="w-full h-10 pl-9 pr-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] font-medium"
                value={formData.search}
                onChange={(e) => setFormData(p => ({ ...p, search: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table & actions menu */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm overflow-hidden flex flex-col">
        {/* Bulk action toolbar */}
        {Object.keys(selectedRows).filter(k => selectedRows[k]).length > 0 && (
          <div className="bg-rose-50 border-b border-rose-100 p-4 flex items-center justify-between text-xs text-rose-900 font-bold transition-all">
            <span className="flex items-center gap-2">
              <AlertCircle size={14} className="text-rose-600 animate-pulse" />
              {Object.keys(selectedRows).filter(k => selectedRows[k]).length} registros de disponibilidad seleccionados
            </span>
            <button 
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 text-white rounded-md font-bold hover:bg-rose-700 transition shadow-sm text-[10px]"
            >
              <Trash2 size={12} />
              ELIMINAR SELECCIÓN
            </button>
          </div>
        )}

        {/* Core database table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-slate-50 text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider">
                <th className="p-4 w-12 text-center">
                  <input 
                    type="checkbox" 
                    className="rounded text-teal-600 focus:ring-teal-500" 
                    checked={isAllSelected} 
                    onChange={handleSelectAll} 
                  />
                </th>
                <th className="p-4 w-32">Fecha</th>
                <th className="p-4">Mensajero</th>
                <th className="p-4">Área</th>
                <th className="p-4">Descripción / Motivo</th>
                <th className="p-4 w-28 text-right">Monto</th>
                <th className="p-4 w-24">Estado</th>
                <th className="p-4 w-20 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold text-[var(--color-text-muted)]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 opacity-50">
                      <Loader2 className="animate-spin text-[var(--color-primary)]" />
                      <span>Cargando disponibilidades...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 opacity-40">
                      <Database size={40} className="text-slate-400" />
                      <p className="font-bold text-sm">Sin registros que mostrar</p>
                      <p className="text-xs font-medium">Asegúrate de que existan disponibilidades en este rango o dispatcher.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const isExpanded = !!expandedRows[r.id];
                  const isChecked = !!selectedRows[r.id];
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={cn(
                        "hover:bg-slate-50/50 group transition-colors border-b border-slate-100",
                        isChecked && "bg-teal-50/30"
                      )}>
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded text-teal-600 focus:ring-teal-500" 
                            checked={isChecked}
                            onChange={(e) => handleSelectRow(r.id, e.target.checked)}
                          />
                        </td>
                        <td className="p-4 font-mono">{normalizeDateStr(r.fecha) || r.fecha}</td>
                        <td className="p-4 text-slate-800 font-bold">{r.mensajero}</td>
                        <td className="p-4">{r.area}</td>
                        <td className="p-4 text-slate-500">{r.detalle}</td>
                        <td className="p-4 text-right font-bold text-slate-800 font-mono text-sm">
                          $ {r.monto?.toFixed(2)}
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border font-mono",
                            r.status === 'conciliado' 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          )}>
                            {r.status === 'conciliado' ? 'Conciliado' : 'No Conciliado'}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => toggleRowExpanded(r.id)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                              title="Expandir metadatos"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            {hasWritePermission && (
                              <>
                                <button 
                                  onClick={() => handleOpenEdit(r)}
                                  className="p-1.5 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded"
                                  title="Editar registro"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button 
                                  onClick={() => handleConfirmDelete(r)}
                                  className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded"
                                  title="Eliminar registro"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable info panel */}
                      {isExpanded && (
                        <tr className="bg-slate-50/75 border-b border-slate-150">
                          <td colSpan={8} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pl-12 text-xs font-semibold text-slate-500 leading-relaxed">
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase block mb-0.5 font-black">ID del Registro</span>
                                <span className="font-mono text-slate-700">{r.id}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase block mb-0.5 font-black">Importado Por</span>
                                <span className="text-slate-700">{r.importedBy || 'raul@mandao.app'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase block mb-0.5 font-black">Fecha Sincronización</span>
                                <span className="font-mono text-slate-700">
                                  {r.importedAt ? new Date(r.importedAt).toLocaleString('es-VE') : 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 uppercase block mb-0.5 font-black">Número de Orden Asociado</span>
                                <span className="font-mono text-slate-700">{r.orden || 'Sin Orden específica'}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-[var(--color-border)] shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Edit2 size={16} className="text-[var(--color-primary)]" />
                  Editar Registro de Disponibilidad
                </h3>
                <p className="text-[10px] text-[var(--color-text-faint)] mt-1">Modificación directa de Firestore</p>
              </div>
              <button 
                onClick={() => setEditingRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs font-bold text-[var(--color-text-muted)]">
              <div className="grid gap-1.5">
                <label className="text-[10px] uppercase text-[var(--color-text-faint)] font-black">Mensajero / Driver</label>
                <input 
                  type="text" 
                  className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)]"
                  value={editForm.mensajero}
                  onChange={(e) => setEditForm(p => ({ ...p, mensajero: e.target.value }))}
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-[10px] uppercase text-[var(--color-text-faint)] font-black">Monto extra ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)] font-mono"
                  value={editForm.monto}
                  onChange={(e) => setEditForm(p => ({ ...p, monto: parseFloat(e.target.value) || 0 }))}
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-[10px] uppercase text-[var(--color-text-faint)] font-black">Descripción / Detalle</label>
                <input 
                  type="text" 
                  className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)]"
                  value={editForm.detalle}
                  onChange={(e) => setEditForm(p => ({ ...p, detalle: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <label className="text-[10px] uppercase text-[var(--color-text-faint)] font-black">Fecha operativa</label>
                  <input 
                    type="date" 
                    className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)] font-mono"
                    value={editForm.fecha}
                    onChange={(e) => setEditForm(p => ({ ...p, fecha: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[10px] uppercase text-[var(--color-text-faint)] font-black">No. Orden (opcional)</label>
                  <input 
                    type="text" 
                    className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg outline-none focus:border-[var(--color-primary)] font-mono"
                    value={editForm.orden}
                    onChange={(e) => setEditForm(p => ({ ...p, orden: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-[var(--color-border)] flex justify-end gap-2">
              <Button 
                variant="ghost" 
                className="h-9 px-4 text-xs font-bold"
                onClick={() => setEditingRecord(null)}
              >
                CANCELAR
              </Button>
              <Button 
                variant="primary" 
                className="h-9 px-5 text-xs font-bold"
                onClick={handleSaveEdit}
              >
                GUARDAR CAMBIOS
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-[var(--color-border)] shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
              <h3 className="text-sm font-black text-rose-800 uppercase tracking-widest flex items-center gap-2">
                <Trash2 size={16} />
                Confirmar Eliminación
              </h3>
              <button 
                onClick={() => setDeletingRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 text-xs font-medium text-[var(--color-text-muted)] space-y-3 leading-relaxed">
               <p>
                 ¿Estás completamente seguro de que deseas eliminar permanentemente el registro de disponibilidad para:
               </p>
               <div className="bg-slate-50 border border-slate-150 p-3 rounded-lg font-bold">
                 <p className="text-slate-800 text-sm">{deletingRecord.mensajero}</p>
                 <p className="text-slate-500 text-[10px] font-mono mt-1">Monto: ${deletingRecord.monto?.toFixed(2)} • Motivo: {deletingRecord.detalle}</p>
               </div>
               <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider">
                 Esta acción no se puede deshacer de ninguna forma.
               </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-[var(--color-border)] flex justify-end gap-2">
              <Button 
                variant="ghost" 
                className="h-9 px-4 text-xs font-bold"
                onClick={() => setDeletingRecord(null)}
              >
                CANCELAR
              </Button>
              <Button 
                variant="primary" 
                className="h-9 px-5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                onClick={handleDeleteRecord}
              >
                SÍ, ELIMINAR
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
