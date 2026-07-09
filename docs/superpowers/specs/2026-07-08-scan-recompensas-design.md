# Diseño: Escaneo QR de Wallet → Ficha del Cliente + Recompensas

**Fecha:** 2026-07-08
**Estado:** Borrador (pendiente de revisión del usuario)
**Autor:** Sesión de brainstorming
**Relacionado:** `2026-07-07-loyalty-activation-design.md`

## Problema

El sistema de lealtad de Casa Shé ya está construido: catálogo de recompensas
(`loyalty_rewards`), ledger de puntos (`loyalty_points`), canjes (`redemptions`) y
beneficios ya canjeados (`user_benefits` con `status` y `expires_at`). El cliente ve
sus puntos y recompensas en `/app/wallet`, pero el staff no tiene forma de verificar
en el punto de servicio que un cliente "de verdad" tiene una recompensa utilizable, ni
de consumirla o canjearla a nombre del cliente.

Preguntas del dueño:

> "Cuando se escanea el QR de su wallet, que aparezca la información del cliente y si
> tiene recompensas; al igual que en la cartera se ven las recompensas, ¿cómo sé que de
> verdad se pueden usar?"

## Contexto verificado en el código

Lo que ya existe y se reutiliza:

- Rol **`reception`** en el enum `user_role` (`schema_complete.sql:25-32`,
  `types/auth.ts:4`), con sub-flag `is_reception_master` y permisos granulares
  (`middleware/requirePermission.ts`, `lib/permissions.ts`).
- `POST /api/loyalty/redeem` (`routes/loyalty.ts:430`) — canje transaccional con
  `FOR UPDATE`, descuenta puntos, crea `user_benefits` con `expires_at`, descuenta
  stock. **Pero destina el canje a `req.user.userId`** (`loyalty.ts:431`): no se
  puede canjear a nombre de otro.
- `GET /api/loyalty/my-benefits` (`loyalty.ts:389`) — lista beneficios activos del
  usuario autenticado, marca expirados on-the-fly. **Hardcodeado a
  `req.user.userId`** (`loyalty.ts:391`).
- `GET /wallet/pass` (`routes/wallet.ts:186`) devuelve `qrPayload` firmado
  (`buildQrPayload`, `wallet.ts:60-73`: JSON `{t:'checkin', m:userId, ms:membershipId,
  e:expiresAt, h:sha256}` en base64url, 24 h, HMAC vs `CHECKIN_SECRET`).
  **Ningún frontend lo renderiza.**
- Pases Apple/Google Wallet codifican `membership.id` crudo (`apple-wallet.ts:410`,
  `google-wallet.ts:434`).
- `POST /api/checkin/qr` (`routes/checkin.ts:224`) ya valida el `qrPayload` firmado
  (`QrPayloadSchema` `checkin.ts:59`, decodificación `checkin.ts:71`, expiración
  `checkin.ts:252`, HMAC `checkin.ts:256`). Reutilizable para `lookup`.
- `POST /api/checkin/event-qr` (`checkin.ts:1163`) ya resuelve `membership_id` crudo
  → `user_id` (`checkin.ts:1218`, `SELECT user_id FROM memberships WHERE id=$1`).
- Búsqueda manual de clientes: `GET /api/users?search=&role=client&withMembership=true`
  (`routes/users.ts:1035`, gate admin/super_admin/reception).
- Tabla `user_benefits` (`index.ts:3581`): `id, user_id, benefit_type, benefit_value,
  status, redemption_id, class_type_id, expires_at, used_at, used_on_booking_id,
  used_on_bar_order_id, used_on_sale_id, created_at`.
  - **No existe `used_by`** ni actor que registre qué staff marcó el beneficio.
- `user_benefits.class_type_id` restringe el tipo de clase de un beneficio
  `free_class`; se valida **solo al reservar** (`bookings.ts:602-611`).
- `free_class` solo pasa a `status='used'` en `bookings.ts:768` (tras insertar la
  reserva y validar `class_type_id`). `bar.ts:215/218` marcan `used` solo para
  `bar_discount`/`free_drink`. No hay endpoint "use benefit" genérico.
- Frontend: `@yudiel/react-qr-scanner` (usado en `EventDetailView.tsx`),
  `qrcode.react` instalada pero sin usar.
- No todos los clientes tienen `membership_id` (solo los de plan). Clientes sin plan
  no se resuelven por QR nativo; el QR de la web sí los cubre (lleva `userId`).

## Alcance (decisiones del dueño)

