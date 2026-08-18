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
  ChevronRight
} from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { cn } from '../../lib/utils';
import { db, auth, logAuditEvent } from '../../lib/firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc, addDoc, orderBy, getDoc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

interface OrderRecord {
  id: string;
  deliveryDate: string;
  orderDate: string;
  driver: string;
  store: string;
  negocio?: string;
  orderId: string;
  productAmount: number;
  deliveryCharge: number;
  area: string;
  paymentType: string;
  customer: string;
  customerNumber: string;
  origen: string;
  monto: number;
  
  // Expandable columns
  storeOffer?: number;
  processingFee?: number;
  storeAdminCharge?: number;
  extraDeliveryCharge?: number;
  driverAdminCharge?: number;
  complementaryDelivery?: number;
  tax?: number;
  promocode?: string;
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

function stringsFuzzyEqual(s1: any, s2: any): boolean {
  return fuzzyNormalizedString(s1) === fuzzyNormalizedString(s2);
}

// Google Sheets Parsing helpers
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

function normalizeHeader(h: string): string {
  if (!h) return '';
  return h.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]/g, ''); 
}

function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    if (norm) {
      map[norm] = idx;
    }
  });
  return map;
}

function normalizeDateStr(ds: string): string | null {
  if (!ds) return null;
  const clean = String(ds).trim();
  // 1. If already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  
  // 2. If DD/MM/YYYY or MM/DD/YYYY
  const parts = clean.split(/[/\-. ]+/);
  if (parts.length === 3) {
    let p1 = parts[0];
    let p2 = parts[1];
    let p3 = parts[2];
    
    // Check if p3 looks like a 4-digit year
    if (p3.length === 4) {
      const val1 = parseInt(p1, 10);
      const val2 = parseInt(p2, 10);
      if (!isNaN(val1) && !isNaN(val2)) {
        if (val1 > 12) {
          // Definitely DD/MM/YYYY
          return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        } else if (val2 > 12) {
          // MM/DD/YYYY
          return `${p3}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
        } else {
          // Ambiguous - assume DD/MM/YYYY for Venezuela
          return `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
        }
      }
    }
    // Check if p1 looks like a 4-digit year
    if (p1.length === 4) {
      return `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
    }
  }
  return null;
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

function mapRowToRecord(row: any[], map: Record<string, number>) {
  const getVal = (keys: string[]) => {
    for (const key of keys) {
      const idx = map[key];
      if (idx !== undefined && idx < row.length) return row[idx];
    }
    return '';
  };

  const getNum = (keys: string[]) => {
    const val = getVal(keys);
    return parseCellNumber(val);
  };

  const orderId = getVal(['orderid', 'orden', 'id', 'noorden']);

  return {
    deliveryDate: getVal(['deliverydate', 'fechadeentrega', 'fechaentrega', 'fecha', 'date']) || '',
    orderDate: getVal(['orderdate', 'fechadeorden', 'fechaorden']) || '',
    driver: getVal(['driver', 'mensajero', 'repartidor', 'conductor']) || '',
    store: getVal(['store', 'negocio', 'establecimiento', 'restaurante', 'comercio']) || '',
    negocio: getVal(['store', 'negocio', 'establecimiento', 'restaurante', 'comercio']) || '',
    orderId: orderId,
    orden: orderId,
    id: orderId,
    productAmount: getNum(['productamount', 'montoproducto', 'montoarticulos', 'articulos']),
    deliveryCharge: getNum(['deliverycharge', 'cargodeentrega', 'costodeentrega', 'delivery']),
    area: getVal(['area', 'zona', 'centro', 'ciudad']) || '',
    paymentType: getVal(['paymenttype', 'tipodepago', 'metododepago', 'formadepago', 'viapago']) || '',
    customer: getVal(['customer', 'cliente', 'nombrecliente']) || '',
    customerNumber: getVal(['customernumber', 'telefonocliente', 'telefono', 'celular']) || '',
    
    storeOffer: getNum(['storeoffer', 'ofertadelestablecimiento']),
    processingFee: getNum(['processingfee', 'costodeprocesamiento', 'fee']),
    storeAdminCharge: getNum(['storeadmincharge', 'cargoadministrativoestablecimiento']),
    extraDeliveryCharge: getNum(['extradeliverycharge', 'cargoentregajornada']),
    driverAdminCharge: getNum(['driveradmincharge', 'cargorepartidorextra']),
    complementaryDelivery: getNum(['complementarydelivery', 'entregaayuda']),
    tax: getNum(['tax', 'impuesto', 'iva']),
    promocode: getVal(['promocode', 'codigopromocional', 'promo']) || ''
  };
}

const renderPageNumbers = (current: number, total: number, onChange: (p: number) => void) => {
  const pages: (number | string)[] = [];
  const maxVisible = 5;
  if (total <= maxVisible) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    pages.push(total);
  }

  return pages.map((pageNum, idx) => {
    if (typeof pageNum === 'string') {
      return <span key={`ellipse-${idx}`} className="px-1.5 text-slate-400 select-none">...</span>;
    }
    const isCurrent = pageNum === current;
    return (
      <button
        type="button"
        key={`page-${pageNum}`}
        onClick={() => onChange(pageNum)}
        className={cn(
          "h-10 w-10 text-xs font-bold rounded-[var(--radius-sm)] border transition flex items-center justify-center cursor-pointer",
          isCurrent 
            ? "bg-[var(--color-primary)] border-[var(--color-primary)] text-white font-black" 
            : "bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        )}
      >
        {pageNum}
      </button>
    );
  });
};

export function RevisionPage({ permissions = [] }: { permissions?: string[] }) {
  const [data, setData] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  
  // Dynamic Areas selection & Google Auth
  const [areas, setAreas] = useState<any[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [googleToken, setGoogleToken] = useState<string | null>(() => sessionStorage.getItem('google_access_token'));
  
  // Real-time audit logs for comparison
  const [comparisonLogs, setComparisonLogs] = useState<{ id: string; t: string; lvl: 'info' | 'success' | 'warn' | 'error'; msg: string }[]>([]);
  const [comparing, setComparing] = useState(false);
  
  // Comparison difference structure
  const [externalComparison, setExternalComparison] = useState<{
    discrepancies: Record<string, string[]>;
    deletedInSheets: Set<string>;
    newInSheets: any[];
    compared: boolean;
  } | null>(null);

  const [discrepanciesTable, setDiscrepanciesTable] = useState<any[]>([]);
  const [selectedDiscrepancyIds, setSelectedDiscrepancyIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'table' | 'differences'>('table');
  const [diffFilters, setDiffFilters] = useState({
    search: '',
    campo: 'Todos',
    tipo: 'Todos'
  });
  const [diffPage, setDiffPage] = useState(1);
  const diffItemsPerPage = 10;
  const [syncing, setSyncing] = useState(false);

  const [filters, setFilters] = useState({
    origen: 'Todos',
    deliveryDate: '',
    orderDate: '',
    paymentType: 'Todos',
    area: 'Todos',
    store: 'Todas',
    driver: 'Todos',
    fechaInicio: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // last 7 days
    fechaFin: new Date().toISOString().split('T')[0]
  });

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [registeredPaymentMethods, setRegisteredPaymentMethods] = useState<any[]>([]);

  // Sorting state for main Firestore table
  const [sortField, setSortField] = useState<keyof OrderRecord | 'store'>('deliveryDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Sorting state for discrepancies table
  const [diffSortField, setDiffSortField] = useState<string>('orderId');
  const [diffSortDirection, setDiffSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: keyof OrderRecord | 'store') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortIndicator = (field: keyof OrderRecord | 'store') => {
    if (sortField !== field) return ' ⇅';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const handleDiffSort = (field: string) => {
    if (diffSortField === field) {
      setDiffSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setDiffSortField(field);
      setDiffSortDirection('asc');
    }
  };

  const renderDiffSortIndicator = (field: string) => {
    if (diffSortField !== field) return ' ⇅';
    return diffSortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const [orphanedPage, setOrphanedPage] = useState(1);
  const orphanedItemsPerPage = 10;

  // Reset to first page when search, area, or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedAreaId, filters]);

  // Reset orphaned page as well
  useEffect(() => {
    setOrphanedPage(1);
  }, [externalComparison, selectedAreaId, filters]);

  const canWrite = permissions.includes('all') || 
                   permissions.includes('dispatcher:write') || 
                   permissions.includes('dispatcher-negocio:write') || 
                   permissions.includes('dispatcher-mensajero:write');

  // Load operating areas, payment methods, and order records
  useEffect(() => {
    // 1. Fetch active areas dynamically
    const qAreas = query(collection(db, 'Areas'));
    const unsubscribeAreas = onSnapshot(qAreas, (snapshot) => {
      const records = snapshot.docs.map(docSub => ({
        id: docSub.id,
        ...docSub.data()
      }));
      setAreas(records);
    });

    // 2. Load Firestore dispatcher_orders in real-time
    const q = query(collection(db, 'dispatcher_orders'), orderBy('deliveryDate', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as OrderRecord[];
      setData(records);
      setLoading(false);
    });

    // 3. Fetch active messenger payment methods in real-time
    const qMethods = query(collection(db, 'MetodosPago'));
    const unsubscribeMethods = onSnapshot(qMethods, (snapshot) => {
      const records = snapshot.docs
        .map(docSub => docSub.data() as any)
        .filter(m => m.aplicaMensajeros !== false && m.estado !== 'inactivo');
      setRegisteredPaymentMethods(records);
    });

    return () => {
      unsubscribe();
      unsubscribeAreas();
      unsubscribeMethods();
    };
  }, []);

  const addComparisonLog = (lvl: 'info' | 'success' | 'warn' | 'error', msg: string) => {
    const timestamp = new Date().toLocaleTimeString('es-VE', { hour12: false });
    setComparisonLogs(prev => [
      ...prev,
      { id: Math.random().toString(), t: timestamp, lvl, msg }
    ]);
  };

  const handleConnectGoogle = async (): Promise<string | null> => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
      const currentUserEmail = auth.currentUser?.email;
      if (currentUserEmail) {
        provider.setCustomParameters({ login_hint: currentUserEmail });
      }
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleToken(credential.accessToken);
        sessionStorage.setItem('google_access_token', credential.accessToken);
        return credential.accessToken;
      }
    } catch (error: any) {
      console.error(error);
      alert("Error de conexión Google: " + error.message);
    }
    return null;
  };

  // 2. Filter data considering range inputs and operational filters
  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Filter by range first
      const deliveryNorm = normalizeDateStr(item.deliveryDate);
      const inRange = (!filters.fechaInicio || (deliveryNorm && deliveryNorm >= filters.fechaInicio)) &&
                      (!filters.fechaFin || (deliveryNorm && deliveryNorm <= filters.fechaFin));
      
      if (!inRange) return false;

      // Filter by area selection or specific filters
      if (selectedAreaId) {
        const selectedAreaObj = areas.find(a => a.id === selectedAreaId);
        if (selectedAreaObj && item.area && item.area.toLowerCase() !== selectedAreaObj.nombre.toLowerCase()) {
          return false;
        }
      }

      const matchSearch = 
        !searchQuery ||
        item.orderId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.customerNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.driver?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.store?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchOrigen = filters.origen === 'Todos' || item.origen === filters.origen.toLowerCase();
      const matchDeliveryDate = !filters.deliveryDate || item.deliveryDate === filters.deliveryDate;
      const matchOrderDate = !filters.orderDate || item.orderDate === filters.orderDate;
      const matchPayment = filters.paymentType === 'Todos' || item.paymentType === filters.paymentType;
      const matchArea = filters.area === 'Todos' || item.area === filters.area;
      const matchStore = filters.store === 'Todas' || item.store === filters.store;
      const matchDriver = filters.driver === 'Todos' || item.driver === filters.driver;

      return matchSearch && matchOrigen && matchDeliveryDate && matchOrderDate && matchPayment && matchArea && matchStore && matchDriver;
    });
  }, [data, searchQuery, filters, selectedAreaId, areas]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'store') {
        valA = a.store || a.negocio || '';
        valB = b.store || b.negocio || '';
      }

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (typeof valA === 'number') {
        valA = valA || 0;
        valB = valB || 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortDirection]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage]);

  const filteredDiscrepancies = useMemo(() => {
    return discrepanciesTable.filter(item => {
      const matchSearch = !diffFilters.search || 
        String(item.orderId || '').toLowerCase().includes(diffFilters.search.toLowerCase()) ||
        String(item.campo || '').toLowerCase().includes(diffFilters.search.toLowerCase()) ||
        String(item.diferencia || '').toLowerCase().includes(diffFilters.search.toLowerCase());
        
      const matchCampo = diffFilters.campo === 'Todos' || item.campo === diffFilters.campo;
      
      let matchTipo = true;
      if (diffFilters.tipo !== 'Todos') {
        if (diffFilters.tipo === 'inexistente') {
          matchTipo = item.tipo === 'inexistente';
        } else if (diffFilters.tipo === 'solo_sheets') {
          matchTipo = item.tipo === 'solo_sheets';
        } else if (diffFilters.tipo === 'discrepancia_valor') {
          matchTipo = item.tipo === 'discrepancia_valor';
        }
      }
      
      return matchSearch && matchCampo && matchTipo;
    });
  }, [discrepanciesTable, diffFilters]);

  const sortedDiscrepancies = useMemo(() => {
    return [...filteredDiscrepancies].sort((a, b) => {
      let valA = a[diffSortField];
      let valB = b[diffSortField];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return diffSortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return diffSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredDiscrepancies, diffSortField, diffSortDirection]);

  const uniqueFieldsWithDiff = useMemo(() => {
    const fields = new Set<string>();
    discrepanciesTable.forEach(item => {
      if (item.campo) fields.add(item.campo);
    });
    return ['Todos', ...Array.from(fields)];
  }, [discrepanciesTable]);

  const uniqueTypesWithDiff = [
    { value: 'Todos', label: 'Tipo: Todos' },
    { value: 'discrepancia_valor', label: 'Tipo: Variaciones de valor' },
    { value: 'inexistente', label: 'Tipo: Eliminadas en Sheets' },
    { value: 'solo_sheets', label: 'Tipo: Nuevas en Sheets (Sin importar)' }
  ];

  const paginatedDiscrepancies = useMemo(() => {
    const startIndex = (diffPage - 1) * diffItemsPerPage;
    return sortedDiscrepancies.slice(startIndex, startIndex + diffItemsPerPage);
  }, [sortedDiscrepancies, diffPage]);

  const paginatedOrphanedOrders = useMemo(() => {
    if (!externalComparison) return [];
    const startIndex = (orphanedPage - 1) * orphanedItemsPerPage;
    return externalComparison.newInSheets.slice(startIndex, startIndex + orphanedItemsPerPage);
  }, [externalComparison, orphanedPage]);

  const handleAreaChange = (areaId: string) => {
    setSelectedAreaId(areaId);
    const selectedArea = areas.find(a => a.id === areaId);
    if (selectedArea) {
      setSpreadsheetId(selectedArea.spreadsheetId || '');
      // Align filters.origen according to area prefix / tags if needed
      setFilters(prev => ({
        ...prev,
        origen: selectedArea.nombre.toLowerCase().includes('holguin') ? 'Holguin' : 
                selectedArea.nombre.toLowerCase().includes('provincia') ? 'Provincia' : 'Habana'
      }));
    } else {
      setSpreadsheetId('');
    }
    // Clear previous comparison elements since area has shifted
    setExternalComparison(null);
    setDiscrepanciesTable([]);
    setSelectedDiscrepancyIds([]);
    setComparisonLogs([]);
  };

  const handleDetectExternalChanges = async () => {
    if (!spreadsheetId.trim()) {
      alert("Por favor, selecciona un Dispatcher/Área que cuente con un Spreadsheet ID configurado para comparar.");
      return;
    }

    setComparisonLogs([]);
    setComparing(true);
    addComparisonLog('info', `Iniciando proceso de Revisión Externa contra Documento Dispatcher...`);

    let activeToken = googleToken;
    if (!activeToken) {
      addComparisonLog('info', 'Token de Google no disponible. Abriendo ventana de autorización...');
      activeToken = await handleConnectGoogle();
      if (!activeToken) {
        addComparisonLog('error', 'Autorización revocada o cancelada. Imposible cargar cambios externos.');
        setComparing(false);
        return;
      }
      addComparisonLog('success', 'Sesión autorizada de Google restaurada con éxito.');
    }

    try {
      addComparisonLog('info', `Paso 1: Consultando Spreadsheet ID: ...${spreadsheetId.slice(-8)}`);
      let metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });

      if (!metaRes.ok) {
        if (metaRes.status === 401) {
          addComparisonLog('warn', 'Sesión de Google expirada (401). Intentando renovación de token automática...');
          setGoogleToken(null);
          sessionStorage.removeItem('google_access_token');
          
          const renewedToken = await handleConnectGoogle();
          if (!renewedToken) {
            throw new Error("No se pudo renovar la sesión de Google automáticamente. Haz clic en Detectar Cambios para intentar de nuevo.");
          }
          
          addComparisonLog('success', 'Sesión de Google renovada correctamente. Reintentando consulta de metadatos...');
          activeToken = renewedToken;
          
          metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
            headers: { Authorization: `Bearer ${activeToken}` }
          });
          
          if (!metaRes.ok) {
            throw new Error(`Fallo tras renovación de token de Google (Código: ${metaRes.status}).`);
          }
        } else {
          throw new Error(`Google Sheets API devolvió código ${metaRes.status}: ${metaRes.statusText}`);
        }
      }

      const metaData = await metaRes.json();
      const sheetTitles = metaData.sheets?.map((s: any) => s.properties?.title) || [];
      addComparisonLog('success', `Metadatos leídos. Pestañas encontradas: [${sheetTitles.join(', ')}]`);

      const ordersTab = sheetTitles.find((name: string) => name.toLowerCase().includes('order')) || 'Orders';
      addComparisonLog('info', `Utilizando pestaña "${ordersTab}" para comparar órdenes.`);

      // Fetch values
      addComparisonLog('info', 'Descargando filas brutas desde Documento Dispatcher...');
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(ordersTab)}!A:Y`;
      let res = await fetch(url, { headers: { Authorization: `Bearer ${activeToken}` } });
      
      if (!res.ok) {
        if (res.status === 401) {
          addComparisonLog('warn', 'La sesión de Google expiró durante la descarga de valores. Intentando renovar...');
          setGoogleToken(null);
          sessionStorage.removeItem('google_access_token');
          
          const renewedToken = await handleConnectGoogle();
          if (!renewedToken) {
            throw new Error("No se pudo renovar la sesión de Google automáticamente para la descarga. Re-intente la operación.");
          }
          activeToken = renewedToken;
          
          res = await fetch(url, { headers: { Authorization: `Bearer ${activeToken}` } });
          if (!res.ok) {
            throw new Error(`Fallo tras renovación en descarga de valores: ${res.statusText}`);
          }
        } else {
          throw new Error(`Fallo al descargar valores de la pestaña: ${res.statusText}`);
        }
      }

      const dataRes = await res.json();
      const rows = dataRes.values || [];

      console.log("=== DESCARGADO GOOGLE SHEET CON ÉXITO ===");
      console.log(`- Filas descargadas totales: ${rows.length}`);
      console.log("- Fecha inicio filtro:", filters.fechaInicio);
      console.log("- Fecha fin filtro:", filters.fechaFin);

      if (rows.length === 0) {
        throw new Error(`La pestaña de órdenes "${ordersTab}" está vacía.`);
      }

      addComparisonLog('success', `Documento Dispatcher procesado correctamente. Encontradas ${rows.length - 1} filas.`);

      const headers = rows[0] || [];
      const headerMap = buildHeaderMap(headers);
      const allSheetOrders = rows.slice(1)
        .map((r: any[]) => mapRowToRecord(r, headerMap))
        .filter((o: any) => !isCellEmptyOrError(o.orderId));

      // Filter spreadsheet rows by selected range matches
      const filteredSheetOrders = allSheetOrders.filter(item => {
        const deliveryNorm = normalizeDateStr(item.deliveryDate);
        const inRange = !!(deliveryNorm && deliveryNorm >= filters.fechaInicio && deliveryNorm <= filters.fechaFin);
        if (!inRange) {
          console.log(`[Filtrada por Fecha] Orden ID ${item.orderId} con entrega ${item.deliveryDate} (normalizada: ${deliveryNorm}) queda fuera de rango.`);
        }
        return inRange;
      });

      // Filter database records purely by selected date range and selected area name for true comparison
      const compareDbOrders = data.filter(dbOrder => {
        const deliveryNorm = normalizeDateStr(dbOrder.deliveryDate);
        const inRange = !!(deliveryNorm && deliveryNorm >= filters.fechaInicio && deliveryNorm <= filters.fechaFin);
        if (!inRange) return false;

        if (selectedAreaId) {
          const selectedAreaObj = areas.find(a => a.id === selectedAreaId);
          if (selectedAreaObj) {
            const dbArea = (dbOrder.area || 'La Habana').trim().toLowerCase();
            const selectedAreaName = selectedAreaObj.nombre.trim().toLowerCase();
            if (dbArea !== selectedAreaName) {
              return false;
            }
          }
        }
        return true;
      });

      console.log(`- Órdenes en BD (filtradas para comparación): ${compareDbOrders.length}`);
      console.log(`- Órdenes en Documento Dispatcher (filtradas): ${filteredSheetOrders.length}`);
      addComparisonLog('info', `Rango fecha análisis: [${filters.fechaInicio}] a [${filters.fechaFin}]`);
      addComparisonLog('info', `Órdenes en Firestore: ${compareDbOrders.length} | Órdenes en Documento Dispatcher: ${filteredSheetOrders.length}`);

      const discrepancies: Record<string, string[]> = {};
      const deletedInSheets = new Set<string>();
      const newInSheets: any[] = [];
      const discrepanciesList: any[] = [];

      // A. Scan each Firestore record against Google Sheets matching by OrderId
      addComparisonLog('info', 'Paso 2: Iniciando comparación fila a fila con los registros de la Base de Datos...');
      console.log("Paso 2: Iniciando comparación Firestore vs Google Sheets...");

      compareDbOrders.forEach(dbOrder => {
        const match = filteredSheetOrders.find(sheetOrder => {
          return String(sheetOrder.orderId || '').trim().toLowerCase() === String(dbOrder.orderId || '').trim().toLowerCase();
        });

        if (!match) {
          deletedInSheets.add(dbOrder.orderId);
          const diffStr = `Registro presente en BD pero ausente en Documento Dispatcher (Fecha: ${dbOrder.deliveryDate || 'N/A'})`;
          
          discrepanciesList.push({
            id: `${dbOrder.orderId}-inexistente`,
            orderId: dbOrder.orderId,
            campo: 'Existencia en Dispatcher',
            valorFirestore: 'Registrada',
            valorDispatcher: 'Eliminado / Ausente',
            diferencia: diffStr,
            tipo: 'inexistente',
            severity: 'critica',
            dbRecord: dbOrder
          });

          addComparisonLog('warn', `ALERTA: Órden "${dbOrder.orderId}" registrada en base de datos ha sido eliminada o no existe en Documento Dispatcher.`);
          console.warn(`[DIFERENCIA: INEXISTENTE] Orden ID ${dbOrder.orderId} no existe en la hoja activa de Documento Dispatcher.`);
        } else {
          const diffs: string[] = [];
          
          const compareNumeric = (label: string, vSheet: number, vDb: number) => {
            const parsedSheet = parseFloat(String(vSheet || 0));
            const parsedDb = parseFloat(String(vDb || 0));
            if (Math.abs(parsedSheet - parsedDb) > 0.01) {
              const diffStr = `Sheets: $${parsedSheet.toFixed(2)} vs BD: $${parsedDb.toFixed(2)}`;
              
              discrepanciesList.push({
                id: `${dbOrder.orderId}-${label}`,
                orderId: dbOrder.orderId,
                campo: label,
                valorFirestore: `$${parsedDb.toFixed(2)}`,
                valorDispatcher: `$${parsedSheet.toFixed(2)}`,
                diferencia: `Variación de $${Math.abs(parsedSheet - parsedDb).toFixed(2)}`,
                tipo: 'discrepancia_valor',
                severity: 'critica',
                dbRecord: dbOrder,
                sheetValue: parsedSheet,
                dbValue: parsedDb
              });

              diffs.push(`${label}: Sheets $${parsedSheet.toFixed(2)} vs BD $${parsedDb.toFixed(2)}`);
              console.warn(`[DIFERENCIA: VALOR] Orden ID ${dbOrder.orderId} -> Campo: ${label} | Sheets: ${parsedSheet} vs Firestore: ${parsedDb}`);
            }
          };

          const compareString = (label: string, sSheet: string, sDb: string) => {
            if (!stringsFuzzyEqual(sSheet, sDb)) {
              const cleanSheet = String(sSheet || '').trim();
              const cleanDb = String(sDb || '').trim();
              const diffStr = `Sheets: "${cleanSheet || 'Vacío'}" vs BD: "${cleanDb || 'Vacío'}"`;

              discrepanciesList.push({
                id: `${dbOrder.orderId}-${label}`,
                orderId: dbOrder.orderId,
                campo: label,
                valorFirestore: cleanDb || 'Vacío',
                valorDispatcher: cleanSheet || 'Vacío',
                diferencia: diffStr,
                tipo: 'discrepancia_valor',
                severity: 'advertencia',
                dbRecord: dbOrder,
                sheetValue: cleanSheet,
                dbValue: cleanDb
              });

              diffs.push(`${label}: Sheets "${cleanSheet || 'N/A'}" vs BD "${cleanDb || 'N/A'}"`);
              console.warn(`[DIFERENCIA: TEXTO] Orden ID ${dbOrder.orderId} -> Campo: ${label} | Sheets: "${cleanSheet}" vs Firestore: "${cleanDb}"`);
            }
          };

          compareNumeric('Monto Producto', match.productAmount, dbOrder.productAmount);
          compareNumeric('Cargo Entrega', match.deliveryCharge, dbOrder.deliveryCharge);
          compareNumeric('Store Offer', match.storeOffer, dbOrder.storeOffer);
          compareNumeric('Processing Fee', match.processingFee, dbOrder.processingFee);
          compareNumeric('Store Admin Charge', match.storeAdminCharge, dbOrder.storeAdminCharge);
          compareNumeric('Extra Delivery Charge', match.extraDeliveryCharge, dbOrder.extraDeliveryCharge);
          compareNumeric('Driver Admin Charge', match.driverAdminCharge, dbOrder.driverAdminCharge);
          compareNumeric('Complementary Delivery', match.complementaryDelivery, dbOrder.complementaryDelivery);
          compareNumeric('Tax/Impuesto', match.tax, dbOrder.tax);

          compareString('Mensajero/Driver', match.driver, dbOrder.driver);
          compareString('Método de Pago', match.paymentType, dbOrder.paymentType);
          compareString('Establecimiento/Store', match.store || match.negocio, dbOrder.store || dbOrder.negocio);
          compareString('Cliente', match.customer, dbOrder.customer);
          compareString('Teléfono Cliente', match.customerNumber, dbOrder.customerNumber);
          compareString('Promocode', match.promocode, dbOrder.promocode);

          if (diffs.length > 0) {
            discrepancies[dbOrder.orderId] = diffs;
            addComparisonLog('warn', `ALERTA: Discrepancias detectadas en Orden ID: ${dbOrder.orderId}: \n  * ${diffs.join('\n  * ')}`);
          }
        }
      });

      // B. Scan if there are new orders in Sheets not residing in Firestore
      console.log("Paso 3: Escaneando órdenes nuevas en Google Sheets...");
      filteredSheetOrders.forEach(sheetOrder => {
        const match = compareDbOrders.find(dbOrder => String(dbOrder.orderId || '').trim().toLowerCase() === String(sheetOrder.orderId || '').trim().toLowerCase());
        if (!match && sheetOrder.orderId) {
          newInSheets.push(sheetOrder);
          
          discrepanciesList.push({
            id: `${sheetOrder.orderId}-solo_sheets`,
            orderId: sheetOrder.orderId,
            campo: 'Existencia en Dispatcher',
            valorFirestore: 'Ausente',
            valorDispatcher: 'Pendiente Importación',
            diferencia: `Registro presente en Documento Dispatcher pero ausente en BD (Fecha: ${sheetOrder.deliveryDate || 'N/A'})`,
            tipo: 'solo_sheets',
            severity: 'advertencia',
            rawData: sheetOrder
          });

          addComparisonLog('info', `INFO: Encontrada orden externa "${sheetOrder.orderId}" en Dispatcher que aún no ha sido importada a BD.`);
          console.info(`[DIFERENCIA: NUEVA_EN_SHEET] Orden ID ${sheetOrder.orderId} se encuentra en Documento Dispatcher pero no en BD.`);
        }
      });

      setExternalComparison({
        discrepancies,
        deletedInSheets,
        newInSheets,
        compared: true
      });
      setDiscrepanciesTable(discrepanciesList);
      setActiveTab('differences'); // automatically shift focus to the list of differences
      setSelectedDiscrepancyIds([]);
      setDiffPage(1);

      const discrepancyCount = Object.keys(discrepancies).length + deletedInSheets.size;
      console.log(`=== ANALISIS COMPLETADO ===`);
      console.log(`- Total discrepancias creadas en tabla: ${discrepanciesList.length}`);
      console.log(`- Registros variados: ${Object.keys(discrepancies).length}`);
      console.log(`- Registros eliminados de Dispatcher: ${deletedInSheets.size}`);
      console.log(`- Registros nuevos en Dispatcher: ${newInSheets.length}`);

      if (discrepancyCount === 0 && newInSheets.length === 0) {
        addComparisonLog('success', '✓ Comparación finalizada con éxito. ¡Cero discrepancias! Ambos entornos están en sincronía total.');
      } else {
        addComparisonLog('warn', `⚠ Revisión finalizada: Se hallaron ${discrepancyCount} registros con variaciones críticas y ${newInSheets.length} registros sin importar.`);
      }

      try {
        const areaName = selectedAreaId ? areas.find(a => a.id === selectedAreaId)?.nombre || 'Todos' : 'Todos';
        logAuditEvent('Revision', 'Revisión Externa Ejecutada', {
          areaId: selectedAreaId || 'Todos',
          areaName: areaName,
          rangoFechas: `${filters.fechaInicio} - ${filters.fechaFin}`,
          discrepanciasEncontradas: discrepancyCount,
          nuevosEnSheets: newInSheets.length
        });
      } catch (logErr) {
        console.error("Failed to write revision audit log:", logErr);
      }

    } catch (error: any) {
      addComparisonLog('error', `Fallo de revisión: ${error.message}`);
      console.error("Error catastrófico en revisión:", error);
      alert("Error al comparar bases de datos: " + error.message);
    } finally {
      setComparing(false);
    }
  };

  const handleSyncSelectedDiscrepancies = async () => {
    if (selectedDiscrepancyIds.length === 0) return;
    if (!window.confirm(`¿Estás seguro de sincronizar y solventar las ${selectedDiscrepancyIds.length} diferencias seleccionadas en BD? Esto actualizará, creará, o eliminará registros según corresponda para que coincidan con Documento Dispatcher.`)) return;
    
    setSyncing(true);
    let successCount = 0;
    let failCount = 0;
    
    try {
      addComparisonLog('info', `Iniciando sincronización masiva de ${selectedDiscrepancyIds.length} registros...`);
      console.log(`Iniciando sincronización de ${selectedDiscrepancyIds.length} discrepancias...`);
      
      for (const id of selectedDiscrepancyIds) {
        const item = discrepanciesTable.find(d => d.id === id);
        if (!item) continue;
        
        try {
          if (item.tipo === 'inexistente') {
            await deleteDoc(doc(db, 'dispatcher_orders', item.dbRecord.id));
            addComparisonLog('success', `✓ Eliminada de BD (inexistente en DIspatcher): Orden ID ${item.orderId}`);
            console.log(`[SYNC: ELIMINACIÓN INTENCIONADA] Eliminado registro ID ${item.dbRecord.id} (Orden: ${item.orderId})`);
          } 
          else if (item.tipo === 'solo_sheets') {
            const itemToSave = {
              ...item.rawData,
              area: selectedAreaId ? areas.find(a => a.id === selectedAreaId)?.nombre || 'Todos' : 'Todos'
            };
            delete itemToSave.id;
            await addDoc(collection(db, 'dispatcher_orders'), itemToSave);
            addComparisonLog('success', `✓ Creada en BD (nueva en Dispatcher): Orden ID ${item.orderId}`);
            console.log(`[SYNC: CREACIÓN INTENCIONADA] Creado nuevo registro para Orden: ${item.orderId}`);
          } 
          else if (item.tipo === 'discrepancia_valor') {
            const docRef = doc(db, 'dispatcher_orders', item.dbRecord.id);
            const dbFieldMap: Record<string, string> = {
              'Monto Producto': 'productAmount',
              'Cargo Entrega': 'deliveryCharge',
              'Store Offer': 'storeOffer',
              'Processing Fee': 'processingFee',
              'Store Admin Charge': 'storeAdminCharge',
              'Extra Delivery Charge': 'extraDeliveryCharge',
              'Driver Admin Charge': 'driverAdminCharge',
              'Complementary Delivery': 'complementaryDelivery',
              'Tax/Impuesto': 'tax',
              'Mensajero/Driver': 'driver',
              'Método de Pago': 'paymentType',
              'Establecimiento/Store': 'store',
              'Cliente': 'customer',
              'Teléfono Cliente': 'customerNumber',
              'Promocode': 'promocode'
            };
            
            const dbField = dbFieldMap[item.campo];
            if (dbField) {
              const rawVal = item.sheetValue;
              await updateDoc(docRef, {
                [dbField]: rawVal
              });
              addComparisonLog('success', `✓ Actualizado campo "${item.campo}" en BD para Orden ID ${item.orderId} a "${rawVal}"`);
              console.log(`[SYNC: ACTUALIZACIÓN INTENCIONADA] Sincronizado ${dbField} para Orden: ${item.orderId} a: ${rawVal}`);
            }
          }
          successCount++;
        } catch (itemErr: any) {
          console.error(`Error syncing discrepancy ${id}:`, itemErr);
          addComparisonLog('error', `❌ Error al sincronizar Orden ID ${item.orderId || 'S/N'}: ${itemErr.message}`);
          failCount++;
        }
      }
      
      addComparisonLog('success', `Sincronización terminada: ${successCount} solventados correctamente. ${failCount} fallidos.`);
      
      try {
        const areaName = selectedAreaId ? areas.find(a => a.id === selectedAreaId)?.nombre || 'Todos' : 'Todos';
        logAuditEvent('Revision', 'Sincronización de Discrepancias Realizada', {
          areaId: selectedAreaId || 'Todos',
          areaName: areaName,
          exitosos: successCount,
          fallados: failCount,
          totalSincronizados: successCount + failCount
        });
      } catch (logErr) {
        console.error("Failed to write sync audit log:", logErr);
      }

      alert(`Sincronización masiva finalizada:\n- Exitosos: ${successCount}\n- Fallados: ${failCount}\nSe borrará la comparación anterior para que re-ejecute si lo desea.`);
      
      // Clear selection and previous diff structures
      setSelectedDiscrepancyIds([]);
      setExternalComparison(null);
      setDiscrepanciesTable([]);
      setActiveTab('table');
      
    } catch (err: any) {
      console.error(err);
      alert('Error en la sincronización: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Estás seguro de eliminar permanentemente este registro de BD?")) return;
    try {
      await deleteDoc(doc(db, 'dispatcher_orders', id));
      addComparisonLog('success', `Registro ID ${id} eliminado de BD.`);
    } catch (e: any) {
      console.error(e);
      alert("Error al eliminar: " + e.message);
    }
  };

  const handleExportPDF = () => {
    if (filteredData.length === 0) {
      alert("No hay registros en pantalla para exportar.");
      return;
    }

    try {
      import('jspdf').then(async (jsPDFModule) => {
        const { jsPDF } = jsPDFModule;
        const autoTable = (await import('jspdf-autotable')).default;

        const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
        });

        // Title Row
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(30, 41, 59); // dark slate
        doc.text('Mandao Conciliaciones - Hoja de Revisión Dispatcher', 14, 15);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(115, 115, 115);
        doc.text(`Rango de auditoría: ${filters.fechaInicio} a ${filters.fechaFin} | Origen: ${filters.origen}`, 14, 21);
        doc.text(`Generado: ${new Date().toLocaleString()} | Registros evaluados: ${filteredData.length}`, 14, 26);

        // Map the columns
        const tableHeaders = [['Delivery Date', 'Driver / Mensajero', 'Store / Establecimiento', 'Order ID', 'Product Amount', 'Delivery Charge', 'Vía de Pago', 'Cliente', 'Estado Externo']];
        const tableRows = filteredData.map(item => {
          let extStatus = 'Consistente (BD)';
          if (externalComparison) {
            if (externalComparison.deletedInSheets.has(item.orderId)) {
              extStatus = 'Eliminado en Dispatcher';
            } else if (externalComparison.discrepancies[item.orderId]) {
              extStatus = 'Con Discrepancia';
            } else {
              extStatus = 'Consistente';
            }
          }
          return [
            item.deliveryDate,
            item.driver || 'N/A',
            item.store || 'N/A',
            item.orderId || 'N/A',
            `$${(item.productAmount || 0).toFixed(2)}`,
            `$${(item.deliveryCharge || 0).toFixed(2)}`,
            item.paymentType || 'N/A',
            item.customer || 'N/A',
            extStatus
          ];
        });

        autoTable(doc, {
          startY: 32,
          head: tableHeaders,
          body: tableRows,
          theme: 'striped',
          headStyles: { fillColor: [15, 118, 110] }, // Teal header
          styles: { fontSize: 8 },
          columnStyles: {
            3: { fontStyle: 'bold' },
            4: { halign: 'right' },
            5: { halign: 'right' }
          }
        });

        // If external comparison has missing sheets records, append them on a separate section
        if (externalComparison && externalComparison.newInSheets.length > 0) {
          doc.addPage();
          doc.setFont('Helvetica', 'bold');
          doc.setFontSize(14);
          doc.setTextColor(185, 28, 28);
          doc.text('Órdenes Huérfanas de Base de Datos (Existen en Dispatcher pero no en BD)', 14, 15);

          const missingHeaders = [['Order ID', 'Delivery Date', 'Driver', 'Store', 'Product Amount', 'Delivery Charge', 'Payment']];
          const missingRows = externalComparison.newInSheets.map(x => [
            x.orderId || 'N/A',
            x.deliveryDate || 'N/A',
            x.driver || 'N/A',
            x.store || 'N/A',
            `$${(x.productAmount || 0).toFixed(2)}`,
            `$${(x.deliveryCharge || 0).toFixed(2)}`,
            x.paymentType || 'N/A'
          ]);

          autoTable(doc, {
            startY: 22,
            head: missingHeaders,
            body: missingRows,
            theme: 'striped',
            headStyles: { fillColor: [185, 28, 28] } // Red headers
          });
        }

        doc.save(`auditoria-dispatcher-${filters.origen}-${filters.fechaInicio}.pdf`);
      });
    } catch (e: any) {
      alert("Error al intentar exportar las incidencias a PDF: " + e.message);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
            <Database className="text-[var(--color-primary)] shrink-0" size={24} />
            Revisión de Registros Dispatcher
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Visualizador central administrativo. La base de datos es la única fuente de verdad; compare óptimamente contra documento Dispatcher.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Button 
            variant="outline" 
            className="gap-2 text-xs font-bold uppercase tracking-wider h-10 border-slate-200" 
            onClick={handleExportPDF}
          >
            <Download size={15} />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Inputs and Controllers */}
      <div className="bg-[var(--color-surface)] p-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          
          {/* Pick dispatcher/Area to retrieve designated sheet id */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Centro de Operación (Area)</label>
            <select 
              className="w-full h-10 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none focus:border-[var(--color-primary)] transition-all font-semibold"
              value={selectedAreaId}
              onChange={(e) => handleAreaChange(e.target.value)}
            >
              <option value="">-- Todos los centros --</option>
              {areas.map(a => (
                <option key={a.id} value={a.id}>{a.nombre} ({a.provincia})</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Desde</label>
            <input 
              type="date" 
              className="w-full h-10 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-mono outline-none"
              value={filters.fechaInicio} 
              onChange={(e) => setFilters({...filters, fechaInicio: e.target.value})} 
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Hasta</label>
            <input 
              type="date" 
              className="w-full h-10 px-3 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs font-mono outline-none"
              value={filters.fechaFin} 
              onChange={(e) => setFilters({...filters, fechaFin: e.target.value})} 
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              className="flex-1 gap-1.5 font-bold h-10 text-xs shadow-sm uppercase tracking-widest text-[9px] border-slate-200" 
              onClick={() => {
                setExternalComparison(null);
                setComparisonLogs([]);
                setActiveTab('table');
                addComparisonLog('success', `✓ Búsqueda Directa en BD activada para el rango de fechas [ ${filters.fechaInicio} ] a [ ${filters.fechaFin} ].`);
              }}
            >
              <Database size={13} className="text-[var(--color-primary)]" />
              Buscar en BD
            </Button>
            
            <Button 
              variant="brand" 
              className="flex-1 gap-1.5 font-bold h-10 text-xs shadow-sm uppercase tracking-widest text-[9px]" 
              onClick={handleDetectExternalChanges}
              disabled={comparing || !spreadsheetId}
            >
              {comparing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Detectar Cambios
            </Button>
            {externalComparison && (
              <Button 
                variant="outline" 
                className="h-10 text-[10px] border-slate-200 px-2" 
                onClick={() => { setExternalComparison(null); setComparisonLogs([]); }}
                title="Resetear diferencias cargadas"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Normal Grid Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[var(--color-border)]">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filtro buscador: Customer, Customer Number, Driver, Order ID..."
              className="w-full h-9 pl-10 pr-4 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-md text-xs outline-none focus:border-[var(--color-primary)] transition-all font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select 
            className="h-9 px-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded text-xs"
            value={filters.paymentType}
            onChange={(e) => setFilters({...filters, paymentType: e.target.value})}
          >
            <option value="Todos">Payment Type: Todos</option>
            {registeredPaymentMethods.length > 0 ? (
              registeredPaymentMethods.map((m: any) => (
                <option key={m.id || m.nombre} value={m.nombre}>{m.nombre}</option>
              ))
            ) : (
              <>
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Transferencia-Efectivo">Transferencia-Efectivo</option>
                <option value="Transferencia-Especial">Transferencia-Especial</option>
                <option value="Transferencia-Exterior">Transferencia-Exterior</option>
                <option value="Transferencia-Saldo">Transferencia-Saldo</option>
              </>
            )}
          </select>

          <select 
            className="h-9 px-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded text-xs"
            value={filters.origen}
            onChange={(e) => setFilters({...filters, origen: e.target.value})}
          >
            <option value="Todos">Origen: Todos</option>
            <option value="Habana">Habana</option>
            <option value="Holguin">Holguin</option>
            <option value="Provincia">Provincia</option>
          </select>

          <Button 
            variant="ghost" 
            className="text-[10px] h-8 font-bold ml-auto" 
            onClick={() => setFilters({
              origen: 'Todos',
              deliveryDate: '',
              orderDate: '',
              paymentType: 'Todos',
              area: 'Todos',
              store: 'Todas',
              driver: 'Todos',
              fechaInicio: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              fechaFin: new Date().toISOString().split('T')[0]
            })}
          >
            Limpiar Filtros
          </Button>
        </div>
      </div>

      {/* Tab Switcher for Auditoría / Base de Datos */}
      <div className="flex bg-slate-100 p-1 rounded-xl w-max border border-slate-200 shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('table')}
          className={cn(
            "px-5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-2 cursor-pointer outline-none",
            activeTab === 'table'
              ? "bg-white text-[var(--color-primary)] shadow-sm font-extrabold"
              : "text-slate-500 hover:text-slate-800"
          )}
          id="tab-table"
        >
          <Database size={14} className={activeTab === 'table' ? "text-[var(--color-primary)]" : "text-slate-400"} />
          Búsqueda Directa en BD
          <span className="bg-slate-250 text-slate-700 text-[9px] px-2 py-0.5 rounded-full font-black select-none">
            {filteredData.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (externalComparison) {
              setActiveTab('differences');
            } else {
              alert("Para visualizar las diferencias, primero selecciona un Centro de Operación (Area) con Spreadsheet ID y haz clic en 'Detectar Cambios'.");
            }
          }}
          className={cn(
            "px-5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-2 cursor-pointer outline-none",
            activeTab === 'differences'
              ? "bg-white text-[var(--color-primary)] shadow-sm font-extrabold"
              : "text-slate-500 hover:text-slate-800",
            !externalComparison && "opacity-60"
          )}
          id="tab-differences"
        >
          <AlertCircle size={14} className={activeTab === 'differences' ? "text-[var(--color-primary)]" : "text-slate-400"} />
          Diferencias con Documento (Dispatcher)
          {externalComparison ? (
            <span className="bg-rose-100 text-rose-800 text-[9px] px-2 py-0.5 rounded-full font-black select-none animate-pulse">
              {discrepanciesTable.length}
            </span>
          ) : (
            <span className="text-[8px] uppercase tracking-wider text-slate-400 font-bold bg-slate-200 px-1.5 py-0.5 rounded-full">Inactivo</span>
          )}
        </button>
      </div>

      {/* Main Table Screen */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-sm overflow-hidden flex flex-col">
        
        {externalComparison && activeTab === 'differences' ? (
          /* =========================================================================
             1. SUBMÓDULO 5.3: TABLA DE DISCREPANCIAS DETECTADAS EN LA AUDITORÍA
             ========================================================================= */
          <div className="flex flex-col">
            <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-ping shrink-0" />
                <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                  Listado de diferencias de Auditoría ({filteredDiscrepancies.length} discrepancias encontradas)
                </h3>
              </div>
              <div className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-3 py-1 font-extrabold max-sm:hidden select-none">
                Filtre por campo o severidad antes de sincronizar
              </div>
            </div>

            {/* Discrepancy granular filters */}
            <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50/50 border-b border-[var(--color-border)]">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar discrepancia por Orden ID o descripción..."
                  className="w-full h-9 pl-10 pr-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md text-xs font-semibold outline-none focus:border-[var(--color-primary)] transition"
                  value={diffFilters.search}
                  onChange={(e) => { setDiffFilters({ ...diffFilters, search: e.target.value }); setDiffPage(1); }}
                />
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  className="h-9 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs font-black cursor-pointer text-slate-700 hover:border-slate-400"
                  value={diffFilters.campo}
                  onChange={(e) => { setDiffFilters({ ...diffFilters, campo: e.target.value }); setDiffPage(1); }}
                >
                  <option value="Todos">Filtrar por Campo: Todos</option>
                  {uniqueFieldsWithDiff.filter(f => f !== 'Todos').map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>

                <select
                  className="h-9 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs font-black cursor-pointer text-slate-700 hover:border-slate-400"
                  value={diffFilters.tipo}
                  onChange={(e) => { setDiffFilters({ ...diffFilters, tipo: e.target.value }); setDiffPage(1); }}
                >
                  {uniqueTypesWithDiff.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Bulk Actions control bar */}
            {selectedDiscrepancyIds.length > 0 && (
              <div className="p-3 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between px-6 animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                  Se han seleccionado <span className="font-black text-[var(--color-primary)] underline">{selectedDiscrepancyIds.length}</span> discrepancias de auditoría.
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="brand" 
                    className="h-8 text-[10px] uppercase tracking-wider font-extrabold gap-2"
                    onClick={handleSyncSelectedDiscrepancies}
                    disabled={syncing}
                  >
                    {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Forzar Sincronización en BD
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-8 text-[10px] border-amber-200 text-slate-600 hover:bg-amber-100"
                    onClick={() => setSelectedDiscrepancyIds([])}
                  >
                    Anular Selección
                  </Button>
                </div>
              </div>
            )}

            {/* Differences Table View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)] sticky top-0 z-10 select-none">
                  <tr>
                    <th className="w-12 px-6 py-4 text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                        checked={filteredDiscrepancies.length > 0 && selectedDiscrepancyIds.length === filteredDiscrepancies.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDiscrepancyIds(filteredDiscrepancies.map(d => d.id));
                          } else {
                            setSelectedDiscrepancyIds([]);
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleDiffSort('orderId')}>Orden ID{renderDiffSortIndicator('orderId')}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleDiffSort('campo')}>Campo{renderDiffSortIndicator('campo')}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleDiffSort('valorFirestore')}>Valor Firestore{renderDiffSortIndicator('valorFirestore')}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleDiffSort('valorDispatcher')}>Valor Dispatcher{renderDiffSortIndicator('valorDispatcher')}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleDiffSort('diferencia')}>Diferencia{renderDiffSortIndicator('diferencia')}</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] text-right cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleDiffSort('severity')}>Severidad{renderDiffSortIndicator('severity')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filteredDiscrepancies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-24 text-center bg-white">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3 animate-bounce" />
                        <h4 className="text-xs text-emerald-700 font-extrabold uppercase tracking-widest">¡Cero discrepancias activas!</h4>
                        <p className="text-[10px] text-slate-400 mt-1">No hay diferencias de auditoría que correspondan con los criterios cargados.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedDiscrepancies.map((d) => {
                      const isChecked = selectedDiscrepancyIds.includes(d.id);
                      return (
                        <tr 
                          key={d.id} 
                          className={cn(
                            "hover:bg-slate-50/80 transition-colors group cursor-pointer",
                            isChecked ? "bg-amber-50/40" : "",
                            d.tipo === 'inexistente' ? "bg-rose-50/10 border-l-[3px] border-l-rose-500 hover:bg-rose-50/30" :
                            d.tipo === 'solo_sheets' ? "bg-sky-50/10 border-l-[3px] border-l-sky-500 hover:bg-sky-50/30" :
                            "bg-amber-50/10 border-l-[3px] border-l-amber-500 hover:bg-amber-50/30"
                          )}
                          onClick={() => {
                            if (isChecked) {
                              setSelectedDiscrepancyIds(prev => prev.filter(x => x !== d.id));
                            } else {
                              setSelectedDiscrepancyIds(prev => [...prev, d.id]);
                            }
                          }}
                        >
                          <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDiscrepancyIds(prev => [...prev, d.id]);
                                } else {
                                  setSelectedDiscrepancyIds(prev => prev.filter(x => x !== d.id));
                                }
                              }}
                            />
                          </td>
                          <td className="px-6 py-4 font-mono text-xs font-black text-[var(--color-text)]">
                            {d.orderId}
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-700">
                            {d.campo}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600 font-mono">
                            {d.valorFirestore}
                          </td>
                          <td className="px-6 py-2 text-xs text-slate-800 font-bold font-mono">
                            {d.valorDispatcher}
                          </td>
                          <td className="px-6 py-2 text-xs text-amber-800 font-semibold">
                            {d.diferencia}
                          </td>
                          <td className="px-6 py-2 text-right">
                            <span className={cn(
                              "text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full select-none",
                              d.severity === 'critica' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                              d.severity === 'advertencia' ? 'bg-amber-100 text-amber-700 border border-amber-250' :
                              'bg-sky-100 text-sky-700 border border-sky-200'
                            )}>
                              {d.severity}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for discrepancies table */}
            {filteredDiscrepancies.length > 0 && (
              <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-[var(--color-text-muted)]">
                <div>
                  Mostrando <span className="text-[var(--color-text)] font-bold">{Math.min(filteredDiscrepancies.length, (diffPage - 1) * diffItemsPerPage + 1)}</span> de{' '}
                  <span className="text-[var(--color-text)] font-bold">{Math.min(filteredDiscrepancies.length, diffPage * diffItemsPerPage)}</span> de{' '}
                  <span className="text-[var(--color-text)] font-bold">{filteredDiscrepancies.length}</span> discrepancias
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setDiffPage(prev => Math.max(1, prev - 1))}
                    disabled={diffPage === 1}
                    className="h-10 min-w-[80px] px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center cursor-pointer text-[var(--color-text-muted)]"
                  >
                    Anterior
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {renderPageNumbers(diffPage, Math.ceil(filteredDiscrepancies.length / diffItemsPerPage), setDiffPage)}
                  </div>

                  <button
                    type="button"
                    onClick={() => setDiffPage(prev => Math.min(Math.ceil(filteredDiscrepancies.length / diffItemsPerPage), prev + 1))}
                    disabled={diffPage === Math.ceil(filteredDiscrepancies.length / diffItemsPerPage)}
                    className="h-10 min-w-[80px] px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center cursor-pointer text-[var(--color-text-muted)]"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* =========================================================================
             2. PERSISTED FIRESTORE DATA DIRECT COPIA TABLE VISUALIZER
             ========================================================================= */
          <div className="flex flex-col">
            <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Registros Persistidos en Base Datos ({filteredData.length})</h3>
              </div>
              {externalComparison && (
                <div className="flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-full px-3 py-1 text-[10px] font-bold select-none">
                  <AlertCircle size={12} className="text-amber-600 shrink-0" />
                  Revisión externa activa: Comparado contra Documento Dispatcher.
                </div>
              )}
            </div>
            
            <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
              <tr>
                <th className="w-5 px-6 py-4"></th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('deliveryDate')}>Deliv. Date{renderSortIndicator('deliveryDate')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('driver')}>Driver{renderSortIndicator('driver')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('store')}>Store{renderSortIndicator('store')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] font-mono cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('orderId')}>Order ID{renderSortIndicator('orderId')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] text-right cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('productAmount')}>Prod. Amount{renderSortIndicator('productAmount')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] text-right cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('deliveryCharge')}>Deliv. Charge{renderSortIndicator('deliveryCharge')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] cursor-pointer hover:bg-slate-100 select-none transition" onClick={() => handleSort('area')}>Area{renderSortIndicator('area')}</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin mx-auto animate-pulse" />
                    <p className="text-xs text-[var(--color-text-muted)] mt-2 font-bold uppercase tracking-wider">Recuperando órdenes persistidas...</p>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">No se encontraron registros en BD.</p>
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => {
                  const isDeleted = externalComparison?.deletedInSheets.has(item.orderId);
                  const isDiscrepante = externalComparison?.discrepancies[item.orderId];
                  const hasDifferencesStr = isDiscrepante ? isDiscrepante.join(' | ') : '';

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={cn(
                        "hover:bg-slate-50 transition-colors group cursor-pointer",
                        isDeleted ? "bg-red-50 border-l-4 border-l-rose-500 hover:bg-red-100" :
                        isDiscrepante ? "bg-amber-50 border-l-4 border-l-amber-500 hover:bg-amber-100/70" : ""
                      )}
                      onClick={() => toggleRow(item.id)}
                      >
                        <td className="px-6 py-4 text-center">
                          <Eye size={14} className={cn("text-slate-400 group-hover:text-[var(--color-primary)] transition", expandedRows[item.id] && "text-[var(--color-primary)] scale-110")} />
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-[var(--color-text)]">
                          {item.deliveryDate}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-[var(--color-text)]">{item.driver || 'Sin Driver'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-semibold text-[var(--color-text-muted)]">{item.store || item.negocio || 'N/A'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-[var(--color-text)] font-mono">{item.orderId}</span>
                            {isDeleted && (
                              <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded uppercase w-max tracking-wide mt-1 animate-pulse">Eliminada en Sheets</span>
                            )}
                            {isDiscrepante && (
                              <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase w-max tracking-wide mt-1 animate-pulse">Modificada en Sheets</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-right tabular-nums text-slate-700">
                          ${(item.productAmount || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-right tabular-nums text-slate-700">
                          ${(item.deliveryCharge || 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.area || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleDelete(item.id)}
                              className="p-1 px-2.5 text-[10px] text-xs font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-md transition-all uppercase shrink-0"
                              title="Eliminar de BD"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Content Panel */}
                      {expandedRows[item.id] && (
                        <tr className="bg-slate-50/50 border-t border-b border-slate-100">
                          <td colSpan={9} className="px-8 py-5">
                            <div className="space-y-4">
                              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-1 flex items-center gap-1.5">
                                <Info size={12} className="text-[var(--color-primary)]" />
                                Detalle Completo de Facturación y Campos Expandidos (Invariantes Mandao)
                              </h4>
                              
                              {isDiscrepante && (
                                <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs flex items-start gap-2.5">
                                  <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold uppercase text-[10px] tracking-wider text-red-700">Variaciones Registradas en Documento Dispatcher:</p>
                                    <p className="mt-1 font-mono">{hasDifferencesStr}</p>
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 text-xs">
                                <div>
                                  <span className="text-slate-400 block font-medium">Order Date (Fecha Orden)</span>
                                  <span className="font-bold text-slate-700">{item.orderDate || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block font-medium">Payment Type (Vía Pago)</span>
                                  <span className="font-bold text-slate-700">{item.paymentType || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block font-medium">Cliente</span>
                                  <span className="font-bold text-slate-700">{item.customer || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 block font-medium">Teléfono Cliente</span>
                                  <span className="font-bold font-mono text-slate-700">{item.customerNumber || 'N/A'}</span>
                                </div>

                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Store Offer</span>
                                  <span className="font-bold text-slate-700 tabular-nums">${(item.storeOffer || 0).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Processing Fee</span>
                                  <span className="font-bold text-slate-700 tabular-nums">${(item.processingFee || 0).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Store Admin Charge</span>
                                  <span className="font-bold text-slate-700 tabular-nums">${(item.storeAdminCharge || 0).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Extra Delivery Charge</span>
                                  <span className="font-bold text-slate-700 tabular-nums">${(item.extraDeliveryCharge || 0).toFixed(2)}</span>
                                </div>

                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Driver Admin Charge</span>
                                  <span className="font-bold text-slate-700 tabular-nums">${(item.driverAdminCharge || 0).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Complementary Delivery</span>
                                  <span className="font-bold text-slate-700 tabular-nums">${(item.complementaryDelivery || 0).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Tax / Impuestos</span>
                                  <span className="font-bold text-slate-700 tabular-nums">${(item.tax || 0).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-100 pt-2">
                                  <span className="text-slate-400 block font-medium">Promocode (Código Promo)</span>
                                  <span className="font-bold text-slate-750 font-mono">{item.promocode || 'Ninguno'}</span>
                                </div>
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

        {/* Pagination bar */}
        {filteredData.length > 0 && (
          <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-[var(--color-text-muted)]">
            <div>
              Mostrando <span className="text-[var(--color-text)] font-bold">{Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)}</span> a{' '}
              <span className="text-[var(--color-text)] font-bold">{Math.min(filteredData.length, currentPage * itemsPerPage)}</span> de{' '}
              <span className="text-[var(--color-text)] font-bold">{filteredData.length}</span> registros
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="h-10 min-w-[80px] px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center cursor-pointer text-[var(--color-text-muted)]"
              >
                Anterior
              </button>
              
              <div className="flex items-center gap-1">
                {renderPageNumbers(currentPage, Math.ceil(filteredData.length / itemsPerPage), setCurrentPage)}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredData.length / itemsPerPage), prev + 1))}
                disabled={currentPage === Math.ceil(filteredData.length / itemsPerPage)}
                className="h-10 min-w-[80px] px-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)] font-bold text-xs transition flex items-center justify-center cursor-pointer text-[var(--color-text-muted)]"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    )}

        {/* Missing / Not imported orders list */}
        {externalComparison && externalComparison.newInSheets.length > 0 && (
          <div className="border-t border-rose-200 bg-rose-50/50 p-6 space-y-4">
            <h4 className="text-xs font-black text-rose-700 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
              <AlertCircle size={15} />
              Órdenes externas huérfanas en BD ({externalComparison.newInSheets.length} órdenes que solo existen en Documento Dispatcher)
            </h4>
            <div className="overflow-x-auto rounded-lg border border-rose-100 bg-white">
              <table className="w-full text-left text-xs text-rose-900 border-collapse">
                <thead className="bg-rose-100/50">
                  <tr>
                    <th className="p-3 font-bold">Order ID</th>
                    <th className="p-3 font-bold">Delivery Date</th>
                    <th className="p-3 font-bold">Driver</th>
                    <th className="p-3 font-bold">Negocio</th>
                    <th className="p-3 text-right font-bold">Prod. Amount</th>
                    <th className="p-3 text-right font-bold">Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {paginatedOrphanedOrders.map(x => (
                    <tr key={x.orderId}>
                      <td className="p-3 font-mono font-bold">{x.orderId}</td>
                      <td className="p-3">{x.deliveryDate}</td>
                      <td className="p-3 font-semibold">{x.driver}</td>
                      <td className="p-3">{x.store || x.negocio}</td>
                      <td className="p-3 text-right font-bold">${x.productAmount?.toFixed(2)}</td>
                      <td className="p-3 text-right font-bold">${x.deliveryCharge?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls for Orphaned Orders */}
            {externalComparison.newInSheets.length > orphanedItemsPerPage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-rose-100 text-rose-850">
                <span className="text-[10px] font-semibold text-rose-700">
                  Mostrando <span className="font-bold">{Math.min(externalComparison.newInSheets.length, (orphanedPage - 1) * orphanedItemsPerPage + 1)}</span> a{' '}
                  <span className="font-bold">{Math.min(externalComparison.newInSheets.length, orphanedPage * orphanedItemsPerPage)}</span> de{' '}
                  <span className="font-bold">{externalComparison.newInSheets.length}</span> órdenes externas huérfanas
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setOrphanedPage(prev => Math.max(1, prev - 1))}
                    disabled={orphanedPage === 1}
                    className="p-1.5 rounded-md border border-rose-200 bg-white hover:bg-rose-50 transition disabled:opacity-40 disabled:cursor-not-allowed text-rose-800"
                    title="Página Anterior"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {renderPageNumbers(orphanedPage, Math.ceil(externalComparison.newInSheets.length / orphanedItemsPerPage), setOrphanedPage)}
                  </div>
                  <button
                    onClick={() => setOrphanedPage(prev => Math.min(Math.ceil(externalComparison.newInSheets.length / orphanedItemsPerPage), prev + 1))}
                    disabled={orphanedPage === Math.ceil(externalComparison.newInSheets.length / orphanedItemsPerPage)}
                    className="p-1.5 rounded-md border border-rose-200 bg-white hover:bg-rose-50 transition disabled:opacity-40 disabled:cursor-not-allowed text-rose-800"
                    title="Página Siguiente"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}

            <p className="text-[10px] text-rose-600 font-semibold leading-normal">
              * Nota: Para persistirlas en BD, diríjase al módulo de Verificación, cargue el mismo rango de fechas y ejecute "Importar a la BD".
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
