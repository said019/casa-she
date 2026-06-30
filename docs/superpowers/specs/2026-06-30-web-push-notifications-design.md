# Notificaciones Push Web (PWA) — Diseño

**Fecha:** 2026-06-30
**Proyecto:** Casa Shé
**Estado:** Aprobado (brainstorming) → pendiente plan de implementación

## Resumen

Agregar **Web Push** para que las clientas con el PWA de Casa Shé instalado reciban
avisos en su celular aunque esté bloqueado. Es un **canal nuevo de entrega** que se
suma a las notificaciones in-app existentes (la campana), disparado desde los mismos
eventos. Enfoque elegido: **Web Push estándar (VAPID + librería `web-push`)**,
self-hosted, sin terceros.

## Objetivos

- Push automático desde eventos del sistema:
  - Recordatorios de clase (24h y 2h antes).
  - Confirmación de reserva.
  - "Te tocó lugar" desde lista de espera.
  - Clase cancelada por el estudio.
  - Membresía/créditos por vencer y pago/membresía aprobada.
- **Difusión manual** desde el admin (aviso a todas las clientas).
- Activación por la clienta vía **toggle en Perfil/Ajustes** + **banner sutil** en el dashboard.
- Sin vendor externo; datos en la BD de Casa Shé.

## No-objetivos (v1)

- Segmentación avanzada del broadcast (por plan, asistencia, etc.). v1 = todas las clientas suscritas.
- Push a coaches/admin (solo clientas en v1).
- Editor de plantillas de notificación / programación de broadcasts.
- Reemplazar las notificaciones in-app o el correo; el push es adicional.

## Contexto del código actual (lo que ya existe)

- **No hay** Web Push: el service worker (`frontend/public/sw.js`) tiene `install/activate/fetch/message`
  pero **no** `push` ni `showNotification`; no hay `pushManager.subscribe` ni deps `web-push`/VAPID.
- **Sí hay** notificaciones in-app: `backend/src/lib/in-app-notifications.ts` expone
  `writeInAppNotification(input)` (punto central) + ruta `/api/notifications` + la campana.
- Crons de recordatorios: `backend/src/services/cron-jobs.ts` → `sendClassReminders(24h/2h)`, con
  dedup (`booking_reminders`) y respetando `users.receive_reminders`. Gated por flag de cron.
- `notifyAllUserDevices` (en `lib/apple-wallet.ts`) es **solo APNs para refrescar el pase Wallet**,
  no avisos generales. No confundir con este feature.

## Modelo de datos

