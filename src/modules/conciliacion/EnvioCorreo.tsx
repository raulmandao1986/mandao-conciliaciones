import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { Button } from '../../design-system/primitives/Button';
import { ConfirmDialog } from '../../design-system/primitives/ConfirmDialog';
import { ProcesoProgreso, useProcessSteps } from './ProcesoProgreso';
import type { EstadoConciliacion } from '../../lib/conciliacion/estados';
import {
  loadPlantillaCorreo, aplicarPlantilla, parseCorreos, enviarGmail, marcarEnviadas, type Adjunto,
} from '../../lib/conciliacion/envioCorreo';

// "Enviar" del histórico de Conciliación de Negocios y de Mensajeros: agrupa
// las conciliaciones por negocio/mensajero y período, busca su correo,
// confirma, envía un correo por grupo con sus PDF y las pasa a Enviado.

export interface EnvioItem<R> {
  rec: R;
  id: string;
  entidadId: string | null; // business_id / messenger_id
  nombre: string;
  area: string;
  fechaInicial: string;
  fechaFinal: string;
  consecutivo: string | null;
  estado: EstadoConciliacion;
  linea: string; // renglón de {detalle}: riel y monto (sin consecutivo: es interno)
}

interface Grupo<R> {
  nombre: string;
  area: string;
  fechaInicial: string;
  fechaFinal: string;
  items: EnvioItem<R>[];
  correos: string[];
}

export const puedeEnviar = (estado: EstadoConciliacion) => estado === 'Nuevo' || estado === 'Enviado';

