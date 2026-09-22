# Plan de Trabajo — Mandao Conciliaciones

> Documento de seguimiento del proyecto: qué está hecho, qué falta, y quién
> debe resolver cada pendiente. Para el diseño funcional/técnico del sistema
> (reglas de negocio, esquema de base de datos, flujos), ver
> `Instrucciones Conciliaciones Mandao.md`. Para la bitácora histórica de la
> migración inicial Firestore → Supabase (agosto 2026), ver `PLAN_MIGRACION.md`.
>
> Última actualización: 2026-09-22.

---

## Estado general

El sistema corre en local (`npm run dev`), con Supabase como backend real
(Auth + Postgres + RLS) y sincronizado con GitHub
(`https://github.com/raulmandao1986/mandao-conciliaciones`, rama `main`).
Los módulos **Dispatcher**, **Disponibilidad** y **Gestión** (Áreas,
Negocios, Mensajeros, Métodos de Pago, Razón de Cambio, Roles y Usuarios,
Logs de Auditoría, Data) están migrados y en uso activo. El **módulo
financiero** (Conciliación, Facturación, Cuentas por Cobrar/Pagar,
Planificación de Pagos) sigue sin construir — pausado a propósito hasta
definir las reglas de negocio reales (ver sección "Pendiente" más abajo).

El hosting en la nube (para que el equipo lo use desde un dominio, no solo
en local) está preparado en el código pero bloqueado en dos frentes que
solo el usuario puede resolver: facturación de Google Cloud y una cuenta de
Netlify suspendida (ver detalle abajo).

---

## ✅ Completado

### Migración de backend (Firestore → Supabase)
- Esquema completo en `supabase_schema.sql` (fuente de verdad): **16 tablas**
  con RLS activo en todas — `profiles`, `areas`, `audit_logs`, `dispatcher` +
  `dispatcher_verifications`/`_incidents`/`_changes`, `availabilities` +
  `availability_imports`/`_verifications`/`_incidents`, `messengers`,
  `payment_methods`, `exchange_rates`, `businesses`, `import_sources`.
- `Instrucciones Conciliaciones Mandao.md` reescrita para hablar de Supabase
  (Postgres) en vez de Firestore en todo el documento (sección 12 documenta
  el esquema real completo).

### Autenticación y seguridad
- Supabase Auth con Google OAuth (scopes Sheets + Gmail preservados).
- Restricción real de dominio `@mandao.app` (antes solo era un texto
  decorativo en el login) — chequeo en `src/lib/auth.tsx` + `hd` en el OAuth.
- **Modelo de autorización explícita**: autenticarse con `@mandao.app` ya no
  da acceso por sí solo. Todo `profile` nuevo entra con `active = false`
  ("pendiente de aprobación"); un Super Admin lo autoriza y le asigna rol
  desde **Roles y Usuarios**, que también permite invitar a alguien por
  correo antes de que inicie sesión ("Nuevo Usuario").
- Se eliminó un botón que exponía la descarga pública del código fuente
  completo sin login.

### Módulo Dispatcher (Verificación / Revisión)
- Validación de Métodos de Pago corregida: ahora usa el catálogo real
  `payment_methods` (Configuración → Métodos de Pago → "Aplica a Órdenes"),
  no una lista fija en el código.
- **RN-001 reinterpretada correctamente**: los cambios detectados entre la
  hoja "Cambios" y "Orders" (Tipo de Pago, Monto de Producto, Monto de
  Delivery) ya no bloquean la importación como si fueran errores — se
  muestran en un panel "Cambios Detectados" que se debe confirmar
  explícitamente (por Orden ID) antes de habilitar "Importar a la BD". Solo
  una fila huérfana (sin orden coincidente) sigue siendo bloqueante.
- Revisión: el emparejamiento BD↔Sheet se corrigió para comparar por
  **Order ID + Negocio** (no solo Order ID, que puede repetirse entre
  negocios distintos) — evita discrepancias falsas y sincronizaciones sobre
  el registro equivocado.
- Corregido un crash (pantalla en blanco) al expandir el detalle de una
  orden en Revisión (`complementary_delivery` es texto en la BD y se
  usaba sin convertir a número).
- Mensajes de error de la API de Google Sheets ahora muestran el motivo
  real (antes se perdía y solo se veía el código HTTP) — así se detectó y
  resolvió el 403 por la API de Sheets deshabilitada en el proyecto GCP.
- Aviso visual cuando un Área no tiene ID de Google Sheet configurado (antes
  el botón de Verificar/Detectar Cambios quedaba deshabilitado sin explicar
  por qué).

### Módulo Gestión
- Negocios, Mensajeros, Áreas, Métodos de Pago, Razón de Cambio, Roles y
  Usuarios, Logs de Auditoría: migrados a Supabase.
- **Data** (antes "Documentos de Importación"): nuevo submenú en
  Configuración — CRUD para registrar los IDs de Google Sheet usados como
  fuente de la Importación Masiva (tabla `import_sources`).
