# Balance Room — Paquetes (Individual/Mixto), Estudios, Dashboard por Estudio e Ingresos Manuales

**Fecha:** 2026-05-17
**Estado:** Aprobado para implementación

## Contexto

Balance Room es un sistema de reservas + admin para un estudio de Pilates/fitness.

- Frontend: `/Users/saidromero/Balance Room/Balance Room ` (React 18 + TS + Vite, React Query, Zustand, React Router v6, shadcn/Radix, Tailwind).
- API: `/Users/saidromero/Balance Room/balance-room-api` (Express + TS, PostgreSQL vía `pg` con SQL crudo parametrizado, validación Zod, sin ORM). Migraciones idempotentes ejecutadas desde `src/index.ts`.
- 3 estudios reales (tabla `facilities`, sembrados en `balance-room-api/src/index.ts`): **Wunda** (8), **Barre** (12), **Hot Room** (16). Cada clase referencia `classes.facility_id`. La reserva permite elegir lugar (spot/reformer) por estudio.

Hay un sistema de pagos existente: tablas `payments` (ligado a `user_id NOT NULL`), `orders`, `egresos`; UI en `/admin/payments` (`PaymentsRegister.tsx`, `PaymentsHub.tsx`, etc.). El dashboard admin (`Dashboard.tsx`) consume `GET /api/admin/stats` (`routes/admin.ts`).

## Objetivos

1. Reemplazar los paquetes/precios actuales por dos esquemas: **INDIVIDUAL** (un solo estudio) y **MIXTO** (cualquier estudio), más **Clase Muestra**.
2. El paquete INDIVIDUAL queda **bloqueado** a 1 de los 3 estudios, elegido al comprar; las reservas se restringen a ese estudio.
3. El dashboard muestra **clases totales desglosadas por estudio** (Wunda / Barre / Hot Room).
4. Permitir **ingresos manuales**: (a) ingreso libre sin miembro, y (b) mejorar el registro de pago existente con estudio + concepto. Reportes/ingresos deben reflejar ambos.

Fuera de alcance: rediseño visual, cambios en MercadoPago, borrado de datos históricos.

## 1. Modelo de paquetes y precios

### Cambios de esquema (`plans`)

Migración idempotente añade:

- `plans.package_type VARCHAR(20) NOT NULL DEFAULT 'mixto'` — valores: `'individual' | 'mixto' | 'sample'`.
- `plans.requires_studio_selection BOOLEAN NOT NULL DEFAULT false` — `true` solo para `individual`.

### Datos (MXN)

Desactivar (`is_active=false`) todos los planes activos previos (no borrar, conserva historial). Insertar 10 planes nuevos (idempotente vía clave estable, p. ej. `ON CONFLICT (name)` o un `external_key`):

| package_type | name | class_limit | price | duration_days |
|---|---|---|---|---|
| individual | Individual · Clase Suelta | 1 | 180 | 30 |
| individual | Individual · Paquete 4 Clases | 4 | 600 | 30 |
| individual | Individual · Paquete 8 Clases | 8 | 1100 | 30 |
| individual | Individual · Paquete 12 Clases | 12 | 1700 | 30 |
| individual | Individual · Paquete 24 Clases | 24 | 2000 | 30 |
| mixto | Mixto · Paquete 4 Clases | 4 | 670 | 30 |
| mixto | Mixto · Paquete 8 Clases | 8 | 1300 | 30 |
| mixto | Mixto · Paquete 12 Clases | 12 | 1890 | 30 |
| mixto | Mixto · Paquete 24 Clases | 24 | 2600 | 30 |
| sample | Clase Muestra | 1 | 99 | 7 |

- `requires_studio_selection = true` para los 5 `individual`; `false` para `mixto` y `sample`.
- **Clase Muestra gratis con paquete**: regla de punto de venta, NO en el precio del plan. El plan Muestra queda en $90. El admin registra la muestra en $0 cuando acompaña a un paquete (vía registro de pago / ingreso manual). Documentado, sin lógica automática en esta entrega.
- **Vigencia**: paquetes 4/8/12/24 → 30/45/60/90 días (asunción). **Clase Muestra: 7 días** (definido por el negocio).
- **Planes preexistentes**: los planes anteriores se desactivan y se marcan `package_type='mixto'`, `requires_studio_selection=false`, de modo que las membresías/usuarios ya existentes no quedan restringidos a un estudio (se comportan como Mixto).

## 2. Vínculo de estudio en paquete INDIVIDUAL

### Esquema

- `memberships.facility_id UUID NULL REFERENCES facilities(id)`.
- `orders.facility_id UUID NULL REFERENCES facilities(id)`.

Semántica: `NULL` = cualquier estudio (mixto/sample). No NULL = membresía bloqueada a ese estudio (individual).

### Compra

- Flujo de compra/checkout: si `plan.requires_studio_selection`, el cliente DEBE elegir un estudio (Wunda/Barre/Hot Room) antes de pagar.
- El backend valida: si el plan es `individual` y no llega `facility_id` válido → rechazo HTTP 422. El `facility_id` se persiste en `orders` y, al activarse, en `memberships`.

### Enforcement en reserva (booking)

En el endpoint que consume crédito de membresía al reservar:

- Si `membership.facility_id IS NOT NULL` y `class.facility_id <> membership.facility_id` → rechazar con HTTP 422 y mensaje en español: *"Tu paquete individual es solo para el estudio {Nombre}. Elige una clase de ese estudio o usa un paquete Mixto."*
- Si `membership.facility_id IS NULL` → sin restricción de estudio.
- La validación es **autoritativa en backend** (la UI solo asiste).

