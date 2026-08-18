import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
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
  HelpCircle,
  Clock,
  UserCheck,
  Settings
} from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, logAuditEvent } from '../../lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  orderBy, 
  onSnapshot,
  getDocs,
  where
} from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useAuth } from '../../lib/auth';

interface VerificationResult {
  disponibilidades: any[];
  incidences: { 
    type: 'mismatch' | 'data_error' | 'driver_not_found'; 
    severity?: 'critica' | 'advertencia' | 'informativa'; 
    ruleCode?: string; 
    detail: string; 
    id: string; 
    record: any; 
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

  // Try matching DD/MM/YYYY or DD-MM-YYYY first (standard Spanish/Cuban format) with optional HH:MM:SS
  const dmY = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmY) {
    const day = parseInt(dmY[1], 10);
    const month = parseInt(dmY[2], 10);
    const year = parseInt(dmY[3], 10);
    const hour = dmY[4] ? parseInt(dmY[4], 10) : 0;
    const minute = dmY[5] ? parseInt(dmY[5], 10) : 0;
    const second = dmY[6] ? parseInt(dmY[6], 10) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day, hour, minute, second);
    }
  }

  // Try matching YYYY-MM-DD or YYYY/MM/DD with optional HH:MM:SS
  const Ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (Ymd) {
    const year = parseInt(Ymd[1], 10);
    const month = parseInt(Ymd[2], 10);
    const day = parseInt(Ymd[3], 10);
    const hour = Ymd[4] ? parseInt(Ymd[4], 10) : 0;
    const minute = Ymd[5] ? parseInt(Ymd[5], 10) : 0;
    const second = Ymd[6] ? parseInt(Ymd[6], 10) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return new Date(year, month - 1, day, hour, minute, second);
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

function normalizeDateStr(dateStr: string): string {
  const parsed = parseDateString(dateStr);
  return parsed ? formatDateToYYYYMMDD(parsed) : '';
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
        const seg = segments[i];
        if (i === segments.length - 1) {
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

// Helper to encode string to Base64 Url Safe
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Fuzzy string comparison helpers for RN-005
function fuzzyNormalizedString(str: any): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents/diacritics
    .replace(/\s+/g, ' ') // replace duplicate spaces with a single space
    .replace(/[^a-z0-9 ]/g, ''); // ignore special characters
}

export function DisponibilidadVerificationPage({ permissions = [] }: { permissions?: string[] }) {
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [showIncidenceDetails, setShowIncidenceDetails] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [logs, setLogs] = useState<{ id: string; t: string; lvl: 'info' | 'success' | 'warn' | 'error'; msg: string }[]>([]);
  const [toasts, setToasts] = useState<{ id: string; type: 'success' | 'error'; message: string }[]>([]);
  const [showHelp, setShowHelp] = useState(false);

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

  const [formData, setFormData] = useState({
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: new Date().toISOString().split('T')[0],
  });

  // Load configuration from Firestore and Verification History on mount
  useEffect(() => {
    const loadConfigAndHistory = async () => {
      try {
        const docRef = doc(db, 'settings', 'disponibilidad_config');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.notifyEmails) setNotifyEmails(data.notifyEmails);
        } else {
          // Fallback to dispatcher config if missing
          const dispRef = doc(db, 'settings', 'dispatcher_config');
          const dispSnap = await getDoc(dispRef);
          if (dispSnap.exists()) {
            setNotifyEmails(dispSnap.data().notifyEmails || '');
          }
        }
      } catch (err: any) {
        console.warn("Error loading settings (the client may be offline):", err?.message || err);
      }
    };
    loadConfigAndHistory();

    const q = query(collection(db, 'disponibilidad_verification_history'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(docSub => ({ id: docSub.id, ...docSub.data() }));
      records.sort((a: any, b: any) => {
        const aDate = a.fecha ? new Date(a.fecha).getTime() : 0;
        const bDate = b.fecha ? new Date(b.fecha).getTime() : 0;
        return bDate - aDate;
      });
      setHistory(records);
    }, (err) => {
      console.warn("Offline or transient warning loading verification history:", err.message);
    });

    // Load active Areas dynamically from 'Areas' collection
    const qAreas = query(collection(db, 'Areas'));
    const unsubscribeAreas = onSnapshot(qAreas, (snapshot) => {
      const records = snapshot.docs.map(docSub => ({
        id: docSub.id,
        ...docSub.data()
      }));
      setAreas(records);
    }, (err) => {
      console.warn("Error loading Areas (the client may be offline):", err?.message || err);
    });

    return () => {
      unsubscribe();
      unsubscribeAreas();
    };
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

  const handleConnectGoogle = async (): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');
      
      const currentUserEmail = auth.currentUser?.email;
      if (currentUserEmail) {
        provider.setCustomParameters({
          login_hint: currentUserEmail
        });
      }
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        sessionStorage.setItem('google_access_token', credential.accessToken);
        return credential.accessToken;
      } else {
        alert("No se obtuvo el token de Google. Inténtalo de nuevo.");
      }
    } catch (error: any) {
      console.error("Error connecting Google:", error);
      if (error?.code === 'auth/popup-blocked') {
        alert("El navegador bloqueó la ventana de autenticación de Google. Por favor, permite ventanas emergentes para este sitio o ábrelo en una nueva pestaña e inténtalo de nuevo.");
      } else {
        alert("Error al conectar con Google: " + error.message);
      }
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
      const docRef = doc(db, 'settings', 'disponibilidad_config');
      await setDoc(docRef, { notifyEmails }, { merge: true });
      showToast('success', "¡Parámetros de configuración guardados correctamente en Firestore!");
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
    addLog('info', `Iniciando proceso de Verificación para Disponibilidad del Dispatcher.`);

    let activeToken = googleToken;
    if (!activeToken) {
      addLog('info', 'Google Access Token ausente. Solicitando conexión con Google Auth...');
      activeToken = await handleConnectGoogle();
      if (!activeToken) {
        addLog('error', 'Autorización de Google denegada o cancelada por el usuario. Abortando.');
        return;
      }
      addLog('success', 'Autenticación en Google completada con éxito.');
    }

    setLoading(true);
    setResult(null);
    
    try {
      // Step 1: Fetch Messengers list from DB to check if they exist
      addLog('info', 'Consultando catálogo de Mensajeros registrados en Firestore...');
      let databaseMessengers: any[] = [];
      try {
        const messengerSnap = await getDocs(collection(db, 'messengers'));
        databaseMessengers = messengerSnap.docs.map(docSub => ({
          id: docSub.id,
          ...docSub.data()
        }));
        addLog('success', `Cargados correctamente ${databaseMessengers.length} mensajeros de la base de datos.`);
      } catch (err: any) {
        addLog('warn', `No se pudieron cargar mensajeros desde Firestore: ${err.message}. La validación se hará con base de datos vacía.`);
      }

      addLog('info', `Paso 1: Conectando con Google Sheets API v4. Consultando metadatos para el Spreadsheet ID: ...${spreadsheetId.slice(-8)}`);
      
      let metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (!metaRes.ok) {
        if (metaRes.status === 401) {
          addLog('warn', 'La sesión de Google ha expirado (401). Intentando renovación de token automática...');
          setGoogleToken(null);
          sessionStorage.removeItem('google_access_token');
          
          const renewedToken = await handleConnectGoogle();
          if (!renewedToken) {
            throw new Error("No se pudo renovar la sesión de Google automáticamente. Haz clic de nuevo en Verificar para conectarte.");
          }
          
          addLog('success', 'Nueva sesión de Google autorizada con éxito. Reintentando consulta de metadatos...');
          activeToken = renewedToken;
          
          metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: { Authorization: `Bearer ${activeToken}` }
          });
          
          if (!metaRes.ok) {
            throw new Error(`Fallo tras renovación de token de Google (Código: ${metaRes.status}). Re-intente la operación.`);
          }
        } else {
          throw new Error(`Google Sheets API Error: ${metaRes.statusText} (${metaRes.status}). Asegúrate de que el ID del documento sea correcto y tengas permisos de acceso.`);
        }
      }

      const metaData = await metaRes.json();
      const sheetTitles = metaData.sheets?.map((s: any) => s.properties?.title) || [];
      addLog('success', `Conectado al documento. Pestañas detectadas: [${sheetTitles.join(', ')}]`);

      const dispsTab = sheetTitles.find((name: string) => name.toLowerCase().includes('disponib')) || 'Disponibilidades';
      addLog('info', `Localizando pestaña de Disponibilidad: "${dispsTab}"`);

      addLog('info', 'Descargando datos de la pestaña de Disponibilidades...');
      const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(dispsTab)}!A:Z`;
      let sheetRes = await fetch(sheetUrl, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (!sheetRes.ok) {
        throw new Error(`Error descargando la pestaña "${dispsTab}": ${sheetRes.statusText}`);
      }

      const sheetData = await sheetRes.json();
      const rows = sheetData.values || [];
      addLog('success', `Filas leídas de la hoja: ${rows.length}`);

      if (rows.length === 0) {
        throw new Error(`La hoja "${dispsTab}" está vacía o no tiene cabeceras.`);
      }

      const headers = rows[0] || [];
      addLog('info', 'Analizando cabeceras dinámicas de Google Sheets...');
      const dispsMap = buildHeaderMap(headers);

      // Map rows to structured objects
      const allDisps = rows.slice(1).map((row: any[], idx: number) => {
        // Skip if the entire row is completely empty
        const isRowCompletelyEmpty = row.every(cell => isCellEmpty(cell));
        if (isRowCompletelyEmpty) {
          return null;
        }

        const getVal = (keys: string[]) => {
          for (const key of keys) {
            const normalizedKey = normalizeHeader(key);
            const idxKey = dispsMap[normalizedKey];
            if (idxKey !== undefined && idxKey < row.length) return row[idxKey];
          }
          return '';
        };
        const getNum = (keys: string[]) => {
          const val = getVal(keys);
          return parseCellNumber(val);
        };

        const rawTimestamp = getVal(['Timestamp']);
        const emailAddress = getVal(['Email Address']);
        const orderId = getVal(['No. Orden', 'orderId']);
        const rawAvailabilityDate = getVal(['Fecha de la disponibilidad', 'availabilityDate']);
        const reason = getVal(['Motivo', 'reason']);
        const requestedBy = getVal(['Area o persona que solicta la transportacion', 'requestedBy']);
        const messengerName = getVal(['Mensajero', 'driver', 'mensajero']);
        const amountToPay = getNum(['Monto a pagar', 'montoapagar', 'monto', 'amountToPay']);
        const province = getVal(['Provincias', 'province']);
        const comment = getVal(['Comentario', 'comment']);

        return {
          id: orderId || Math.random().toString(),
          timestamp: rawTimestamp,
          emailAddress,
          orderId,
          availabilityDate: rawAvailabilityDate,
          reason,
          requestedBy,
          messengerName,
          amountToPay,
          province,
          comment,
          sheetRow: idx + 2,

          // Legacy fields compatibility for existing views
          mensajero: messengerName,
          monto: amountToPay,
          detalle: reason || comment || 'Disponibilidad',
          fecha: rawAvailabilityDate,
          orden: orderId,
          rawMonto: amountToPay,
          rawFecha: rawAvailabilityDate
        };
      }).filter((d: any) => d !== null);

      // Filter by Date Range against "Fecha de la disponibilidad"
      const startDateStr = formData.fechaInicio;
      const endDateStr = formData.fechaFin;

      const filteredDisps = allDisps.filter((item: any) => {
        const itemDateStr = item.availabilityDate || item.fecha;
        if (!itemDateStr) return false;
        const normalized = normalizeDateStr(itemDateStr);
        if (!normalized) return false;
        return normalized >= startDateStr && normalized <= endDateStr;
      });

      addLog('success', `Filtrando por rango de fechas de Disponibilidad: [${startDateStr}] - [${endDateStr}]`);
      addLog('info', `Disponibilidades en el rango seleccionado: ${filteredDisps.length} (de un total de ${allDisps.length} en la hoja)`);

      // Run validations
      addLog('info', 'Paso 2: Iniciando análisis de consistencia de los datos...');
      const incidencesList: any[] = [];

      filteredDisps.forEach((d: any) => {
        // Validate date
        if (isCellEmpty(d.rawFecha)) {
          incidencesList.push({
            type: 'data_error',
            severity: 'critica',
            ruleCode: 'DISP-002',
            detail: `[Fila: ${d.sheetRow}] Falta "Fecha de la disponibilidad" en el registro.`,
            id: d.orden || `Fila-${d.sheetRow}`,
            record: d
          });
        } else if (!normalizeDateStr(d.fecha)) {
          incidencesList.push({
            type: 'data_error',
            severity: 'critica',
            ruleCode: 'DISP-002',
            detail: `[Fila: ${d.sheetRow}] La fecha "${d.rawFecha}" tiene un formato inválido.`,
            id: d.orden || `Fila-${d.sheetRow}`,
            record: d
          });
        }

        // Validate amount
        if (isCellEmpty(d.rawMonto) || d.monto <= 0) {
          incidencesList.push({
            type: 'data_error',
            severity: 'critica',
            ruleCode: 'DISP-003',
            detail: `[Fila: ${d.sheetRow}] El monto de disponibilidad ($${d.monto}) es inválido o está en blanco.`,
            id: d.orden || `Fila-${d.sheetRow}`,
            record: d
          });
        }

        // Validate messenger name exists in database (EXACT matching with trim) (RN-012, RN-014)
        if (isCellEmpty(d.mensajero)) {
          incidencesList.push({
            type: 'data_error',
            severity: 'critica',
            ruleCode: 'RN-014',
            detail: `[Fila: ${d.sheetRow}] El campo "Mensajero" está vacío en el registro.`,
            id: d.orden || `Fila-${d.sheetRow}`,
            record: d
          });
        } else {
          const targetNameClean = d.mensajero.trim();
          const exists = databaseMessengers.some(
            m => m.nombre && m.nombre.trim() === targetNameClean
          );

          if (!exists) {
            addLog('warn', `Incidencia detectada (RN-012 - CRÍTICA) en Fila ${d.sheetRow}: El mensajero "${d.mensajero}" no coincide exactamente en el sistema.`);
            incidencesList.push({
              type: 'driver_not_found',
              severity: 'critica',
              ruleCode: 'RN-012',
              detail: `[Fila: ${d.sheetRow}] El mensajero "${d.mensajero}" no coincide exactamente con ningún registro de la base de datos (colección messengers).`,
              id: d.orden || `Fila-${d.sheetRow}`,
              record: d
            });
          }
        }
      });

      if (incidencesList.length === 0) {
        addLog('success', '¡Verificación exitosa sin discrepancias! Todos los mensajeros existen en el sistema.');
      } else {
        addLog('error', `Verificación finalizada con ${incidencesList.length} incidencias registradas.`);
      }

      setResult({
        disponibilidades: filteredDisps,
        incidences: incidencesList
      });

      // Write audit log & save to history
      try {
        const activeAreaObj = areas.find(a => a.id === selectedAreaId);
        const activeAreaName = activeAreaObj ? activeAreaObj.nombre : 'Habana';
        
        // Save verification run in history
        const verificationRef = await addDoc(collection(db, 'disponibilidad_verification_history'), {
          area: activeAreaName,
          areaId: selectedAreaId,
          fecha: new Date().toISOString(),
          usuario: auth.currentUser?.email || 'raul@mandao.app',
          rangoInicio: formData.fechaInicio,
          rangoFin: formData.fechaFin,
          totalLeidos: filteredDisps.length,
          totalIncidencias: incidencesList.length,
          tipo: 'verificacion',
          status: incidencesList.length === 0 ? 'correcta' : 'con_incidencias'
        });

        // Save in Availability_Verifications (new collection)
        const verificationId = verificationRef.id;
        await setDoc(doc(db, 'Availability_Verifications', verificationId), {
          verificationId,
          area: activeAreaName,
          startDate: parseDateString(formData.fechaInicio) || new Date(),
          endDate: parseDateString(formData.fechaFin) || new Date(),
          verificationDate: serverTimestamp(),
          userId: auth.currentUser?.email || 'raul@mandao.app',
          status: incidencesList.length === 0 ? 'correcta' : 'con_incidencias',
          totalRecords: filteredDisps.length,
          totalIncidents: incidencesList.length
        });

        // Save each incident in Availability_Incidents (new collection)
        for (const inc of incidencesList) {
          const incidentId = Math.random().toString().replace('0.', 'INC-');
          await addDoc(collection(db, 'Availability_Incidents'), {
            incidentId,
            verificationId,
            rowNumber: inc.record?.sheetRow || 0,
            messengerName: inc.record?.mensajero || '',
            availabilityDate: inc.record?.fecha ? (parseDateString(inc.record.fecha) || serverTimestamp()) : serverTimestamp(),
            severity: 'critica',
            ruleCode: inc.ruleCode || 'RN-012',
            description: inc.detail
          });
        }

        logAuditEvent('Verificacion', 'Proceso de Verificación de Disponibilidad Ejecutado', {
          areaId: selectedAreaId,
          areaName: activeAreaName,
          rangoFechas: `${formData.fechaInicio} - ${formData.fechaFin}`,
          resultado: incidencesList.length === 0 ? 'Correcta' : 'Con Incidencias',
          totalIncidencias: incidencesList.length,
          totalDisponibilidades: filteredDisps.length
        });
      } catch (logErr) {
        console.error("Failed to write audit log or verification history:", logErr);
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
    if (!result) return;
    setImporting(true);
    
    try {
      addLog('info', 'Paso 1: Verificando duplicados de importación a nivel de Área y rango de fechas (RN-013)...');
      
      const activeAreaObj = areas.find(a => a.id === selectedAreaId);
      const activeAreaName = activeAreaObj ? activeAreaObj.nombre : 'Habana';

      // Query legacy verification history for import duplication
      const qImportsLegacy = query(
        collection(db, 'disponibilidad_verification_history'),
        where('areaId', '==', selectedAreaId),
        where('tipo', '==', 'importacion')
      );
      const importsLegacySnap = await getDocs(qImportsLegacy);

      // Query new Availability_Imports collection for import duplication
      const qImportsNew = query(
        collection(db, 'Availability_Imports'),
        where('area', '==', activeAreaName)
      );
      const importsNewSnap = await getDocs(qImportsNew);

      const isDuplicate = importsLegacySnap.docs.some(docSnap => {
        const data = docSnap.data();
        return data.rangoInicio === formData.fechaInicio && data.rangoFin === formData.fechaFin;
      }) || importsNewSnap.docs.some(docSnap => {
        const data = docSnap.data();
        const start = data.startDate?.toDate ? data.startDate.toDate().toISOString().split('T')[0] : (data.startDate || '');
        const end = data.endDate?.toDate ? data.endDate.toDate().toISOString().split('T')[0] : (data.endDate || '');
        return start === formData.fechaInicio && end === formData.fechaFin;
      });

      if (isDuplicate) {
        addLog('error', `RN-013: Ya existe una importación registrada para el área "${activeAreaName}" en el rango de fechas ${formData.fechaInicio} a ${formData.fechaFin}.`);
        showToast('error', 'Error RN-013: Importación duplicada detectada para este rango de fechas y área.');
        alert(`Error RN-013: Ya existe una importación registrada para el área "${activeAreaName}" en el rango de fechas de ${formData.fechaInicio} a ${formData.fechaFin}.`);
        setImporting(false);
        return;
      }

      const importId = Math.random().toString().replace('0.', 'IMP-');
      const promises: Promise<any>[] = [];

      result.disponibilidades.forEach((d: any) => {
        const docPayload = {
          // New specified fields for Availabilities
          availabilityId: d.orderId || Math.random().toString().replace('0.', 'AV-'),
          timestamp: d.timestamp ? (parseDateString(d.timestamp) || serverTimestamp()) : serverTimestamp(),
          emailAddress: d.emailAddress || '',
          orderId: d.orderId || '',
          availabilityDate: d.availabilityDate ? (parseDateString(d.availabilityDate) || serverTimestamp()) : serverTimestamp(),
          reason: d.reason || '',
          requestedBy: d.requestedBy || '',
          messengerName: d.messengerName || '',
          amountToPay: d.amountToPay || 0,
          province: d.province || '',
          comment: d.comment || '',
          area: activeAreaName,
          importId: importId,

          // Legacy fields compatibility for existing views
          mensajero: d.messengerName || '',
          monto: d.amountToPay || 0,
          detalle: d.reason || d.comment || 'Disponibilidad',
          fecha: normalizeDateStr(d.availabilityDate) || d.availabilityDate || '',
          orden: d.orderId || '',
          areaId: selectedAreaId,
          importedAt: new Date().toISOString(),
          importedBy: auth.currentUser?.email || 'raul@mandao.app',
          status: 'no_conciliado'
        };
        
        promises.push(addDoc(collection(db, 'dispatcher_disponibilidades'), docPayload));
        promises.push(addDoc(collection(db, 'Availabilities'), docPayload));
      });

      addLog('info', `Subiendo ${result.disponibilidades.length} registros a las colecciones de Firestore...`);
      await Promise.all(promises);
      addLog('success', `¡Importación completada con éxito! ${result.disponibilidades.length} registros insertados.`);

      // Store in Availability_Imports (new collection)
      await setDoc(doc(db, 'Availability_Imports', importId), {
        importId,
        area: activeAreaName,
        startDate: parseDateString(formData.fechaInicio) || new Date(),
        endDate: parseDateString(formData.fechaFin) || new Date(),
        importedBy: auth.currentUser?.email || 'raul@mandao.app',
        importDate: serverTimestamp(),
        recordsImported: result.disponibilidades.length
      });

      // Legacy history record
      await addDoc(collection(db, 'disponibilidad_verification_history'), {
        area: activeAreaName,
        areaId: selectedAreaId,
        fecha: new Date().toISOString(),
        usuario: auth.currentUser?.email || 'raul@mandao.app',
        rangoInicio: formData.fechaInicio,
        rangoFin: formData.fechaFin,
        totalImportado: result.disponibilidades.length,
        tipo: 'importacion',
        status: 'correcta'
      });

      // Write Audit log
      logAuditEvent('Verificacion', 'Importación de Disponibilidades Realizada', {
        areaId: selectedAreaId,
        areaName: activeAreaName,
        rangoFechas: `${formData.fechaInicio} - ${formData.fechaFin}`,
        nuevosRegistros: result.disponibilidades.length,
        usuario: auth.currentUser?.email || 'raul@mandao.app'
      });

      showToast('success', `¡Sincronización completada! ${result.disponibilidades.length} disponibilidades importadas.`);
      setResult(null); // Clear active result to block re-importing immediately

    } catch (e: any) {
      addLog('error', `Error durante la importación: ${e.message}`);
      alert("Error al importar registros: " + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handleSendEmail = async () => {
    if (!result) return;
    const activeToken = googleToken;
    if (!activeToken) {
      alert("Debes estar conectado a Google API para poder enviar correos de notificación.");
      return;
    }
    if (!notifyEmails.trim()) {
      alert("Por favor, configura al menos una dirección de correo para notificar.");
      return;
    }

    try {
      setIsSendingEmail(true);

      const incidenciasHtml = result.incidences.length > 0
        ? result.incidences.map((inc) => `
          <tr style="border-bottom: 1px solid #fee2e2;">
            <td style="padding: 10px; font-weight: bold; color: #b91c1c; font-family: monospace;">${inc.id || 'N/A'}</td>
            <td style="padding: 10px; color: #374151;">${inc.detail}</td>
          </tr>
        `).join('')
        : '';

      const centroDisplay = areas.find(a => a.id === selectedAreaId)?.nombre || 'Habana';
      const rangeDisplay = `${formData.fechaInicio} a ${formData.fechaFin}`;
      const userDisplay = auth.currentUser?.email || 'raul@mandao.app';
      const timestampDisplay = new Date().toLocaleString();

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
          <div style="text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
            <span style="background-color: #fffbeb; color: #171717; font-size: 11px; font-weight: bold; padding: 4px 10px; border-radius: 100px; text-transform: uppercase; border: 1px solid #fde047;">Ecosistema Mandao</span>
            <h2 style="color: #0f172a; font-weight: 800; margin-top: 10px; margin-bottom: 4px; font-size: 20px;">Reporte de Verificación de Disponibilidad</h2>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Sincronización automatizada de Pagos Extras</p>
          </div>
          
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #f1f5f9;">
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Área / Dispatcher:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${centroDisplay}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Rango de Fechas:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${rangeDisplay}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Procesado por:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${userDisplay}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;"><strong>Fecha de Procesamiento:</strong></td>
                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 600;">${timestampDisplay}</td>
              </tr>
            </table>
          </div>

          <div style="margin-bottom: 24px;">
            <div style="display: table; width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 8px 0;">
              <div style="display: table-cell; text-align: center; background-color: #f0fdf4; padding: 12px; border-radius: 8px; border: 1px solid #bbf7d0;">
                <div style="font-size: 9px; color: #166534; font-weight: 800; text-transform: uppercase;">Disponibilidades</div>
                <div style="font-size: 24px; color: #166534; font-weight: 800; margin-top: 4px;">${result.disponibilidades.length}</div>
              </div>
              <div style="display: table-cell; text-align: center; background-color: ${result.incidences.length > 0 ? '#fef2f2' : '#f0fdf4'}; padding: 12px; border-radius: 8px; border: 1px solid ${result.incidences.length > 0 ? '#fca5a5' : '#bbf7d0'};">
                <div style="font-size: 9px; color: ${result.incidences.length > 0 ? '#991b1b' : '#166534'}; font-weight: 800; text-transform: uppercase;">Incidencias</div>
                <div style="font-size: 24px; color: ${result.incidences.length > 0 ? '#991b1b' : '#166534'}; font-weight: 800; margin-top: 4px;">${result.incidences.length}</div>
              </div>
            </div>
          </div>

          ${result.incidences.length > 0 ? `
            <div style="border-top: 1px solid #f1f5f9; padding-top: 20px;">
              <h4 style="margin: 0 0 12px 0; color: #991b1b; font-size: 13px; font-weight: 700;">Detalles de Discrepancias Detectadas</h4>
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #fef2f2; border-bottom: 1px solid #fee2e2;">
                    <th style="padding: 12px; color: #991b1b; font-weight: 700;">Fila / Orden</th>
                    <th style="padding: 12px; color: #991b1b; font-weight: 700;">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  ${incidenciasHtml}
                </tbody>
              </table>
            </div>
          ` : `
            <div style="text-align: center; padding: 24px; background-color: #ecfdf5; border-radius: 8px; border: 1px solid #a7f3d0; color: #065f46;">
              <h3 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700;">✓ Validación Correcta</h3>
              <p style="font-size: 13px; margin: 0; color: #047857;">Todos los mensajeros coinciden perfectamente con el catálogo del sistema.</p>
            </div>
          `}
          
          <div style="text-align: center; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 11px; color: #94a3b8;">
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

      const subjectText = `[Mandao] Reporte de Disponibilidad - ${centroDisplay} (${result.incidences.length} Incidencias)`;
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
          throw new Error(`Gmail API error para ${email}: ${sendRes.statusText}`);
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
    addLog('info', 'Iniciando generación de PDF con jsPDF...');
    try {
      import('jspdf').then(async (jsPDFModule) => {
        const { jsPDF } = jsPDFModule;
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(15, 118, 110);
        doc.text('Mandao - Verificación de Disponibilidad', 14, 20);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const areaName = areas.find(a => a.id === selectedAreaId)?.nombre || 'Habana';
        doc.text(`Dispatcher / Área: ${areaName}`, 14, 26);
        doc.text(`Rango de Fechas: ${formData.fechaInicio} a ${formData.fechaFin}`, 14, 31);
        doc.text(`Usuario: ${auth.currentUser?.email || 'sin-autenticar@mandao.app'}`, 14, 36);
        doc.text(`Fecha ejecución: ${new Date().toLocaleString()}`, 14, 41);

        doc.setFontSize(11);
        doc.setFont('Helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text('Resumen de Registros', 14, 51);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`- Disponibilidades procesadas: ${result.disponibilidades.length}`, 14, 57);
        doc.text(`- Incidencias encontradas: ${result.incidences.length}`, 14, 62);

        if (result.incidences.length > 0) {
          doc.setFont('Helvetica', 'bold');
          doc.text('Detalle de Incidencias Detectadas:', 14, 72);

          const tableHeaders = [['Fila / Orden', 'Gravedad', 'Detalle de Inconsistencia']];
          const tableRows = result.incidences.map(inc => [
            inc.id || 'N/A',
            inc.severity === 'critica' ? 'Crítica' : 'Advertencia',
            inc.detail
          ]);

          autoTable(doc, {
            startY: 75,
            head: tableHeaders,
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [185, 28, 28] },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
              0: { cellWidth: 30, fontStyle: 'bold' },
              1: { cellWidth: 30 },
              2: { cellWidth: 'auto' }
            }
          });
        } else {
          doc.setFont('Helvetica', 'bold');
          doc.setTextColor(21, 128, 61);
          doc.text('✓ VALIDACIÓN PERFECTA: Todos los mensajeros están autorizados.', 14, 72);
        }

        doc.save(`reporte-verificacion-disponibilidad-${formData.fechaInicio}.pdf`);
        addLog('success', 'Reporte PDF exportado con éxito.');
      }).catch(err => {
        console.error('jsPDF loading error:', err);
        addLog('error', `Error al inicializar jsPDF: ${err.message}`);
      });
    } catch (err: any) {
      addLog('error', `Error al generar PDF: ${err.message}`);
    }
  };

  // Computation of filtered and paginated incidences
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
    
    return true;
  });

  const totalPages = Math.ceil(filteredIncidences.length / itemsPerPage);
  const paginatedIncidences = filteredIncidences.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalCriticalIncidences = (result?.incidences || []).filter(inc => inc.severity === 'critica').length;
  const canImport = result && result.disponibilidades.length > 0 && totalCriticalIncidences === 0;

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={cn(
              "p-4 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 pointer-events-auto transition-all animate-bounce",
              t.type === 'success' ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
            )}
          >
            {t.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-red-600" />}
            {t.message}
          </div>
        ))}
      </div>

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--color-brand-subtle)] rounded-xl border border-[var(--color-brand-active-border)] shadow-sm">
             <ShieldCheck className="w-6 h-6 text-[var(--color-brand-ink)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[var(--color-primary)] bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-100 uppercase tracking-widest">General</span>
              <span className="text-xs text-[var(--color-text-faint)]">•</span>
              <span className="text-xs font-semibold text-[var(--color-text-muted)]">Módulo Disponibilidad</span>
            </div>
            <h1 className="text-xl font-black text-[var(--color-text)] tracking-tight mt-1">
              Verificación de Disponibilidad
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Valida que los mensajeros con pagos de disponibilidad estén registrados en el sistema.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center">
          <button 
            onClick={() => setShowHelp(prev => !prev)}
            className="p-2 text-[var(--color-text-faint)] hover:text-[var(--color-text)] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
            title="Ayuda / Explicación del Proceso"
          >
            <HelpCircle size={18} />
          </button>
          
          <button 
            onClick={() => setShowHistory(prev => !prev)}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 text-xs font-bold border rounded-lg transition-all shadow-sm",
              showHistory 
                ? "bg-[var(--color-primary)] text-white border-transparent" 
                : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50"
            )}
          >
            <History size={14} />
            {showHistory ? "OCULTAR HISTORIAL" : "HISTORIAL"}
          </button>
        </div>
      </div>

      {/* Help block (Collapse) */}
      <AnimatePresence>
        {showHelp && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-emerald-900 space-y-3 shadow-inner">
               <div className="flex items-center gap-2 font-bold text-emerald-800">
                  <Info size={18} />
                  <span>¿Qué valida la Verificación de Disponibilidad?</span>
               </div>
               <p className="text-sm leading-relaxed">
                  Este módulo audita de forma proactiva la pestaña de <strong>"Disponibilidad"</strong> en las hojas de Google Sheets del Dispatcher. En particular, comprueba que:
               </p>
               <ul className="list-disc list-inside text-sm space-y-1 pl-2 font-medium">
                 <li><strong>Existencia del Mensajero (DISP-001)</strong>: Compara fuzzy-matching el nombre del mensajero con la lista oficial cargada en el sistema (colección messengers). Cualquier mensajero no registrado genera una incidencia que restringe la importación.</li>
                 <li><strong>Estructura de Fechas (DISP-002)</strong>: Valida que la fecha indicada en la fila tenga un formato DD/MM/YYYY o YYYY-MM-DD correcto.</li>
                 <li><strong>Monto Válido (DISP-003)</strong>: Valida que el monto asignado como disponibilidad sea mayor que cero y no esté vacío.</li>
               </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Configuration drawer / form card */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Params panel */}
        <div className="xl:col-span-1 flex flex-col gap-6">
          <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-[0.15em] text-[var(--color-text-faint)] mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Settings size={14} />
              Configurar Consulta
            </h3>
            
            <div className="space-y-4">
              {/* Area picker */}
              <div className="grid gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-muted)] flex items-center justify-between">
                  <span>Dispatcher (Área)</span>
                  {selectedAreaId && (
                    <span className="text-[10px] text-[var(--color-primary)] bg-teal-50 px-1.5 py-0.2 rounded font-mono font-bold">
                      {spreadsheetId ? "SHEET ENLAZADO" : "SIN HOJA"}
                    </span>
                  )}
                </label>
                <select 
                  className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] transition-all font-medium"
                  value={selectedAreaId}
                  onChange={(e) => handleAreaChange(e.target.value)}
                  disabled={loading}
                >
                  <option value="">-- Seleccionar Área --</option>
                  {areas.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre} ({a.provincia || 'Provincia'})</option>
                  ))}
                </select>
              </div>

              {/* Rango Fechas */}
              <div className="grid gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">Desde (Fecha Disponibilidad)</label>
                <input 
                  type="date" 
                  className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] transition-all font-mono font-medium"
                  value={formData.fechaInicio}
                  onChange={(e) => setFormData(p => ({ ...p, fechaInicio: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <div className="grid gap-1.5">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">Hasta</label>
                <input 
                  type="date" 
                  className="h-10 w-full px-3 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] transition-all font-mono font-medium"
                  value={formData.fechaFin}
                  onChange={(e) => setFormData(p => ({ ...p, fechaFin: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <div className="pt-2">
                <Button 
                  variant="primary" 
                  className="w-full h-11 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2"
                  onClick={handleVerify}
                  disabled={loading || !selectedAreaId}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      PROCESANDO...
                    </>
                  ) : (
                    <>
                      <FileSearch size={16} />
                      EJECUTAR VERIFICACIÓN
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Email notifications settings */}
          <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-[0.15em] text-[var(--color-text-faint)] mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Mail size={14} />
              Lista de Notificación
            </h3>
            
            <div className="space-y-4">
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-medium">
                Especifica los correos que recibirán reportes de discrepancias detectadas (separados por coma).
              </p>
              
              <div className="grid gap-1.5">
                <textarea 
                  className="w-full h-20 p-3 text-xs bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] transition-all resize-none font-mono"
                  placeholder="ejemplo1@mandao.app, ejemplo2@mandao.app"
                  value={notifyEmails}
                  onChange={(e) => setNotifyEmails(e.target.value)}
                  disabled={isSavingConfig}
                />
              </div>

              <Button 
                variant="ghost" 
                className="w-full h-8 text-[10px] font-black uppercase tracking-wider border border-slate-200"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
              >
                {isSavingConfig ? "GUARDANDO..." : "GUARDAR DESTINATARIOS"}
              </Button>
            </div>
          </div>
        </div>

        {/* Dynamic results area */}
        <div className="xl:col-span-3 flex flex-col gap-6">
          <AnimatePresence mode="wait">
            {showHistory ? (
              <motion.div 
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-[var(--color-surface)] p-6 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm flex flex-col h-full min-h-[400px]"
              >
                <h3 className="text-xs font-black uppercase tracking-[0.15em] text-[var(--color-text-faint)] mb-4 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <History size={14} />
                  Historial de Sincronizaciones de Disponibilidad
                </h3>

                <div className="flex-1 overflow-y-auto max-h-[450px] space-y-3 custom-scrollbar">
                  {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center opacity-40">
                      <History size={48} className="text-slate-400 mb-3" />
                      <p className="text-sm font-bold">Sin registros de historial</p>
                      <p className="text-xs mt-1">Las importaciones exitosas se listarán aquí.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {history.map((h, i) => {
                        const isVerif = h.tipo === 'verificacion';
                        const hasIncidences = h.totalIncidencias > 0;
                        
                        return (
                          <div key={h.id || i} className="py-4 flex items-center justify-between gap-4">
                            <div className="flex items-start gap-3">
                              {isVerif ? (
                                <div className={cn(
                                  "p-2 rounded-lg mt-0.5 border",
                                  hasIncidences 
                                    ? "bg-amber-50 text-amber-600 border-amber-100" 
                                    : "bg-blue-50 text-blue-600 border-blue-100"
                                )}>
                                  <FileSearch size={16} />
                                </div>
                              ) : (
                                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100 mt-0.5">
                                  <UserCheck size={16} />
                                </div>
                              )}
                              
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-[var(--color-text)]">{h.area}</span>
                                  <span className={cn(
                                    "text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded tracking-wide border",
                                    isVerif 
                                      ? "bg-blue-50/60 text-blue-700 border-blue-200" 
                                      : "bg-emerald-50/60 text-emerald-700 border-emerald-200"
                                  )}>
                                    {isVerif ? 'Verificación' : 'Sincronización'}
                                  </span>
                                </div>
                                <p className="text-xs text-[var(--color-text-faint)] font-mono mt-0.5">Rango: {h.rangoInicio} a {h.rangoFin}</p>
                                <p className="text-[10px] text-[var(--color-text-muted)] mt-1 flex items-center gap-1.5">
                                  <span className="font-semibold">{h.usuario}</span>
                                  <span>•</span>
                                  <span className="font-mono">{new Date(h.fecha).toLocaleString('es-VE')}</span>
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              {isVerif ? (
                                <span className={cn(
                                  "text-xs font-bold px-3 py-1 rounded-full font-mono border block sm:inline-block",
                                  hasIncidences 
                                    ? "text-amber-700 bg-amber-50 border-amber-250" 
                                    : "text-blue-700 bg-blue-50 border-blue-250"
                                )}>
                                  {h.totalLeidos || 0} Leídos • {h.totalIncidencias || 0} Incid.
                                </span>
                              ) : (
                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 px-3 py-1 rounded-full font-mono block sm:inline-block">
                                  +{h.totalImportado || 0} Importados
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : result ? (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Stats cards summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Total Disponibilidades</p>
                      <p className="text-2xl font-black mt-1 text-slate-800 font-mono">{result.disponibilidades.length}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 text-slate-500 border border-slate-100">
                      <Database size={20} />
                    </div>
                  </div>

                  <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Sin Incidencias</p>
                      <p className="text-2xl font-black mt-1 text-emerald-700 font-mono">
                        {result.disponibilidades.length - result.incidences.length}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <CheckCircle2 size={20} />
                    </div>
                  </div>

                  <div className={cn(
                    "p-5 rounded-[var(--radius-md)] border shadow-sm flex items-center justify-between transition-all",
                    result.incidences.length > 0 
                      ? "bg-red-50/50 border-red-200 text-red-900" 
                      : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
                  )}>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-text-faint)]">Incidencias Críticas</p>
                      <p className={cn(
                        "text-2xl font-black mt-1 font-mono",
                        result.incidences.length > 0 ? "text-red-700" : "text-slate-700"
                      )}>
                        {result.incidences.length}
                      </p>
                    </div>
                    <div className={cn(
                      "p-3 rounded-xl border",
                      result.incidences.length > 0 
                        ? "bg-red-100 text-red-700 border-red-200" 
                        : "bg-slate-50 text-slate-400 border-slate-100"
                    )}>
                      <AlertCircle size={20} />
                    </div>
                  </div>
                </div>

                {/* Import actions & trigger bar */}
                <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {canImport ? (
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shrink-0">
                        <CheckCircle2 size={20} />
                      </div>
                    ) : (
                      <div className="p-2 bg-rose-50 text-rose-600 rounded-full border border-rose-100 shrink-0">
                        <AlertCircle size={20} />
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-bold text-[var(--color-text)]">
                        {canImport 
                          ? "✓ Información Lista para Importar" 
                          : "⚠ Acción Requerida: Corregir Errores"
                        }
                      </h4>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {canImport 
                          ? "Todos los mensajeros concilian. Puedes guardar estos registros extras en la base de datos."
                          : "Existen incidencias críticas de mensajeros no válidos. Corrige el Google Sheet y re-verifica."
                        }
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                    {result.incidences.length > 0 && (
                      <>
                        <Button 
                          variant="ghost" 
                          className="flex-1 sm:flex-none h-10 px-4 text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700"
                          onClick={exportToPDF}
                        >
                          <Download size={14} className="mr-2" />
                          EXPORTAR PDF
                        </Button>

                        <Button 
                          variant="ghost" 
                          className="flex-1 sm:flex-none h-10 px-4 text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700"
                          onClick={handleSendEmail}
                          disabled={isSendingEmail}
                        >
                          {isSendingEmail ? (
                            <Loader2 size={14} className="animate-spin mr-2" />
                          ) : (
                            <Mail size={14} className="mr-2" />
                          )}
                          ENVIAR ALERTA
                        </Button>
                      </>
                    )}

                    <Button 
                      variant="primary" 
                      className="flex-1 sm:flex-none h-10 px-6 text-xs font-black uppercase tracking-wider bg-[var(--color-brand)] text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-dark)] border-transparent shadow-sm"
                      onClick={handleImport}
                      disabled={importing || !canImport}
                    >
                      {importing ? (
                        <>
                          <Loader2 size={14} className="animate-spin mr-2" />
                          IMPORTANDO...
                        </>
                      ) : (
                        <>
                          <Database size={14} className="mr-2" />
                          IMPORTAR A LA BD
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Incidences Table / clean state visualizer */}
                {result.incidences.length > 0 ? (
                  <div className="bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)] shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-[var(--color-text)]">
                          Tabla de Incidencias Detectadas ({filteredIncidences.length})
                        </h3>
                        <p className="text-[10px] text-[var(--color-text-faint)] mt-1">Sincronización de Disponibilidades fallida</p>
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-faint)]" />
                        <input 
                          type="text" 
                          placeholder="Buscar incidencia..."
                          className="w-full h-8 pl-9 pr-3 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] transition-all font-medium"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[var(--color-border)] bg-slate-50/70 text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider">
                            <th className="p-4 w-24">Fila/Orden</th>
                            <th className="p-4 w-32">Severidad</th>
                            <th className="p-4 w-32">Regla</th>
                            <th className="p-4">Descripción de la Incidencia</th>
                            <th className="p-4 w-20 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {paginatedIncidences.map((inc, i) => (
                            <tr key={inc.id + '-' + i} className="hover:bg-slate-50/50 group transition-colors">
                              <td className="p-4 font-mono text-xs font-bold text-[var(--color-text-muted)]">{inc.id || 'N/A'}</td>
                              <td className="p-4">
                                <span className={cn(
                                  "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border shrink-0",
                                  inc.severity === 'critica' 
                                    ? "bg-red-50 text-red-700 border-red-200" 
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                )}>
                                  {inc.severity || 'Crítica'}
                                </span>
                              </td>
                              <td className="p-4 font-mono text-xs text-[var(--color-text-muted)]">{inc.ruleCode || 'DISP-001'}</td>
                              <td className="p-4 font-medium text-[var(--color-text-muted)] text-xs leading-relaxed max-w-sm">
                                {inc.detail}
                              </td>
                              <td className="p-4 text-right">
                                <button 
                                  onClick={() => setShowIncidenceDetails(inc)}
                                  className="p-1.5 text-[var(--color-text-faint)] hover:text-[var(--color-primary)] hover:bg-teal-50 border border-transparent hover:border-teal-200 rounded transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Info size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between text-xs text-[var(--color-text-muted)] font-bold">
                        <span>Página {currentPage} de {totalPages}</span>
                        <div className="flex gap-2">
                          <button 
                            className="px-3 py-1.5 bg-white border border-[var(--color-border)] rounded hover:bg-slate-50 disabled:opacity-50"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            Anterior
                          </button>
                          <button 
                            className="px-3 py-1.5 bg-white border border-[var(--color-border)] rounded hover:bg-slate-50 disabled:opacity-50"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-[var(--radius-md)] p-8 flex flex-col items-center justify-center text-center shadow-inner">
                    <CheckCircle2 size={48} className="text-emerald-600 mb-3 animate-pulse" />
                    <h3 className="text-base font-black text-emerald-800">✓ Validación Impecable sin Advertencias</h3>
                    <p className="text-sm text-emerald-600 mt-2 max-w-md font-medium">
                      Todos los registros leídos del Google Sheet se corresponden con mensajeros válidos en la base de datos de Mandao. Puedes proceder con la importación segura.
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-border)] p-12 text-center flex flex-col items-center justify-center min-h-[350px] shadow-sm"
              >
                <div className="p-4 bg-[var(--color-surface-2)] rounded-full border border-[var(--color-border)] text-[var(--color-text-faint)] mb-4">
                  <Database size={32} className="animate-pulse text-slate-400" />
                </div>
                <h3 className="text-base font-black text-[var(--color-text)]">Ejecuta la Verificación de Disponibilidad</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-sm leading-relaxed">
                  Selecciona el dispatcher y el rango de fechas operativa de delivery en el panel izquierdo para comenzar el análisis cruzado de datos.
                </p>
                
                <div className="mt-8 flex gap-3 max-w-md text-left bg-slate-50/80 border border-slate-200/50 p-4 rounded-xl text-[11px] text-slate-500 font-medium">
                   <Clock size={16} className="text-slate-400 shrink-0 mt-0.5" />
                   <div>
                     <span className="font-bold text-slate-700">Nota técnica:</span> El verificador leerá en tiempo real la hoja "Disponibilidad" del Google Sheet conectado al Dispatcher y la comparará contra el catálogo de mensajeros del sistema.
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Incidence detail modal (Collapse or Slideover) */}
      <AnimatePresence>
        {showIncidenceDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl border border-[var(--color-border)] shadow-2xl max-w-lg w-full overflow-hidden"
            >
              <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-rose-800 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle size={16} />
                    Detalles de Incidencia Operativa
                  </h3>
                  <p className="text-[10px] text-[var(--color-text-faint)] mt-1">Sincronizador de Disponibilidades Mandao</p>
                </div>
                <button 
                  onClick={() => setShowIncidenceDetails(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-4 text-sm text-[var(--color-text-muted)]">
                 <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-rose-950 font-medium leading-relaxed">
                   {showIncidenceDetails.detail}
                 </div>

                 <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-xs font-semibold">
                   <div>
                     <span className="text-[10px] text-[var(--color-text-faint)] uppercase block mb-1">Fila Google Sheet</span>
                     <span className="font-mono text-sm text-slate-800">Fila {showIncidenceDetails.record?.sheetRow}</span>
                   </div>
                   <div>
                     <span className="text-[10px] text-[var(--color-text-faint)] uppercase block mb-1">Monto Identificado</span>
                     <span className="font-mono text-sm text-slate-800">${showIncidenceDetails.record?.monto?.toFixed(2)}</span>
                   </div>
                   <div>
                     <span className="text-[10px] text-[var(--color-text-faint)] uppercase block mb-1">Nombre Bruto</span>
                     <span className="text-slate-800">{showIncidenceDetails.record?.mensajero || 'Sin asignar'}</span>
                   </div>
                   <div>
                     <span className="text-[10px] text-[var(--color-text-faint)] uppercase block mb-1">Fecha Bruta</span>
                     <span className="font-mono text-slate-800">{showIncidenceDetails.record?.rawFecha || 'Sin fecha'}</span>
                   </div>
                 </div>

                 <div className="text-xs text-slate-500 bg-slate-100/60 p-3.5 rounded-lg border border-slate-200/50 leading-relaxed">
                   <span className="font-bold text-slate-700 block mb-1">¿Cómo solucionar?</span>
                   Por favor, abre la hoja de cálculo del dispatcher vinculada en Google Sheets, ve a la pestaña de <strong>"Disponibilidad"</strong>, busca la <strong>Fila {showIncidenceDetails.record?.sheetRow}</strong> y corrige el nombre del mensajero para que coincida exactamente con los registrados en el menú "Gestión de Mensajeros".
                 </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-[var(--color-border)] flex justify-end">
                <Button 
                  variant="primary" 
                  className="h-9 px-5 text-xs font-bold"
                  onClick={() => setShowIncidenceDetails(null)}
                >
                  Entendido
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
