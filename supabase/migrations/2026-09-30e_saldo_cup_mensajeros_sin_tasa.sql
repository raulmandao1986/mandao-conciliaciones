-- =====================================================================
-- Corrección de Saldo CUP en Conciliaciones de Mensajeros
-- =====================================================================
-- Correr una sola vez en el SQL Editor del proyecto Supabase real,
-- después de 2026-09-30d_dispatcher_rules.sql.
--
-- Confirmado por el usuario 2026-09-30: los mensajeros siempre cobran y
-- pagan en CUP (vías de pago "Efectivo" y "Transferencia"), y el
-- dispatcher registra todos los montos en CUP. Saldo CUP es entonces el
-- neto (Total por Pagar - Total por Cobrar) sin conversión. Hasta hoy
-- ConciliacionMensajerosPage lo multiplicaba además por la tasa de cambio
-- activa, por lo que las conciliaciones ya guardadas tienen el saldo
-- convertido dos veces. Esto lo recalcula a partir de los totales
-- guardados (que no se vieron afectados).

update public.conciliaciones_messengers
set saldo_cup = round(total_por_pagar - total_por_cobrar, 2)
where saldo_cup is distinct from round(total_por_pagar - total_por_cobrar, 2);
