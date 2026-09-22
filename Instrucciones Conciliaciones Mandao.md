# Mandao Conciliaciones — Instrucciones Específicas del Sistema

> **Sistema externo independiente** que forma parte del ecosistema Mandao.  
> Este documento extiende y complementa las reglas establecidas en el **Marco Fundamental — Reglas No Negociables** (`CONSTITUCION`). Todo lo definido aquí es específico del sistema **Mandao Conciliaciones** y debe respetarse sin excepción al generar código para este sistema.  
> El agente AI debe leer **primero** la Constitución general y **luego** este documento antes de generar cualquier componente, vista, lógica o estructura.

---

## Índice

1. [Identidad del sistema](#1-identidad-del-sistema)
2. [Stack y contexto de módulo externo](#2-stack-y-contexto-de-módulo-externo)
3. [Arquitectura funcional y módulos](#3-arquitectura-funcional-y-módulos)
4. [Actores y roles del sistema](#4-actores-y-roles-del-sistema)
5. [Módulo Dispatcher](#5-módulo-dispatcher) ✅ **FASE ACTUAL**
6. [Módulo Negocios](#6-módulo-negocios) ⏳
7. [Módulo Mensajeros](#7-módulo-mensajeros) ⏳
8. [Módulo Configuración](#8-módulo-configuración) ⏳
9. [Módulo Dashboard](#9-módulo-dashboard) ⏳
10. [Reglas de negocio — catálogo completo](#10-reglas-de-negocio--catálogo-completo)
11. [Estados del sistema Conciliaciones](#11-estados-del-sistema-conciliaciones)
12. [Diseño de base de datos Supabase (Postgres)](#12-diseño-de-base-de-datos-supabase-postgres)
13. [Riesgos operativos conocidos](#13-riesgos-operativos-conocidos)
14. [Navegación y estructura de archivos](#14-navegación-y-estructura-de-archivos)
15. [Reglas verificables exclusivas de Conciliaciones](#15-reglas-verificables-exclusivas-de-conciliaciones)
16. [Anti-patrones específicos de Conciliaciones](#16-anti-patrones-específicos-de-conciliaciones)
17. [Extensibilidad — nuevos módulos futuros](#17-extensibilidad--nuevos-módulos-futuros)
18. [Módulo Disponibilidad](#18-módulo-disponibilidad) ✅ **FASE ACTUAL**
19. [Backend y persistencia de datos — Migración a Supabase](#19-backend-y-persistencia-de-datos--migración-a-supabase) 🆕
20. [Hosting en Google Cloud](#20-hosting-en-google-cloud) 🆕
21. [Colaboración en GitHub y trabajo en paralelo](#21-colaboración-en-github-y-trabajo-en-paralelo) 🆕

---

## 1. Identidad del sistema

- **Nombre**: Mandao Conciliaciones
- **Tipo**: `[MODULE-EXTERNO]` — aplicación React independiente con su propio shell
- **Dot identificador** en launchers y links de retorno: `#2563eb` (azul)
- **Propósito**: Automatizar el proceso de conciliación de órdenes del servicio de Delivery (Mensajería) de Mandao, reemplazando el trabajo manual que se realizaba en hojas de cálculo Google Sheets
- **Usuarios destino**: Departamento de Finanzas de Mandao Finance
- **Contexto de negocio**: Mandao opera un servicio de mensajería/delivery. Las órdenes son registradas en un Google Sheet llamado "Dispatcher" y deben ser verificadas, importadas a Supabase (Postgres), conciliadas por Negocio y por Mensajero, facturadas y planificadas para pago
- **Color activo de nav**: `--color-brand-active` (#FFF8C5) — igual que todos los sistemas del ecosistema Mandao. El dot azul solo aplica en launchers y en el link de retorno a Finance, **nunca** en el marcador de ítem activo del sidebar

```ts
// Definición del sistema en el mapa de dots
const systemDots = {
  finance:        "#FFBF00",  // amarillo marca
  inventario:     "#16a34a",  // verde
  conciliaciones: "#2563eb",  // azul ← este sistema
}
```

---

## 2. Stack y contexto de módulo externo

Este sistema hereda **obligatoriamente** todo lo definido en la Constitución para `[CORE]` y `[MODULE-EXTERNO]`:

- React 19 + TypeScript (strict mode)
- Vite como build tool
- Tailwind CSS v4 con tokens vía `@theme` en CSS — **nunca** en `tailwind.config.js`
- Lucide React — **único** proveedor de íconos permitido
- Recharts para gráficas del Dashboard
- Framer Motion — solo para transiciones de página, slide-overs y toasts
- **Supabase Auth + Supabase (backend)** *(antes: Firebase Auth + Firestore — ver sección 19 para detalle de la migración)*
- `react-hook-form` + `zod` para todos los formularios
- TanStack Table para tablas complejas
- Formatters `formatCurrency`, `formatDate`, `formatQty`, `formatPercent` importados desde `@mandao/design-system`
- Todos los tokens CSS desde el package `@mandao/design-system` — **nunca** hardcodear colores hex

### Vínculo de retorno a Finance — obligatorio en el sidebar

```tsx
<SidebarBackLink href={process.env.VITE_FINANCE_URL} label="Mandao Finance" />
```

---

## 3. Arquitectura funcional y módulos

El sistema se organiza en **6 módulos principales**. De momento los módulos Dispatcher y Disponibilidad están en fase de implementación activa. Los demás existen en la arquitectura pero no deben implementarse hasta que su sección en este documento sea completada.

```
MANDAO CONCILIACIONES
│
├── Dashboard                     ⏳ fase posterior
│
├── Dispatcher                    ✅ FASE ACTUAL
│   ├── Verificación
│   └── Revisión
│
├── Disponibilidad                ✅ FASE ACTUAL
│   ├── Verificación
│   └── Revisión
│
├── Negocios                      ⏳ fase posterior
│   ├── Conciliación
│   ├── Facturación
│   ├── Cuentas por Pagar
│   ├── Cuentas por Cobrar
│   ├── Planificación de Pagos
│   └── Gestión de Negocios
│
├── Mensajeros                    ⏳ fase posterior
│   ├── Conciliación
│   ├── Facturación
│   ├── Cuentas por Pagar
│   ├── Cuentas por Cobrar
│   ├── Planificación de Pagos
│   └── Gestión de Mensajeros
│
└── Configuración                 ⏳ fase posterior
    ├── Roles y Usuarios
    ├── Áreas
    ├── Métodos de Pago
    └── Razones de Cambio
```

### Flujo general de información

```
Google Sheet Dispatcher
        ↓
    [Hoja Orders]              +       [Hoja Cambios]
        ↓
    Verificación Dispatcher
        ↓ (si hay incidencias)           ↓ (sin incidencias)
    Mostrar Errores               Verificación Correcta
    Enviar Mail                           ↓
        ↓                         Habilitar Importación
       Fin                                ↓
                          Importar a Supabase (Postgres)
                                          ↓
                                    Revisión Dispatcher
                                          ↓
                           ┌─────────────────────────────┐
                           │                             │
                  Conciliación Negocios       Conciliación Mensajeros
                           ↓                             ↓
                  Facturación Negocios       Facturación Mensajeros
                           ↓                             ↓
               Cuentas por Pagar/Cobrar   Cuentas por Pagar/Cobrar
                           ↓                             ↓
               Planificación Pagos Neg.   Planificación Pagos Men.
                           ↓                             ↓
                     Documento PDF               Documento PDF
```

---

## 4. Actores y roles del sistema

El sistema tiene **3 roles de usuario** con matrices de acceso diferenciadas. El agente AI debe respetar estas restricciones al generar cualquier lógica de permisos, guards de ruta o visibilidad de acciones.

### Rol: Super Admin / Supervisor — Acceso total

| Capacidad | Permitido |
|---|---|
| Ejecutar Verificaciones | ✅ |
| Autorizar Importaciones | ✅ |
| Revisar Incidencias | ✅ |
| Consultar Historial | ✅ |
| Ejecutar Conciliaciones | ✅ |
| Ejecutar Facturaciones | ✅ |
| Ejecutar Planificación de Pagos | ✅ |
| Gestionar Negocios (CRUD) | ✅ |
| Gestionar Mensajeros (CRUD) | ✅ |
| Gestionar Áreas | ✅ |
| Gestionar Usuarios | ✅ |
| Gestionar Roles | ✅ |
| Gestionar Métodos de Pago | ✅ |
| Gestionar Permisos | ✅ |
| Generar Reportes | ✅ |
| Exportar PDF | ✅ |
| Enviar por Correo | ✅ |

### Rol: Operador — Lectura y edición limitada

| Capacidad | Permitido |
|---|---|
| Ejecutar Verificaciones | ✅ |
| Revisar Incidencias | ✅ |
| Consultar Historial | ✅ |
| Revisar Resultados | ✅ |
| Consultar Reportes | ✅ |
| Consultar Conciliaciones | ✅ |
| Consultar Facturaciones | ✅ |
| Consultar Planificación de Pagos | ✅ |
| Consultar Negocios | ✅ |
| Consultar Mensajeros | ✅ |
| Exportar PDF | ✅ |
| Enviar por Correo | ✅ |
| Autorizar Importaciones | ❌ |
| Ejecutar Conciliaciones | ❌ |
| Ejecutar Facturaciones | ❌ |
| CRUD de configuración | ❌ |

### Rol: Visitante — Solo lectura

| Capacidad | Permitido |
|---|---|
| Consultar Historial | ✅ |
| Revisar Resultados | ✅ |
| Consultar Reportes | ✅ |
| Consultar Conciliaciones | ✅ |
| Consultar Facturaciones | ✅ |
| Consultar Planificación de Pagos | ✅ |
| Consultar Negocios | ✅ |
| Consultar Mensajeros | ✅ |
| Ejecutar Verificaciones | ❌ |
| Autorizar Importaciones | ❌ |
| Ejecutar cualquier proceso | ❌ |
| CRUD de cualquier entidad | ❌ |

### Actores del sistema (no humanos)

| Actor | Rol |
|---|---|
| **Supabase (Postgres)** | Almacenamiento validado, búsquedas, historial |
| **Google Sheets Dispatcher** | Fuente externa de datos (Orders + Cambios) |

---

## 5. Módulo Dispatcher

> ✅ **MÓDULO EN IMPLEMENTACIÓN ACTIVA.** Todo el contenido de esta sección debe respetarse y ejecutarse tal como está especificado.

El Dispatcher es el **módulo central** del sistema. Es la puerta de entrada de toda la información que luego se concilia y factura. Toda generación de código para este módulo debe respetar el flujo exacto descrito aquí.

### Estructura de carpetas del módulo

```
src/modules/dispatcher/
  index.ts
  routes.tsx
  navConfig.ts
  pages/
    VerificacionPage.tsx
    RevisionPage.tsx
  components/
    IncidenciasList.tsx
    VerificacionResultCard.tsx
    RevisionDiffTable.tsx
    ImportacionModal.tsx
  hooks/
    useVerificacion.ts
    useImportacion.ts
    useRevision.ts
  schemas/
    verificacion.schema.ts
  types.ts
```

---

### 5.1 Submódulo Verificación

#### Descripción
Valida la consistencia de la información contenida en el Google Sheet del Dispatcher antes de importarla a Supabase (Postgres).

#### Precondiciones
- Usuario autenticado con Rol `Super Admin` o `Supervisor`
- Área configurada en el sistema
- Acceso activo al Google Sheet del Área

#### Entradas del proceso

| Campo | Tipo | Requerido |
|---|---|---|
| Área / Dispatcher | Selector | ✅ |
| Fecha Inicial | DatePicker | ✅ |
| Fecha Final | DatePicker | ✅ |

#### Flujo funcional detallado

```
Usuario selecciona Área
        ↓
Usuario selecciona Fecha Inicial y Fecha Final
        ↓
Sistema lee Google Sheet del Área
        ↓
    ┌───────────────────────────────────┐
    │ ¿La hoja "Cambios" tiene registros? │
    └───────────────────────────────────┘
         Sí ↓                    No ↓
    Validar Cambios       Validar Integridad
    contra Orders              de Orders
         ↓                         ↓
         └─────────┬───────────────┘
                   ↓
         Ejecutar Reglas de Negocio
         (RN-001 a RN-009)
                   ↓
         Buscar Coincidencias Difusas
         (RN-005: negocios, mensajeros)
                   ↓
         Generar listado de Incidencias
                   ↓
    ┌──────────────────────────────┐
    │ ¿Existen incidencias críticas? │
    └──────────────────────────────┘
         Sí ↓                    No ↓
    Mostrar errores       Estado: Verificación Correcta
    Enviar mail (opt)             ↓
         ↓               Habilitar botón "Importar"
        Fin
```

#### Salidas del proceso

| Salida | Descripción |
|---|---|
| Resultado de Verificación | `Correcta` o `Con Incidencias` |
| Listado de Incidencias | Tabla con severidad, código de regla, descripción |
| Habilitación de Importación | Solo si resultado = Correcta |

#### Flujos alternativos

- **A1 — Hoja Cambios vacía**: el sistema omite la validación de Cambios y ejecuta únicamente la validación estructural de Orders
- **A2 — Google Sheet inaccesible**: el sistema detiene el proceso completamente y muestra error descriptivo con código R-001

#### UI/UX de la vista Verificación

- El formulario de parámetros (Área + Fechas) es el punto de partida. Se muestra en un **panel superior** fijo, no en modal ni slide-over — ya que el resultado es extenso y necesita espacio
- El resultado de la verificación se muestra **en la misma página**, debajo del panel de parámetros, sin navegar a otra vista
- Si hay incidencias, se muestra una tabla con todos los elementos de la anatomía obligatoria de tablas (sección 9 de la Constitución)
- El botón "Importar" **solo es visible** cuando el estado de verificación es `Correcta` y el usuario tiene rol `Super Admin` o `Supervisor`
- Si hay órdenes con cambios detectados (RN-001), se muestra un panel aparte "Cambios Detectados" con un checkbox por Orden ID — el botón "Importar" permanece deshabilitado hasta que todos estén confirmados (agregado 2026-09-16)
- El botón "Exportar PDF" y "Enviar por Correo" son accesibles para `Super Admin`, `Supervisor` y `Operador`

---

### 5.2 Submódulo Importación

#### Descripción
Guarda en Supabase (Postgres) la información validada del Google Sheet Dispatcher. Solo puede ejecutarse cuando la verificación es correcta.

#### Precondiciones — todas deben cumplirse
- Usuario autenticado con Rol `Super Admin` o `Supervisor`
- Estado de Verificación = `Correcta` (RN-007)
- No existe importación previa para el mismo Área y fecha operativa (RN-009)

#### Flujo funcional

```
Usuario presiona "Importar"
        ↓
Sistema valida resultado de verificación (RN-007)
        ↓
Sistema verifica no-duplicidad (RN-009)
        ↓
Sistema guarda registros en la tabla public.dispatcher (Supabase)
        ↓
Sistema marca imported_by / import_completed_at en el registro
correspondiente de public.dispatcher_verifications (no existe una
tabla de "imports" separada para Dispatcher — a diferencia de
Disponibilidad, la propia verificación funciona también como el
registro de auditoría de la importación)
        ↓
Sistema registra log en public.audit_logs (usuario, fecha, hora, área, resultado)
        ↓
Sistema genera PDF del resultado
        ↓
Sistema envía correo de confirmación
        ↓
Fin — estado actualizado en pantalla
```

#### Salida

- Datos almacenados en Supabase (tabla `public.dispatcher`)
- Registro de log con trazabilidad completa (RN-008)

#### UI/UX

- La importación se confirma mediante un **Modal simple** de confirmación (≤ 4 campos — solo confirmación)
- Después de la importación exitosa, se muestra un toast de éxito y el botón "Importar" queda deshabilitado
- En caso de error, el modal muestra el motivo específico (duplicado, sin permisos, etc.)

---

### 5.3 Submódulo Revisión

#### Descripción
Compara los datos almacenados en Supabase (Postgres) contra el Dispatcher (Google Sheet) para detectar diferencias entre ambas fuentes.

#### Precondiciones
- Usuario autenticado con Rol `Super Admin`, `Supervisor` u `Operador`
- Datos previamente importados a Supabase (Postgres)

#### Entradas del proceso

| Campo | Tipo | Requerido |
|---|---|---|
| Fecha Inicial | DatePicker | ✅ |
| Fecha Final | DatePicker | ✅ |
| Área | Selector | ✅ |

#### Flujo funcional

```
Usuario selecciona filtros (fechas + área)
        ↓
Sistema consulta Supabase (tabla public.dispatcher, registros importados)
        ↓
Sistema consulta Google Sheet Dispatcher
        ↓
Sistema compara registro por registro
        ↓
Sistema muestra diferencias detectadas
```

#### Salida
- Listado de diferencias con indicación de campo, valor en Supabase y valor en Dispatcher

#### UI/UX
- Vista en tabla con columnas: Orden ID | Campo | Valor Supabase | Valor Dispatcher | Diferencia
- Tabla con los 6 elementos de anatomía obligatoria
- Filtros disponibles: por campo con diferencia, por tipo de diferencia

---

## 6. Módulo Negocios

> ⏳ Pendiente de especificación — fase posterior del desarrollo. No implementar hasta que este bloque sea reemplazado con la especificación completa.

---

## 7. Módulo Mensajeros

> ⏳ Pendiente de especificación — fase posterior del desarrollo. No implementar hasta que este bloque sea reemplazado con la especificación completa.

---

## 8. Módulo Configuración

> ⏳ Pendiente de especificación — fase posterior del desarrollo. No implementar hasta que este bloque sea reemplazado con la especificación completa.

---

## 9. Módulo Dashboard

> ⏳ Pendiente de especificación — fase posterior del desarrollo. No implementar hasta que este bloque sea reemplazado con la especificación completa.

---

## 10. Reglas de negocio — catálogo completo

Estas reglas son **invariables**. El agente AI debe implementarlas **exactamente** como se describen. No hay margen de interpretación.

> **Alcance actual**: las reglas RN-001 a RN-009 aplican directamente al módulo Dispatcher en esta fase. Las reglas RN-010 y RN-011 están documentadas para referencia futura y no deben implementarse aún.

### RN-001 — Validación de Cambios

Si existe un registro en la hoja Cambios, debe coincidir con la hoja Orders en:
- `Order ID` = `No. Orden`
- `Driver` = `Mensajero`
- `Store` = `Negocio`
- `Area` = `Provincia`

Estos 4 campos son la **clave de coincidencia**: si no se encuentra una orden en
Orders con estos 4 valores, es una incidencia **crítica** (huérfana) y bloquea
la importación (RN-006) — indica un problema real de datos.

Una vez encontrada la orden coincidente, los campos de valor (`Tipo de Pago`,
`Monto de Producto`, `Monto de Delivery`) **pueden diferir** entre Cambios y
Orders — de hecho, esa es la razón de ser de la hoja Cambios: documentar que
esa orden fue modificada. Estas diferencias **no son una incidencia crítica**
y no bloquean por sí solas la importación (agregado 2026-09-16, corrige una
interpretación anterior que las trataba como error RN-001 bloqueante). En vez
de eso, el sistema las muestra agrupadas por Orden ID en un panel de "Cambios
Detectados" que el usuario debe **confirmar explícitamente** (checkbox por
orden) antes de que el botón "Importar a la BD" se habilite.

### RN-002 — Validación Mandao Express

Si `Store = "Mandao Express"`, los siguientes campos **pueden estar vacíos** sin generar incidencia:
- `Product Amount`
- `Store Offer`
- `Store Admin Charge`

### RN-003 — Orden Recogida por Cliente

Si **todos** los siguientes campos están vacíos o contienen `"-"`:
- `Delivery Charge`
- `Extra Delivery Charge`
- `Driver Admin Charge`
- `Complementary Delivery`

Entonces el estado de esa orden = `Correcto` (orden recogida directamente por el cliente, no requiere mensajero).

### RN-004 — Campos Permitidos en Cero

Los siguientes campos pueden contener `0` o `0.00` sin generar incidencia:
- `Processing Fee`
- `Tax`
- `Promocode` (puede estar vacío)

### RN-005 — Coincidencia Difusa

Al comparar Negocios, Mensajeros y Métodos de Pago, el sistema debe ignorar:
- Diferencias de mayúsculas/minúsculas
- Tildes y caracteres diacríticos
- Espacios dobles
- Caracteres especiales

**Ejemplos de equivalencias válidas:**
- `CAFÉ HABANA` = `Cafe Habana`
- `Habana` ≈ `Havana` (similitud fuzzy)

El catálogo de Métodos de Pago contra el que se valida el `Payment Type` de
cada orden es la tabla real `public.payment_methods` (Configuración → Métodos
de Pago), filtrada por `active = true` y `applies_to_orders = true` —
corregido 2026-09-16: antes se validaba contra una lista fija en el código
que no tenía relación con lo que el usuario administraba en Supabase, y
generaba incidencias críticas falsas en casi cualquier orden.

### RN-006 — Bloqueo de Importación

Si existe **al menos una incidencia crítica**, la Importación está **completamente bloqueada**. El botón de importación no debe aparecer ni estar habilitado bajo ninguna circunstancia.

> Los "Cambios Detectados" entre Cambios y Orders (RN-001, campos de valor) NO
> cuentan como incidencia crítica para este bloqueo — requieren su propia
> confirmación explícita (ver RN-001), pero no impiden que el botón de
> Importar exista o se habilite una vez confirmados.

### RN-007 — Importación Solo con Verificación Correcta

La Importación solo puede ejecutarse cuando el estado de la Verificación activa es `Correcta`. Esta validación debe hacerse **en el backend** (política RLS de Supabase o función de servidor), no solo en el UI.

### RN-008 — Trazabilidad Obligatoria

Toda verificación ejecutada debe almacenar obligatoriamente:
- Usuario que la ejecutó
- Fecha
- Hora
- Área
- Resultado (Correcta / Con Incidencias)
- Número de incidencias

### RN-009 — Control de Duplicados

Una orden **no puede importarse más de una vez** para la misma Área y fecha operativa. Si ya existe un registro importado para esa combinación, el sistema debe bloquear la importación y mostrar un error descriptivo.

### RN-010 — Tasa de Cambio Única Activa

> ⏳ Aplica al módulo Configuración — fase posterior del desarrollo.

### RN-011 — Secuencia del Proceso

> ⏳ Aplica a los módulos Negocios y Mensajeros — fase posterior del desarrollo.

---

## 11. Estados del sistema Conciliaciones

> **Alcance actual**: solo los estados del Dispatcher aplican en esta fase. Los demás están documentados para referencia futura y no deben implementarse aún.

### Estados de Verificación Dispatcher ✅ FASE ACTUAL

| Estado | Token | Badge Label | Ícono Lucide |
|---|---|---|---|
| `pendiente` | neutral | Pendiente | `Clock` |
| `correcta` | `--color-success` | Correcta | `BadgeCheck` |
| `con_incidencias` | `--color-danger` | Con Incidencias | `AlertOctagon` |

### Estados de Importación ✅ FASE ACTUAL

| Estado | Token | Badge Label | Ícono Lucide |
|---|---|---|---|
| `no_importado` | neutral | No Importado | `Upload` |
| `importado` | `--color-success` | Importado | `CheckCircle2` |
| `importacion_duplicada` | `--color-danger` | Duplicado | `AlertCircle` |

### Estados de Incidencias ✅ FASE ACTUAL

| Severidad | Token | Label | Ícono Lucide |
|---|---|---|---|
| `critica` | `--color-danger` | Crítica | `AlertOctagon` |
| `advertencia` | `--color-warning` | Advertencia | `AlertTriangle` |
| `informativa` | `--color-info` | Informativa | `Info` |

### Estados de Conciliación (Negocios y Mensajeros)

> ⏳ Pendiente — fase posterior del desarrollo.

### Estados de Facturación

> ⏳ Pendiente — fase posterior del desarrollo.

### Estados de Cuentas por Pagar / Cobrar

> ⏳ Pendiente — fase posterior del desarrollo.

---

## 12. Diseño de base de datos Supabase (Postgres)

> 🔄 Sección reescrita 2026-09-13. **La base de datos con la que se trabaja es Supabase (Postgres)** — Firestore ya no existe en este sistema. Esta sección documenta el esquema REAL y vigente, tal como vive en `supabase_schema.sql` (raíz del repo), que es la única fuente de verdad — cualquier tabla nueva se define primero ahí (con sus políticas RLS) y luego se refleja aquí. El agente AI no debe crear tablas adicionales a las aquí documentadas sin actualizar ambos archivos.

> **Alcance actual**: las 16 tablas de esta sección ya están migradas y en uso — Dispatcher, Disponibilidad y los catálogos de Gestión (Áreas, Mensajeros, Negocios, Métodos de Pago, Razón de Cambio, Roles y Usuarios, Logs de Auditoría, Documentos de Importación). El módulo financiero (Conciliación, Facturación, Cuentas por Cobrar/Pagar, Planificación de Pagos) sigue sin tabla propia — ver "Tablas pendientes" al final de esta sección.

### Tablas activas — Fase actual ✅

**1. `public.profiles`** — usuarios y roles (extiende `auth.users` de Supabase Auth)

| Campo | Tipo |
|---|---|
| `id` | uuid (PK, FK a `auth.users`) |
| `full_name` | text |
| `email` | text |
| `role` | enum `user_role`: `super_admin` / `supervisor` / `operador` / `visitante` |
| `active` | boolean — si `false`, cuenta pendiente de autorización (ver sección 19.3.1) |
| `created_at` / `updated_at` | timestamptz |

**2. `public.areas`**

| Campo | Tipo |
|---|---|
| `area_id` | uuid (PK) |
| `name` | text |
| `province` | text |
| `sheet_document_id` | text — ID del Google Sheet del Dispatcher, obligatorio |
| `description` | text |
| `active` | boolean |
| `created_at` | timestamptz |

**3. `public.audit_logs`** — trazabilidad obligatoria (RN-008)

| Campo | Tipo |
|---|---|
| `log_id` | uuid (PK) |
| `module` | text |
| `action` | text |
| `user_id` | uuid (FK a `auth.users`) |
| `occurred_at` | timestamptz |
| `details` | jsonb |

**4. `public.dispatcher`** — copia de la hoja Orders del Google Sheet

| Campo | Tipo |
|---|---|
| `order_pk` | uuid (PK) |
| `delivery_date` / `order_date` | date |
| `payment_type` | text |
| `customer` / `customer_number` | text |
| `driver` | text |
| `store` | text |
| `order_id` | text |
| `product_amount` / `store_offer` / `processing_fee` / `store_admin_charge` / `delivery_charge` / `extra_delivery_charge` / `driver_admin_charge` / `tax` | numeric(12,2) |
| `complementary_delivery` | text |
| `promocode` | text |
| `area_id` | uuid (FK a `areas`) |
| `verification_id` | uuid (FK a `dispatcher_verifications`) |
| `created_at` | timestamptz |

Índice único `(order_id, area_id, delivery_date)` → aplica RN-009 (no duplicar importación).

**5. `public.dispatcher_verifications`**

| Campo | Tipo |
|---|---|
| `verification_id` | uuid (PK) |
| `area_id` | uuid (FK) |
| `start_date` / `end_date` | date |
| `verification_date` | timestamptz |
| `user_id` | uuid (FK) |
| `status` | `correcta` / `con_incidencias` |
| `total_orders` / `total_changes` / `total_incidents` | int |
| `imported_by` | uuid (FK) |
| `import_completed_at` | timestamptz |

> No existe una tabla "imports" separada para Dispatcher: este mismo registro de verificación funciona también como el registro de auditoría de la importación (a diferencia de Disponibilidad, que sí tiene `availability_imports`).

**6. `public.dispatcher_incidents`**

| Campo | Tipo |
|---|---|
| `incident_id` | uuid (PK) |
| `verification_id` | uuid (FK, cascade) |
| `order_id` | text |
| `severity` | `critica` / `advertencia` / `informativa` |
| `rule_code` | text (`RN-001`, `RN-002`, ...) |
| `description` | text |
| `status` | text |

**7. `public.dispatcher_changes`** — copia de la fila completa de la pestaña "Cambios" del Sheet

| Campo | Tipo |
|---|---|
| `change_id` | uuid (PK) |
| `verification_id` | uuid (FK, cascade) |
| `order_id` | text |
| `store` / `driver` / `payment_type` | text |
| `product_amount` / `delivery_charge` | numeric(12,2) |
| `detail` | text |
| `change_date` | date |
| `created_at` | timestamptz |

**8. `public.availabilities`** — copia de la hoja Disponibilidades del Google Sheet

| Campo | Tipo | Origen (columna Google Sheet) |
|---|---|---|
| `availability_id` | uuid (PK) | generado por el sistema |
| `ts` | timestamptz | `Timestamp` |
| `email_address` | text | `Email Address` |
| `order_id` | text | `No. Orden` |
| `availability_date` | date | `Fecha de la disponibilidad` |
| `reason` | text | `Motivo` |
| `requested_by` | text | `Area o persona que solicta la transportacion` (typo intencional en la fuente, no corregir) |
| `messenger_name` | text | `Mensajero` |
| `amount_to_pay` | numeric(12,2) | `Monto a pagar` |
| `province` | text | `Provincias` |
| `comment` | text | `Comentario` |
| `area_id` | uuid (FK a `areas`) | Área seleccionada en el sistema |
| `import_id` | uuid (FK a `availability_imports`) | — |

**9. `public.availability_imports`**

| Campo | Tipo |
|---|---|
| `import_id` | uuid (PK) |
| `area_id` | uuid (FK) |
| `start_date` / `end_date` | date |
| `imported_by` | uuid (FK) |
| `import_date` | timestamptz |
| `records_imported` | int |

Índice único `(area_id, start_date, end_date)` → aplica RN-013.

**10. `public.availability_verifications`**

| Campo | Tipo |
|---|---|
| `verification_id` | uuid (PK) |
| `area_id` | uuid (FK) |
| `start_date` / `end_date` | date |
| `verification_date` | timestamptz |
| `user_id` | uuid (FK) |
| `status` | `correcta` / `con_incidencias` |
| `total_records` / `total_incidents` | int |

**11. `public.availability_incidents`**

| Campo | Tipo |
|---|---|
| `incident_id` | uuid (PK) |
| `verification_id` | uuid (FK, cascade) |
| `row_number` | int |
| `messenger_name` | text |
| `availability_date` | date |
| `severity` | `critica` |
| `rule_code` | text (`RN-012`, `RN-014`) |
| `description` | text |

**12. `public.messengers`** — catálogo (usado por RN-012 de Disponibilidad, RN-005 de Dispatcher, y por Gestión de Mensajeros)

| Campo | Tipo |
|---|---|
| `messenger_id` | uuid (PK) |
| `name` | text |
| `active` | boolean |
| `ci` / `phone` / `fiscal_card` / `fiscal_account` | text |
| `payment_method` | text |
| `backpack_type` | text (default `'Grande'`) |
| `start_date` / `end_date` | date |
| `area_id` | uuid (FK a `areas`) |
| `comments` | text |
| `created_at` / `updated_at` | timestamptz |

Índice GIN trigram en `name` para acelerar la coincidencia difusa (RN-005).

**13. `public.payment_methods`**

| Campo | Tipo |
|---|---|
| `payment_method_id` | uuid (PK) |
| `name` / `description` | text |
| `applies_to_businesses` / `applies_to_messengers` / `applies_to_orders` | boolean |
| `active` | boolean |
| `created_at` / `updated_at` | timestamptz |

**14. `public.exchange_rates`**

| Campo | Tipo |
|---|---|
| `exchange_rate_id` | uuid (PK) |
| `name` | text |
| `rate_cup` | numeric(12,2) |
| `description` | text |
| `active` | boolean |
| `created_at` / `updated_at` | timestamptz |

RN-010 (una sola tasa activa a la vez) se aplica en la UI (`RazonCambioPage.tsx`), no como constraint de base de datos. Puede sincronizarse automáticamente con la API de El Toque (ver sección 22).

**15. `public.businesses`**

| Campo | Tipo |
|---|---|
| `business_id` | uuid (PK) |
| `name` | text |
| `payment_method` | text |
| `active` | boolean |
| `area_id` | uuid (FK a `areas`) |
| `contact_name` / `phone` / `email` / `contract_name` / `tax_id` / `address` / `external_url` | text |
| `cup_account` / `personal_account` / `check_account` / `exterior_zelle` / `exterior_tropipay` / `exterior_transfer` | jsonb — sub-objeto de forma variable según el método de pago elegido |
| `created_at` / `updated_at` | timestamptz |

**16. `public.import_sources`** — Documentos de Importación (agregado 2026-09-22)

| Campo | Tipo |
|---|---|
| `import_source_id` | uuid (PK) |
| `entity_type` | `businesses` / `messengers` |
| `name` | text — nombre de referencia |
| `sheet_document_id` | text — ID del Google Sheet de origen |
| `active` | boolean |
| `created_at` / `updated_at` | timestamptz |

Catálogo de IDs de Google Sheet para la Importación Masiva de Gestión de Negocios/Mensajeros (Configuración → Documentos de Importación). No guarda datos importados — al ejecutar la importación se listan las pestañas reales del documento vía la API de Google Sheets y se elige cuál contiene los datos (por defecto, la que coincide con "Data Negocios"/"Data Mensajeros").

### Funciones auxiliares (equivalente a las "reglas de seguridad" que tenía Firestore)

| Función | Uso |
|---|---|
| `current_user_role()` | Rol del usuario autenticado actual — devuelve `NULL` si `active = false` |
| `is_admin_or_supervisor()` | `super_admin` o `supervisor` |
| `can_execute_processes()` | `super_admin`, `supervisor` u `operador` (puede ejecutar Verificaciones) |
| `is_active_user()` | Usado por las políticas de solo lectura — ¿el perfil está autorizado? |
| `normalize_fuzzy(text)` | RN-005 — coincidencia difusa (Dispatcher) |
| `normalize_exact(text)` | RN-012 — coincidencia exacta con trim (Disponibilidad) |

### Row Level Security (RLS) — resumen

Todas las tablas tienen RLS activo. Resumen por tipo de política:

- **Lectura** (`areas`, `dispatcher*`, `availability*`, `messengers`, `payment_methods`, `exchange_rates`, `businesses`): requiere `is_active_user()` — solo usuarios autorizados (sección 19.3.1) pueden leer, sin importar el rol (Visitante incluido).
- **`profiles`**: cada usuario lee su propio registro (o cualquier `super_admin`/`supervisor` lee todos); solo `super_admin` puede editar el rol/estado de otro usuario.
- **`audit_logs`**: cualquier usuario con permiso de ejecución inserta su propio log; solo `super_admin`/`supervisor` lo leen.
- **Verificaciones e incidencias** (`dispatcher_verifications`, `availability_verifications`, `dispatcher_incidents`, `availability_incidents`, `dispatcher_changes`): insertar requiere `can_execute_processes()`.
- **Importaciones** (`dispatcher`, `availabilities`, `availability_imports`): insertar requiere `is_admin_or_supervisor()`.
- **Edición/eliminación manual** en `dispatcher` y `availabilities` (Revisión): requiere `is_admin_or_supervisor()`.
- **Catálogos** (`areas`, `messengers`, `payment_methods`, `exchange_rates`, `businesses`): CRUD completo (`for all`) solo `super_admin`.

### Tablas pendientes — módulo financiero sin diseñar ⏳

> A diferencia de la versión anterior de este documento (que listaba `Stores`/`Drivers`/`PaymentMethods`/`ExchangeRates` como pendientes — las 4 ya están implementadas arriba, como `businesses`, `messengers`, `payment_methods` y `exchange_rates`), lo que realmente queda sin construir es el **módulo financiero**: Conciliación, Facturación, Cuentas por Cobrar, Cuentas por Pagar y Planificación de Pagos.

| Módulo | Estado |
|---|---|
| Conciliación | ⏳ solo UI con `MOCK_DATA`, sin tabla |
| Facturación | ⏳ solo UI con `MOCK_DATA`, sin tabla |
| Cuentas por Cobrar | ⏳ solo UI con `MOCK_DATA`, sin tabla |
| Cuentas por Pagar | ⏳ solo UI con `MOCK_DATA`, sin tabla |
| Planificación de Pagos | ⏳ solo UI con `MOCK_DATA`, sin tabla |

Ninguna de estas páginas se relaciona hoy con `dispatcher`, `businesses` o `messengers`, y no hay reglas de negocio documentadas para calcular comisiones desde las órdenes, el desglose Efectivo/Transferencia/Saldo Mandao, ni impuestos. Diseñar ese esquema requiere primero esas reglas de negocio — pospuesto explícitamente hasta contar con ellas (decisión 2026-09-10).

---

## 13. Riesgos operativos conocidos

El sistema debe manejar estos riesgos de forma explícita. El agente AI debe tenerlos en cuenta al generar lógica de lectura de Google Sheets y de importación.

| Código | Riesgo | Manejo esperado |
|---|---|---|
| R-001 | Google Sheet sin acceso | Detener proceso, mostrar error descriptivo con código |
| R-002 | Hojas eliminadas o renombradas | Detectar ausencia de hoja Orders/Cambios, generar incidencia |
| R-003 | Columnas modificadas | Validar estructura de columnas antes de procesar |
| R-004 | Duplicidad de órdenes | RN-009: bloquear re-importación |
| R-005 | Órdenes con cambios no reflejados | RN-001: validar hoja Cambios |
| R-006 | Importación duplicada | Verificar existencia previa en Supabase (Postgres) por área y fecha |
| R-007 | Nombres escritos de forma diferente | RN-005: coincidencia difusa |
| R-008 | Errores monetarios | Validar tipos numéricos, RN-004 para campos en cero |

---

## 14. Navegación y estructura de archivos

### Estructura de carpetas completa del sistema

```
src/
  design-system/         ← importado desde @mandao/design-system
  modules/
    dispatcher/          ← ✅ FASE ACTUAL (detallado en sección 5)
    dashboard/           ← ⏳ fase posterior
    negocios/            ← ⏳ fase posterior
    mensajeros/          ← ⏳ fase posterior
    configuracion/       ← ⏳ fase posterior
  shell/
    Sidebar.tsx          ← incluye link de retorno a Mandao Finance
    Topbar.tsx
    AppShell.tsx
  hooks/
  lib/
    supabase.ts          ← cliente Supabase, signInWithGoogle, logAuditEvent
    auth.tsx             ← AuthProvider/useAuth (roles, sesión)
    formatters/          ← importados desde @mandao/design-system
    permissions/
      index.ts           ← permisos por rol y módulo
    statusMaps/
      conciliaciones.ts  ← mapa de estados de este sistema
  router.tsx
```

### Convención de rutas — fase actual

```
/dispatcher/verificacion           ← Verificación Dispatcher  ✅
/dispatcher/revision               ← Revisión Dispatcher      ✅
```

### Convención de rutas — fase posterior

```
/                                  ← Dashboard
/negocios/conciliacion
/negocios/facturacion
/negocios/cuentas-pagar
/negocios/cuentas-cobrar
/negocios/planificacion-pagos
/negocios/gestion
/negocios/gestion/:id
/mensajeros/conciliacion
/mensajeros/facturacion
/mensajeros/cuentas-pagar
/mensajeros/cuentas-cobrar
/mensajeros/planificacion-pagos
/mensajeros/gestion
/mensajeros/gestion/:id
/configuracion/roles
/configuracion/usuarios
/configuracion/areas
/configuracion/metodos-pago
/configuracion/razones-cambio
```

### Breadcrumbs obligatorios

Todos los breadcrumbs siguen el patrón: `Mandao Conciliaciones / [Módulo] / [Submódulo] / [Registro]`

```
Mandao Conciliaciones / Dispatcher / Verificación
Mandao Conciliaciones / Dispatcher / Revisión
```

### NavConfig del módulo Dispatcher — estructura obligatoria

```ts
export const navConfig = {
  id: "dispatcher",
  label: "Dispatcher",
  icon: "FileSpreadsheet",
  path: "/dispatcher",
  group: "operaciones",
  permission: "dispatcher:read",
  children: [
    { id: "dispatcher-verificacion", label: "Verificación", path: "/dispatcher/verificacion", permission: "dispatcher:verify" },
    { id: "dispatcher-revision",     label: "Revisión",     path: "/dispatcher/revision",     permission: "dispatcher:review" },
  ]
} satisfies NavConfigItem;
```

---

## 15. Reglas verificables exclusivas de Conciliaciones

Estas reglas son adicionales a las de la Constitución y aplican **solo** a este sistema.

### Flujo y secuencia — fase actual

- ❌ Habilitar el botón "Importar" cuando existen incidencias críticas (RN-006)
- ❌ Permitir la importación sin verificación previa correcta (RN-007)
- ❌ Importar órdenes duplicadas para la misma área y fecha (RN-009)
- ❌ Permitir ejecutar Verificación a usuarios con Rol `Operador` o `Visitante`
- ❌ Permitir ejecutar Importación a usuarios con Rol `Operador` o `Visitante`
- ✅ El campo `ID Documento Google Sheet` en Áreas es obligatorio y debe validarse antes de ejecutar Verificación

### Google Sheets y datos externos

- ❌ Proceder con la verificación si el Google Sheet no es accesible (R-001)
- ❌ Ignorar la hoja Cambios si tiene registros — debe validarse contra Orders (RN-001)
- ✅ Aplicar coincidencia difusa siempre al comparar nombres (RN-005)

### Trazabilidad

- ❌ Ejecutar una importación sin registrar el log completo en `public.audit_logs` (RN-008)
- ✅ Toda acción ejecutiva (verificar, importar) debe registrar usuario, fecha y hora

---

## 16. Anti-patrones específicos de Conciliaciones

Estos patrones están **expresamente prohibidos** en este sistema, en adición a los definidos en la Constitución:

- ❌ Mostrar el botón "Importar" cuando la verificación tiene incidencias críticas
- ❌ Navegar a otra página para mostrar el resultado de la Verificación — el resultado va en la misma vista
- ❌ Procesar montos monetarios sin usar el formatter `formatCurrency`
- ❌ Crear tablas en Supabase que no estén documentadas en la sección 12
- ❌ Omitir el campo `area` en cualquier registro del Dispatcher — es identificador clave
- ❌ Construir la lógica de permisos solo en el UI — debe estar también en políticas RLS de Supabase o funciones de servidor
- ❌ Usar campos de texto libre para Área donde debe haber un selector
- ❌ Implementar cualquier módulo marcado como ⏳ en este documento

---

## 17. Extensibilidad — nuevos módulos futuros

Este documento está diseñado para crecer. Al agregar nuevos módulos al sistema Conciliaciones, se deben seguir estas pautas.

### Checklist para activar un módulo pendiente

- [ ] Reemplazar el bloque `> ⏳ Pendiente...` de la sección correspondiente con la especificación completa
- [ ] Crear la carpeta en `src/modules/[nombre-modulo]/` con la estructura estándar
- [ ] Definir `navConfig.ts` con todos los campos requeridos
- [ ] Registrar la ruta en `router.tsx`
- [ ] Definir los permisos en `src/lib/permissions/index.ts`
- [ ] Documentar los nuevos estados en `src/lib/statusMaps/conciliaciones.ts` y activarlos en la sección 11
- [ ] Mover las tablas de Supabase del módulo de "pendientes" a "activas" en la sección 12 (crear las tablas reales en `supabase_schema.sql`, con sus políticas RLS)
- [ ] Activar las Reglas de Negocio del módulo en la sección 10 (quitar la nota ⏳)
- [ ] Implementar el `EmptyState` del módulo con ícono Lucide relevante
- [ ] Implementar los estados de loading (skeleton) y error
- [ ] Configurar el breadcrumb del módulo

### Plantilla de documentación para nuevos módulos

Cuando se agreguen especificaciones de un nuevo módulo a este documento, seguir esta estructura:

```md
## [N]. Módulo [Nombre]

> ✅ MÓDULO EN IMPLEMENTACIÓN ACTIVA.

### Descripción
[Qué hace este módulo y por qué existe]

### Estructura de carpetas del módulo

### Submódulos
#### [N.1] Submódulo [Nombre]
- Entradas
- Flujo funcional
- Salida
- UI/UX
- Reglas de negocio asociadas

### Estados específicos del módulo (si aplica)

### Tablas de Supabase del módulo (si aplica)
```

---

> **Nota para el agente AI**: Este documento es la fuente de verdad para el sistema Mandao Conciliaciones. Ante cualquier duda sobre comportamiento esperado, lógica de negocio, permisos o estructura, consultar primero este documento y la Constitución general. Si una especificación no está aquí ni en la Constitución, **pedir confirmación antes de asumir o implementar**. Los bloques marcados con ⏳ no deben tocarse bajo ninguna circunstancia hasta que sean reemplazados con su especificación completa.

---

## 18. Módulo Disponibilidad

> ✅ **MÓDULO EN IMPLEMENTACIÓN ACTIVA.**

### Descripción

Gestiona el proceso de verificación e importación de los registros de disponibilidad de Mensajeros registrados en la hoja **Disponibilidades** del Google Sheet del Dispatcher. Permite validar que los mensajeros reportados en la hoja existan en la Base de Datos antes de importar la información, y luego consultar los registros importados mediante filtros.

> **Relación con el módulo Dispatcher**: comparte el mismo documento Google Sheet del Área, pero opera sobre una hoja diferente (`Disponibilidades`). El selector de Área/Dispatcher es el mismo mecanismo ya definido en el módulo Dispatcher (sección 5), reutilizando el campo `sheet_document_id` de la tabla `public.areas` (Supabase).

### Estructura de carpetas del módulo

```
src/modules/disponibilidad/
  index.ts
  routes.tsx
  navConfig.ts
  pages/
    VerificacionDisponibilidadPage.tsx
    RevisionDisponibilidadPage.tsx
  components/
    IncidenciasDisponibilidadList.tsx
    VerificacionDisponibilidadResultCard.tsx
    ImportacionDisponibilidadModal.tsx
    DisponibilidadTable.tsx
  hooks/
    useVerificacionDisponibilidad.ts
    useImportacionDisponibilidad.ts
    useRevisionDisponibilidad.ts
  schemas/
    disponibilidad.schema.ts
  types.ts
```

---

### 18.1 Submódulo Verificación Disponibilidad

#### Descripción

Valida que los nombres de Mensajeros registrados en la hoja **Disponibilidades** del Google Sheet existan exactamente en la tabla `public.messengers` de Supabase (Postgres), dentro del rango de fechas seleccionado por el campo `Fecha de la disponibilidad`.

#### Precondiciones

- Usuario autenticado con Rol `Super Admin` o `Supervisor`
- Área configurada en el sistema con `sheetDocumentId` válido
- Acceso activo al Google Sheet del Área
- La hoja `Disponibilidades` debe existir en el documento

#### Entradas del proceso

| Campo | Tipo | Requerido |
|---|---|---|
| Área / Dispatcher | Selector (desde tabla `public.areas`, registros activos) | ✅ |
| Fecha Inicial | DatePicker (filtra por `Fecha de la disponibilidad`) | ✅ |
| Fecha Final | DatePicker (filtra por `Fecha de la disponibilidad`) | ✅ |

#### Estructura de la hoja Disponibilidades

Estos son los campos exactos de la hoja fuente. El agente AI debe mapearlos con estos nombres al leer el Google Sheet:

| Columna en Google Sheet | Campo interno del sistema |
|---|---|
| `Timestamp` | `timestamp` |
| `Email Address` | `emailAddress` |
| `No. Orden` | `orderId` |
| `Fecha de la disponibilidad` | `availabilityDate` |
| `Motivo` | `reason` |
| `Area o persona que solicta la transportacion` | `requestedBy` |
| `Mensajero` | `messengerName` |
| `Monto a pagar` | `amountToPay` |
| `Provincias` | `province` |
| `Comentario` | `comment` |

> **Nota crítica**: el nombre de la columna `Area o persona que solicta la transportacion` contiene un error tipográfico intencional en la fuente (`solicta` en lugar de `solicita`). El sistema debe leerla **exactamente como está escrita** en el Google Sheet, sin corregirla, para no perder la referencia de la columna.

#### Flujo funcional detallado

```
Usuario selecciona Área
        ↓
Usuario selecciona Fecha Inicial y Fecha Final
        ↓
Sistema accede al Google Sheet del Área (sheetDocumentId)
        ↓
Sistema localiza la hoja "Disponibilidades"
        ↓
    ┌────────────────────────────────────────┐
    │ ¿La hoja "Disponibilidades" existe?    │
    └────────────────────────────────────────┘
         No ↓                     Sí ↓
    Error R-009               Filtrar filas por
    Detener proceso           "Fecha de la disponibilidad"
                              dentro del rango seleccionado
                                        ↓
                              Extraer columna "Mensajero"
                              de cada fila filtrada
                                        ↓
                              Para cada nombre en "Mensajero":
                              Buscar en tabla public.messengers
                              coincidencia EXACTA (RN-012)
                                        ↓
                    ┌───────────────────────────────────┐
                    │ ¿Existen nombres sin coincidencia? │
                    └───────────────────────────────────┘
                         Sí ↓                  No ↓
                    Generar incidencias   Estado: Verificación Correcta
                    críticas por cada             ↓
                    nombre no encontrado  Habilitar botón "Importar"
                         ↓
                    Mostrar tabla de
                    incidencias con
                    ubicación en la hoja
```

#### Regla de validación de nombres — RN-012

La comparación entre el nombre en la columna `Mensajero` de la hoja y el campo `name` correspondiente en la tabla `public.messengers` de Supabase debe ser **exacta**, respetando:

- Mayúsculas y minúsculas — `Juan Perez` ≠ `juan perez`
- Tildes y caracteres diacríticos — `José` ≠ `Jose`
- Espacios en blanco al inicio y al final — `" Juan Perez"` ≠ `"Juan Perez"` (el sistema debe hacer **trim** al leer la hoja y comparar contra el valor limpio registrado en Supabase)
- Espacios dobles internos — `"Juan  Perez"` ≠ `"Juan Perez"`

> **Diferencia clave con RN-005**: el módulo Dispatcher usa coincidencia difusa (fuzzy). El módulo Disponibilidad usa coincidencia **exacta** con trim. Ambas reglas coexisten en el sistema pero aplican a módulos distintos. El agente AI no debe aplicar RN-005 en este módulo bajo ninguna circunstancia.

#### Salidas del proceso

| Salida | Descripción |
|---|---|
| Resultado de Verificación | `Correcta` o `Con Incidencias` |
| Listado de Incidencias | Tabla con ubicación exacta en la hoja, nombre encontrado, severidad |
| Habilitación de Importación | Solo si resultado = `Correcta` |

#### Formato del listado de incidencias

Cuando se detectan nombres no encontrados, la tabla de incidencias debe mostrar:

| Columna | Descripción |
|---|---|
| Fila | Número de fila en la hoja Disponibilidades donde ocurre el problema |
| Fecha de la disponibilidad | Valor de esa fila |
| Mensajero (en hoja) | Nombre exacto tal como aparece en el Google Sheet |
| Motivo | `Mensajero no encontrado en la Base de Datos` |
| Severidad | `critica` — usando token `--color-danger` e ícono `AlertOctagon` |

#### Flujos alternativos

- **A1 — Hoja Disponibilidades no existe en el documento**: error R-009, detener proceso y mostrar mensaje descriptivo
- **A2 — Google Sheet inaccesible**: error R-001, detener proceso (igual que en módulo Dispatcher)
- **A3 — Rango de fechas sin registros**: mostrar estado vacío con mensaje informativo, sin generar incidencias ni habilitar importación
- **A4 — Columna Mensajero con celda vacía**: tratar como incidencia crítica — una fila sin mensajero asignado no puede importarse

#### UI/UX de la vista Verificación Disponibilidad

- El formulario de parámetros (Área + Fechas) se muestra en un **panel superior fijo**, igual que en Verificación Dispatcher — no en modal ni slide-over
- El resultado se muestra **en la misma página**, debajo del panel de parámetros, sin navegar a otra vista
- Si hay incidencias, se muestra la tabla de incidencias con los 6 elementos de anatomía obligatoria de tablas (sección 9 de la Constitución)
- Si no hay incidencias, se muestra el card de resultado `Correcta` con el botón **"Importar Disponibilidades"**
- El botón "Importar Disponibilidades" **solo es visible** cuando el resultado es `Correcta` y el usuario tiene rol `Super Admin` o `Supervisor`
- El botón "Exportar PDF" y "Enviar por Correo" son accesibles para `Super Admin`, `Supervisor` y `Operador`

---

### 18.2 Submódulo Importación Disponibilidad

#### Descripción

Guarda en Supabase (Postgres) los registros de la hoja **Disponibilidades** del Google Sheet validados previamente. Solo puede ejecutarse cuando la verificación es correcta.

#### Precondiciones — todas deben cumplirse

- Usuario autenticado con Rol `Super Admin` o `Supervisor`
- Estado de Verificación Disponibilidad = `Correcta`
- No existe importación previa para el mismo Área y rango de fechas (RN-013)

#### Flujo funcional

```
Usuario presiona "Importar Disponibilidades"
        ↓
Sistema valida resultado de verificación
        ↓
Sistema verifica no-duplicidad por Área y rango de fechas (RN-013)
        ↓
Sistema guarda registros en la tabla public.availabilities (Supabase)
        ↓
Sistema genera registro en public.availability_imports
        ↓
Sistema registra log en public.audit_logs (usuario, fecha, hora, área, resultado)
        ↓
Toast de éxito — botón "Importar" queda deshabilitado
        ↓
Fin — estado actualizado en pantalla
```

#### Salida

- Datos almacenados en Supabase (tabla `public.availabilities`)
- Registro de importación en `public.availability_imports`
- Log de trazabilidad en `public.audit_logs`

#### UI/UX

- La importación se confirma mediante un **Modal simple** de confirmación (≤ 4 campos — solo confirmación), igual que en Importación Dispatcher
- Después de la importación exitosa, se muestra un toast de éxito y el botón "Importar Disponibilidades" queda deshabilitado
- En caso de error, el modal muestra el motivo específico (duplicado, sin permisos, etc.)

---

### 18.3 Submódulo Revisión Disponibilidad

#### Descripción

Muestra los registros de disponibilidad importados en Supabase (Postgres), con filtros para consultar y analizar la información.

#### Precondiciones

- Usuario autenticado con Rol `Super Admin`, `Supervisor` u `Operador`
- Datos previamente importados a Supabase en la tabla `public.availabilities`

#### Entradas / Filtros del proceso

| Campo | Tipo | Requerido |
|---|---|---|
| Fecha Inicial | DatePicker (filtra por `availability_date`) | ✅ |
| Fecha Final | DatePicker (filtra por `availability_date`) | ✅ |
| Área | Selector | ✅ |
| Mensajero | Selector o búsqueda (opcional) | ❌ |
| Motivo | Selector (opcional) | ❌ |

#### Flujo funcional

```
Usuario selecciona filtros
        ↓
Sistema consulta la tabla public.availabilities en Supabase
con los filtros aplicados
        ↓
Sistema muestra resultados en tabla
```

#### Salida

- Tabla con los registros de disponibilidad que coinciden con los filtros seleccionados

#### Columnas de la tabla de resultados

| Columna | Campo en `public.availabilities` (Supabase) | Formatter |
|---|---|---|
| Fecha | `availability_date` | `formatDate` |
| Mensajero | `messenger_name` | — |
| Motivo | `reason` | — |
| Solicitado por | `requested_by` | — |
| Monto a pagar | `amount_to_pay` | `formatCurrency` |
| Provincia | `province` | — |
| Comentario | `comment` | — |
| No. Orden | `order_id` | — |
| Área | `area_id` (resuelto contra `public.areas.name`) | — |

#### UI/UX

- Tabla con los 6 elementos de anatomía obligatoria (sección 9 de la Constitución)
- Estado vacío con ícono Lucide `CalendarOff` y mensaje descriptivo cuando no hay registros para los filtros seleccionados
- Filtros opcionales (Mensajero, Motivo) se muestran en un panel colapsable o como chips sobre la tabla — **nunca** en modal ni slide-over
- El campo `amount_to_pay` usa siempre el formatter `formatCurrency` y clase `tabular-nums`

---

### 18.4 Reglas de negocio del módulo Disponibilidad

#### RN-012 — Coincidencia Exacta de Mensajeros (Disponibilidad)

La validación de nombres de Mensajeros en este módulo es **estricta y exacta**. No aplica coincidencia difusa (RN-005). El sistema debe:

1. Leer el valor de la columna `Mensajero` de la hoja
2. Aplicar **trim** (eliminar espacios al inicio y al final)
3. Buscar el valor resultante en la tabla `public.messengers` de Supabase con coincidencia exacta, respetando mayúsculas, minúsculas y tildes
4. Si no hay coincidencia exacta → incidencia crítica para esa fila

#### RN-013 — Control de Duplicados en Disponibilidad

Un conjunto de registros de disponibilidad **no puede importarse más de una vez** para la misma Área y rango de fechas. Si ya existe un registro importado para esa combinación en `public.availability_imports`, el sistema debe bloquear la importación y mostrar un error descriptivo.

#### RN-014 — Celda Mensajero Vacía

Una fila de la hoja Disponibilidades con la columna `Mensajero` vacía o con solo espacios en blanco genera automáticamente una **incidencia crítica** y bloquea la importación de todo el lote. No se permite importar un registro de disponibilidad sin mensajero asignado.

---

### 18.5 Estados del módulo Disponibilidad

Todos los estados usan los tokens semánticos de la Constitución. Nunca crear estados ad-hoc ni usar colores hex directos.

#### Estados de Verificación Disponibilidad

| Estado | Token | Badge Label | Ícono Lucide |
|---|---|---|---|
| `pendiente` | neutral | Pendiente | `Clock` |
| `correcta` | `--color-success` | Correcta | `BadgeCheck` |
| `con_incidencias` | `--color-danger` | Con Incidencias | `AlertOctagon` |

#### Estados de Importación Disponibilidad

| Estado | Token | Badge Label | Ícono Lucide |
|---|---|---|---|
| `no_importado` | neutral | No Importado | `Upload` |
| `importado` | `--color-success` | Importado | `CheckCircle2` |
| `importacion_duplicada` | `--color-danger` | Duplicado | `AlertCircle` |

---

### 18.6 Tablas de Supabase del módulo Disponibilidad

> El detalle completo de columnas y tipos vive en la sección 12 (Diseño de base de datos Supabase), que es la fuente de verdad única del esquema — aquí solo se listan para referencia rápida, para no mantener dos copias de la misma información.

- `public.availabilities` — copia de las filas de la hoja Disponibilidades del Google Sheet, filtradas por el rango de fechas importado. Incluye `import_id` como FK a `availability_imports`.
- `public.availability_imports` — un registro por cada importación ejecutada (área + rango de fechas + quién y cuándo).
- `public.availability_verifications` — un registro por cada verificación ejecutada (`status`, totales de registros e incidencias).
- `public.availability_incidents` — incidencias críticas detectadas en una verificación (mensajero no encontrado, celda vacía), con FK a `availability_verifications`.

---

### 18.7 Rutas del módulo Disponibilidad

```
/disponibilidad/verificacion       ← Verificación Disponibilidad  ✅
/disponibilidad/revision           ← Revisión Disponibilidad       ✅
```

Breadcrumbs:

```
Mandao Conciliaciones / Disponibilidad / Verificación
Mandao Conciliaciones / Disponibilidad / Revisión
```

### NavConfig del módulo Disponibilidad

```ts
export const navConfig = {
  id: "disponibilidad",
  label: "Disponibilidad",
  icon: "CalendarCheck",
  path: "/disponibilidad",
  group: "operaciones",
  permission: "disponibilidad:read",
  children: [
    { id: "disponibilidad-verificacion", label: "Verificación", path: "/disponibilidad/verificacion", permission: "disponibilidad:verify" },
    { id: "disponibilidad-revision",     label: "Revisión",     path: "/disponibilidad/revision",     permission: "disponibilidad:review" },
  ]
} satisfies NavConfigItem;
```

---

### 18.8 Riesgos operativos del módulo Disponibilidad

| Código | Riesgo | Manejo esperado |
|---|---|---|
| R-009 | Hoja `Disponibilidades` no encontrada en el documento | Detener proceso, mostrar error descriptivo con código R-009 |
| R-010 | Columna `Mensajero` con celdas vacías | RN-014: incidencia crítica por fila, bloquear importación |
| R-011 | Nombre de Mensajero con espacios sobrantes | RN-012: aplicar trim antes de comparar |
| R-012 | Importación duplicada de disponibilidades | RN-013: verificar existencia en `public.availability_imports` por área y rango |
| R-013 | Tabla `public.messengers` vacía o inaccesible | Detener verificación y mostrar error descriptivo indicando que no hay mensajeros registrados en la Base de Datos |

---

### 18.9 Anti-patrones específicos del módulo Disponibilidad

- ❌ Aplicar coincidencia difusa (RN-005) en la validación de nombres de Mensajeros — en este módulo la comparación es siempre exacta (RN-012)
- ❌ Permitir importar si existe al menos una incidencia crítica
- ❌ Navegar a otra página para mostrar el resultado de la Verificación — el resultado va en la misma vista
- ❌ Mostrar el botón "Importar Disponibilidades" a usuarios con Rol `Operador` o `Visitante`
- ❌ Importar una fila con la columna `Mensajero` vacía o solo con espacios (RN-014)
- ❌ Omitir el campo `area_id` en los registros guardados en `public.availabilities`
- ❌ Leer la columna fuente corrigiendo el error tipográfico (`solicta`) — debe leerse exactamente como está en el Google Sheet
- ❌ Procesar el campo `amount_to_pay` sin convertirlo a `number` y sin usar `formatCurrency` para mostrarlo

---

## 19. Backend y persistencia de datos — Migración a Supabase

> 🆕 Sección agregada. Documenta la migración del backend de Firebase (Auth + Firestore) a Supabase (Auth + Postgres). **Actualización 2026-09-13**: las secciones 1–18 ya se corrigieron para hablar de Supabase (Postgres) directamente — Firestore no existe más en este sistema, y la sección 12 documenta el esquema real completo. La fuente de verdad formal del esquema es `supabase_schema.sql`, en la raíz del repo.

### 19.1 Estado de la migración

- Esquema completo definido y validado en `supabase_schema.sql`: **16 tablas** (detalle completo en la sección 12), con políticas **RLS** activas en todas ellas, más funciones auxiliares (helper functions).
- Se retiraron del esquema las tablas `email_groups` y `email_templates` (correspondientes a las colecciones `EmailGroups`/`EmailTemplates` que documentaba la versión anterior de este documento, basada en Firestore — nunca tuvieron uso real en el código).
- Ya migrados y en uso real sobre Supabase: Auth, Dispatcher (Verificación/Revisión), Disponibilidad (Verificación/Revisión), y todo Gestión (Áreas, Mensajeros, Negocios, Métodos de Pago, Razón de Cambio, Roles y Usuarios, Logs de Auditoría). Ningún archivo del código activo importa ya `src/lib/firebase` (esa ruta no existe).
- Pendiente de diseñar (sin tabla propia todavía): Conciliación, Facturación, Cuentas por Cobrar, Cuentas por Pagar y Planificación de Pagos — ver "Tablas pendientes" al final de la sección 12.

### 19.2 Autenticación

- Proveedor: **Supabase Auth**, con Google OAuth configurado vía Google Cloud ("Google Auth Platform").
- Se preservan los scopes de Google para **Sheets** y **Gmail**: el sistema sigue leyendo Google Sheets directamente y enviando correo desde la cuenta del usuario autenticado, usando el `google_access_token` almacenado en `session storage`.

### 19.3 Roles — nota de correspondencia con la sección 4

La sección 4 de este documento agrupa "Super Admin" y "Supervisor" en una sola fila de permisos. En Supabase, esos siguen siendo **roles distintos** almacenados en `profiles.role`, con **4 valores fijos**:

- `super_admin`
- `supervisor`
- `operador`
- `visitante`

Este esquema reemplaza el sistema anterior basado en patrones de email. La matriz de permisos de la sección 4 sigue siendo válida como referencia funcional; la diferencia es a nivel de almacenamiento (dos valores de rol con el mismo conjunto de permisos, en vez de uno).

### 19.3.1 Modelo de autorización: autenticarse ≠ tener acceso (agregado 2026-09-10)

Pertenecer al dominio `@mandao.app` (Google Workspace) permite **autenticarse**, pero no otorga acceso al sistema por sí solo:

- Todo `profile` nuevo se crea con `active = false` ("pendiente de autorización") — el trigger `handle_new_user()` ya no lo activa automáticamente como antes.
- Mientras `active = false`, la app muestra una pantalla de "Cuenta pendiente de aprobación" (`src/modules/auth/PendingApprovalPage.tsx`) en vez del sistema — la sesión de Supabase Auth es válida, pero no hay acceso funcional.
- Un **Super Admin** debe encontrar a la persona en **Roles y Usuarios**, asignarle uno de los 4 roles y marcarla como **Autorizada** (`active = true`). También puede invitarla de antemano por correo con el botón "Nuevo Usuario" (sin que la persona haya iniciado sesión todavía), que la autoriza de inmediato con el rol elegido.
- La barrera es real a nivel de base de datos, no solo de UI: `current_user_role()` devuelve `NULL` para un usuario inactivo (por lo que niega toda escritura), y las políticas de solo lectura usan `public.is_active_user()` en vez de solo comprobar "está logueado" (ver `supabase_schema.sql` y `supabase/migrations/2026-09-10_require_active_profile.sql`).
- Antes de este cambio, cualquier cuenta `@mandao.app` que iniciara sesión ya podía **leer** todo el sistema como Visitante en cuanto Google la autenticaba — ese hueco quedó cerrado.

### 19.4 Actores del sistema (actualización de la sección 4)

> Resuelto 2026-09-13: la sección 4 ya lista directamente **Supabase (Postgres)** como actor no humano — esta subsección queda solo como registro histórico del cambio (antes decía "Firestore").

---

## 20. Hosting en Google Cloud

> 🆕 Sección agregada. El sistema debe quedar desplegado y accesible para otros usuarios (no solo en entorno local), usando Google Cloud como proveedor de hosting.

### 20.1 Opciones de despliegue para el frontend (React/Vite)

- **Cloud Run** (recomendado, elegido): empaquetar el build de producción (`npm run build`) en un contenedor con un servidor estático liviano (nginx) y desplegarlo como servicio. Escala a cero, HTTPS incluido, fácil de actualizar en cada release.
- **Cloud Storage + Cloud CDN/Load Balancer**: alternativa más económica para hosting puramente estático, sin contenedor. Descartada por ahora a favor de Cloud Run.

### 20.2 Artefactos de despliegue (ya en el repo)

- `Dockerfile` (raíz del repo): build multi-stage — `node:20-alpine` compila con `npm run build`, y `nginx:1.27-alpine` sirve el resultado. `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `GEMINI_API_KEY` se pasan como `--build-arg` porque Vite los incrusta en el bundle en tiempo de **build**, no de runtime (ver `vite.config.ts`).
- `nginx.conf` (raíz del repo): sirve `dist/` en el puerto `8080` (el que espera Cloud Run) con fallback de SPA (`try_files ... /index.html`) para que `react-router-dom` funcione en rutas directas.
- `.dockerignore`: excluye `node_modules`, `.env*`, `.git`, etc. del contexto de build.

Despliegue manual de referencia (ver también `README.md`):

```bash
gcloud builds submit \
  --tag gcr.io/<PROYECTO_GCP>/mandao-conciliaciones

gcloud run deploy mandao-conciliaciones \
  --image gcr.io/<PROYECTO_GCP>/mandao-conciliaciones \
  --region <region> \
  --allow-unauthenticated
```

(`gcloud builds submit` con un `Dockerfile` que usa `ARG` requiere pasar los build args vía `--config` con un `cloudbuild.yaml`, o construir con `docker build --build-arg ...` y `docker push` si se prefiere hacerlo desde una máquina con Docker local.)

### 20.3 Pendientes de definición (requieren una decisión/acción del equipo, no del código)

- **Proyecto de Google Cloud**: se decidió crear un proyecto nuevo dedicado a producción (no reutilizar el proyecto de AI Studio `gen-lang-client-0443536572`). Falta crearlo y anotar aquí su ID.
- **OAuth Client ID de Google**: reconfigurar en el proyecto nuevo, con pantalla de consentimiento tipo **"Interna"** (restringida a la organización `mandao.app`) — es la barrera real de acceso; el código ya trae una segunda capa de verificación de dominio (`src/lib/auth.tsx`, `ALLOWED_EMAIL_DOMAIN` en `src/lib/supabase.ts`).
- **Dominio o subdominio** de acceso para los usuarios finales (ej. `conciliaciones.mandao.app`) — pendiente de elegir y mapear vía Cloud Run Domain Mappings + DNS.
- **Gestión de secretos** en Cloud Build/Cloud Run (Secret Manager u otro mecanismo) para `SUPABASE_URL`, `SUPABASE_ANON_KEY` y el Client ID — nunca hardcodeados ni subidos al repositorio.
- **Pipeline de despliegue**: manual al inicio (`gcloud run deploy`), automatizable después vía GitHub Actions.

---

## 21. Colaboración en GitHub y trabajo en paralelo

> 🆕 Sección agregada. El repositorio ya está sincronizado con el proyecto local. Estas reglas aplican para que otros usuarios puedan colaborar en paralelo sin pisarse el trabajo.

1. **Invitar colaboradores** al repositorio (GitHub → Settings → Collaborators, o vía organización si aplica).
2. **Rama `main` protegida**: evitar pushes directos; toda integración de cambios pasa por Pull Request.
3. **Convención de ramas**: una rama por feature/fix (ej. `feature/conciliacion-modulo`, `fix/roles-usuarios`).
4. **Revisión de Pull Requests** antes de mergear a `main`, para reducir conflictos entre quienes trabajan en paralelo.
5. **Variables sensibles** (claves de Supabase, credenciales OAuth) nunca se suben al repo — usar `.env` (incluido en `.gitignore`) y compartir credenciales por un canal seguro aparte.
6. Cada colaborador debe tener acceso controlado al proyecto de Supabase (propio entorno de desarrollo o acceso compartido, según se decida) y a las variables de entorno necesarias para levantar el proyecto en local.

---

## 22. Integración de Razón de Cambio con la API de El Toque

> 🆕 Sección agregada. `RazonCambioPage.tsx` sigue permitiendo cargar tasas manualmente, pero además puede sincronizar automáticamente la tasa informal USD/CUP publicada por El Toque (https://tasas.eltoque.com/docs/).

### 22.1 Piezas involucradas

- `supabase/functions/sync-exchange-rate/index.ts` — Edge Function (Deno) que llama a `GET https://tasas.eltoque.com/v1/trmi` con un token Bearer y hace upsert de la fila `exchange_rates` llamada **"Tasa Informal (El Toque)"**. No decide cuál tasa queda "activa" — eso lo sigue controlando un Super Admin desde la UI (regla RN-010, una sola tasa activa a la vez).
- `supabase/migrations/2026-09-10_exchange_rate_cron.sql` — programa un job de `pg_cron` que invoca la función todos los días a las 08:00 hora de Cuba.
- Botón **"Sincronizar con El Toque"** en `RazonCambioPage.tsx` (visible solo para quien puede gestionar catálogos) — invoca la misma función bajo demanda, autenticado con la sesión del usuario.

### 22.2 Pendientes de definición (requieren acción directa, no solo código)

- **Token de El Toque**: solicitarlo en https://tasas-token.eltoque.com/ (formulario propio de El Toque, gratuito). Nunca pegarlo en el código ni en el chat — se guarda como secreto de la función:
  ```bash
  npx supabase functions deploy sync-exchange-rate --no-verify-jwt
  npx supabase secrets set ELTOQUE_API_TOKEN=<token>
  npx supabase secrets set CRON_SECRET=<una cadena aleatoria larga>
  ```
- **Vault de Supabase**: guardar ese mismo `CRON_SECRET` en el Vault del proyecto (una sola vez, desde el SQL Editor del dashboard — no versionado):
  ```sql
  select vault.create_secret('<el-mismo-valor-de-CRON_SECRET>', 'cron_shared_secret');
  ```
- **Extensiones y cron job**: habilitar `pg_cron`/`pg_net` (Dashboard → Database → Extensions) y correr `supabase/migrations/2026-09-10_exchange_rate_cron.sql` reemplazando `<PROJECT_REF>` por el ref real del proyecto.
- La respuesta 200 de `/v1/trmi` no tiene un schema publicado formalmente; la función soporta las formas conocidas (`{ tasas: { USD } }` o `{ usd }` / `{ USD }` en la raíz). Si El Toque cambia el formato, revisar `supabase/functions/sync-exchange-rate/index.ts`.