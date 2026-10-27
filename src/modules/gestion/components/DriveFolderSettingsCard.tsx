import React, { useEffect, useState } from 'react';
import { FolderOpen, Loader2, Save, CheckCircle2, AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase, logAuditEvent, reconnectGoogle } from '../../../lib/supabase';
import { Button } from '../../../design-system/primitives/Button';
import {
  DRIVE_FOLDER_KEYS,
  parseDriveFolderId,
  loadDriveFolder,
  getGoogleToken,
  checkDriveFolder,
  type DriveFolderEntity,
} from '../../../lib/googleDrive';

const LABEL: Record<DriveFolderEntity, string> = { negocios: 'Negocios', mensajeros: 'Mensajeros' };

// Configuración -> Data: carpeta de Google Drive donde se guardan los PDF
// de cada Conciliación registrada — una para Negocios y otra para
// Mensajeros (2026-10-15). Ver src/lib/googleDrive.ts.
export function DriveFolderSettingsCard({ canWrite, entity }: { canWrite: boolean; entity: DriveFolderEntity }) {
  // folderId = carpeta que se usa al subir; usaRespaldo = todavía no hay una
  // propia de este tipo y se usa la carpeta general configurada antes.
  const [folderId, setFolderId] = useState<string | null>(null);
  const [usaRespaldo, setUsaRespaldo] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { specific, effective } = await loadDriveFolder(entity);
    setFolderId(effective);
    setUsaRespaldo(!specific && !!effective);
    setDraft(specific || '');
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runCheck = async (id: string) => {
    const token = getGoogleToken();
    if (!token) {
      setCheck({ ok: false, message: 'No hay sesión de Google activa. Use "Reconectar Google" para poder verificar y subir archivos a Drive.' });
      return false;
    }
    setChecking(true);
    try {
      const { name } = await checkDriveFolder(id, token);
      setCheck({ ok: true, message: `Acceso correcto a la carpeta "${name}".` });
      return true;
    } catch (err: any) {
      setCheck({ ok: false, message: err?.message || 'No se pudo acceder a la carpeta.' });
      return false;
    } finally {
      setChecking(false);
    }
  };

  // "Probar acceso" comprueba lo escrito en el campo (aunque no esté
  // guardado); con el campo vacío, la carpeta en uso. Antes probaba siempre
  // la carpeta en uso, que para un tipo sin carpeta propia es la general.
  const draftId = parseDriveFolderId(draft);
  const idAProbar = draftId || folderId;
  const sinGuardar = !!draftId && draftId !== (usaRespaldo ? null : folderId);

  const handleSave = async () => {
    const id = parseDriveFolderId(draft);
    if (!id) {
      setCheck({ ok: false, message: 'Indique el enlace o el ID de la carpeta.' });
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('app_settings').upsert({
        setting_key: DRIVE_FOLDER_KEYS[entity],
        value: id,
        updated_at: new Date().toISOString(),
        updated_by: userData?.user?.id ?? null,
      });
      if (error) throw error;
      await logAuditEvent('Configuraciones', `Carpeta de Drive para PDF de Conciliación de ${LABEL[entity]} Actualizada`, {
        anterior: folderId,
        nueva: id,
      });
      setFolderId(id);
      setUsaRespaldo(false);
      setDraft(id);
      await runCheck(id);
    } catch (err: any) {
      // PGRST205: la tabla app_settings no existe todavía en Supabase.
      const sinTabla = err?.code === 'PGRST205' || /app_settings/.test(err?.message || '');
      setCheck({
        ok: false,
        message: sinTabla
          ? 'Falta crear la tabla de ajustes en la base de datos: corra en el SQL Editor de Supabase la migración 2026-10-07_conciliaciones_pdf_google_drive.sql y vuelva a guardar.'
          : 'No se pudo guardar la carpeta: ' + (err?.message || err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <FolderOpen className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-bold text-[var(--color-text)]">PDF de Conciliaciones de {LABEL[entity]}</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-2xl">
            Carpeta de Google Drive donde se guarda el PDF de cada Conciliación de {LABEL[entity]} registrada. Quien
            concilia debe tener acceso de edición a la carpeta.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-10 animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-3)]" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[var(--color-text)]">Enlace o ID de la carpeta</span>
              <input
                type="text"
                value={draft}
                disabled={!canWrite}
                onChange={(e) => { setDraft(e.target.value); setCheck(null); }}
                placeholder="https://drive.google.com/drive/folders/…"
                className="h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm font-mono outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] transition-all disabled:bg-[var(--color-surface-2)]"
              />
            </label>
            {canWrite && (
              <Button variant="brand" className="gap-2" onClick={handleSave} disabled={saving || !draft.trim()}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => idAProbar && runCheck(idAProbar)} disabled={!idAProbar || checking}>
              {checking ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Probar acceso
            </Button>
          </div>

          {sinGuardar && (
            <p className="text-xs text-[var(--color-info)] font-semibold flex items-center gap-1">
              <AlertTriangle size={12} /> El enlace escrito todavía no está guardado: pulse Guardar para usarlo en las conciliaciones de {LABEL[entity]}.
            </p>
          )}
          {usaRespaldo && (
            <p className="text-xs text-[var(--color-warning)] font-semibold flex items-center gap-1">
              <AlertTriangle size={12} /> Aún no hay carpeta propia para {LABEL[entity]}: se usa la carpeta general configurada antes, compartida por ambos.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {folderId ? (
              <a
                href={`https://drive.google.com/drive/folders/${folderId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[var(--color-primary)] hover:underline"
              >
                <ExternalLink size={12} /> {usaRespaldo ? 'Abrir carpeta general (en uso)' : 'Abrir carpeta configurada'}
              </a>
            ) : (
              <span className="text-[var(--color-warning)] font-semibold inline-flex items-center gap-1">
                <AlertTriangle size={12} /> Sin carpeta configurada: los PDF no se guardan en Drive.
              </span>
            )}
            {!getGoogleToken() && (
              <button
                type="button"
                onClick={() => { void reconnectGoogle(); }}
                className="inline-flex items-center gap-1 font-semibold text-[var(--color-primary)] hover:underline"
              >
                <RefreshCw size={12} /> Reconectar Google
              </button>
            )}
          </div>

          {check && (
            <p
              role="status"
              className={check.ok
                ? 'text-xs font-medium text-[var(--color-success)] flex items-start gap-1.5'
                : 'text-xs font-medium text-[var(--color-danger)] flex items-start gap-1.5'}
            >
              <span className="shrink-0 mt-px">{check.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}</span>
              {/* Los enlaces del mensaje (ej. consola de Google Cloud) se muestran clicables. */}
              <span className="break-words">
                {check.message.split(/(https?:\/\/\S+)/).map((part, i) =>
                  /^https?:\/\//.test(part)
                    ? <a key={i} href={part} target="_blank" rel="noreferrer" className="underline font-semibold">{part}</a>
                    : <React.Fragment key={i}>{part}</React.Fragment>
                )}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
