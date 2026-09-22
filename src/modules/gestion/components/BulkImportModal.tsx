import React, { useState, useEffect } from 'react';
import { Loader2, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Upload } from 'lucide-react';
import { Button } from '../../../design-system/primitives/Button';
import { SlideOver } from '../../../design-system/primitives/SlideOver';
import { cn } from '../../../lib/utils';
import { supabase, logAuditEvent, reconnectGoogle } from '../../../lib/supabase';

type EntityType = 'businesses' | 'messengers';
type Step = 'source' | 'sheet' | 'preview' | 'done';

interface ImportSourceOption {
  id: string;
  nombre: string;
  spreadsheetId: string;
}

interface AreaOption {
  id: string;
  nombre: string;
}

interface PreviewRow {
  key: string; // nombre normalizado, usado para detectar duplicados dentro del mismo import
  nombre: string;
  areaNombre: string;
  areaId: string | null;
  isUpdate: boolean;
  matchedId?: string;
  payload: Record<string, any>;
}

const ENTITY_LABELS: Record<EntityType, string> = {
  businesses: 'Negocios',
  messengers: 'Mensajeros',
};

const DEFAULT_TAB_KEYWORD: Record<EntityType, string> = {
  businesses: 'negocios',
  messengers: 'mensajeros',
};

function normalizeHeader(h: string): string {
  if (!h) return '';
  return h.toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeName(s: string): string {
  return (s || '').trim().toLowerCase();
}

function isBloqueado(val: any): boolean {
  return String(val ?? '').trim().toLowerCase() === 'true';
}

// Acepta DD/MM/YYYY, D/M/YYYY o YYYY-MM-DD; cualquier otra cosa -> null
// (fecha vacía o no reconocida — no bloquea el import, solo queda sin
// completar ese campo, igual que hace VerificationPage con Dispatcher).
function parseSheetDate(val: any): string | null {
  const str = String(val ?? '').trim();
  if (!str) return null;
  const dmy = str.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function buildHeaderMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    if (norm && map[norm] === undefined) map[norm] = idx;
  });
  return map;
}

function getCell(row: any[], map: Record<string, number>, keys: string[]): string {
  for (const key of keys) {
    const idx = map[key];
    if (idx !== undefined && idx < row.length && row[idx] !== undefined && row[idx] !== null) {
      return String(row[idx]).trim();
    }
  }
  return '';
}

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: EntityType;
  areas: AreaOption[];
  onImported: () => void;
}

