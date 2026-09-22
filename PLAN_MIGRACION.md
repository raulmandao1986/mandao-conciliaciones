# Plan de Migración — Mandao Conciliaciones
## Google AI Studio + Firebase → Claude Code local + Supabase

**Versión 2** — 12 de agosto de 2026
**Cambios sobre la v1**: incorpora tus 4 decisiones sobre roles, permisos de Google, alcance de módulos y RLS, más los hallazgos de revisar el código real exportado (`mandao-conciliaciones.zip`).

> **Actualizado por última vez: 2026-09-22** (ver sección 10 en adelante). Las secciones 1–9 son la bitácora histórica de la migración inicial (agosto 2026) y se dejan tal cual quedaron entonces, como registro de las decisiones tomadas en su momento.

---

## 0. Decisiones ya confirmadas (no requieren más discusión)

| # | Tema | Decisión |
|---|---|---|
| 1 | Permisos de Google | Se mantienen los scopes `spreadsheets.readonly` y `gmail.send` sobre la cuenta del usuario autenticado. El sistema sigue leyendo Sheets y enviando correo como el usuario, no como un service account. |
| 2 | Roles | Fuente de verdad única: **`super_admin` / `supervisor` / `operador` / `visitante`**. Se elimina del código cualquier otro esquema de rol (`Super Admin`, `admin`, `mensajero`, `negocio` calculado por patrón de email). |
| 3 | Alcance de módulos | Dispatcher y Disponibilidad son lo único que se migra ahora. Todo lo demás (Dashboard, Negocios, Mensajeros, Configuración, Conciliación, Facturación, Cuentas por Cobrar/Pagar, Planificación de Pagos) se considera **no implementado**, aunque exista código de UI parcial — se construirá desde cero en Claude Code cuando les llegue su fase. |
| 4 | Seguridad a nivel de datos | Las políticas RLS de Supabase deben ser la fuente real de las reglas de negocio (no solo la UI). El `firestore.rules` actual se usa como referencia de partida, pero se corrige donde sea demasiado permisivo. |

---

## 1. Hallazgo crítico: el código real no coincide 1:1 con las instrucciones

Al revisar `mandao-conciliaciones.zip` archivo por archivo, el modelo de datos que usa el código **no es el que describe** `MANDAO_CONCILIACIONES_INSTRUCCIONES_12-07-2026.md`. Esto es importante porque cambia qué exactamente vamos a migrar.

### 1.1 Colecciones Firestore realmente usadas en el Dispatcher

| Archivo | Colección que usa | ¿Coincide con las instrucciones? |
|---|---|---|
| `VerificationPage.tsx`, `RevisionPage.tsx` | `dispatcher_orders` | ❌ Las instrucciones documentan `Dispatcher` |
| `VerificationPage.tsx` | `dispatcher_cambios` | ❌ No documentada en absoluto |
| `VerificationPage.tsx` | `dispatcher_disponibilidades` | ❌ No documentada — además se solapa con el módulo Disponibilidad (ver 1.3) |
| `VerificationPage.tsx` | `verification_history` | ❌ Las instrucciones documentan `Dispatcher_Verifications` |
| — | `Dispatcher_Imports`, `Dispatcher_Incidents` | ⚠️ Documentadas, pero **no existe ningún código que las use** — el registro de incidencias/importación vive embebido dentro de `verification_history` |
| `DispatcherPage.tsx` | `orders` | ⚠️ Es una vista de rastreo en tiempo real (`estado: en_transito/entregado`, `prioridad`) que **no tiene relación con el flujo de conciliación** descrito en las instrucciones. Todo indica que es un remanente de una versión anterior/demo del proyecto. |

### 1.2 Colecciones Firestore realmente usadas en Disponibilidad

| Archivo | Colección | ¿Coincide? |
|---|---|---|
| `DisponibilidadVerificationPage.tsx` | `disponibilidad_verification_history` | ❌ Las instrucciones documentan `Availability_Verifications` |
| `DisponibilidadVerificationPage.tsx` | `Availability_Incidents`, `Availability_Imports`, `Availabilities` | ✅ Coinciden con las instrucciones |
| `DisponibilidadRevisionPage.tsx` | `dispatcher_disponibilidades` | ❌ Ver 1.3 |

