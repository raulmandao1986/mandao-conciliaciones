import { useState } from 'react';
import { Loader2, Mail, RefreshCw, X } from 'lucide-react';
import { Button } from '../../design-system/primitives/Button';
import {
  ESTADO_CONCILIACION_OPTIONS, transicionesEstado, cambiarEstadoConciliacion,
  type EstadoConciliacion, type TablaConciliacion,
} from '../../lib/conciliacion/estados';
import { confirmar, notificar } from '../../lib/notificaciones';
import { puedeEnviar } from './EnvioCorreo';

// Conciliación seleccionada en el histórico, reducida a lo que necesitan las
// acciones masivas. `neto` = Por Pagar − Por Cobrar (decide Pagado/Cobrado).
export interface ItemMasivo {
  id: string;
  estado: EstadoConciliacion;
  neto: number;
  nombre: string;
  consecutivo: string | null;
}

interface AccionesMasivasProps {
  table: TablaConciliacion;
  items: ItemMasivo[];
  envioOcupado: boolean;
  envioPreparando: boolean;
  // Envía por correo las seleccionadas en Nuevo o Enviado.
  onEnviar: () => void;
  onLimpiar: () => void;
  // Recarga el histórico tras el cambio de estado masivo.
  onTerminado: () => Promise<void> | void;
  // Permisos del rol (Configuración -> Roles y Usuarios).
  puedeEnviarCorreo?: boolean;
  puedeCambiarEstado?: boolean;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// Barra de acciones masivas del histórico (BulkActionsBar): envío por correo y
// cambio de estado de varias conciliaciones respetando transicionesEstado().
export function AccionesMasivas({ table, items, envioOcupado, envioPreparando, onEnviar, onLimpiar, onTerminado, puedeEnviarCorreo = true, puedeCambiarEstado = true }: AccionesMasivasProps) {
  const [destino, setDestino] = useState<EstadoConciliacion | ''>('');
  const [aplicando, setAplicando] = useState(false);

  if (items.length === 0) return null;
  const enviables = items.filter(i => puedeEnviar(i.estado)).length;

  const aplicar = async () => {
    if (!destino) return;
    const validas = items.filter(i => i.estado !== destino && transicionesEstado(i.estado, i.neto).includes(destino));
    const omitidas = items.filter(i => !validas.includes(i));

    // Motivos de omisión agrupados por estado actual.
    const motivos: string[] = [];
    const yaEnDestino = omitidas.filter(i => i.estado === destino).length;
    if (yaEnDestino) motivos.push(`${plural(yaEnDestino, 'ya está', 'ya están')} en ${destino}`);
    for (const estado of ESTADO_CONCILIACION_OPTIONS) {
      if (estado === destino) continue;
      const delEstado = omitidas.filter(i => i.estado === estado);
      if (delEstado.length === 0) continue;
      const enCero = (destino === 'Pagado' || destino === 'Cobrado') && estado === 'Confirmado'
        ? delEstado.filter(i => Math.abs(i.neto) < 0.005).length : 0;
      motivos.push(`${delEstado.length} en ${estado} no ${delEstado.length === 1 ? 'puede' : 'pueden'} pasar a ${destino}`
        + (enCero ? ` (${enCero} con saldo 0 no tienen cierre)` : ''));
    }

    if (validas.length === 0) {
      notificar.error(`Ninguna de las seleccionadas puede pasar a ${destino}: ${motivos.join('; ')}.`);
      return;
    }
    const ok = await confirmar(
      `Se cambiarán ${plural(validas.length, 'conciliación', 'conciliaciones')} a ${destino}.`
        + (omitidas.length ? ` Se omitirán ${omitidas.length}: ${motivos.join('; ')}.` : ''),
      { titulo: 'Cambiar estado de conciliaciones', textoConfirmar: `Cambiar a ${destino}`, peligro: false }
    );
    if (!ok) return;

    setAplicando(true);
    let cambiadas = 0;
    const errores: string[] = [];
    // Secuencial: cada cambio queda en la bitácora de auditoría por separado.
    for (const i of validas) {
      try {
        await cambiarEstadoConciliacion(table, { id: i.id, estado: i.estado, nombre: i.nombre, consecutivo: i.consecutivo }, destino);
        cambiadas++;
      } catch (err: any) {
        errores.push(`${i.consecutivo || i.nombre}: ${err?.message || err}`);
      }
    }
    setAplicando(false);

    const resumen = `${plural(cambiadas, 'conciliación cambiada', 'conciliaciones cambiadas')} a ${destino}`
      + (omitidas.length ? `, ${omitidas.length} omitida(s)` : '');
    if (errores.length) notificar.error(`${resumen}. Fallaron ${errores.length}: ${errores.join('; ')}`);
    else notificar.exito(`${resumen}.`);
    setDestino('');
    onLimpiar();
    await onTerminado();
  };

  return (
    <div
      role="region"
      aria-label="Acciones masivas"
      className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-3)]"
    >
      <span className="text-sm font-semibold text-[var(--color-text)] tabular-nums">
        {plural(items.length, 'seleccionada', 'seleccionadas')}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1"
        onClick={onLimpiar}
        disabled={aplicando}
        aria-label="Quitar la selección"
        title="Quitar la selección"
      >
        <X size={14} /> Limpiar
      </Button>
      {puedeEnviarCorreo && (<>
      <span className="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden="true" />
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={envioOcupado || aplicando || enviables === 0}
        onClick={onEnviar}
        title="Envía por correo las seleccionadas en Nuevo o Enviado (un correo por destinatario y período)"
      >
        {envioPreparando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
        Enviar por correo ({enviables})
      </Button>
      </>)}
      {puedeCambiarEstado && (<>
      <span className="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden="true" />
      <label className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">Cambiar estado a…</span>
        <select
          value={destino}
          onChange={e => setDestino(e.target.value as EstadoConciliacion | '')}
          disabled={aplicando}
          className="h-9 px-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-sm outline-none focus:border-[var(--color-primary)]"
        >
          <option value="">Seleccione…</option>
          {ESTADO_CONCILIACION_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </label>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={!destino || aplicando || envioOcupado}
        onClick={aplicar}
        title="Aplica el estado a las seleccionadas que permitan ese cambio"
      >
        {aplicando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {aplicando ? 'Aplicando…' : 'Aplicar'}
      </Button>
      </>)}
    </div>
  );
}
