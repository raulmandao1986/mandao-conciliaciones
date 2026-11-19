// Catálogo de acciones por menú (2026-11-19, permisos configurables por rol).
// Cada menú tiene sus propias acciones; Configuración -> Roles y Usuarios las
// muestra como casillas y las guarda en access_roles.permisos:
//   { "<menu>": { "<accion>": true | false } }
// La base de datos las aplica con public.tiene_permiso(menu, accion) en sus
// reglas de seguridad (migración 2026-11-19c_permisos_por_accion.sql) y la app
// con usePermisos(menu).puede(accion). Super Admin siempre tiene todo.
//
// IMPORTANTE: los ids de menú y de acción deben coincidir con los usados en
// la migración. Si se agrega una acción aquí que modifica datos, hay que
// reflejarla en la política RLS de la tabla correspondiente.

export interface AccionDef { id: string; label: string }

const VER = { id: 'ver', label: 'Ver' };
const CREAR = { id: 'crear', label: 'Crear' };
const EDITAR = { id: 'editar', label: 'Editar' };
const ELIMINAR = { id: 'eliminar', label: 'Eliminar' };
const EXPORTAR = { id: 'exportar', label: 'Exportar' };
const CRUD = [VER, CREAR, EDITAR, ELIMINAR];

export const ACCIONES_POR_MENU: Record<string, AccionDef[]> = {
  'dashboard': [VER],
  'dispatcher-verificacion': [VER, { id: 'verificar', label: 'Verificar' }, { id: 'importar', label: 'Importar a la BD' }, { id: 'enviar_correo', label: 'Enviar correo' }, EXPORTAR],
  'dispatcher-revision': [VER, { id: 'detectar', label: 'Detectar cambios' }, { id: 'sincronizar', label: 'Sincronizar diferencias' }, EDITAR, ELIMINAR, EXPORTAR],
  'disponibilidad-verificacion': [VER, { id: 'verificar', label: 'Verificar' }, { id: 'importar', label: 'Importar a la BD' }, { id: 'enviar_correo', label: 'Enviar correo' }, EXPORTAR],
  'disponibilidad-revision': [VER, { id: 'detectar', label: 'Detectar cambios' }, EDITAR, ELIMINAR, EXPORTAR],
  'planificacion-pagos': [VER, EDITAR, ELIMINAR, EXPORTAR],
  'dashboard-negocio': [VER],
  'conciliacion-negocio': [VER, { id: 'conciliar', label: 'Conciliar' }, { id: 'reconciliar', label: 'Reconciliar' }, { id: 'cambiar_estado', label: 'Cambiar estado' }, { id: 'enviar_correo', label: 'Enviar correo' }, { id: 'registrar_entidad', label: 'Registrar / activar negocio' }],
  'facturacion-negocio': [VER],
  'cobros-pagos-negocio': [VER, { id: 'generar_planificacion', label: 'Generar Planificación' }, EXPORTAR],
  'gestion-negocios': [...CRUD, { id: 'importar', label: 'Importación masiva' }, EXPORTAR],
  'dashboard-mensajero': [VER],
  'conciliacion-mensajero': [VER, { id: 'conciliar', label: 'Conciliar' }, { id: 'reconciliar', label: 'Reconciliar' }, { id: 'cambiar_estado', label: 'Cambiar estado' }, { id: 'enviar_correo', label: 'Enviar correo' }, { id: 'registrar_entidad', label: 'Registrar / activar mensajero' }],
  'facturacion-mensajero': [VER],
  'cobros-pagos-mensajero': [VER, { id: 'generar_planificacion', label: 'Generar Planificación' }, EXPORTAR],
  'gestion-mensajeros': [...CRUD, { id: 'importar', label: 'Importación masiva' }, EXPORTAR],
  // Usuarios y roles: solo Super Admin los modifica (si otro rol pudiera,
  // podría darse a sí mismo cualquier permiso). Aquí solo se habilita verlos.
  'roles-usuarios': [VER],
  'areas': CRUD,
  'metodos-pago-negocios': CRUD,
  'metodos-pago-mensajeros': CRUD,
  'metodos-pago-ordenes': CRUD,
  'grupos-pago': CRUD,
  'formato-consecutivo': CRUD,
  'razon-cambio': [...CRUD, { id: 'sincronizar', label: 'Sincronizar con El Toque' }],
  'comision-mandao': CRUD,
  'correo-conciliacion': [VER, EDITAR],
  'reglas-negocios': CRUD,
  'reglas-mensajeros': CRUD,
  'documentos-importacion': CRUD,
  'config-logs': [VER],
};

export const accionesDe = (menu: string): AccionDef[] => ACCIONES_POR_MENU[menu] || [VER];

export type Permisos = Record<string, Record<string, boolean>>;

// Permisos de partida por rol base = lo que cada rol podía hacer antes de
// los permisos configurables (para que nada cambie al activarlos).
type RolBase = 'super_admin' | 'supervisor' | 'operador' | 'visitante';

function plantillaAccion(rol: RolBase, menu: string, accion: string): boolean {
  if (rol === 'super_admin') return true;
  if (accion === 'ver' || accion === 'exportar') return true;
  if (rol === 'visitante') return false;
  const verificar = ['verificar', 'enviar_correo', 'detectar'].includes(accion)
    && (menu === 'dispatcher-verificacion' || menu === 'disponibilidad-verificacion' || menu === 'dispatcher-revision' || menu === 'disponibilidad-revision');
  if (rol === 'operador') return verificar;
  // supervisor: procesos (importar, revisión, conciliación, cobros y
  // planificación); los catálogos y la gestión solo los modificaba Super Admin.
  if (verificar) return true;
  if (menu === 'dispatcher-verificacion' || menu === 'disponibilidad-verificacion') return accion === 'importar';
  if (menu === 'dispatcher-revision' || menu === 'disponibilidad-revision') return ['sincronizar', 'editar', 'eliminar'].includes(accion);
  if (menu.startsWith('conciliacion-')) return accion !== 'registrar_entidad';
  if (menu.startsWith('cobros-pagos-')) return accion === 'generar_planificacion';
  if (menu === 'planificacion-pagos') return true;
  if (menu === 'razon-cambio') return accion === 'sincronizar';
  return false;
}

export function plantillaPermisos(rol: string, menus: string[]): Permisos {
  const r = (['super_admin', 'supervisor', 'operador', 'visitante'].includes(rol) ? rol : 'visitante') as RolBase;
  const out: Permisos = {};
  menus.forEach(m => {
    out[m] = Object.fromEntries(accionesDe(m).map(a => [a.id, plantillaAccion(r, m, a.id)]));
  });
  return out;
}

export const plantillaAccionDe = (rol: string, menu: string, accion: string) =>
  plantillaAccion((['super_admin', 'supervisor', 'operador', 'visitante'].includes(rol) ? rol : 'visitante') as RolBase, menu, accion);