- Ver **catálogo canjeable** + **beneficios vigentes**, y actuar sobre ambos.
- Aceptar **ambos formatos de QR**: firmado de la web y `membership_id` crudo del
  pase nativo.
- Usan la pantalla: **recepción** y **admins** (no instructores).
- Aplicar beneficio: **marcar "usado" en el momento** ahora; vincular a
  reserva/pedido queda como mejora futura.
- Fallback de **búsqueda manual** por nombre/email/membership id.

### Refinamiento obligado por el código

"Marcar usado en el momento" aplica **solo a beneficios de punto-de-venta que no
necesitan contexto**: `free_drink`, `bar_discount`, `product`, `product_discount`,
`discount`.

Un beneficio `free_class` **no se marca usado suelto**: su restricción de
`class_type_id` se valida únicamente al reservar la clase (`bookings.ts:602-611`).
Marcarlo "usado" sin reserva consumiría el voucher sin registrar ninguna clase gratis
(mala contabilidad). Por tanto el `free_class` se muestra como **vigente** con la nota
*"se aplica al reservar la clase"* y **sin** botón de marcado suelto. El flujo de
reserva existente ya lo consume y respeta el tipo de clase.

## Arquitectura (Enfoque A — lookup unificado)

Un endpoint de "lookup" que resuelve cualquier QR/búsqueda a un `userId` y devuelve
la ficha del cliente, más endpoints de acción sobre beneficios y catálogo. Una
pantalla de staff dedicada. El QR del cliente se muestra en la web wallet.

### Unidades

1. **Migración `user_benefits.used_by`** — añade auditoría de quién consume un
   beneficio.
2. **`POST /api/wallet/lookup`** — resuelve QR/búsqueda → `userId` + ficha.
3. **`GET /api/loyalty/users/:userId/benefits`** — lista beneficios de un cliente con
   flags de usabilidad.
4. **`POST /api/loyalty/users/:userId/redeem`** — canje a nombre del cliente.
5. **`POST /api/loyalty/benefits/:id/use`** — marca beneficio usado (atómico).
6. **Web QR del cliente** — render del `qrPayload` en `/app/wallet`.
7. **Pantalla `/app/reception/scan`** — escáner + búsqueda manual + ficha + acciones.

Cada unidad tiene una responsabilidad clara, se comunica por interfaces definidas y
es testeable de forma independiente.

## Detalle por unidad

### 1. Migración `user_benefits.used_by`

- `ALTER TABLE user_benefits ADD COLUMN used_by UUID REFERENCES users(id)`.
- Rellenar en los 3 sitios existentes con `req.user.userId`:
  - `bookings.ts:768` (`UPDATE user_benefits SET status='used', used_at=NOW(),
    used_by=$staff, used_on_booking_id=...`)
  - `bar.ts:215` y `bar.ts:218` (análogo con `used_on_bar_order_id`).
- Tipos TS `UserBenefit` (`types/benefits.ts:52-66`): añadir `usedBy?`.

### 2. `POST /api/wallet/lookup`

- Gate: `requireRole('admin','super_admin','reception')`.
- Body (al menos uno): `{ qrPayload?: string, membershipId?: string, userId?: string }`.
- Resolución por orden de prioridad:
  1. `qrPayload` → decodificar base64url, validar `QrPayloadSchema`, comprobar
     `expiresAt` y HMAC SHA256 vs `CHECKIN_SECRET` (reutilizar helpers de
     `checkin.ts:59-256`). Si expiró o firma inválida → `400`.
  2. `membershipId` → `SELECT user_id FROM memberships WHERE id=$1`. Si no existe →
     `404` (sugerir búsqueda manual; cliente sin plan no tiene membership).
  3. `userId` → directo (vía búsqueda manual).
- Respuesta (ficha):
  ```json
  {
    "userId": "...",
    "name": "...",
    "email": "...",
    "phone": "...",
    "photoUrl": "...",
    "membership": { "status": "active" | "none" | "...", "planName": "..." | null },
    "pointsBalance": 250,
    "streak": { "current": 3, "best": 7 }
  }
  ```
- Reutiliza la lectura de saldo (`users.loyalty_points` o
  `syncUserLoyaltyPointsSnapshot`) y streak (`GET /loyalty/my-streak`).

### 3. `GET /api/loyalty/users/:userId/benefits`

- Gate: `requireRole('admin','super_admin','reception')`.
- Reutiliza la query de `GET /loyalty/my-benefits` (`loyalty.ts:400-409`) con
  `WHERE ub.user_id = $1`, más el `UPDATE ... expired WHERE expires_at < NOW()`
  on-the-fly (`loyalty.ts:394-398`).
