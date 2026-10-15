// Motor de cálculo compartido entre Conciliación de Negocios y de
// Mensajeros (ver Instrucciones Conciliaciones Mandao.md secciones 6 y 7).
// Ambas entidades usan exactamente la misma regla de negocio para pasar
// de una lista de órdenes de `dispatcher` a los 4 baldes de CxC/CxP — lo
// único que cambia entre entidades es de dónde sale el nombre a comparar
// (dispatcher.store para Negocios, dispatcher.driver para Mensajeros) y
// el % de comisión vigente (commission_settings.entity_type).

export type PaymentBucket = 'efectivo' | 'transfermovil' | 'saldomandao' | 'tarjeta';

export const BUCKET_LABELS: Record<PaymentBucket, string> = {
  efectivo: 'Efectivo',
  transfermovil: 'Transfermóvil',
  saldomandao: 'Saldo Mandao',
  tarjeta: 'Tarjeta',
};

// Compacta el texto (sin tildes, minúsculas, sin espacios) para poder
// comparar "Transfermóvil" con "transfermovil", "Crédito o Débito" con
// "creditoodebito", etc.
export function normalizeCompact(str: any): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Nombre (negocio o mensajero) normalizado para emparejar el texto libre
// de dispatcher.store/driver contra el catálogo registrado (businesses.name
// / messengers.name).
export function normalizeEntityName(str: any): string {
  if (str === undefined || str === null) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// Catálogo real confirmado por el usuario (Configuración -> Métodos de
// Pago, los que aplican a Órdenes): Card, Cash, Crédito o Débito, Saldo
// Mandao, Transfermóvil, TropiPay Balance.
const PAYMENT_TYPE_BUCKET_MAP: Record<string, PaymentBucket> = {
  cash: 'efectivo',
  transfermovil: 'transfermovil',
  saldomandao: 'saldomandao',
  card: 'tarjeta',
  creditoodebito: 'tarjeta',
  tropipaybalance: 'tarjeta',
};

export function mapPaymentTypeToBucket(paymentType: string): PaymentBucket | null {
  return PAYMENT_TYPE_BUCKET_MAP[normalizeCompact(paymentType)] || null;
}

export interface BucketBreakdown {
  ordenes: number;
  saldo: number;
  monto: number; // CxC (Efectivo) o CxP (el resto)
}

export interface BucketCalculo {
  buckets: Record<PaymentBucket, BucketBreakdown>;
  sinClasificar: { ordenes: number; saldo: number; tipos: Set<string> };
  totalCxC: number;
  totalCxP: number;
}

function emptyBuckets(): Record<PaymentBucket, BucketBreakdown> {
  return {
    efectivo: { ordenes: 0, saldo: 0, monto: 0 },
    transfermovil: { ordenes: 0, saldo: 0, monto: 0 },
    saldomandao: { ordenes: 0, saldo: 0, monto: 0 },
    tarjeta: { ordenes: 0, saldo: 0, monto: 0 },
  };
}

// "Saldo" de una orden = product_amount en Negocios, sin ninguna resta
// (confirmado con el usuario 2026-09-24); en Mensajeros es delivery_charge
// (confirmado 2026-10-01) — el llamador lo pasa en `productAmount`. Efectivo se COBRA el % de comisión (CxC);
// el resto de baldes se PAGA el (100-%) restante (CxP).
export function computeBucketBreakdown(
  ordenes: { paymentType: string; productAmount: number }[],
  commissionPercent: number
): BucketCalculo {
  const buckets = emptyBuckets();
  const sinClasificar = { ordenes: 0, saldo: 0, tipos: new Set<string>() };

  ordenes.forEach(o => {
    const bucket = mapPaymentTypeToBucket(o.paymentType);
    if (!bucket) {
      sinClasificar.ordenes += 1;
      sinClasificar.saldo += o.productAmount;
      sinClasificar.tipos.add(o.paymentType || '(vacío)');
      return;
    }
    buckets[bucket].ordenes += 1;
    buckets[bucket].saldo += o.productAmount;
  });

  buckets.efectivo.monto = buckets.efectivo.saldo * (commissionPercent / 100);
  const cxpPercent = (100 - commissionPercent) / 100;
  buckets.transfermovil.monto = buckets.transfermovil.saldo * cxpPercent;
  buckets.saldomandao.monto = buckets.saldomandao.saldo * cxpPercent;
  buckets.tarjeta.monto = buckets.tarjeta.saldo * cxpPercent;

  return {
    buckets,
    sinClasificar,
    totalCxC: buckets.efectivo.monto,
    totalCxP: buckets.transfermovil.monto + buckets.saldomandao.monto + buckets.tarjeta.monto,
  };
}

// Ciclo de vida del campo `estado` en conciliaciones_businesses /
// conciliaciones_messengers (Instrucciones sección 6.5/7.5): Nuevo al
// registrarse, y luego Enviado/Aprobado/Incorrecto/Facturado a medida que
// avanza por procesos que todavía no se construyen (Facturación).
export type EstadoConciliacion = 'Nuevo' | 'Enviado' | 'Aprobado' | 'Incorrecto' | 'Facturado';

export const ESTADO_CONCILIACION_CONFIG: Record<EstadoConciliacion, { label: string; className: string }> = {
  Nuevo: { label: 'Nuevo', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  Enviado: { label: 'Enviado', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  Aprobado: { label: 'Aprobado', className: 'bg-teal-50 text-teal-700 border-teal-200' },
  Incorrecto: { label: 'Incorrecto', className: 'bg-red-50 text-red-700 border-red-200' },
  Facturado: { label: 'Facturado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

export const ESTADO_CONCILIACION_OPTIONS: EstadoConciliacion[] = ['Nuevo', 'Enviado', 'Aprobado', 'Incorrecto', 'Facturado'];
