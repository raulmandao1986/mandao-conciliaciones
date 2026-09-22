import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  MapPin, 
  Calendar, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Download,
  Mail,
  ArrowRight,
  Database,
  FileSearch,
  History,
  X,
  Lock,
  RefreshCw,
  Info,
  Check,
  Send,
  HelpCircle
} from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, logAuditEvent, reconnectGoogle } from '../../lib/supabase';
import { useAuth, ROLE_CAN_IMPORT } from '../../lib/auth';

// Persistencia local (por navegador) de los correos de notificación.
// Firestore tenía un doc global 'settings/dispatcher_config'; Supabase
// todavía no tiene una tabla de configuración (fuera de alcance —
// pertenece a la fase de Configuración/Gestión). Se comparte la misma
// key entre Dispatcher y Disponibilidad, igual que el fallback que
// tenía el código original.
const NOTIFY_EMAILS_STORAGE_KEY = 'mandao_notify_emails';

interface VerificationResult {
  orders: any[];
  cambios: any[];
  disponibilidades: any[];
  incidences: {
    type: 'mismatch' | 'data_error';
    severity?: 'critica' | 'advertencia' | 'informativa';
    ruleCode?: string;
    detail: string;
    id: string;
    record: any;
  }[];
  // Cambios detectados en la hoja "Cambios" contra su orden coincidente en
  // "Orders" (RN-001). A diferencia de las incidencias de arriba, esto NO
  // es un error a corregir en el Sheet: es información legítima (la orden
  // fue modificada) que requiere confirmación explícita antes de habilitar
  // "Importar a la BD" — no cuenta para el bloqueo de RN-006.
  cambiosDetectados: {
    orderId: string;
    diffs: { campo: string; valorOrders: string; valorCambios: string }[];
  }[];
}

// Normalized header helper
function normalizeHeader(h: string): string {
  if (!h) return '';
  return h.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, ''); // alphanumeric only
}

function normalizePaymentType(str: string): string {
  if (!str) return '';
  return str.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, ''); // alphanumeric only
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

// Precise date parsing helper
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  // Try matching DD/MM/YYYY or DD-MM-YYYY first (standard Spanish/Cuban format)
  const dmY = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmY) {
    const day = parseInt(dmY[1], 10);
    const month = parseInt(dmY[2], 10);
    const year = parseInt(dmY[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  // Try matching YYYY-MM-DD or YYYY/MM/DD
  const Ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (Ymd) {
    const year = parseInt(Ymd[1], 10);
    const month = parseInt(Ymd[2], 10);
    const day = parseInt(Ymd[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day);
    }
  }

  // Fallback to standard JS parsing
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function formatDateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// El body de error de Google (JSON: { error: { code, message, status } })
// trae el motivo real (API deshabilitada, scope insuficiente, sin acceso al
// documento, etc.) — res.statusText casi siempre viene vacío para fetch(),
// así que sin esto el usuario solo ve "(403)" sin ninguna pista de la causa.
async function extractGoogleApiError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const msg = body?.error?.message;
    const status = body?.error?.status;
    if (msg) return status ? `${msg} [${status}]` : msg;
  } catch {
    // body no era JSON o ya se consumió — se usa el fallback genérico
  }
  return res.statusText || `HTTP ${res.status}`;
}

function normalizeDateStr(dateStr: string): string {
  const parsed = parseDateString(dateStr);
  return parsed ? formatDateToYYYYMMDD(parsed) : '';
}

function parseCellNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  let str = String(val).trim();
  if (str === '') return 0;

  // Remove currency symbols, spaces, percent signs
  str = str.replace(/[$€%\s]/g, '');

  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      // Spanish style: Dot is thousands separator, comma is decimal (e.g. 1.234,56 or 2.30,00)
      const parts = str.split(',');
      const integerPartWithDots = parts[0];
      const decimalPart = parts[1] || '';

      const segments = integerPartWithDots.split('.');
      let integerPart = segments[0] || '';
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (i === segments.length - 1) {
          // Last segment before comma (e.g., "30" in "2.30"). Pad if needed to 3 digits
          if (seg.length < 3) {
            integerPart += seg.padEnd(3, '0');
          } else {
            integerPart += seg;
          }
        } else {
          integerPart += seg.padStart(3, '0');
        }
      }
      str = integerPart + '.' + decimalPart;
    } else {
      // English style: Comma is thousands separator, dot is decimal (e.g. 1,234.56)
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Only comma exists (e.g. 425,00 or 1,234)
    const parts = str.split(',');
    const decimals = parts[parts.length - 1];
    
    // If the part after the last comma has 1 or 2 digits, it is a decimal separator
    if (decimals.length === 1 || decimals.length === 2) {
      str = parts.slice(0, -1).join('') + '.' + decimals;
    } else {
      // Otherwise it's thousands separator (e.g. 1,123)
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
    str === '–' || 
    lower === 'n/a' || 
    lower === 'null' || 
    lower === 'undefined'
  );
}

function isCellEmptyOrError(val: any): boolean {
  if (isCellEmpty(val)) return true;
  const str = String(val).trim();
  return (
    str.startsWith('#REF!') ||
    str.startsWith('#N/A') ||
    str.startsWith('#VALUE!') ||
    str.startsWith('#DIV/0!') ||
    str.startsWith('#NULL!') ||
    str.startsWith('#NUM!') ||
    str.startsWith('#NAME?') ||
    str.startsWith('#ERROR!')
  );
}

function mapRowToRecord(row: any[], headerMap: Record<string, number>, sheetRow?: number) {
  const getVal = (keys: string[]) => {
    for (const key of keys) {
      const idx = headerMap[key];
      if (idx !== undefined && idx < row.length) {
        return row[idx];
      }
    }
    return '';
  };

  const getNum = (keys: string[]) => {
    const val = getVal(keys);
    return parseCellNumber(val);
  };

  const orderId = getVal(['orderid', 'orden', 'noorden', 'id', 'numeroorden', 'norden']) || '';
  
  return {
    orden: orderId,
    orderId: orderId,
    sheetRow,
    deliveryDate: getVal(['deliverydate', 'fechadeentrega', 'fechaentrega', 'fecha', 'date']) || '',
    orderDate: getVal(['orderdate', 'fechadeorden', 'fechaorden']) || '',
    driver: getVal(['driver', 'mensajero', 'repartidor', 'conductor']) || 'No asignado',
    negocio: getVal(['store', 'negocio', 'establecimiento', 'restaurante', 'comercio']) || 'N/A',
    cliente: getVal(['customer', 'client', 'cliente']) || '',
    customerNumber: getVal(['customernumber', 'numerodetelefono', 'telefono', 'telefonocliente', 'tel']) || '',
    monto: getNum(['monto', 'amount', 'total', 'montototal']),
    deliveryCharge: getNum(['deliverycharge', 'costodeentrega', 'cargoentrega', 'delivery']),
    extraDeliveryCharge: getNum(['extradeliverycharge', 'extradelivery', 'cargoextra', 'masdistancia']),
    driverAdminCharge: getNum(['driveradmincharge', 'driveradmin', 'comisionmensajero']),
    complementaryDelivery: getNum(['complementarydelivery', 'complementario', 'entregaenlacasilla']),
    productAmount: getNum(['productamount', 'montoproducto', 'montoarticulos', 'articulos', 'products']),
    storeOffer: getNum(['storeoffer', 'ofertaestablecimiento', 'ofertatienda', 'descuento']),
    storeAdminCharge: getNum(['storeadmincharge', 'storeadmin', 'comisioncomercio', 'comisiontienda']),
    processingFee: getNum(['processingfee', 'cargoprocesamiento', 'procesamiento', 'fee']),
    transactionFee: getNum(['transactionfee', 'impuesto', 'tax', 'comisiontransaccion']),
    promocode: getVal(['promocode', 'codigopromocional', 'promo', 'cupon']) || '0',
    paymentType: getVal(['viapago', 'paymenttype', 'metododepago', 'formadepago', 'tipopago']) || 'Efectivo',
    tipoOrden: getVal(['tipoorden', 'ordertype', 'tipoorden']) || 'Regular',
    area: getVal(['area', 'zona', 'provincia', 'demarcacion']) || 'Habana',

    // Raw cell strings for strict empty/dash verification
    productAmountRaw: getVal(['productamount', 'montoproducto', 'montoarticulos', 'articulos', 'products']),
    storeOfferRaw: getVal(['storeoffer', 'ofertaestablecimiento', 'ofertatienda', 'descuento']),
    storeAdminChargeRaw: getVal(['storeadmincharge', 'storeadmin', 'comisioncomercio', 'comisiontienda']),
    deliveryChargeRaw: getVal(['deliverycharge', 'costodeentrega', 'cargoentrega', 'delivery']),
    extraDeliveryChargeRaw: getVal(['extradeliverycharge', 'extradelivery', 'cargoextra', 'masdistancia']),
    driverAdminChargeRaw: getVal(['driveradmincharge', 'driveradmin', 'comisionmensajero']),
    complementaryDeliveryRaw: getVal(['complementarydelivery', 'complementario', 'entregaenlacasilla'])
  };
}