- Cada beneficio incluye flags calculados:
  - `usableNow`: `status === 'active' && expires_at > NOW()`.
  - `markableNow`: `usableNow && benefit_type ∈ {free_drink, bar_discount,
    product, product_discount, discount}` (i.e. NO `free_class`, ni
    `membership_extension`, ni `discount_package` en esta fase).
  - `expiresSoon`: `usableNow && expires_at < NOW() + interval '3 days'`.
- Campos devueltos: `id, type, value, status, expiresAt, classTypeId, classTypeName,
  createdAt, usableNow, markableNow, expiresSoon`.

### 4. `POST /api/loyalty/users/:userId/redeem`

- Gate: `requireRole('admin','super_admin','reception')`.
- Body: `{ rewardId: string }`.
- Réplica transaccional de `POST /loyalty/redeem` con destinatario `:userId` (en vez
  de `req.user.userId`):
  - `SELECT loyalty_points FROM users WHERE id=:userId FOR UPDATE`.
  - `SELECT * FROM loyalty_rewards WHERE id=$rewardId AND is_active=true FOR UPDATE`.
  - Validar `stock > 0` y `points_balance >= points_cost`.
  - `INSERT redemptions (user_id, ..., fulfilled_by = req.user.userId, status='fulfilled')`.
  - `INSERT loyalty_points (user_id, points=-cost, type='redemption', related_reward_id)`.
  - `INSERT user_benefits (user_id, ..., expires_at)`.
  - Actualizar snapshot de puntos, descontar stock.
- Respuesta: el beneficio creado (mismo formato que el endpoint 3), para que el
  frontend lo muestre inmediatamente como vigente.
- Errores: `402` puntos insuficientes, `409` sin stock o recompensa inactiva,
  `404` cliente o recompensa no encontrados.

### 5. `POST /api/loyalty/benefits/:id/use`

- Gate: `requireRole('admin','super_admin','reception')`.
- Flujo atómico:
  - `BEGIN; SELECT * FROM user_benefits WHERE id=$1 FOR UPDATE;`
  - Validar `status='active'` y `expires_at > NOW()` (si no → `409`).
  - Validar `benefit_type` es marcable (`markableNow` set); si es `free_class` u
    otro no-marcable → `409` con mensaje "Aplica este beneficio al reservar la
    clase; no se puede marcar usado suelto."
  - `UPDATE user_benefits SET status='used', used_at=NOW(), used_by=req.user.userId
    WHERE id=$1; COMMIT;`
- Sin body (sin `notes` en esta fase; el `used_by` + `used_at` es la auditoría
  mínima). Una columna `used_notes` queda como mejora futura.
- Respuesta: el beneficio actualizado.

### 6. Web QR del cliente

- En `frontend/src/pages/client/Wallet.tsx`, añadir `QRCodeCanvas` de `qrcode.react`
  usando `qrPayload` de la respuesta de `GET /wallet/pass` (campo ya devuelto,
  hoy ignorado).
- Refetch del `qrPayload` al montar y cuando falte o esté por expirar (24 h). El QR
  se muestra con una etiqueta "Muéstralo en recepción".
- Es la fuente de QR que cubre a **todos** los clientes (con o sin plan), a
  diferencia del pase nativo (solo membresías).

### 7. Pantalla `/app/reception/scan`

- Nueva ruta en `App.tsx` con guard `reception`/`admin`/`super_admin`.
- Componentes:
  - **Escáner** (`@yudiel/react-qr-scanner`, igual que `EventDetailView.tsx`). Al
    detectar un QR → `POST /api/wallet/lookup` con `qrPayload` o `membershipId`
    según el contenido.
  - **Búsqueda manual**: input que llama a
    `GET /api/users?search=&role=client&withMembership=true`; al elegir un cliente
    → `POST /api/wallet/lookup` con `userId` (o directamente usa el `userId`
    devuelto).
  - **Ficha del cliente**: nombre, foto, membresía, saldo de puntos, racha.
  - **Beneficios vigentes**: lista con badges `Usable ahora` / `Expira pronto` /
    `Expirado`. Botón **"Marcar usado"** solo cuando `markableNow`. Los `free_class`
    muestran nota "se aplica al reservar la clase". Al marcar →
    `POST /api/loyalty/benefits/:id/use` → refrescar lista.
  - **Catálogo canjeable**: lista de `GET /api/loyalty/rewards` (público) filtrada
    por `points_balance >= points_cost && stock > 0 && is_active`. Botón
    **"Canjear"** → `POST /api/loyalty/users/:userId/redeem` → al éxito refrescar
    beneficios y saldo.
