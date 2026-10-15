import { supabase } from './supabase';

// Reglas de excepción de la Verificación del Dispatcher (tabla
// `dispatcher_rules`, Configuración -> Reglas). La Verificación exige que
// toda columna de la hoja "Orders" tenga valor; una regla indica, para un
// Store concreto (o para todos los negocios) y opcionalmente solo cuando
// ciertas columnas vienen vacías/0, qué columnas pueden venir vacías. Así
// un servicio nuevo que registra sus órdenes con columnas vacías se
// resuelve desde el sistema, sin tocar código. Ninguna excepción vive fija
// en el código: Mandao Express y Recogida en el establecimiento (RN-003)
// son reglas sembradas, editables y eliminables.

export type RuleActor = 'negocios' | 'mensajeros';
export type RuleAction = 'permitir' | 'advertencia';

// Columnas de "Orders" que una regla puede exceptuar. "Delivery Date",
// "Payment Type" (RN-005), "Store" y "Order ID" quedan fuera: sin ellas la
// orden no se puede filtrar, identificar ni asociar a una regla.
export type RuleColumn =
  | 'orderDate' | 'customer' | 'customerNumber' | 'driver'
  | 'productAmount' | 'storeOffer' | 'processingFee' | 'storeAdminCharge'
  | 'deliveryCharge' | 'extraDeliveryCharge' | 'driverAdminCharge' | 'complementaryDelivery'
  | 'tax' | 'rate' | 'transactionFee' | 'promocode' | 'area';

interface ColumnDef {
  label: string;
  // Encabezados normalizados aceptados (mismo criterio que buildHeaderMap
  // en VerificationPage.tsx).
  headerKeys: string[];
}

// En el mismo orden en que aparecen en la hoja "Orders".
export const ORDER_COLUMNS: Record<RuleColumn, ColumnDef> = {
  orderDate: { label: 'Order Date', headerKeys: ['orderdate', 'fechadeorden', 'fechaorden'] },
  customer: { label: 'Customer', headerKeys: ['customer', 'client', 'cliente'] },
  customerNumber: { label: 'Customer Number', headerKeys: ['customernumber', 'numerodetelefono', 'telefono', 'telefonocliente', 'tel'] },
  driver: { label: 'Driver', headerKeys: ['driver', 'mensajero', 'repartidor', 'conductor'] },
  productAmount: { label: 'Product Amount', headerKeys: ['productamount', 'montoproducto', 'montoarticulos', 'articulos', 'products'] },
  storeOffer: { label: 'Store Offer', headerKeys: ['storeoffer', 'ofertaestablecimiento', 'ofertatienda', 'descuento'] },
  processingFee: { label: 'Processing Fee', headerKeys: ['processingfee', 'cargoprocesamiento', 'procesamiento', 'fee'] },
  storeAdminCharge: { label: 'Store Admin Charge', headerKeys: ['storeadmincharge', 'storeadmin', 'comisioncomercio', 'comisiontienda'] },
  deliveryCharge: { label: 'Delivery Charge', headerKeys: ['deliverycharge', 'costodeentrega', 'cargoentrega', 'delivery'] },
  extraDeliveryCharge: { label: 'Extra Delivery Charge', headerKeys: ['extradeliverycharge', 'extradelivery', 'cargoextra', 'masdistancia'] },
  driverAdminCharge: { label: 'Driver Admin Charge', headerKeys: ['driveradmincharge', 'driveradmin', 'comisionmensajero'] },
  complementaryDelivery: { label: 'Complementary Delivery', headerKeys: ['complementarydelivery', 'complementario', 'entregaenlacasilla'] },
  tax: { label: 'Tax', headerKeys: ['tax', 'impuesto'] },
  rate: { label: 'Rate', headerKeys: ['rate', 'tasa', 'tasadecambio'] },
  transactionFee: { label: 'Transaction Fee', headerKeys: ['transactionfee', 'comisiontransaccion'] },
  promocode: { label: 'Promocode', headerKeys: ['promocode', 'codigopromocional', 'promo', 'cupon'] },
  area: { label: 'Area', headerKeys: ['area', 'zona', 'provincia', 'demarcacion'] },
};

export const RULE_COLUMN_KEYS = Object.keys(ORDER_COLUMNS) as RuleColumn[];

export const ACTIONS: Record<RuleAction, { label: string; hint: string }> = {
  permitir: { label: 'Permitir vacío', hint: 'No genera incidencia.' },
  advertencia: { label: 'Solo advertencia', hint: 'Se reporta, pero no bloquea la importación.' },
};

export interface RuleColumnEntry {
  column: RuleColumn;
  action: RuleAction;
}

export interface DispatcherRule {
  id: string;
  actor: RuleActor;
  nombre: string;
  // null = aplica a todos los negocios.
  store: string | null;
  // Condición opcional: la regla solo aplica si TODAS estas columnas vienen
  // vacías o en 0 (p. ej. los 4 cargos de entrega en una Recogida).
  cuandoVacias: RuleColumn[];
  descripcion: string;
  columnas: RuleColumnEntry[];
  activo: boolean;
}

export const ALL_STORES_LABEL = 'Todos los negocios';

// Mismas reglas que siembra la migración 2026-09-30d. Solo se usan si la
// tabla no se puede leer, para que una falla de red no convierta de golpe
// en críticas columnas que hasta hoy nunca se exigieron.
const DELIVERY_CHARGE_COLUMNS: RuleColumn[] = ['deliveryCharge', 'extraDeliveryCharge', 'driverAdminCharge', 'complementaryDelivery'];
const permitir = (cols: RuleColumn[]): RuleColumnEntry[] => cols.map(column => ({ column, action: 'permitir' }));

