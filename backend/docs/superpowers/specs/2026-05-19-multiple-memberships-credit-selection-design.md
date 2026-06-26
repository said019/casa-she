# Diseño: Múltiples membresías, selección de crédito y bloqueo de Clase Muestra

Fecha: 2026-05-19
Repo: balance-room-api

## Problema

Un usuario puede tener varias membresías activas (ej. una Individual atada a
un estudio + una Mixta). Hoy la reserva de clase auto-selecciona "la primera
membresía activa con créditos ordenada por end_date" y *después* valida la
regla de estudio. Si la elegida es Individual atada a otro estudio, la reserva
se **rechaza (422)** aunque el usuario tenga otra membresía válida (ej. Mixta).
El usuario queda bloqueado pese a tener créditos utilizables.

Además, la Clase Muestra ($99, `package_type = 'sample'`, 1 clase) debe ser
solo para clientes nuevos: si ya tienen un paquete activo no deben poder
comprarla.

La lógica de selección está duplicada en 3 endpoints de `bookings.ts` con
variaciones, lo que hace el bug inconsistente y difícil de mantener.

## Reglas de negocio (confirmadas con el usuario)

1. **Selección de crédito al reservar:** entre las membresías VÁLIDAS para la
   clase/estudio, usar la que **vence antes** (`end_date ASC`). Las de clases
   ilimitadas (`classes_remaining IS NULL`) se usan al final (solo si son la
   única opción válida). Si una membresía no sirve para ese estudio, se salta
   y se prueba la siguiente válida — nunca se bloquea la reserva por elegir mal.
2. **Sin límite de membresías:** un usuario puede tener cuantas membresías
   activas quiera, de cualquier combinación de tipos. No se añade tope.
3. **Bloqueo de Clase Muestra:** si el usuario tiene una **membresía activa
   derivada de un plan con `class_limit > 1`** (un paquete real), NO puede
   comprar la Clase Muestra. Paquetes vencidos/cancelados no bloquean.
4. **Descuento $99 de la Muestra:** ya implementado en commit previo
   (`consumeSampleClassDiscount`). Este diseño NO lo modifica; solo añade el
   bloqueo de compra anterior.

## Arquitectura

Dos piezas independientes, cada una con un propósito único:

### Pieza 1 — `src/lib/membershipSelection.ts` (nuevo)

```
selectMembershipForBooking({
  db,                 // cliente de transacción (pool client)
  userId,
  classFacilityId,    // estudio de la clase (null = desconocido)
  requiredCredits,    // nº de créditos requeridos (>= 1)
}): Promise<MembershipRow | null>
```

Una sola query SQL con `FOR UPDATE` (se invoca dentro de la transacción de
reserva existente). Selecciona y ordena:

- **Filtro estado:** `m.status = 'active'`.
- **Filtro vigencia:** `m.end_date IS NULL OR m.end_date >= (hoy en America/Mexico_City)`.
- **Filtro créditos:** `m.classes_remaining IS NULL OR m.classes_remaining >= requiredCredits`.
- **Filtro estudio** (traducción SQL de `studioBookingError`):
  sea `bound = COALESCE(m.facility_id, o.facility_id)`;
  válida si `bound IS NULL OR (classFacilityId IS NOT NULL AND bound = classFacilityId)`.
  (Si `classFacilityId` es null y `bound` no es null → no es válida, igual que
  hoy `studioBookingError` con clase de estudio desconocido.)
- **Orden:**
  1. bounded antes que ilimitadas: `CASE WHEN classes_remaining IS NULL THEN 1 ELSE 0 END ASC`
  2. `end_date ASC NULLS LAST`
  3. desempate determinístico: `created_at ASC`
  - `LIMIT 1`

Devuelve la fila completa de la membresía o `null`.

JOIN necesario: `LEFT JOIN orders o ON o.id = m.order_id` para obtener
`o.facility_id` (binding heredado del pedido cuando `m.facility_id` es null).

### Pieza 2 — `src/lib/loyalty.ts` (extender)

```
canBuySamplePlan({ db, userId }): Promise<boolean>
```

Devuelve `false` si existe una membresía con `status = 'active'` cuyo plan
tiene `class_limit > 1`. Caso contrario `true`.

```sql
SELECT 1
  FROM memberships m
  JOIN plans p ON p.id = m.plan_id
 WHERE m.user_id = $1
   AND m.status = 'active'
   AND p.class_limit > 1
 LIMIT 1
```

(Sin `FOR UPDATE`: es validación de entrada previa a la transacción.)

## Flujo de datos

### Flujo A — Reserva de clase

