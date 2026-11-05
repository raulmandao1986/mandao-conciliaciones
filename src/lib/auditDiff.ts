// Cambios campo a campo (antes / después) para el Log de Auditoría
// (pedido 2026-11-05: saber qué se modificó realmente). Los objetos jsonb
// (cuentas bancarias, etc.) se comparan por sub-campo.

export type Cambios = Record<string, { antes: unknown; despues: unknown }>;

const vacio = (v: unknown) => v === null || v === undefined || v === '';
const igual = (a: unknown, b: unknown) => (vacio(a) && vacio(b)) || JSON.stringify(a) === JSON.stringify(b);
const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function diffCambios(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown>,
  etiquetas: Record<string, string>,
  formatear: (campo: string, valor: unknown) => unknown = (_c, v) => v,
): Cambios {
  const out: Cambios = {};
  const a = antes || {};
  for (const campo of Object.keys(etiquetas)) {
    if (!(campo in despues)) continue;
    const va = a[campo];
    const vd = despues[campo];
    if (esObjeto(va) || esObjeto(vd)) {
      const oa = esObjeto(va) ? va : {};
      const od = esObjeto(vd) ? vd : {};
      for (const k of Array.from(new Set([...Object.keys(oa), ...Object.keys(od)]))) {
        if (!igual(oa[k], od[k])) out[`${etiquetas[campo]} · ${k}`] = { antes: oa[k] ?? null, despues: od[k] ?? null };
      }
      continue;
    }
    if (!igual(va, vd)) out[etiquetas[campo]] = { antes: formatear(campo, va ?? null), despues: formatear(campo, vd ?? null) };
  }
  return out;
}

// Datos legibles de un registro (al crearlo o eliminarlo).
export function datosLegibles(
  registro: Record<string, unknown>,
  etiquetas: Record<string, string>,
  formatear: (campo: string, valor: unknown) => unknown = (_c, v) => v,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [campo, etiqueta] of Object.entries(etiquetas)) {
    const v = registro[campo];
    if (!vacio(v) && !esObjeto(v)) out[etiqueta] = formatear(campo, v);
  }
  return out;
}
