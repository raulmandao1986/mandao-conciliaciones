import { useEffect, useState } from 'react';

// Estado de una pantalla que se conserva al salir y volver a ella mientras la
// app está abierta (2026-11-16, Dispatcher -> Revisión no debía perder filtros
// ni resultados al navegar). Vive en memoria: se pierde al recargar la página.
// Funciona igual que useState; `limpiarEstadoPersistente(prefijo)` lo borra.

const almacen = new Map<string, unknown>();

export function useEstadoPersistente<T>(clave: string, inicial: T | (() => T)) {
  const [valor, setValor] = useState<T>(() =>
    almacen.has(clave) ? (almacen.get(clave) as T) : typeof inicial === 'function' ? (inicial as () => T)() : inicial
  );
  useEffect(() => { almacen.set(clave, valor); }, [clave, valor]);
  return [valor, setValor] as const;
}

export function limpiarEstadoPersistente(prefijo: string) {
  for (const k of Array.from(almacen.keys())) if (k.startsWith(prefijo)) almacen.delete(k);
}