- **Importación Masiva** en Negocios y Mensajeros: modal de 3 pasos (elegir
  documento → elegir pestaña real del Sheet vía API → vista previa y
  confirmación). Hace upsert por nombre (no duplica si se corre más de una
  vez). El campo Área se resuelve por coincidencia exacta y, si no hay,
  por categoría de provincia (Habana / Holguín / Provincias), igual que ya
  hacía el Dispatcher.
- Filtro "Estado" de Mensajeros corregido (estaba hardcodeado a solo
  mostrar activos, el select no hacía nada).
- Botón "Exportar" (Excel/PDF) agregado a Mensajeros, igual que ya existía
  en Negocios.

### Integración externa — Razón de Cambio
- Edge Function (`supabase/functions/sync-exchange-rate`) que sincroniza la
  tasa USD/CUP con la API real de El Toque (`tasas.eltoque.com`), con botón
  manual y job de `pg_cron` diario preparado (ver "Pendiente").

### Hosting / Despliegue (preparado, no publicado aún)
- `Dockerfile` + `nginx.conf` para Cloud Run.
- `netlify.toml` y `vercel.json` como alternativas listas para conectar por
  Git (build command, output dir, redirect SPA para React Router).

### Colaboración
- Repo sincronizado con GitHub; convención de branch protection documentada
  en la sección 21 de Instrucciones (sin aplicar técnicamente aún, ver
  pendientes).

---

## ⏳ Pendiente — requiere una acción tuya

Estos puntos están bloqueados en algo que **solo el usuario puede resolver**
(pago, cuenta propia, o una decisión de negocio) — no son tareas de código.

| Pendiente | Bloqueado en | Detalle |
|---|---|---|
| Hosting en Google Cloud (Cloud Run) | Facturación de GCP | Falta crear una cuenta de facturación y vincularla al proyecto `mandao-conciliaciones` (requiere tarjeta). Una vez hecho, se corre el primer `gcloud builds submit` / `gcloud run deploy`. |
| Hosting en Netlify | Soporte de Netlify | La cuenta quedó suspendida al registrarse ("Your account has been suspended"). Hay que escribir a [netlify.com/support](https://www.netlify.com/support/) para que la revisen. |
| Hosting en Vercel | — | Alternativa lista (`vercel.json` ya en el repo) mientras se resuelve Netlify o la facturación de GCP — solo falta conectar el repo desde tu cuenta de Vercel. |
| Sincronización automática de Razón de Cambio con El Toque | Token de El Toque + acceso a Supabase | Falta: (1) pedir el token en `tasas-token.eltoque.com`, (2) `npx supabase functions deploy sync-exchange-rate` + configurar sus secretos, (3) guardar el `CRON_SECRET` en el Vault de Supabase, (4) correr `supabase/migrations/2026-09-10_exchange_rate_cron.sql` contra el proyecto real. |
| Protección real de la rama `main` (bloquear push directo, exigir PR) | Plan de GitHub | GitHub Free no permite protección de ramas en repos privados — requiere GitHub Pro (o mover el repo a una organización con plan Team). Mientras tanto, la regla queda solo como convención documentada. |
| Invitar al segundo desarrollador al repo | — | Pendiente de que lo invites desde GitHub → Settings → Collaborators. |
| Módulo financiero (Conciliación, Facturación, Cuentas por Cobrar/Pagar, Planificación de Pagos) | Reglas de negocio | No tiene ninguna tabla ni diseño todavía — las 5 páginas son solo UI con `MOCK_DATA`, sin relación con `dispatcher`/`businesses`/`messengers`. Pausado explícitamente hasta que definamos juntos cómo se calculan comisiones, el desglose Efectivo/Transferencia/Saldo Mandao, e impuestos. |

---

## Convenciones y decisiones clave (para no repetirlas)

- **Roles fijos**: `super_admin` / `supervisor` / `operador` / `visitante` —
  no configurables, viven en `profiles.role`.
- **Autorización ≠ autenticación**: un usuario `active = false` puede
  loguearse pero no ve el sistema (pantalla de "pendiente de aprobación").
- **Área por provincia**: cualquier resolución de Área a partir de texto
  libre (Google Sheets) debe categorizar por provincia (Habana / Holguín /
  Provincias) si no hay coincidencia exacta de nombre — no asumir que el
  texto va a coincidir literalmente con `areas.name`.
- **Métodos de Pago**: siempre validar contra la tabla real
  `payment_methods` (con el flag `applies_to_*` correspondiente), nunca
  contra una lista fija en el código.
- **Import por Sheets = upsert por nombre**: toda importación masiva debe
  actualizar si el registro ya existe (por nombre normalizado), nunca
  duplicar ni requerir borrar antes de reimportar.
- **Secretos**: tokens de terceros (El Toque, Google, Supabase service role)
  nunca en el código ni en el chat — siempre como secretos de Supabase o
  variables de entorno del hosting.