### 1.3 Duplicación confirmada entre módulos
En `DisponibilidadVerificationPage.tsx` (líneas 814-815), al guardar cada disponibilidad se escribe **el mismo objeto** dos veces, en dos colecciones distintas:

```javascript
promises.push(addDoc(collection(db, 'dispatcher_disponibilidades'), docPayload));
promises.push(addDoc(collection(db, 'Availabilities'), docPayload));
```

Es decir: `dispatcher_disponibilidades` no es un concepto de negocio distinto — es una **copia redundante** que quedó de cuando el Dispatcher y la Disponibilidad probablemente compartían una sola colección, antes de separarse en dos módulos. Al migrar a Supabase, esto se limpia: una sola tabla `availabilities`, sin duplicado.

### 1.4 Qué implica esto para el esquema de Supabase

El `supabase_schema.sql` de la v1 estaba basado en los nombres **documentados**, no en los **reales**. Ya lo corregí (ver sección 3), pero quedan dos puntos que necesito resolver contigo, porque afectan el flujo de negocio, no solo el nombre de la tabla:

- **¿`dispatcher_orders` es la única fuente real de "el Dispatcher"?** Todo el flujo de Verificar/Importar/Revisar lee y escribe ahí. Voy a tratarla como la tabla `dispatcher` definitiva.
- **¿`orders` / `DispatcherPage.tsx` se descarta?** Por lo que vi (campos y lógica de rastreo en tiempo real, sin ninguna relación con Google Sheets ni con las reglas RN-001 a RN-009) parece código muerto de una iteración anterior. Antes de sacarlo del alcance de la migración, confírmamelo — si me equivoco y sí se usa en producción, lo tratamos distinto.

---

## 2. Roles y permisos (decisión #2 aplicada)

### 2.1 Qué cambia en el código
`src/lib/auth.tsx` actualmente:
- Calcula el rol a partir del patrón del email (`admin@...`, `mensajero@...`, dominio `@mandao.app` vs externo).
- Tiene un *fallback* hardcodeado: si el email es `raul@mandao.app`, es "Super Admin" con permisos `['all']`, sin consultar la base de datos.
- Guarda una lista arbitraria de `permisos` (strings) por rol/usuario en Firestore.

Todo esto se reemplaza por:
- El rol vive únicamente en `profiles.role` (Supabase), con el enum `super_admin | supervisor | operador | visitante`.
- No más cálculo de rol por patrón de email.
- No más lista arbitraria de permisos — los 4 roles y lo que cada uno puede hacer ya están fijos en la matriz de tu documento de instrucciones (sección de permisos), así que se implementan directamente como políticas RLS y checks en el frontend, no como datos configurables.
- El *bootstrap* del primer super_admin (`raul@mandao.app`) se hace con una sola fila insertada directamente por SQL una vez creado su usuario en Supabase Auth — no queda hardcodeado en el código de la aplicación.

```sql
-- Ejecutar una sola vez, después de que raul@mandao.app inicie sesión por primera vez
-- (esto crea su fila en auth.users, y el trigger crea su profile con rol 'visitante' por defecto)
update public.profiles set role = 'super_admin' where id = (
  select id from auth.users where email = 'raul@mandao.app'
);
```

