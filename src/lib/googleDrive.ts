import { supabase } from './supabase';

// Subida de los PDF de Conciliación a una carpeta de Google Drive
// (configurada en Configuración -> Data, tabla app_settings). La hace el
// navegador con el token de Google de la sesión (scope `drive`, ver
// GOOGLE_SCOPES en supabase.ts): quien concilia debe tener acceso de
// edición a la carpeta.

// Una carpeta por tipo de conciliación (2026-10-15). La clave general es la
// que existía antes: se usa como respaldo si la específica no está definida.
export type DriveFolderEntity = 'negocios' | 'mensajeros';
export const DRIVE_FOLDER_SETTING_KEY = 'conciliaciones_drive_folder_id';
export const DRIVE_FOLDER_KEYS: Record<DriveFolderEntity, string> = {
  negocios: 'conciliaciones_drive_folder_negocios',
  mensajeros: 'conciliaciones_drive_folder_mensajeros',
};

// Acepta el ID o el enlace completo de la carpeta
// (https://drive.google.com/drive/folders/<ID>?usp=...).
export function parseDriveFolderId(input: string): string {
  const s = (input || '').trim();
  const fromUrl = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return fromUrl ? fromUrl[1] : s;
}

export function getGoogleToken(): string | null {
  return sessionStorage.getItem('google_access_token');
}

// Carpeta de un tipo de conciliación. `specific` es la definida para ese
// tipo; `effective` es la que se usa al subir (la específica o, si no
// hay, la general anterior).
export async function loadDriveFolder(entity: DriveFolderEntity): Promise<{ specific: string | null; effective: string | null }> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_key, value')
    .in('setting_key', [DRIVE_FOLDER_KEYS[entity], DRIVE_FOLDER_SETTING_KEY]);
  if (error) {
    console.error('Error loading app_settings:', error.message);
    return { specific: null, effective: null };
  }
  const get = (k: string) => (data || []).find((r: any) => r.setting_key === k)?.value || null;
  const specific = get(DRIVE_FOLDER_KEYS[entity]);
  return { specific, effective: specific || get(DRIVE_FOLDER_SETTING_KEY) };
}

export async function loadDriveFolderId(entity: DriveFolderEntity): Promise<string | null> {
  return (await loadDriveFolder(entity)).effective;
}

async function driveError(res: Response): Promise<Error> {
  let msg = '';
  try {
    const body = await res.json();
    msg = body?.error?.message || '';
  } catch {
    // respuesta sin JSON
  }
  if (res.status === 401) return new Error('La sesión de Google expiró. Use "Reconectar Google" y vuelva a intentarlo.');
  // API deshabilitada en el proyecto de Google Cloud del login (no es un
  // problema de permisos del usuario: lo resuelve quien administra el proyecto).
  if (/has not been used in project|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(msg)) {
    const project = msg.match(/project (\d+)/)?.[1];
    const url = `https://console.developers.google.com/apis/api/drive.googleapis.com/overview${project ? `?project=${project}` : ''}`;
    return new Error(`La Google Drive API no está habilitada en el proyecto de Google Cloud de la app${project ? ` (${project})` : ''}. Un administrador debe habilitarla en ${url} y, tras unos minutos, volver a "Probar acceso".`);
  }
  if (res.status === 403) return new Error(`Sin permiso en Google Drive${msg ? `: ${msg}` : ''}. Reconecte Google para aceptar el permiso de Drive y verifique que tiene acceso de edición a la carpeta.`);
  if (res.status === 404) return new Error('La carpeta de Drive no existe o no está compartida con su cuenta.');
  return new Error(msg || `Google Drive respondió ${res.status}.`);
}

export async function checkDriveFolder(folderId: string, token: string): Promise<{ name: string }> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,capabilities/canAddChildren&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw await driveError(res);
  const file = await res.json();
  if (file.mimeType !== 'application/vnd.google-apps.folder') throw new Error('El ID indicado no corresponde a una carpeta.');
  if (file.capabilities && file.capabilities.canAddChildren === false) {
    throw new Error(`Su cuenta no tiene permiso para agregar archivos en la carpeta "${file.name}".`);
  }
  return { name: file.name };
}

export async function uploadPdfToDrive(
  blob: Blob,
  fileName: string,
  folderId: string,
  token: string
): Promise<{ id: string; webViewLink: string }> {
  const metadata = { name: fileName, mimeType: 'application/pdf', parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
  );
  if (!res.ok) throw await driveError(res);
  return res.json();
}

// Ejecuta `tasks` con un máximo de `limit` en paralelo (para no saturar la
// API de Drive en una Conciliación Masiva con cientos de PDF).
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await task(items[i], i);
    }
  });
  await Promise.all(workers);
}