- Feedback claro de éxito/error (toast), y re-escaneo fácil (botón "Escanear
  otro").

## Flujo de extremo a extremo

1. Cliente abre `/app/wallet` y ve su QR.
2. Recepción/admin abre `/app/reception/scan`, escanea el QR (o busca a mano).
3. `POST /api/wallet/lookup` resuelve → `userId` + ficha.
4. `GET /api/loyalty/users/:userId/benefits` lista beneficios vigentes con flags.
5. Staff marca un beneficio POS como usado (`POST .../benefits/:id/use`), o canjea
   puntos por una recompensa (`POST .../users/:userId/redeem`).
6. Toda acción queda con `used_by`/`fulfilled_by` + timestamp.

## Seguridad

- Todos los endpoints nuevos con `requireRole('admin','super_admin','reception')`
  **más** `requirePermission('clientes')`. Así una recepción sin `is_reception_master`
  solo accede si tiene la clave `clientes` (que ya usa para ver fichas de clientes).
  Una clave dedicada `recompensas` queda como mejora futura si se quiere aislar el
  permiso.
- QR firmado: HMAC + expiración 24 h. `membership_id` crudo aceptado pero más débil
  (UUID no expira); solo resuelve a `user`, ninguna acción sensible ocurre sin auth
  de staff.
- Atomicidad `FOR UPDATE` en uso de beneficio (evita doble consumo por dos staff a
  la vez) y en canje (ya existente).
- No se expone info sensible más allá de lo que ya ve recepción en pantallas
  existentes de clientes.

## Manejo de errores

| Caso | Código | Detalle |
|---|---|---|
| QR firmado expirado o firma inválida | 400 | "QR inválido o expirado; pide al cliente que regenere su QR." |
| `membershipId` no existe | 404 | "Membresía no encontrada; usa búsqueda manual." |
| Cliente sin plan (sin membership) escaneado por pase nativo | 404 | Sugerir búsqueda manual por nombre/email. |
| Beneficio no marcable (`free_class`) | 409 | "Aplica este beneficio al reservar la clase." |
| Beneficio ya usado o expirado al marcar | 409 | "El beneficio ya no está vigente." |
| Puntos insuficientes al canjear | 402 | "El cliente no tiene puntos suficientes." |
| Recompensa sin stock o inactiva | 409 | "Recompensa no disponible." |
| Cliente o recompensa no encontrados | 404 | — |

## Pruebas

**Backend:**
- `lookup`: QR firmado válido; firmado expirado → 400; firma alterada → 400;
  `membership_id` crudo válido; `membership_id` inexistente → 404; cliente sin plan
  por `userId` directo.
- `users/:userId/benefits`: marca expirados on-the-fly; flags `usableNow` /
  `markableNow` correctos; `free_class` con `markableNow=false`.
- `users/:userId/redeem`: éxito crea `user_benefits` + descuenta puntos + stock;
  puntos insuficientes → 402; sin stock → 409; atómico bajo concurrencia.
- `benefits/:id/use`: marca usado con `used_by`; doble uso concurrente → segundo
  409; `free_class` → 409; expirado → 409.
- Migración: `used_by` queda poblado en los 3 sitios existentes.

**Frontend:**
- `Wallet.tsx` renderiza QR desde `qrPayload`; refetch al montar.
- `/app/reception/scan`: escaneo dispara lookup; búsqueda manual lista clientes;
  badges correctos; botón "Marcar usado" solo si `markableNow`; "Canjear" refresca
  beneficios y saldo; guard de ruta bloquea a `client`/`instructor`.

## Fuera de alcance (mejoras futuras)

- Vincular el uso de un beneficio a una reserva o pedido concreto (hoy: marcado
  suelto con auditoría).
- Flujo `redemptions` pending → fulfilled aprobado por staff (hoy: directo a
  fulfilled).
- Reglas de canje avanzadas (`expires_at` en catálogo, mínimo de puntos,
  restricciones por plan/sucursal, ventanas de vigencia).
- Unificar el QR del pkpass (hoy `membership.id` crudo) para que también codifique
  el `qrPayload` firmado (hoy: el `lookup` acepta ambos formatos, que es
  suficiente).
- Endpoint de reembolso/deshacer canje.