### 2.2 Gestión de usuarios/roles a futuro
La UI de `RolesUsuariosPage.tsx` existe en el código actual pero maneja el modelo de permisos viejo (lista libre de permisos por rol). Como este módulo cae en la categoría "no implementado, se construye desde Claude" (decisión #3), se reconstruye directamente sobre el modelo de 4 roles fijos cuando le toque su fase — no se migra tal cual.

---

## 3. Esquema Supabase actualizado

Actualicé `supabase_schema.sql` con:
- Tabla `dispatcher` = equivalente real de `dispatcher_orders` (no de la documentada `Dispatcher`, que no se usa).
- Tabla nueva `dispatcher_changes` = equivalente de `dispatcher_cambios` (no existía en la v1 del esquema).
- Tabla `dispatcher_verifications` = equivalente de `verification_history`.
- **Eliminada** la tabla `dispatcher_imports` como colección separada — no existe tal concepto en el código real; si se necesita un registro de auditoría de importación, se deriva de `dispatcher_verifications` (se añadió una columna `import_completed_at`).
- Tabla `availabilities` única — sin el duplicado `dispatcher_disponibilidades`. Si el Dispatcher necesita generar una disponibilidad, inserta directamente en esta misma tabla.
- Enum de roles y tabla `profiles` sin cambios de fondo respecto a la v1 (ya coincidía con la decisión #2).
- Política RLS ajustada: los roles `super_admin`/`supervisor` pueden todo; `operador` puede ejecutar verificaciones pero no importar ni gestionar catálogos; `visitante` solo lee. Esto es **más estricto** que el `firestore.rules` actual (que permite escribir a cualquier usuario autenticado en casi todo — ver 4.1), corrigiendo esa brecha.
- No se crean tablas para Negocios, Mensajeros, Configuración, Conciliación, Facturación, ni Cuentas por Cobrar/Pagar — quedan fuera de alcance hasta su fase (decisión #3).

*(El archivo completo actualizado se entrega junto a este plan.)*

---

## 4. Revisión de `firestore.rules` (decisión #4)

### 4.1 Qué encontré
El archivo real es mucho **más permisivo** de lo que las reglas de negocio (RN-007, matriz de permisos) exigen:

```
match /dispatcher_orders/{orderId} {
  allow read: if isSignedIn();
  allow write: if isSignedIn() && isValidId(orderId);   // cualquier usuario autenticado puede escribir
}
```

Esto se repite para casi todas las colecciones (`Availabilities`, `Availability_Imports`, `EmailGroups`, `Areas`, `MetodosPago`, `AuditLogs`, etc.): solo se exige `isSignedIn()`, sin distinguir rol. La única función que sí filtra por rol es `isAdmin()`, y solo se usa para las colecciones `users` y `roles`. En la práctica, hoy en día **cualquier usuario autenticado puede, por ejemplo, ejecutar una importación** a nivel de base de datos, aunque la UI se lo impida — que es exactamente lo que RN-007 dice que no debe pasar ("la validación debe hacerse en el backend, no solo en el frontend").

### 4.2 Qué se hace en Supabase
Las políticas RLS del `supabase_schema.sql` actualizado corrigen esto: cada operación de escritura verifica el rol real (`public.is_admin_or_supervisor()`, `public.can_execute_processes()`) contra `profiles.role`, no solo si el usuario está autenticado. Esta es la implementación que sí cumple RN-007 al nivel correcto (base de datos), no solo en la UI de React.

### 4.3 Pendiente de tu confirmación
No encontré en `firestore.rules` ninguna regla que distinga `Supervisor` de `Operador` de forma real (solo `isAdmin()` agrupa Super Admin + Supervisor). Voy a asumir, salvo que me digas lo contrario, que **Operador solo puede ejecutar Verificaciones** (no Importar, no gestionar catálogos) tal como dice la matriz de permisos del documento de instrucciones — así quedó reflejado en las políticas RLS.

---

## 5. Pasos de la migración (actualizados)

### Paso 1 — Repositorio git ✅ ya cubierto
Ver instrucciones que te di en el mensaje anterior (`git init` → repo en `@mandao.app` → push). No depende de nada de este documento.

### Paso 2 — Proyecto Supabase
1. Crear proyecto Supabase bajo la cuenta/organización de `@mandao.app`.
2. Ejecutar el `supabase_schema.sql` actualizado.
3. Configurar el proveedor de Google en Supabase Auth (Authentication → Providers → Google), añadiendo los scopes:
   ```
   https://www.googleapis.com/auth/spreadsheets.readonly
   https://www.googleapis.com/auth/gmail.send
   ```
   Esto se hace tanto en la consola de Supabase como en la pantalla de consentimiento OAuth de Google Cloud (mismo proyecto de Google que uses para Sheets/Gmail).

### Paso 3 — Reemplazar Firebase Auth por Supabase Auth (con los scopes de Google)
En `src/lib/auth.tsx`, el patrón cambia de:
```javascript
const result = await signInWithPopup(auth, googleProvider); // Firebase
```
a:
```javascript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/gmail.send',
    queryParams: { access_type: 'offline', prompt: 'consent' }
  }
});
```
Después del login, Supabase devuelve `session.provider_token` (equivalente al `credential.accessToken` que hoy guardas en `sessionStorage`) — se sustituye 1:1, mismo patrón de uso que ya tienes (token vivo solo durante la sesión, se vuelve a pedir al reautenticar). No hace falta guardar refresh tokens de Google de forma persistente porque el sistema actual tampoco lo hace.

El cálculo de rol por patrón de email se elimina completo — el rol se lee de `profiles.role` vía una sola consulta después de auth (no hace falta el escaneo de diagnóstico "F12 AUTH DEBUG" que hoy escanea toda la colección `users`, eso era un parche por no tener índice; en Postgres se resuelve con una consulta directa por `id`).

### Paso 4 — Reemplazar Firestore por Supabase en Dispatcher y Disponibilidad
Con el mapeo ya corregido (sección 1 y 3), tocar específicamente:
- `src/lib/firebase.ts` → nuevo `src/lib/supabase.ts` (incluye `logAuditEvent` reescrito contra la tabla `audit_logs`).
- `VerificationPage.tsx`, `RevisionPage.tsx` → leer/escribir `dispatcher`, `dispatcher_changes`, `dispatcher_verifications`.
- `DisponibilidadVerificationPage.tsx`, `DisponibilidadRevisionPage.tsx` → leer/escribir `availabilities`, `availability_imports`, `availability_incidents`, `availability_verifications` — **eliminando la escritura duplicada** a `dispatcher_disponibilidades`.
- Confirmar contigo si `DispatcherPage.tsx` (colección `orders`) se descarta o se conserva (sección 1.4).

### Paso 5 — Migrar datos existentes (si aplica)
Sin cambios respecto a la v1 — sigue pendiente de tu confirmación si hay datos reales en producción que conservar.

### Paso 6 — Despliegue
Sin cambios — se mantiene Firebase Hosting para el frontend, solo cambian las variables de entorno del build hacia Supabase.

---

## 6. Decisiones confirmadas (12 de agosto, segunda ronda)

1. ✅ `orders` / `DispatcherPage.tsx` confirmado como código muerto — **eliminado del proyecto**.
2. ✅ Operador: solo Verifica, no Importa ni gestiona catálogos (solo `super_admin`/`supervisor` importan) — ya reflejado en las políticas RLS del `supabase_schema.sql`.

---

## 7. Checkpoint de código — lo que ya se hizo en el `.zip`

Como pediste empezar ya, y con las dos confirmaciones de la sección 6, empecé la migración de código directamente sobre el proyecto exportado. Esto es lo que ya está hecho (y verificado con `tsc --noEmit` real, no supuesto):

**Hecho:**
- `DispatcherPage.tsx` eliminado (código muerto de `orders`).
- `package.json`: quitado `firebase`, añadido `@supabase/supabase-js`.
- `src/lib/firebase.ts` eliminado → nuevo `src/lib/supabase.ts` con el cliente Supabase y las mismas funciones exportadas (`signInWithGoogle`, `logout`, `logAuditEvent`) para minimizar cambios en el resto del código. Incluye `syncGoogleTokenToSessionStorage()`, que mantiene el token de Google en la misma clave de `sessionStorage` que ya usaban `VerificationPage.tsx`/`RevisionPage.tsx`/Disponibilidad, así esos archivos seguirán leyendo el token sin cambios adicionales cuando les toque su turno.
- `src/lib/auth.tsx` reescrito completo: Supabase Auth + Google OAuth con los scopes de Sheets/Gmail, rol leído de `profiles.role` (enum fijo de 4 valores). Se eliminó el cálculo de rol por patrón de email y el modelo de permisos libres.
- `src/shell/AppShell.tsx`: `hasPermission()` reescrito para el modelo de 4 roles (Dispatcher/Disponibilidad visibles para los 4 roles; el resto de módulos, fuera de alcance, visibles solo para `supervisor` mientras se construyen). El panel de debug de permisos también se simplificó para mostrar el rol fijo en vez de la vieja lista de permisos.
- `vite.config.ts` / `.env.example`: añadidas `SUPABASE_URL` / `SUPABASE_ANON_KEY`, siguiendo el mismo patrón `process.env` que ya usaba el proyecto (no el `import.meta.env.VITE_*` estándar de Vite, para no romper la convención de AI Studio).
- `LoginPage.tsx`: apunta a `signInWithGoogle` desde `lib/supabase` en vez de `lib/firebase`.

**Todavía NO se ha hecho** (confirmado con la salida real de `tsc --noEmit`, es la lista exacta y completa de lo que falta, no una estimación):

| Archivo | Motivo | ¿En alcance ahora? |
|---|---|---|
| `VerificationPage.tsx` | Firestore CRUD (`dispatcher_orders`, `dispatcher_cambios`, `verification_history`, `Areas`, `MetodosPago`) + flujo propio de reconexión a Google con `signInWithPopup` | ✅ Sí |
| `RevisionPage.tsx` | Igual que arriba | ✅ Sí |
| `DisponibilidadVerificationPage.tsx` | Firestore CRUD (`disponibilidad_verification_history`, `Availabilities`, `Availability_Imports/Incidents`, `dispatcher_disponibilidades` a eliminar) + reconexión Google | ✅ Sí |
| `DisponibilidadRevisionPage.tsx` | Igual que arriba | ✅ Sí |
| `src/lib/seed.ts` | Sembraba datos de ejemplo directo en Firestore | ⚠️ Se reemplaza por un seed SQL o se elimina — pendiente tu preferencia |
| `AreasPage.tsx`, `MetodosPagoPage.tsx`, `RazonCambioPage.tsx`, `GestionNegociosPage.tsx`, `GestionMensajerosPage.tsx`, `LogsAuditoriaPage.tsx`, `RolesUsuariosPage.tsx` | Firestore CRUD del módulo Gestión | ❌ Fuera de alcance — se reconstruyen en su fase (decisión #3) |
| `FacturacionPage.tsx`, `PlanificacionPagosPage.tsx` | Firestore CRUD de Conciliación/Facturación | ❌ Fuera de alcance — se reconstruyen en su fase (decisión #3) |

**Importante:** con esto, el proyecto **todavía no compila** (`npm run build` falla) — es un checkpoint intermedio, no un estado funcional. Te entrego el `.zip` con este avance (`mandao-conciliaciones-migracion-parcial.zip`) para que puedas seguir tú en Claude Code si ya lo tienes funcionando, o para que yo continúe aquí mismo con los 4 archivos del Dispatcher/Disponibilidad (son ~2500 líneas en total con lógica de negocio real de conciliación — prefiero avisarte del tamaño antes de lanzarme, porque sin poder correr la app y darle clic no puedo verificar visualmente cada cambio, solo que compile).

## 8. Lo que necesito de ti para seguir

1. ¿Continúo ya mismo con `VerificationPage.tsx` y `RevisionPage.tsx` (Dispatcher) aquí en el chat, o prefieres esperar a tener Claude Code funcionando para hacerlo con pruebas en vivo?
2. `src/lib/seed.ts`: ¿lo elimino (ya no aplica con Supabase) o te preparo su equivalente en SQL para tener datos de prueba iniciales (Áreas, Métodos de Pago por defecto)? — **Pendiente, no se tocó en esta fase.**

---

## 9. Migración completa de los 4 archivos (Claude Code, 18 de agosto de 2026)

Se migraron los 4 archivos pendientes de la sección 7 (`VerificationPage.tsx`, `RevisionPage.tsx`, `DisponibilidadVerificationPage.tsx`, `DisponibilidadRevisionPage.tsx`) de Firestore a Supabase. Los 4 compilan limpio con `tsc --noEmit` (los errores restantes son exclusivamente de los módulos fuera de alcance: Gestión, Conciliación, Facturación y `seed.ts` — decisión #3, sin cambios).

### 9.1 Correcciones al esquema (`supabase_schema_patch_v3.sql`)

Al leer el código real completo (no solo los nombres de colección) se encontraron dos huecos en el `supabase_schema.sql` v2 que ya corrió contra la base real. **Confirmados contigo antes de aplicar.** Este patch todavía no se ha ejecutado contra la base real — hazlo desde el SQL Editor de Supabase:

1. **Faltaban políticas RLS de `UPDATE`/`DELETE`** en `dispatcher` y `availabilities`. Sin ellas, Postgres deniega esas operaciones por defecto para todos los roles (incluido `super_admin`), y `RevisionPage.tsx`/`DisponibilidadRevisionPage.tsx` habrían fallado silenciosamente al editar o eliminar. Se agregaron, restringidas a `super_admin`/`supervisor` (igual que las políticas de `insert` ya existentes).
2. **`dispatcher_changes` tenía la forma equivocada.** La v2 la diseñó como log de diffs (`field_changed`/`old_value`/`new_value`), pero el código real de `VerificationPage.tsx` importa la fila **completa** de la pestaña "Cambios" del Google Sheet. Se corrigió a columnas reales: `store`, `driver`, `payment_type`, `product_amount`, `delivery_charge`, `detail`, `change_date`.

`supabase_schema.sql` ya quedó actualizado con ambas correcciones (para instalaciones nuevas); `supabase_schema_patch_v3.sql` es el ALTER incremental para tu base ya existente.

### 9.2 Decisiones de diseño tomadas durante la migración (sin cambios de esquema)

- **Catálogo de Métodos de Pago de mensajeros (RN-005):** no existe todavía una tabla en Supabase (pertenece a la fase de Gestión, fuera de alcance). Se usa siempre el catálogo fijo que el código original ya traía como *fallback* (Efectivo, Transferencia, Transferencia-Efectivo/Especial/Exterior/Saldo), definido ahora como constante en cada archivo.
- **Correos de notificación (`notifyEmails`):** Firestore los guardaba en un doc global `settings/dispatcher_config` / `settings/disponibilidad_config`. Supabase no tiene tabla de configuración todavía. Se guardan en `localStorage` del navegador bajo la key `mandao_notify_emails` (compartida entre Dispatcher y Disponibilidad, igual que el *fallback* que ya tenía el código). Efecto práctico: ya no es una config compartida entre todos los usuarios/dispositivos, sino por navegador.
- **Colecciones "espejo"/duplicadas eliminadas por completo**, tal como ya indicaba la sección 3 de este plan: `dispatcher_disponibilidades` (duplicado de `Availabilities`) y `disponibilidad_verification_history` (duplicado de `Availability_Verifications`/`Availability_Imports`) ya no se usan en ningún lado — todo pasa por las tablas únicas `availabilities`, `availability_verifications`, `availability_imports`.
- **RN-013 (no importar dos veces la misma área+rango de fechas) y RN-009 (no duplicar una orden)** ya no se validan con una consulta previa a mano: se apoyan directamente en los índices únicos que ya tenía el esquema (`uq_availability_import_area_range`, `uq_dispatcher_order_area_date`). El código intenta el insert y traduce el error de Postgres `23505` al mensaje de la regla de negocio.
- **`dispatcher_incidents` ahora sí se persiste.** El código Firestore original nunca guardaba las incidencias detectadas (solo el conteo). Como la tabla ya existía en el esquema para esto, `handleImport` en `VerificationPage.tsx` ahora inserta cada incidencia — es una mejora de trazabilidad, no un cambio de alcance.
- **Reconexión con Google cambia de popup a redirect de página completa.** Firebase usaba `signInWithPopup` (síncrono, sin recargar la página). Supabase usa `signInWithOAuth` con redirect — no puede devolver un token dentro de la misma ejecución de JavaScript. Cuando el token de Google falta o expira a mitad de una Verificación/Importación/Envío de correo, la app ahora **redirige al usuario a reconectar y aborta la operación en curso**; el usuario debe volver a pulsar el botón al regresar. Antes, Firebase podía reintentar automáticamente sin perder el flujo. Esto ya estaba previsto por el diseño de `lib/supabase.ts` (`reconnectGoogle`), no es una decisión nueva.
- **Historial de Verificaciones ya no es en tiempo real** (`onSnapshot` → `fetch` puntual al montar la página + refresco manual tras cada verificación/importación). Simplificación intencional: nadie más edita esas tablas concurrentemente desde otra pestaña en un flujo normal.
- **Nombres de usuario en el historial:** por RLS, un usuario sin rol `super_admin`/`supervisor` solo puede leer su propio `profile`. El historial muestra el nombre del usuario actual cuando coincide, y "Otro usuario" en el resto de los casos (antes se guardaba el email directamente en Firestore, visible para cualquiera).
- **`ModuleRouter.tsx`** se actualizó para dejar de usar el modelo de permisos libres (`useAuth().permissions`, que ya no existe) — los 4 componentes migrados ya no reciben ni usan un prop `permissions`, y verifican el rol directamente vía `useAuth()` + los helpers `ROLE_CAN_IMPORT`/`ROLE_CAN_VERIFY` de `lib/auth.tsx`.

### 9.3 Pendiente

- Ejecutar `supabase_schema_patch_v3.sql` contra la base real (no se ejecutó automáticamente — requiere el SQL Editor de Supabase).
- `src/lib/seed.ts` sigue sin migrar (pregunta abierta de la sección 8, punto 2).
- Probar el flujo completo en el navegador (login Google, Verificar, Importar, Revisión, edición/borrado) — esta sesión solo verificó con `tsc --noEmit`, no corrió la app.

---

## 10. Estabilización, Gestión completa, y nuevas funcionalidades (10–22 de septiembre de 2026)

Con el proyecto ya corriendo en el navegador (login real con `@mandao.app`), esta fase se dedicó a: terminar lo que quedaba de Gestión, cerrar huecos de seguridad reales encontrados probando en vivo, corregir varios bugs de Dispatcher que solo aparecían con datos reales, construir la sincronización con El Toque, y dejar preparado (no publicado aún) el hosting en la nube.

### 10.1 `src/lib/seed.ts` — resuelto
Se eliminó por completo (era código muerto: seguía importando `firebase/firestore`, nadie lo importaba desde ningún otro archivo). Con esto, el proyecto compila y builda 100% limpio sin ninguna referencia a Firebase.

### 10.2 Módulo Gestión — completado
Áreas, Métodos de Pago, Razón de Cambio, Negocios, Mensajeros, Roles y Usuarios, Logs de Auditoría: los 7 catálogos migrados y en uso real sobre Supabase (antes solo Áreas estaba hecha). Se agregó también la tabla `businesses` (antes no existía) y se extendió `messengers` con los campos completos que traía el Firestore original (`ci`, `phone`, `fiscal_card`, `fiscal_account`, `payment_method`, `backpack_type`, `start_date`, `end_date`, `area_id`, `comments`).

### 10.3 Modelo de autorización explícita (hueco de seguridad real)
Se encontró, probando en vivo, que cualquier cuenta `@mandao.app` que iniciara sesión quedaba automáticamente registrada como `visitante` **activo** — es decir, ya podía leer todo el sistema en cuanto Google la autenticaba, sin que ningún Super Admin la hubiera autorizado. Se corrigió a nivel de base de datos, no solo de UI:
- Todo `profile` nuevo entra con `active = false` ("pendiente de autorización").
- Mientras `active = false`, la app muestra una pantalla de espera en vez del sistema.
- Un Super Admin lo autoriza y le asigna rol desde **Roles y Usuarios** (que ahora también permite invitar a alguien por correo antes de que inicie sesión — botón "Nuevo Usuario", vía `signInWithOtp`, sin necesitar la Service Role Key en el frontend).
- `current_user_role()` devuelve `NULL` para un usuario inactivo (niega toda escritura automáticamente), y se agregó `is_active_user()` para que las políticas de solo lectura dejen de aceptar "cualquiera que esté logueado" como suficiente.

De paso se reforzó la restricción de dominio `@mandao.app` (antes era solo un texto decorativo en el login, sin verificación real) y se eliminó un botón que exponía la descarga pública de todo el código fuente sin necesidad de login.

### 10.4 Correcciones en Dispatcher (Verificación / Revisión)
Varios bugs que solo se manifestaban con datos y Sheets reales:
- **RN-005 con catálogo equivocado**: `Payment Type` se validaba contra una lista fija en el código ("métodos de pago de mensajeros"), no contra la tabla real `payment_methods` — generaba incidencias críticas falsas en casi cualquier orden y bloqueaba la importación. Corregido para usar `payment_methods` filtrado por `applies_to_orders = true`.
- **RN-001 mal interpretada**: las diferencias entre una orden y su fila coincidente en "Cambios" (Tipo de Pago, Monto de Producto, Monto de Delivery) se trataban como incidencia crítica bloqueante — pero esas diferencias son precisamente la razón de ser de la hoja Cambios (la orden fue modificada a propósito), no un error de datos. Ahora se muestran en un panel "Cambios Detectados" con confirmación explícita por Orden ID; solo una fila huérfana (sin orden coincidente) sigue bloqueando.
- **Revisión emparejaba solo por Order ID**: el mismo No. Orden puede repetirse en negocios distintos (por diseño, RN-009 solo bloquea duplicado si coincide Order ID *y* Negocio) — comparar solo por Order ID cruzaba órdenes de negocios distintos, con riesgo real de sincronizar/eliminar el registro equivocado. Corregido a Order ID + Negocio.
- Crash (pantalla en blanco) al expandir el detalle de una orden en Revisión: `complementary_delivery` es `text` en la base de datos (puede venir como string o número desde el Sheet) pero se usaba directamente en un `.toFixed()`.
- Los errores de la API de Google Sheets solo mostraban el código HTTP (`res.statusText` casi siempre viene vacío) — se agregó lectura del body de error real, lo que permitió detectar y resolver un 403 por la API de Sheets deshabilitada en el proyecto de Google Cloud.
- Aviso visual cuando un Área no tiene ID de Google Sheet configurado (antes el botón de Verificar/Detectar Cambios quedaba deshabilitado sin ninguna explicación).

### 10.5 "Data" — Importación Masiva de Negocios y Mensajeros
Nueva funcionalidad, no existía en ninguna versión anterior: un submenú en Configuración llamado **Data** con un CRUD (`import_sources`) para registrar los IDs de Google Sheet de origen, y un botón "Importación Masiva" en Negocios/Mensajeros que:
1. Lista las pestañas reales del documento vía la API de Google Sheets (no asume el nombre de la pestaña).
2. Parsea las filas con el mismo mapeo de columnas que traían los CSV de siembra originales del proyecto.
3. Hace upsert por nombre (no duplica si se corre más de una vez).
4. Resuelve el Área: primero por coincidencia exacta de nombre, y si no hay, por categoría de provincia (Habana / Holguín / Provincias), igual que ya hacía el Dispatcher — necesario porque la columna "Área" del Sheet trae nombres reales de provincia, no siempre el mismo texto que `areas.name`.

De paso se corrigió el filtro "Estado" de Mensajeros (estaba hardcodeado a solo mostrar activos, el select no hacía nada) y se agregó el botón "Exportar" (Excel/PDF) a Mensajeros, que ya existía en Negocios.

### 10.6 Integración con El Toque (Razón de Cambio)
Nueva Edge Function `supabase/functions/sync-exchange-rate` que sincroniza la tasa USD/CUP con la API real de El Toque (`tasas.eltoque.com`), con botón manual en `RazonCambioPage.tsx` y un job de `pg_cron` diario preparado (`supabase/migrations/2026-09-10_exchange_rate_cron.sql`). Pendiente de activar (ver sección 11).

### 10.7 Hosting — preparado, no publicado
Se agregaron `Dockerfile` + `nginx.conf` (Cloud Run), y `netlify.toml` + `vercel.json` como alternativas listas para conectar por Git. Ninguno se ha publicado todavía — ver bloqueos en la sección 11.

---

## 11. Estado actual y pendientes (2026-09-22)

El sistema corre en local con Supabase real. Dispatcher, Disponibilidad y Gestión (los 7 catálogos + Data) están migrados, probados en vivo, y sin bugs conocidos pendientes de esta ronda. El **módulo financiero** (Conciliación, Facturación, Cuentas por Cobrar/Pagar, Planificación de Pagos) sigue igual que en la decisión #3 original: no implementado, sin ninguna tabla, solo UI con `MOCK_DATA` — deliberadamente pospuesto hasta definir las reglas de negocio reales (cálculo de comisiones desde las órdenes, desglose Efectivo/Transferencia/Saldo Mandao, impuestos).

Pendientes que **requieren una acción tuya** (no son tareas de código):

| Pendiente | Bloqueado en |
|---|---|
| Hosting en Google Cloud (Cloud Run) | Crear/vincular una cuenta de facturación de GCP (requiere tarjeta) |
| Hosting en Netlify | Cuenta suspendida al registrarse — pendiente que soporte de Netlify la revise |
| Hosting en Vercel | Alternativa lista, solo falta conectar el repo desde tu cuenta |
| Sincronización automática con El Toque | Pedir el token en `tasas-token.eltoque.com` + desplegar la Edge Function + correr la migración de `pg_cron` contra el proyecto real |
| Protección real de la rama `main` | GitHub Free no permite branch protection en repos privados — requiere GitHub Pro o mover el repo a una organización |
| Invitar al segundo desarrollador | Pendiente de que lo invites desde GitHub → Settings → Collaborators |
| Módulo financiero (Conciliación/Facturación/CxC/CxP/Planificación) | Definir juntos las reglas de negocio antes de diseñar el esquema |

Nada de lo anterior bloquea empezar a diseñar el módulo de **Conciliación** — son pendientes de infraestructura/cuentas externas, no del código de Dispatcher/Disponibilidad/Gestión.