export function VerificationPage() {
  const { user } = useAuth();
  // El botón "Importar a la BD" solo puede ser visible para Super Admin/
  // Supervisor (sección 5.1 UI/UX de las instrucciones) — coincide con la
  // política RLS "insert_dispatcher_rows"/"insert_availability_rows" de
  // supabase_schema.sql, que ya rechaza el insert a nivel de base de datos
  // para cualquier otro rol (RN-007: la validación real vive en el backend).
  const canImport = ROLE_CAN_IMPORT(user?.role || 'visitante');

  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  // Confirmación explícita por Orden ID de cada cambio detectado (Cambios vs
  // Orders) — debe estar todo marcado antes de habilitar "Importar a la BD".
  const [confirmedChanges, setConfirmedChanges] = useState<Record<string, boolean>>({});
  const [showIncidenceDetails, setShowIncidenceDetails] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [logs, setLogs] = useState<{ id: string; t: string; lvl: 'info' | 'success' | 'warn' | 'error'; msg: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: string; type: 'success' | 'error'; message: string }[]>([]);

  const showToast = (type: 'success' | 'error', message: string) => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // Table search, filter and pagination parameters
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('todos');
  const [ruleFilter, setRuleFilter] = useState('todos');
  const [selectedIncidences, setSelectedIncidences] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const addLog = (lvl: 'info' | 'success' | 'warn' | 'error', msg: string) => {
    const timestampStr = new Date().toLocaleTimeString('es-VE', { hour12: false });
    setLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        t: timestampStr,
        lvl,
        msg
      }
    ]);
  };
  
  // Real config variables
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [notifyEmails, setNotifyEmails] = useState<string>('');
  const [googleToken, setGoogleToken] = useState<string | null>(() => sessionStorage.getItem('google_access_token'));
  const [areas, setAreas] = useState<any[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [orderPaymentMethods, setOrderPaymentMethods] = useState<{ nombre: string }[]>([]);

  const [formData, setFormData] = useState({
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: new Date().toISOString().split('T')[0],
    tipo: 'habana'
  });

  const loadAreas = async () => {
    const { data, error } = await supabase
      .from('areas')
      .select('area_id, name, province, sheet_document_id, active');
    if (error) {
      console.warn("Error loading Areas:", error.message);
      return;
    }
    const records = (data || []).map(a => ({
      id: a.area_id,
      nombre: a.name,
      provincia: a.province,
      spreadsheetId: a.sheet_document_id,
      estado: a.active ? 'activo' : 'inactivo'
    }));
    setAreas(records);
  };

  // Catálogo real de Métodos de Pago válidos para Órdenes (RN-005), tal
  // como se administra en Configuración → Métodos de Pago. Antes esto
  // era una lista fija en el código ("métodos de pago de mensajeros")
  // que no tenía relación con la tabla real payment_methods — por eso
  // la Verificación generaba incidencias falsas contra valores que el
  // usuario sí tenía registrados, solo que en otro catálogo.
  const loadOrderPaymentMethods = async () => {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('name')
      .eq('active', true)
      .eq('applies_to_orders', true);
    if (error) {
      console.warn("Error loading payment_methods:", error.message);
      return;
    }
    setOrderPaymentMethods((data || []).map(m => ({ nombre: m.name })));
  };

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from('dispatcher_verifications')
      .select('verification_id, area_id, start_date, end_date, verification_date, status, total_orders, total_changes, total_incidents, user_id, areas(name)')
      .order('verification_date', { ascending: false })
      .limit(50);
    if (error) {
      console.warn("Offline or transient warning loading verification history:", error.message);
      return;
    }
    const records = (data || []).map((r: any) => ({
      id: r.verification_id,
      tipo: r.areas?.name || 'N/A',
      fecha: r.verification_date,
      rango: `${r.start_date} - ${r.end_date}`,
      ordenes: r.total_orders,
      incidencias: r.total_incidents,
      usuario: r.user_id === user?.uid ? (user?.name || user?.email) : 'Otro usuario'
    }));
    setHistory(records);
  };

  // Load configuration and Verification History on mount
  useEffect(() => {
    const storedEmails = localStorage.getItem(NOTIFY_EMAILS_STORAGE_KEY);
    if (storedEmails) setNotifyEmails(storedEmails);

    loadHistory();
    loadAreas();
    loadOrderPaymentMethods();
  }, []);

  const handleAreaChange = (areaId: string) => {
    setSelectedAreaId(areaId);
    const selectedArea = areas.find(a => a.id === areaId);
    if (selectedArea) {
      setSpreadsheetId(selectedArea.spreadsheetId || '');
      // Translate provincia to tipo:
      let tipoVal = 'habana';
      if (selectedArea.provincia) {
        const provLower = selectedArea.provincia.toLowerCase();
        if (provLower.includes('habana')) {
          tipoVal = 'habana';
        } else if (provLower.includes('holguin')) {
          tipoVal = 'holguin';
        } else {
          tipoVal = 'provincia';
        }
      }
      setFormData(prev => ({
        ...prev,
        tipo: tipoVal
      }));
    } else {
      setSpreadsheetId('');
    }
  };

  // Pre-select first active area once they load
  useEffect(() => {
    if (!selectedAreaId && areas.length > 0) {
      const firstActiveWithSheet = areas.find(a => a.estado === 'activo' && a.spreadsheetId);
      if (firstActiveWithSheet) {
        handleAreaChange(firstActiveWithSheet.id);
      } else {
        const firstActive = areas.find(a => a.estado === 'activo');
        if (firstActive) {
          handleAreaChange(firstActive.id);
        }
      }
    }
  }, [areas, selectedAreaId]);

  // Con Supabase, "reconectar Google" ya no es un popup síncrono: es el
  // mismo flujo OAuth con redirect completo de página (ver lib/supabase.ts).
  // No puede devolver un token en la misma ejecución de JS porque el
  // navegador navega fuera de la app y vuelve. Por eso el que la llama
  // debe abortar el flujo actual y esperar a que el usuario reintente
  // tras volver.
  const handleConnectGoogle = async (): Promise<null> => {
    try {
      await reconnectGoogle();
    } catch (error: any) {
      console.error("Error connecting Google:", error);
      alert("Error al conectar con Google: " + error.message);
    }
    return null;
  };

  const handleDisconnectGoogle = () => {
    setGoogleToken(null);
    sessionStorage.removeItem('google_access_token');
    alert("Desconectado de Google API.");
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      localStorage.setItem(NOTIFY_EMAILS_STORAGE_KEY, notifyEmails);
      alert("¡Parámetros de configuración guardados correctamente!");
    } catch (err: any) {
      console.error("Error saving config:", err);
      alert("Error al guardar la configuración: " + err.message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleVerify = async () => {
    if (!spreadsheetId.trim()) {
      alert("Por favor, ingresa un ID de documento de Google Sheets válido.");
      return;
    }

    setLogs([]);
    addLog('info', `Iniciando proceso de Verificación para el dispatcher asignado (${formData.tipo.toUpperCase()}).`);

    let activeToken = googleToken;
    if (!activeToken) {
      addLog('info', 'Google Access Token ausente o expirado. Redirigiendo para reconectar con Google...');
      await handleConnectGoogle();
      addLog('warn', 'Serás redirigido a Google para autorizar de nuevo. Vuelve a pulsar "Verificar Dispatcher" al regresar.');
      return; // El navegador navega fuera de la app; se retoma tras el redirect
    }

    setLoading(true);
    setResult(null);

    try {
      addLog('info', `Usando catálogo de Métodos de Pago para Órdenes (${orderPaymentMethods.length} métodos activos, desde Configuración → Métodos de Pago).`);
      const activeMessengerMethods: any[] = orderPaymentMethods;

      addLog('info', `Paso 1: Conectando con Google Sheets API v4. Consultando metadatos para el Spreadsheet ID: ...${spreadsheetId.slice(-8)}`);
      // 1. Fetch metadata first to get exact sheet titles
      let metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (!metaRes.ok) {
        if (metaRes.status === 401) {
          addLog('warn', 'La sesión o el token de acceso de Google ha expirado (401). Redirigiendo para reconectar con Google...');
          setGoogleToken(null);
          sessionStorage.removeItem('google_access_token');
          await handleConnectGoogle();
          throw new Error("Sesión de Google expirada. Serás redirigido para reconectar — vuelve a pulsar Verificar al regresar.");
        } else {
          const detail = await extractGoogleApiError(metaRes);
          throw new Error(`Google Sheets API Error (${metaRes.status}): ${detail}`);
        }
      }

      const metaData = await metaRes.json();
      const sheetTitles = metaData.sheets?.map((s: any) => s.properties?.title) || [];
      addLog('success', `Conectado al documento. Pestañas detectadas: [${sheetTitles.join(', ')}]`);

      // Find best matching sheet titles case-insensitively
      const findBestSheet = (keyword: string, defaultName: string) => {
        const title = sheetTitles.find((name: string) => name.toLowerCase().includes(keyword.toLowerCase()));
        return title || defaultName;
      };

      const ordersTab = findBestSheet('order', 'Orders');
      const cambiosTab = findBestSheet('cambio', 'Cambios');
      const dispsTab = findBestSheet('disponib', 'Disponibilidades');
      
      addLog('info', `Asociación inteligente de pestañas completada:`);
      addLog('info', `  - Órdenes cargará de: "${ordersTab}"`);
      addLog('info', `  - Cambios cargará de: "${cambiosTab}"`);
      addLog('info', `  - Disponibilidades cargará de: "${dispsTab}"`);

      // 2. Batch get values of the three sheets
      addLog('info', 'Ejecutando Batch Get para recuperar todos los bloques de datos...');
      const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${encodeURIComponent(ordersTab)}!A:Z&ranges=${encodeURIComponent(cambiosTab)}!A:Z&ranges=${encodeURIComponent(dispsTab)}!A:Z`;
      let batchRes = await fetch(batchUrl, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (!batchRes.ok) {
        if (batchRes.status === 401) {
          addLog('warn', 'La sesión o el token de acceso de Google ha expirado durante la descarga (401). Redirigiendo para reconectar con Google...');
          setGoogleToken(null);
          sessionStorage.removeItem('google_access_token');
          await handleConnectGoogle();
          throw new Error("Sesión de Google expirada. Serás redirigido para reconectar — vuelve a pulsar Verificar al regresar.");
        } else {
          const detail = await extractGoogleApiError(batchRes);
          throw new Error(`Google Sheets API Error (${batchRes.status}): ${detail}`);
        }
      }

      const batchData = await batchRes.json();
      const valueRanges = batchData.valueRanges || [];

      // Safe arrays of rows
      const ordersRows = valueRanges[0]?.values || [];
      const cambiosRows = valueRanges[1]?.values || [];
      const dispsRows = valueRanges[2]?.values || [];

      addLog('success', `Datos descargados. Filas leídas: Orders (${ordersRows.length}), Cambios (${cambiosRows.length}), Disponibilidades (${dispsRows.length})`);

      if (ordersRows.length === 0) {
        throw new Error(`La hoja "${ordersTab}" está vacía o no tiene cabeceras.`);
      }

      // Headers rows
      const ordersHeaders = ordersRows[0] || [];
      const cambiosHeaders = cambiosRows[0] || [];
      const dispsHeaders = dispsRows[0] || [];

      addLog('info', 'Analizando y normalizando cabeceras dinámicas de Google Sheets...');
      const ordersMap = buildHeaderMap(ordersHeaders);
      const cambiosMap = buildHeaderMap(cambiosHeaders);
      const dispsMap = buildHeaderMap(dispsHeaders);

      // Parse and map rows
      const allOrders = ordersRows.slice(1)
        .map((row: any[], idx: number) => mapRowToRecord(row, ordersMap, idx + 2))
        .filter((o: any) => !isCellEmptyOrError(o.orderId));

      const allCambios = cambiosRows.slice(1).map((row: any[], idx: number) => {
        const getVal = (keys: string[]) => {
          for (const key of keys) {
            const idxKey = cambiosMap[key];
            if (idxKey !== undefined && idxKey < row.length) return row[idxKey];
          }
          return '';
        };
        const getNum = (keys: string[]) => {
          const val = getVal(keys);
          return parseCellNumber(val);
        };
        const orderId = getVal(['orderid', 'orden', 'id', 'noorden']);
        return {
          id: orderId,
          orden: orderId,
          sheetRow: idx + 2,
          detalle: getVal(['detalle', 'cambio', 'detalles', 'descripcion']) || 'Cambio general',
          fecha: getVal(['fecha', 'date', 'fechacambio']) || '',
          negocio: getVal(['negocio', 'store', 'establecimiento', 'restaurante', 'comercio']) || '',
          mensajero: getVal(['mensajero', 'driver', 'repartidor', 'conductor']) || '',
          tipoPago: getVal(['tipodepago', 'viapago', 'paymenttype', 'metododepago', 'formadepago', 'tipopago']) || '',
          montoProducto: getNum(['montodeproducto', 'montoarticulos', 'productamount', 'montoarticulo', 'articulos', 'monto']),
          montoDelivery: getNum(['montodedelivery', 'deliverycharge', 'costodeentrega', 'cargoentrega', 'delivery'])
        };
      }).filter((c: any) => !isCellEmptyOrError(c.orden));

      const allDisps = dispsRows.slice(1).map((row: any[], idx: number) => {
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
          id: getVal(['id']) || Math.random().toString(),
          mensajero: getVal(['driver', 'mensajero', 'repartidor', 'conductor']) || '',
          monto: getNum(['monto', 'amount', 'pago']),
          detalle: getVal(['detalle', 'descripcion', 'nota']) || '',
          fecha: getVal(['fecha', 'date']) || '',
          sheetRow: idx + 2
        };
      }).filter((d: any) => !isCellEmptyOrError(d.mensajero));

      // Filter by Date Range
      const startDateStr = formData.fechaInicio;
      const endDateStr = formData.fechaFin;

      const filterByDateForOrder = (item: any) => {
        const itemDateStr = item.deliveryDate;
        if (!itemDateStr) return false;
        const normalized = normalizeDateStr(itemDateStr);
        if (!normalized) return false;
        return normalized >= startDateStr && normalized <= endDateStr;
      };

      const filterByDateForCambioOrDisp = (item: any) => {
        const itemDateStr = item.fecha;
        if (!itemDateStr) return false;
        const normalized = normalizeDateStr(itemDateStr);
        if (!normalized) return false;
        return normalized >= startDateStr && normalized <= endDateStr;
      };

      const filteredOrders = allOrders.filter(filterByDateForOrder);
      const filteredCambios = allCambios.filter(filterByDateForCambioOrDisp);
      const filteredDisps = allDisps.filter(filterByDateForCambioOrDisp);

      addLog('success', `Normalización finalizada. Filtrando rango de fechas de delivery: [${startDateStr}] - [${endDateStr}]`);
      addLog('info', `Datos en el rango seleccionado:`);
      addLog('info', `  - Órdenes filtradas: ${filteredOrders.length} (de ${allOrders.length})`);
      addLog('info', `  - Cambios filtrados: ${filteredCambios.length} (de ${allCambios.length})`);
      addLog('info', `  - Disponibilidades filtradas: ${filteredDisps.length} (de ${allDisps.length})`);

      // Perform validation logic
      addLog('info', 'Paso 2: Iniciando análisis cruzado de consistencia de negocios y mensajeros...');
      // Lógica 1: Comparación de Cambios con Orders (si Cambios tiene información)
      const getOrderPrefix = (id: string): string => {
        const cleanStrVal = (id || '').trim();
        if (cleanStrVal.length > 2) {
          return cleanStrVal.slice(0, -2);
        }
        return cleanStrVal;
      };

      const cleanStr = (s: string) => (s || '').trim().toLowerCase();

      // Incidencias reales de Cambios (bloquean RN-006): solo la fila
      // "huérfana" — un cambio que no se pudo ubicar en Orders es un
      // problema de datos genuino, no una diferencia esperada.
      const cambiosIncidences: any[] = [];
      // Cambios detectados en órdenes que SÍ se encontraron en Orders: no
      // son un error a corregir, es la razón de ser de la hoja "Cambios"
      // (la orden fue modificada). Se agrupan por Orden ID y requieren
      // confirmación explícita del usuario antes de poder importar — no
      // cuentan para el bloqueo de RN-006.
      const cambiosDetectadosMap: Record<string, { orderId: string; diffs: { campo: string; valorOrders: string; valorCambios: string }[] }> = {};

      const addCambioDetectado = (orderId: string, campo: string, valorOrders: string, valorCambios: string) => {
        if (!cambiosDetectadosMap[orderId]) {
          cambiosDetectadosMap[orderId] = { orderId, diffs: [] };
        }
        cambiosDetectadosMap[orderId].diffs.push({ campo, valorOrders, valorCambios });
      };

      if (filteredCambios.length > 0) {
        filteredCambios.forEach(c => {
          if (!c.orden) return;

          const cPrefix = getOrderPrefix(c.orden);

          // Match by "No. Orden" (prefix), "Negocio", and "Mensajero" inside Orders schema elements ("Order ID", "Store", and "Driver")
          const matchingOrder = filteredOrders.find(o => {
            const oPrefix = getOrderPrefix(o.orderId || o.orden);
            const idMatch = cPrefix && oPrefix && cPrefix === oPrefix;
            const storeMatch = cleanStr(c.negocio) === cleanStr(o.negocio);
            const driverMatch = cleanStr(c.mensajero) === cleanStr(o.driver);
            return idMatch && storeMatch && driverMatch;
          });

          if (!matchingOrder) {
            addLog('warn', `Incidencia detectada: La orden de cambio "${c.orden}" para "${c.negocio}" y "${c.mensajero}" registrada en la Fila Cambios ${c.sheetRow} es HUÉRFANA (no existe en Orders).`);
            // Mismatch case - cambio has no matching order in Orders under selected date range
            cambiosIncidences.push({
              type: 'mismatch' as const,
              severity: 'critica' as const,
              ruleCode: 'RN-001',
              detail: `[Fila Cambios: ${c.sheetRow}] La orden de cambio "${c.orden}" registrada en Cambios (para el negocio "${c.negocio}" y mensajero "${c.mensajero}") no fue hallada en la hoja "Orders" bajo ese mismo negocio ni mensajero.`,
              id: c.orden,
              record: {
                orden: c.orden,
                orderId: c.orden,
                sheetRow: c.sheetRow,
                driver: c.mensajero || 'No asignado',
                store: c.negocio || 'N/A',
                negocio: c.negocio || 'N/A',
                cliente: 'N/A',
                monto: 0,
                paymentType: c.tipoPago || 'Regular',
                tipoOrden: 'Regular',
                rawChangeDetail: c.detalle,
                rawChangeDate: c.fecha
              }
            });
          } else {
            // Verify fields — cualquier diferencia aquí es un "cambio
            // detectado" a confirmar, NO una incidencia crítica bloqueante.
            // 1. Tipo de Pago en Cambios vs Payment Type en Orders
            if (cleanStr(c.tipoPago) !== cleanStr(matchingOrder.paymentType)) {
              addLog('info', `Cambio detectado en Orden "${c.orden}": Tipo de pago "${matchingOrder.paymentType || 'Vacío'}" (Orders) → "${c.tipoPago || 'Vacío'}" (Cambios).`);
              addCambioDetectado(c.orden, 'Tipo de Pago', matchingOrder.paymentType || 'Vacío', c.tipoPago || 'Vacío');
            }

            // 2. Monto de producto en Cambios vs Product Amount en Orders
            if (Math.abs(c.montoProducto - matchingOrder.productAmount) > 0.01) {
              addLog('info', `Cambio detectado en Orden "${c.orden}": Monto de producto $${matchingOrder.productAmount.toFixed(2)} (Orders) → $${c.montoProducto.toFixed(2)} (Cambios).`);
              addCambioDetectado(c.orden, 'Monto de Producto', `$${matchingOrder.productAmount.toFixed(2)}`, `$${c.montoProducto.toFixed(2)}`);
            }

            // 3. Monto de delivery en Cambios vs Delivery Charge en Orders
            if (Math.abs(c.montoDelivery - matchingOrder.deliveryCharge) > 0.01) {
              addLog('info', `Cambio detectado en Orden "${c.orden}": Monto de delivery $${matchingOrder.deliveryCharge.toFixed(2)} (Orders) → $${c.montoDelivery.toFixed(2)} (Cambios).`);
              addCambioDetectado(c.orden, 'Monto de Delivery', `$${matchingOrder.deliveryCharge.toFixed(2)}`, `$${c.montoDelivery.toFixed(2)}`);
            }
          }
        });
      }

      const cambiosDetectados = Object.values(cambiosDetectadosMap);

      // Lógica 2: Inconsistencias de datos en Orders
      const dataIncidences = filteredOrders.flatMap(o => {
        if (!o.orden) return [];
        const incidencesList: { type: 'data_error', severity: 'critica' | 'advertencia' | 'informativa', ruleCode: string, detail: string, id: string, record: any }[] = [];

        const isMandaoExpress = o.negocio?.trim().toLowerCase() === 'mandao express';
        // RN-003: es Recogida por Cliente solo si las 4 columnas de cargos de
        // entrega están vacías/'-' (o en 0, mismo criterio que ya usaba el
        // código para "Delivery Charge" antes de esta corrección) — no basta
        // con que "Delivery Charge" por sí sola esté vacía.
        const isFieldWaived = (raw: any, num: number) => isCellEmpty(raw) || num === 0;
        const isPickup =
          isFieldWaived(o.deliveryChargeRaw, o.deliveryCharge) &&
          isFieldWaived(o.extraDeliveryChargeRaw, o.extraDeliveryCharge) &&
          isFieldWaived(o.driverAdminChargeRaw, o.driverAdminCharge) &&
          isFieldWaived(o.complementaryDeliveryRaw, o.complementaryDelivery);

        // 1. Validar campos obligatorios núcleo (No deben estar vacíos)
        if (isCellEmpty(o.deliveryDate)) {
          incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Delivery Date" en la orden.`, id: o.orden, record: o });
        }
        if (isCellEmpty(o.orderDate)) {
          incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Order Date" en la orden.`, id: o.orden, record: o });
        }
        if (isCellEmpty(o.paymentType)) {
          incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Payment Type" en la orden.`, id: o.orden, record: o });
        } else {
          const normPaymentType = normalizePaymentType(o.paymentType);
          const hasExactMatch = activeMessengerMethods.some(
            (m: any) => m.nombre === o.paymentType
          );

          if (!hasExactMatch) {
            const fuzzyMatch = activeMessengerMethods.find(
              (m: any) => normalizePaymentType(m.nombre) === normPaymentType
            );

            if (fuzzyMatch) {
              incidencesList.push({
                type: 'data_error',
                severity: 'advertencia',
                ruleCode: 'RN-005',
                detail: `[Fila: ${o.sheetRow}] El "Payment Type" "${o.paymentType}" coincide con el método de pago "${fuzzyMatch.nombre}", pero tiene diferencias menores de tilde o formato. Se aconseja registrarlo exactamente igual.`,
                id: o.orden,
                record: o
              });
            } else {
              const allowedNames = activeMessengerMethods.map((m: any) => `"${m.nombre}"`).join(', ');
              incidencesList.push({
                type: 'data_error',
                severity: 'critica',
                ruleCode: 'RN-005',
                detail: `[Fila: ${o.sheetRow}] El "Payment Type" "${o.paymentType}" no coincide con ningún método de pago de ordenes registrado (${allowedNames || 'no hay métodos de pago de ordenes activos'}).`,
                id: o.orden,
                record: o
              });
            }
          }
        }
        if (isCellEmpty(o.cliente)) {
          incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Customer" en la orden.`, id: o.orden, record: o });
        }
        /*if (isCellEmpty(o.customerNumber)) {
          incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Customer Number" en la orden.`, id: o.orden, record: o });
        }*/
        if (isCellEmpty(o.negocio)) {
          incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Store" en la orden.`, id: o.orden, record: o });
        }
        if (isCellEmpty(o.orderId)) {
          incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Order ID" en la orden.`, id: o.orden, record: o });
        }

        // "Driver" puede estar vacío si es Recogida (isPickup). De lo contrario, indica falta de mensajero.
        if (isCellEmpty(o.driver) || o.driver?.trim().toLowerCase() === 'no asignado') {
          if (!isPickup) {
            incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-003', detail: `[Fila: ${o.sheetRow}] Falta "Driver" (Mensajero) para orden de envío.`, id: o.orden, record: o });
          }
        }

        // Reglas de excepción para columnas de montos:
        // Si es Mandao Express, se autoriza que "Product Amount", "Store Offer" y "Store Admin Charge" estén vacías.
        if (!isMandaoExpress) {
          if (isCellEmpty(o.productAmountRaw)) {
            incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Product Amount" en la orden regular.`, id: o.orden, record: o });
          }
          if (isCellEmpty(o.storeOfferRaw)) {
            incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Store Offer" en la orden regular.`, id: o.orden, record: o });
          }
          if (isCellEmpty(o.storeAdminChargeRaw)) {
            incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-002', detail: `[Fila: ${o.sheetRow}] Falta "Store Admin Charge" en la orden regular.`, id: o.orden, record: o });
          }
        }

        // Check for duplicate Order IDs inside Orders, unless the Store (negocio) is different
        if (o.orderId && o.negocio) {
          const isDuplicated = filteredOrders.some(other => 
            other !== o && 
            other.orderId && 
            other.orderId.trim().toLowerCase() === o.orderId.trim().toLowerCase() && 
            other.negocio && 
            other.negocio.trim().toLowerCase() === o.negocio.trim().toLowerCase()
          );
          if (isDuplicated) {
            incidencesList.push({ type: 'data_error', severity: 'critica', ruleCode: 'RN-009', detail: `[Fila: ${o.sheetRow}] Número de orden duplicado: El "Order ID" "${o.orderId}" ya está registrado para el mismo negocio "${o.negocio}".`, id: o.orden, record: o });
          }
        }

        incidencesList.forEach(inc => {
          addLog('warn', `Inconsistencia regla de negocio (${inc.ruleCode} - ${inc.severity.toUpperCase()}) en Orden "${o.orderId}" (Fila ${o.sheetRow}): ${inc.detail}`);
        });

        return incidencesList;
      });

      const totalIncidences = [...cambiosIncidences, ...dataIncidences];

      if (totalIncidences.length === 0 && cambiosDetectados.length === 0) {
        addLog('success', '¡Verificación exitosa sin discrepancias! Los datos cumplen el 100% de las invariantes de Mandao.');
      } else {
        if (totalIncidences.length > 0) {
          addLog('error', `Verificación finalizada con un total de ${totalIncidences.length} incidencias registradas.`);
        }
        if (cambiosDetectados.length > 0) {
          addLog('warn', `${cambiosDetectados.length} órdenes con cambios detectados en la hoja "Cambios" — deben confirmarse antes de importar.`);
        }
      }

      setConfirmedChanges({});
      setResult({
        orders: filteredOrders,
        cambios: filteredCambios,
        disponibilidades: filteredDisps,
        incidences: totalIncidences,
        cambiosDetectados
      });

      try {
        const activeAreaObj = areas.find(a => a.id === selectedAreaId);
        const activeAreaName = activeAreaObj ? activeAreaObj.nombre : 'Habana';
        logAuditEvent('Verificacion', 'Proceso de Verificación Ejecutado', {
          areaId: selectedAreaId,
          areaName: activeAreaName,
          rangoFechas: `${formData.fechaInicio} - ${formData.fechaFin}`,
          resultado: totalIncidences.length === 0 ? 'Correcta' : 'Con Incidencias',
          totalIncidencias: totalIncidences.length,
          totalOrdenes: filteredOrders.length,
          totalCambios: filteredCambios.length,
          totalDisponibilidades: filteredDisps.length
        });
      } catch (logErr) {
        console.error("Failed to write verification audit log:", logErr);
      }

    } catch (error: any) {
      addLog('error', `Fallo crítico de verificación: ${error.message}`);
      console.error("Verification error:", error);
      alert("Error en la verificación: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!result || !selectedAreaId) return;
    setImporting(true);

    try {
      addLog('info', 'Paso 1: Consultando registros ya almacenados en Supabase para prevenir duplicados durante la importación...');
      const [{ data: existingDbOrders, error: ordersErr }, { data: existingDbCambios, error: cambiosErr }, { data: existingDbDisps, error: dispsErr }] = await Promise.all([
        supabase.from('dispatcher').select('order_id, delivery_date, product_amount, store'),
        supabase.from('dispatcher_changes').select('order_id, change_date, product_amount, delivery_charge'),
        supabase.from('availabilities').select('messenger_name, availability_date, amount_to_pay, reason')
      ]);

      if (ordersErr || cambiosErr || dispsErr) {
        addLog('warn', `No se completó la carga de registros previos: ${(ordersErr || cambiosErr || dispsErr)?.message}. Continuando importación sin filtrado de duplicados.`);
      } else {
        addLog('success', `Cargados correctamente ${existingDbOrders?.length || 0} órdenes, ${existingDbCambios?.length || 0} cambios y ${existingDbDisps?.length || 0} disponibilidades registradas de la base de datos para filtrado automático.`);
      }

      const activeAreaObj = areas.find(a => a.id === selectedAreaId);
      const activeAreaName = activeAreaObj ? activeAreaObj.nombre : 'Habana';

      // Filter arrays on import
      const filteredOrdersToImport = result.orders.filter((o: any) => {
        if (!o.orderId) return true;
        const isAlreadyInDb = (existingDbOrders || []).some((dbO: any) => {
          const sameId = String(dbO.order_id || '').trim().toLowerCase() === String(o.orderId || '').trim().toLowerCase();
          const sameDate = dbO.delivery_date && o.deliveryDate && (normalizeDateStr(dbO.delivery_date) === normalizeDateStr(o.deliveryDate));
          const sameMonto = Math.abs((dbO.product_amount || 0) - (o.productAmount || 0)) < 0.02;
          const sameStore = String(dbO.store || '').trim().toLowerCase() === String(o.negocio || '').trim().toLowerCase();
          return sameId && sameDate && sameMonto && sameStore;
        });
        return !isAlreadyInDb;
      });

      const filteredCambiosToImport = result.cambios.filter((c: any) => {
        if (!c.orden) return true;
        const isAlreadyInDbCambio = (existingDbCambios || []).some((dbC: any) => {
          const sameId = String(dbC.order_id || '').trim().toLowerCase() === String(c.orden || '').trim().toLowerCase();
          const sameDate = dbC.change_date && c.fecha && (normalizeDateStr(dbC.change_date) === normalizeDateStr(c.fecha));
          const sameMontoProd = Math.abs((dbC.product_amount || 0) - (c.montoProducto || 0)) < 0.02;
          const sameMontoDel = Math.abs((dbC.delivery_charge || 0) - (c.montoDelivery || 0)) < 0.02;
          return sameId && sameDate && sameMontoProd && sameMontoDel;
        });
        return !isAlreadyInDbCambio;
      });

      const filteredDispsToImport = result.disponibilidades.filter((d: any) => {
        if (!d.mensajero) return true;
        const isAlreadyInDbDisp = (existingDbDisps || []).some((dbD: any) => {
          const sameDriver = String(dbD.messenger_name || '').trim().toLowerCase() === String(d.mensajero || '').trim().toLowerCase();
          const sameDate = dbD.availability_date && d.fecha && (normalizeDateStr(dbD.availability_date) === normalizeDateStr(d.fecha));
          const sameMonto = Math.abs((dbD.amount_to_pay || 0) - (d.monto || 0)) < 0.02;
          const sameDetalle = String(dbD.reason || '').trim().toLowerCase() === String(d.detalle || '').trim().toLowerCase();
          return sameDriver && sameDate && sameMonto && sameDetalle;
        });
        return !isAlreadyInDbDisp;
      });

      const newOrdersCount = filteredOrdersToImport.length;
      const newCambiosCount = filteredCambiosToImport.length;
      const newDispsCount = filteredDispsToImport.length;

      if (newOrdersCount === 0 && newCambiosCount === 0 && newDispsCount === 0) {
        addLog('warn', 'Todos los registros ya están en la Base de Datos. No hay registros nuevos que importar.');
        showToast('success', 'Todos los registros ya están actualizados en la Base de Datos.');
        setResult(null);
        setImporting(false);
        return;
      }

      addLog('info', `Iniciando importación a Supabase para ${newOrdersCount} órdenes nuevas, ${newCambiosCount} cambios nuevos y ${newDispsCount} disponibilidades nuevas...`);

      // 0. Registrar la corrida de verificación primero (para obtener verification_id)
      const { data: userData } = await supabase.auth.getUser();
      const currentUserId = userData?.user?.id;
      const { data: verificationRow, error: verificationErr } = await supabase
        .from('dispatcher_verifications')
        .insert({
          area_id: selectedAreaId,
          start_date: formData.fechaInicio,
          end_date: formData.fechaFin,
          user_id: currentUserId,
          status: result.incidences.length === 0 ? 'correcta' : 'con_incidencias',
          total_orders: newOrdersCount,
          total_changes: newCambiosCount,
          total_incidents: result.incidences.length,
          imported_by: currentUserId,
          import_completed_at: new Date().toISOString()
        })
        .select('verification_id')
        .single();

      if (verificationErr || !verificationRow) {
        throw new Error(`No se pudo registrar la verificación: ${verificationErr?.message}`);
      }
      const verificationId = verificationRow.verification_id;

      // 1. Insertar órdenes nuevas
      if (newOrdersCount > 0) {
        const { error } = await supabase.from('dispatcher').insert(
          filteredOrdersToImport.map((o: any) => ({
            delivery_date: normalizeDateStr(o.deliveryDate) || null,
            order_date: normalizeDateStr(o.orderDate) || null,
            payment_type: o.paymentType,
            customer: o.cliente,
            customer_number: o.customerNumber,
            driver: o.driver,
            store: o.negocio,
            order_id: o.orderId,
            product_amount: o.productAmount,
            store_offer: o.storeOffer,
            processing_fee: o.processingFee,
            store_admin_charge: o.storeAdminCharge,
            delivery_charge: o.deliveryCharge,
            extra_delivery_charge: o.extraDeliveryCharge,
            driver_admin_charge: o.driverAdminCharge,
            complementary_delivery: String(o.complementaryDelivery ?? ''),
            tax: o.transactionFee,
            promocode: o.promocode,
            area_id: selectedAreaId,
            verification_id: verificationId
          }))
        );
        if (error) throw new Error(`Error importando órdenes: ${error.message}`);
      }

      // 2. Insertar cambios nuevos (dispatcher_changes = filas reales de la pestaña "Cambios")
      if (newCambiosCount > 0) {
        const { error } = await supabase.from('dispatcher_changes').insert(
          filteredCambiosToImport.map((c: any) => ({
            verification_id: verificationId,
            order_id: c.orden,
            store: c.negocio,
            driver: c.mensajero,
            payment_type: c.tipoPago,
            product_amount: c.montoProducto,
            delivery_charge: c.montoDelivery,
            detail: c.detalle,
            change_date: normalizeDateStr(c.fecha) || null
          }))
        );
        if (error) throw new Error(`Error importando cambios: ${error.message}`);
      }

      // 3. Insertar disponibilidades detectadas en la pestaña "Disponibilidades" del Dispatcher
      //    (tabla única availabilities — sin la copia duplicada que tenía Firestore)
      if (newDispsCount > 0) {
        const { error } = await supabase.from('availabilities').insert(
          filteredDispsToImport.map((d: any) => ({
            messenger_name: d.mensajero,
            amount_to_pay: d.monto,
            reason: d.detalle,
            availability_date: normalizeDateStr(d.fecha) || null,
            area_id: selectedAreaId
          }))
        );
        if (error) throw new Error(`Error importando disponibilidades: ${error.message}`);
      }

      // 4. Persistir las incidencias detectadas para auditoría (dispatcher_incidents)
      if (result.incidences.length > 0) {
        const { error } = await supabase.from('dispatcher_incidents').insert(
          result.incidences.map((inc: any) => ({
            verification_id: verificationId,
            order_id: String(inc.id || 'N/A'),
            severity: inc.severity || 'informativa',
            rule_code: inc.ruleCode || 'N/A',
            description: inc.detail
          }))
        );
        if (error) console.error("Failed to persist incidents:", error.message);
      }

      addLog('success', 'Datos guardados correctamente en Supabase.');

      try {
        await logAuditEvent('Verificacion', 'Importación de Datos Completada', {
          tipo: formData.tipo,
          areaName: activeAreaName,
          rangoFechas: `${formData.fechaInicio} - ${formData.fechaFin}`,
          nuevasOrdenes: newOrdersCount,
          nuevosCambios: newCambiosCount,
          nuevasDisponibilidades: newDispsCount
        });
      } catch (logErr) {
        console.error("Failed to write import audit log:", logErr);
      }

      await loadHistory();
      showToast('success', `¡Importación Exitosa! Se registraron: ${newOrdersCount} órdenes nuevas, ${newCambiosCount} cambios nuevos y ${newDispsCount} disponibilidades nuevas.`);
      setResult(null);
    } catch (error: any) {
      addLog('error', `Fallo al escribir en la base de datos Supabase: ${error.message}`);
      console.error("Error importing data:", error);
      showToast('error', "Error al importar datos a la base de datos: " + error.message);
    } finally {
      setImporting(false);
    }
  };

  const base64UrlEncode = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const sendEmailReport = async () => {
    if (!result) {
      alert("No hay resultados de verificación para enviar.");
      return;
    }
    
    let activeToken = googleToken;
    if (!activeToken) {
      activeToken = await handleConnectGoogle();
      if (!activeToken) {
        return;
      }
    }

    if (!notifyEmails.trim()) {
      alert("Por favor, configure al menos un correo destinatario en la sección de parámetros de verificación.");
      return;
    }

    try {
      setIsSendingEmail(true);

      const incidenciasHtml = result.incidences.length > 0
        ? result.incidences.map((inc, index) => `
          <tr style="border-bottom: 1px solid #fee2e2; max-height: 100px;">
            <td style="padding: 10px; font-weight: bold; color: #b91c1c; font-family: monospace;">${inc.id || 'N/A'}</td>
            <td style="padding: 10px; color: #374151;">${inc.detail}</td>
          </tr>
        `).join('')
        : '';

      const centroDisplay = formData.tipo === 'habana' ? 'La Habana' : formData.tipo === 'holguin' ? 'Holguín' : 'Provincias';
      const rangeDisplay = `${formData.fechaInicio} a ${formData.fechaFin}`;
      const userDisplay = user?.email || 'raul@mandao.app';
      const timestampDisplay = new Date().toLocaleString();

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
            <span style="background-color: #fffbeb; color: #171717; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 100px; text-transform: uppercase; border: 1px solid #fde047;">Mandao Conciliaciones</span>
            <h2 style="color: #0f172a; font-weight: 800; margin-top: 10px; margin-bottom: 4px; font-size: 20px;">Reporte de Verificación de Dispatcher</h2>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Sincronización automatizada de Google Sheets</p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #f1f5f9;">
            <h4 style="margin: 0 0 12px 0; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Detalles de la Ejecución</h4>
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Centro de Operación:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${centroDisplay}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Rango de Fechas:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${rangeDisplay}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Operator / Despachador:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${userDisplay}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Fecha de Procesamiento:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${timestampDisplay}</td>
              </tr>
            </table>
          </div>

          <div style="margin-bottom: 24px;">
            <h4 style="margin: 0 0 12px 0; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Resumen de Registros de Verificación</h4>
            <div style="display: table; width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 8px 0; margin-left: -8px; margin-right: -8px;">
              <div style="display: table-cell; text-align: center; background-color: #f0fdf4; padding: 12px; border-radius: 8px; border: 1px solid #bbf7d0;">
                <div style="font-size: 9px; color: #166534; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Orders</div>
                <div style="font-size: 24px; color: #166534; font-weight: 800; margin-top: 4px;">${result.orders.length}</div>
              </div>
              <div style="display: table-cell; text-align: center; background-color: #f5f3ff; padding: 12px; border-radius: 8px; border: 1px solid #ddd6fe;">
                <div style="font-size: 9px; color: #5b21b6; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Cambios</div>
                <div style="font-size: 24px; color: #5b21b6; font-weight: 800; margin-top: 4px;">${result.cambios.length}</div>
              </div>
              <div style="display: table-cell; text-align: center; background-color: ${result.incidences.length > 0 ? '#fef2f2' : '#f0fdf4'}; padding: 12px; border-radius: 8px; border: 1px solid ${result.incidences.length > 0 ? '#fca5a5' : '#bbf7d0'};">
                <div style="font-size: 9px; color: ${result.incidences.length > 0 ? '#991b1b' : '#166534'}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Incidencias</div>
                <div style="font-size: 24px; color: ${result.incidences.length > 0 ? '#991b1b' : '#166534'}; font-weight: 800; margin-top: 4px;">${result.incidences.length}</div>
              </div>
            </div>
          </div>

          ${result.incidences.length > 0 ? `
            <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
              <h4 style="margin: 0 0 12px 0; color: #991b1b; font-size: 13px; font-weight: 700;">Detalles de Discrepancias Detectadas</h4>
              <div style="border: 1px solid #fee2e2; border-radius: 8px; overflow: hidden; font-size: 13px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                  <thead>
                    <tr style="background-color: #fef2f2; border-bottom: 1px solid #fee2e2;">
                      <th style="padding: 12px; color: #991b1b; font-weight: 700; width: 140px;">Orden ID</th>
                      <th style="padding: 12px; color: #991b1b; font-weight: 700;">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${incidenciasHtml}
                  </tbody>
                </table>
              </div>
              <p style="font-size: 12px; color: #ef4444; margin-top: 12px; font-style: italic; font-weight: 500; line-height: 1.5;">
                * Nota: Las incidencias detectadas deben corregirse en la hoja original de Google Sheets. Una vez subsanadas, ejecute nuevamente la verificación en la plataforma Mandao para validar las correcciones antes de la importación final.
              </p>
            </div>
          ` : `
            <div style="text-align: center; padding: 24px; background-color: #ecfdf5; border-radius: 8px; border: 1px solid #a7f3d0; color: #065f46;">
              <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700;">✓ Conciliación Completada con Éxito</h3>
              <p style="font-size: 13px; margin: 0; line-height: 1.5; color: #047857;">Todos los registros cuadran de forma impecable sin detectarse incidencias ni orfandades.</p>
            </div>
          `}
          
          <div style="text-align: center; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 11px; color: #94a3b8; font-weight: 500;">
            Generado automáticamente • Mandao Delivery Solutions
          </div>
        </div>
      `;

      const emails = notifyEmails.split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0 && email.includes('@'));

      if (emails.length === 0) {
        throw new Error("No se encontraron direcciones de correo válidas.");
      }

      const subjectText = `[Mandao] Reporte de Conciliación - ${centroDisplay} (${result.incidences.length} Incidencias)`;
      const encodedSubject = base64UrlEncode(subjectText);

      for (const email of emails) {
        const mimeMessage = [
          `To: ${email}`,
          `Subject: =?utf-8?B?${encodedSubject}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=utf-8',
          '',
          htmlBody
        ].join('\r\n');

        const base64Mime = base64UrlEncode(mimeMessage);

        const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ raw: base64Mime })
        });

        if (!sendRes.ok) {
          if (sendRes.status === 401) {
            setGoogleToken(null);
            sessionStorage.removeItem('google_access_token');
            throw new Error("El token de Google ha expirado o es inválido (401). El token ha sido revertido. Por favor, vuelve a iniciar sesión o verificar de nuevo para revivir la conexión.");
          }
          const errData = await sendRes.json();
          throw new Error(`Gmail API error para ${email}: ${errData.error?.message || sendRes.statusText}`);
        }
      }

      showToast('success', `Reporte de correo enviado con éxito a: ${emails.join(', ')}`);
    } catch (e: any) {
      console.error("Error sending email:", e);
      showToast('error', "Error al enviar el reporte por correo: " + e.message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const exportToPDF = () => {
    if (!result) return;
    addLog('info', 'Iniciando generación de PDF con jsPDF y jsPDF-AutoTable...');
    try {
      import('jspdf').then(async (jsPDFModule) => {
        const { jsPDF } = jsPDFModule;
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        // Add brand styling
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(15, 118, 110); // Tea color
        doc.text('Mandao Conciliaciones - Reporte de Verificación', 14, 20);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const rangeText = `Rango de Fechas: ${formData.fechaInicio} a ${formData.fechaFin}`;
        doc.text(rangeText, 14, 26);
        doc.text(`Despachador/Usuario: ${user?.email || 'sin-autenticar@mandao.app'}`, 14, 31);
        doc.text(`Fecha ejecución: ${new Date().toLocaleString()}`, 14, 36);

        // Grid Summary block
        doc.setFontSize(11);
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Resumen de Registros', 14, 46);

        // Row metrics
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`- Orders procesadas: ${result.orders.length}`, 14, 52);
        doc.text(`- Cambios manuales: ${result.cambios.length}`, 14, 57);
        doc.text(`- Incidencias encontradas: ${result.incidences.length}`, 14, 62);

        if (result.incidences.length > 0) {
          doc.setFont('Helvetica', 'bold');
          doc.text('Detalle de Incidencias Detectadas:', 14, 72);

          // Render structured autotable
          const tableHeaders = [['No. Orden', 'Tipo Incidencia', 'Detalle de Inconsistencia']];
          const tableRows = result.incidences.map(inc => [
            inc.id || 'N/A',
            inc.type === 'mismatch' ? 'Mismatch / Huérfana' : 'Error de datos',
            inc.detail
          ]);

          autoTable(doc, {
            startY: 75,
            head: tableHeaders,
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [185, 28, 28] }, // Dark red for errors
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
              0: { cellWidth: 30, fontStyle: 'bold' },
              1: { cellWidth: 40 },
              2: { cellWidth: 'auto' }
            }
          });
        } else {
          doc.setFont('Helvetica', 'bold');
          doc.setTextColor(21, 128, 61); // Green
          doc.text('✓ CONCILIACIÓN PERFECTA: Cero incidencias detectadas.', 14, 72);
        }

        doc.save(`reporte-verificacion-dispatcher-${formData.tipo}-${formData.fechaInicio}.pdf`);
        addLog('success', 'Reporte PDF exportado con éxito mediante biblioteca local.');
      }).catch(err => {
        console.error('jsPDF error:', err);
        addLog('error', `Error al inicializar jsPDF: ${err.message}`);
        alert('Error al exportar PDF: ' + err.message);
      });
    } catch (err: any) {
      addLog('error', `Error al generar PDF: ${err.message}`);
      alert("Error al intentar exportar las incidencias a PDF: " + err.message);
    }
  };

  // computation of filtered and paginated incidences in the verification page
  const filteredIncidences = (result?.incidences || []).filter(inc => {
    const searchLower = searchQuery.toLowerCase().trim();
    if (searchLower) {
      const matchId = (inc.id || '').toLowerCase().includes(searchLower);
      const matchDetail = (inc.detail || '').toLowerCase().includes(searchLower);
      const matchRule = (inc.ruleCode || '').toLowerCase().includes(searchLower);
      if (!matchId && !matchDetail && !matchRule) return false;
    }
    
    if (severityFilter !== 'todos') {
      if (inc.severity !== severityFilter) return false;
    }
    
    if (ruleFilter !== 'todos') {
      if (inc.ruleCode !== ruleFilter) return false;
    }
    
    return true;
  });

  const totalItems = filteredIncidences.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const activePage = currentPage > totalPages ? totalPages : currentPage;
  
  const paginatedIncidences = filteredIncidences.slice(
    (activePage - 1) * itemsPerPage,
    activePage * itemsPerPage
  );

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIdsInPage = paginatedIncidences.map((inc, index) => `${inc.id || 'N/A'}-${index}`);
      setSelectedIncidences(allIdsInPage);
    } else {
      setSelectedIncidences([]);
    }
  };

  const handleSelectRow = (idWithIndex: string) => {
    setSelectedIncidences(prev => {
      if (prev.includes(idWithIndex)) {
        return prev.filter(p => p !== idWithIndex);
      } else {
        return [...prev, idWithIndex];
      }
    });
  };

  const handleExportSelectedToClipboard = () => {
    if (selectedIncidences.length === 0) return;
    const recordsText = paginatedIncidences
      .filter((inc, index) => selectedIncidences.includes(`${inc.id || 'N/A'}-${index}`))
      .map(inc => `[ID: ${inc.id || 'N/A'} - ${inc.ruleCode || 'N/A'} - ${inc.severity ? inc.severity.toUpperCase() : 'N/A'}]: ${inc.detail}`)
      .join('\n');
    navigator.clipboard.writeText(recordsText);
    addLog('success', `Copiadas ${selectedIncidences.length} incidencias seleccionadas al portapapeles.`);
    alert(`Copiadas ${selectedIncidences.length} incidencias seleccionadas al portapapeles.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Verificación de Dispatcher</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Verificación automatizada entre Ordenes y Cambios en documento Dispatcher.
          </p>
        </div>
        <div className="flex items-center gap-2">
           <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              title="¿Qué valida el diagnóstico?"
              aria-label="Ayuda sobre la Verificación de Dispatcher"
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full border text-sm font-bold transition-all shadow-sm shrink-0",
                showHelp
                  ? "bg-amber-100 text-amber-700 border-amber-300 scale-105"
                  : "bg-[var(--color-surface-2)] text-[var(--color-text-faint)] border-[var(--color-border)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]"
              )}
           >
              <HelpCircle size={18} />
           </button>
           <Button variant="ghost" className="gap-2" onClick={() => setShowHistory(true)}>
              <History size={16} />
              Ver Historial
           </Button>
        </div>
      </div>

      {/* Panel de Ayuda — sección 5.1 de las instrucciones: "icono de ayuda
          donde se muestre como funciona el proceso" */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-amber-50/75 border border-amber-200/80 rounded-xl p-4 shadow-sm text-xs text-amber-900 space-y-3"
          >
            <div className="flex items-center gap-2 font-bold text-amber-800 text-sm">
              <Info size={16} />
              <span>¿Qué valida el diagnóstico?</span>
            </div>
            <p className="leading-relaxed">
              El verificador de Dispatcher compara la información bruta introducida en el documento Google Sheets (pestañas "Orders" y "Cambios") contra las reglas de negocio RN-001 a RN-009 antes de habilitar la importación a la Base de Datos.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="font-bold underline mb-1">Reglas de excepción (Celdas Vacías)</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Negocio (Store) "Mandao Express":</strong> se exceptúa y autoriza la ausencia de "Product Amount", "Store Offer" y "Store Admin Charge" (ejemplo = 0.00 o = "-").</li>
                  <li><strong>Recogida en el Negocio</strong> (cliente recoge en el establecimiento): se exceptúa la ausencia del Mensajero cuando "Delivery Charge", "Extra Delivery Charge", "Driver Admin Charge" y "Complementary Delivery" están vacíos/"-"/0 (RN-003).</li>
                  <li><strong>Payment Type:</strong> debe coincidir con los métodos de pago de mensajeros registrados; se acepta coincidencia difusa (tildes, mayúsculas, guiones) como advertencia — sin ninguna coincidencia, es incidencia crítica (RN-005).</li>
                </ul>
              </div>
              <div>
                <p className="font-bold underline mb-1">Procedimiento de Corrección</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>La importación a la Base de Datos queda completamente restringida si existen incidencias críticas (RN-006).</li>
                  <li>Los arreglos no se realizan desde la aplicación: corrija los datos directamente en el documento de Google Sheets original.</li>
                  <li>Una vez editados, vuelva a pulsar "Verificar Dispatcher" para validar los cambios y habilitar el botón "Importar a la BD".</li>
                  <li>Solo Super Admin o Supervisor pueden importar; Operador puede ejecutar Verificaciones pero no Importar.</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Secure Parameters Panel */}
          <div className="bg-[var(--color-surface)] p-6 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm">
            <h3 className="text-sm font-bold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-[var(--color-primary)]" />
              Parámetros de Verificación
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider block">Centro de Operación / Dispatcher</label>
                <select 
                  className="w-full h-10 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
                  value={selectedAreaId}
                  onChange={(e) => handleAreaChange(e.target.value)}
                >
                  <option value="">-- Seleccionar Dispatcher/Área --</option>
                  {areas.length === 0 ? (
                    <option disabled>Cargando áreas de la base de datos...</option>
                  ) : (
                    areas.filter(a => a.estado === 'activo').map(a => (
                      <option key={a.id} value={a.id}>
                        {a.nombre} ({a.provincia})
                      </option>
                    ))
                  )}
                </select>
                {selectedAreaId && !spreadsheetId.trim() && (
                  <p className="text-xs text-[var(--color-danger)] flex items-center gap-1.5 pt-1">
                    <AlertCircle size={12} className="shrink-0" />
                    Esta Área no tiene un ID de Google Sheet configurado (campo "ID Documento Google Sheet"
                    en Configuración → Áreas). El botón "Verificar Dispatcher" permanecerá deshabilitado
                    hasta que lo completes ahí.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Desde</label>
                  <input type="date" className="w-full h-10 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all" value={formData.fechaInicio} onChange={(e) => setFormData({...formData, fechaInicio: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider">Hasta</label>
                  <input type="date" className="w-full h-10 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all" value={formData.fechaFin} onChange={(e) => setFormData({...formData, fechaFin: e.target.value})} />
                </div>
              </div>

              <Button 
                variant="brand" 
                className="w-full gap-1.5 font-bold h-10 shadow-sm uppercase tracking-wider text-xs" 
                onClick={handleVerify} 
                disabled={loading || !spreadsheetId.trim()}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {loading ? 'Validando...' : 'Verificar Dispatcher'}
              </Button>
            </div>
          </div>
          
          {result && (
            <div className="bg-[var(--color-surface)] p-6 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
              <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
                <Database size={16} className="text-[var(--color-primary)]" />
                Gestión de Resultados
              </h3>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--color-text-faint)] uppercase tracking-wider block">Notificar Reporte a (Emails)</label>
                  <input 
                    type="text" 
                    value={notifyEmails} 
                    onChange={(e) => setNotifyEmails(e.target.value)}
                    placeholder="raul@mandao.app, support@mandao.app..."
                    className="w-full h-10 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-[10px] text-[var(--color-text-muted)] block leading-normal">
                    Separar con comas para múltiples destinatarios.
                  </span>
                  
                  <Button 
                    variant="outline" 
                    className="w-full text-xs font-bold h-9 mt-1 border-slate-200" 
                    onClick={handleSaveConfig} 
                    disabled={isSavingConfig}
                  >
                    {isSavingConfig ? <Loader2 size={12} className="animate-spin" /> : 'Guardar Emails'}
                  </Button>
                </div>

                {canImport ? (
                  <div className="pt-2 border-t border-[var(--color-border)]">
                    <Button
                      variant="brand"
                      className="w-full gap-2 h-11 transition shadow-sm uppercase font-black"
                      onClick={handleImport}
                      disabled={
                        importing ||
                        result.incidences.filter((i: any) => i.severity === 'critica').length > 0 ||
                        result.cambiosDetectados.some(c => !confirmedChanges[c.orderId]) ||
                        (
                          result.orders.length === 0 &&
                          result.cambios.length === 0 &&
                          result.disponibilidades.length === 0
                        )
                      }
                    >
                      {importing ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                      Importar a la BD
                    </Button>
                    {result.incidences.filter((i: any) => i.severity === 'critica').length === 0 &&
                      result.cambiosDetectados.some(c => !confirmedChanges[c.orderId]) && (
                      <p className="text-[11px] text-indigo-700 font-semibold mt-2 text-center">
                        Confirma todos los "Cambios Detectados" arriba para habilitar la importación.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="pt-2 border-t border-[var(--color-border)]">
                    <div className="flex items-center gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                      <Lock size={14} className="text-[var(--color-text-faint)] shrink-0" />
                      Solo Super Admin o Supervisor pueden importar a la Base de Datos.
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Button variant="outline" className="text-xs gap-2" onClick={exportToPDF}>
                    <Download size={14} /> Descargar PDF
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-xs gap-2" 
                    onClick={sendEmailReport} 
                    disabled={isSendingEmail}
                  >
                    {isSendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    {isSendingEmail ? 'Enviando...' : 'Enviar Reporte'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Content */}
        <div className="lg:col-span-2 min-h-[500px]">
          <AnimatePresence mode="wait">
            {!result && !loading ? (
              <EmptyVerificationState />
            ) : loading ? (
              <LoadingVerificationState />
            ) : (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                {result!.orders.length === 0 && result!.cambios.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3.5 text-amber-950 shadow-sm animate-fade-in">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-pulse" />
                    <div className="space-y-1">
                      <h4 className="font-black text-xs uppercase tracking-wider text-amber-900">Sin Registros en Google Sheets</h4>
                      <p className="text-[11px] font-semibold leading-relaxed text-amber-850">
                        No se detectó ninguna fila registrada en la hoja de <strong>Orders</strong> ni en la hoja de <strong>Cambios</strong> para el rango de fechas seleccionado (<em>{formData.fechaInicio}</em> a <em>{formData.fechaFin}</em>).
                      </p>
                      <p className="text-[10px] text-amber-700/90 font-bold">
                        Como medida de seguridad, la importación a la Base de Datos se encuentra deshabilitada temporalmente hasta que seleccione un rango donde existan transacciones o cambios a auditar.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <SummaryCard 
                    label="Ordenes Encontradas (Dispatcher)" 
                    value={result!.orders.length} 
                    icon={CheckCircle2} 
                    color="text-emerald-600" 
                    description="Registros filtrados de la hoja 'Orders' para el rango de fecha."
                  />
                  <SummaryCard 
                    label="Cambios Encontrados (Dispatcher)" 
                    value={result!.cambios.length} 
                    icon={FileSearch} 
                    color="text-indigo-600" 
                    description="Total de filas leídas de la pestaña 'Cambios'."
                  />
                  <SummaryCard 
                    label="Incidencias Totales" 
                    value={result!.incidences.length} 
                    icon={AlertCircle} 
                    color={result!.incidences.length > 0 ? "text-rose-600" : "text-emerald-600"} 
                    description="Incidencias detectadas."
                  />
                </div>

                {result!.cambiosDetectados.length > 0 && (
                  <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-indigo-200 shadow-sm overflow-hidden p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
                          <FileSearch size={16} className="text-indigo-600" />
                          Cambios Detectados — requieren confirmación
                        </h3>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          Estas órdenes fueron modificadas según la hoja "Cambios". No son errores — confirma cada una para habilitar "Importar a la BD".
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const allConfirmed = result!.cambiosDetectados.every(c => confirmedChanges[c.orderId]);
                          const next: Record<string, boolean> = {};
                          result!.cambiosDetectados.forEach(c => { next[c.orderId] = !allConfirmed; });
                          setConfirmedChanges(next);
                        }}
                        className="text-xs font-bold text-indigo-600 hover:underline shrink-0"
                      >
                        {result!.cambiosDetectados.every(c => confirmedChanges[c.orderId]) ? 'Desmarcar todo' : 'Confirmar todo'}
                      </button>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {result!.cambiosDetectados.map(c => (
                        <label
                          key={c.orderId}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-[var(--radius-sm)] border cursor-pointer transition-colors",
                            confirmedChanges[c.orderId]
                              ? "bg-emerald-50 border-emerald-200"
                              : "bg-indigo-50/50 border-indigo-200"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 shrink-0"
                            checked={!!confirmedChanges[c.orderId]}
                            onChange={(e) => setConfirmedChanges(prev => ({ ...prev, [c.orderId]: e.target.checked }))}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[var(--color-text)]">Orden {c.orderId}</p>
                            <ul className="mt-1 space-y-0.5">
                              {c.diffs.map((d, idx) => (
                                <li key={idx} className="text-xs text-[var(--color-text-muted)]">
                                  <span className="font-semibold">{d.campo}:</span> {d.valorOrders} → {d.valorCambios}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                 <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-sm overflow-hidden flex flex-col space-y-4 p-4">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[var(--color-border)] gap-2">
                       <div>
                         <h3 className="text-sm font-bold text-[var(--color-text)]">Reporte de Discrepancias (Google Sheet vs Reglas Mandao)</h3>
                         <p className="text-xs text-[var(--color-text-muted)]">Tabla de discrepancias y validaciones interconectadas.</p>
                       </div>
                       <span className={cn(
                         "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase self-start md:self-auto",
                         result!.incidences.length > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                       )}>
                         {result!.incidences.length} {result!.incidences.length === 1 ? 'Incidencia' : 'Incidencias'}
                       </span>
                    </div>

                    {/* Element 1: FilterBar (sticky, always visible) */}
                    <div className="bg-[var(--color-surface-2)] p-3 rounded-[var(--radius-md)] border border-[var(--color-border)] flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" size={16} />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                          placeholder="Buscar por ID, regla o descripción..."
                          className="h-10 w-full pl-9 pr-4 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-teal-500/20 transition"
                        />
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 shrink-0 bg-[var(--color-surface)] px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                          <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">Severidad:</span>
                          <select
                            value={severityFilter}
                            onChange={(e) => { setSeverityFilter(e.target.value); setCurrentPage(1); }}
                            className="bg-transparent text-xs text-[var(--color-text)] outline-none font-medium cursor-pointer"
                          >
                            <option value="todos">Todas</option>
                            <option value="critica">Crítica (RN Error)</option>
                            <option value="advertencia">Advertencia</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 bg-[var(--color-surface)] px-2.5 py-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)]">
                          <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">Regla:</span>
                          <select
                            value={ruleFilter}
                            onChange={(e) => { setRuleFilter(e.target.value); setCurrentPage(1); }}
                            className="bg-transparent text-xs text-[var(--color-text)] outline-none font-medium cursor-pointer font-mono"
                          >
                            <option value="todos">Todas</option>
                            <option value="RN-001">RN-001: Cambios</option>
                            <option value="RN-002">RN-002: Mandao Express & Campos</option>
                            <option value="RN-003">RN-003: Pickup / Driver</option>
                            <option value="RN-004">RN-004: Fees y Promocode en Cero</option>
                            <option value="RN-009">RN-009: Duplicidad</option>
                          </select>
                        </div>

                        {(searchQuery || severityFilter !== 'todos' || ruleFilter !== 'todos') && (
                          <button
                            onClick={() => { setSearchQuery(''); setSeverityFilter('todos'); setRuleFilter('todos'); setCurrentPage(1); }}
                            className="h-10 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-[var(--radius-sm)] border border-rose-200 transition"
                          >
                            Limpiar Filtros
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Element 2: BulkActionsBar (visible only with selection) */}
                    <AnimatePresence>
                      {selectedIncidences.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-teal-50 border border-teal-200 rounded-[var(--radius-md)] p-3 flex flex-col sm:flex-row items-center justify-between gap-2 overflow-hidden"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                            <span className="text-xs text-teal-800 font-bold">
                              {selectedIncidences.length} {selectedIncidences.length === 1 ? 'incidencia seleccionada' : 'incidencias seleccionadas'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <button
                              onClick={handleExportSelectedToClipboard}
                              className="w-full sm:w-auto px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-[var(--radius-sm)] text-xs font-bold transition flex items-center justify-center gap-1"
                            >
                              <Send size={12} /> Copiar Detalles
                            </button>
                            <button
                              onClick={() => setSelectedIncidences([])}
                              className="w-full sm:w-auto px-3 py-1.5 bg-transparent hover:bg-teal-100 text-teal-700 rounded-[var(--radius-sm)] text-xs font-bold transition"
                            >
                              Anular Selección
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Element 3 & 4: Table with Headers and Rows */}
                    <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface)]">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[700px]">
                          {/* thead sticky */}
                          <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)] sticky top-0 z-10 text-[var(--color-text-muted)] text-[11px] font-bold uppercase tracking-wider">
                            <tr>
                              <th className="p-3 w-12 text-center">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 text-[var(--color-primary)] rounded border-[var(--color-border)] focus:ring-teal-500 cursor-pointer"
                                  checked={paginatedIncidences.length > 0 && paginatedIncidences.every((inc, index) => selectedIncidences.includes(`${inc.id || 'N/A'}-${index}`))}
                                  onChange={handleSelectAll}
                                />
                              </th>
                              <th className="p-3 w-28">Order ID</th>
                              <th className="p-3 w-28">Regla</th>
                              <th className="p-3 w-32 font-medium">Severidad</th>
                              <th className="p-3">Detalle Invariante o Discrepancia</th>
                              <th className="p-3 text-right w-36">Acciones</th>
                            </tr>
                          </thead>
                          
                          <tbody className="divide-y divide-[var(--color-border)] text-xs">
                            {paginatedIncidences.length > 0 ? (
                              paginatedIncidences.map((inc, index) => {
                                const rowKey = `${inc.id || 'N/A'}-${index}`;
                                const isSelected = selectedIncidences.includes(rowKey);
                                const isCritica = inc.severity === 'critica';
                                
                                return (
                                  <tr
                                    key={rowKey}
                                    className={cn(
                                      "group transition-colors h-12 hover:bg-[var(--color-surface-2)]",
                                      isSelected && "bg-teal-50/70 hover:bg-teal-50",
                                      isCritica ? "hover:bg-rose-50/30" : "hover:bg-amber-50/20"
                                    )}
                                  >
                                    <td className="p-3 text-center align-middle">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleSelectRow(rowKey)}
                                        className="w-4 h-4 text-[var(--color-primary)] rounded border-[var(--color-border)] focus:ring-teal-500 cursor-pointer"
                                      />
                                    </td>
                                    
                                    <td className="p-3 font-mono text-[var(--color-text)] font-semibold align-middle">
                                      {inc.id || 'N/A'}
                                    </td>
                                    
                                    <td className="p-3 align-middle">
                                      <span className="px-2 py-0.5 font-mono text-[10px] font-bold tracking-tight rounded bg-slate-100 text-slate-700 border border-slate-200">
                                        {inc.ruleCode || 'N/A'}
                                      </span>
                                    </td>
                                    
                                    <td className="p-3 align-middle">
                                      <span className={cn(
                                        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                        isCritica ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                                      )}>
                                        <span className={cn("w-1.5 h-1.5 rounded-full", isCritica ? "bg-rose-500" : "bg-amber-500")} />
                                        {isCritica ? 'Crítica' : 'Advertencia'}
                                      </span>
                                    </td>
                                    
                                    <td className="p-3 text-[var(--color-text-muted)] font-medium max-w-sm xl:max-w-md truncate md:whitespace-normal leading-relaxed align-middle">
                                      {inc.detail}
                                    </td>
                                    
                                    <td className="p-3 text-right align-middle">
                                      <button 
                                        onClick={() => setShowIncidenceDetails(inc)}
                                        className="h-9 px-3 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-surface-3)] active:scale-95 rounded-[var(--radius-sm)] transition-all inline-flex items-center gap-1 ml-auto"
                                        title="Ver detalles completos del registro"
                                      >
                                        <Info size={14} /> Inspeccionar
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              /* Element 5: Empty states inside results */
                              <tr>
                                <td colSpan={6} className="py-16 text-center">
                                  <div className="flex flex-col items-center justify-center">
                                    <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3 text-emerald-500">
                                      <CheckCircle2 size={24} />
                                    </div>
                                    <h4 className="text-sm font-bold text-[var(--color-text)]">No se hallaron discrepancias</h4>
                                    <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs mx-auto">
                                      {result!.incidences.length > 0 
                                        ? "No hay elementos que coincidan con la búsqueda o filtros aplicados." 
                                        : "Todos los registros de Dispatcher cumplen rigurosamente las reglas del negocio de Mandao."}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Element 6: Pagination */}
                    {totalItems > 0 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between border-t border-[var(--color-border)] pt-4 gap-2">
                        <span className="text-xs text-[var(--color-text-muted)] font-medium">
                          Mostrando <strong className="text-[var(--color-text)] font-bold">{Math.min(totalItems, (activePage - 1) * itemsPerPage + 1)}</strong> a <strong className="text-[var(--color-text)] font-bold">{Math.min(totalItems, activePage * itemsPerPage)}</strong> de <strong className="text-[var(--color-text)] font-bold">{totalItems}</strong> incidencias encontradas
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={activePage === 1}
                            className="h-10 min-w-10 px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center gap-1"
                          >
                            Anterior
                          </button>
                          
                          <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }).map((_, i) => (
                              <button
                                key={i}
                                onClick={() => setCurrentPage(i + 1)}
                                className={cn(
                                  "h-10 w-10 text-xs font-bold rounded-[var(--radius-sm)] transition",
                                  activePage === i + 1 
                                    ? "bg-[var(--color-primary)] text-white" 
                                    : "border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                                )}
                              >
                                {i + 1}
                              </button>
                            ))}
                          </div>

                          <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={activePage === totalPages}
                            className="h-10 min-w-10 px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center gap-1"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    )}
                 </div>

                 {result!.incidences.length > 0 && (
                   <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                      <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                      <p className="text-xs text-rose-800 leading-relaxed font-semibold">
                        * Los arreglos no se realizan desde la aplicación. Deberá corregir las incidencias detectadas directamente en el documento de Google Sheets original. Una vez editadas, vuelva a ejecutar la verificación para validar los cambios y habilitar el botón de importación a la Base de Datos.
                      </p>
                   </div>
                 )}

                {/* Real-time Audit Log Console */}
                <div className="hidden bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl p-5 overflow-hidden flex flex-col font-mono text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-400 mb-3">
                    <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                      Consola de Auditoría y Verificación en Tiempo Real
                    </div>
                    <button 
                      className="text-[9px] bg-slate-900 hover:bg-slate-800 text-slate-300 py-1 px-2.5 rounded transition font-bold"
                      onClick={() => setLogs([])}
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[185px] overflow-y-auto focus:outline-none scrollbar-thin scrollbar-thumb-slate-800">
                    {logs.map((log) => (
                      <div key={log.id} className={cn(
                        "flex items-start gap-2 leading-relaxed whitespace-pre-wrap",
                        log.lvl === 'error' ? 'text-rose-400 font-bold' :
                        log.lvl === 'warn' ? 'text-amber-300' :
                        log.lvl === 'success' ? 'text-teal-400 font-bold' :
                        'text-slate-300'
                      )}>
                        <span className="text-slate-500 select-none shrink-0">[{log.t}]</span>
                        <span className="shrink-0">{log.lvl === 'error' ? '✖' : log.lvl === 'success' ? '✔' : log.lvl === 'warn' ? '⚠' : 'ℹ'}</span>
                        <span>{log.msg}</span>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <div className="text-slate-500 py-3 text-center italic font-sans animate-pulse">No hay logs registrados en esta sesión de depuración. Inicie un proceso de Verificación para visualizar la auditoría técnica.</div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Incidence Details Modal - READ ONLY */}
      {showIncidenceDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
           <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden">
              <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between bg-slate-50">
                 <h2 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                    <Info size={18} className="text-[var(--color-primary)]" />
                    Detalles del Registro
                 </h2>
                 <button onClick={() => setShowIncidenceDetails(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all text-slate-400">
                    <X size={20} />
                 </button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Detalle de Discrepancia</label>
                    <p className="text-xs font-semibold bg-rose-50 text-rose-700 p-3 rounded-lg border border-rose-100 italic">
                      "{showIncidenceDetails.detail}"
                    </p>
                 </div>
                 
                 <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-1">Campos del Registro Despachado</h4>
                    
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                       <div>
                          <span className="text-slate-400 block font-medium">No. Orden / ID</span>
                          <span className="font-bold text-slate-700 font-mono">{showIncidenceDetails.id || 'N/A'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Tipo de Orden</span>
                          <span className="font-bold text-slate-700">{showIncidenceDetails.record?.tipoOrden || 'Regular'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Driver / Mensajero</span>
                          <span className="font-bold text-slate-700">{showIncidenceDetails.record?.driver || 'N/A'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Negocio / Tienda</span>
                          <span className="font-bold text-slate-700">{showIncidenceDetails.record?.negocio || 'N/A'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Cliente</span>
                          <span className="font-bold text-slate-700">{showIncidenceDetails.record?.cliente || 'N/A'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Teléfono Cliente</span>
                          <span className="font-bold text-slate-700 font-mono">{showIncidenceDetails.record?.customerNumber || 'N/A'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Monto Total</span>
                          <span className="font-bold text-slate-700 tabular-nums">${showIncidenceDetails.record?.monto?.toFixed(2) || '0.00'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Cargo de Entrega</span>
                          <span className="font-bold text-slate-700 tabular-nums">${showIncidenceDetails.record?.deliveryCharge?.toFixed(2) || '0.00'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Monto Producto</span>
                          <span className="font-bold text-slate-700 tabular-nums">${showIncidenceDetails.record?.productAmount?.toFixed(2) || '0.00'}</span>
                       </div>
                       <div>
                          <span className="text-slate-400 block font-medium">Vía de Pago</span>
                          <span className="font-bold text-slate-700">{showIncidenceDetails.record?.paymentType || 'N/A'}</span>
                       </div>
                    </div>
                 </div>

                 <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
                    <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 leading-normal font-medium">
                      Este visualizador es de **solo lectura**. Para corregir la orden, por favor acceda a su Google Sheet original, corrija la fila correspondiente y vuelva a pulsar **Verificar Sheet** en la pantalla principal.
                    </p>
                 </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                 <Button variant="brand" className="h-10 px-6 font-bold" onClick={() => setShowIncidenceDetails(null)}>
                    Cerrar Detalles
                 </Button>
              </div>
           </motion.div>
        </div>
      )}

      {/* History Slideover */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex justify-end">
           <div className="absolute inset-0 bg-black/20" onClick={() => setShowHistory(false)} />
           <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
              <div className="p-6 border-b border-[var(--color-border)] flex items-center justify-between bg-slate-50">
                 <h2 className="text-base font-black uppercase text-slate-500 tracking-wider">Historial de Verificaciones</h2>
                 <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                 {history.length > 0 ? (
                    history.map((record, index) => (
                      <div key={record.id || index} className="p-4 border border-slate-100 rounded-xl bg-slate-50 space-y-2">
                         <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase text-indigo-600">{record.tipo}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{new Date(record.fecha).toLocaleDateString()}</span>
                         </div>
                         <p className="text-xs font-bold text-slate-700">Verificación e Importación</p>
                         <p className="text-[10px] text-slate-500 font-medium">Rango: {record.rango}</p>
                         <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-slate-200/60 text-[10px] text-slate-500 font-medium">
                           <span>Órdenes: <strong className="text-slate-700">{record.ordenes}</strong></span>
                           <span>Incidencias: <strong className={cn(record.incidencias > 0 ? "text-rose-600" : "text-emerald-600")}>{record.incidencias}</strong></span>
                         </div>
                         <div className="text-[9px] text-slate-400 font-mono italic">
                           Ejecutado por: {record.usuario}
                         </div>
                      </div>
                    ))
                 ) : (
                    <div className="py-12 text-center space-y-2">
                       <AlertCircle size={24} className="text-slate-300 mx-auto" />
                       <p className="text-xs text-slate-400">No se registran importaciones previas en el historial.</p>
                    </div>
                 )}
              </div>
           </motion.div>
        </div>
      )}

      {/* Dynamic Toasts Overlay */}
      <div className="fixed top-4 right-4 z-[999] pointer-events-none flex flex-col gap-2 max-w-sm w-full">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, y: -10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className={cn(
                "p-4 rounded-[var(--radius-md)] border shadow-lg pointer-events-auto flex items-start gap-3 backdrop-blur-md",
                toast.type === 'success' 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                  : "bg-rose-50 border-rose-200 text-rose-800"
              )}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} />
              ) : (
                <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={18} />
              )}
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-wider">
                  {toast.type === 'success' ? 'Éxito' : 'Error'}
                </p>
                <p className="text-xs mt-1 leading-relaxed text-slate-600">{toast.message}</p>
              </div>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-slate-400 hover:text-slate-600 transition shrink-0"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function EmptyVerificationState() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full bg-[var(--color-surface-2)] rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)] flex flex-col items-center justify-center p-12 text-center min-h-[500px]">
      <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sm mb-5">
        <Calendar size={32} className="text-[var(--color-text-faint)]" />
      </div>
      <h3 className="text-base font-bold text-[var(--color-text)]">Listo para Validar Dispatcher</h3>
      <p className="text-xs text-[var(--color-text-muted)] mt-2 max-w-sm leading-relaxed">
        Sincroniza tus documentos de Google Sheets con la base de datos de Mandao. Selecciona un centro y rango de fechas para comenzar.
      </p>
    </motion.div>
  );
}

function LoadingVerificationState() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full bg-white rounded-[var(--radius-lg)] border border-[var(--color-border)] flex flex-col items-center justify-center p-12 shadow-sm min-h-[500px]">
      <div className="relative mb-6">
        <Loader2 size={48} className="text-[var(--color-primary)] animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <ShieldCheck size={18} className="text-[var(--color-primary)]" />
        </div>
      </div>
      <h3 className="text-base font-bold text-[var(--color-text)]">Ejecutando Validación</h3>
      <p className="text-xs text-[var(--color-text-muted)] mt-1.5">Cruzando registros entre hojas... Esto puede tardar unos segundos.</p>
      
      <div className="mt-8 w-full max-w-xs space-y-4">
         <ProgressStep label="Conectando con Google Sheets API" active />
         <ProgressStep label="Recuperando y mapeando columnas" active />
         <ProgressStep label="Cruzando registros y buscando Orfandad" active />
         <ProgressStep label="Consolidando reporte de resultados" />
      </div>
    </motion.div>
  );
}

function ProgressStep({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm transition-all shrink-0",
        active ? "bg-[var(--color-primary)] text-white scale-105" : "bg-white text-slate-300 border border-slate-200"
      )}>
        {active ? <Check size={10} /> : null}
      </div>
      <span className={cn("text-xs transition-colors font-medium", active ? "text-[var(--color-text)] font-semibold" : "text-slate-400")}>
        {label}
      </span>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, description }: { label: string; value: number; icon: any; color: string; description?: string }) {
  return (
    <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
           <div className={cn("p-1.5 rounded-lg bg-opacity-10 shrink-0", color.replace('text-', 'bg-'))}>
              <Icon size={16} className={color} />
           </div>
           <p className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">{label}</p>
        </div>
        <p className={cn("text-2xl font-black tabular-nums tracking-tighter", color)}>{value}</p>
      </div>
      {description && (
        <p className="text-[10px] text-[var(--color-text-muted)] font-medium leading-tight mt-2 pt-1.5 border-t border-[var(--color-border)]/40">
          {description}
        </p>
      )}
    </div>
  );
}