export function BulkImportModal({ isOpen, onClose, entityType, areas, onImported }: BulkImportModalProps) {
  const [step, setStep] = useState<Step>('source');
  const [loadingSources, setLoadingSources] = useState(false);
  const [sources, setSources] = useState<ImportSourceOption[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');

  const [loadingTabs, setLoadingTabs] = useState(false);
  const [tabs, setTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState('');

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [skippedNoName, setSkippedNoName] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; failed: number } | null>(null);

  const googleToken = sessionStorage.getItem('google_access_token');

  useEffect(() => {
    if (!isOpen) return;
    setStep('source');
    setSelectedSourceId('');
    setTabs([]);
    setSelectedTab('');
    setPreviewRows([]);
    setSkippedNoName(0);
    setErrorMsg(null);
    setImportResult(null);

    const loadSources = async () => {
      setLoadingSources(true);
      const { data, error } = await supabase
        .from('import_sources')
        .select('import_source_id, name, sheet_document_id')
        .eq('entity_type', entityType)
        .eq('active', true)
        .order('name', { ascending: true });
      if (error) {
        setErrorMsg('No se pudieron cargar los documentos registrados: ' + error.message);
      } else {
        const opts = (data || []).map(r => ({ id: r.import_source_id, nombre: r.name, spreadsheetId: r.sheet_document_id }));
        setSources(opts);
        if (opts.length === 1) setSelectedSourceId(opts[0].id);
      }
      setLoadingSources(false);
    };
    loadSources();
  }, [isOpen, entityType]);

  const handleConnectGoogle = async () => {
    try {
      await reconnectGoogle();
    } catch (err: any) {
      setErrorMsg('Error al conectar con Google: ' + err.message);
    }
  };

  const handleLoadTabs = async () => {
    const source = sources.find(s => s.id === selectedSourceId);
    if (!source) return;

    if (!googleToken) {
      setErrorMsg('Tu sesión de Google no tiene un token activo. Serás redirigido para reconectar — vuelve a intentar la importación al regresar.');
      await handleConnectGoogle();
      return;
    }

    setErrorMsg(null);
    setLoadingTabs(true);
    try {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}`, {
        headers: { Authorization: `Bearer ${googleToken}` },
      });
      if (!res.ok) {
        if (res.status === 401) {
          setErrorMsg('Sesión de Google expirada. Serás redirigido para reconectar — vuelve a intentar al regresar.');
          sessionStorage.removeItem('google_access_token');
          await handleConnectGoogle();
          return;
        }
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const meta = await res.json();
      const titles: string[] = (meta.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
      setTabs(titles);
      const keyword = DEFAULT_TAB_KEYWORD[entityType];
      const guess = titles.find(t => t.toLowerCase().includes(keyword)) || titles[0] || '';
      setSelectedTab(guess);
      setStep('sheet');
    } catch (err: any) {
      setErrorMsg('No se pudo leer el documento: ' + err.message);
    } finally {
      setLoadingTabs(false);
    }
  };

  const handleLoadPreview = async () => {
    const source = sources.find(s => s.id === selectedSourceId);
    if (!source || !selectedTab) return;

    setErrorMsg(null);
    setLoadingPreview(true);
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${source.spreadsheetId}/values/${encodeURIComponent(selectedTab)}!A:Z`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${googleToken}` } });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      const rows: any[][] = json.values || [];
      if (rows.length < 2) {
        throw new Error(`La pestaña "${selectedTab}" está vacía o no tiene filas de datos.`);
      }
      const headerMap = buildHeaderMap(rows[0]);
      const areaLookup = new Map(areas.map(a => [normalizeName(a.nombre), a.id]));

      // Existentes: para decidir insert vs update por nombre (evita duplicar
      // si la importación se corre más de una vez sobre el mismo catálogo).
      const table = entityType === 'businesses' ? 'businesses' : 'messengers';
      const { data: existingRows, error: existingErr } = await supabase.from(table).select('*');
      if (existingErr) throw new Error('No se pudo leer el catálogo actual: ' + existingErr.message);
      const existingByName = new Map<string, any>(
        (existingRows || []).map((r: any) => [normalizeName(r.name), r])
      );

      const seen = new Set<string>();
      const parsed: PreviewRow[] = [];
      let skipped = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const areaRaw = getCell(row, headerMap, ['area', 'provincia', 'zona']);
        const areaId = areaRaw ? (areaLookup.get(normalizeName(areaRaw)) || null) : null;
        const bloqueado = getCell(row, headerMap, ['bloqueado', 'blocked']);

        if (entityType === 'businesses') {
          const nombre = getCell(row, headerMap, ['negocios', 'negocio', 'name', 'nombre']);
          if (!nombre) { skipped++; continue; }
          const key = normalizeName(nombre);
          if (seen.has(key)) { skipped++; continue; }
          seen.add(key);

          const payload = {
            name: nombre,
            payment_method: getCell(row, headerMap, ['metododepago', 'viadepago', 'paymentmethod']) || null,
            active: !isBloqueado(bloqueado),
            area_id: areaId,
            contact_name: getCell(row, headerMap, ['contacto', 'contactname']) || null,
            phone: getCell(row, headerMap, ['telefono', 'phone']) || null,
            email: getCell(row, headerMap, ['correo', 'email']) || null,
            contract_name: getCell(row, headerMap, ['nombrecontrato', 'contractname']) || null,
            tax_id: getCell(row, headerMap, ['nit', 'taxid']) || null,
            address: getCell(row, headerMap, ['direccion', 'address']) || null,
          };
          const existing = existingByName.get(key);
          parsed.push({ key, nombre, areaNombre: areaRaw, areaId, isUpdate: !!existing, matchedId: existing?.business_id, payload });
        } else {
          const nombre = getCell(row, headerMap, ['mensajeros', 'mensajero', 'name', 'nombre']);
          if (!nombre) { skipped++; continue; }
          const key = normalizeName(nombre);
          if (seen.has(key)) { skipped++; continue; }
          seen.add(key);

          const payload = {
            name: nombre,
            ci: getCell(row, headerMap, ['ci']) || null,
            phone: getCell(row, headerMap, ['telefono', 'phone']) || null,
            fiscal_card: getCell(row, headerMap, ['tarjetafiscal', 'fiscalcard']) || null,
            fiscal_account: getCell(row, headerMap, ['cuentafiscal', 'fiscalaccount']) || null,
            backpack_type: getCell(row, headerMap, ['tipodemochila', 'backpacktype']) || 'Grande',
            payment_method: getCell(row, headerMap, ['viadepago', 'metododepago', 'paymentmethod']) || null,
            start_date: parseSheetDate(getCell(row, headerMap, ['fechaalta', 'startdate'])),
            end_date: parseSheetDate(getCell(row, headerMap, ['fechabaja', 'enddate'])),
            active: !isBloqueado(bloqueado),
            area_id: areaId,
            comments: getCell(row, headerMap, ['comentario', 'comentarios', 'comments']) || null,
          };
          const existing = existingByName.get(key);
          parsed.push({ key, nombre, areaNombre: areaRaw, areaId, isUpdate: !!existing, matchedId: existing?.messenger_id, payload });
        }
      }

      setPreviewRows(parsed);
      setSkippedNoName(skipped);
      setStep('preview');
    } catch (err: any) {
      setErrorMsg('No se pudo leer la pestaña: ' + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    setErrorMsg(null);
    let created = 0, updated = 0, failed = 0;

    const table = entityType === 'businesses' ? 'businesses' : 'messengers';
    const idColumn = entityType === 'businesses' ? 'business_id' : 'messenger_id';

    for (const row of previewRows) {
      try {
        if (row.isUpdate && row.matchedId) {
          const { error } = await supabase.from(table).update({ ...row.payload, updated_at: new Date().toISOString() }).eq(idColumn, row.matchedId);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase.from(table).insert(row.payload);
          if (error) throw error;
          created++;
        }
      } catch (err) {
        console.error('Error importando fila', row.nombre, err);
        failed++;
      }
    }

    setImportResult({ created, updated, failed });
    setImporting(false);
    setStep('done');

    try {
      await logAuditEvent(entityType === 'businesses' ? 'Gestion_Negocios' : 'Gestion_Mensajeros', 'Importación Masiva Ejecutada', {
        creados: created, actualizados: updated, fallidos: failed,
      });
    } catch (e) {
      console.error('Failed to write bulk import audit log:', e);
    }

    onImported();
  };

  const newCount = previewRows.filter(r => !r.isUpdate).length;
  const updateCount = previewRows.filter(r => r.isUpdate).length;
  const noAreaCount = previewRows.filter(r => r.areaNombre && !r.areaId).length;

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={`Importación Masiva — ${ENTITY_LABELS[entityType]}`}
      footer={
        <div className="flex gap-3">
          {step === 'source' && (
            <>
              <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button variant="brand" className="flex-1 gap-2" onClick={handleLoadTabs} disabled={!selectedSourceId || loadingTabs}>
                {loadingTabs ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Continuar
              </Button>
            </>
          )}
          {step === 'sheet' && (
            <>
              <Button variant="ghost" className="gap-2" onClick={() => setStep('source')}>
                <ArrowLeft size={16} /> Atrás
              </Button>
              <Button variant="brand" className="flex-1 gap-2" onClick={handleLoadPreview} disabled={!selectedTab || loadingPreview}>
                {loadingPreview ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Cargar Vista Previa
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="ghost" className="gap-2" onClick={() => setStep('sheet')} disabled={importing}>
                <ArrowLeft size={16} /> Atrás
              </Button>
              <Button variant="brand" className="flex-1 gap-2" onClick={handleConfirmImport} disabled={previewRows.length === 0 || importing}>
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {importing ? 'Importando…' : `Confirmar Importación (${previewRows.length})`}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button variant="brand" className="flex-1" onClick={onClose}>Cerrar</Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {errorMsg && (
          <div className="flex items-start gap-2 p-3 rounded-[var(--radius-sm)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-xs">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {step === 'source' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              Elige el documento de Google Sheet registrado en <strong>Configuración → Documentos de Importación</strong> que contiene el catálogo de {ENTITY_LABELS[entityType].toLowerCase()}.
            </p>
            {loadingSources ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" /></div>
            ) : sources.length === 0 ? (
              <div className="p-4 rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                No hay documentos activos registrados para {ENTITY_LABELS[entityType]}. Ve a <strong>Configuración → Documentos de Importación</strong> para registrar uno.
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--color-text)]">Documento</label>
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
                >
                  <option value="">-- Seleccionar documento --</option>
                  {sources.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {step === 'sheet' && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              Se detectaron estas pestañas en el documento. Selecciona la que contiene los datos de {ENTITY_LABELS[entityType].toLowerCase()}.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--color-text)]">Pestaña / Hoja</label>
              <select
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)] transition-all"
              >
                {tabs.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-[var(--radius-sm)] bg-emerald-50 border border-emerald-200 text-center">
                <p className="text-lg font-black text-emerald-700">{newCount}</p>
                <p className="text-[10px] font-bold text-emerald-700 uppercase">Nuevos</p>
              </div>
              <div className="p-3 rounded-[var(--radius-sm)] bg-indigo-50 border border-indigo-200 text-center">
                <p className="text-lg font-black text-indigo-700">{updateCount}</p>
                <p className="text-[10px] font-bold text-indigo-700 uppercase">Actualizar</p>
              </div>
              <div className="p-3 rounded-[var(--radius-sm)] bg-amber-50 border border-amber-200 text-center">
                <p className="text-lg font-black text-amber-700">{noAreaCount}</p>
                <p className="text-[10px] font-bold text-amber-700 uppercase">Sin Área</p>
              </div>
            </div>
            {skippedNoName > 0 && (
              <p className="text-[11px] text-[var(--color-text-faint)]">
                {skippedNoName} fila(s) se ignoraron por no tener nombre o estar duplicadas dentro del mismo documento.
              </p>
            )}
            <div className="border border-[var(--color-border)] rounded-[var(--radius-sm)] overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--color-surface-2)] sticky top-0">
                  <tr>
                    <th className="p-2 font-bold text-[var(--color-text-muted)]">Nombre</th>
                    <th className="p-2 font-bold text-[var(--color-text-muted)]">Área</th>
                    <th className="p-2 font-bold text-[var(--color-text-muted)]">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {previewRows.map(r => (
                    <tr key={r.key}>
                      <td className="p-2 font-semibold text-[var(--color-text)]">{r.nombre}</td>
                      <td className={cn("p-2", r.areaNombre && !r.areaId ? "text-amber-600 font-semibold" : "text-[var(--color-text-muted)]")}>
                        {r.areaNombre || '—'}{r.areaNombre && !r.areaId ? ' (no encontrada)' : ''}
                      </td>
                      <td className="p-2">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", r.isUpdate ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700")}>
                          {r.isUpdate ? 'Actualizar' : 'Nuevo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === 'done' && importResult && (
          <div className="flex flex-col items-center text-center py-6 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            <h3 className="text-base font-bold text-[var(--color-text)]">Importación completada</h3>
            <p className="text-sm text-[var(--color-text-muted)]">
              {importResult.created} creados, {importResult.updated} actualizados
              {importResult.failed > 0 ? `, ${importResult.failed} fallidos` : ''}.
            </p>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
