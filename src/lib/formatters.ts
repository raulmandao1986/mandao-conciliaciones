// src/lib/formatters.ts

export const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("es-VE", {
    style: "currency", currency, minimumFractionDigits: 2
  }).format(value);

export const formatQty = (value: number) =>
  new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 0, maximumFractionDigits: 2
  }).format(value);

// Fechas calendario ("YYYY-MM-DD", como las guarda la BD en columnas date):
// se formatean SIN convertirlas a Date. new Date("2026-09-01") es medianoche
// UTC, que en Cuba (UTC−4/−5) cae el 31/08 a las 20:00 y se mostraba un día
// antes (reportado por el usuario 2026-10-15).
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export const formatDate = (date: Date | string) => {
  if (typeof date === 'string') {
    const m = date.match(DATE_ONLY);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(new Date(date));
};

// Fecha calendario LOCAL como "YYYY-MM-DD". Usar en lugar de
// new Date().toISOString().split('T')[0], que da la fecha UTC: a partir de
// las 20:00 en Cuba devolvía el día siguiente.
export const toLocalISODate = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const formatDatetime = (date: Date | string) =>
  new Intl.DateTimeFormat("es-VE", {
    dateStyle: "short", timeStyle: "short"
  }).format(new Date(date));

// Nuevo — para porcentajes consistentes
export const formatPercent = (value: number, decimals = 1) =>
  new Intl.NumberFormat("es-VE", {
    style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(value / 100);
