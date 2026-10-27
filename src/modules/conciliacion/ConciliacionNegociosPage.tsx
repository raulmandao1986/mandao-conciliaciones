import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_IMPORT, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { formatCurrency, formatDate, toLocalISODate } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { Button } from '../../design-system/primitives/Button';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';
import { Pagination, usePagination } from '../../design-system/patterns/Pagination';
import {
  PaymentBucket, BucketBreakdown, computeBucketBreakdown, normalizeEntityName, normalizeCompact,
  EstadoConciliacion, ESTADO_CONCILIACION_OPTIONS, BUCKET_LABELS,
} from '../../lib/conciliacion/paymentBuckets';
import { fetchAllRows } from '../../lib/conciliacion/fetchAllRows';
import { EstadoConciliacionBadge } from '../../lib/conciliacion/EstadoBadge';
import { subirPdfsConciliacion, describeDriveResult, isMissingPdfColumn } from '../../lib/conciliacion/drivePdf';
import { ResumenMetodosPago, ResumenBuilder } from './ResumenMetodosPago';
import { buildPdfNegocio, loadOrdenesNegocio } from '../../lib/conciliacion/pdfConciliacionNegocio';
import { ProcesoProgreso, useProcessSteps, trackStep, type StepStatus } from './ProcesoProgreso';
import {
  GitMerge, Loader2, Search, Calculator, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, FileText, UserPlus, Info, UploadCloud
} from 'lucide-react';

// =====================================================================
// Conciliación de Negocios — ver Instrucciones Conciliaciones Mandao.md
// sección 6. Fuente de datos: tabla `dispatcher`. El motor de baldes
// CxC/CxP (efectivo/transfermóvil/saldo mandao/tarjeta) es compartido
// con Mensajeros — ver lib/conciliacion/paymentBuckets.ts.
//
// CÁLCULO POR MÉTODO DE PAGO DEL NEGOCIO (confirmado 2026-09-30): el
// dispatcher siempre registra los montos en CUP. El método de pago
// registrado del negocio (`businesses.payment_method`, catálogo
// Configuración → Métodos de Pago → Negocios) decide cuántas filas de
// conciliación se generan y si alguna se expresa en USD:
//   'Transferencia'          -> 1 fila (CUP):    0.8*(TM+SM+US) - CxC
//   'Transferencia-Efectivo' -> 2 filas (CUP):   "Transferencia"=0.8*TM
//                                                "Efectivo"=0.8*(SM+US)-CxC
//   'Transferencia-Exterior' -> 2 filas:         "Transferencia"(CUP)=0.8*TM-CxC
//                                                "Exterior"(USD, vía tasa activa)=0.8*(SM+US)
// Un método no reconocido (vacío o distinto de estos 3) usa la fórmula
// de 'Transferencia' como respaldo, marcado con una advertencia visible.
// =====================================================================

interface OrderRow {
  orderPk: string;
  orderId: string;
  deliveryDate: string;
  driver: string;
  store: string;
  paymentType: string;
  productAmount: number;
  areaId: string;
}

// Una "Settlement" (liquidación) es UNA fila de conciliaciones_businesses.
// Un negocio puede generar 1 (Transferencia) o 2 (Efectivo/Exterior) de
// estas por rango de fechas — ver comentario de cabecera.
interface Settlement {
  key: string; // negocioKey + '|' + subtipo — identifica esta fila concreta
  negocioKey: string; // agrupa las 1-2 filas que pertenecen al mismo negocio
  negocioNombre: string;
  areaId: string;
  areaNombre: string;
  businessId: string | null;
  metodoPagoNegocio: string;
  metodoReconocido: boolean;
  subtipo: string; // 'Transferencia' | 'Efectivo' | 'Exterior' -> columna via_pago
  moneda: 'CUP' | 'USD';
  registrado: boolean;
  yaConciliado: boolean;
  ordenesEnJuego: number; // cantidad de órdenes que participan en ESTA fila
  buckets: Record<PaymentBucket, BucketBreakdown>; // baldes de ESTA fila (los que no aplican quedan en 0)
  sinClasificar: { ordenes: number; saldo: number; tipos: Set<string> };
  totalCxC: number;
  totalCxP: number;
  // Fila "Exterior" sin Tasa de Cambio activa: no se puede convertir a USD,
  // así que queda bloqueada para conciliar (los montos se muestran en CUP).
  sinTasa: boolean;
}

interface AreaOption { id: string; nombre: string; }
interface BusinessOption { id: string; nombre: string; areaId: string; metodoPago: string; }
// Negocio con liquidaciones pendientes en el Área + rango elegidos (selector Individual).
interface PendienteOption { key: string; nombre: string; areaNombre: string; registrado: boolean; }
type StepUpdater = (key: string, status: StepStatus, detail?: string) => void;

interface ConciliacionRecord {
  id: string;
  // Consecutivo para el match contra caja (PN/CN + año + número), asignado
  // por la base de datos al registrar (ver migración 2026-10-07b).
  consecutivo: string | null;
  // PDF guardado en Google Drive al registrar la conciliación (null si no
  // se subió: sin carpeta configurada, sin sesión de Google o error).
  pdfDriveUrl: string | null;
  areaId: string | null;
  // % de comisión y tasa (USD por 1 CUP, solo filas Exterior) con que se
  // calculó; null en conciliaciones anteriores a la migración 2026-10-15.
  comisionPct: number | null;
  tasaCambio: number | null;
  fecha: string;
  establecimiento: string;
  fechaInicial: string;
  fechaFinal: string;
  area: string;
  ordenesEfectivo: number;
  cxcCU: number;
  ordenesTransfermovil: number;
  cxpTM: number;
  ordenesSaldoMandao: number;
  cxpSM: number;
  ordenesTarjeta: number;
  cxpUS: number;
  viaPago: string;
  moneda: 'CUP' | 'USD';
  responsable: string;
  conciliacion: string;
  estado: EstadoConciliacion;
  estadoPago: string | null;
  facturacion: string | null;
  descuento: number | null;
  nota: string | null;
  pagado: number | null;
  saldo: number | null;
  referencia: string | null;
  fechaPago: string | null;
  prioridad: string | null;
}

// El "riel" (subtipo) de una liquidación describe cómo Mandao le entrega
// el dinero al negocio — nada que ver con el método de pago que usó el
// cliente en la orden (confirmado con el usuario 2026-09-30, ver
// Instrucciones sección 6.4).
function describeSubtipo(subtipo: string): string {
  switch (subtipo) {
    case 'Transferencia': return 'Se le paga al negocio por transferencia bancaria.';
    case 'Efectivo': return 'Se le paga al negocio en efectivo, en persona (o por transferencia, según se acuerde) — no tiene relación con qué método de pago usó el cliente en sus órdenes.';
    case 'Exterior': return 'Se le paga al negocio por transferencia internacional, en USD.';
    default: return '';
  }
}

function emptyBucketSet(): Record<PaymentBucket, BucketBreakdown> {
  return {
    efectivo: { ordenes: 0, saldo: 0, monto: 0 },
    transfermovil: { ordenes: 0, saldo: 0, monto: 0 },
    saldomandao: { ordenes: 0, saldo: 0, monto: 0 },
    tarjeta: { ordenes: 0, saldo: 0, monto: 0 },
  };
}

