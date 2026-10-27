// Utilidades compartidas por Conciliación de Negocios y de Mensajeros.
// La clasificación de órdenes por método de pago (antes una tabla fija
// Cash -> Efectivo, Card -> Tarjeta… en este archivo) vive desde 2026-10-27
// en el catálogo de Métodos de Pago: ver catalogoPagos.ts.

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
