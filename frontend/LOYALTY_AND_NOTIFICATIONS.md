# Programa de lealtad y notificaciones

Documentación completa del sistema de puntos, recompensas, referidos, notificaciones (email, WhatsApp, push al wallet) y cron jobs automatizados.

---

## 1. Programa de lealtad

### 1.1 Configuración global

Guardada en `system_settings` con key `loyalty_config`. Valores por defecto:

| Campo | Default | Descripción |
|---|---|---|
| `points_per_class` | 1 | Puntos por clase asistida (check-in confirmado) |
| `points_per_peso_card` | 1 | Puntos por cada $1 MXN gastado con tarjeta/transferencia |
| `points_per_peso_cash` | 2 | Puntos por cada $1 MXN pagado en efectivo (2x) |
| `welcome_bonus` | 10 | Puntos al registrarse como cliente nuevo |
| `birthday_bonus` | 10 | Puntos otorgados el día del cumpleaños |
| `referral_bonus` | 5 | Puntos al referrer cuando su referido se activa |

Ajustable desde admin panel → Configuración → Lealtad. Se lee en cada transacción, así que cambios surten efecto al instante.

### 1.2 Tablas

- **`loyalty_points`**: registro contable de puntos. Campos: `user_id`, `points` (puede ser negativo en canjes), `type` (`class_attended` / `payment` / `welcome` / `birthday` / `referral` / `redemption` / `bonus` / `manual_adjustment`), `description`, `related_booking_id`, `related_order_id`, `created_at`. El balance se calcula como `SUM(points)`.
- **`loyalty_rewards`**: catálogo de recompensas. Campos: `name`, `description`, `points_cost`, `reward_type` (`free_class` / `discount` / `product` / `merch`), `reward_value`, `stock` (NULL = ilimitado), `is_active`, `image_url`.
- **`loyalty_redemptions`**: historial de canjes. Estado: `pending` / `delivered` / `cancelled`.

### 1.3 Cómo se ganan puntos

| Evento | Puntos | Disparador en código |
|---|---|---|
| Registro del cliente | `welcome_bonus` | `POST /api/auth/register` (y creación por admin) |
| Check-in confirmado en clase | `points_per_class` | `POST /api/checkin/qr` → `awardCheckinPoints()` |
| Pago de membresía | `price × points_per_peso_X` | Webhook/validación de orden en `orders.ts` |
| Cumpleaños | `birthday_bonus` | Cron diario revisa `date_of_birth` del día |
| Referido completa primera compra | `referral_bonus` | `PUT /api/referrals/:id/complete` (manual admin) |
| Ajuste manual | Variable | Admin panel → Cliente → "Ajustar puntos" |

### 1.4 Cómo se canjean

Flujo cliente:
1. `GET /api/loyalty/rewards` → lista recompensas disponibles
2. `POST /api/loyalty/redeem` `{ rewardId }` → valida balance + stock
3. Inserta `loyalty_points` negativo + registro en `loyalty_redemptions` con status `pending`
4. Admin marca como `delivered` cuando se entrega

No hay rollback automático si el admin rechaza — es manual.

### 1.5 Tiers / niveles

**No implementados**. El schema lo soportaría (columna `tier` en `users`) pero no hay lógica actual. Posible extensión futura.

### 1.6 Referidos

- **Tabla**: `referral_codes` (código único por usuario) + `referrals` (relación referrer → referred).
- **Flujo**:
  1. Cliente ve su código en `/app/refer` (frontend: `src/pages/client/ReferFriends.tsx`).
  2. Nuevo usuario al registrarse puede ingresar código → inserta fila `pending` en `referrals`.
  3. Cuando el referido activa primera membresía, admin/cron marca `completed`.
  4. Referrer recibe `referral_bonus` puntos + notificación push al wallet.

---

## 2. Notificaciones

### 2.1 Canales disponibles

| Canal | Archivo | Tipo |
|---|---|---|
| **Email** | `Balance Room/server/src/services/email.ts` | Resend API |
| **WhatsApp** | `Balance Room/server/src/lib/whatsapp.ts` + `whatsapp-evolution.ts` | Evolution API |
| **Apple Wallet push** | `Balance Room/server/src/lib/apple-wallet.ts` | APNs |
| **Google Wallet push** | `Balance Room/server/src/lib/google-wallet.ts` | Google Pay API |
| **Log unificado** | Tabla `notification_logs` | Estado/éxito/error |