Aplica a los 3 call-sites de selección en `src/routes/bookings.ts`:
`POST /` (cliente), `POST /bulk-month` (admin), y cualquier otro auto-select
equivalente (`admin-book` si aplica). Cada uno:

1. Si viene `membershipId` explícito: validar pertenencia, `status='active'`,
   créditos suficientes, y compatibilidad de estudio vía `studioBookingError`.
   Mensajes de error actuales preservados (403 / 422).
2. Si NO viene `membershipId`: llamar `selectMembershipForBooking(...)`.
   - Devuelve membresía → descontar `requiredCredits` y crear booking(s)
     (lógica de descuento y creación SIN cambios).
   - Devuelve `null` → 400 con mensaje que menciona el estudio:
     "No tienes una membresía válida con créditos para una clase en este estudio."
3. Clase gratis (`is_free`) → sin cambios, salta toda la lógica de membresía.

El manejo de transacción / `FOR UPDATE` actual NO se modifica: solo se
reemplaza la query de selección por la llamada al helper (que internamente
ejecuta el `SELECT ... FOR UPDATE`).

### Flujo B — Compra de Clase Muestra

En `POST /orders` (`src/routes/orders.ts`), tras cargar el `plan` y antes de
abrir la transacción de creación de orden:

```
if (plan.package_type === 'sample') {
  if (!(await canBuySamplePlan({ db: pool, userId }))) {
    return res.status(409).json({
      error: 'La Clase Muestra es solo para nuevas clientas. Ya cuentas con un paquete activo.'
    });
  }
}
```

Independiente del descuento $99 existente.

## Casos borde

### Selección de membresía
- Sin membresías activas → 400 (mensaje actual).
- Membresías activas pero ninguna válida para el estudio → 400 con mensaje
  específico de estudio.
- `membershipId` explícito atado a otro estudio → 422 (`studioBookingError`).
- `membershipId` explícito sin créditos / no activa → 403 (mensajes actuales).
- Solo membresía ilimitada válida → se usa (queda al final del orden, pero si
  es la única válida, se elige).
- Empate `end_date` → desempate por `created_at ASC` (estable).
- Clase `is_free` → sin cambios.
- Carrera por último crédito → `FOR UPDATE` serializa; el segundo intento ve
  `classes_remaining` actualizado y falla limpio.

### Bloqueo de Muestra
- Membresía activa de paquete (`class_limit > 1`) → 409.
- Solo paquetes vencidos/cancelados (ninguno activo) → SÍ puede comprar.
- Otra Muestra activa (`class_limit = 1`) → SÍ puede comprar (no es paquete).
- "Clase Suelta" individual activa (`class_limit = 1`) → no bloquea.
- Compra Muestra simultánea con aprobación de paquete → ventana mínima
  aceptable; valida estado al POST. Sin lock añadido (riesgo bajo, consistente
  con la tolerancia de los descuentos founder/sample existentes).

## Testing (TDD)

Tests primero, antes de implementar.

**Unit — `selectMembershipForBooking`:**
- Individual + Mixta mismo estudio → gana la que vence antes.
- Individual (estudio A) + Mixta, clase en estudio B → gana Mixta.
- Solo ilimitada válida → la elige.
- Bounded + ilimitada ambas válidas → elige bounded.
- Ninguna válida (estudio incompatible) → `null`.
- Empate `end_date` → gana `created_at` menor.
- `classFacilityId = null` con membresía bounded → no elegible.

**Unit — `canBuySamplePlan`:**
- Paquete activo → `false`.
- Sin membresías → `true`.
- Paquete vencido/cancelado → `true`.
- Muestra activa (class_limit 1) → `true`.

**Integración:**
- Reservar con 2 membresías en estudios distintos → consume la correcta.
- Comprar Muestra con paquete activo → 409.
- Comprar Muestra sin paquete → éxito (flujo normal + descuento previo intacto).

## Fuera de alcance (YAGNI)

- Selección manual de membresía por el usuario en UI (la regla automática
  cubre el caso; `membershipId` explícito ya existe para casos avanzados).
- Límites/topes de membresías concurrentes.
- Cambios al descuento $99 ya implementado.
- Refactor no relacionado de `bookings.ts`.

## Archivos afectados

- `src/lib/membershipSelection.ts` — NUEVO (Pieza 1 + tests).
- `src/lib/loyalty.ts` — añadir `canBuySamplePlan` (Pieza 2 + tests).
- `src/routes/bookings.ts` — reemplazar 3 auto-selects por el helper.
- `src/routes/orders.ts` — añadir bloqueo de Muestra en `POST /orders`.
