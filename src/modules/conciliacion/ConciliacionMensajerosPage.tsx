import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, logAuditEvent } from '../../lib/supabase';
import { useAuth, ROLE_CAN_IMPORT, ROLE_CAN_MANAGE_CATALOGS } from '../../lib/auth';
import { formatCurrency, formatDate, toLocalISODate } from '../../lib/formatters';
// El dispatcher siempre registra los montos en CUP (confirmado por el usuario
// 2026-09-30) — mismo criterio que Conciliación de Negocios y Dispatcher.
const formatCUP = (value: number) => formatCurrency(value, 'CUP');
import { cn } from '../../lib/utils';
import { Button } from '../../design-system/primitives/Button';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';
import { Pagination, usePagination } from '../../design-system/patterns/Pagination';
import {
  PaymentBucket, BucketBreakdown, computeBucketBreakdown, normalizeEntityName,
  EstadoConciliacion, ESTADO_CONCILIACION_OPTIONS,
} from '../../lib/conciliacion/paymentBuckets';
import { fetchAllRows } from '../../lib/conciliacion/fetchAllRows';
import { EstadoConciliacionBadge } from '../../lib/conciliacion/EstadoBadge';
import { subirPdfsConciliacion, describeDriveResult, isMissingPdfColumn } from '../../lib/conciliacion/drivePdf';
import { ResumenMetodosPago, ResumenBuilder } from './ResumenMetodosPago';
import { ProcesoProgreso, useProcessSteps, trackStep, type StepStatus } from './ProcesoProgreso';
import {
  Send, Loader2, Search, Calculator, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, FileText, UserPlus, Info, UploadCloud
} from 'lucide-react';

// =====================================================================
// Conciliación de Mensajeros — ver Instrucciones Conciliaciones Mandao.md
// sección 7. Reutiliza el mismo motor de baldes CxC/CxP que Negocios
// (lib/conciliacion/paymentBuckets.ts), aplicado sobre dispatcher.driver
// en vez de dispatcher.store, más dos campos propios de Mensajeros:
//
// - `disponibilidades`: suma de availabilities.amount_to_pay del mismo
//   mensajero en el rango (dinero adicional que Mandao le debe).
// - `alquiler_mochila`: tarifa fija por tipo de mochila (Pequeña/Grande),
//   configurable en Configuración -> Comisión Mandao (tabla
//   backpack_rental_rates), aplicada según messengers.backpack_type del
//   mensajero y restada de Total por Pagar (confirmado por el usuario
//   2026-09-30).
// - `saldo_cup`: neto (Total por Pagar - Total por Cobrar), en CUP. Los
//   mensajeros siempre cobran y pagan en CUP (vías de pago "Efectivo" y
//   "Transferencia", confirmado por el usuario 2026-09-30), así que no hay
//   conversión con la tasa de cambio — antes se multiplicaba por la tasa
//   activa y el monto quedaba convertido dos veces.
// =====================================================================

interface OrderRow {
  orderPk: string;
  orderId: string;
  deliveryDate: string;
  driver: string;
  paymentType: string;
  // Monto que se concilia con el mensajero: "Delivery Charge" (no
  // "Product Amount" como en Negocios — confirmado por el usuario 2026-10-01).
  deliveryCharge: number;
  areaId: string;
}

interface MensajeroCalculo {
  key: string;
  mensajeroNombre: string;
  areaId: string;
  areaNombre: string;
  messengerId: string | null;
  viaPago: string;
  tipoMochila: string;
  registrado: boolean;
  yaConciliado: boolean;
  ordenes: OrderRow[];
  buckets: Record<PaymentBucket, BucketBreakdown>;
  sinClasificar: { ordenes: number; saldo: number; tipos: Set<string> };
  totalCxC: number;
  totalCxPBaldes: number;
  // Suma bruta de availabilities.amount_to_pay y % de descuento aplicado
  // (Configuración -> Comisión Mandao); `disponibilidades` es el neto.
  disponibilidadesBruto: number;
  descuentoDisponibilidad: number;
  disponibilidades: number;
  alquilerMochila: number;
  totalPorCobrar: number;
  totalPorPagar: number;
  saldoCup: number | null;
}

interface AreaOption { id: string; nombre: string; }
interface MessengerOption { id: string; nombre: string; areaId: string; viaPago: string; tipoMochila: string; }
// Mensajero pendiente de conciliar en el Área + rango elegidos (selector Individual).
interface PendienteOption { key: string; nombre: string; areaNombre: string; registrado: boolean; }
type StepUpdater = (key: string, status: StepStatus, detail?: string) => void;

interface ConciliacionRecord {
  id: string;
  // Consecutivo para el match contra caja (PN/CN/PM/CM + año + número), asignado
  // por la base de datos al registrar (ver migración 2026-10-07b).
  consecutivo: string | null;
  // PDF guardado en Google Drive al registrar la conciliación (null si no se subió).
  pdfDriveUrl: string | null;
  fecha: string;
  mensajero: string;
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
  tipoMochila: string;
  alquilerMochila: number;
  disponibilidades: number;
  totalOrdenes: number;
  totalPorCobrar: number;
  totalPorPagar: number;
  saldoCup: number | null;
  viaPago: string;
  responsable: string;
  conciliacion: string;
  estado: EstadoConciliacion;
  facturacion: string | null;
}

const HISTORY_SELECT_BASE = 'conciliacion_id, fecha, mensajero, fecha_inicial, fecha_final, area, ordenes_efectivo, cxc_cu, ordenes_transfermovil, cxp_tm, ordenes_saldo_mandao, cxp_sm, ordenes_tarjeta, cxp_us, tipo_mochila, alquiler_mochila, disponibilidades, total_ordenes, total_por_cobrar, total_por_pagar, saldo_cup, via_pago, responsable, conciliacion, estado, facturacion';
const HISTORY_SELECT = `${HISTORY_SELECT_BASE}, pdf_drive_url, consecutivo`;

