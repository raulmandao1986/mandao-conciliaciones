// src/lib/formatters.ts

export const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("es-VE", {
    style: "currency", currency, minimumFractionDigits: 2
  }).format(value);

export const formatQty = (value: number) =>
  new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 0, maximumFractionDigits: 2
  }).format(value);

export const formatDate = (date: Date | string) =>
  new Intl.DateTimeFormat("es-VE", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(new Date(date));

export const formatDatetime = (date: Date | string) =>
  new Intl.DateTimeFormat("es-VE", {
    dateStyle: "short", timeStyle: "short"
  }).format(new Date(date));

// Nuevo — para porcentajes consistentes
export const formatPercent = (value: number, decimals = 1) =>
  new Intl.NumberFormat("es-VE", {
    style: "percent", minimumFractionDigits: decimals, maximumFractionDigits: decimals
  }).format(value / 100);