export function useEnvioConciliaciones<R>({ entidad, construirPdfs, onTerminado }: {
  entidad: 'negocios' | 'mensajeros';
  construirPdfs: (recs: R[]) => Promise<Adjunto[]>;
  onTerminado: () => void | Promise<void>;
}) {
  const steps = useProcessSteps();
  const [preparando, setPreparando] = useState(false);
  const [pendiente, setPendiente] = useState<{ conCorreo: Grupo<R>[]; sinCorreo: Grupo<R>[] } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; message: string } | null>(null);
  const etiqueta = entidad === 'negocios' ? 'negocio' : 'mensajero';
  const table = entidad === 'negocios' ? 'conciliaciones_businesses' : 'conciliaciones_messengers';

  const solicitar = async (items: EnvioItem<R>[]) => {
    const enviables = items.filter(i => puedeEnviar(i.estado));
    if (enviables.length === 0) {
      alert('No hay conciliaciones en estado Nuevo o Enviado para enviar.');
      return;
    }
    setPreparando(true);
    try {
      const ids = Array.from(new Set(enviables.map(i => i.entidadId).filter((x): x is string => !!x)));
      const correos = new Map<string, string[]>();
      if (ids.length > 0) {
        const { data, error } = entidad === 'negocios'
          ? await supabase.from('businesses').select('business_id, email').in('business_id', ids)
          : await supabase.from('messengers').select('messenger_id, email').in('messenger_id', ids);
        if (error) {
          throw new Error(/email/.test(error.message)
            ? 'Falta correr en Supabase la migración 2026-10-27d_envio_correo_conciliaciones.sql (correo de mensajeros).'
            : error.message);
        }
        (data || []).forEach((r: any) => correos.set(r.business_id || r.messenger_id, parseCorreos(r.email)));
      }
      const grupos = new Map<string, Grupo<R>>();
      enviables.forEach(i => {
        const key = `${i.entidadId || i.nombre}|${i.fechaInicial}|${i.fechaFinal}`;
        if (!grupos.has(key)) {
          grupos.set(key, {
            nombre: i.nombre, area: i.area, fechaInicial: i.fechaInicial, fechaFinal: i.fechaFinal, items: [],
            correos: i.entidadId ? correos.get(i.entidadId) || [] : [],
          });
        }
        grupos.get(key)!.items.push(i);
      });
      const todos = Array.from(grupos.values());
      const conCorreo = todos.filter(g => g.correos.length > 0);
      const sinCorreo = todos.filter(g => g.correos.length === 0);
      if (conCorreo.length === 0) {
        alert(`Ningún ${etiqueta} seleccionado tiene correo registrado (${sinCorreo.map(g => g.nombre).slice(0, 5).join(', ')}). Regístrelo en Gestión de ${entidad === 'negocios' ? 'Negocios' : 'Mensajeros'}.`);
        return;
      }
      setPendiente({ conCorreo, sinCorreo });
    } catch (err: any) {
      alert('No se pudo preparar el envío: ' + (err?.message || err));
    } finally {
      setPreparando(false);
    }
  };

  const confirmar = async () => {
    if (!pendiente) return;
    const { conCorreo, sinCorreo } = pendiente;
    setPendiente(null);
    setModalOpen(true);
    setEnviando(true);
    setResultado(null);
    steps.start([
      { key: 'plantilla', label: 'Cargando la plantilla de correo' },
      { key: 'envio', label: `Generando PDF y enviando ${conCorreo.length} correo(s)` },
      { key: 'historico', label: 'Actualizando histórico' },
    ]);
    const fallidos: string[] = [];
    let enviados = 0;
    let failed = false;
    try {
      steps.update('plantilla', 'running');
      const plantilla = await loadPlantillaCorreo();
      const cc = parseCorreos(plantilla.cc);
      steps.update('plantilla', 'done', cc.length > 0 ? `Copia a: ${cc.join(', ')}` : undefined);

      steps.update('envio', 'running', `0 de ${conCorreo.length}`);
      for (const g of conCorreo) {
        try {
          const vars = {
            nombre: g.nombre,
            area: g.area,
            periodo: g.fechaInicial === g.fechaFinal ? formatDate(g.fechaInicial) : `${formatDate(g.fechaInicial)} al ${formatDate(g.fechaFinal)}`,
            detalle: g.items.map(i => `• ${i.linea}`).join('\n'),
          };
          const adjuntos = await construirPdfs(g.items.map(i => i.rec));
          await enviarGmail({
            to: g.correos,
            cc,
            asunto: aplicarPlantilla(plantilla.asunto, vars),
            cuerpo: aplicarPlantilla(plantilla.cuerpo, vars),
            adjuntos,
          });
          await marcarEnviadas(table, g.items.map(i => i.id), g.correos);
          enviados += 1;
        } catch (err: any) {
          fallidos.push(`${g.nombre}: ${err?.message || err}`);
          // Sin sesión de Google no tiene sentido seguir intentando.
          if (/sesión de Google/.test(err?.message || '')) break;
        }
        steps.update('envio', 'running', `${enviados + fallidos.length} de ${conCorreo.length}`);
      }
      steps.update('envio', fallidos.length > 0 ? (enviados > 0 ? 'warning' : 'error') : 'done', `${enviados} enviado(s)${fallidos.length > 0 ? ` · ${fallidos.length} con error` : ''}`);
      failed = enviados === 0;

      steps.update('historico', 'running');
      await onTerminado();
      steps.update('historico', 'done');

      setResultado({
        ok: fallidos.length === 0,
        message: [
          enviados > 0 ? `Se enviaron ${enviados} correo(s); las conciliaciones quedaron en estado Enviado.` : '',
          sinCorreo.length > 0 ? `Sin correo registrado (no se enviaron): ${sinCorreo.map(g => g.nombre).join(', ')}.` : '',
          fallidos.length > 0 ? `No se pudieron enviar:\n${fallidos.slice(0, 5).map(f => `• ${f}`).join('\n')}${fallidos.length > 5 ? `\n… y ${fallidos.length - 5} más.` : ''}` : '',
        ].filter(Boolean).join('\n'),
      });
    } catch (err: any) {
      failed = true;
      setResultado({ ok: false, message: 'Error al enviar: ' + (err?.message || err) });
    } finally {
      steps.finish(failed);
      setEnviando(false);
    }
  };

  const totalPdf = pendiente ? pendiente.conCorreo.reduce((s, g) => s + g.items.length, 0) : 0;
  const modal = (
    <>
      <ConfirmDialog
        isOpen={!!pendiente}
        title="¿Enviar conciliaciones por correo?"
        message={pendiente ? [
          `Se enviará${pendiente.conCorreo.length === 1 ? '' : 'n'} ${pendiente.conCorreo.length} correo(s) con ${totalPdf} PDF desde su cuenta de Google`
            + (pendiente.conCorreo.length === 1 ? ` a ${pendiente.conCorreo[0].correos.join(', ')}.` : '.'),
          'Las conciliaciones en Nuevo pasarán a Enviado.',
          pendiente.sinCorreo.length > 0 ? `${pendiente.sinCorreo.length} ${etiqueta}(s) sin correo registrado se omitirán: ${pendiente.sinCorreo.slice(0, 5).map(g => g.nombre).join(', ')}${pendiente.sinCorreo.length > 5 ? '…' : ''}.` : '',
        ].filter(Boolean).join(' ') : ''}
        confirmText="Enviar"
        onConfirm={confirmar}
        onCancel={() => setPendiente(null)}
        isDanger={false}
      />
      {modalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center p-4">
          <ProcesoProgreso
            title={enviando ? 'Enviando conciliaciones…' : 'Envío finalizado'}
            steps={steps.steps}
            elapsedMs={steps.elapsedMs}
            className="w-full max-w-lg shadow-2xl"
          >
            {resultado && (
              <div className="pt-3 border-t border-[var(--color-border)] space-y-3">
                <p className={cn('text-sm font-semibold whitespace-pre-line', resultado.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                  {resultado.message}
                </p>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setModalOpen(false)}>Cerrar</Button>
                </div>
              </div>
            )}
          </ProcesoProgreso>
        </div>
      )}
    </>
  );

  return { solicitar, preparando, ocupado: preparando || enviando, modal };
}