export const DEFAULT_DISPATCHER_RULES: DispatcherRule[] = [
  {
    id: 'default-negocios-todos', actor: 'negocios', nombre: 'Columnas opcionales', store: null, cuandoVacias: [],
    descripcion: '', activo: true,
    columnas: permitir(['customerNumber', 'processingFee', 'tax', 'rate', 'transactionFee', 'promocode', 'area']),
  },
  {
    id: 'default-mensajeros-todos', actor: 'mensajeros', nombre: 'Cargos de entrega opcionales', store: null, cuandoVacias: [],
    descripcion: '', activo: true,
    columnas: permitir(DELIVERY_CHARGE_COLUMNS),
  },
  {
    id: 'default-mandao-express', actor: 'negocios', nombre: 'Mandao Express', store: 'Mandao Express', cuandoVacias: [],
    descripcion: '', activo: true,
    columnas: permitir(['productAmount', 'storeOffer', 'storeAdminCharge']),
  },
  {
    id: 'default-recogida', actor: 'mensajeros', nombre: 'Recogida en el establecimiento', store: null,
    cuandoVacias: DELIVERY_CHARGE_COLUMNS, descripcion: '', activo: true,
    columnas: permitir(['driver']),
  },
];

export function mapRuleRow(r: any): DispatcherRule {
  return {
    id: r.rule_id,
    actor: r.actor,
    nombre: r.name || r.store || ALL_STORES_LABEL,
    store: r.store ?? null,
    cuandoVacias: Array.isArray(r.when_empty) ? r.when_empty : [],
    descripcion: r.description || '',
    columnas: Array.isArray(r.columns) ? r.columns : [],
    activo: r.active,
  };
}

export const RULE_SELECT = 'rule_id, actor, name, store, when_empty, description, columns, active';

export async function loadActiveDispatcherRules(): Promise<{ rules: DispatcherRule[]; fromFallback: boolean; error?: string }> {
  const { data, error } = await supabase.from('dispatcher_rules').select(RULE_SELECT).eq('active', true);
  if (error) return { rules: DEFAULT_DISPATCHER_RULES, fromFallback: true, error: error.message };
  return { rules: (data || []).map(mapRuleRow), fromFallback: false };
}

// Comparación de nombres de Store: ignora mayúsculas, tildes y espacios repetidos.
export const normalizeStore = (v: any) =>
  String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Lee de la fila del Sheet el valor crudo de cada columna exceptuable.
export function readRuleColumns(row: any[], headerMap: Record<string, number>): Record<RuleColumn, any> {
  const out = {} as Record<RuleColumn, any>;
  RULE_COLUMN_KEYS.forEach(col => {
    const idx = ORDER_COLUMNS[col].headerKeys.map(k => headerMap[k]).find(i => i !== undefined);
    out[col] = idx !== undefined && idx < row.length ? row[idx] : '';
  });
  return out;
}

// Columnas exceptuables que realmente existen como encabezado en la hoja.
export function presentRuleColumns(headerMap: Record<string, number>): Set<RuleColumn> {
  return new Set(RULE_COLUMN_KEYS.filter(col => ORDER_COLUMNS[col].headerKeys.some(k => headerMap[k] !== undefined)));
}

// Vacía, guion, N/A o un monto igual a 0 ("0", "0.00", "$ 0,00").
export function isEmptyOrZero(raw: any): boolean {
  const s = String(raw ?? '').trim();
  const lower = s.toLowerCase();
  if (s === '' || s === '-' || s === '—' || s === '–' || lower === 'n/a' || lower === 'null' || lower === 'undefined') return true;
  const numeric = s.replace(/[$€%\s.,]/g, '');
  return /^0+$/.test(numeric);
}

export interface RuleExemption {
  action: RuleAction;
  origen: string; // nombre de la regla que exceptúa la columna
}

// Columnas exceptuadas para una orden: reglas de "Todos los negocios" + de
// su Store, cuya condición (si tiene) se cumple. Si varias exceptúan la
// misma columna, gana 'permitir' sobre 'advertencia'.
export function resolveExemptions(store: string, raw: Record<RuleColumn, any>, rules: DispatcherRule[]): Map<RuleColumn, RuleExemption> {
  const result = new Map<RuleColumn, RuleExemption>();
  const target = normalizeStore(store);
  rules.forEach(rule => {
    if (!rule.activo) return;
    if (rule.store !== null && normalizeStore(rule.store) !== target) return;
    if (!rule.cuandoVacias.every(col => isEmptyOrZero(raw?.[col]))) return;
    rule.columnas.forEach(({ column, action }) => {
      const prev = result.get(column);
      if (!prev || (prev.action === 'advertencia' && action === 'permitir')) {
        result.set(column, { action, origen: rule.nombre });
      }
    });
  });
  return result;
}

export function describeCondition(rule: Pick<DispatcherRule, 'store' | 'cuandoVacias'>): string {
  const store = rule.store ? `Store "${rule.store}"` : ALL_STORES_LABEL;
  if (rule.cuandoVacias.length === 0) return store;
  return `${store}, cuando estén vacías/0: ${rule.cuandoVacias.map(c => ORDER_COLUMNS[c]?.label || c).join(', ')}`;
}