Todas las notificaciones *automáticas* (no las transaccionales como "reserva confirmada") se registran en `notification_logs` con `channel`, `status` (`pending`/`sent`/`failed`), `error_message`, `sent_at`.

### 2.2 Email (Resend)

| Evento | Función | Cuándo se envía |
|---|---|---|
| Bienvenida cliente | `sendClientWelcomeEmail()` | Admin crea cliente manualmente (`POST /api/users`). Incluye email + password temporal |
| Magic link instructor | `sendInstructorMagicLink()` | Admin genera acceso coach (`POST /api/instructors/:id/generate-access`). Token válido 1h |
| Credenciales instructor | `sendInstructorCredentials()` | Primer login por magic link confirma y se envían credenciales definitivas |
| Clase asignada a instructor | `sendClassAssignmentNotification()` | Admin asigna instructor a clase nueva o reasigna |
| Membresía activada | `sendMembershipActivatedEmail()` | Admin aprueba orden → membresía pasa de `pending_activation` a `active` |
| Reset de contraseña | `sendPasswordResetEmail()` | `POST /api/auth/forgot-password` (si está habilitado) |

**Template de email**: HTML inline estático en cada función. Personalizar con logos/colores del estudio implica editar cada template manualmente.

### 2.3 WhatsApp (Evolution API)

| Evento | Función | Disparador |
|---|---|---|
| Bienvenida cliente | `sendClientWelcome()` | Registro o creación admin |
| Migración legacy | `sendMigrationWelcome()` | Bulk import de clientes antiguos |
| Confirmación de reserva | `sendBookingConfirmation()` | `POST /api/bookings` exitoso |
| Cancelación de reserva | `sendCancellationNotice()` | `DELETE /api/bookings/:id` |
| Membresía activada | `sendMembershipActivatedNotice()` | Orden pagada y confirmada |
| Membresía por vencer | `sendExpiringMembershipNotice()` | Cron 10:00 AM diario — 7, 3 y 1 día antes |
| Puntos ganados tras clase | (inline en `checkin.ts`) | Check-in confirmado |
| Recordatorio de clase | `sendClassReminder()` | Opcional: cron (actualmente deshabilitado) |

**Preferencias del usuario** (tabla `users`): columnas `receive_reminders`, `receive_promotions`, `receive_weekly_summary` deciden qué se envía. Editables desde `/app/profile/preferences`.

### 2.4 Push al wallet (Apple + Google)

**Qué es**: actualización del *pase digital* (la tarjeta de membresía en Apple Wallet / Google Wallet). Al actualizar el pase:
- Se refresca el contenido (clases restantes, puntos, fecha de expiración, próxima clase)
- Dispositivo muestra banner/notificación al usuario

Implementación: `Balance Room/server/src/lib/notifications.ts` expone helpers que actualizan en ambos canales a la vez.

| Evento | Función | Cuándo |
|---|---|---|
| Clase asistida | `notifyClassAttended()` | Check-in confirmado → resta 1 clase, actualiza puntos, envía push "¡Clase completada!" |
| Puntos ganados | `notifyPointsEarned()` | Opcional adicional si `loyalty_config.notify_on_points = true` |
| Membresía por vencer | `notifyMembershipExpiring()` | Cron diario, 7/3/1 días antes |
| Membresía renovada | `notifyMembershipRenewed()` | Orden pagada de renovación → push "¡Membresía renovada!" |
| Recordatorio de clase | `notifyUpcomingClass()` | Opcional — cron cada 30 min si activo |
| Notificación custom | `sendCustomNotification()` | Admin desde panel envía mensaje arbitrario |

**Contenido del pase actualizado** (Apple Wallet ejemplo):
- Nombre del plan
- Clases restantes / totales
- Fecha de expiración
- Puntos de lealtad acumulados
- QR para check-in
- Próxima clase reservada (si hay)

**Logging**: cada intento → tabla `notification_logs`. Si APNs o Google Pay fallan, el cron intenta reenvío hasta 3 veces.

### 2.5 Flujos completos (ciclos de notificación)

**Registro de cliente nuevo**:
1. Email: bienvenida con credenciales
2. WhatsApp: bienvenida + credenciales
3. Puntos: +`welcome_bonus`
4. No se crea wallet pass hasta activar membresía

**Compra de membresía**:
1. Cliente elige plan → orden `pending_payment`
2. Admin confirma pago (transferencia validada)
3. Orden pasa a `completed`, membresía `active`
4. Email: membresía activada
5. WhatsApp: membresía activada + link al wallet pass
6. Puntos: `price × points_per_peso_X`
7. Se genera Apple + Google Wallet pass
8. Si aplica: puntos bonus al referrer