// Arma 1 o 2 "Settlements" para un negocio a partir de TODAS sus órdenes
// del rango, según su Método de Pago registrado — ver comentario de
// cabecera del archivo para la fórmula exacta de cada método.
function buildSettlements(params: {
  negocioKey: string;
  negocioNombre: string;
  areaId: string;
  areaNombre: string;
  businessId: string | null;
  metodoPagoNegocio: string;
  ordenes: OrderRow[];
  commissionPercent: number;
  exchangeRateCup: number | null;
}): Array<Omit<Settlement, 'yaConciliado'>> {
  const full = computeBucketBreakdown(params.ordenes, params.commissionPercent);
  const metodo = normalizeCompact(params.metodoPagoNegocio);
  const metodoReconocido = ['transferencia', 'transferenciaefectivo', 'transferenciaexterior'].includes(metodo);

  const base = {
    sinTasa: false,
    negocioKey: params.negocioKey,
    negocioNombre: params.negocioNombre,
    areaId: params.areaId,
    areaNombre: params.areaNombre,
    businessId: params.businessId,
    metodoPagoNegocio: params.metodoPagoNegocio,
    metodoReconocido,
  };

  // 'Transferencia-Efectivo': dos filas, ambas en CUP.
  if (metodo === 'transferenciaefectivo') {
    const settlements: Array<Omit<Settlement, 'yaConciliado'>> = [];
    if (full.buckets.transfermovil.ordenes > 0) {
      const buckets = emptyBucketSet();
      buckets.transfermovil = full.buckets.transfermovil;
      settlements.push({
        ...base, key: `${params.negocioKey}|Transferencia`, subtipo: 'Transferencia', moneda: 'CUP',
        registrado: !!params.businessId, ordenesEnJuego: full.buckets.transfermovil.ordenes,
        buckets, sinClasificar: { ordenes: 0, saldo: 0, tipos: new Set() },
        totalCxC: 0, totalCxP: buckets.transfermovil.monto,
      });
    }
    const ordenesEfectivoRail = full.buckets.saldomandao.ordenes + full.buckets.tarjeta.ordenes + full.buckets.efectivo.ordenes;
    if (ordenesEfectivoRail > 0) {
      const buckets = emptyBucketSet();
      buckets.saldomandao = full.buckets.saldomandao;
      buckets.tarjeta = full.buckets.tarjeta;
      buckets.efectivo = full.buckets.efectivo;
      settlements.push({
        ...base, key: `${params.negocioKey}|Efectivo`, subtipo: 'Efectivo', moneda: 'CUP',
        registrado: !!params.businessId, ordenesEnJuego: ordenesEfectivoRail,
        buckets, sinClasificar: full.sinClasificar,
        totalCxC: buckets.efectivo.monto, totalCxP: buckets.saldomandao.monto + buckets.tarjeta.monto,
      });
    }
    return settlements;
  }

  // 'Transferencia-Exterior': dos filas — Transferencia en CUP, Exterior en USD.
  if (metodo === 'transferenciaexterior') {
    const settlements: Array<Omit<Settlement, 'yaConciliado'>> = [];
    const ordenesTransferenciaRail = full.buckets.transfermovil.ordenes + full.buckets.efectivo.ordenes;
    if (ordenesTransferenciaRail > 0) {
      const buckets = emptyBucketSet();
      buckets.transfermovil = full.buckets.transfermovil;
      buckets.efectivo = full.buckets.efectivo;
      settlements.push({
        ...base, key: `${params.negocioKey}|Transferencia`, subtipo: 'Transferencia', moneda: 'CUP',
        registrado: !!params.businessId, ordenesEnJuego: ordenesTransferenciaRail,
        buckets, sinClasificar: { ordenes: 0, saldo: 0, tipos: new Set() },
        totalCxC: buckets.efectivo.monto, totalCxP: buckets.transfermovil.monto,
      });
    }
    const ordenesExteriorRail = full.buckets.saldomandao.ordenes + full.buckets.tarjeta.ordenes;
    if (ordenesExteriorRail > 0) {
      // La tasa activa está en USD por 1 CUP (ej. 0.002): USD = CUP × tasa
      // (convención confirmada por el usuario 2026-10-01; antes era CUP ÷ tasa
      // con la tasa en CUP por USD). Sin tasa activa no se convierte: la fila
      // queda en CUP y bloqueada (antes usaba tasa 1 y mostraba CUP como USD).
      const sinTasa = !(params.exchangeRateCup && params.exchangeRateCup > 0);
      const rate = sinTasa ? 1 : params.exchangeRateCup!;
      const buckets = emptyBucketSet();
      // Saldo y CxP se convierten juntos: toda la fila queda en USD (antes el
      // saldo seguía en CUP pero se mostraba con la etiqueta USD).
      buckets.saldomandao = { ...full.buckets.saldomandao, saldo: full.buckets.saldomandao.saldo * rate, monto: full.buckets.saldomandao.monto * rate };
      buckets.tarjeta = { ...full.buckets.tarjeta, saldo: full.buckets.tarjeta.saldo * rate, monto: full.buckets.tarjeta.monto * rate };
      settlements.push({
        ...base, sinTasa, key: `${params.negocioKey}|Exterior`, subtipo: 'Exterior', moneda: sinTasa ? 'CUP' : 'USD',
        registrado: !!params.businessId, ordenesEnJuego: ordenesExteriorRail,
        buckets, sinClasificar: full.sinClasificar,
        totalCxC: 0, totalCxP: buckets.saldomandao.monto + buckets.tarjeta.monto,
      });
    }
    return settlements;
  }

  // 'Transferencia' (o método no reconocido, como respaldo): una sola
  // fila en CUP con los 4 baldes completos, igual que antes de esta
  // corrección.
  if (params.ordenes.length === 0) return [];
  return [{
    ...base, key: `${params.negocioKey}|Transferencia`, subtipo: 'Transferencia', moneda: 'CUP',
    registrado: !!params.businessId, ordenesEnJuego: params.ordenes.length,
    buckets: full.buckets, sinClasificar: full.sinClasificar,
    totalCxC: full.totalCxC, totalCxP: full.totalCxP,
  }];
}

const HISTORY_SELECT_BASE = 'conciliacion_id, area_id, fecha, establecimiento, fecha_inicial, fecha_final, area, ordenes_efectivo, cxc_cu, ordenes_transfermovil, cxp_tm, ordenes_saldo_mandao, cxp_sm, ordenes_tarjeta, cxp_us, via_pago, moneda, responsable, conciliacion, estado, estado_pago, facturacion, descuento, nota, pagado, saldo, referencia, fecha_pago, prioridad';
const HISTORY_SELECT = `${HISTORY_SELECT_BASE}, pdf_drive_url, consecutivo, comision_pct, tasa_cambio`;

function mapHistoryRow(r: any): ConciliacionRecord {
  return {
    pdfDriveUrl: r.pdf_drive_url || null,
    areaId: r.area_id || null,
    comisionPct: r.comision_pct !== null && r.comision_pct !== undefined ? Number(r.comision_pct) : null,
    tasaCambio: r.tasa_cambio !== null && r.tasa_cambio !== undefined ? Number(r.tasa_cambio) : null,
    consecutivo: r.consecutivo || null,
    id: r.conciliacion_id,
    fecha: r.fecha,
    establecimiento: r.establecimiento,
    fechaInicial: r.fecha_inicial,
    fechaFinal: r.fecha_final,
    area: r.area,
    ordenesEfectivo: r.ordenes_efectivo,
    cxcCU: Number(r.cxc_cu),
    ordenesTransfermovil: r.ordenes_transfermovil,
    cxpTM: Number(r.cxp_tm),
    ordenesSaldoMandao: r.ordenes_saldo_mandao,
    cxpSM: Number(r.cxp_sm),
    ordenesTarjeta: r.ordenes_tarjeta,
    cxpUS: Number(r.cxp_us),
    viaPago: r.via_pago || 'N/D',
    moneda: (r.moneda || 'CUP') as 'CUP' | 'USD',
    responsable: r.responsable,
    conciliacion: r.conciliacion,
    estado: r.estado || 'Nuevo',
    estadoPago: r.estado_pago,
    facturacion: r.facturacion,
    descuento: r.descuento !== null ? Number(r.descuento) : null,
    nota: r.nota,
    pagado: r.pagado !== null ? Number(r.pagado) : null,
    saldo: r.saldo !== null ? Number(r.saldo) : null,
    referencia: r.referencia,
    fechaPago: r.fecha_pago,
    prioridad: r.prioridad,

  };
}

// PDF: diseño "Reporte de conciliación" en src/lib/conciliacion/pdfConciliacionNegocio.ts.
const pdfFileNameNegocio = (rec: ConciliacionRecord) =>
  `${rec.consecutivo ? `${rec.consecutivo}-` : ''}conciliacion-${rec.establecimiento.replace(/[^a-z0-9]/gi, '-')}-${rec.viaPago}-${rec.fechaInicial}_${rec.fechaFinal}.pdf`;

// Histórico ordenado por consecutivo descendente (año y número, ej.
// PN260012 antes que CN260011 antes que PN250099). Las conciliaciones sin
// consecutivo (saldo 0) van al final, por fecha descendente.
function compareConsecutivoDesc(a: { consecutivo: string | null; fecha: string }, b: { consecutivo: string | null; fecha: string }): number {
  const num = (c: string | null) => (c ? Number(c.slice(2)) : -1); // AA + número
  const diff = num(b.consecutivo) - num(a.consecutivo);
  if (diff !== 0) return diff;
  if (a.consecutivo && b.consecutivo) return b.consecutivo.localeCompare(a.consecutivo);
  return b.fecha.localeCompare(a.fecha);
}

