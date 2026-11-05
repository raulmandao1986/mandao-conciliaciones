-- =====================================================================
-- Reglas de excepción de la Verificación del Dispatcher
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-09-30c_conciliacion_negocios_por_metodo_pago.sql.
-- Ya está incorporado a supabase_schema.sql (fuente de verdad).
--
-- La Verificación exige valor en todas las columnas de la hoja "Orders".
-- Cada regla indica, para un Store (o para todos los negocios si store es
-- null) y opcionalmente solo cuando las columnas de `when_empty` vienen
-- vacías/0, qué columnas pueden venir vacías y con qué resultado:
--   'permitir'    -> la celda vacía no genera incidencia.
--   'advertencia' -> genera incidencia de advertencia (no bloquea).
-- columns: [{ "column": "productAmount", "action": "permitir" }, ...]
-- Ninguna excepción queda fija en el código: las que antes lo estaban
-- (Mandao Express, Recogida en el establecimiento) se siembran aquí y se
-- editan o eliminan desde Configuración -> Reglas (Negocios / Mensajeros).

create table public.dispatcher_rules (
  rule_id uuid primary key default gen_random_uuid(),
  actor text not null check (actor in ('negocios', 'mensajeros')),
  name text not null,
  store text,
  when_empty text[] not null default '{}',
  description text,
  columns jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- Reglas iniciales: reproducen exactamente lo que la Verificación ya
-- toleraba antes, para que su comportamiento no cambie al desplegar.
insert into public.dispatcher_rules (actor, name, store, when_empty, description, columns) values
  ('negocios', 'Columnas opcionales', null, '{}',
   'Columnas que hasta hoy la Verificación nunca exigía (se registran en 0 o vacías).',
   '[{"column":"customerNumber","action":"permitir"},{"column":"processingFee","action":"permitir"},{"column":"tax","action":"permitir"},{"column":"rate","action":"permitir"},{"column":"transactionFee","action":"permitir"},{"column":"promocode","action":"permitir"},{"column":"area","action":"permitir"}]'::jsonb),
  ('mensajeros', 'Cargos de entrega opcionales', null, '{}',
   'Los cargos de entrega pueden venir vacíos.',
   '[{"column":"deliveryCharge","action":"permitir"},{"column":"extraDeliveryCharge","action":"permitir"},{"column":"driverAdminCharge","action":"permitir"},{"column":"complementaryDelivery","action":"permitir"}]'::jsonb),
  ('negocios', 'Mandao Express', 'Mandao Express', '{}',
   'Servicio propio de Mandao: no registra monto de producto, oferta ni cargo de administración del negocio.',
   '[{"column":"productAmount","action":"permitir"},{"column":"storeOffer","action":"permitir"},{"column":"storeAdminCharge","action":"permitir"}]'::jsonb),
  ('mensajeros', 'Recogida en el establecimiento', null,
   array['deliveryCharge','extraDeliveryCharge','driverAdminCharge','complementaryDelivery'],
   'RN-003: el cliente recoge en el negocio; sin cargos de entrega no interviene mensajero.',
   '[{"column":"driver","action":"permitir"}]'::jsonb);

alter table public.dispatcher_rules enable row level security;

create policy "read_all_authenticated" on public.dispatcher_rules
  for select using (public.is_active_user());

create policy "manage_dispatcher_rules" on public.dispatcher_rules
  for all using (public.current_user_role() = 'super_admin')
  with check (public.current_user_role() = 'super_admin');

grant select, insert, update, delete on public.dispatcher_rules to anon, authenticated;
