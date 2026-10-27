// Parser único y compartido para fechas provenientes de Google Sheets
// (Dispatcher, Disponibilidad). Antes existían ~5 copias ligeramente
// distintas de esta lógica (VerificationPage.tsx, RevisionPage.tsx,
// DisponibilidadVerificationPage.tsx, DisponibilidadRevisionPage.tsx,
// BulkImportModal.tsx) — una de ellas (RevisionPage.tsx) ni siquiera
// pasaba por un objeto Date, y todas menos esa recurrían a `new Date(str)`
// como último recurso para formatos no reconocidos, lo cual depende del
// motor/locale de JavaScript y puede interpretar "1/5/2026" como
// mes/día en vez de día/mes.
//
// CONFIRMADO POR EL USUARIO (2026-09-30): el formato real de las fechas
// del Dispatcher es día/mes/año (dd/mm/yyyy) — este es el único parser
// que debe usarse de ahora en adelante para leer "Delivery Date"/"Fecha"
// desde los Sheets. A diferencia de las versiones anteriores, esta NO
// cae en `new Date(str)` para strings no reconocidos: devuelve `null`
// explícito para que el llamador lo reporte como incidencia en vez de
// descartar la fila en silencio (esa era la causa real de que algunas
// órdenes no se importaran — quedaban fuera del rango sin ningún aviso).
export function parseSheetDate(raw: any): Date | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // dd/mm/yyyy, dd-mm-yyyy o dd.mm.yyyy, con hora opcional al final.
  const dmY = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmY) {
    const day = parseInt(dmY[1], 10);
    const month = parseInt(dmY[2], 10);
    const year = parseInt(dmY[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const hour = dmY[4] ? parseInt(dmY[4], 10) : 0;
      const minute = dmY[5] ? parseInt(dmY[5], 10) : 0;
      const second = dmY[6] ? parseInt(dmY[6], 10) : 0;
      return new Date(year, month - 1, day, hour, minute, second);
    }
  }

  // yyyy-mm-dd o yyyy/mm/dd (ISO-like), con hora opcional al final.
  const Ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (Ymd) {
    const year = parseInt(Ymd[1], 10);
    const month = parseInt(Ymd[2], 10);
    const day = parseInt(Ymd[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const hour = Ymd[4] ? parseInt(Ymd[4], 10) : 0;
      const minute = Ymd[5] ? parseInt(Ymd[5], 10) : 0;
      const second = Ymd[6] ? parseInt(Ymd[6], 10) : 0;
      return new Date(year, month - 1, day, hour, minute, second);
    }
  }

  // Número de serie de Google Sheets (días desde 1899-12-30) — puede
  // aparecer si la API devuelve el valor sin formatear para alguna fila
  // con el formato de celda distinto al resto de la columna.
  if (/^\d+(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    if (serial > 0 && serial < 100000) {
      const epochUtcMs = Date.UTC(1899, 11, 30);
      const d = new Date(epochUtcMs + serial * 86400000);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
  }

  return null;
}

export function formatDateToYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// '' (no null) en fallo — mismo contrato que las versiones anteriores,
// para poder comparar directo con inputs <input type="date"> (yyyy-mm-dd)
// sin manejar un caso null aparte.
export function normalizeSheetDateStr(raw: any): string {
  const parsed = parseSheetDate(raw);
  return parsed ? formatDateToYYYYMMDD(parsed) : '';
}
