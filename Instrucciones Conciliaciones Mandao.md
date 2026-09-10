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
12. [Diseño de base de datos Firestore](#12-diseño-de-base-de-datos-firestore)
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
- **Contexto de negocio**: Mandao opera un servicio de mensajería/delivery. Las órdenes son registradas en un Google Sheet llamado "Dispatcher" y deben ser verificadas, importadas a Firestore, conciliadas por Negocio y por Mensajero, facturadas y planificadas para pago
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
                              Importar a Firestore
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
| **Firestore** | Almacenamiento validado, búsquedas, historial |
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
Valida la consistencia de la información contenida en el Google Sheet del Dispatcher antes de importarla a Firestore.

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
- El botón "Exportar PDF" y "Enviar por Correo" son accesibles para `Super Admin`, `Supervisor` y `Operador`

---

### 5.2 Submódulo Importación

#### Descripción
Guarda en Firestore la información validada del Google Sheet Dispatcher. Solo puede ejecutarse cuando la verificación es correcta.

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
Sistema guarda registros en colección Dispatcher
        ↓
Sistema genera registro en Dispatcher_Imports
        ↓
Sistema registra log en AuditLogs (usuario, fecha, hora, área, resultado)
        ↓
Sistema genera PDF del resultado
        ↓
Sistema envía correo de confirmación
        ↓
Fin — estado actualizado en pantalla
```

#### Salida

- Datos almacenados en Firestore (colección `Dispatcher`)
- Registro de log con trazabilidad completa (RN-008)

#### UI/UX

- La importación se confirma mediante un **Modal simple** de confirmación (≤ 4 campos — solo confirmación)
- Después de la importación exitosa, se muestra un toast de éxito y el botón "Importar" queda deshabilitado
- En caso de error, el modal muestra el motivo específico (duplicado, sin permisos, etc.)

---

### 5.3 Submódulo Revisión

#### Descripción
Compara los datos almacenados en Firestore contra el Dispatcher (Google Sheet) para detectar diferencias entre ambas fuentes.

#### Precondiciones
- Usuario autenticado con Rol `Super Admin`, `Supervisor` u `Operador`
- Datos previamente importados a Firestore

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
Sistema consulta Firestore (registros importados)
        ↓
Sistema consulta Google Sheet Dispatcher
        ↓
Sistema compara registro por registro
        ↓
Sistema muestra diferencias detectadas
```

#### Salida
- Listado de diferencias con indicación de campo, valor en Firestore y valor en Dispatcher

#### UI/UX
- Vista en tabla con columnas: Orden ID | Campo | Valor Firestore | Valor Dispatcher | Diferencia
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

### RN-006 — Bloqueo de Importación

Si existe **al menos una incidencia crítica**, la Importación está **completamente bloqueada**. El botón de importación no debe aparecer ni estar habilitado bajo ninguna circunstancia.

### RN-007 — Importación Solo con Verificación Correcta

La Importación solo puede ejecutarse cuando el estado de la Verificación activa es `Correcta`. Esta validación debe hacerse **en el backend** (regla de Firestore o función de servidor), no solo en el UI.

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

## 12. Diseño de base de datos Firestore

El agente AI no debe crear colecciones adicionales a las aquí documentadas.

> **Alcance actual**: solo las colecciones del Dispatcher deben implementarse en esta fase. Las colecciones de Negocios, Mensajeros y Configuración están documentadas para referencia futura.

### Colecciones activas — Fase actual ✅

#### Colección `Dispatcher`

Copia exacta de la hoja Orders del Google Sheet.

| Campo | Tipo |
|---|---|
| `deliveryDate` | Timestamp |
| `orderDate` | Timestamp |
| `paymentType` | string |
| `customer` | string |
| `customerNumber` | string |
| `driver` | string |
| `store` | string |
| `orderId` | string |
| `productAmount` | number |
| `storeOffer` | number |
| `processingFee` | number |
| `storeAdminCharge` | number |
| `deliveryCharge` | number |
| `extraDeliveryCharge` | number |
| `driverAdminCharge` | number |
| `complementaryDelivery` | string / number |
| `tax` | number |
| `promocode` | string |
| `area` | string |

#### Colección `Dispatcher_Verifications`

| Campo | Tipo |
|---|---|
| `verificationId` | string |
| `area` | string |
| `startDate` | Timestamp |
| `endDate` | Timestamp |
| `verificationDate` | Timestamp |
| `userId` | string |
| `status` | `correcta` / `con_incidencias` |
| `totalOrders` | number |
| `totalChanges` | number |
| `totalIncidents` | number |

#### Colección `Dispatcher_Incidents`

| Campo | Tipo |
|---|---|
| `incidentId` | string |
| `verificationId` | string |
| `orderId` | string |
| `severity` | `critica` / `advertencia` / `informativa` |
| `ruleCode` | string (RN-001, RN-002, etc.) |
| `description` | string |
| `status` | string |

#### Colección `Dispatcher_Imports`

| Campo | Tipo |
|---|---|
| `importId` | string |
| `verificationId` | string |
| `importedBy` | string (userId) |
| `importDate` | Timestamp |
| `recordsImported` | number |

#### Colección `Areas`

| Campo | Tipo |
|---|---|
| `areaId` | string |
| `name` | string |
| `province` | string |
| `sheetDocumentId` | string |
| `description` | string |
| `active` | boolean |

#### Colección `AuditLogs`

| Campo | Tipo |
|---|---|
| `logId` | string |
| `module` | string |
| `action` | string |
| `user` | string |
| `date` | Timestamp |
| `details` | map |

#### Colección `EmailGroups`

| Campo | Tipo |
|---|---|
| `groupId` | string |
| `name` | string |
| `emails` | string[] |

#### Colección `EmailTemplates`

| Campo | Tipo |
|---|---|
| `templateId` | string |
| `name` | string |
| `subject` | string |
| `body` | string |

### Colecciones pendientes — Fase posterior ⏳

> Las siguientes colecciones están documentadas para referencia pero **no deben crearse** hasta que el módulo correspondiente esté en fase activa.

| Colección | Módulo | Estado |
|---|---|---|
| `Stores` | Negocios | ⏳ fase posterior |
| `Drivers` | Mensajeros | ⏳ fase posterior |
| `PaymentMethods` | Configuración | ⏳ fase posterior |
| `ExchangeRates` | Configuración | ⏳ fase posterior |

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
| R-006 | Importación duplicada | Verificar existencia previa en Firestore por área y fecha |
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
    firebase/
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

- ❌ Ejecutar una importación sin registrar el log completo en AuditLogs (RN-008)
- ✅ Toda acción ejecutiva (verificar, importar) debe registrar usuario, fecha y hora

---

## 16. Anti-patrones específicos de Conciliaciones

Estos patrones están **expresamente prohibidos** en este sistema, en adición a los definidos en la Constitución:

- ❌ Mostrar el botón "Importar" cuando la verificación tiene incidencias críticas
- ❌ Navegar a otra página para mostrar el resultado de la Verificación — el resultado va en la misma vista
- ❌ Procesar montos monetarios sin usar el formatter `formatCurrency`
- ❌ Crear colecciones en Firestore que no estén documentadas en la sección 12
- ❌ Omitir el campo `area` en cualquier registro del Dispatcher — es identificador clave
- ❌ Construir la lógica de permisos solo en el UI — debe estar también en reglas de Firestore o funciones de servidor
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
- [ ] Mover las colecciones Firestore del módulo de "pendientes" a "activas" en la sección 12
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

### Colecciones Firestore del módulo (si aplica)
```

---

> **Nota para el agente AI**: Este documento es la fuente de verdad para el sistema Mandao Conciliaciones. Ante cualquier duda sobre comportamiento esperado, lógica de negocio, permisos o estructura, consultar primero este documento y la Constitución general. Si una especificación no está aquí ni en la Constitución, **pedir confirmación antes de asumir o implementar**. Los bloques marcados con ⏳ no deben tocarse bajo ninguna circunstancia hasta que sean reemplazados con su especificación completa.

---

## 18. Módulo Disponibilidad

> ✅ **MÓDULO EN IMPLEMENTACIÓN ACTIVA.**

### Descripción

Gestiona el proceso de verificación e importación de los registros de disponibilidad de Mensajeros registrados en la hoja **Disponibilidades** del Google Sheet del Dispatcher. Permite validar que los mensajeros reportados en la hoja existan en la Base de Datos antes de importar la información, y luego consultar los registros importados mediante filtros.

> **Relación con el módulo Dispatcher**: comparte el mismo documento Google Sheet del Área, pero opera sobre una hoja diferente (`Disponibilidades`). El selector de Área/Dispatcher es el mismo mecanismo ya definido en el módulo Dispatcher (sección 5), reutilizando el campo `sheetDocumentId` de la colección `Areas`.

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

Valida que los nombres de Mensajeros registrados en la hoja **Disponibilidades** del Google Sheet existan exactamente en la colección `messengers` de Firestore, dentro del rango de fechas seleccionado por el campo `Fecha de la disponibilidad`.

#### Precondiciones

- Usuario autenticado con Rol `Super Admin` o `Supervisor`
- Área configurada en el sistema con `sheetDocumentId` válido
- Acceso activo al Google Sheet del Área
- La hoja `Disponibilidades` debe existir en el documento

#### Entradas del proceso

| Campo | Tipo | Requerido |
|---|---|---|
| Área / Dispatcher | Selector (desde colección `Areas` activas) | ✅ |
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
                              Buscar en colección "messengers"
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

La comparación entre el nombre en la columna `Mensajero` de la hoja y el campo correspondiente en la colección `messengers` de Firestore debe ser **exacta**, respetando:

- Mayúsculas y minúsculas — `Juan Perez` ≠ `juan perez`
- Tildes y caracteres diacríticos — `José` ≠ `Jose`
- Espacios en blanco al inicio y al final — `" Juan Perez"` ≠ `"Juan Perez"` (el sistema debe hacer **trim** al leer la hoja y comparar contra el valor limpio registrado en Firestore)
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

Guarda en Firestore los registros de la hoja **Disponibilidades** del Google Sheet validados previamente. Solo puede ejecutarse cuando la verificación es correcta.

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
Sistema guarda registros en colección "Availabilities"
        ↓
Sistema genera registro en "Availability_Imports"
        ↓
Sistema registra log en AuditLogs (usuario, fecha, hora, área, resultado)
        ↓
Toast de éxito — botón "Importar" queda deshabilitado
        ↓
Fin — estado actualizado en pantalla
```

#### Salida

- Datos almacenados en Firestore (colección `Availabilities`)
- Registro de importación en colección `Availability_Imports`
- Log de trazabilidad en `AuditLogs`

#### UI/UX

- La importación se confirma mediante un **Modal simple** de confirmación (≤ 4 campos — solo confirmación), igual que en Importación Dispatcher
- Después de la importación exitosa, se muestra un toast de éxito y el botón "Importar Disponibilidades" queda deshabilitado
- En caso de error, el modal muestra el motivo específico (duplicado, sin permisos, etc.)

---

### 18.3 Submódulo Revisión Disponibilidad

#### Descripción

Muestra los registros de disponibilidad importados en Firestore, con filtros para consultar y analizar la información.

#### Precondiciones

- Usuario autenticado con Rol `Super Admin`, `Supervisor` u `Operador`
- Datos previamente importados a Firestore en la colección `Availabilities`

#### Entradas / Filtros del proceso

| Campo | Tipo | Requerido |
|---|---|---|
| Fecha Inicial | DatePicker (filtra por `availabilityDate`) | ✅ |
| Fecha Final | DatePicker (filtra por `availabilityDate`) | ✅ |
| Área | Selector | ✅ |
| Mensajero | Selector o búsqueda (opcional) | ❌ |
| Motivo | Selector (opcional) | ❌ |

#### Flujo funcional

```
Usuario selecciona filtros
        ↓
Sistema consulta colección "Availabilities" en Firestore
con los filtros aplicados
        ↓
Sistema muestra resultados en tabla
```

#### Salida

- Tabla con los registros de disponibilidad que coinciden con los filtros seleccionados

#### Columnas de la tabla de resultados

| Columna | Campo Firestore | Formatter |
|---|---|---|
| Fecha | `availabilityDate` | `formatDate` |
| Mensajero | `messengerName` | — |
| Motivo | `reason` | — |
| Solicitado por | `requestedBy` | — |
| Monto a pagar | `amountToPay` | `formatCurrency` |
| Provincia | `province` | — |
| Comentario | `comment` | — |
| No. Orden | `orderId` | — |
| Área | `area` | — |

#### UI/UX

- Tabla con los 6 elementos de anatomía obligatoria (sección 9 de la Constitución)
- Estado vacío con ícono Lucide `CalendarOff` y mensaje descriptivo cuando no hay registros para los filtros seleccionados
- Filtros opcionales (Mensajero, Motivo) se muestran en un panel colapsable o como chips sobre la tabla — **nunca** en modal ni slide-over
- El campo `amountToPay` usa siempre el formatter `formatCurrency` y clase `tabular-nums`

---

### 18.4 Reglas de negocio del módulo Disponibilidad

#### RN-012 — Coincidencia Exacta de Mensajeros (Disponibilidad)

La validación de nombres de Mensajeros en este módulo es **estricta y exacta**. No aplica coincidencia difusa (RN-005). El sistema debe:

1. Leer el valor de la columna `Mensajero` de la hoja
2. Aplicar **trim** (eliminar espacios al inicio y al final)
3. Buscar el valor resultante en la colección `messengers` de Firestore con coincidencia exacta, respetando mayúsculas, minúsculas y tildes
4. Si no hay coincidencia exacta → incidencia crítica para esa fila

#### RN-013 — Control de Duplicados en Disponibilidad

Un conjunto de registros de disponibilidad **no puede importarse más de una vez** para la misma Área y rango de fechas. Si ya existe un registro importado para esa combinación en `Availability_Imports`, el sistema debe bloquear la importación y mostrar un error descriptivo.

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

### 18.6 Colecciones Firestore del módulo Disponibilidad

#### Colección `Availabilities`

Copia exacta de las filas de la hoja Disponibilidades del Google Sheet, filtradas por el rango de fechas importado.

| Campo | Tipo | Origen (columna Google Sheet) |
|---|---|---|
| `availabilityId` | string | generado por el sistema |
| `timestamp` | Timestamp | `Timestamp` |
| `emailAddress` | string | `Email Address` |
| `orderId` | string | `No. Orden` |
| `availabilityDate` | Timestamp | `Fecha de la disponibilidad` |
| `reason` | string | `Motivo` |
| `requestedBy` | string | `Area o persona que solicta la transportacion` |
| `messengerName` | string | `Mensajero` |
| `amountToPay` | number | `Monto a pagar` |
| `province` | string | `Provincias` |
| `comment` | string | `Comentario` |
| `area` | string | valor del Área seleccionada en el sistema |
| `importId` | string | referencia a `Availability_Imports` |

#### Colección `Availability_Imports`

| Campo | Tipo |
|---|---|
| `importId` | string |
| `area` | string |
| `startDate` | Timestamp |
| `endDate` | Timestamp |
| `importedBy` | string (userId) |
| `importDate` | Timestamp |
| `recordsImported` | number |

#### Colección `Availability_Verifications`

| Campo | Tipo |
|---|---|
| `verificationId` | string |
| `area` | string |
| `startDate` | Timestamp |
| `endDate` | Timestamp |
| `verificationDate` | Timestamp |
| `userId` | string |
| `status` | `correcta` / `con_incidencias` |
| `totalRecords` | number |
| `totalIncidents` | number |

#### Colección `Availability_Incidents`

| Campo | Tipo |
|---|---|
| `incidentId` | string |
| `verificationId` | string |
| `rowNumber` | number |
| `messengerName` | string |
| `availabilityDate` | Timestamp |
| `severity` | `critica` |
| `ruleCode` | string (`RN-012`, `RN-014`) |
| `description` | string |

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
| R-012 | Importación duplicada de disponibilidades | RN-013: verificar existencia en `Availability_Imports` por área y rango |
| R-013 | Colección `messengers` vacía o inaccesible | Detener verificación y mostrar error descriptivo indicando que no hay mensajeros registrados en la Base de Datos |

---

### 18.9 Anti-patrones específicos del módulo Disponibilidad

- ❌ Aplicar coincidencia difusa (RN-005) en la validación de nombres de Mensajeros — en este módulo la comparación es siempre exacta (RN-012)
- ❌ Permitir importar si existe al menos una incidencia crítica
- ❌ Navegar a otra página para mostrar el resultado de la Verificación — el resultado va en la misma vista
- ❌ Mostrar el botón "Importar Disponibilidades" a usuarios con Rol `Operador` o `Visitante`
- ❌ Importar una fila con la columna `Mensajero` vacía o solo con espacios (RN-014)
- ❌ Omitir el campo `area` en los registros guardados en `Availabilities`
- ❌ Leer la columna fuente corrigiendo el error tipográfico (`solicta`) — debe leerse exactamente como está en el Google Sheet
- ❌ Procesar el campo `amountToPay` sin convertirlo a `number` y sin usar `formatCurrency` para mostrarlo

---

## 19. Backend y persistencia de datos — Migración a Supabase

> 🆕 Sección agregada. Documenta la migración del backend de Firebase (Auth + Firestore) a Supabase (Auth + Postgres). El resto del documento (secciones 1–18) conserva referencias a "Firestore" en la descripción de colecciones y flujos por ser el diseño de datos original; funcionalmente, esas colecciones ahora viven como **tablas de Postgres en Supabase**, gobernadas por Row Level Security en vez de reglas de seguridad de Firestore. La traducción formal colección→tabla vive en `supabase_schema.sql`, en la raíz del repo, que es la fuente de verdad del esquema actual.

### 19.1 Estado de la migración

- Esquema completo definido y validado en `supabase_schema.sql`: **12 tablas**, con políticas **RLS** activas en todas ellas, más funciones auxiliares (helper functions).
- Se retiraron del esquema las tablas `email_groups` y `email_templates` (correspondientes a las colecciones `EmailGroups`/`EmailTemplates` documentadas en la sección 12 de este documento como legado de Firestore).
- Pendiente: reemplazar componentes que aún importan la ruta eliminada `src/lib/firebase` (ej. `RolesUsuariosPage.tsx`) por componentes placeholder mientras se completa su migración.
- Diferidas para trabajo con Claude Code y pruebas en navegador en vivo: `VerificationPage.tsx`, `RevisionPage.tsx`, `DisponibilidadVerificationPage.tsx`, `DisponibilidadRevisionPage.tsx`.
- Módulos aún no construidos (Gestión, Conciliación, Facturación) se desarrollarán directamente sobre Supabase, sin pasar por Firebase.

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

### 19.4 Actores del sistema (actualización de la sección 4)

Donde la sección 4 indica **Firestore** como actor no humano ("Almacenamiento validado, búsquedas, historial"), léase ahora **Supabase (Postgres)**, cumpliendo la misma función.

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