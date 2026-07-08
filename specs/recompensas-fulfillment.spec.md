# Feature: Fulfillment Automático de Recompensas

## Overview

Cuando una clienta canjea puntos del programa de lealtad, el sistema genera automáticamente
un beneficio usable en su cuenta (clase gratis, descuento en barra/ropa, bebida gratis).
Sin códigos manuales — todo integrado en su wallet y aplicado automáticamente en cada
flujo (reserva de clase, pedido en barra, venta en POS).

---

## Catálogo de Recompensas

| Nombre | Puntos | reward_type | reward_value |
|---|---|---|---|
| Clase de Yoga gratis | 100 pts | `free_class` | `{"class_type":"yoga"}` |
| 10% descuento en barra | 200 pts | `bar_discount` | `{"discount_type":"percentage","amount":10}` |
| Clase de Flex gratis | 300 pts | `free_class` | `{"class_type":"flex"}` |
| 10% descuento en ropa | 400 pts | `product_discount` | `{"discount_type":"percentage","amount":10}` |
| 1 bebida gratis | 500 pts | `free_drink` | `{"quantity":1}` |

---

## Functional Requirements

### FR-001: Tabla user_benefits
The system shall maintain a `user_benefits` table that stores active benefits credited
to each user after redeeming points, with columns for benefit type, value, status,
expiration, and consumption tracking.

### FR-002: Auto-fulfillment al canjear
When a user redeems a reward via POST /api/loyalty/redeem, the system shall:
- Deduct points and create the redemption record (existing behavior)
- Create a `user_benefits` row with `status = 'active'` and `expires_at = NOW() + 30 days`
- Immediately mark the redemption as `fulfilled`

### FR-003: Clase gratis — consumo automático al reservar
While a user has an active `free_class` benefit, when they book a class of the matching
class type (yoga/flex), the system shall:
- Consume the benefit (`status = 'used'`, `used_at = NOW()`)
- Not deduct from `memberships.classes_remaining`
- Set the booking as free (`is_free = true` or equivalent)

### FR-004: Descuento en barra — visible y aplicable en el app
While a user has an active `bar_discount` benefit, when they view the Fuel Bar menu,
the system shall show the available discount. When they confirm the order, the system
shall apply the discount to the order total.

### FR-005: Descuento en ropa — visible en POS/admin
While a user has an active `product_discount` benefit, when an admin/receptionist
creates a sale for that user at the POS, the system shall show the available discount
and apply it to the sale total.

### FR-006: Bebida gratis — consumo automático en barra
While a user has an active `free_drink` benefit, when they place a bar order, the
system shall detect it and offer to apply it. The first drink item in the order shall
be free (100% discount on that item).

### FR-007: Expiración de beneficios
The system shall automatically expire benefits whose `expires_at` has passed. A cron
job or on-read check shall mark them as `status = 'expired'`. Benefits are valid for
30 days from redemption.

### FR-008: Un solo uso por beneficio
The system shall ensure each benefit is consumed exactly once. The status transition
`active → used` shall be enforced at the database level.

### FR-009: Historial de beneficios en wallet del cliente
When a client views their wallet/loyalty page, the system shall display their active
benefits (clases gratis pendientes, descuentos disponibles, bebidas pendientes).

---

## Non-Functional Requirements

### Performance
- Benefit check on booking/checkout: < 50ms (single indexed query)
- Redemption: atomic transaction (already exists)

### Security
- Benefits are user-scoped (user_id FK)
- Only the owning user can consume them
- Admin cannot manually create benefits without a redemption record (auditability)

### Data Integrity
- `user_benefits.status` transitions: active → used | active → expired | active → cancelled
- `used_on_booking_id`, `used_on_bar_order_id`, `used_on_sale_id` provide full traceability
- FK to `redemptions` table links every benefit to its originating redemption

---

## Acceptance Criteria

### AC-001: Canje exitoso crea beneficio activo
Given a client with 200 loyalty points
When they redeem "10% descuento en barra"
Then 200 points are deducted from their balance
And a `user_benefits` row is created with benefit_type='bar_discount', status='active'
And the redemption is marked 'fulfilled'
And the client sees the new benefit in their wallet

