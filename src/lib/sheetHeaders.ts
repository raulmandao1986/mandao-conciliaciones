// Ubicación de la fila de encabezados en una pestaña de Google Sheets.
//
// La pestaña "Disponibilidad" del Dispatcher no siempre tiene los
// encabezados solo en la fila 1: hay documentos con una segunda fila de
// encabezados (fila 2) y los datos empiezan en la fila 3 (reportado por el
// usuario 2026-10-01). Asumir siempre la fila 1 hacía que la fila 2 se
// verificara como un registro (incidencias críticas con valores como
// "Fecha de la disponibilidad") y, si las dos filas de encabezados no
// tienen las columnas en el mismo orden, que "Mensajero" se leyera de
// otra columna.

export function normalizeHeader(h: any): string {
  if (!h) return '';
  return String(h).toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Mapa encabezado normalizado -> índice de columna. Si un encabezado se
// repite, se queda con la PRIMERA columna (antes se quedaba con la última,
// y una columna duplicada más a la derecha "robaba" el valor).
export function buildHeaderMap(headersRow: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  (headersRow || []).forEach((val, idx) => {
    const normalized = normalizeHeader(val);
    if (normalized && map[normalized] === undefined) map[normalized] = idx;
  });
  return map;
}

function headerMatches(row: any[], expected: Set<string>): number {
  return (row || []).reduce((n: number, cell: any) => n + (expected.has(normalizeHeader(cell)) ? 1 : 0), 0);
}

export interface SheetHeaderInfo {
  headerIndex: number;          // índice 0-based de la fila de encabezados
  headerMap: Record<string, number>;
  firstDataRow: number;         // número de fila de la hoja (1-based) del primer dato
  // true si la fila (ya pasada la de encabezados) repite los encabezados
  isHeaderLike: (row: any[]) => boolean;
}

// Busca entre las primeras `maxScan` filas la ÚLTIMA que contenga al menos
// `minMatches` de los encabezados esperados; los datos empiezan en la
// siguiente. Si ninguna coincide, se asume la fila 1 (comportamiento previo).
export function locateHeaderRow(
  rows: any[][],
  expectedHeaders: string[],
  { maxScan = 5, minMatches = 2 }: { maxScan?: number; minMatches?: number } = {}
): SheetHeaderInfo {
  const expected = new Set(expectedHeaders.map(normalizeHeader).filter(Boolean));
  let headerIndex = 0;
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    if (headerMatches(rows[i], expected) >= minMatches) headerIndex = i;
  }
  return {
    headerIndex,
    headerMap: buildHeaderMap(rows[headerIndex] || []),
    firstDataRow: headerIndex + 2,
    isHeaderLike: (row: any[]) => headerMatches(row, expected) >= minMatches,
  };
}

// Encabezados conocidos de la pestaña "Disponibilidad" (los mismos nombres
// que leen las páginas de Verificación/Revisión).
export const DISPONIBILIDAD_HEADERS = [
  'Timestamp', 'Email Address', 'No. Orden', 'Fecha de la disponibilidad', 'Fecha',
  'Motivo', 'Area o persona que solicta la transportacion', 'Mensajero',
  'Monto a pagar', 'Provincias', 'Comentario',
];

// Letra de columna (0 -> A, 25 -> Z, 26 -> AA) para mensajes al usuario.
export function columnLetter(idx: number): string {
  let s = '';
  for (let n = idx + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
