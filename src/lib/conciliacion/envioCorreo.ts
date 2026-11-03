import { supabase, logAuditEvent } from '../supabase';
import { getGoogleToken } from '../googleDrive';
import type { EstadoConciliacion, TablaConciliacion } from './estados';

// Envío por correo de las conciliaciones (Fase 3 "Nuevos cambios",
// 2026-10-27d). Gmail API con el token de Google de la sesión (scope
// gmail.send, el mismo del reporte de Verificación). Un correo por
// negocio/mensajero y período, con todos sus PDF adjuntos. Al enviarse,
// las conciliaciones en Nuevo pasan a Enviado.

export const CORREO_KEYS = {
  asunto: 'conciliacion_correo_asunto',
  cuerpo: 'conciliacion_correo_cuerpo',
  cc: 'conciliacion_correo_cc',
} as const;

export interface PlantillaCorreo { asunto: string; cuerpo: string; cc: string }

export const PLANTILLA_DEFECTO: PlantillaCorreo = {
  asunto: 'Conciliación {periodo} · {nombre}',
  cuerpo: 'Hola {nombre}:\n\nAdjuntamos la conciliación del período {periodo}:\n\n{detalle}\n\nPor favor revise los documentos y confírmenos su conformidad respondiendo a este correo.\n\nSaludos,\nEquipo de Conciliaciones',
  cc: '',
};

export const VARIABLES_CORREO: { clave: string; descripcion: string }[] = [
  { clave: '{nombre}', descripcion: 'Negocio o mensajero' },
  { clave: '{periodo}', descripcion: 'Rango de fechas conciliado' },
  { clave: '{area}', descripcion: 'Área' },
  { clave: '{detalle}', descripcion: 'Una línea por conciliación: riel, moneda y monto' },
];

export async function loadPlantillaCorreo(): Promise<PlantillaCorreo> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_key, value')
    .in('setting_key', Object.values(CORREO_KEYS));
  if (error) throw new Error(`No se pudo leer la plantilla de correo: ${error.message}`);
  const get = (k: string) => (data || []).find((r: any) => r.setting_key === k)?.value;
  return {
    asunto: get(CORREO_KEYS.asunto) || PLANTILLA_DEFECTO.asunto,
    cuerpo: get(CORREO_KEYS.cuerpo) || PLANTILLA_DEFECTO.cuerpo,
    cc: get(CORREO_KEYS.cc) ?? PLANTILLA_DEFECTO.cc,
  };
}

export function aplicarPlantilla(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

// Lista de correos de un campo que puede traer varios (coma, punto y coma o espacios).
export function parseCorreos(raw: string | null | undefined): string[] {
  return Array.from(new Set((raw || '').split(/[,;\s]+/).map(e => e.trim()).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))));
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function base64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function base64Blob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n');
const encabezado = (s: string) => `=?UTF-8?B?${base64Utf8(s)}?=`;

export interface Adjunto { nombre: string; blob: Blob }

// Envía un correo con adjuntos (multipart/mixed) por el endpoint de subida
// de Gmail, que admite mensajes de hasta 35 MB.
export async function enviarGmail(params: { to: string[]; cc: string[]; asunto: string; cuerpo: string; adjuntos: Adjunto[] }): Promise<void> {
  const token = getGoogleToken();
  if (!token) throw new Error('No hay sesión de Google activa. Use "Reconectar Google" y vuelva a intentarlo.');
  const limite = `mandao_${Date.now().toString(36)}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0f172a;line-height:1.5">${escapeHtml(params.cuerpo).replace(/\n/g, '<br>')}</div>`;
  const partes: string[] = [
    `To: ${params.to.join(', ')}`,
    ...(params.cc.length > 0 ? [`Cc: ${params.cc.join(', ')}`] : []),
    `Subject: ${encabezado(params.asunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64Utf8(html)),
  ];
  for (const a of params.adjuntos) {
    partes.push(
      `--${limite}`,
      `Content-Type: application/pdf; name="${a.nombre}"`,
      `Content-Disposition: attachment; filename="${a.nombre}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(await base64Blob(a.blob)),
    );
  }
  partes.push(`--${limite}--`, '');

  const res = await fetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' },
    body: partes.join('\r\n'),
  });
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error?.message || ''; } catch { /* sin JSON */ }
    if (res.status === 401) throw new Error('La sesión de Google expiró. Use "Reconectar Google" y vuelva a intentarlo.');
    if (res.status === 403) throw new Error(`Gmail rechazó el envío${msg ? `: ${msg}` : ''}. Reconecte Google y acepte el permiso de enviar correo.`);
    throw new Error(msg || `Gmail respondió ${res.status}.`);
  }
}

// Marca como enviadas las conciliaciones de un correo: Nuevo -> Enviado
// (las que ya estaban en Enviado se reenvían y conservan el estado).
export async function marcarEnviadas(table: TablaConciliacion, ids: string[], destinatarios: string[]): Promise<void> {
  const ahora = new Date().toISOString();
  const { error } = await supabase
    .from(table)
    .update({ estado: 'Enviado' as EstadoConciliacion, enviado_at: ahora, enviado_a: destinatarios.join(', '), updated_at: ahora })
    .in('conciliacion_id', ids)
    .in('estado', ['Nuevo', 'Enviado']);
  if (error) throw new Error(`El correo se envió, pero no se pudo actualizar el estado: ${error.message}`);
  await logAuditEvent('Conciliaciones', 'Conciliación Enviada por Correo', {
    entidad: table === 'conciliaciones_businesses' ? 'Negocios' : 'Mensajeros',
    conciliaciones: ids.length,
    destinatarios,
  });
}
