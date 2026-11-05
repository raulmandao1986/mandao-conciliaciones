import React, { useState } from 'react';
import { AlertTriangle, Loader2, UserPlus, Power, Pencil } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import { abrirEnGestion, type Coincidencia, type EntidadCatalogo } from '../../lib/conciliacion/catalogoEntidad';

// Aviso de la conciliación cuando el negocio/mensajero de las órdenes no está
// activo en su catálogo: no existe (registrarlo), existe Bloqueado (activarlo
// o modificarlo) o existe en otra Área (modificarlo).

export function EntidadNoRegistradaAviso({
  entidad, nombre, coincidencia, nombreArea, puedeGestionar, registrando, onRegistrar, onActivar,
}: {
  entidad: EntidadCatalogo;
  nombre: string;
  coincidencia: Coincidencia;
  nombreArea: (areaId: string | null) => string;
  puedeGestionar: boolean;
  registrando: boolean;
  onRegistrar: () => void;
  onActivar: (id: string, nombre: string) => Promise<void>;
}) {
  const [activando, setActivando] = useState(false);
  const e = entidad === 'negocios' ? { uno: 'negocio', Uno: 'Negocio', catalogo: 'Gestión de Negocios' } : { uno: 'mensajero', Uno: 'Mensajero', catalogo: 'Gestión de Mensajeros' };
  if (coincidencia.tipo === 'activo') return null;

  const sinPermiso = <span className="text-[10px] text-red-700 font-bold shrink-0">Requiere Super Admin</span>;
  const editar = (id: string) => (
    <Button variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => abrirEnGestion(entidad, id)}>
      <Pencil size={12} /> Modificar información
    </Button>
  );

  if (coincidencia.tipo === 'inactivo') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <span className="text-xs text-amber-900 font-semibold flex items-start gap-2 flex-1 min-w-[14rem]">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>"{coincidencia.nombre}" ya existe en {e.catalogo}, pero está <strong>Bloqueado</strong>. Actívelo para poder conciliarlo, o revise su información.</span>
        </span>
        {puedeGestionar ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-8 text-xs gap-1.5 shrink-0"
              disabled={activando}
              onClick={async () => {
                setActivando(true);
                try { await onActivar(coincidencia.id, coincidencia.nombre); } finally { setActivando(false); }
              }}
            >
              {activando ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />} Activar {e.uno}
            </Button>
            {editar(coincidencia.id)}
          </div>
        ) : sinPermiso}
      </div>
    );
  }

  if (coincidencia.tipo === 'otraArea') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <span className="text-xs text-amber-900 font-semibold flex items-start gap-2 flex-1 min-w-[14rem]">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            "{coincidencia.nombre}" ya existe en {e.catalogo} en el Área <strong>{nombreArea(coincidencia.areaId)}</strong>
            {coincidencia.activo ? '' : ' (Bloqueado)'}, no en la de estas órdenes. Si es el mismo {e.uno}, corrija su Área.
          </span>
        </span>
        {puedeGestionar ? editar(coincidencia.id) : sinPermiso}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
      <span className="text-xs text-red-800 font-semibold flex items-center gap-2"><AlertTriangle size={14} /> "{nombre}" no está registrado en {e.catalogo}.</span>
      {puedeGestionar ? (
        <Button variant="outline" className="h-8 text-xs gap-1.5 shrink-0" onClick={onRegistrar} disabled={registrando}>
          {registrando ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
          Registrar {e.Uno}
        </Button>
      ) : sinPermiso}
    </div>
  );
}

// Etiqueta corta para la columna Estado de la tabla Masiva.
export function etiquetaNoRegistrado(c: Coincidencia): string {
  return c.tipo === 'inactivo' ? 'Bloqueado' : c.tipo === 'otraArea' ? 'Otra Área' : 'Sin registrar';
}