function mapHistoryRow(r: any): ConciliacionRecord {
  return {
    pdfDriveUrl: r.pdf_drive_url || null,
    consecutivo: r.consecutivo || null,
    id: r.conciliacion_id,
    fecha: r.fecha,
    mensajero: r.mensajero,
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
    tipoMochila: r.tipo_mochila || 'N/D',
    alquilerMochila: Number(r.alquiler_mochila) || 0,
    disponibilidades: Number(r.disponibilidades) || 0,
    totalOrdenes: r.total_ordenes,
    totalPorCobrar: Number(r.total_por_cobrar),
    totalPorPagar: Number(r.total_por_pagar),
    saldoCup: r.saldo_cup !== null ? Number(r.saldo_cup) : null,
    viaPago: r.via_pago || 'N/D',
    responsable: r.responsable,
    conciliacion: r.conciliacion,
    estado: r.estado || 'Nuevo',
    facturacion: r.facturacion,

  };
}

// PDF de una conciliación a partir de los campos ya guardados: se sube a
// Google Drive al registrarla y se puede regenerar desde la BD.
async function buildPdfMensajero(rec: ConciliacionRecord) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.text(`Conciliación de Mensajero${rec.consecutivo ? ` · ${rec.consecutivo}` : ''}`, 14, 18);
  doc.setFontSize(10);
  doc.text(`Mensajero: ${rec.mensajero}`, 14, 26);
  doc.text(`Período: ${formatDate(rec.fechaInicial)} - ${formatDate(rec.fechaFinal)}`, 14, 32);
  doc.text(`Área: ${rec.area}   Responsable: ${rec.responsable}`, 14, 38);
  doc.text(`Vía de Pago: ${rec.viaPago}   Tipo de Mochila: ${rec.tipoMochila}`, 14, 44);

  autoTable(doc, {
    startY: 52,
    head: [['Concepto', 'Órdenes', 'Monto']],
    body: [
      ['Efectivo (CxC)', String(rec.ordenesEfectivo), formatCUP(rec.cxcCU)],
      ['Transfermóvil (CxP)', String(rec.ordenesTransfermovil), formatCUP(rec.cxpTM)],
      ['Saldo Mandao (CxP)', String(rec.ordenesSaldoMandao), formatCUP(rec.cxpSM)],
      ['Tarjeta (CxP)', String(rec.ordenesTarjeta), formatCUP(rec.cxpUS)],
      ['Disponibilidades', '—', formatCUP(rec.disponibilidades)],
      ['Alquiler Mochila', '—', formatCUP(rec.alquilerMochila)],
    ],
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 90;
  doc.setFontSize(11);
  if (rec.totalPorPagar > rec.totalPorCobrar) {
    doc.text(`Total a Pagar al Mensajero: ${formatCUP(rec.totalPorPagar - rec.totalPorCobrar)}`, 14, finalY + 10);
  } else if (rec.totalPorCobrar > rec.totalPorPagar) {
    doc.text(`Total a Cobrar al Mensajero: ${formatCUP(rec.totalPorCobrar - rec.totalPorPagar)}`, 14, finalY + 10);
  }
  if (rec.saldoCup !== null) {
    doc.text(`Saldo CUP: ${formatCUP(rec.saldoCup)}`, 14, finalY + 16);
  }

  return doc;
}

const pdfFileNameMensajero = (rec: ConciliacionRecord) =>
  `${rec.consecutivo ? `${rec.consecutivo}-` : ''}conciliacion-${rec.mensajero.replace(/[^a-z0-9]/gi, '-')}-${rec.fechaInicial}_${rec.fechaFinal}.pdf`;

// Liquidación en 0 (Total por Pagar = Total por Cobrar): no se paga ni se
// cobra y la base de datos no le asigna consecutivo (migración 2026-10-07c).
const esSaldoCero = (pagar: number, cobrar: number) => Math.abs(pagar - cobrar) < 0.005;

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

export function ConciliacionMensajerosPage() {
  const { user } = useAuth();
  const canExecute = ROLE_CAN_IMPORT(user?.role || 'visitante');
  const canRegisterMessengers = ROLE_CAN_MANAGE_CATALOGS(user?.role || 'visitante');

  const [mode, setMode] = useState<'individual' | 'masiva'>('individual');
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [messengers, setMessengers] = useState<MessengerOption[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedMensajeroKey, setSelectedMensajeroKey] = useState('');
  const [fechaInicio, setFechaInicio] = useState(() => toLocalISODate());
  const [fechaFin, setFechaFin] = useState(() => toLocalISODate());
  const [commissionPercent, setCommissionPercent] = useState(10);
  const [backpackRates, setBackpackRates] = useState<Record<string, number>>({});
  const [availabilityDiscount, setAvailabilityDiscount] = useState(0);

  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<MensajeroCalculo[] | null>(null);
  const [registering, setRegistering] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  // Progreso paso a paso de Calcular y de Conciliar (ver ProcesoProgreso).
  const calcSteps = useProcessSteps();
  const concSteps = useProcessSteps();
  const [concModalOpen, setConcModalOpen] = useState(false);
  const [concResult, setConcResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Selector Individual: solo mensajeros pendientes en el Área + rango.
  const [pendientes, setPendientes] = useState<PendienteOption[] | null>(null);
  const [pendientesLoading, setPendientesLoading] = useState(false);
  const [pendientesError, setPendientesError] = useState<string | null>(null);
  const [pendientesVersion, setPendientesVersion] = useState(0);
  const pendientesReq = useRef(0);
  const [subiendoId, setSubiendoId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedMasivaKeys, setSelectedMasivaKeys] = useState<Record<string, boolean>>({});
  const [expandedMasivaKey, setExpandedMasivaKey] = useState<string | null>(null);

  const [history, setHistory] = useState<ConciliacionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState('');
  const [historyAreaFilter, setHistoryAreaFilter] = useState('');
  const [historyEstadoFilter, setHistoryEstadoFilter] = useState('');
  const [historyFechaInicio, setHistoryFechaInicio] = useState('');
  const [historyFechaFin, setHistoryFechaFin] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const loadAreas = async () => {
    const { data, error } = await supabase.from('areas').select('area_id, name, active').eq('active', true).order('name');
    if (error) { console.error('Error loading areas:', error.message); return; }
    setAreas((data || []).map(a => ({ id: a.area_id, nombre: a.name })));
  };

  const loadMessengers = async () => {
    const { data, error } = await supabase.from('messengers').select('messenger_id, name, area_id, payment_method, backpack_type, active').eq('active', true).order('name');
    if (error) { console.error('Error loading messengers:', error.message); return; }
    setMessengers((data || []).map(m => ({ id: m.messenger_id, nombre: m.name, areaId: m.area_id, viaPago: m.payment_method || 'N/D', tipoMochila: m.backpack_type || 'N/D' })));
  };

  const loadCommission = async () => {
    const { data, error } = await supabase.from('commission_settings').select('percentage').eq('entity_type', 'messengers').maybeSingle();
    if (error) { console.error('Error loading commission_settings:', error.message); return; }
    if (data) setCommissionPercent(Number(data.percentage));
  };

  // Tarifa fija por tipo de mochila (Configuración -> Comisión Mandao ->
  // Alquiler de Mochila, sección 7.4), aplicada una vez por conciliación
  // según messengers.backpack_type del mensajero.
  const loadBackpackRates = async () => {
    const { data, error } = await supabase.from('backpack_rental_rates').select('backpack_type, rate');
    if (error) { console.error('Error loading backpack_rental_rates:', error.message); return; }
    const next: Record<string, number> = {};
    (data || []).forEach((r: any) => { next[r.backpack_type] = Number(r.rate) || 0; });
    setBackpackRates(next);
  };

  // % que se descuenta de las Disponibilidades (Configuración -> Comisión
  // Mandao -> Descuento de Disponibilidad). Sin fila configurada: 0%.
  const loadAvailabilityDiscount = async () => {
    const { data, error } = await supabase.from('availability_discount_settings').select('percentage').eq('entity_type', 'messengers').maybeSingle();
    if (error) { console.error('Error loading availability_discount_settings:', error.message); return; }
    if (data) setAvailabilityDiscount(Number(data.percentage) || 0);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    const query = (cols: string) => supabase
      .from('conciliaciones_messengers')
      .select(cols)
      .order('fecha', { ascending: false });
    let { data, error } = await query(HISTORY_SELECT);
    if (isMissingPdfColumn(error)) ({ data, error } = await query(HISTORY_SELECT_BASE));
    if (error) { console.error('Error loading conciliaciones_messengers:', error.message); setHistoryLoading(false); return; }
    setHistory((data || []).map(mapHistoryRow));
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadAreas();
    loadMessengers();
    loadCommission();
    loadBackpackRates();
    loadAvailabilityDiscount();
    loadHistory();
  }, []);

  const resetCalculo = () => {
    setResultados(null);
    setCalcError(null);
    setSelectedMasivaKeys({});
    setExpandedMasivaKey(null);
    calcSteps.reset();
  };

  // Calcula la conciliación de TODOS los mensajeros con órdenes en el Área
  // (o todas) y rango elegidos, agrupando por mensajero + área. La usan la
  // Masiva, el selector de pendientes y el cálculo Individual.
  const computeCalculos = async (step: StepUpdater = () => {}): Promise<MensajeroCalculo[]> => {
    // Las 3 consultas del rango se hacen una sola vez y en paralelo.
    const [data, existentes, disps] = await Promise.all([
      trackStep(step, 'ordenes', fetchAllRows<any>((from, to) => {
        let q = supabase
          .from('dispatcher')
          .select('order_pk, order_id, delivery_date, driver, payment_type, delivery_charge, area_id')
          .gte('delivery_date', fechaInicio)
          .lte('delivery_date', fechaFin);
        if (selectedAreaId) q = q.eq('area_id', selectedAreaId);
        return q.order('order_pk').range(from, to);
      }), rows => `${rows.length.toLocaleString('es-VE')} órdenes en el rango`),
      // Conciliaciones previas del mismo rango exacto (regla de duplicidad 7.4.1).
      trackStep(step, 'previas', fetchAllRows<any>((from, to) =>
        supabase
          .from('conciliaciones_messengers')
          .select('conciliacion_id, messenger_id')
          .eq('fecha_inicial', fechaInicio)
          .eq('fecha_final', fechaFin)
          .order('conciliacion_id')
          .range(from, to)
      ), rows => (rows.length === 0 ? 'Ninguna registrada en este rango' : `${rows.length} ya registrada(s) en este rango`)),
      // Disponibilidades del rango (sección 7.4), agrupadas por mensajero + Área.
      trackStep(step, 'disponibilidades', fetchAllRows<any>((from, to) => {
        let q = supabase
          .from('availabilities')
          .select('availability_id, amount_to_pay, messenger_name, area_id')
          .gte('availability_date', fechaInicio)
          .lte('availability_date', fechaFin);
        if (selectedAreaId) q = q.eq('area_id', selectedAreaId);
        return q.order('availability_id').range(from, to);
      }), rows => `${rows.length} registro(s) en el rango`),
    ]);

    step('calculo', 'running');
    const conciliados = new Set<string>(existentes.map((r: any) => r.messenger_id));
    const dispsPorMensajero = new Map<string, number>();
    disps.forEach((d: any) => {
      const k = `${normalizeEntityName(d.messenger_name)}|${d.area_id}`;
      dispsPorMensajero.set(k, (dispsPorMensajero.get(k) || 0) + (Number(d.amount_to_pay) || 0));
    });

    const groups = new Map<string, OrderRow[]>();
    data.forEach((r: any) => {
      const o: OrderRow = {
        orderPk: r.order_pk,
        orderId: r.order_id,
        deliveryDate: r.delivery_date,
        driver: r.driver || '',
        paymentType: r.payment_type || '',
        deliveryCharge: Number(r.delivery_charge) || 0,
        areaId: r.area_id,
      };
      const key = `${normalizeEntityName(o.driver)}|${o.areaId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    });

    const calculos: MensajeroCalculo[] = [];
    for (const [key, ordenesGrupo] of groups.entries()) {
      const driverName = ordenesGrupo[0].driver;
      const areaId = ordenesGrupo[0].areaId;
      const areaNombre = areas.find(a => a.id === areaId)?.nombre || 'N/A';
      const matchMessenger = messengers.find(m => normalizeEntityName(m.nombre) === normalizeEntityName(driverName) && m.areaId === areaId);
      const yaConciliado = !!matchMessenger && conciliados.has(matchMessenger.id);

      // Disponibilidades del mismo mensajero en el mismo rango y Área —
      // dinero adicional que Mandao le debe (sección 7.4). Se le descuenta
      // el % configurado; el neto es lo que se muestra y se suma a Total
      // por Pagar.
      const disponibilidadesBruto = driverName ? dispsPorMensajero.get(`${normalizeEntityName(driverName)}|${areaId}`) || 0 : 0;
      const disponibilidades = Math.round(disponibilidadesBruto * (1 - availabilityDiscount / 100) * 100) / 100;

      // El motor de baldes es el mismo de Negocios; el "saldo" de cada
      // orden de mensajero es su Delivery Charge.
      const calc = computeBucketBreakdown(
        ordenesGrupo.map(o => ({ paymentType: o.paymentType, productAmount: o.deliveryCharge })),
        commissionPercent
      );
      // Tarifa fija por tipo de mochila del mensajero (sección 7.4). Un
      // mensajero sin registrar en 'messengers' todavía no tiene tipo de
      // mochila conocido, así que no se le aplica ninguna tarifa.
      const tipoMochila = matchMessenger?.tipoMochila || 'N/D';
      const alquilerMochila = backpackRates[tipoMochila] ?? 0;
      const totalPorCobrar = calc.totalCxC;
      const totalPorPagar = calc.totalCxP + disponibilidades - alquilerMochila;
      const saldoCup = totalPorPagar - totalPorCobrar;

      calculos.push({
        key,
        mensajeroNombre: driverName,
        areaId,
        areaNombre,
        messengerId: matchMessenger?.id || null,
        viaPago: matchMessenger?.viaPago || 'N/D',
        tipoMochila,
        registrado: !!matchMessenger,
        yaConciliado,
        ordenes: ordenesGrupo,
        buckets: calc.buckets,
        sinClasificar: calc.sinClasificar,
        totalCxC: calc.totalCxC,
        totalCxPBaldes: calc.totalCxP,
        disponibilidades,
        disponibilidadesBruto,
        descuentoDisponibilidad: availabilityDiscount,
        alquilerMochila,
        totalPorCobrar,
        totalPorPagar,
        saldoCup,
      });
    }

    calculos.sort((a, b) => a.mensajeroNombre.localeCompare(b.mensajeroNombre) || a.areaNombre.localeCompare(b.areaNombre));
    step('calculo', 'done', `${calculos.length} mensajero(s)`);
    return calculos;
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
        const all = await computeCalculos();
        if (req !== pendientesReq.current) return;
        const list = all
          .filter(c => !c.yaConciliado && c.ordenes.length > 0)
          .map(c => ({ key: c.key, nombre: c.mensajeroNombre, areaNombre: c.areaNombre, registrado: c.registrado }));
        setPendientes(list);
        setSelectedMensajeroKey(prev => (list.some(x => x.key === prev) ? prev : ''));
      } catch (err: any) {
        if (req !== pendientesReq.current) return;
        setPendientes([]);
        setPendientesError('No se pudo cargar la lista de pendientes: ' + (err?.message || err));
      } finally {
        if (req === pendientesReq.current) setPendientesLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, selectedAreaId, fechaInicio, fechaFin, messengers, areas, commissionPercent, backpackRates, availabilityDiscount, pendientesVersion]);

  const handleCalcular = async () => {
    if (mode === 'individual' && !selectedMensajeroKey) {
      setCalcError('Selecciona un Mensajero.');
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
      { key: 'disponibilidades', label: 'Cargando disponibilidades' },
      { key: 'calculo', label: 'Calculando baldes, disponibilidades y mochila' },
      { key: 'resultado', label: mode === 'individual' ? 'Preparando el resultado del mensajero' : 'Preparando la lista de pendientes' },
    ]);
    let failed = false;
    try {
      const all = await computeCalculos(calcSteps.update);
      calcSteps.update('resultado', 'running');
      if (mode === 'individual') {
        const propio = all.find(c => c.key === selectedMensajeroKey);
        if (!propio) throw new Error('El mensajero ya no tiene órdenes en este rango. Actualice la selección.');
        setResultados([propio]);
        calcSteps.update('resultado', 'done', `${propio.ordenes.length} órdenes${propio.yaConciliado ? ' · ya conciliado' : ''}`);
      } else {
        setResultados(all);
        const preselect: Record<string, boolean> = {};
        all.forEach(c => {
          if (c.registrado && !c.yaConciliado && c.ordenes.length > 0) preselect[c.key] = true;
        });
        setSelectedMasivaKeys(preselect);
        const pend = all.filter(c => !c.yaConciliado).length;
        calcSteps.update('resultado', 'done', `${pend} pendiente(s) · ${Object.keys(preselect).length} listo(s) para conciliar`);
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

  const handleRegistrarFaltantes = async () => {
    if (!resultados) return;
    const faltantes = resultados.filter(r => !r.registrado);
    if (faltantes.length === 0) return;
    setRegistering(true);
    try {
      const payload = faltantes.map(f => ({ name: f.mensajeroNombre, area_id: f.areaId, active: true }));
      const { error } = await supabase.from('messengers').insert(payload);
      if (error) throw error;
      await logAuditEvent('Conciliaciones', 'Mensajeros Registrados Automáticamente desde Conciliación', {
        cantidad: faltantes.length,
        mensajeros: faltantes.map(f => f.mensajeroNombre),
      });
      await loadMessengers();
      setPendientesVersion(v => v + 1);
      await handleCalcular();
    } catch (err: any) {
      console.error('Error registrando mensajeros faltantes:', err);
      alert('Error al registrar mensajeros. Detalle: ' + (err?.message || err));
    } finally {
      setRegistering(false);
    }
  };

  const resultadosVisibles = useMemo(() => {
    if (!resultados) return null;
    if (mode === 'individual') return resultados;
    return resultados.filter(r => !r.yaConciliado);
  }, [resultados, mode]);

  // Resumen informativo por método de pago (sobre Delivery Charge, en CUP).
  const resumenMasiva = useMemo(() => {
    if (!resultados || mode !== 'masiva') return null;
    const b = new ResumenBuilder();
    resultados.forEach(c => {
      b.addBuckets(c.buckets, 'CUP');
      b.addSinClasificar(c.sinClasificar.ordenes, c.sinClasificar.saldo);
    });
    return {
      filas: b.build(),
      disponibilidades: resultados.reduce((sum, c) => sum + c.disponibilidades, 0),
      alquilerMochila: resultados.reduce((sum, c) => sum + c.alquilerMochila, 0),
    };
  }, [resultados, mode]);

  const omitidosPorDuplicado = useMemo(() => {
    if (!resultados || mode !== 'masiva') return 0;
    return resultados.filter(r => r.yaConciliado).length;
  }, [resultados, mode]);

  const elegiblesParaConciliar = useMemo(() => {
    if (!resultadosVisibles) return [];
    if (mode === 'individual') {
      return resultadosVisibles.filter(r => r.registrado && !r.yaConciliado && r.ordenes.length > 0);
    }
    return resultadosVisibles.filter(r => selectedMasivaKeys[r.key] && r.registrado && !r.yaConciliado && r.ordenes.length > 0);
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

      const rows = elegiblesParaConciliar.map(c => ({
        fecha: hoy,
        messenger_id: c.messengerId,
        mensajero: c.mensajeroNombre,
        fecha_inicial: fechaInicio,
        fecha_final: fechaFin,
        area_id: c.areaId,
        area: c.areaNombre,
        ordenes_efectivo: c.buckets.efectivo.ordenes,
        cxc_cu: c.buckets.efectivo.monto,
        ordenes_transfermovil: c.buckets.transfermovil.ordenes,
        cxp_tm: c.buckets.transfermovil.monto,
        ordenes_saldo_mandao: c.buckets.saldomandao.ordenes,
        cxp_sm: c.buckets.saldomandao.monto,
        ordenes_tarjeta: c.buckets.tarjeta.ordenes,
        cxp_us: c.buckets.tarjeta.monto,
        tipo_mochila: c.tipoMochila,
        alquiler_mochila: c.alquilerMochila,
        disponibilidades: c.disponibilidades,
        total_ordenes: c.ordenes.length,
        total_por_cobrar: c.totalPorCobrar,
        total_por_pagar: c.totalPorPagar,
        saldo_cup: c.saldoCup,
        via_pago: c.viaPago,
        responsable,
        responsable_id: userData?.user?.id || null,
        conciliacion: `${c.mensajeroNombre} ${fechaInicio} - ${fechaFin}`,
        estado: 'Nuevo',
      }));

      let { data: inserted, error } = await supabase.from('conciliaciones_messengers').insert(rows).select(HISTORY_SELECT);
      if (isMissingPdfColumn(error)) {
        ({ data: inserted, error } = await supabase.from('conciliaciones_messengers').insert(rows).select(HISTORY_SELECT_BASE));
      }
      if (error) throw error;
      concSteps.update('registro', 'done', `${rows.length} conciliación(es) guardada(s)`);

      await logAuditEvent('Conciliaciones', mode === 'individual' ? 'Conciliación Individual de Mensajero Registrada' : 'Conciliación Masiva de Mensajeros Registrada', {
        cantidadMensajeros: rows.length,
        rangoFechas: `${fechaInicio} - ${fechaFin}`,
        area: selectedAreaId ? areas.find(a => a.id === selectedAreaId)?.nombre : 'Todas',
      });

      // PDF de cada conciliación -> carpeta de Google Drive (Configuración -> Data).
      // Un fallo aquí no deshace las conciliaciones: queda como advertencia.
      concSteps.update('drive', 'running');
      const drive = await subirPdfsConciliacion({
        records: (inserted || []).map(mapHistoryRow),
        table: 'conciliaciones_messengers',
        buildPdfBlob: async rec => (await buildPdfMensajero(rec)).output('blob'),
        fileName: pdfFileNameMensajero,
        displayName: rec => rec.mensajero,
        onProgress: (done, tot) => concSteps.update('drive', 'running', `${done} de ${tot} PDF`),
      });
      concSteps.update('drive', drive.aviso || drive.fallidos.length > 0 ? 'warning' : 'done', describeDriveResult(drive));

      concSteps.update('historico', 'running');
      resetCalculo();
      setSelectedMensajeroKey('');
      setPendientesVersion(v => v + 1);
      await loadHistory();
      concSteps.update('historico', 'done');

      const enCero = elegiblesParaConciliar.filter(e => esSaldoCero(e.totalPorPagar, e.totalPorCobrar)).length;
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

  // Reintento desde el histórico cuando el PDF no se pudo subir al conciliar.
  const handleSubirPdf = async (rec: ConciliacionRecord) => {
    setSubiendoId(rec.id);
    try {
      const drive = await subirPdfsConciliacion({
        records: [rec],
        table: 'conciliaciones_messengers',
        buildPdfBlob: async r => (await buildPdfMensajero(r)).output('blob'),
        fileName: pdfFileNameMensajero,
        displayName: r => r.mensajero,
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
      const doc = await buildPdfMensajero(rec);
      if (win) win.location.href = URL.createObjectURL(doc.output('blob'));
      else doc.save(pdfFileNameMensajero(rec));
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
      if (historyEstadoFilter && r.estado !== historyEstadoFilter) return false;
      if (historyFechaInicio && r.fecha < historyFechaInicio) return false;
      if (historyFechaFin && r.fecha > historyFechaFin) return false;
      if (q) {
        const matches = r.mensajero.toLowerCase().includes(q) || r.responsable.toLowerCase().includes(q) || r.conciliacion.toLowerCase().includes(q) || (r.consecutivo || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    }).sort(compareConsecutivoDesc);
  }, [history, historySearch, historyAreaFilter, historyEstadoFilter, historyFechaInicio, historyFechaFin]);
  const historyPag = usePagination(filteredHistory, 20, [history, historySearch, historyAreaFilter, historyEstadoFilter, historyFechaInicio, historyFechaFin]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-brand-subtle rounded-xl border border-brand-active-border">
          <Send className="w-6 h-6 text-brand-ink" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Conciliación de Mensajeros</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Calcula el balance financiero de un mensajero (o de todos los de un Área) a partir de sus órdenes
            ya importadas, más sus Disponibilidades del mismo rango.
          </p>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-5 space-y-5">
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('individual'); resetCalculo(); }}
            className={cn('flex-1 h-10 rounded-md border text-sm font-bold transition-all', mode === 'individual' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50')}
          >
            Individual
          </button>
          <button
            onClick={() => { setMode('masiva'); resetCalculo(); }}
            className={cn('flex-1 h-10 rounded-md border text-sm font-bold transition-all', mode === 'masiva' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-gray-50')}
          >
            Masiva
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">Área</label>
            <select value={selectedAreaId} onChange={(e) => setSelectedAreaId(e.target.value)} className="h-10 w-full px-3 text-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)]">
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
                Mensajero pendiente
                {pendientesLoading && <Loader2 size={11} className="animate-spin" />}
              </label>
              <select
                value={selectedMensajeroKey}
                onChange={(e) => setSelectedMensajeroKey(e.target.value)}
                disabled={pendientesLoading || !pendientes || pendientes.length === 0}
                className="h-10 w-full px-3 text-sm bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] outline-none focus:border-[var(--color-primary)] disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-text-faint)]"
              >
                <option value="">
                  {pendientesLoading
                    ? 'Buscando pendientes…'
                    : !pendientes
                      ? 'Elija un rango de fechas válido'
                      : pendientes.length === 0
                        ? 'Sin mensajeros pendientes en el rango'
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
            Comisión Mandao vigente: <strong className="text-[var(--color-text-muted)]">{commissionPercent}%</strong> · Descuento Disponibilidad: <strong className="text-[var(--color-text-muted)]">{availabilityDiscount}%</strong> · Moneda: <strong className="text-[var(--color-text-muted)]">CUP</strong>
          </p>
          <Button variant="brand" className="gap-2" onClick={handleCalcular} disabled={calculating || (mode === 'individual' && !selectedMensajeroKey)}>
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

      {resultadosVisibles && mode === 'individual' && resultadosVisibles[0] && (
        <MensajeroResultCard
          calculo={resultadosVisibles[0]}
          canExecute={canExecute}
          canRegisterMessengers={canRegisterMessengers}
          registering={registering}
          onRegistrar={handleRegistrarFaltantes}
          onConciliar={handleConfirmConciliar}
        />
      )}

      {/* Resumen del período (todas las órdenes del rango, también las ya conciliadas) */}
      {resumenMasiva && mode === 'masiva' && (
        <ResumenMetodosPago
          filas={resumenMasiva.filas}
          ventasLabel="Monto Delivery"
          beneficioLabel="Beneficio Mensajero"
          nota={`Todas las órdenes del rango${selectedAreaId ? '' : ' en todas las áreas'}, incluidas las ya conciliadas. Montos en CUP sobre Delivery Charge.`}
          extra={
            <span className="tabular-nums">
              Disponibilidades (netas, −{availabilityDiscount}%): <strong>{formatCUP(resumenMasiva.disponibilidades)}</strong>
              {' · '}Alquiler de Mochila: <strong>{formatCUP(resumenMasiva.alquilerMochila)}</strong>
            </span>
          }
        />
      )}

      {resultadosVisibles && mode === 'masiva' && (
        <MasivaResultTable
          resultados={resultadosVisibles}
          omitidosPorDuplicado={omitidosPorDuplicado}
          selectedKeys={selectedMasivaKeys}
          setSelectedKeys={setSelectedMasivaKeys}
          expandedKey={expandedMasivaKey}
          setExpandedKey={setExpandedMasivaKey}
          canExecute={canExecute}
          canRegisterMessengers={canRegisterMessengers}
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

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Histórico de Conciliaciones ({filteredHistory.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--color-text-faint)]" />
              <input type="text" placeholder="Buscar por mensajero, responsable..." value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className="w-full h-9 pl-9 pr-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)]" />
            </div>
            <select value={historyAreaFilter} onChange={(e) => setHistoryAreaFilter(e.target.value)} className="h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none">
              <option value="">Todas las Áreas</option>
              {areas.map(a => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
            </select>
            <select value={historyEstadoFilter} onChange={(e) => setHistoryEstadoFilter(e.target.value)} className="h-9 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none">
              <option value="">Todos los Estados</option>
              {ESTADO_CONCILIACION_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" value={historyFechaInicio} onChange={(e) => setHistoryFechaInicio(e.target.value)} className="h-9 w-full px-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none font-mono" />
              <input type="date" value={historyFechaFin} onChange={(e) => setHistoryFechaFin(e.target.value)} className="h-9 w-full px-2 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-xs outline-none font-mono" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-[var(--color-border)]">
              <tr className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider">
                <th className="w-5 p-4"></th>
                <th className="p-4">Mensajero</th>
                <th className="p-4">Período</th>
                <th className="p-4">Vía de Pago</th>
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
                  const isExpanded = expandedHistoryId === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className="hover:bg-slate-50 cursor-pointer group" onClick={() => setExpandedHistoryId(isExpanded ? null : r.id)}>
                        <td className="p-4 text-center">{isExpanded ? <ChevronUp size={14} className="text-[var(--color-primary)]" /> : <ChevronDown size={14} className="text-slate-400" />}</td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-[var(--color-text)]">{r.mensajero}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {r.consecutivo
                                ? <span className="font-bold text-slate-600">{r.consecutivo}</span>
                                : <span className="font-bold text-[var(--color-info)]" title="Liquidación en 0: no se paga ni se cobra">Sin consecutivo (saldo 0)</span>}
                              {' · '}{r.area}
                            </span>
                          </div>
                        </td>
                        <td className="p-4 text-xs font-mono text-slate-600">{formatDate(r.fechaInicial)} — {formatDate(r.fechaFinal)}</td>
                        <td className="p-4 text-xs font-semibold text-slate-600">{r.viaPago}</td>
                        <td className="p-4 text-right">
                          {r.totalPorPagar > r.totalPorCobrar ? (
                            <span className="font-bold text-sm text-[var(--color-danger)] tabular-nums">Pagar {formatCUP(r.totalPorPagar - r.totalPorCobrar)}</span>
                          ) : r.totalPorCobrar > r.totalPorPagar ? (
                            <span className="font-bold text-sm text-[var(--color-success)] tabular-nums">Cobrar {formatCUP(r.totalPorCobrar - r.totalPorPagar)}</span>
                          ) : (
                            <span className="font-bold text-sm text-slate-400 tabular-nums">{formatCUP(0)}</span>
                          )}
                        </td>
                        <td className="p-4"><EstadoConciliacionBadge estado={r.estado} /></td>
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleGenerarPDF(r)} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1" title={r.pdfDriveUrl ? 'Abrir PDF en Google Drive' : 'Generar/Descargar PDF'}>
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
                              <FieldMini label="Tipo de Mochila" value={r.tipoMochila} />
                              <FieldMini label="Total Órdenes" value={String(r.totalOrdenes)} />
                              <FieldMini label="Órdenes Efectivo / CxC CU" value={`${r.ordenesEfectivo} / ${formatCUP(r.cxcCU)}`} />
                              <FieldMini label="Órdenes Transfermóvil / CxP TM" value={`${r.ordenesTransfermovil} / ${formatCUP(r.cxpTM)}`} />
                              <FieldMini label="Órdenes Saldo Mandao / CxP SM" value={`${r.ordenesSaldoMandao} / ${formatCUP(r.cxpSM)}`} />
                              <FieldMini label="Órdenes Tarjeta / CxP US" value={`${r.ordenesTarjeta} / ${formatCUP(r.cxpUS)}`} />
                              <FieldMini label="Disponibilidades" value={formatCUP(r.disponibilidades)} />
                              <FieldMini label="Alquiler Mochila" value={formatCUP(r.alquilerMochila)} />
                              <FieldMini label="Saldo CUP" value={r.saldoCup !== null ? formatCUP(r.saldoCup) : '—'} />
                              <FieldMini label="Facturación" value={r.facturacion || 'Pendiente'} />
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

function BucketRow({ bucket, label }: { bucket: BucketBreakdown; label: string }) {
  const isEfectivo = label === 'Efectivo';
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 last:border-0">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-[var(--color-text)]">{label}</span>
        <span className="text-[10px] text-slate-400">{bucket.ordenes} órdenes · Saldo {formatCUP(bucket.saldo)}</span>
      </div>
      <span className={cn('font-mono font-black text-sm tabular-nums', isEfectivo ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
        {isEfectivo ? 'CxC ' : 'CxP '}{formatCUP(bucket.monto)}
      </span>
    </div>
  );
}

function MensajeroResultCard({
  calculo, canExecute, canRegisterMessengers, registering, onRegistrar, onConciliar
}: {
  calculo: MensajeroCalculo;
  canExecute: boolean;
  canRegisterMessengers: boolean;
  registering: boolean;
  onRegistrar: () => void;
  onConciliar: () => void;
}) {
  const sinOrdenes = calculo.ordenes.length === 0;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-[var(--color-text)]">{calculo.mensajeroNombre}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Área: {calculo.areaNombre} · Vía de Pago: {calculo.viaPago} · Mochila: {calculo.tipoMochila}</p>
        </div>
        {calculo.yaConciliado && (
          <span className="text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">Ya conciliado en este rango</span>
        )}
      </div>

      {sinOrdenes ? (
        <div className="p-6 bg-slate-50 rounded-lg text-center text-sm text-slate-500 font-semibold flex flex-col items-center gap-2">
          <XCircle size={24} className="text-slate-300" />
          Este mensajero no tiene órdenes registradas en el rango de fechas seleccionado.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            <BucketRow bucket={calculo.buckets.efectivo} label="Efectivo" />
            <BucketRow bucket={calculo.buckets.transfermovil} label="Transfermóvil" />
            <BucketRow bucket={calculo.buckets.saldomandao} label="Saldo Mandao" />
            <BucketRow bucket={calculo.buckets.tarjeta} label="Tarjeta" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="block text-[10px] font-bold uppercase text-slate-400">
                Disponibilidades{calculo.descuentoDisponibilidad > 0 ? ` (−${calculo.descuentoDisponibilidad}%)` : ''}
              </span>
              <span className="font-black text-[var(--color-success)]">{formatCUP(calculo.disponibilidades)}</span>
              {calculo.descuentoDisponibilidad > 0 && calculo.disponibilidadesBruto > 0 && (
                <span className="block text-[10px] text-slate-400 tabular-nums">Bruto {formatCUP(calculo.disponibilidadesBruto)}</span>
              )}
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="block text-[10px] font-bold uppercase text-slate-400">Alquiler Mochila ({calculo.tipoMochila})</span>
              <span className="font-black text-[var(--color-danger)]">{formatCUP(calculo.alquilerMochila)}</span>
            </div>
          </div>

          {calculo.sinClasificar.ordenes > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-md">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{calculo.sinClasificar.ordenes} órdenes con método de pago no reconocido ({Array.from(calculo.sinClasificar.tipos).join(', ')}) no se incluyeron en ningún balde.</span>
            </div>
          )}

          {(calculo.totalPorPagar > calculo.totalPorCobrar) && (
            <div className="bg-[var(--color-brand)] rounded-lg p-4 flex justify-between items-center">
              <span className="font-black text-xs uppercase text-[var(--color-brand-ink)]">Total a Pagar al Mensajero</span>
              <span className="text-xl font-black text-[var(--color-brand-ink)]">{formatCUP(calculo.totalPorPagar - calculo.totalPorCobrar)}</span>
            </div>
          )}
          {(calculo.totalPorCobrar > calculo.totalPorPagar) && (
            <div className="bg-[var(--color-brand)] rounded-lg p-4 flex justify-between items-center">
              <span className="font-black text-xs uppercase text-[var(--color-brand-ink)]">Total a Cobrar al Mensajero</span>
              <span className="text-xl font-black text-[var(--color-brand-ink)]">{formatCUP(calculo.totalPorCobrar - calculo.totalPorPagar)}</span>
            </div>
          )}
          {esSaldoCero(calculo.totalPorPagar, calculo.totalPorCobrar) && (
            <div role="status" className="flex items-start gap-2 text-xs text-[var(--color-info)] bg-[var(--color-info-bg)] border border-blue-200 p-3 rounded-md font-semibold">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>Liquidación en 0: no hay monto a pagar ni a cobrar al mensajero. Se registra sin consecutivo.</span>
            </div>
          )}
          {calculo.saldoCup !== null && (
            <p className="text-[11px] text-slate-500 text-right">Saldo CUP: <strong>{formatCUP(calculo.saldoCup)}</strong></p>
          )}
        </>
      )}

      {!calculo.registrado && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
          <span className="text-xs text-red-800 font-semibold flex items-center gap-2"><AlertTriangle size={14} /> Este mensajero no está registrado en el catálogo de Mensajeros.</span>
          {canRegisterMessengers ? (
            <Button variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={onRegistrar} disabled={registering}>
              {registering ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              Registrar Mensajero
            </Button>
          ) : (
            <span className="text-[10px] text-red-700 font-bold shrink-0">Requiere Super Admin</span>
          )}
        </div>
      )}

      {canExecute && (
        <Button variant="brand" className="w-full gap-2" onClick={onConciliar} disabled={sinOrdenes || calculo.yaConciliado || !calculo.registrado}>
          <CheckCircle2 size={16} />
          Conciliar
        </Button>
      )}
    </div>
  );
}

function MasivaResultTable({
  resultados, omitidosPorDuplicado, selectedKeys, setSelectedKeys, expandedKey, setExpandedKey,
  canExecute, canRegisterMessengers, registering, onRegistrar, onConciliar, elegibles
}: {
  resultados: MensajeroCalculo[];
  omitidosPorDuplicado: number;
  selectedKeys: Record<string, boolean>;
  setSelectedKeys: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  expandedKey: string | null;
  setExpandedKey: (k: string | null) => void;
  canExecute: boolean;
  canRegisterMessengers: boolean;
  registering: boolean;
  onRegistrar: () => void;
  onConciliar: () => void;
  elegibles: number;
}) {
  const pag = usePagination(resultados, 25, [resultados]);
  const faltantes = resultados.filter(r => !r.registrado).length;

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[var(--color-text)]">Mensajeros Pendientes por Conciliar ({resultados.length})</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {elegibles} listos para conciliar
            {omitidosPorDuplicado > 0 && ` · ${omitidosPorDuplicado} ya conciliado(s) en este rango, omitido(s) de esta lista`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {faltantes > 0 && (
            canRegisterMessengers ? (
              <Button variant="outline" className="gap-2 h-9 text-xs" onClick={onRegistrar} disabled={registering}>
                {registering ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Registrar {faltantes} Mensajero{faltantes === 1 ? '' : 's'} Faltante{faltantes === 1 ? '' : 's'}
              </Button>
            ) : (
              <span className="text-[10px] text-red-700 font-bold">{faltantes} mensajero(s) sin registrar — requiere Super Admin</span>
            )
          )}
          {canExecute && (
            <Button variant="brand" className="gap-2 h-9 text-xs" onClick={onConciliar} disabled={elegibles === 0}>
              <CheckCircle2 size={14} />
              Conciliar Seleccionados ({elegibles})
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-[var(--color-border)]">
            <tr className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-wider">
              <th className="w-10 p-3"></th>
              <th className="p-3">Mensajero</th>
              <th className="p-3">Área</th>
              <th className="p-3 text-right">Órdenes</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3">Estado</th>
              <th className="w-10 p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {resultados.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400 font-bold">No hay mensajeros pendientes por conciliar en este rango.</td></tr>
            ) : pag.pageItems.map(r => {
              const elegible = r.registrado && !r.yaConciliado && r.ordenes.length > 0;
              const isExpanded = expandedKey === r.key;
              return (
                <React.Fragment key={r.key}>
                  <tr className="hover:bg-slate-50">
                    <td className="p-3 text-center">
                      <input type="checkbox" disabled={!elegible} checked={!!selectedKeys[r.key]} onChange={(e) => setSelectedKeys(prev => ({ ...prev, [r.key]: e.target.checked }))} className="rounded text-teal-600 disabled:opacity-30" />
                    </td>
                    <td className="p-3 font-bold text-sm text-[var(--color-text)]">{r.mensajeroNombre}</td>
                    <td className="p-3 text-xs text-slate-500">{r.areaNombre}</td>
                    <td className="p-3 text-right text-xs font-mono">{r.ordenes.length}</td>
                    <td className="p-3 text-right text-xs font-mono font-bold">
                      {r.totalPorPagar > r.totalPorCobrar ? formatCUP(r.totalPorPagar - r.totalPorCobrar) : r.totalPorCobrar > r.totalPorPagar ? formatCUP(r.totalPorCobrar - r.totalPorPagar) : formatCUP(0)}
                    </td>
                    <td className="p-3">
                      {r.ordenes.length === 0 ? (
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Sin órdenes</span>
                      ) : !r.registrado ? (
                        <span className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1"><AlertTriangle size={11} /> Sin registrar</span>
                      ) : esSaldoCero(r.totalPorPagar, r.totalPorCobrar) ? (
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
                      <td colSpan={7} className="p-4">
                        <div className="rounded-xl border border-[var(--color-border)] overflow-hidden max-w-xl">
                          <BucketRow bucket={r.buckets.efectivo} label="Efectivo" />
                          <BucketRow bucket={r.buckets.transfermovil} label="Transfermóvil" />
                          <BucketRow bucket={r.buckets.saldomandao} label="Saldo Mandao" />
                          <BucketRow bucket={r.buckets.tarjeta} label="Tarjeta" />
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">Disponibilidades: {formatCUP(r.disponibilidades)} · Alquiler Mochila ({r.tipoMochila}): {formatCUP(r.alquilerMochila)}</p>
                        {r.sinClasificar.ordenes > 0 && (
                          <p className="text-[11px] text-amber-700 mt-1">{r.sinClasificar.ordenes} órdenes con método de pago no reconocido: {Array.from(r.sinClasificar.tipos).join(', ')}</p>
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