export function ConciliacionNegociosPage() {
  const { user } = useAuth();
  // Ejecutar/corregir Conciliaciones queda al mismo nivel que Importación
  // (Super Admin/Supervisor) — es un proceso que mueve dinero, no una
  // simple verificación de lectura (ver política "manage_conciliaciones").
  const canExecute = ROLE_CAN_IMPORT(user?.role || 'visitante');
  // Registrar negocios faltantes usa la misma política que Gestión de
  // Negocios (manage_businesses) — solo Super Admin puede insertar ahí.
  const canRegisterBusinesses = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [mode, setMode] = useState<'individual' | 'masiva'>('individual');
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedNegocioKey, setSelectedNegocioKey] = useState('');
  const [fechaInicio, setFechaInicio] = useState(() => toLocalISODate());
  const [fechaFin, setFechaFin] = useState(() => toLocalISODate());
  const [commissionPercent, setCommissionPercent] = useState(20);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);

  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Settlement[] | null>(null);
  const [registering, setRegistering] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  // Progreso paso a paso de Calcular y de Conciliar (ver ProcesoProgreso).
  const calcSteps = useProcessSteps();
  const concSteps = useProcessSteps();
  const [concModalOpen, setConcModalOpen] = useState(false);
  const [concResult, setConcResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Selector Individual: solo negocios pendientes en el Área + rango.
  const [pendientes, setPendientes] = useState<PendienteOption[] | null>(null);
  const [pendientesLoading, setPendientesLoading] = useState(false);
  const [pendientesError, setPendientesError] = useState<string | null>(null);
  const [pendientesVersion, setPendientesVersion] = useState(0);
  const pendientesReq = useRef(0);
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedMasivaKeys, setSelectedMasivaKeys] = useState<Record<string, boolean>>({});
  const [expandedMasivaKey, setExpandedMasivaKey] = useState<string | null>(null);

  // Historial
  const [history, setHistory] = useState<ConciliacionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [historyAreaFilter, setHistoryAreaFilter] = useState('');
  const [historyViaFilter, setHistoryViaFilter] = useState('');
  const [historyEstadoFilter, setHistoryEstadoFilter] = useState('');
  const [historyFechaInicio, setHistoryFechaInicio] = useState('');
  const [historyFechaFin, setHistoryFechaFin] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const loadAreas = async () => {
    const { data, error } = await supabase.from('areas').select('area_id, name, active').eq('active', true).order('name');
    if (error) { console.error('Error loading areas:', error.message); return; }
    setAreas((data || []).map(a => ({ id: a.area_id, nombre: a.name })));
  };

  const loadBusinesses = async () => {
    const { data, error } = await supabase.from('businesses').select('business_id, name, area_id, payment_method, active').eq('active', true).order('name');
    if (error) { console.error('Error loading businesses:', error.message); return; }
    setBusinesses((data || []).map(b => ({ id: b.business_id, nombre: b.name, areaId: b.area_id, metodoPago: b.payment_method || '' })));
  };

  const loadCommission = async () => {
    const { data, error } = await supabase.from('commission_settings').select('percentage').eq('entity_type', 'businesses').maybeSingle();
    if (error) { console.error('Error loading commission_settings:', error.message); return; }
    if (data) setCommissionPercent(Number(data.percentage));
  };

  // Tasa de cambio activa (Configuración -> Razón de Cambio) — usada solo
  // para negocios con Método de Pago "Transferencia-Exterior".
  const loadExchangeRate = async () => {
    const { data, error } = await supabase.from('exchange_rates').select('rate_cup').eq('active', true).maybeSingle();
    if (error) { console.error('Error loading exchange_rates:', error.message); return; }
    if (data) setExchangeRate(Number(data.rate_cup));
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    const query = (cols: string) => supabase
      .from('conciliaciones_businesses')
      .select(cols)
      .order('fecha', { ascending: false });
    let { data, error } = await query(HISTORY_SELECT);
    if (isMissingPdfColumn(error)) ({ data, error } = await query(HISTORY_SELECT_BASE));
    if (error) { console.error('Error loading conciliaciones_businesses:', error.message); setHistoryLoading(false); return; }
    setHistory((data || []).map(mapHistoryRow));
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadAreas();
    loadBusinesses();
    loadCommission();
    loadExchangeRate();
    loadHistory();
  }, []);

  const resetCalculo = () => {
    setResultados(null);
    setCalcError(null);
    setSelectedMasivaKeys({});
    setExpandedMasivaKey(null);
    calcSteps.reset();
  };

  // Calcula las liquidaciones de TODOS los negocios con órdenes en el Área
  // (o todas) y rango elegidos: agrupa por negocio+área, arma 1-2
  // "Settlements" por negocio según su Método de Pago (ver cabecera del
  // archivo) y resuelve contra businesses y conciliaciones_businesses. La
  // usan la Masiva, el selector de pendientes y el cálculo Individual.
  const computeSettlements = async (step: StepUpdater = () => {}): Promise<Settlement[]> => {
    // Órdenes del rango (paginadas: sin esto Supabase corta en 1000) y
    // conciliaciones previas del mismo rango exacto, en paralelo.
    const [data, existentes] = await Promise.all([
      trackStep(step, 'ordenes', fetchAllRows<any>((from, to) => {
        let q = supabase
          .from('dispatcher')
          .select('order_pk, order_id, delivery_date, driver, store, payment_type, product_amount, area_id')
          .gte('delivery_date', fechaInicio)
          .lte('delivery_date', fechaFin);
        if (selectedAreaId) q = q.eq('area_id', selectedAreaId);
        return q.order('order_pk').range(from, to);
      }), rows => `${rows.length.toLocaleString('es-VE')} órdenes en el rango`),
      trackStep(step, 'previas', fetchAllRows<any>((from, to) =>
        supabase
          .from('conciliaciones_businesses')
          .select('conciliacion_id, business_id, via_pago')
          .eq('fecha_inicial', fechaInicio)
          .eq('fecha_final', fechaFin)
          .order('conciliacion_id')
          .range(from, to)
      ), rows => (rows.length === 0 ? 'Ninguna registrada en este rango' : `${rows.length} ya registrada(s) en este rango`)),
    ]);

    step('calculo', 'running');
    // Duplicidad por business_id + rango + subtipo/via_pago (sección 6.4.3).
    const conciliados = new Set<string>(existentes.map((r: any) => `${r.business_id}|${r.via_pago}`));

    const groups = new Map<string, OrderRow[]>();
    data.forEach((r: any) => {
      const o: OrderRow = {
        orderPk: r.order_pk,
        orderId: r.order_id,
        deliveryDate: r.delivery_date,
        driver: r.driver || '',
        store: r.store || '',
        paymentType: r.payment_type || '',
        productAmount: Number(r.product_amount) || 0,
        areaId: r.area_id,
      };
      // Agrupar por negocio (normalizado) + área
      const key = `${normalizeEntityName(o.store)}|${o.areaId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    });

    const allSettlements: Settlement[] = [];
    for (const [key, ordenesGrupo] of groups.entries()) {
      const storeName = ordenesGrupo[0].store;
      const areaId = ordenesGrupo[0].areaId;
      const areaNombre = areas.find(a => a.id === areaId)?.nombre || 'N/A';
      const matchBusiness = businesses.find(b => normalizeEntityName(b.nombre) === normalizeEntityName(storeName) && b.areaId === areaId);

      const settlements = buildSettlements({
        negocioKey: key,
        negocioNombre: storeName,
        areaId,
        areaNombre,
        businessId: matchBusiness?.id || null,
        metodoPagoNegocio: matchBusiness?.metodoPago || '',
        ordenes: ordenesGrupo,
        commissionPercent,
        exchangeRateCup: exchangeRate,
      });
      for (const st of settlements) {
        const yaConciliado = !!matchBusiness && conciliados.has(`${matchBusiness.id}|${st.subtipo}`);
        allSettlements.push({ ...st, yaConciliado });
      }
    }

    allSettlements.sort((a, b) => a.negocioNombre.localeCompare(b.negocioNombre) || a.subtipo.localeCompare(b.subtipo));
    step('calculo', 'done', `${groups.size} negocio(s) · ${allSettlements.length} liquidación(es)`);
    return allSettlements;
  };

  // Lista de pendientes del selector Individual: se recalcula al cambiar
  // Área / fechas y después de registrar una conciliación.
  useEffect(() => {
    if (mode !== 'individual' || !fechaInicio || !fechaFin || fechaInicio > fechaFin) {
      pendientesReq.current++;
      setPendientes(null);
      setPendientesLoading(false);
      return;
    }
    const req = ++pendientesReq.current;
    setPendientesLoading(true);
    setPendientesError(null);
    const timer = setTimeout(async () => {
      try {
        const all = await computeSettlements();
        if (req !== pendientesReq.current) return;
        const porNegocio = new Map<string, PendienteOption>();
        all.forEach(st => {
          if (st.yaConciliado || st.ordenesEnJuego === 0 || porNegocio.has(st.negocioKey)) return;
          porNegocio.set(st.negocioKey, { key: st.negocioKey, nombre: st.negocioNombre, areaNombre: st.areaNombre, registrado: st.registrado });
        });
        const list = Array.from(porNegocio.values()).sort((a, b) => a.nombre.localeCompare(b.nombre) || a.areaNombre.localeCompare(b.areaNombre));
        setPendientes(list);
        setSelectedNegocioKey(prev => (list.some(x => x.key === prev) ? prev : ''));
      } catch (err: any) {
        if (req !== pendientesReq.current) return;
        setPendientes([]);
        setPendientesError('No se pudo cargar la lista de pendientes: ' + (err?.message || err));
      } finally {
        if (req === pendientesReq.current) setPendientesLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, selectedAreaId, fechaInicio, fechaFin, businesses, areas, commissionPercent, exchangeRate, pendientesVersion]);

  const handleCalcular = async () => {
    if (mode === 'individual' && !selectedNegocioKey) {
      setCalcError('Selecciona un Negocio.');
      return;
    }
    if (fechaInicio > fechaFin) {
      setCalcError('La Fecha Inicial no puede ser posterior a la Fecha Final.');
      return;
    }

    setCalculating(true);
    resetCalculo();
    calcSteps.start([
      { key: 'ordenes', label: 'Cargando órdenes del rango' },
      { key: 'previas', label: 'Verificando conciliaciones previas' },
      { key: 'calculo', label: 'Calculando liquidaciones por método de pago' },
      { key: 'resultado', label: mode === 'individual' ? 'Preparando el resultado del negocio' : 'Preparando la lista de pendientes' },
    ]);
    let failed = false;
    try {
      const all = await computeSettlements(calcSteps.update);
      calcSteps.update('resultado', 'running');
      if (mode === 'individual') {
        const propias = all.filter(st => st.negocioKey === selectedNegocioKey);
        if (propias.length === 0) {
          throw new Error('El negocio ya no tiene liquidaciones en este rango. Actualice la selección.');
        }
        setResultados(propias);
        const pend = propias.filter(st => !st.yaConciliado).length;
        calcSteps.update('resultado', 'done', `${propias.length} liquidación(es) · ${pend} pendiente(s)`);
      } else {
        setResultados(all);
        const preselect: Record<string, boolean> = {};
        all.forEach(st => {
          if (st.registrado && !st.yaConciliado && !st.sinTasa && st.ordenesEnJuego > 0) preselect[st.key] = true;
        });
        setSelectedMasivaKeys(preselect);
        const pend = all.filter(st => !st.yaConciliado).length;
        calcSteps.update('resultado', 'done', `${pend} liquidación(es) pendiente(s) · ${Object.keys(preselect).length} lista(s) para conciliar`);
      }
    } catch (err: any) {
      failed = true;
      console.error('Error calculando conciliación:', err);
      setCalcError('Error al calcular: ' + (err?.message || err));
    } finally {
      calcSteps.finish(failed);
      setCalculating(false);
    }
  };

  // RN 6.4.3: registra en 'businesses' los negocios encontrados en las
  // órdenes que todavía no existen en el catálogo, luego recalcula.
  const handleRegistrarFaltantes = async () => {
    if (!resultados) return;
    const faltantes = Array.from(new Map<string, Settlement>(resultados.filter(r => !r.registrado).map(r => [r.negocioKey, r])).values());
    if (faltantes.length === 0) return;
    setRegistering(true);
    try {
      const payload = faltantes.map(f => ({ name: f.negocioNombre, area_id: f.areaId, active: true }));
      const { error } = await supabase.from('businesses').insert(payload);
      if (error) throw error;
      await logAuditEvent('Conciliaciones', 'Negocios Registrados Automáticamente desde Conciliación', {
        cantidad: faltantes.length,
        negocios: faltantes.map(f => f.negocioNombre),
      });
      await loadBusinesses();
      setPendientesVersion(v => v + 1);
      await handleCalcular();
    } catch (err: any) {
      console.error('Error registrando negocios faltantes:', err);
      alert('Error al registrar negocios. Detalle: ' + (err?.message || err));
    } finally {
      setRegistering(false);
    }
  };

  // RN 6.4.2 (Instrucciones generales sección 3.3): los ya conciliados en
  // este rango se omiten por completo de la lista Masiva — solo se
  // muestran y procesan los pendientes (y los bloqueados por falta de
  // registro, que es una alerta distinta, no una duplicidad).
  const resultadosVisibles = useMemo(() => {
    if (!resultados) return null;
    if (mode === 'individual') return resultados;
    return resultados.filter(r => !r.yaConciliado);
  }, [resultados, mode]);

  // Resumen informativo por método de pago y moneda (ver ResumenMetodosPago).
  // Cada fila ya trae saldo y CxP en su moneda: en las filas "Exterior"
  // (USD) buildSettlements convierte ambos con la tasa activa.
  const resumenMasiva = useMemo(() => {
    if (!resultados || mode !== 'masiva') return null;
    const b = new ResumenBuilder();
    resultados.forEach(s => {
      // El saldo de las filas Exterior ya viene convertido a USD (buildSettlements).
      b.addBuckets(s.buckets, s.moneda);
      b.addSinClasificar(s.sinClasificar.ordenes, s.sinClasificar.saldo);
    });
    return b.build();
  }, [resultados, mode, exchangeRate]);

  const omitidosPorDuplicado = useMemo(() => {
    if (!resultados || mode !== 'masiva') return 0;
    return resultados.filter(r => r.yaConciliado).length;
  }, [resultados, mode]);

  const elegiblesParaConciliar = useMemo(() => {
    if (!resultadosVisibles) return [];
    if (mode === 'individual') {
      return resultadosVisibles.filter(r => r.registrado && !r.yaConciliado && !r.sinTasa && r.ordenesEnJuego > 0);
    }
    return resultadosVisibles.filter(r => selectedMasivaKeys[r.key] && r.registrado && !r.yaConciliado && !r.sinTasa && r.ordenesEnJuego > 0);
  }, [resultadosVisibles, mode, selectedMasivaKeys]);

  const handleConfirmConciliar = () => {
    if (elegiblesParaConciliar.length === 0) return;
    setConfirmOpen(true);
  };

  const handleConciliar = async () => {
    setConfirmOpen(false);
    setConciliando(true);
    setConcResult(null);
    setConcModalOpen(true);
    const total = elegiblesParaConciliar.length;
    concSteps.start([
      { key: 'registro', label: `Registrando ${total} conciliación(es)` },
      { key: 'drive', label: 'Generando PDF y guardándolo en Google Drive' },
      { key: 'historico', label: 'Actualizando histórico y pendientes' },
    ]);
    let failed = false;
    try {
      concSteps.update('registro', 'running');
      const { data: userData } = await supabase.auth.getUser();
      const { data: profileData } = await supabase.from('profiles').select('full_name').eq('id', userData?.user?.id).maybeSingle();
      const responsable = profileData?.full_name || userData?.user?.email || 'Usuario Mandao';
      const hoy = toLocalISODate();

      const rows = elegiblesParaConciliar.map(s => ({
        fecha: hoy,
        business_id: s.businessId,
        establecimiento: s.negocioNombre,
        fecha_inicial: fechaInicio,
        fecha_final: fechaFin,
        area_id: s.areaId,
        area: s.areaNombre,
        ordenes_efectivo: s.buckets.efectivo.ordenes,
        cxc_cu: s.buckets.efectivo.monto,
        ordenes_transfermovil: s.buckets.transfermovil.ordenes,
        cxp_tm: s.buckets.transfermovil.monto,
        ordenes_saldo_mandao: s.buckets.saldomandao.ordenes,
        cxp_sm: s.buckets.saldomandao.monto,
        ordenes_tarjeta: s.buckets.tarjeta.ordenes,
        cxp_us: s.buckets.tarjeta.monto,
        via_pago: s.subtipo,
        moneda: s.moneda,
        responsable,
        responsable_id: userData?.user?.id || null,
        conciliacion: `${s.negocioNombre} (${s.subtipo}) ${fechaInicio} - ${fechaFin}`,
        estado: 'Nuevo',
        comision_pct: commissionPercent,
        tasa_cambio: s.moneda === 'USD' ? exchangeRate : null,
      }));

      let { data: inserted, error } = await supabase.from('conciliaciones_businesses').insert(rows).select(HISTORY_SELECT);
      if (isMissingPdfColumn(error)) {
        // Migración 2026-10-15 sin correr: se registra sin % ni tasa (el PDF
        // usa entonces los valores vigentes en Configuración).
        const rowsBase = rows.map(({ comision_pct, tasa_cambio, ...rest }) => rest);
        ({ data: inserted, error } = await supabase.from('conciliaciones_businesses').insert(rowsBase).select(HISTORY_SELECT_BASE));
      }
      if (error) throw error;
      concSteps.update('registro', 'done', `${rows.length} conciliación(es) guardada(s)`);

      await logAuditEvent('Conciliaciones', mode === 'individual' ? 'Conciliación Individual Registrada' : 'Conciliación Masiva Registrada', {
        cantidadFilas: rows.length,
        rangoFechas: `${fechaInicio} - ${fechaFin}`,
        area: selectedAreaId ? areas.find(a => a.id === selectedAreaId)?.nombre : 'Todas',
      });

      // PDF de cada conciliación -> carpeta de Google Drive (Configuración -> Data).
      // Un fallo aquí no deshace las conciliaciones: queda como advertencia.
      concSteps.update('drive', 'running', 'Cargando el detalle de órdenes…');
      const registros = (inserted || []).map(mapHistoryRow);
      const ordenesPorConciliacion = await loadOrdenesNegocio(registros);
      const drive = await subirPdfsConciliacion({
        records: registros,
        table: 'conciliaciones_businesses',
        buildPdfBlob: async rec => (await buildPdfNegocio(rec, ordenesPorConciliacion.get(rec.id) || [], pdfDefaults)).output('blob'),
        fileName: pdfFileNameNegocio,
        displayName: rec => `${rec.establecimiento} (${rec.viaPago})`,
        onProgress: (done, tot) => concSteps.update('drive', 'running', `${done} de ${tot} PDF`),
      });
      const driveMsg = describeDriveResult(drive);
      concSteps.update('drive', drive.aviso || drive.fallidos.length > 0 ? 'warning' : 'done', driveMsg);

      concSteps.update('historico', 'running');
      resetCalculo();
      setSelectedNegocioKey('');
      setPendientesVersion(v => v + 1);
      await loadHistory();
      concSteps.update('historico', 'done');

      const enCero = elegiblesParaConciliar.filter(e => esSaldoCero(e.totalCxP, e.totalCxC)).length;
      setConcResult({
        ok: true,
        message: `Se registraron ${rows.length} conciliación(es) con éxito.`
          + (enCero > 0 ? `\n${enCero} liquidación(es) en 0 (no se paga ni se cobra) quedaron registradas sin consecutivo.` : ''),
      });
    } catch (err: any) {
      failed = true;
      console.error('Error al conciliar:', err);
      setConcResult({ ok: false, message: 'Error al conciliar. Detalle: ' + (err?.message || err) });
    } finally {
      concSteps.finish(failed);
      setConciliando(false);
    }
  };

  // % y tasa vigentes: solo se usan para conciliaciones registradas antes de
  // que se guardaran con cada fila (migración 2026-10-15).
  const pdfDefaults = { comisionPct: commissionPercent, tasaCambio: exchangeRate };

  // Reintento desde el histórico cuando el PDF no se pudo subir al conciliar.
  const handleSubirPdf = async (rec: ConciliacionRecord) => {
    setSubiendoId(rec.id);
    try {
      const ordenes = (await loadOrdenesNegocio([rec])).get(rec.id) || [];
      const drive = await subirPdfsConciliacion({
        records: [rec],
        table: 'conciliaciones_businesses',
        buildPdfBlob: async r => (await buildPdfNegocio(r, ordenes, pdfDefaults)).output('blob'),
        fileName: pdfFileNameNegocio,
        displayName: r => `${r.establecimiento} (${r.viaPago})`,
      });
      alert(describeDriveResult(drive));
      await loadHistory();
    } finally {
      setSubiendoId(null);
    }
  };

  // Si el PDF está en Google Drive se abre desde allí; si no, se genera al
  // momento a partir de la fila guardada y se abre en una pestaña nueva.
  const handleGenerarPDF = async (rec: ConciliacionRecord) => {
    if (rec.pdfDriveUrl) {
      window.open(rec.pdfDriveUrl, '_blank', 'noopener');
      return;
    }
    // La pestaña se abre antes del await para que el navegador no la bloquee.
    const win = window.open('', '_blank');
    try {
      const ordenes = (await loadOrdenesNegocio([rec])).get(rec.id) || [];
      const doc = await buildPdfNegocio(rec, ordenes, pdfDefaults);
      if (win) win.location.href = URL.createObjectURL(doc.output('blob'));
      else doc.save(pdfFileNameNegocio(rec));
    } catch (err: any) {
      win?.close();
      console.error('Error generando PDF:', err);
      alert('Error al generar el PDF: ' + (err?.message || err));
    }
  };

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return history.filter(r => {
      if (historyAreaFilter && r.area !== historyAreaFilter) return false;
      if (historyViaFilter && r.viaPago !== historyViaFilter) return false;
      if (historyEstadoFilter && r.estado !== historyEstadoFilter) return false;
      if (historyFechaInicio && r.fecha < historyFechaInicio) return false;
      if (historyFechaFin && r.fecha > historyFechaFin) return false;
      if (q) {
        const matches = r.establecimiento.toLowerCase().includes(q) || r.responsable.toLowerCase().includes(q) || r.conciliacion.toLowerCase().includes(q) || (r.consecutivo || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    }).sort(compareConsecutivoDesc);
  }, [history, historySearch, historyAreaFilter, historyViaFilter, historyEstadoFilter, historyFechaInicio, historyFechaFin]);
  const historyPag = usePagination(filteredHistory, 20, [history, historySearch, historyAreaFilter, historyViaFilter, historyEstadoFilter, historyFechaInicio, historyFechaFin]);

  const viasDisponibles = useMemo(() => Array.from(new Set(history.map(h => h.viaPago))).filter(Boolean), [history]);

  // Agrupa los settlements visibles por negocio para mostrar 1 o 2
  // "sub-filas" (Transferencia/Efectivo/Exterior) bajo el mismo negocio.
  const settlementsPorNegocio = useMemo<Settlement[][]>(() => {
    if (!resultadosVisibles) return [];
    const map = new Map<string, Settlement[]>();
    resultadosVisibles.forEach(s => {
      if (!map.has(s.negocioKey)) map.set(s.negocioKey, []);
      map.get(s.negocioKey)!.push(s);
    });
    return Array.from(map.values());
  }, [resultadosVisibles]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
          <GitMerge className="w-6 h-6 text-brand-ink" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Conciliación de Negocios</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Calcula el balance financiero de un negocio (o de todos los de un Área) a partir de sus órdenes
            ya importadas, según su Método de Pago registrado, y regístralo como conciliación oficial.
          </p>
        </div>
      </div>

      {/* Calculadora */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-5 space-y-5">
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('individual'); resetCalculo(); }}
            className={cn(
              'flex-1 h-10 rounded-md border text-sm font-bold transition-all',
              mode === 'individual' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
            )}
          >
            Individual
          </button>
          <button
            onClick={() => { setMode('masiva'); resetCalculo(); }}
            className={cn(
              'flex-1 h-10 rounded-md border text-sm font-bold transition-all',
              mode === 'masiva' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50'
            )}
          >
            Masiva
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Área</label>
            <select
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
              className="h-10 w-full px-3 text-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)]"
            >
              <option value="">Todas las Áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Fecha Inicial</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="h-10 w-full px-3 text-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Fecha Final</label>
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="h-10 w-full px-3 text-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] font-mono" />
          </div>

          {mode === 'individual' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text-muted)] flex items-center gap-1.5">
                Negocio pendiente
                {pendientesLoading && <Loader2 size={11} className="animate-spin" />}
              </label>
              <select
                value={selectedNegocioKey}
                onChange={(e) => setSelectedNegocioKey(e.target.value)}
                disabled={pendientesLoading || !pendientes || pendientes.length === 0}
                className="h-10 w-full px-3 text-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)]"
              >
                <option value="">
                  {pendientesLoading
                    ? 'Buscando pendientes…'
                    : !pendientes
                      ? 'Elija un rango de fechas válido'
                      : pendientes.length === 0
                        ? 'Sin negocios pendientes en el rango'
                        : `Seleccione… (${pendientes.length} pendientes)`}
                </option>
                {(pendientes || []).map(pn => (
                  <option key={pn.key} value={pn.key}>
                    {pn.nombre}{!selectedAreaId ? ` — ${pn.areaNombre}` : ''}{!pn.registrado ? ' (sin registrar)' : ''}
                  </option>
                ))}
              </select>
              {pendientesError && <span className="text-xs font-medium text-[var(--color-danger)]">{pendientesError}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--color-text-faint)] flex items-center gap-1.5">
            <Info size={12} />
            Comisión: <strong className="text-[var(--color-text-muted)]">{commissionPercent}%</strong> · Tasa de cambio activa: <strong className="text-[var(--color-text-muted)]">{exchangeRate ? `1 CUP = ${exchangeRate} USD` : 'No definida'}</strong> (Transferencia-Exterior)
          </p>
          <Button variant="brand" className="gap-2" onClick={handleCalcular} disabled={calculating || (mode === 'individual' && !selectedNegocioKey)}>
            {calculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
            Calcular
          </Button>
        </div>

        {calcError && (
          <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-bg)] p-3 rounded-[var(--radius-sm)]">{calcError}</div>
        )}
      </div>

      <ProcesoProgreso
        title={mode === 'individual' ? 'Cálculo de la conciliación individual' : 'Cálculo de la conciliación masiva'}
        steps={calcSteps.steps}
        elapsedMs={calcSteps.elapsedMs}
      />

      {/* Resultado: Individual — 1 o 2 tarjetas según el Método de Pago */}
      {mode === 'individual' && settlementsPorNegocio[0] && (
        <div className="space-y-4">
          {settlementsPorNegocio[0].map(function renderSettlementCard(s: Settlement) {
            return (
              <React.Fragment key={s.key}>
                <NegocioResultCard
                  calculo={s}
                  canRegisterBusinesses={canRegisterBusinesses}
                  registering={registering}
                  onRegistrar={() => { void handleRegistrarFaltantes(); }}
                />
              </React.Fragment>
            );
          })}
          {/* Un solo botón: registra de una vez todas las liquidaciones
              pendientes del negocio (CUP y USD), cada una con su consecutivo. */}
          {canExecute && (
            <Button
              variant="brand"
              className="w-full gap-2"
              onClick={handleConfirmConciliar}
              disabled={elegiblesParaConciliar.length === 0}
            >
              <CheckCircle2 size={16} />
              {elegiblesParaConciliar.length > 1
                ? `Conciliar ${elegiblesParaConciliar.map(e => `${e.subtipo} (${e.moneda})`).join(' + ')}`
                : 'Conciliar'}
            </Button>
          )}
        </div>
      )}

      {/* Resumen del período (todas las órdenes del rango, también las ya conciliadas) */}
      {resumenMasiva && mode === 'masiva' && (
        <ResumenMetodosPago
          filas={resumenMasiva}
          ventasLabel="Ventas"
          beneficioLabel="Beneficio Negocio"
          nota={`Todas las órdenes del rango${selectedAreaId ? '' : ' en todas las áreas'}, incluidas las ya conciliadas. Saldo Mandao y Tarjeta en USD corresponden a negocios con vía de pago Transferencia-Exterior; Transferencia-Efectivo se informa en CUP.`}
        />
      )}

      {/* Resultado: Masiva */}
      {resultadosVisibles && mode === 'masiva' && (
        <MasivaResultTable
          resultados={resultadosVisibles}
          omitidosPorDuplicado={omitidosPorDuplicado}
          selectedKeys={selectedMasivaKeys}
          setSelectedKeys={setSelectedMasivaKeys}
          expandedKey={expandedMasivaKey}
          setExpandedKey={setExpandedMasivaKey}
          canExecute={canExecute}
          canRegisterBusinesses={canRegisterBusinesses}
          registering={registering}
          onRegistrar={handleRegistrarFaltantes}
          onConciliar={handleConfirmConciliar}
          elegibles={elegiblesParaConciliar.length}
        />
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="¿Confirmar Conciliación?"
        message={`Se va${elegiblesParaConciliar.length === 1 ? '' : 'n'} a registrar ${elegiblesParaConciliar.length} conciliación(es) en la base de datos. Esta acción no se puede deshacer desde aquí.`}
        onConfirm={handleConciliar}
        onCancel={() => setConfirmOpen(false)}
        isDanger={false}
      />
      {concModalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4">
          <ProcesoProgreso
            title={conciliando ? 'Conciliación en proceso…' : 'Conciliación finalizada'}
            steps={concSteps.steps}
            elapsedMs={concSteps.elapsedMs}
            className="w-full max-w-lg shadow-2xl"
          >
            {concResult && (
              <div className="pt-3 border-t border-[var(--color-border)] space-y-3">
                <p className={cn('text-sm font-semibold whitespace-pre-line', concResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                  {concResult.message}
                </p>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setConcModalOpen(false)}>Cerrar</Button>
                </div>
              </div>
            )}
          </ProcesoProgreso>
        </div>
      )}

      {/* Historial */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Histórico de Conciliaciones ({filteredHistory.length})</h3>
          {/* Filtros: se acomodan en varias líneas según el ancho disponible. */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-[2_1_16rem] min-w-[14rem]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
              <input
                type="text"
                placeholder="Buscar por establecimiento, responsable, consecutivo..."
                aria-label="Buscar"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] pl-9"
              />
            </div>
            <select value={historyAreaFilter} onChange={(e) => setHistoryAreaFilter(e.target.value)} aria-label="Todas las Áreas" className="h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] flex-1 min-w-[10rem]">
              <option value="">Todas las Áreas</option>
              {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
            </select>
            <select value={historyViaFilter} onChange={(e) => setHistoryViaFilter(e.target.value)} aria-label="Todos los Rieles" className="h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] flex-1 min-w-[10rem]">
              <option value="">Todos los Rieles</option>
              {viasDisponibles.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={historyEstadoFilter} onChange={(e) => setHistoryEstadoFilter(e.target.value)} aria-label="Todos los Estados" className="h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] flex-1 min-w-[10rem]">
              <option value="">Todos los Estados</option>
              {ESTADO_CONCILIACION_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            {/* Fechas con su etiqueta; cada campo tiene un ancho mínimo propio
                para no desbordar (antes compartían una sola columna del grid). */}
            <label className="flex items-center gap-2 flex-1 min-w-[11rem]">
              <span className="text-xs font-medium text-[var(--color-text-muted)] shrink-0">Desde</span>
              <input type="date" value={historyFechaInicio} onChange={(e) => setHistoryFechaInicio(e.target.value)} className="h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] px-2 font-mono text-xs" />
            </label>
            <label className="flex items-center gap-2 flex-1 min-w-[11rem]">
              <span className="text-xs font-medium text-[var(--color-text-muted)] shrink-0">Hasta</span>
              <input type="date" value={historyFechaFin} onChange={(e) => setHistoryFechaFin(e.target.value)} className="h-9 w-full px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] px-2 font-mono text-xs" />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-[var(--color-border)]">
              <tr className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider">
                <th className="w-5 p-4"></th>
                <th className="p-4">Establecimiento</th>
                <th className="p-4">Período</th>
                <th className="p-4">Riel</th>
                <th className="p-4 text-right">Total</th>
                <th className="p-4">Estado</th>
                <th className="p-4">Conciliación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyLoading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="animate-spin mx-auto text-[var(--color-primary)]" /></td></tr>
              ) : filteredHistory.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-sm text-slate-400 font-bold">No hay conciliaciones registradas.</td></tr>
              ) : (
                historyPag.pageItems.map(r => {
                  const totalCxP = r.cxpTM + r.cxpSM + r.cxpUS;
                  const isExpanded = expandedHistoryId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="hover:bg-slate-50 cursor-pointer group" onClick={() => setExpandedHistoryId(isExpanded ? null : r.id)}>
                        <td className="p-4 text-center">{isExpanded ? <ChevronUp size={14} className="text-[var(--color-primary)]" /> : <ChevronDown size={14} className="text-slate-400" />}</td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-[var(--color-text)]">{r.establecimiento}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {r.consecutivo
                                ? <span className="font-bold text-slate-600">{r.consecutivo}</span>
                                : <span className="font-bold text-[var(--color-info)]" title="Liquidación en 0: no se paga ni se cobra">Sin consecutivo (saldo 0)</span>}
                              {' · '}{r.area}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-600">{formatDate(r.fechaInicial)} — {formatDate(r.fechaFinal)}</td>
                        <td className="p-4 text-xs font-semibold text-slate-600">{r.viaPago} <span className="text-[10px] text-slate-400">({r.moneda})</span></td>
                        <td className="p-4 text-right">
                          {totalCxP > r.cxcCU ? (
                            <span className="font-bold text-sm text-[var(--color-danger)] tabular-nums">Pagar {formatCurrency(totalCxP - r.cxcCU, r.moneda)}</span>
                          ) : r.cxcCU > totalCxP ? (
                            <span className="font-bold text-sm text-[var(--color-success)] tabular-nums">Cobrar {formatCurrency(r.cxcCU - totalCxP, r.moneda)}</span>
                          ) : (
                            <span className="font-bold text-sm text-slate-400 tabular-nums">{formatCurrency(0, r.moneda)}</span>
                          )}
                        </td>
                        <td className="p-4"><EstadoConciliacionBadge estado={r.estado} /></td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleGenerarPDF(r)}
                              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                              title={r.pdfDriveUrl ? 'Abrir PDF en Google Drive' : 'Generar/Descargar PDF'}
                            >
                              <FileText size={12} />
                              {r.conciliacion}
                            </button>
                            {!r.pdfDriveUrl && canExecute && (
                              <button
                                onClick={() => handleSubirPdf(r)}
                                disabled={subiendoId === r.id}
                                aria-label="Subir PDF a Google Drive"
                                title="El PDF no está en Google Drive: subirlo ahora"
                                className="p-1 text-slate-400 hover:text-[var(--color-primary)] disabled:opacity-50"
                              >
                                {subiendoId === r.id ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={7} className="p-5">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <FieldMini label="Responsable" value={r.responsable} />
                              <FieldMini label="Fecha de Conciliación" value={formatDate(r.fecha)} />
                              <FieldMini label="Órdenes Efectivo / CxC CU" value={`${r.ordenesEfectivo} / ${formatCurrency(r.cxcCU, r.moneda)}`} />
                              <FieldMini label="Órdenes Transfermóvil / CxP TM" value={`${r.ordenesTransfermovil} / ${formatCurrency(r.cxpTM, r.moneda)}`} />
                              <FieldMini label="Órdenes Saldo Mandao / CxP SM" value={`${r.ordenesSaldoMandao} / ${formatCurrency(r.cxpSM, r.moneda)}`} />
                              <FieldMini label="Órdenes Tarjeta / CxP US" value={`${r.ordenesTarjeta} / ${formatCurrency(r.cxpUS, r.moneda)}`} />
                              <FieldMini label="Facturación" value={r.facturacion || 'Pendiente'} />
                              <FieldMini label="Descuento" value={r.descuento !== null ? formatCurrency(r.descuento, r.moneda) : '—'} />
                              <FieldMini label="Nota" value={r.nota || '—'} />
                              <FieldMini label="Pagado" value={r.pagado !== null ? formatCurrency(r.pagado, r.moneda) : '—'} />
                              <FieldMini label="Saldo" value={r.saldo !== null ? formatCurrency(r.saldo, r.moneda) : '—'} />
                              <FieldMini label="Referencia" value={r.referencia || '—'} />
                              <FieldMini label="Fecha de Pago" value={r.fechaPago ? formatDate(r.fechaPago) : '—'} />
                              <FieldMini label="Prioridad" value={r.prioridad || '—'} />
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
        <Pagination {...historyPag} />
      </div>
    </div>
  );
}

function FieldMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}

// El nombre del balde de órdenes "Efectivo" (dispatcher.payment_type =
// Cash) NO es lo mismo que el riel de liquidación "Efectivo" del negocio
// (Método de Pago "Transferencia-Efectivo" — cómo Mandao le entrega el
// dinero: en persona/en mano, o por transferencia). Para no repetir la
// palabra "Efectivo" con dos significados distintos dentro de la misma
// tarjeta, el balde de órdenes se rotula aquí de forma más explícita
// (confirmado con el usuario 2026-09-30).
function BucketRow({ bucket, bucketKey, moneda }: { bucket: BucketBreakdown; bucketKey: PaymentBucket; moneda: 'CUP' | 'USD' }) {
  const isEfectivo = bucketKey === 'efectivo';
  const label = isEfectivo ? 'Efectivo (Cash del cliente)' : BUCKET_LABELS[bucketKey];
  if (bucket.ordenes === 0) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 last:border-0">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-[var(--color-text)]">{label}</span>
        <span className="text-[10px] text-slate-400">{bucket.ordenes} órdenes · Saldo {formatCurrency(bucket.saldo, isEfectivo ? 'CUP' : moneda)}</span>
      </div>
      <span className={cn('font-mono font-black text-sm tabular-nums', isEfectivo ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
        {isEfectivo ? 'CxC ' : 'CxP '}{formatCurrency(bucket.monto, moneda)}
      </span>
    </div>
  );
}

// Liquidación en 0 (CxP = CxC): no se paga ni se cobra y la base de datos
// no le asigna consecutivo (migración 2026-10-07c).
const esSaldoCero = (cxp: number, cxc: number) => Math.abs(cxp - cxc) < 0.005;

function NegocioResultCard({
  calculo, canRegisterBusinesses, registering, onRegistrar
}: {
  calculo: Settlement;
  canRegisterBusinesses: boolean;
  registering: boolean;
  onRegistrar: () => void;
}) {
  const sinOrdenes = calculo.ordenesEnJuego === 0;
  const totalCxP = calculo.totalCxP;
  const totalCxC = calculo.totalCxC;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-[var(--color-text)]">{calculo.negocioNombre} <span className="text-sm font-bold text-slate-400">· {calculo.subtipo}</span></h3>
          <p className="text-xs text-slate-500 mt-0.5">Área: {calculo.areaNombre} · Método de Pago: {calculo.metodoPagoNegocio || 'N/D'} · Moneda: {calculo.moneda}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 italic">{describeSubtipo(calculo.subtipo)}</p>
        </div>
        {calculo.yaConciliado && (
          <span className="text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">Ya conciliado en este rango</span>
        )}
      </div>

      {calculo.sinTasa && (
        <div role="alert" className="flex items-start gap-2 text-xs text-[var(--color-danger)] bg-[var(--color-danger-bg)] border border-red-200 p-3 rounded-md font-semibold">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>No hay Tasa de Cambio activa definida. La liquidación "Exterior" se paga en USD y no se puede convertir ni conciliar: defina y active una tasa en Configuración → Razón de Cambio y vuelva a calcular. Los montos se muestran sin convertir, en CUP.</span>
        </div>
      )}

      {!calculo.metodoReconocido && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-md">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>Método de Pago del negocio "{calculo.metodoPagoNegocio || '(vacío)'}" no reconocido — se usó la fórmula estándar de "Transferencia". Verifica el Método de Pago en Gestión de Negocios.</span>
        </div>
      )}

      {sinOrdenes ? (
        <div className="p-6 bg-slate-50 rounded-lg text-center text-sm text-slate-500 font-semibold flex flex-col items-center gap-2">
          <XCircle size={24} className="text-slate-300" />
          Este negocio no tiene órdenes registradas en el rango de fechas seleccionado.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            <BucketRow bucket={calculo.buckets.efectivo} bucketKey="efectivo" moneda={calculo.moneda} />
            <BucketRow bucket={calculo.buckets.transfermovil} bucketKey="transfermovil" moneda={calculo.moneda} />
            <BucketRow bucket={calculo.buckets.saldomandao} bucketKey="saldomandao" moneda={calculo.moneda} />
            <BucketRow bucket={calculo.buckets.tarjeta} bucketKey="tarjeta" moneda={calculo.moneda} />
          </div>

          {calculo.sinClasificar.ordenes > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-md">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{calculo.sinClasificar.ordenes} órdenes con método de pago no reconocido ({Array.from(calculo.sinClasificar.tipos).join(', ')}) no se incluyeron en ningún balde.</span>
            </div>
          )}

          {(totalCxP > totalCxC) && (
            <div className="bg-[var(--color-brand)] rounded-lg p-4 flex justify-between items-center">
              <span className="font-black text-xs uppercase text-[var(--color-brand-ink)]">Total a Pagar al Negocio ({calculo.moneda})</span>
              <span className="text-xl font-black text-[var(--color-brand-ink)]">{formatCurrency(totalCxP - totalCxC, calculo.moneda)}</span>
            </div>
          )}
          {(totalCxC > totalCxP) && (
            <div className="bg-[var(--color-brand)] rounded-lg p-4 flex justify-between items-center">
              <span className="font-black text-xs uppercase text-[var(--color-brand-ink)]">Total a Cobrar al Negocio ({calculo.moneda})</span>
              <span className="text-xl font-black text-[var(--color-brand-ink)]">{formatCurrency(totalCxC - totalCxP, calculo.moneda)}</span>
            </div>
          )}
          {esSaldoCero(totalCxP, totalCxC) && (
            <div role="status" className="flex items-start gap-2 text-xs text-[var(--color-info)] bg-[var(--color-info-bg)] border border-blue-200 p-3 rounded-md font-semibold">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>Liquidación en 0: no hay monto a pagar ni a cobrar al negocio. Se registra sin consecutivo.</span>
            </div>
          )}
        </>
      )}

      {!calculo.registrado && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
          <span className="text-xs text-red-800 font-semibold flex items-center gap-2"><AlertTriangle size={14} /> Este negocio no está registrado en el catálogo de Negocios.</span>
          {canRegisterBusinesses ? (
            <Button variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={onRegistrar} disabled={registering}>
              {registering ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              Registrar Negocio
            </Button>
          ) : (
            <span className="text-[10px] text-red-700 font-bold shrink-0">Requiere Super Admin</span>
          )}
        </div>
      )}

    </div>
  );
}

function MasivaResultTable({
  resultados, omitidosPorDuplicado, selectedKeys, setSelectedKeys, expandedKey, setExpandedKey,
  canExecute, canRegisterBusinesses, registering, onRegistrar, onConciliar, elegibles
}: {
  resultados: Settlement[];
  omitidosPorDuplicado: number;
  selectedKeys: Record<string, boolean>;
  setSelectedKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedKey: string | null;
  setExpandedKey: (k: string | null) => void;
  canExecute: boolean;
  canRegisterBusinesses: boolean;
  registering: boolean;
  onRegistrar: () => void;
  onConciliar: () => void;
  elegibles: number;
}) {
  const pag = usePagination(resultados, 25, [resultados]);
  const faltantes = new Set(resultados.filter(r => !r.registrado).map(r => r.negocioKey)).size;
  const sinTasa = resultados.filter(r => r.sinTasa).length;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[var(--color-text)]">Liquidaciones Pendientes por Conciliar ({resultados.length})</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {elegibles} listas para conciliar
            {omitidosPorDuplicado > 0 && ` · ${omitidosPorDuplicado} ya conciliada(s) en este rango, omitida(s) de esta lista`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {faltantes > 0 && (
            canRegisterBusinesses ? (
              <Button variant="outline" className="gap-2 h-9 text-xs" onClick={onRegistrar} disabled={registering}>
                {registering ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Registrar {faltantes} Negocio{faltantes === 1 ? '' : 's'} Faltante{faltantes === 1 ? '' : 's'}
              </Button>
            ) : (
              <span className="text-[10px] text-red-700 font-bold">{faltantes} negocio(s) sin registrar — requiere Super Admin</span>
            )
          )}
          {canExecute && (
            <Button variant="brand" className="gap-2 h-9 text-xs" onClick={onConciliar} disabled={elegibles === 0}>
              <CheckCircle2 size={14} />
              Conciliar Seleccionadas ({elegibles})
            </Button>
          )}
        </div>
      </div>

      {sinTasa > 0 && (
        <div role="alert" className="flex items-start gap-2 text-xs text-[var(--color-danger)] bg-[var(--color-danger-bg)] border-b border-red-200 p-3 font-semibold">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>No hay Tasa de Cambio activa definida: {sinTasa} liquidación(es) "Exterior" (USD) quedan bloqueadas. Defina y active una tasa en Configuración → Razón de Cambio y vuelva a calcular.</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-[var(--color-border)]">
            <tr className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider">
              <th className="w-10 p-3"></th>
              <th className="p-3">Negocio</th>
              <th className="p-3" title="Cómo se le entrega el dinero al negocio — no tiene relación con el método de pago de las órdenes">Riel</th>
              <th className="p-3">Área</th>
              <th className="p-3 text-right">Órdenes</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3">Estado</th>
              <th className="w-10 p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {resultados.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-400 font-bold">No hay liquidaciones pendientes por conciliar en este rango.</td></tr>
            ) : pag.pageItems.map(r => {
              const elegible = r.registrado && !r.yaConciliado && !r.sinTasa && r.ordenesEnJuego > 0;
              const isExpanded = expandedKey === r.key;
              return (
                <React.Fragment key={r.key}>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        disabled={!elegible}
                        checked={!!selectedKeys[r.key]}
                        onChange={(e) => setSelectedKeys(prev => ({ ...prev, [r.key]: e.target.checked }))}
                        className="rounded text-teal-600 disabled:opacity-30"
                      />
                    </td>
                    <td className="p-3 font-bold text-sm text-[var(--color-text)]">{r.negocioNombre}</td>
                    <td className="p-3 text-xs text-slate-500">{r.subtipo} <span className="text-[9px] text-slate-400">({r.moneda})</span></td>
                    <td className="p-3 text-xs text-slate-500">{r.areaNombre}</td>
                    <td className="p-3 text-right text-xs font-mono">{r.ordenesEnJuego}</td>
                    <td className="p-3 text-right text-xs font-mono font-bold">
                      {r.totalCxP > r.totalCxC ? formatCurrency(r.totalCxP - r.totalCxC, r.moneda) : r.totalCxC > r.totalCxP ? formatCurrency(r.totalCxC - r.totalCxP, r.moneda) : formatCurrency(0, r.moneda)}
                    </td>
                    <td className="p-3">
                      {r.ordenesEnJuego === 0 ? (
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Sin órdenes</span>
                      ) : !r.registrado ? (
                        <span className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1"><AlertTriangle size={11} /> Sin registrar</span>
                      ) : r.sinTasa ? (
                        <span className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1" title="No hay Tasa de Cambio activa — no se puede convertir a USD"><AlertTriangle size={11} /> Sin tasa</span>
                      ) : !r.metodoReconocido ? (
                        <span className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1"><AlertTriangle size={11} /> Método no reconocido</span>
                      ) : esSaldoCero(r.totalCxP, r.totalCxC) ? (
                        <span className="text-[10px] font-bold text-[var(--color-info)] uppercase flex items-center gap-1" title="No se paga ni se cobra: se registra sin consecutivo"><Info size={11} /> Saldo 0</span>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1"><CheckCircle2 size={11} /> Listo</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button onClick={() => setExpandedKey(isExpanded ? null : r.key)} className="p-1 text-slate-400 hover:text-slate-700">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={8} className="p-4">
                        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden max-w-xl">
                          <BucketRow bucket={r.buckets.efectivo} bucketKey="efectivo" moneda={r.moneda} />
                          <BucketRow bucket={r.buckets.transfermovil} bucketKey="transfermovil" moneda={r.moneda} />
                          <BucketRow bucket={r.buckets.saldomandao} bucketKey="saldomandao" moneda={r.moneda} />
                          <BucketRow bucket={r.buckets.tarjeta} bucketKey="tarjeta" moneda={r.moneda} />
                        </div>
                        {r.sinClasificar.ordenes > 0 && (
                          <p className="text-[11px] text-amber-700 mt-2">{r.sinClasificar.ordenes} órdenes con método de pago no reconocido: {Array.from(r.sinClasificar.tipos).join(', ')}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...pag} />
    </div>
  );
}