### AC-002: Clase gratis se consume al reservar
Given a client with an active free_class benefit for Yoga
When they book a Yoga class
Then the benefit is consumed (status='used')
And their membership classes_remaining is NOT decremented
And the booking is recorded with the benefit reference

### AC-003: Clase gratis no aplica a otro tipo de clase
Given a client with an active free_class benefit for Yoga
When they book a Flex class
Then their membership classes_remaining is decremented normally
And the Yoga benefit remains active (not consumed)

### AC-004: Descuento en barra visible en el app
Given a client with an active bar_discount of 10%
When they open the Fuel Bar menu in the app
Then a banner shows "Tienes 10% de descuento disponible"
And the discount is applied when they confirm the order

### AC-005: Bebida gratis aplica al primer drink
Given a client with an active free_drink benefit
When they place a bar order with 2 drinks and 1 snack
Then the first drink item is free (100% off)
And the benefit is consumed

### AC-006: Puntos insuficientes rechaza canje
Given a client with 50 loyalty points
When they attempt to redeem "Clase de Yoga gratis" (100 pts)
Then the system returns 400 with "Puntos insuficientes"
And no benefit is created

### AC-007: Beneficio expirado no se aplica
Given a client whose bar_discount benefit expired 1 day ago
When they place a bar order
Then the discount is NOT applied
And the benefit status is 'expired'

### AC-008: Descuento en ropa aparece en POS
Given a client with an active product_discount of 10%
When an admin opens the POS and selects that client for a sale
Then the system shows "10% descuento disponible en ropa"
And the discount applies to the sale total on checkout

---

## Error Handling

| Error Condition | HTTP Code | User Message |
|---|---|---|
| Puntos insuficientes | 400 | "No tienes suficientes puntos para esta recompensa" |
| Recompensa agotada (stock=0) | 400 | "Esta recompensa ya no está disponible" |
| Recompensa no encontrada | 404 | "Recompensa no encontrada" |
| Beneficio ya usado | 409 | "Este beneficio ya fue utilizado" |
| Beneficio expirado | 410 | "Este beneficio ha expirado" |
| Clase no coincide con el tipo del beneficio | 200* | (se ignora silenciosamente, no se consume) |

---

## Out of Scope (v1)
- Personalización de vigencia por tipo de recompensa (todas 30 días)
- Notificaciones push/WhatsApp al expirar un beneficio
- Transferencia de beneficios entre usuarias
- Canje parcial de puntos (siempre se canjea el valor completo)

---

## Implementation TODO

### Backend
- [ ] **Migration**: Crear tabla `user_benefits` con columnas y FKs
- [ ] **Migration**: Agregar `class_type` a `loyalty_rewards.reward_value` para diferenciar Yoga vs Flex
- [ ] **Modificar `POST /api/loyalty/redeem`**: Auto-fulfillment — crear `user_benefits` según `reward_type` + `reward_value`
- [ ] **Nuevo endpoint `GET /api/loyalty/my-benefits`**: Listar beneficios activos del usuario autenticado
- [ ] **Modificar `POST /api/bookings`** (o ruta de reserva): Detectar `free_class` activo y consumirlo
- [ ] **Modificar `POST /api/bar/orders`**: Detectar `bar_discount` y `free_drink` activos, aplicar descuento
- [ ] **Nuevo endpoint `GET /api/bar/my-discounts`**: Devolver descuentos de barra activos del usuario
- [ ] **Modificar `POST /api/sales`** (o ruta de ventas POS): Detectar `product_discount` activo y aplicarlo
- [ ] **Cron job**: Marcar beneficios expirados (`status = 'expired'`) cada medianoche

### Frontend
- [ ] **Wallet.tsx**: Mostrar sección "Tus beneficios activos" con tarjetas por tipo
- [ ] **FuelBar.tsx / FuelBarConfirm.tsx**: Banner de descuento disponible + aplicación automática
- [ ] **BookClasses.tsx**: Indicador si el usuario tiene clase gratis pendiente del tipo seleccionado
- [ ] **POS / Sale screen**: Mostrar descuento en ropa disponible para la clienta seleccionada