**Reserva de clase**:
1. Cliente reserva en `/app/book` → `bookings` + resta 1 de `classes_remaining`
2. WhatsApp: confirmación con fecha/hora/instructor
3. Wallet pass se refresca con próxima clase
4. 2h antes (si cron activo): recordatorio WhatsApp

**Check-in**:
1. Cliente escanea QR con app o admin escanea QR del cliente
2. `bookings.status = 'attended'`
3. Puntos otorgados (+1 default)
4. Wallet push: "¡Clase completada!" con nuevo balance
5. Si quedan 3 o menos clases → aviso "te quedan pocas clases"

**Membresía por vencer**:
1. Cron 10:00 AM revisa membresías activas
2. Si `end_date - today` = 7, 3 o 1 día:
   - WhatsApp: "tu membresía vence el X"
   - Push wallet: misma info, actualiza pase con aviso

**Cumpleaños**:
1. Cron diario revisa `date_of_birth`
2. Si hoy es cumple: +`birthday_bonus` puntos
3. WhatsApp: felicitación + aviso de puntos
4. Wallet push: nuevo balance de puntos

**Referido completa primera compra**:
1. Admin marca referral como `completed`
2. Referrer recibe +`referral_bonus` puntos
3. Wallet push: "+5 pts por traer a un amigo"
4. Opcional WhatsApp (actualmente no cableado)

---

## 3. Cron jobs

Archivo: `Balance Room/server/src/services/cron-jobs.ts`. Habilitados con env `ENABLE_CRON_JOBS=true`.

| Nombre | Cron expr | Frecuencia | Acción |
|---|---|---|---|
| `generateRecurringClasses` | `0 3 * * *` | Diario 3:00 AM | Crea clases recurrentes 14 días adelante desde `schedules` |
| `requestReviews` | `30 * * * *` | Cada hora :30 | 2h después de clase completada, solicita reseña (push + wallet) |
| `notifyExpiringMemberships` | `0 10 * * *` | Diario 10:00 AM | Avisa membresías que vencen en 7/3/1 días (WhatsApp + push) |
| `markExpiredMemberships` | `5 0 * * *` | Diario 00:05 AM | Marca como `expired` las que pasaron `end_date` |
| `cleanupExpiredOrders` | `0 */6 * * *` | Cada 6h | Cancela órdenes `bank_transfer` no pagadas >48h |
| `markNoShows` | `5,35 * * * *` | Cada 30 min | Marca bookings sin check-in tras fin de clase como `no_show` |
| `expireReviewRequests` | `0 2 * * *` | Diario 2:00 AM | Marca `review_requests` >7 días como `expired` |

**Log de ejecución**: tabla `cron_job_logs` (`job_name`, `success`, `details` JSON, `executed_at`). Útil para debugging.

**Zona horaria**: Los cron expr corren en UTC del servidor Railway. Las horas mostradas arriba asumen `TZ=America/Mexico_City` (ajustar env si es otra zona).

---

## 4. Tablas relevantes (resumen)

| Tabla | Propósito |
|---|---|
| `loyalty_points` | Contabilidad de puntos (positivos y negativos) |
| `loyalty_rewards` | Catálogo de recompensas canjeables |
| `loyalty_redemptions` | Historial de canjes con estado |
| `referral_codes` | Código único por usuario |
| `referrals` | Relación referrer → referred con estado |
| `notification_logs` | Registro de cada notificación enviada |
| `cron_job_logs` | Registro de cada ejecución de cron |
| `wallet_passes` | Referencias a pases Apple/Google activos por usuario |
| `system_settings` | Config global incluyendo `loyalty_config` |

---

## 5. Puntos de extensión / pendientes

- **Tiers**: no implementado. Requiere lógica de promoción/degradación y diferenciación de beneficios por nivel.
- **Recordatorio 2h antes de clase**: código existe pero cron deshabilitado por defecto.
- **Email de referido completado**: notificación solo por push wallet — agregar email es trivial (template + llamada en `referrals.ts`).
- **Doble opt-in WhatsApp**: actualmente asume que tener teléfono = aceptación. Para cumplimiento regulatorio considerar flag explícito.
- **Expiración de puntos**: no hay lógica de caducidad. Si el negocio lo requiere, cron similar a `markExpiredMemberships` sobre `loyalty_points` antiguos.

---

**Última actualización**: 2026-04-21
