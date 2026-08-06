# Eventos: pago con tarjeta (MercadoPago) y salida del efectivo

Fecha: 2026-08-06
Estado: aprobado, listo para implementar

## Problema

Hoy un evento de pago solo se puede pagar de dos formas desde la app: transferencia
con comprobante, o efectivo. Ambas son manuales — alguien en el estudio tiene que
revisar y confirmar. No hay forma de que una clienta pague un evento con tarjeta y
quede confirmada sola.

## Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Procesador | **MercadoPago** | Ya está vivo y con credenciales en producción (`MP_ACCESS_TOKEN`). Stripe está construido en `lib/stripe.ts` pero nunca se encendió: no hay llaves en Railway y ningún endpoint llama a `createCheckoutSession`. |
| Efectivo | **Fuera de la app; recepción sí puede** | La clienta ya no lo ve, pero si alguien llega al estudio con efectivo, admin lo registra a mano. |
| Recargo por tarjeta | **No** | $350 es $350 pague como pague. La comisión de MP sale del margen. |
| Lugar durante el checkout | **Se aparta, expira a los 30 min** | Protege el cupo sin castigar a quien está pagando. |

## Arquitectura

Se sigue el patrón que ya estableció el Fuel Bar, que resolvió exactamente este
problema: cobrar con MP algo que **no** es una membresía.

`finalizePaidOrder` no sirve para eventos — hace `JOIN plans` y crea `memberships`.
El Fuel Bar lo resolvió con su propia tabla y su propio fulfillment, enrutados por
prefijo en el `external_reference`. Eventos hace lo mismo.

```
POST /events/:id/register  (payment_method: 'card')
  └─> inscripción status='pending'  (el trigger ya aparta el lugar)
      + hold_expires_at = NOW() + 30 min
      └─> createPreference({ external_reference: "event:<registrationId>" })
          └─> devuelve checkout_url  ──> la clienta paga en MP
                                          └─> webhook MP
                                              └─> external_reference empieza con "event:"
                                                  └─> finalizeEventRegistration()
                                                      └─> pending → confirmed
```

### Componentes

**`lib/eventFulfillment.ts`** (nuevo, espejo de `lib/barFulfillment.ts`)

- `finalizeEventRegistration(registrationId, { provider, paymentRef, paidAmount })`
- Idempotente: relee el estado con `FOR UPDATE` dentro de la transacción y aborta si
  ya está `confirmed`. Sin esto, un reintento del webhook confirma dos veces.
- `pending → confirmed`, limpia `hold_expires_at`, escribe en `payments`.

**`releaseExpiredEventHolds(eventId?)`** (nuevo)

```sql
UPDATE event_registrations
   SET status = 'cancelled'
 WHERE status = 'pending'
   AND payment_method = 'card'
   AND hold_expires_at IS NOT NULL
   AND hold_expires_at < NOW()
```

El trigger `update_event_registration_count` decrementa `events.registered` solo.

Se llama en: `GET /events`, `GET /events/:id`, y antes del chequeo de cupo en
`POST /events/:id/register`. El cron queda como respaldo (`ENABLE_CRON_JOBS=true`
en producción, verificado).

**Solo toca holds de tarjeta.** Las transferencias pendientes nunca expiran: esas
esperan confirmación humana, y expirarlas borraría el registro de alguien que ya
transfirió el dinero.

**`routes/mercadopago-webhook.ts`**

Rama nueva junto a la del bar, antes del camino de membresías:

```js
if (orderId?.startsWith('event:')) { ... return }
```

### Migración

`event_registrations` gana:

- `mp_checkout_url TEXT`
- `mp_payment_id TEXT`
- `provider TEXT`
- `hold_expires_at TIMESTAMPTZ`

Idempotente, en el bloque de arranque de `src/index.ts`, siguiendo el patrón del repo.

### Frontend

`pages/client/Events.tsx`: el selector de método pasa de `transfer | cash` a
`transfer | card`. Al elegir tarjeta, el botón dispara el registro y redirige a
`checkout_url`. Efectivo se retira de la app.

El admin (`pages/admin/events/`) no se toca: recepción sigue registrando efectivo.

## Fuera de alcance

- Reembolsos automáticos por MP. Si hay que devolver, es manual desde el panel de MP.
- Lista de espera con cobro: si el evento está lleno, la clienta entra a waitlist sin
  pagar, como hoy.

## Riesgos

**Doble confirmación por reintento del webhook.** Mitigado con `FOR UPDATE` dentro de
la transacción, igual que `finalizePaidOrder` y `finalizeBarOrder`.

**Carrera entre expiración y pago.** Una clienta podría pagar en MP justo cuando su
hold expira. `finalizeEventRegistration` confirma la inscripción aunque el hold haya
vencido — el pago manda sobre el hold. Si el evento ya se llenó mientras tanto,
queda confirmada por encima del cupo y se reporta en el log; se prefiere sobrevender
un lugar antes que cobrarle a alguien y no darle entrada.

## Verificación

- Test de backend para `finalizeEventRegistration`: idempotencia y transición de estado.
- Test para `releaseExpiredEventHolds`: que libere tarjeta vencida y **no** toque
  transferencias pendientes.
- `tsc --noEmit` backend y `npm run build` frontend.