Tabla nueva (migración idempotente en `backend/src/index.ts`, estilo existente):

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
```

- Una clienta puede tener varias suscripciones (varios dispositivos/navegadores).
- Opt-out: la ausencia de suscripción = apagado. El toggle "off" desuscribe y borra la fila.
- Las preferencias existentes se respetan: los **recordatorios** siguen gateados por
  `users.receive_reminders` (afecta in-app y push por igual).

## Backend

- **Dependencia:** `web-push`.
- **Env (Railway):** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto). Se generan una vez.
  El frontend recibe la pública vía `VITE_VAPID_PUBLIC_KEY` (build-time).
- **Ruta `backend/src/routes/push.ts`** montada en `/api/push` (todas con `authenticate`):
  - `POST /api/push/subscribe` — body = objeto `PushSubscription` (endpoint, keys.p256dh, keys.auth) +
    `user_agent`. Upsert por `endpoint` (ON CONFLICT actualiza `user_id`, `last_active_at`).
  - `POST /api/push/unsubscribe` — body = `{ endpoint }`. Borra la fila.
- **Lib `backend/src/lib/web-push.ts`:**
  - Inicializa VAPID al cargar.
  - `sendWebPushToUser(userId, payload)` — carga las suscripciones del usuario, envía cada una con
    `webpush.sendNotification`, y **purga** las que devuelvan 404/410 (suscripción muerta).
  - `payload` = `{ title, body, url?, tag? }` (JSON). Es **fire-and-forget**: errores se loguean,
    nunca propagan ni rompen el flujo que lo invocó.
- **Enganche central:** `writeInAppNotification(input)` llama `sendWebPushToUser(input.user_id, {...})`
  tras escribir el aviso in-app, derivando título/cuerpo/URL del tipo de notificación. Donde algún
  evento de la lista no pase hoy por `writeInAppNotification`, se agrega esa llamada para unificar el
  canal. Mapeo de `data.url` por tipo (p. ej. `booking_reminder` → `/app/classes`).
- **Difusión admin:** `POST /api/admin/push/broadcast` (rol admin/super_admin) — body
  `{ title, body, url? }`. Recorre por lotes las suscripciones de usuarios con rol `client` y envía.
  Devuelve `{ recipients, sent, pruned }`. Registra en bitácora (audit) quién y qué envió.

## Frontend

- **Service worker (`sw.js`):**
  - `self.addEventListener('push', ...)` → `self.registration.showNotification(title, { body, icon, badge, data:{ url }, tag })`.
  - `self.addEventListener('notificationclick', ...)` → enfocar una ventana abierta o `clients.openWindow(url)`.
- **Lib/hook `frontend/src/lib/push.ts` + `usePush`:**
  - `isSupported()` (serviceWorker + PushManager + Notification).
  - `getState()` → `unsupported | default | granted | denied | subscribed`.
  - `subscribe()` → `Notification.requestPermission()` → `registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: <VITE_VAPID_PUBLIC_KEY> })` → `POST /api/push/subscribe`.
  - `unsubscribe()` → `subscription.unsubscribe()` + `POST /api/push/unsubscribe`.
- **UI activación:**
  - **Toggle "Notificaciones"** en Perfil/Ajustes del cliente, con copy por estado (activado / desactivado /
    bloqueado por el navegador / no soportado / "instala la app a tu pantalla de inicio" en iOS).
  - **Banner sutil** descartable en el dashboard del cliente la primera vez (estado guardado en localStorage),
    con CTA que dispara `subscribe()`.
- **VAPID pública:** `VITE_VAPID_PUBLIC_KEY` (variable de build en Railway frontend).

## Plataformas / límites

- **Android/Chrome (y desktop):** funciona en el navegador, instalado o no.
- **iOS/iPadOS 16.4+:** **solo** con el PWA agregado a la pantalla de inicio; requiere gesto del usuario
  (lo cumple el toque del toggle). La UI lo explica.
- Sin terceros; las suscripciones muertas se purgan al enviar.

## Errores y privacidad

- Envío *fire-and-forget*: nunca bloquea reservas, crons ni el broadcast por un push fallido.
- Purga automática en 404/410.
- Llaves VAPID privadas como secreto en Railway; nunca al cliente.
- Respeta opt-out (sin suscripción) y `receive_reminders` para recordatorios.

## Pruebas

- **Backend (scripts `tsx` + `node:assert/strict`, estilo del repo):**
  - CRUD de `push_subscriptions` (upsert por endpoint, borrado).
  - `sendWebPushToUser`: con `web-push` mockeado, verifica envío a N suscripciones y **purga** en 410/404.
  - `broadcast`: cuenta de destinatarios = suscripciones de clientas.
- **E2E manual:** activar en Android/PWA instalado, disparar un recordatorio (o forzar uno) y un broadcast;
  verificar que llega con pantalla bloqueada y que el click abre la pantalla correcta.

## Rollout

1. Generar llaves VAPID y setearlas en Railway (backend + `VITE_VAPID_PUBLIC_KEY` en frontend).
2. Migración `push_subscriptions`.
3. Backend (ruta + lib + enganche + broadcast), frontend (SW + hook + UI), admin (difusión).
4. Verificar build/typecheck y desplegar; probar E2E en un dispositivo real.