### UI cliente

- En "Reservar clases", si el usuario tiene membresía individual activa: se indica/filtra que solo puede reservar en su estudio bloqueado. Las clases de otros estudios se muestran deshabilitadas o filtradas con aviso.

## 3. Dashboard — Clases totales por estudio

- `GET /api/admin/stats` agrega campo `classesByStudio: Array<{ facilityId: string; name: string; count: number }>`.
- Query: `classes` del periodo actual ("hoy", zona America/Mexico_City, igual que el conteo existente) con `LEFT JOIN facilities` y `GROUP BY facilities.id, facilities.name`. Incluir SIEMPRE los 3 estudios aunque `count = 0` (LEFT JOIN desde facilities o relleno en código).
- `AdminStats` (tipo frontend) extendido con `classesByStudio`.
- `Dashboard.tsx`: la tarjeta "Clases hoy" se expande con 3 sub-líneas (Wunda · Barre · Hot Room + conteo). Reutiliza estilos existentes; sin rediseño.

## 4. Ingresos manuales

### 4a. Ingreso libre sin miembro — tabla `manual_incomes`

```
manual_incomes (
  id            UUID PK default uuid_generate_v4(),
  amount        DECIMAL(10,2) NOT NULL,
  currency      VARCHAR(3) DEFAULT 'MXN',
  concept       VARCHAR(255) NOT NULL,
  payment_method payment_method NOT NULL,        -- enum existente: cash|transfer|card|online
  facility_id   UUID NULL REFERENCES facilities(id),  -- NULL = general
  notes         TEXT,
  income_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  processed_by  UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
)
```

- Endpoint `POST /api/payments/manual-income` (admin/reception). Validación Zod: `amount>0`, `concept` requerido, `paymentMethod` enum, `facilityId` opcional UUID, `incomeDate` opcional, `notes` opcional.
- Endpoint `GET /api/payments/manual-income` con filtros (rango de fechas, estudio, método) para listado.
- UI: nueva sección/pestaña en el hub `/admin/payments` ("Ingreso manual") con formulario: monto, concepto, método, estudio (opcional), fecha (default hoy), notas. Listado de ingresos manuales recientes.

### 4b. Mejora al registro de pago existente

- `payments`: añadir `facility_id UUID NULL REFERENCES facilities(id)` y `concept VARCHAR(255) NULL`.
- `POST /api/payments/register` + `PaymentsRegister.tsx`: campos opcionales **estudio** y **concepto** (Zod backend + form frontend).

### 4c. Consistencia de ingresos en reportes/dashboard

- La query de "Ingresos hoy" (`routes/admin.ts`) y la de reportes de pagos suman `manual_incomes` del periodo además de `orders/payments`. Se mantiene el desglose bruto/neto existente; `manual_incomes` se considera ingreso bruto (sin comisión de tarjeta salvo método `card`, fuera de alcance fino aquí — se documenta).
- Donde ya hay filtros por método/fecha, se añade filtro por estudio cuando aplique.

## 5. Arquitectura, errores y pruebas

### Migración

- Una migración SQL idempotente nueva, ejecutada con el patrón existente en `balance-room-api/src/index.ts` (bloques `ON CONFLICT` / `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`):
  1. `ALTER TABLE plans ADD COLUMN IF NOT EXISTS package_type ...`, `requires_studio_selection ...`.
  2. `ALTER TABLE memberships/orders/payments ADD COLUMN IF NOT EXISTS facility_id ...`; `payments.concept`.
  3. `CREATE TABLE IF NOT EXISTS manual_incomes ...`.
  4. Desactivar planes previos e insertar los 10 nuevos (idempotente).
- Reentrante: correr la migración 2+ veces no duplica planes ni columnas.

### Errores

- Validación Zod en todos los endpoints nuevos/modificados.
- Rechazo de reserva fuera de estudio: HTTP 422, mensaje en español, sin consumir crédito.
- Estudio obligatorio en compra individual: validado en backend, no solo UI.

### Pruebas (TDD)

- Reserva: (i) membresía individual + clase de otro estudio → 422 sin consumir crédito; (ii) membresía individual + clase de su estudio → OK; (iii) membresía mixto → cualquier estudio OK; (iv) membresía sample/sin facility → sin restricción.
- `classesByStudio`: devuelve los 3 estudios, conteos correctos, incluye 0.
- Compra: plan individual sin `facility_id` → 422; con `facility_id` válido → persiste en order/membership.
- Ingreso manual: creación válida; `amount<=0` → 422; listado con filtros.
- Ingresos del dashboard incluyen `manual_incomes`.

### Restricciones

- SQL parametrizado, estilo del repo, sin ORM.
- No se modifica MercadoPago ni el diseño visual salvo el desglose del dashboard.
- Datos históricos no se borran (planes viejos solo `is_active=false`).

## Criterios de aceptación

- [ ] Los 10 planes nuevos existen y los viejos están inactivos; precios exactos según tabla.
- [ ] Comprar paquete individual exige y guarda estudio; mixto/sample no.
- [ ] No se puede reservar una clase fuera del estudio bloqueado de un paquete individual.
- [ ] El dashboard muestra clases de hoy desglosadas por Wunda / Barre / Hot Room.
- [ ] Existe ingreso manual sin miembro (con estudio/concepto) y el registro por miembro acepta estudio/concepto.
- [ ] "Ingresos hoy" y reportes incluyen los ingresos manuales.
- [ ] Migración idempotente; pruebas en verde.
