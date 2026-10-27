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

// Los estados de la conciliación viven en estados.ts (2026-10-27).
export type { EstadoConciliacion } from './estados';
export { ESTADO_CONCILIACION_OPTIONS } from './estados';
