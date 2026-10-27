import { supabase } from '../supabase';
import { loadDriveFolderId, getGoogleToken, uploadPdfToDrive, runWithConcurrency } from '../googleDrive';

// Genera y sube a Google Drive el PDF de cada conciliación recién
// registrada (o de una del histórico, al reintentar) y guarda el enlace en
// la fila. Las conciliaciones ya están guardadas cuando esto corre: un
// fallo de Drive no las deshace, solo deja el PDF pendiente de subir.

export interface DrivePdfResult {
  subidos: number;
  fallidos: { nombre: string; error: string }[];
  aviso: string | null; // motivo por el que no se intentó subir nada
}

export async function subirPdfsConciliacion<R extends { id: string }>({
  records,
  table,
  buildPdfBlob,
  fileName,
  displayName,
  onProgress,
}: {
  records: R[];
  table: 'conciliaciones_businesses' | 'conciliaciones_messengers';
  buildPdfBlob: (rec: R) => Promise<Blob>;
  fileName: (rec: R) => string;
  displayName: (rec: R) => string;
  onProgress?: (done: number, total: number) => void;
}): Promise<DrivePdfResult & { urls: Record<string, string> }> {
  const urls: Record<string, string> = {};
  if (records.length === 0) return { subidos: 0, fallidos: [], aviso: null, urls };

  // Carpeta propia de Negocios o de Mensajeros (Configuración -> Data).
  const entity = table === 'conciliaciones_businesses' ? 'negocios' : 'mensajeros';
  const folderId = await loadDriveFolderId(entity);
  if (!folderId) {
    return { subidos: 0, fallidos: [], urls, aviso: `No hay carpeta de Google Drive configurada para ${entity === 'negocios' ? 'Negocios' : 'Mensajeros'} (Configuración → Data): los PDF no se guardaron en Drive.` };
  }
  const token = getGoogleToken();
  if (!token) {
    return { subidos: 0, fallidos: [], urls, aviso: 'No hay sesión de Google activa: los PDF no se guardaron en Drive. Reconecte Google y use "Subir a Drive" en el histórico.' };
  }

  const fallidos: DrivePdfResult['fallidos'] = [];
  let done = 0;
  onProgress?.(0, records.length);
  await runWithConcurrency(records, 4, async rec => {
    try {
      const blob = await buildPdfBlob(rec);
      const up = await uploadPdfToDrive(blob, fileName(rec), folderId, token);
      const { error } = await supabase
        .from(table)
        .update({ pdf_drive_file_id: up.id, pdf_drive_url: up.webViewLink, updated_at: new Date().toISOString() })
        .eq('conciliacion_id', rec.id);
      if (error) throw new Error(`PDF subido, pero no se pudo guardar el enlace: ${error.message}`);
      urls[rec.id] = up.webViewLink;
    } catch (err: any) {
      fallidos.push({ nombre: displayName(rec), error: err?.message || String(err) });
    } finally {
      done += 1;
      onProgress?.(done, records.length);
    }
  });

  return { subidos: records.length - fallidos.length, fallidos, aviso: null, urls };
}

export function describeDriveResult(r: DrivePdfResult): string {
  if (r.aviso) return r.aviso;
  if (r.fallidos.length === 0) return `${r.subidos} PDF guardado(s) en Google Drive.`;
  const detalle = r.fallidos.slice(0, 3).map(f => `• ${f.nombre}: ${f.error}`).join('\n');
  const mas = r.fallidos.length > 3 ? `\n… y ${r.fallidos.length - 3} más.` : '';
  return `${r.subidos} PDF guardado(s) en Google Drive; ${r.fallidos.length} no se pudieron subir (reintente con "Subir a Drive" en el histórico):\n${detalle}${mas}`;
}

// Mientras no se corran las migraciones 2026-10-07 / 2026-10-07b / 2026-10-15
// las columnas pdf_drive_url / consecutivo / comision_pct / tasa_cambio no existen: el histórico y el
// registro reintentan sin ellas en vez de fallar.
export function isMissingPdfColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42703' || /pdf_drive_url|consecutivo|comision_pct|tasa_cambio|desglose/.test(error.message || ''));
}
