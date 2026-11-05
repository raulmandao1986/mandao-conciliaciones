# Mandao Conciliaciones — Instrucciones Específicas del Sistema

> **Sistema externo independiente** que forma parte del ecosistema Mandao.  
> Este documento extiende y complementa las reglas establecidas en el **Marco Fundamental — Reglas No Negociables** (`CONSTITUCION`). Todo lo definido aquí es específico del sistema **Mandao Conciliaciones** y debe respetarse sin excepción al generar código para este sistema.  
> El agente AI debe leer **primero** la Constitución general y **luego** este documento antes de generar cualquier componente, vista, lógica o estructura.
>
> Para el estado del proyecto (qué está hecho, qué falta y quién debe resolver cada pendiente), ver la sección 11 de `PLAN_MIGRACION.md` en la raíz del repo.

---

## Índice

1. [Identidad del sistema](#1-identidad-del-sistema)
2. [Stack y contexto de módulo externo](#2-stack-y-contexto-de-módulo-externo)
3. [Arquitectura funcional y módulos](#3-arquitectura-funcional-y-módulos)
4. [Actores y roles del sistema](#4-actores-y-roles-del-sistema)
5. [Módulo Dispatcher](#5-módulo-dispatcher) ✅ **FASE ACTUAL**
6. [Módulo Negocios](#6-módulo-negocios) ✅ Conciliación y Cobros y Pagos
7. [Módulo Mensajeros](#7-módulo-mensajeros) ✅ Conciliación y Cobros y Pagos
8. [Módulo Configuración](#8-módulo-configuración) ✅
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

> **Corrección 2026-09-30 — Fechas y Moneda**:
> - **Fechas**: el formato real de "Delivery Date"/"Fecha" en los Sheets es **dd/mm/yyyy**. Antes existían ~5 copias distintas del parser de fechas entre Verificación/Revisión de Dispatcher y Disponibilidad, todas con un `new Date(str)` de último recurso para formatos no reconocidos (ambiguo, depende del motor JS) — esa era la causa real de que algunas órdenes no se importaran, sin ningún aviso. Se consolidó en un único parser compartido (`lib/sheetDateParser.ts`) usado por las 4 pantallas, sin ese fallback: una fecha no reconocida ahora se reporta como **incidencia crítica** (RN-002 ampliada) con el valor exacto de la celda, en vez de desaparecer del rango en silencio.
> - **Moneda**: el dispatcher siempre registra los montos en CUP — nunca en USD. Antes Verificación/Revisión de Dispatcher mostraban estos montos con un "$" crudo (`formatCUP()` ahora los etiqueta correctamente). La única conversión a USD que existe en todo el sistema ocurre **dentro de Conciliación de Negocios**, y solo para negocios con Método de Pago "Transferencia-Exterior" — ver sección 6.4.

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

> ✅ Submódulo **Conciliación** implementado (`src/modules/conciliacion/ConciliacionNegociosPage.tsx`) y actualizado al **2026-11-05** con el documento "Nuevos cambios" del equipo: clasificación de órdenes por catálogo (Tipología / Moneda / Grupo), consecutivo por entidad, sentido y moneda, estados `Nuevo → Enviado → Confirmado → Pagado/Cobrado`, reconciliación con registro, envío por correo y Bitácora. Las secciones **6.7 a 6.12** describen ese ciclo y aplican igual a Mensajeros (sección 7). Dashboard, Facturación y Planificación de Pagos siguen ⏳. **Cobros y Pagos** (Fase 4, reemplaza a Cuentas por Pagar / Cuentas por Cobrar) está en la sección 6.13.

### 6.1 Submódulo Conciliación — Descripción general

Procesa y registra el balance financiero de los negocios en un período determinado. La fuente de las órdenes es la tabla `dispatcher` (ya verificada e importada por el Dispatcher — ver sección 5), **no** un nuevo origen de datos.

**Parámetros de entrada:**
- **Rango de Fechas**: Fecha Inicial y Fecha Final (filtran `dispatcher.delivery_date`).
- **Área**: seleccionable desde `areas`; admite "Todas las Áreas".
- **Negocio pendiente** (solo modo Individual): lista calculada al momento con los negocios que tienen órdenes en el Área + rango y **todavía no están conciliados**, más los ya conciliados que se pueden **reconciliar** (estado Nuevo o Enviado), marcados "(reconciliar)". El contador muestra ambos: "N pendientes · M para reconciliar".

### 6.2 Tipos de Conciliación

- **Individual**: calcula y muestra el detalle de un único negocio (1 o 2 tarjetas según su Método de Pago, ver 6.4). Un solo botón registra todas sus liquidaciones pendientes; si alguna ya está registrada y es reconciliable, el botón dice "Reconciliar" (ver 6.9).
- **Masiva**: agrupa todas las órdenes del rango (de un Área o de todas) por negocio (`dispatcher.store`, normalizado sin tildes/mayúsculas) y calcula cada uno por separado. **Solo se listan los pendientes**: los ya conciliados en ese mismo rango exacto se omiten (la reconciliación se hace desde Individual o desde el histórico). Las filas elegibles vienen marcadas; "Conciliar Seleccionadas" registra todas a la vez.
- Antes de registrar se muestra un **Resumen del período** por Grupo de pago (todas las órdenes del rango, incluidas las ya conciliadas).

### 6.3 Clasificación de las órdenes — catálogo de Métodos de Pago (Órdenes)

> Reemplaza la tabla fija de "4 baldes" que existía en el código (rectificado con el equipo 2026-10-27/28). **Todo se configura desde la app**, sin tocar código: Configuración → Métodos de Pago → **Órdenes** (ver sección 8.3).

Cada método de pago que aplica a Órdenes (`payment_methods.applies_to_orders = true`) tiene tres datos de clasificación:

| Dato | Valores | Para qué sirve |
|---|---|---|
| **Tipología** (`tipologia`) | `cobrar` (Cuenta por Cobrar) / `pagar` (Cuenta por Pagar) | **Por Cobrar**: el negocio/mensajero cobró al cliente y le debe a Mandao la comisión (hoy solo Efectivo). **Por Pagar**: el cliente le pagó a Mandao y Mandao le debe al negocio/mensajero su parte. |
| **Moneda** (`currency`) | `CUP` / `USD` | Los métodos en USD forman la parte **"Exterior"** de los negocios con vía Transferencia-Exterior; para el resto de los negocios todo se liquida en CUP (confirmado 2026-10-27). |
| **Grupo** (`group_id` → `payment_groups`) | Efectivo, Pago en Línea, Pago en Línea Exterior… (configurables) | Columna en la que aparece el método en la tabla de órdenes del **PDF** y en los resúmenes. Varios métodos pueden compartir un grupo (ej. Transfermóvil y ENZONA → "Pago en Línea"). |

Clasificación vigente (cargada por la migración 2026-10-27 y confirmada por el equipo):

| Método (Órdenes) | Tipología | Moneda | Grupo |
|---|---|---|---|
| `Cash` / Efectivo | Por Cobrar | CUP | Efectivo |
| `Transfermóvil`, `ENZONA` | Por Pagar | CUP | Pago en Línea |
| `Saldo Mandao`, `Card`, `Crédito o Débito`, `TropiPay Balance` | Por Pagar | USD | Pago en Línea Exterior |

- La comparación entre `dispatcher.payment_type` y el nombre del método es normalizada (sin tildes, mayúsculas, espacios ni signos — `normalizeCompact()`).
- Una orden cuyo `payment_type` no está en el catálogo de Órdenes queda **"sin clasificar"**: no entra en el cálculo y se avisa en la UI con la lista de tipos no reconocidos (nunca se fuerza a un grupo).
- Un método sin grupo asignado aparece en el PDF en la columna "Sin grupo".
- La clasificación de los métodos de **Negocios** y **Mensajeros** (vías de pago de la entidad) **no** usa Tipología/Moneda/Grupo — solo los de Órdenes (rectificado 2026-10-28).
- Motor de cálculo: `src/lib/conciliacion/catalogoPagos.ts` (`loadCatalogoPagos`, `computeDesglose`, `columnasLegado`).

### 6.4 Cálculo financiero — por Método de Pago del negocio

- **Saldo de una orden** = `dispatcher.product_amount` (sin restar Store Offer, Processing Fee ni Store Admin Charge). **Siempre está en CUP**.
- **% de Comisión Mandao**: Configuración → Comisión Mandao (`commission_settings`, hoy 20% Negocios). Se guarda con cada conciliación (`comision_pct`).
- Las órdenes se agrupan en **líneas** = Grupo × Tipología × Moneda (`LineaGrupo`). Para cada línea:
  - **Por Cobrar (CxC)** = saldo × % comisión → lo que el negocio le debe a Mandao.
  - **Por Pagar (CxP)** = saldo × (100% − % comisión) → lo que Mandao le debe al negocio.
- El **Método de Pago del negocio** (`businesses.payment_method`, Configuración → Métodos de Pago → Negocios) decide en cuántas filas ("rieles" de liquidación) se reparte:

  | Método de Pago del negocio | Filas | Contenido de cada fila |
  |---|---|---|
  | `Transferencia` (o no reconocido, como respaldo) | 1, CUP | Todas las líneas. |
  | `Transferencia-Efectivo` | 2, ambas CUP | **Transferencia** = líneas Por Pagar de métodos CUP · **Efectivo** = líneas Por Cobrar + líneas de métodos USD (en CUP). |
  | `Transferencia-Exterior` | 2 | **Transferencia** (CUP) = líneas de métodos CUP · **Exterior** (USD) = líneas de métodos USD convertidas con la tasa activa. |

- **Neto de una fila** = CxP − CxC, en la moneda de la fila: positivo = **a pagar** al negocio, negativo = **a cobrar**, 0 = liquidación en cero (se registra sin consecutivo).
- **Conversión a USD**: solo en la fila "Exterior". La tasa activa (Configuración → Razón de Cambio) está en **USD por 1 CUP** (ej. 0.002): `USD = CUP × tasa`. Se guarda con la fila (`tasa_cambio`). Sin tasa activa la fila Exterior queda **bloqueada** ("Sin tasa") y se muestra en CUP.

  > **Aclaración (2026-09-30)**: el riel "Efectivo" describe **cómo Mandao le entrega el dinero al negocio** (en mano o por transferencia, según se acuerde); no tiene relación con el método de pago "Efectivo/Cash" que usó el cliente en la orden.

- **Columnas de totales** (compatibilidad): además del desglose por línea (`desglose`, jsonb), cada fila llena las columnas históricas — `ordenes_efectivo`/`cxc_cu` = todo lo Por Cobrar; `ordenes_transfermovil`/`cxp_tm` = Por Pagar en métodos CUP; `ordenes_saldo_mandao`/`cxp_sm` = Por Pagar en métodos USD; `ordenes_tarjeta`/`cxp_us` = 0. Las usan el Dashboard y el generador del consecutivo.

### 6.4.1 Regla — Existencia de datos

El negocio (Individual) o cada negocio iterado (Masiva) debe tener al menos una orden en el rango de fechas; si no, se informa "sin órdenes" y no se puede conciliar.

### 6.4.2 Regla — Duplicidad (Filtro de Pendientes)

No puede existir más de una conciliación para el mismo `business_id`, el mismo rango exacto (`fecha_inicial`/`fecha_final`) y el mismo riel (`via_pago`). Reforzado con el índice único `uq_conciliaciones_businesses_range`. Si la conciliación existente está en **Nuevo** o **Enviado**, en vez de duplicarse se **reconcilia** (actualiza la misma fila, ver 6.9); desde **Confirmado** ya no se puede volver a calcular.

### 6.4.3 Regla — Existencia del negocio en el catálogo (actualizado 2026-11-05)

`dispatcher.store` es texto libre del Sheet. Al conciliar se busca el negocio en **todo** el catálogo de Gestión de Negocios (activos y bloqueados), por nombre normalizado y Área (`src/lib/conciliacion/catalogoEntidad.ts`):

| Resultado | Qué muestra la conciliación | Acción |
|---|---|---|
| Existe y está **activo** en esa Área | Normal | Se puede conciliar. |
| Existe pero está **Bloqueado** | Aviso ámbar "ya existe… pero está Bloqueado" | **Activar negocio** (lo reactiva, queda en el Log y recalcula) o **Modificar información** (abre su formulario en Gestión de Negocios). |
| Existe en **otra Área** | Aviso ámbar con el Área donde está | **Modificar información** (corregir el Área si es el mismo negocio). |
| **No existe** | Aviso rojo "no está registrado" | **Registrar Negocio** (nombre + Área + activo). |

- En la Masiva, la columna Estado muestra "Sin registrar" / "Bloqueado" / "Otra Área"; el aviso con los botones aparece al desplegar la fila. "Registrar N faltantes" solo cuenta los que no existen.
- Antes de registrar se **vuelve a consultar la base**: si ya existe (aunque esté bloqueado o en otra Área) no se crea un duplicado y se avisa.
- Activar, registrar o modificar requiere Super Admin (política `manage_businesses`).

### 6.5 Registro en Base de Datos (tabla `conciliaciones_businesses`, ver sección 12 tabla 19)

Al conciliar se inserta 1 fila por cada liquidación elegible (un negocio con Método de Pago dividido aporta hasta 2):

| Dato | Columna | Origen |
|---|---|---|
| Fecha | `fecha` | Día en que se ejecuta |
| Negocio | `business_id` / `establecimiento` | Catálogo / nombre de las órdenes |
| Período | `fecha_inicial` / `fecha_final` | Rango seleccionado |
| Área | `area_id` / `area` | Área de las órdenes |
| Riel / Moneda | `via_pago` / `moneda` | `Transferencia` / `Efectivo` / `Exterior` · `CUP` / `USD` (ver 6.4) |
| Desglose | `desglose` (jsonb) | Líneas Grupo × Tipología × Moneda con órdenes, saldo y monto — lo leen el PDF, el histórico y la Bitácora |
| Totales | `ordenes_*`, `cxc_cu`, `cxp_*` | Ver "Columnas de totales" en 6.4 |
| % comisión / tasa | `comision_pct` / `tasa_cambio` | Valores usados en el cálculo (la tasa solo en filas USD) |
| Consecutivo | `consecutivo` | Lo asigna la base de datos (ver 6.7); vacío si el neto es 0 |
| Responsable | `responsable` / `responsable_id` | Usuario que ejecuta |
| Conciliación | `conciliacion` | `"[Negocio] ([Riel]) [AAAA-MM-DD] - [AAAA-MM-DD]"` — texto del enlace al PDF |
| Estado | `estado` | `Nuevo` al insertar (ver 6.8) |

- **PDF** (`src/lib/conciliacion/pdfConciliacionNegocio.ts`): "Reporte de conciliación" con encabezado, Resumen por Grupo de pago (columnas = grupos del desglose) y detalle de órdenes con el `payment_type` real. No muestra el consecutivo ni la palabra "Mandao".
- **Nombre del archivo PDF** = el mismo texto del enlace del histórico, sin consecutivo (ej. `Burger Queen (Transferencia) 2026-09-01 - 2026-09-30.pdf`), en Drive, en la descarga y en el adjunto del correo (2026-11-05).
- **Google Drive**: al conciliar, el PDF se sube a la carpeta configurada para Negocios (Configuración → Data) y se guarda el enlace (`pdf_drive_url`). Si falla (sin carpeta o sin sesión de Google) la conciliación igual queda registrada y el histórico ofrece "Subir a Drive".
- Facturación, Descuento, Nota, Pagado, Saldo, Estado de pago, Referencia, Fecha de pago y Prioridad quedan `null` (los completarán Cobros y Pagos / Facturación).

### 6.6 Interfaz — Histórico de Conciliaciones

- **Orden**: por consecutivo descendente (año + número); las de saldo 0 al final.
- **Filtros**: buscador (negocio, responsable, consecutivo, conciliación), Área, Riel, **Moneda** (CUP/USD, agregado 2026-10-28), Estado y rango de fechas de conciliación.
- **Acciones por fila**: abrir el PDF (desde Drive o generado al momento), "Subir a Drive" si no se subió, **enviar por correo** (Nuevo/Enviado), **reconciliar** (Nuevo/Enviado — abre primero la Bitácora del período) y **cambiar estado** en línea.
- **Selección múltiple**: casillas en las filas en estado Nuevo y casilla de encabezado para marcar todas las del filtro → **"Enviar seleccionadas (N)"** (ver 6.10).
- **Fila desplegada**: responsable, fecha, Por Cobrar / Por Pagar, desglose por grupo, último envío (fecha y destinatarios), **Reconciliaciones** (una fila plegable por reconciliación, ver 6.9) y el botón **Bitácora** (ver 6.11).

### 6.7 Consecutivo (aplica a Negocios y Mensajeros)

- Código que la **base de datos** asigna a cada conciliación con monto a pagar o a cobrar (trigger `set_consecutivo_conciliacion_*` → `next_conciliacion_consecutivo`). Sirve para el match contra caja; es **información interna**: no se muestra en el PDF ni en el correo al cliente.
- **Una serie por Entidad × Sentido × Moneda** (8 series, rectificado 2026-11-02), cada una con su propia numeración y formato:

  | | Por Pagar · CUP | Por Cobrar · CUP | Por Pagar · USD | Por Cobrar · USD |
  |---|---|---|---|---|
  | **Negocios** | PN | CN | PNU | CNU |
  | **Mensajeros** | PM | CM | PMU | CMU |

  El sentido sale del neto de la fila (positivo = Por Pagar, negativo = Por Cobrar) y la moneda de la columna `moneda`.
- Formato por defecto: prefijo + año (2 dígitos) + número de 4 dígitos, ej. `PN260012`. Cada serie se configura en **Configuración → Formato de Consecutivo** (ver 8.4).
- Una liquidación en **0** no recibe consecutivo. Si una reconciliación la deja con monto, recibe uno en ese momento.
- **Una vez asignado no cambia**, ni al reconciliar ni si cambia el sentido.

### 6.8 Estados de la conciliación (aplica a Negocios y Mensajeros)

`Nuevo → Enviado → Confirmado → Pagado / Cobrado` (rectificado 2026-10-27, reemplaza a Aprobado/Incorrecto/Facturado — ver sección 11).

| Estado | Significado | Pasa a |
|---|---|---|
| **Nuevo** | Registrada; se puede reconciliar. | Enviado |
| **Enviado** | PDF enviado al negocio/mensajero (automático al enviar por correo, o manual). Se puede reconciliar. | Confirmado · volver a Nuevo |
| **Confirmado** | El negocio/mensajero dio su conformidad. **Montos bloqueados.** | Pagado o Cobrado (según el neto) · volver a Enviado |
| **Pagado** | Mandao pagó el neto (fila Por Pagar). | — (final) |
| **Cobrado** | Mandao cobró el neto (fila Por Cobrar). | — (final) |

- El cambio se hace en línea desde la fila del histórico ("Cambiar…"), que solo ofrece los pasos válidos. Un neto en 0 no tiene cierre Pagado/Cobrado.
- Si otro usuario ya cambió el estado, se avisa en vez de sobrescribirlo. Cada cambio queda en el Log (`estado_at` guarda la fecha del último cambio).
- Pagado / Cobrado los registra la caja desde **Cobros y Pagos** ("Registrar pago / cobro", sección 6.13), o en línea desde el histórico.

### 6.9 Reconciliación (aplica a Negocios y Mensajeros)

- Permite **volver a calcular** una conciliación ya registrada cuando el negocio/mensajero no está de acuerdo, siempre que esté en **Nuevo** o **Enviado**.
- Flujo: botón de reconciliar en la fila del histórico → se abre la **Bitácora del período** (conciliaciones de ese negocio/mensajero en ese período y sus reconciliaciones anteriores) → "Continuar con la reconciliación" carga la calculadora Individual con el mismo negocio/mensajero, Área y período → "Reconciliar".
- Al reconciliar: se **actualizan los montos** de la misma fila, se **mantiene el consecutivo**, la fila vuelve a **Nuevo** (para reenviar el PDF corregido), se regenera el PDF y se sube a Drive.
- La base de datos (trigger `reconciliacion_conciliacion`) guarda cada reconciliación en `conciliaciones_reconciliaciones` con los **valores anteriores y nuevos**, quién la hizo y el estado que tenía; cuenta las veces (`reconciliaciones`) y **rechaza** cualquier cambio de montos si la conciliación ya está Confirmada o cerrada.
- En el histórico y en la Bitácora las reconciliaciones se ven **una por fila, plegadas** (#, fecha, responsable, estado anterior, cantidad de campos cambiados); al desplegarlas se ve la tabla Campo / Antes / Después.

### 6.10 Envío por correo (aplica a Negocios y Mensajeros)

- **Un correo por negocio/mensajero y período**, con todos sus PDF adjuntos (ej. la fila CUP y la USD juntas). Destinatario: `businesses.email` / `messengers.email` (admiten varios correos separados por coma o punto y coma). Los que no tienen correo se omiten y se informan.
- Se envía por **Gmail con la cuenta de Google del usuario conectado** (permiso `gmail.send`). Al enviarse, las conciliaciones en **Nuevo** pasan a **Enviado** automáticamente y se guarda la fecha y los destinatarios (`enviado_at`, `enviado_a`). Una conciliación Enviada se puede reenviar; desde Confirmado no.
- **Envío masivo**: marcar las conciliaciones en Nuevo (o todas las del filtro) y "Enviar seleccionadas (N)". El ícono de sobre de cada fila envía las de ese negocio/mensajero y período.
- Texto del correo: plantilla editable en **Configuración → Correo de Conciliación** (ver 8.5). El detalle **no incluye consecutivos** (información interna).
- **Permiso de Google**: dura 1 hora y solo se obtiene al iniciar sesión / reconectar con Google. Si falta o venció, al pulsar Enviar aparece "Reconectar Google"; al volver, se repite el envío. Detalle técnico: el token ya no se borra cuando Supabase renueva su sesión, se guarda su vencimiento, y el envío usa el endpoint `gmail/v1/users/me/messages/send` con el mensaje en base64 (el endpoint de subida `/upload/gmail/...` lo bloquea el navegador por CORS — corregido 2026-11-05).

### 6.11 Bitácora (aplica a Negocios y Mensajeros)

- Panel lateral con el **historial de conciliaciones de un negocio/mensajero**: período, riel y moneda, consecutivo, estado y neto. Al seleccionar una se ve su información (responsable, fecha, último envío, totales, Área), el desglose por grupo, sus reconciliaciones (plegables) y el botón "Ver PDF".
- Se abre de dos formas: botón **"Bitácora"** en la fila desplegada del histórico (todas sus conciliaciones), o al pulsar **Reconciliar** (solo las del período a reconciliar, con la acción "Continuar con la reconciliación").

### 6.12 Trazabilidad

Quedan en el Log de Auditoría (Configuración → Log): registro de conciliaciones (individual/masiva, cantidad, reconciliadas), cambios de estado (antes/después), envíos por correo (destinatarios), activación/registro de negocios desde la conciliación, y los cambios en los catálogos de Configuración.

### 6.13 Cobros y Pagos (aplica a Negocios y Mensajeros) — Fase 4

> ✅ Implementado 2026-11-05 (`src/modules/conciliacion/CobrosPagosPage.tsx`, lógica en `src/lib/conciliacion/cobrosPagos.ts`). **Reemplaza** a los submenús "Cuentas por Pagar" y "Cuentas por Cobrar" de los módulos Negocios y Mensajeros (que eran maquetas sin datos reales y se eliminaron).

**Qué muestra:** las cuentas **pendientes** de pagar o cobrar = conciliaciones en estado **Confirmado** (el negocio/mensajero dio conformidad, pero todavía no se pagó ni se cobró).

**Agrupación:** un renglón por **negocio/mensajero y moneda** (CUP y USD nunca se suman). Por cada grupo:
- **Por Cobrar** = suma de lo Por Cobrar de sus conciliaciones (Negocios: `cxc_cu`; Mensajeros: `total_por_cobrar`).
- **Por Pagar** = suma de lo Por Pagar (Negocios: `cxp_tm + cxp_sm + cxp_us`; Mensajeros: `total_por_pagar`).
- **Neto** = Por Pagar − Por Cobrar → **"Pagar X"** (Mandao le paga) o **"Cobrar X"** (Mandao le cobra), descontando las cuentas por cobrar contra las por pagar.
- **Vía de pago** del negocio/mensajero (Gestión de Negocios / Mensajeros).
- Al desplegar: las conciliaciones que lo forman (consecutivo, período, riel, Por Cobrar, Por Pagar, neto) y los **datos de pago**: en Negocios, para CUP la Cuenta CUP, Personal y Cheque; para USD Zelle, Tropipay y Transferencia Internacional (las habilitadas); en Mensajeros, Tarjeta Fiscal, Cuenta Fiscal, CI y Teléfono. Si faltan se avisa para completarlos en Gestión.

**Totales:** tarjetas por moneda con el total a pagar y a cobrar de lo filtrado.

**Filtros:** búsqueda por negocio/mensajero o consecutivo, Moneda, Cuenta (Por Pagar / Por Cobrar — sobre el neto del grupo), Provincia / Área y Período (desde / hasta, sobre el período conciliado).

**Planificación de pagos para la caja:**
- Casillas por grupo y casilla de encabezado para marcar todo lo filtrado; la barra muestra en vivo los **totales acumulados** de lo marcado (a pagar y a cobrar por moneda).
- **Exportar Excel** (hoja "Planificación" por grupo con datos de pago, y hoja "Detalle" por conciliación) y **Planificación PDF** (para enviar a la cajera). Exportan lo marcado o, si no hay nada marcado, todo lo filtrado.
- **Registrar pago / cobro** (Super Admin / Supervisor): las conciliaciones de los grupos marcados pasan a **Pagado** (las Por Pagar) o **Cobrado** (las Por Cobrar) y salen de la lista. Cada cambio queda en el Log. Las conciliaciones con neto 0 no tienen cierre.

**Menú:** "Cobros y Pagos" (`cobros-pagos-negocio` / `cobros-pagos-mensajero`); la migración `2026-11-05_cobros_pagos_menu.sql` lo habilita en los Roles de Acceso que veían Cuentas por Pagar / por Cobrar o la Conciliación del módulo.

---

## 7. Módulo Mensajeros

> ✅ Submódulo **Conciliación** implementado (`src/modules/conciliacion/ConciliacionMensajerosPage.tsx`), con el mismo motor y el mismo ciclo que Negocios: clasificación por catálogo (6.3), consecutivo (6.7), estados (6.8), reconciliación (6.9), envío por correo (6.10) y Bitácora (6.11). Dashboard, Facturación y Planificación de Pagos siguen ⏳. **Cobros y Pagos**: sección 6.13.

### 7.1 Submódulo Conciliación — Descripción general

Mismo patrón que Negocios (sección 6): procesa y registra el balance financiero de un mensajero en un período, a partir de la tabla `dispatcher` (columna `driver`, no `store`).

**Parámetros de entrada:**
- **Rango de Fechas**: Fecha Inicial y Fecha Final (filtran `dispatcher.delivery_date`).
- **Área**: seleccionable desde `areas`; admite "Todas las Áreas".
- **Mensajero pendiente** (solo Individual): pendientes del Área + rango, más los reconciliables marcados "(reconciliar)" — igual que Negocios (6.1).

### 7.2 Tipos de Conciliación

- **Individual**: detalle de un único mensajero; botón "Conciliar" (o "Reconciliar" si ya está registrado y en Nuevo/Enviado).
- **Masiva**: agrupa por mensajero (`dispatcher.driver`, normalizado) y solo lista los pendientes, igual que Negocios (6.2).

### 7.3 Clasificación de las órdenes y cálculo

Idéntico a Negocios (secciones 6.3 y 6.4) con estas diferencias:
- **Saldo de una orden = `delivery_charge`** (no `product_amount` — confirmado 2026-10-01).
- **% de comisión propio de Mensajeros** (Configuración → Comisión Mandao, `commission_settings` fila `messengers`, hoy 10%).
- **Una sola fila por mensajero y período**, sin rieles. Por Cobrar = líneas de tipología `cobrar`; Por Pagar = líneas de tipología `pagar`.
- **Moneda**: hoy los mensajeros **siempre se concilian en CUP**. La conciliación ya guarda su moneda (`conciliaciones_messengers.moneda`) y existen las series de consecutivo en USD (PMU / CMU), para poder pagarles en USD en el futuro (confirmado 2026-10-28); para eso faltaría adaptar el cálculo (conversión con la tasa).

### 7.4 Campos propios de Mensajeros

- **Tipo de Mochila**: tomado de `messengers.backpack_type` al conciliar.
- **Disponibilidades**: suma de `availabilities.amount_to_pay` del mismo mensajero (nombre normalizado) y Área en el rango, menos el **Descuento de Disponibilidad** configurado (Configuración → Comisión Mandao, `availability_discount_settings`): `suma × (1 − % / 100)`. Se suma a Total por Pagar.
- **Alquiler de Mochila**: tarifa fija por tipo (`Pequeña` / `Grande`, tabla `backpack_rental_rates`, Configuración → Comisión Mandao). Se resta de Total por Pagar una vez por conciliación. Un mensajero sin registrar no tiene tarifa.
- **Total de Órdenes**: cantidad de órdenes del mensajero en el rango.
- **Total por Cobrar** = Por Cobrar de las órdenes.
- **Total por Pagar** = Por Pagar de las órdenes + Disponibilidades − Alquiler de Mochila.
- **Saldo CUP** = Total por Pagar − Total por Cobrar (sin tasa de cambio). Positivo = a pagar al mensajero; negativo = a cobrar.

### 7.4.1 Reglas — Existencia de datos, catálogo y duplicidad

Mismas reglas que Negocios (6.4.1–6.4.3) aplicadas a `messengers`:
- Sin órdenes → no se puede conciliar.
- El mensajero se busca en **todo** el catálogo de Gestión de Mensajeros: si existe **Bloqueado** se ofrece **Activar mensajero** o **Modificar información**; si existe en **otra Área**, **Modificar información**; si no existe, **Registrar Mensajero** (revalidado contra la base para no crear duplicados). Requiere Super Admin (`manage_messengers`).
- Una sola conciliación por `messenger_id` y rango exacto (índice `uq_conciliaciones_messengers_range`); si existe en Nuevo/Enviado se reconcilia en vez de duplicarse.

### 7.5 Registro en Base de Datos (tabla `conciliaciones_messengers`, ver sección 12 tabla 20)

Se inserta: Fecha, Mensajero, Período, Área, totales por tipología (columnas históricas, ver 6.4), `desglose`, Tipo y Alquiler de Mochila, Disponibilidades, Total de Órdenes, Total por Cobrar, Total por Pagar, Saldo CUP, Vía de Pago (`messengers.payment_method`), Moneda (`CUP`), `comision_pct`, Responsable, Conciliación (`"[Mensajero] [AAAA-MM-DD] - [AAAA-MM-DD]"`, también nombre del PDF) y Estado `Nuevo`. El consecutivo lo asigna la base (series PM/CM/PMU/CMU, ver 6.7). El PDF (`pdfConciliacionMensajero.ts`) incluye Resumen por Grupo y la Liquidación (comisión a cobrar, a pagar, disponibilidades, mochila).

### 7.6 Interfaz — Histórico

Igual que Negocios (6.6): filtros (buscador, Área, **Moneda**, Estado, fechas), acciones por fila (PDF, Drive, correo, reconciliar, cambiar estado), selección múltiple para el envío masivo y fila desplegada con Tipo de Mochila, Total Órdenes, Por Cobrar / Por Pagar, Disponibilidades, Alquiler Mochila, Saldo CUP, desglose, último envío, Reconciliaciones y **Bitácora**.

---

## 8. Módulo Configuración

> ✅ Implementado. Principio acordado con el equipo (2026-10-27): **todo lo que define cómo se concilia se gestiona desde la app**, sin tocar código. Los catálogos de configuración solo los edita **Super Admin** (RLS `current_user_role() = 'super_admin'`); el resto de los roles los ve en solo lectura. Cada cambio queda en el Log.

Menú Configuración:

| Ítem | Qué gestiona |
|---|---|
| Roles y Usuarios | Usuarios, rol de seguridad (`profiles.role`) y Rol de Acceso (qué ítems de menú ve, `access_roles.module_keys`) — ver sección 19.3 |
| Áreas | Catálogo `areas` |
| Métodos de Pago → Negocios / Mensajeros / Órdenes / **Grupos de Pago** | Ver 8.1–8.3 |
| Razón de Cambio | Tasa de cambio activa, USD por 1 CUP (`exchange_rates`, RN-010, sincronizable con El Toque — sección 22) |
| Comisión Mandao | % de comisión de Negocios y de Mensajeros, Descuento de Disponibilidad y Alquiler de Mochila |
| **Formato de Consecutivo** | Ver 8.4 |
| **Correo de Conciliación** | Ver 8.5 |
| Reglas (Negocios / Mensajeros) | Reglas del Dispatcher (`dispatcher_rules`) |
| Data | Documentos de Google Sheets para importación y carpetas de Google Drive para los PDF de conciliación (Negocios / Mensajeros) |
| Log | Log de Auditoría — ver 8.6 |

> Un ítem nuevo del menú no aparece hasta que se habilita en el Rol de Acceso del usuario (Roles y Usuarios → Roles). Las migraciones que agregan menús lo habilitan en los roles que ya ven el menú relacionado.

### 8.1 Métodos de Pago — Negocios y Mensajeros

Vías de pago de la entidad (cómo se le paga al negocio o mensajero: Transferencia, Transferencia-Efectivo, Transferencia-Exterior, Efectivo…). Solo nombre, descripción/lógica y estado. **No llevan Tipología, Moneda ni Grupo** (rectificado 2026-10-28).

### 8.2 Métodos de Pago — Órdenes

Métodos con que el cliente paga la orden (`dispatcher.payment_type`). Al crear o editar uno se define su **Clasificación para la Conciliación**: Tipología (Por Cobrar / Por Pagar), Moneda (CUP / USD) y Grupo — ver sección 6.3. La tabla muestra la columna "Clasificación". Esta es la única pantalla donde se decide si un método es CxC o CxP.

### 8.3 Métodos de Pago — Grupos de Pago

Catálogo `payment_groups`: las **columnas de la tabla de órdenes del PDF** de conciliación y de los resúmenes. Solo se define el **Nombre** (agregar, renombrar, eliminar si ningún método lo usa); un grupo nuevo queda como última columna. El grupo de cada método se elige en Órdenes (8.2). Se mantiene como catálogo aparte para que varios métodos compartan una columna y renombrarla sea un solo cambio.

### 8.4 Formato de Consecutivo

8 series (`consecutivo_series`), agrupadas por Negocios y Mensajeros, una por Sentido (Por Pagar / Por Cobrar) × Moneda (CUP / USD) — ver 6.7. Cada serie define:
- **Prefijo** (1–10 letras o números, único entre series).
- **Año**: 2 dígitos (26), 4 dígitos (2026) o sin año.
- **Separador**: ninguno, guion, punto o guion bajo.
- **Dígitos** del número (1–10).
- **Reinicio**: cada año o nunca (sin año en el código, obligatoriamente "nunca").

Con vista previa. Los cambios aplican a las conciliaciones nuevas; cambiar el prefijo o el formato **no reinicia** la numeración (el contador va ligado a la clave fija de la serie) y nunca se repite un código ya emitido.

> ⏳ El equipo está analizando si el formato definitivo es este (pendiente de confirmar).

### 8.5 Correo de Conciliación

Plantilla del correo con que se envían los PDF (`app_settings`: `conciliacion_correo_asunto`, `_cuerpo`, `_cc`): **Asunto**, **Cuerpo** y **Copia (CC)**, con vista previa y "Restaurar texto por defecto". Variables: `{nombre}` (negocio/mensajero), `{periodo}`, `{area}`, `{detalle}` (una línea por conciliación: riel, moneda y monto a pagar o a cobrar). **Sin consecutivos**: es información interna de la agencia.

### 8.6 Log de Auditoría

Últimas acciones del sistema (`audit_logs`) con filtros y búsqueda. "Ver detalles" muestra la información de forma legible:
- **Qué se modificó**: tabla Campo / Antes / Después. En Gestión de Negocios y de Mensajeros se registra campo por campo (el Área por su nombre, el estado como Activo/Bloqueado, las cuentas bancarias por sub-campo) — agregado 2026-11-05; los registros anteriores a esa fecha no tienen este detalle.
- **Datos del registro** al crear o eliminar.
- Resto de la información; el JSON técnico queda plegado al final.

En la lista, debajo de la acción, se resume "N campos modificados".

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

> **Alcance actual**: aplican los estados del Dispatcher, de Disponibilidad y de Conciliación (que también usa Cobros y Pagos). Facturación está pendiente.

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

### Estados de Conciliación (Negocios y Mensajeros) ✅

Implementados 2026-10-27 (`src/lib/conciliacion/estados.ts`). Detalle y transiciones en la sección 6.8.

| Estado | Token | Badge Label | Ícono Lucide |
|---|---|---|---|
| `Nuevo` | neutral | Nuevo | `CircleDot` |
| `Enviado` | `--color-info` | Enviado | `Send` |
| `Confirmado` | `--color-warning` | Confirmado | `CheckCircle2` |
| `Pagado` | `--color-success` | Pagado | `BadgeCheck` |
| `Cobrado` | `--color-success` | Cobrado | `HandCoins` |

Los estados anteriores se migraron: Aprobado → Confirmado, Incorrecto → Nuevo, Facturado → Pagado o Cobrado según el neto.

### Estados de Facturación

> ⏳ Pendiente — fase posterior del desarrollo.

### Estados de Cobros y Pagos

Cobros y Pagos no tiene estados propios: lista las conciliaciones **Confirmado** y las cierra como **Pagado** o **Cobrado** (sección 6.13).

---

## 12. Diseño de base de datos Supabase (Postgres)

> 🔄 Sección reescrita 2026-09-13. **La base de datos con la que se trabaja es Supabase (Postgres)** — Firestore ya no existe en este sistema. Esta sección documenta el esquema REAL y vigente, tal como vive en `supabase_schema.sql` (raíz del repo), que es la única fuente de verdad — cualquier tabla nueva se define primero ahí (con sus políticas RLS) y luego se refleja aquí. El agente AI no debe crear tablas adicionales a las aquí documentadas sin actualizar ambos archivos.

> **Alcance actual**: las 21 tablas de esta sección ya están migradas y en uso — Dispatcher, Disponibilidad, los catálogos de Gestión (Áreas, Mensajeros, Negocios, Métodos de Pago, Razón de Cambio, Roles y Usuarios, Logs de Auditoría, Data, Roles de Acceso, Comisión Mandao, Alquiler de Mochila) y **Conciliación de Negocios y de Mensajeros**. Facturación, Cuentas por Cobrar/Pagar y Planificación de Pagos (de ambas entidades) siguen sin tabla propia — ver "Tablas pendientes" al final de esta sección.

### Tablas activas — Fase actual ✅

**1. `public.profiles`** — usuarios y roles (extiende `auth.users` de Supabase Auth)

| Campo | Tipo |
|---|---|
| `id` | uuid (PK, FK a `auth.users`) |
| `full_name` | text |
| `email` | text |
| `role` | enum `user_role`: `super_admin` / `supervisor` / `operador` / `visitante` |
| `active` | boolean — si `false`, cuenta pendiente de autorización (ver sección 19.3.1) |
| `access_role_id` | uuid (FK a `access_roles`, nullable) — Rol de Acceso opcional (agregado 2026-09-23, ver tabla 17 y sección 19.3.2) |
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
| `rate_cup` | numeric(18,8) — **USD por 1 CUP** (ej. 0.002 ≈ 500 CUP por USD; admite valores menores que 1, cambiado 2026-10-01) |
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

**16. `public.import_sources`** — Data (agregado 2026-09-22)

| Campo | Tipo |
|---|---|
| `import_source_id` | uuid (PK) |
| `entity_type` | `businesses` / `messengers` |
| `name` | text — nombre de referencia |
| `sheet_document_id` | text — ID del Google Sheet de origen |
| `active` | boolean |
| `created_at` / `updated_at` | timestamptz |

Catálogo de IDs de Google Sheet para la Importación Masiva de Gestión de Negocios/Mensajeros (Configuración → Data). No guarda datos importados — al ejecutar la importación se listan las pestañas reales del documento vía la API de Google Sheets y se elige cuál contiene los datos (por defecto, la que coincide con "Data Negocios"/"Data Mensajeros").

> **Resolución de Área (agregado 2026-09-22)**: la columna "Área"/"Provincia" de la hoja trae nombres reales de provincia (ej. "Santa Clara"), que no necesariamente coinciden con `areas.name`. `BulkImportModal.tsx` primero intenta un match exacto de nombre y, si no hay, categoriza por provincia (Habana / Holguín / Provincias — todo lo que no sea Habana ni Holguín) usando `areas.province`, igual que ya hace `VerificationPage.tsx` para el Dispatcher. Como la importación hace upsert por nombre, reimportar corrige retroactivamente los registros que hubieran quedado con `area_id` nulo.

**17. `public.access_roles`** — Roles de Acceso (agregado 2026-09-23)

| Campo | Tipo |
|---|---|
| `access_role_id` | uuid (PK) |
| `name` | text — único |
| `description` | text |
| `module_keys` | text[] — ids de módulos/ítems de menú que este rol deja ver (ver `moduleCatalog.ts`) |
| `created_at` / `updated_at` | timestamptz |

> **Unificado 2026-09-24** (ver sección 19.3.2): `RolesUsuariosPage.tsx` pestaña "Roles" lista los 4 roles de sistema (Super Admin/Supervisor/Operador/Visitante, `is_system = true`, no eliminables) más los que se creen. Sigue sin reemplazar `profiles.role`/RLS: `base_role` solo decide qué valor de `profiles.role` se copia al asignar ese Rol de Acceso a un usuario.

**18. `public.commission_settings`** — Comisión Mandao (agregado 2026-09-24)

| Campo | Tipo |
|---|---|
| `entity_type` | text (PK) — `'businesses'` / `'messengers'` |
| `percentage` | numeric(5,2) |
| `updated_at` / `updated_by` | timestamptz / uuid (FK a `auth.users`) |

Un solo valor vigente por tipo de entidad (sin historial de tasas pasadas). `businesses` = 20%, `messengers` = 10% (confirmado por el usuario 2026-09-30) — ambos ajustables desde Configuración → Comisión Mandao. Usada por Conciliación de Negocios (sección 6.4) y de Mensajeros (sección 7.3) para calcular CxC/CxP.

**19. `public.conciliaciones_businesses`** — Conciliación de Negocios (agregado 2026-09-24, renombrada de `conciliaciones` 2026-09-30)

| Campo | Tipo |
|---|---|
| `conciliacion_id` | uuid (PK) |
| `fecha` | date — fecha de ejecución |
| `business_id` / `establecimiento` | uuid (FK a `businesses`) / text denormalizado |
| `fecha_inicial` / `fecha_final` | date |
| `area_id` / `area` | uuid (FK a `areas`) / text denormalizado |
| `ordenes_efectivo` / `cxc_cu` | integer / numeric(12,2) |
| `ordenes_transfermovil` / `cxp_tm` | integer / numeric(12,2) |
| `ordenes_saldo_mandao` / `cxp_sm` | integer / numeric(12,2) |
| `ordenes_tarjeta` / `cxp_us` | integer / numeric(12,2) |
| `via_pago` | text — riel de liquidación de ESTA fila: `"Transferencia"` / `"Efectivo"` / `"Exterior"` (agregado 2026-09-30; antes guardaba el método de pago crudo del negocio) |
| `moneda` | text — `'CUP'` o `'USD'` (agregado 2026-09-30, ver sección 6.4) |
| `responsable` / `responsable_id` | text / uuid (FK a `auth.users`) |
| `conciliacion` | text — label clickeable, genera PDF al vuelo |
| `estado` | text — ciclo de vida `Nuevo`/`Enviado`/`Confirmado`/`Pagado`/`Cobrado` (desde 2026-10-27, ver sección 6.8), `'Nuevo'` al insertar |
| `facturacion`, `descuento`, `nota`, `pagado`, `saldo`, `estado_pago`, `referencia`, `fecha_pago`, `prioridad` | nullable — los completan Facturación/CxC/CxP (sin construir aún) |
| `created_at` / `updated_at` | timestamptz |

Índice único `uq_conciliaciones_businesses_range` sobre `(business_id, fecha_inicial, fecha_final, via_pago)` (ampliado 2026-09-30 para permitir hasta 2 filas por negocio+rango) — refuerza a nivel de base de datos la regla de no-duplicidad (sección 6.4.2).

**20. `public.conciliaciones_messengers`** — Conciliación de Mensajeros (agregado 2026-09-30)

| Campo | Tipo |
|---|---|
| `conciliacion_id` | uuid (PK) |
| `fecha` | date — fecha de ejecución |
| `messenger_id` / `mensajero` | uuid (FK a `messengers`) / text denormalizado |
| `fecha_inicial` / `fecha_final` | date |
| `area_id` / `area` | uuid (FK a `areas`) / text denormalizado |
| `ordenes_efectivo` / `cxc_cu` | integer / numeric(12,2) |
| `ordenes_transfermovil` / `cxp_tm` | integer / numeric(12,2) |
| `ordenes_saldo_mandao` / `cxp_sm` | integer / numeric(12,2) |
| `ordenes_tarjeta` / `cxp_us` | integer / numeric(12,2) |
| `tipo_mochila` | text — `messengers.backpack_type` al momento de conciliar |
| `alquiler_mochila` | numeric(12,2) — tarifa vigente en `backpack_rental_rates` para ese tipo de mochila, ver tabla 21 y sección 7.4 |
| `disponibilidades` | numeric(12,2) — suma de `availabilities.amount_to_pay` del mismo mensajero/rango |
| `total_ordenes` | integer |
| `total_por_cobrar` / `total_por_pagar` | numeric(12,2) |
| `saldo_cup` | numeric(12,2), nullable — neto (Total por Pagar − Total por Cobrar) en CUP, sin conversión |
| `via_pago` | text — `messengers.payment_method` |
| `responsable` / `responsable_id` | text / uuid (FK a `auth.users`) |
| `conciliacion` | text — label clickeable, genera PDF al vuelo |
| `estado` | text — mismo ciclo de vida que `conciliaciones_businesses` |
| `facturacion` | nullable |
| `created_at` / `updated_at` | timestamptz |

Índice único `uq_conciliaciones_messengers_range` sobre `(messenger_id, fecha_inicial, fecha_final)`.

**21. `public.backpack_rental_rates`** — Alquiler de Mochila (agregado 2026-09-30)

| Campo | Tipo |
|---|---|
| `backpack_type` | text (PK) — `'Pequeña'` / `'Grande'` |
| `rate` | numeric(12,2) |
| `updated_at` / `updated_by` | timestamptz / uuid (FK a `auth.users`) |

Tarifa fija por tipo de mochila, gestionada en el mismo submódulo Configuración → Comisión Mandao (sección 7.4). Ambas filas arrancan en `$0.00` — sin valor real confirmado todavía, se configuran desde la UI antes de afectar una conciliación real. Usada por Conciliación de Mensajeros para restar de Total por Pagar según `messengers.backpack_type` (ver tabla 20, columna `alquiler_mochila`).

**22. `public.payment_groups`** — Grupos de Pago (agregado 2026-10-27)

| Campo | Tipo |
|---|---|
| `group_id` | uuid (PK) |
| `name` | text — único |
| `sort_order` | int — orden de la columna en el PDF (los nuevos van al final) |
| `active` | boolean |
| `created_at` / `updated_at` | timestamptz |

Columnas del PDF de conciliación (sección 8.3). Valores iniciales: Efectivo, Pago en Línea, Pago en Línea Exterior.

**23. `public.consecutivo_series`** — Formato de Consecutivo (agregado 2026-10-27c, por entidad 2026-11-02)

| Campo | Tipo |
|---|---|
| `serie` | text (PK) — clave fija que lleva el contador: `PN`, `CN`, `PNU`, `CNU`, `PM`, `CM`, `PMU`, `CMU` |
| `entidad` | `negocios` / `mensajeros` |
| `sentido` | `pagar` / `cobrar` |
| `moneda` | `CUP` / `USD` |
| `prefijo` | text — único, 1–10 letras o números |
| `formato_anio` | `AA` / `AAAA` / `ninguno` |
| `separador` | `''` / `-` / `.` / `_` |
| `digitos` | int (1–10) |
| `reinicio` | `anual` / `nunca` (obligatorio `nunca` si no hay año) |
| `updated_at` | timestamptz |

Índice único `(entidad, sentido, moneda)`. Los contadores viven en `conciliacion_consecutivos (prefijo = serie, anio, ultimo)`, sin políticas: solo los usa la función `next_conciliacion_consecutivo` (security definer), que llaman los triggers `set_consecutivo_conciliacion_negocio` / `_mensajero` al insertar o al reconciliar una liquidación que estaba en 0. Ver secciones 6.7 y 8.4.

**24. `public.conciliaciones_reconciliaciones`** — Registro de reconciliaciones (agregado 2026-10-27b)

| Campo | Tipo |
|---|---|
| `reconciliacion_id` | uuid (PK) |
| `entidad` | `negocios` / `mensajeros` |
| `conciliacion_id` | uuid — fila reconciliada |
| `consecutivo` | text |
| `estado_anterior` | text |
| `antes` / `despues` | jsonb — montos, órdenes, % comisión, tasa, desglose (y en Mensajeros disponibilidades, mochila y totales) |
| `responsable` / `responsable_id` | text / uuid |
| `created_at` | timestamptz |

Solo lectura desde la app: la escribe el trigger `reconciliacion_conciliacion` (before update en ambas tablas de conciliación), que además bloquea cambios de montos fuera de Nuevo/Enviado, mantiene el consecutivo, cuenta `reconciliaciones` y actualiza `estado_at`. Ver sección 6.9.

**Columnas agregadas a tablas existentes (2026-10-27 a 2026-11-02):**

| Tabla | Columnas |
|---|---|
| `payment_methods` (13) | `tipologia` (`cobrar`/`pagar`), `currency` (`CUP`/`USD`), `group_id` (FK `payment_groups`) — clasificación de los métodos de Órdenes (sección 6.3) |
| `messengers` (12) | `email` — destinatario del correo de conciliación |
| `conciliaciones_businesses` (19) | `consecutivo` (único), `pdf_drive_file_id` / `pdf_drive_url`, `comision_pct`, `tasa_cambio`, `desglose` (jsonb), `estado_at`, `reconciliaciones`, `reconciliado_at`, `enviado_at`, `enviado_a`. `estado` ahora con `check` `Nuevo`/`Enviado`/`Confirmado`/`Pagado`/`Cobrado` |
| `conciliaciones_messengers` (20) | Las mismas (excepto `tasa_cambio`) más `moneda` (`CUP`/`USD`, hoy siempre CUP) |
| `app_settings` | Claves `conciliacion_correo_asunto` / `_cuerpo` / `_cc` (plantilla del correo, sección 8.5) y las carpetas de Drive por entidad |

Migraciones correspondientes en `supabase/migrations/`: `2026-10-27_tipologia_moneda_grupo_pagos.sql`, `2026-10-27b_estados_reconciliacion.sql`, `2026-10-27c_formato_consecutivo.sql`, `2026-10-27d_envio_correo_conciliaciones.sql`, `2026-11-02_consecutivo_por_entidad.sql` (todas incorporadas a `supabase_schema.sql`).

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
- **Catálogos** (`areas`, `messengers`, `payment_methods`, `exchange_rates`, `businesses`, `import_sources`, `access_roles`, `commission_settings`, `backpack_rental_rates`): CRUD completo (`for all`) solo `super_admin`.
- **`conciliaciones_businesses` / `conciliaciones_messengers`**: CRUD completo (`for all`) requiere `is_admin_or_supervisor()` — es un proceso que mueve dinero, mismo nivel que Importación, no de solo-lectura como Verificar (Operador no puede ejecutar Conciliación).

### Tablas pendientes — módulo financiero sin diseñar ⏳

> Conciliación de Negocios (tabla 19, sección 6) y de Mensajeros (tabla 20, sección 7) ya se implementaron. Lo que queda sin construir es: Facturación, Cuentas por Cobrar, Cuentas por Pagar y Planificación de Pagos (de Negocios y de Mensajeros).

| Módulo | Estado |
|---|---|
| Conciliación de Negocios | ✅ implementado (tabla `conciliaciones_businesses`) |
| Conciliación de Mensajeros | ✅ implementado (tabla `conciliaciones_messengers` + `backpack_rental_rates` para Alquiler de Mochila, sección 7.4) |
| Facturación | ⏳ solo UI con `MOCK_DATA`, sin tabla |
| Cuentas por Cobrar | ⏳ solo UI con `MOCK_DATA`, sin tabla |
| Cuentas por Pagar | ⏳ solo UI con `MOCK_DATA`, sin tabla |
| Planificación de Pagos | ⏳ solo UI con `MOCK_DATA`, sin tabla |

Ninguna de estas páginas se relaciona hoy con `dispatcher`, `businesses` o `messengers`, y no hay reglas de negocio documentadas para calcular comisiones desde las órdenes ni impuestos. Diseñar ese esquema requiere primero esas reglas de negocio — pospuesto explícitamente hasta contar con ellas (decisión 2026-09-10), igual que se hizo para Conciliación de Negocios (sección 6) antes de construirla.

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

- Esquema completo definido y validado en `supabase_schema.sql`: **21 tablas** (detalle completo en la sección 12), con políticas **RLS** activas en todas ellas, más funciones auxiliares (helper functions).
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

### 19.3.2 Roles de Acceso: agrupador de menú, no de seguridad (agregado 2026-09-23)

`RolesUsuariosPage.tsx` tiene dos pestañas: **Usuarios** (CRUD de `profiles`, igual que antes) y **Roles de Acceso** (CRUD de `access_roles`, tabla 17 de la sección 12). Es una capa **nueva y completamente separada** del modelo de seguridad de los 4 roles fijos:

- Un Rol de Acceso es un nombre + una lista de módulos (`module_keys`, ids de `moduleCatalog.ts` — la misma fuente que arma el menú lateral en `AppShell.tsx`) que ese rol deja ver, marcados como etiquetas (click para activar/desactivar).
- En la pestaña Usuarios, cada persona puede tener asignado opcionalmente uno de estos roles (`profiles.access_role_id`), además de su rol fijo de siempre.
- Si un usuario **no** tiene Rol de Acceso asignado (`access_role_id = NULL`, el caso de todo usuario creado antes de este cambio), el menú se sigue filtrando exactamente como antes, según su rol fijo (`hasPermission()` en `AppShell.tsx`).
- Si **sí** tiene uno asignado, el menú lateral muestra únicamente los módulos de `access_roles.module_keys` — sin importar el rol fijo.
- **Esto no cambia la seguridad real del sistema**: lo que un usuario puede leer/escribir en Supabase lo siguen decidiendo exclusivamente `profiles.role` y las políticas RLS (sección 12), que no fueron tocadas. Un Rol de Acceso solo decide qué ítems de menú se muestran; si un usuario llegara a ver un módulo para el que su rol fijo no tiene permiso de escritura, Supabase seguiría rechazando esa escritura vía RLS.

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
>
> **Convención (2026-10-01):** El Toque publica CUP por 1 USD (ej. 500); el sistema guarda USD por 1 CUP (ej. 0.002). La función `sync-exchange-rate` guarda el inverso (`1 / tasa_el_toque`, 8 decimales) y deja en la descripción el valor original de El Toque.

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