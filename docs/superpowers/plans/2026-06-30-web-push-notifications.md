# Notificaciones Push Web (PWA) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las clientas con el PWA de Casa Shé instalado reciban notificaciones push en su celular (aunque esté bloqueado), desde eventos del sistema y desde una difusión manual del admin.

**Architecture:** Web Push estándar (VAPID + librería `web-push`), self-hosted. Las suscripciones viven en `push_subscriptions`. Un lib `web-push.ts` envía y purga suscripciones muertas. El envío se engancha en `writeInAppNotification` (punto central ya existente) para los eventos automáticos, y un endpoint admin recorre suscripciones para la difusión. El service worker muestra la notificación y maneja el click.

**Tech Stack:** Backend Node/TS ESM + Express + `pg` crudo. Frontend React/Vite. Librería `web-push`. Tests = scripts `tsx` con `node:assert/strict` encadenados en `npm test`.

## Global Constraints

- Backend ESM TypeScript: imports con extensión `.js` (p. ej. `from '../middleware/auth.js'`).
- DB: `pg` crudo vía `query()` de `../config/database.js`. Migraciones idempotentes dentro de `backend/src/index.ts` (estilo existente, `CREATE TABLE IF NOT EXISTS`).
- Auth: `import { authenticate, requireRole } from '../middleware/auth.js'`. `req.user?.userId` es el id del usuario.
- Tests: `backend/scripts/test-*.ts` con `tsx` + `node:assert/strict`, añadidos a la cadena `"test"` de `backend/package.json`. Los que tocan DB requieren `DATABASE_URL`.
- Fire-and-forget: un fallo de push **nunca** debe propagar ni romper reservas/crons/broadcast.
- Solo **clientas** (rol `client`) en v1. Se respeta `users.receive_reminders` para los recordatorios.
- Plataformas: Android/Chrome y desktop funcionan; iOS/iPadOS **solo** con PWA instalado (16.4+) y gesto del usuario.
- Deploy: ramas + PR → merge a `main` → auto-deploy Railway (frontend y backend). Variables VAPID en Railway.
- Commits frecuentes, mensajes en español, terminando con la línea `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Dependencia `web-push` + generación de llaves VAPID

**Files:**
- Modify: `backend/package.json` (dependencia `web-push` + `@types/web-push`)
- Create: `backend/scripts/gen-vapid.ts`

**Interfaces:**
- Produces: llaves VAPID (público/privado) que se setean como env. Variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, y en frontend `VITE_VAPID_PUBLIC_KEY` (= público).

- [ ] **Step 1: Instalar dependencias**

```bash
cd backend && npm install web-push && npm install -D @types/web-push
```

- [ ] **Step 2: Script para generar llaves VAPID**

Create `backend/scripts/gen-vapid.ts`:

```ts
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=mailto:saidromero19@gmail.com');
console.log('');
console.log('Frontend (build var): VITE_VAPID_PUBLIC_KEY=' + keys.publicKey);
```

- [ ] **Step 3: Generar y guardar las llaves (una vez)**

Run: `cd backend && npx tsx scripts/gen-vapid.ts`
Expected: imprime las 4 líneas. **Copiar la salida** — se usará en Task 11 para setear las variables en Railway. No commitear las llaves.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/scripts/gen-vapid.ts
git commit -m "chore(push): dependencia web-push + script de llaves VAPID"
```

---

### Task 2: Migración `push_subscriptions`

**Files:**
- Modify: `backend/src/index.ts` (agregar migración idempotente junto a las demás `CREATE TABLE IF NOT EXISTS`)

**Interfaces:**
- Produces: tabla `push_subscriptions(id, user_id, endpoint UNIQUE, p256dh, auth, user_agent, created_at, last_active_at)`.

- [ ] **Step 1: Agregar la migración**

En `backend/src/index.ts`, junto al bloque de migraciones idempotentes (buscar otro `CREATE TABLE IF NOT EXISTS` para ubicar el patrón y el `await query(...)`), agregar:

```ts
await query(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint       text NOT NULL UNIQUE,
    p256dh         text NOT NULL,
    auth           text NOT NULL,
    user_agent     text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    last_active_at timestamptz NOT NULL DEFAULT now()
  );
`);
await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);`);
```

- [ ] **Step 2: Verificar que el backend arranca y crea la tabla**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.
(La creación real de la tabla se verifica al desplegar / arrancar contra la BD.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(push): migración push_subscriptions"
```

---

### Task 3: `lib/web-push.ts` — envío + purga

**Files:**
- Create: `backend/src/lib/web-push.ts`
- Test: `backend/scripts/test-push-prune.ts`
- Modify: `backend/package.json` (añadir el test a la cadena)

**Interfaces:**
- Consumes: `query` de `../config/database.js`; env `VAPID_*`.
- Produces:
  - `export function shouldPrune(statusCode: number): boolean`
  - `export interface WebPushPayload { title: string; body: string; url?: string; tag?: string; }`
  - `export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<{ sent: number; pruned: number }>`

- [ ] **Step 1: Escribir el test que falla (lógica pura de purga)**

Create `backend/scripts/test-push-prune.ts`:

```ts
import assert from 'node:assert/strict';
import { shouldPrune } from '../src/lib/web-push.js';

// 404/410 = suscripción muerta → purgar
assert.equal(shouldPrune(404), true);
assert.equal(shouldPrune(410), true);
// otros códigos → conservar
assert.equal(shouldPrune(429), false);
assert.equal(shouldPrune(500), false);
assert.equal(shouldPrune(201), false);

console.log('test-push-prune OK');
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx tsx scripts/test-push-prune.ts`
Expected: FALLA (no existe `../src/lib/web-push.js`).

- [ ] **Step 3: Implementar `lib/web-push.ts`**

Create `backend/src/lib/web-push.ts`:

```ts
import webpush from 'web-push';
import { query } from '../config/database.js';

const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:saidromero19@gmail.com';

let configured = false;
if (PUBLIC && PRIVATE) {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
} else {
    console.warn('[web-push] VAPID keys no configuradas; el push está deshabilitado.');
}

export interface WebPushPayload {
    title: string;
    body: string;
    url?: string;
    tag?: string;
}

interface SubRow {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
}

/** 404/410 indican que la suscripción ya no existe → debe purgarse. */
export function shouldPrune(statusCode: number): boolean {
    return statusCode === 404 || statusCode === 410;
}

/**
 * Envía una notificación push a TODAS las suscripciones del usuario.
 * Fire-and-forget desde el caller: nunca lanza. Purga suscripciones muertas.
 */
export async function sendWebPushToUser(
    userId: string,
    payload: WebPushPayload,
): Promise<{ sent: number; pruned: number }> {
    if (!configured) return { sent: 0, pruned: 0 };
    let sent = 0;
    let pruned = 0;
    try {
        const subs = await query<SubRow>(
            `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
            [userId],
        );
        const body = JSON.stringify(payload);
        await Promise.all(
            subs.map(async (s) => {
                try {
                    await webpush.sendNotification(
                        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                        body,
                    );
                    sent++;
                } catch (err: any) {
                    const code = Number(err?.statusCode);
                    if (shouldPrune(code)) {
                        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]).catch(() => {});
                        pruned++;
                    } else {
                        console.error('[web-push] envío falló:', code, err?.body || err?.message);
                    }
                }
            }),
        );
    } catch (err) {
        console.error('[web-push] sendWebPushToUser falló:', err);
    }
    return { sent, pruned };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-push-prune.ts`
Expected: `test-push-prune OK`.

- [ ] **Step 5: Añadir el test a la cadena `npm test`**

En `backend/package.json`, al final del string `"test"`, agregar ` && tsx scripts/test-push-prune.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/web-push.ts backend/scripts/test-push-prune.ts backend/package.json
git commit -m "feat(push): lib web-push (envío + purga) con test de purga"
```

---

### Task 4: Ruta `/api/push` (subscribe / unsubscribe)

**Files:**
- Create: `backend/src/routes/push.ts`
- Modify: `backend/src/index.ts` (import + `app.use('/api/push', pushRoutes)`)
- Test: `backend/scripts/test-push-subscriptions.ts`
- Modify: `backend/package.json` (añadir test a la cadena)

**Interfaces:**
- Consumes: `authenticate`; `query`.
- Produces (HTTP):
  - `POST /api/push/subscribe` body `{ subscription: { endpoint, keys: { p256dh, auth } }, userAgent?: string }` → 201 `{ ok: true }`.
  - `POST /api/push/unsubscribe` body `{ endpoint: string }` → 200 `{ ok: true }`.

- [ ] **Step 1: Escribir el test que falla (CRUD de suscripción contra DB)**

Create `backend/scripts/test-push-subscriptions.ts`:

```ts
import assert from 'node:assert/strict';
import { query } from '../src/config/database.js';

async function main() {
    // Tomar un usuario cliente cualquiera para el FK
    const users = await query<{ id: string }>(`SELECT id FROM users LIMIT 1`);
    assert.ok(users[0], 'se necesita al menos un usuario en la BD');
    const userId = users[0].id;
    const endpoint = 'https://example.com/test-endpoint-' + Date.now();

    // upsert por endpoint
    const upsert = async () => query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, last_active_at = now()`,
        [userId, endpoint, 'p256', 'auth', 'test-agent'],
    );
    await upsert();
    await upsert(); // segunda vez: NO debe duplicar

    const count = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    assert.equal(count[0].n, '1', 'el upsert por endpoint no debe duplicar');

    // delete
    await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    const after = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
    assert.equal(after[0].n, '0');

    console.log('test-push-subscriptions OK');
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que falla** (la tabla puede no existir aún en la BD local)

Run: `cd backend && npx tsx scripts/test-push-subscriptions.ts`
Expected: FALLA si la tabla no existe todavía (o pasa si ya se migró). Tras desplegar Task 2 a una BD con la tabla, debe pasar.

- [ ] **Step 3: Implementar `routes/push.ts`**

Create `backend/src/routes/push.ts`:

```ts
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { query } from '../config/database.js';

const router = Router();
router.use(authenticate);

// POST /api/push/subscribe
router.post('/subscribe', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId as string;
        const sub = req.body?.subscription;
        const endpoint = sub?.endpoint;
        const p256dh = sub?.keys?.p256dh;
        const auth = sub?.keys?.auth;
        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: 'Suscripción inválida' });
        }
        await query(
            `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (endpoint) DO UPDATE
               SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
                   auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, last_active_at = now()`,
            [userId, endpoint, p256dh, auth, (req.body?.userAgent || '').slice(0, 400) || null],
        );
        res.status(201).json({ ok: true });
    } catch (err) {
        console.error('push subscribe error:', err);
        res.status(500).json({ error: 'No se pudo registrar la suscripción' });
    }
});

// POST /api/push/unsubscribe
router.post('/unsubscribe', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId as string;
        const endpoint = req.body?.endpoint;
        if (!endpoint) return res.status(400).json({ error: 'Falta endpoint' });
        await query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, userId]);
        res.json({ ok: true });
    } catch (err) {
        console.error('push unsubscribe error:', err);
        res.status(500).json({ error: 'No se pudo desuscribir' });
    }
});

export default router;
```

- [ ] **Step 4: Montar la ruta en `index.ts`**

En `backend/src/index.ts`: agregar `import pushRoutes from './routes/push.js';` junto a los demás imports de rutas, y `app.use('/api/push', pushRoutes);` junto a los demás `app.use('/api/...')`.

- [ ] **Step 5: Verificar typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Añadir el test a la cadena y commit**

En `backend/package.json` agregar ` && tsx scripts/test-push-subscriptions.ts` al string `"test"`.

```bash
git add backend/src/routes/push.ts backend/src/index.ts backend/scripts/test-push-subscriptions.ts backend/package.json
git commit -m "feat(push): ruta /api/push (subscribe/unsubscribe) + test CRUD"
```

---

### Task 5: Enganchar el push en `writeInAppNotification`

**Files:**
- Modify: `backend/src/lib/in-app-notifications.ts`
- Test: `backend/scripts/test-push-url-map.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `sendWebPushToUser`, `WebPushPayload` (Task 3); `InAppNotificationType`.
- Produces: `export function pushUrlForType(type: InAppNotificationType): string` y el efecto de enviar push tras cada `writeInAppNotification` exitoso.

- [ ] **Step 1: Escribir el test que falla (mapa de URL por tipo)**

Create `backend/scripts/test-push-url-map.ts`:

```ts
import assert from 'node:assert/strict';
import { pushUrlForType } from '../src/lib/in-app-notifications.js';

assert.equal(pushUrlForType('booking_reminder'), '/app/classes');
assert.equal(pushUrlForType('class_cancelled'), '/app/classes');
assert.equal(pushUrlForType('waitlist_promoted'), '/app/classes');
assert.equal(pushUrlForType('membership_expiring'), '/app/checkout');
assert.equal(pushUrlForType('points_earned'), '/app/wallet');
// tipo no mapeado → home de la app
assert.equal(pushUrlForType('promotion'), '/app');

console.log('test-push-url-map OK');
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx tsx scripts/test-push-url-map.ts`
Expected: FALLA (`pushUrlForType` no existe).

- [ ] **Step 3: Implementar el mapa + enganche**

En `backend/src/lib/in-app-notifications.ts`:

Agregar el import al inicio (después de los imports existentes):

```ts
import { sendWebPushToUser } from './web-push.js';
```

Agregar la función exportada (después de la definición de `InAppNotificationInput`):

```ts
const PUSH_URL_BY_TYPE: Partial<Record<InAppNotificationType, string>> = {
    booking_reminder: '/app/classes',
    class_cancelled: '/app/classes',
    class_updated: '/app/classes',
    waitlist_promoted: '/app/classes',
    coach_assigned: '/app/classes',
    coach_substituted: '/app/classes',
    membership_expiring: '/app/checkout',
    points_earned: '/app/wallet',
    review_received: '/app',
};

export function pushUrlForType(type: InAppNotificationType): string {
    return PUSH_URL_BY_TYPE[type] ?? '/app';
}
```

Dentro de `writeInAppNotification`, justo antes de `return rows[0]?.id ?? null;`, agregar el envío fire-and-forget:

```ts
        // Canal push (no bloquea ni rompe el flujo). Mismo aviso que la campana.
        void sendWebPushToUser(input.userId, {
            title: input.title,
            body: input.body,
            url: pushUrlForType(input.type),
            tag: input.type,
        });
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx tsx scripts/test-push-url-map.ts`
Expected: `test-push-url-map OK`.

- [ ] **Step 5: Typecheck + test a la cadena + commit**

Run: `cd backend && npx tsc --noEmit` (sin errores).
Agregar ` && tsx scripts/test-push-url-map.ts` a `"test"` en `backend/package.json`.

```bash
git add backend/src/lib/in-app-notifications.ts backend/scripts/test-push-url-map.ts backend/package.json
git commit -m "feat(push): enganchar web-push en writeInAppNotification (todos los eventos in-app)"
```

> Nota: como `sendClassReminders` (cron 24h/2h), confirmación/cancelación de reserva, lista de espera y `membership_expiring` ya pasan por `writeInAppNotification`, este enganche cubre los 4 grupos de eventos automáticos. Si en la implementación se detecta un evento de la lista que NO llama `writeInAppNotification`, agregar esa llamada en su sitio (no duplicar lógica de push).

---

### Task 6: Endpoint de difusión admin

**Files:**
- Create: `backend/src/routes/admin-push.ts`
- Modify: `backend/src/index.ts` (montar en `/api/admin/push`)
- Test: `backend/scripts/test-admin-broadcast-count.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `authenticate`, `requireRole`; `query`; `sendWebPushToUser`.
- Produces (HTTP): `POST /api/admin/push/broadcast` (rol admin/super_admin) body `{ title, body, url? }` → `{ recipients, sent, pruned }`.

- [ ] **Step 1: Escribir el test que falla (conteo de destinatarios = clientas con suscripción)**

Create `backend/scripts/test-admin-broadcast-count.ts`:

```ts
import assert from 'node:assert/strict';
import { countBroadcastRecipients } from '../src/routes/admin-push.js';

async function main() {
    const n = await countBroadcastRecipients();
    assert.ok(typeof n === 'number' && n >= 0, 'debe devolver un número >= 0');
    console.log('test-admin-broadcast-count OK (recipients=' + n + ')');
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd backend && npx tsx scripts/test-admin-broadcast-count.ts`
Expected: FALLA (no existe el módulo/func).

- [ ] **Step 3: Implementar `routes/admin-push.ts`**

Create `backend/src/routes/admin-push.ts`:

```ts
import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { sendWebPushToUser } from '../lib/web-push.js';

const router = Router();

/** Usuarios cliente con al menos una suscripción push. */
export async function countBroadcastRecipients(): Promise<number> {
    const rows = await query<{ n: string }>(
        `SELECT COUNT(DISTINCT s.user_id)::text AS n
         FROM push_subscriptions s JOIN users u ON u.id = s.user_id
         WHERE u.role = 'client'`,
    );
    return Number(rows[0]?.n ?? 0);
}

router.post('/broadcast', authenticate, requireRole('admin', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const title = String(req.body?.title || '').trim();
            const body = String(req.body?.body || '').trim();
            const url = req.body?.url ? String(req.body.url) : '/app';
            if (!title || !body) return res.status(400).json({ error: 'Título y mensaje son obligatorios' });

            const targets = await query<{ user_id: string }>(
                `SELECT DISTINCT s.user_id FROM push_subscriptions s
                 JOIN users u ON u.id = s.user_id WHERE u.role = 'client'`,
            );
            let sent = 0;
            let pruned = 0;
            // Lotes para no saturar
            const CHUNK = 50;
            for (let i = 0; i < targets.length; i += CHUNK) {
                const slice = targets.slice(i, i + CHUNK);
                const results = await Promise.all(
                    slice.map((t) => sendWebPushToUser(t.user_id, { title, body, url, tag: 'broadcast' })),
                );
                for (const r of results) { sent += r.sent; pruned += r.pruned; }
            }
            res.json({ recipients: targets.length, sent, pruned });
        } catch (err) {
            console.error('broadcast error:', err);
            res.status(500).json({ error: 'No se pudo enviar la difusión' });
        }
    });

export default router;
```

- [ ] **Step 4: Montar en `index.ts`**

`import adminPushRoutes from './routes/admin-push.js';` + `app.use('/api/admin/push', adminPushRoutes);`.

- [ ] **Step 5: Correr el test y verificar que pasa** (requiere DB con la tabla)

Run: `cd backend && npx tsx scripts/test-admin-broadcast-count.ts`
Expected: `test-admin-broadcast-count OK (recipients=...)`.

- [ ] **Step 6: Typecheck + test a la cadena + commit**

```bash
cd backend && npx tsc --noEmit
# agregar " && tsx scripts/test-admin-broadcast-count.ts" a "test" en package.json
git add backend/src/routes/admin-push.ts backend/src/index.ts backend/scripts/test-admin-broadcast-count.ts backend/package.json
git commit -m "feat(push): endpoint admin de difusión (broadcast) + test de conteo"
```

---

### Task 7: Service worker — handlers `push` y `notificationclick`

**Files:**
- Modify: `frontend/public/sw.js`

**Interfaces:**
- Consumes: el `payload` JSON enviado por `sendWebPushToUser` → `{ title, body, url, tag }`.

- [ ] **Step 1: Subir la versión del SW**

En `frontend/public/sw.js`, cambiar `const VERSION = 'br-v4';` → `const VERSION = 'br-v5';` (fuerza actualización del SW para que tome los nuevos handlers).

- [ ] **Step 2: Agregar handlers `push` y `notificationclick`**

Al final de `frontend/public/sw.js` (después del handler `message`):

```js
// Web Push — mostrar la notificación recibida
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || 'Casa Shé';
  const options = {
    body: payload.body || '',
    icon: '/casashe/favicon-casashe.png',
    badge: '/casashe/favicon-casashe.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/app' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Click en la notificación — enfocar o abrir la app en la pantalla correcta
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) { client.focus(); client.navigate(targetUrl); return; }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })()
  );
});
```

- [ ] **Step 3: Build del frontend (verifica que no rompe nada)**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add frontend/public/sw.js
git commit -m "feat(push): service worker maneja push + notificationclick (SW v5)"
```

---

### Task 8: Frontend — `lib/push.ts` + hook `usePush`

**Files:**
- Create: `frontend/src/lib/push.ts`
- Create: `frontend/src/hooks/usePush.ts`

**Interfaces:**
- Consumes: `api` de `@/lib/api`; `import.meta.env.VITE_VAPID_PUBLIC_KEY`.
- Produces:
  - `lib/push.ts`: `isPushSupported(): boolean`, `getPermission(): NotificationPermission`, `subscribeToPush(): Promise<void>`, `unsubscribeFromPush(): Promise<void>`, `getActiveSubscription(): Promise<PushSubscription | null>`.
  - `hooks/usePush.ts`: `usePush()` → `{ state: 'unsupported'|'default'|'denied'|'subscribed'|'loading', enable: () => Promise<void>, disable: () => Promise<void> }`.

- [ ] **Step 1: Implementar `lib/push.ts`**

Create `frontend/src/lib/push.ts`:

```ts
import api from '@/lib/api';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export function getPermission(): NotificationPermission {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await getRegistration();
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<void> {
  if (!isPushSupported()) throw new Error('Push no soportado');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permiso denegado');
  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
    });
  }
  const json = sub.toJSON();
  await api.post('/push/subscribe', {
    subscription: { endpoint: sub.endpoint, keys: json.keys },
    userAgent: navigator.userAgent,
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getActiveSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
```

- [ ] **Step 2: Implementar `hooks/usePush.ts`**

Create `frontend/src/hooks/usePush.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { isPushSupported, getPermission, getActiveSubscription, subscribeToPush, unsubscribeFromPush } from '@/lib/push';

type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'loading';

export function usePush() {
  const [state, setState] = useState<PushState>('loading');

  const refresh = useCallback(async () => {
    if (!isPushSupported()) { setState('unsupported'); return; }
    const perm = getPermission();
    if (perm === 'denied') { setState('denied'); return; }
    const sub = await getActiveSubscription();
    setState(sub ? 'subscribed' : 'default');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    setState('loading');
    try { await subscribeToPush(); setState('subscribed'); }
    catch { await refresh(); }
  }, [refresh]);

  const disable = useCallback(async () => {
    setState('loading');
    try { await unsubscribeFromPush(); } finally { setState('default'); }
  }, []);

  return { state, enable, disable };
}
```

- [ ] **Step 3: Typecheck/build**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/push.ts frontend/src/hooks/usePush.ts
git commit -m "feat(push): lib push + hook usePush (suscribir/desuscribir)"
```

---

### Task 9: UI cliente — toggle en Ajustes + banner en dashboard

**Files:**
- Modify: `frontend/src/pages/client/ProfilePreferences.tsx` (agregar el toggle de notificaciones)
- Create: `frontend/src/components/notifications/PushOptInBanner.tsx`
- Modify: `frontend/src/pages/client/Dashboard.tsx` (renderizar el banner)

**Interfaces:**
- Consumes: `usePush()` (Task 8).
- Produces: `<PushOptInBanner />` (auto-oculto si no aplica o ya descartado).

- [ ] **Step 1: Agregar el toggle en `ProfilePreferences.tsx`**

Leer la estructura del archivo y, siguiendo el patrón de sus secciones/cards existentes, agregar una sección "Notificaciones push" que use `usePush()`:

```tsx
// import { usePush } from '@/hooks/usePush';
// dentro del componente:
const push = usePush();
// ...
<div className="rounded-2xl border border-[#D6D5C2]/70 bg-[#F6F0E4]/70 p-5">
  <div className="flex items-center justify-between gap-4">
    <div>
      <p className="font-heading text-lg text-[#2E1B22]">Notificaciones push</p>
      <p className="text-sm text-[#6B554D]">
        Recibe recordatorios de clase y avisos en tu celular, aunque esté bloqueado.
      </p>
    </div>
    {push.state === 'unsupported' ? (
      <span className="text-xs text-[#6B554D]/70">No disponible en este dispositivo</span>
    ) : push.state === 'denied' ? (
      <span className="text-xs text-[#AE4836]">Bloqueado en el navegador</span>
    ) : push.state === 'subscribed' ? (
      <button onClick={() => push.disable()} className="rounded-full border border-[#D6D5C2] px-4 py-2 text-sm text-[#2E1B22]">Desactivar</button>
    ) : (
      <button onClick={() => push.enable()} className="rounded-full bg-[#2A4E36] px-4 py-2 text-sm text-[#F6F0E4]">Activar</button>
    )}
  </div>
  <p className="mt-3 text-xs text-[#6B554D]/70">
    En iPhone: agrega Casa Shé a tu pantalla de inicio y ábrela desde ahí para poder activar.
  </p>
</div>
```

- [ ] **Step 2: Crear el banner `PushOptInBanner.tsx`**

Create `frontend/src/components/notifications/PushOptInBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { usePush } from '@/hooks/usePush';

const DISMISS_KEY = 'casashe_push_banner_dismissed';

export function PushOptInBanner() {
  const push = usePush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (dismissed) return null;
  if (push.state !== 'default') return null; // soportado, con permiso por pedir, sin suscribir

  const close = () => { localStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); };

  return (
    <div className="flex items-center gap-3 rounded-[1.2rem] border border-[#D6D5C2]/70 bg-[#F6F0E4]/80 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2A4E36]/10 text-[#2A4E36]">
        <Bell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[#2E1B22]">Activa tus recordatorios</p>
        <p className="text-sm text-[#6B554D]">Te avisamos de tus clases en tu celular, aunque esté bloqueado.</p>
      </div>
      <button onClick={() => { void push.enable(); close(); }} className="shrink-0 rounded-full bg-[#2A4E36] px-4 py-2 text-sm text-[#F6F0E4]">Activar</button>
      <button onClick={close} aria-label="Cerrar" className="shrink-0 rounded-full p-1 text-[#6B554D]"><X className="h-4 w-4" /></button>
    </div>
  );
}
```

- [ ] **Step 3: Renderizar el banner en el Dashboard**

En `frontend/src/pages/client/Dashboard.tsx`: importar `import { PushOptInBanner } from '@/components/notifications/PushOptInBanner';` y renderizarlo arriba del contenido (p. ej. junto a `<ProfilerInviteBanner />`).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/client/ProfilePreferences.tsx frontend/src/components/notifications/PushOptInBanner.tsx frontend/src/pages/client/Dashboard.tsx
git commit -m "feat(push): UI de activación (toggle en ajustes + banner en dashboard)"
```

---

### Task 10: UI admin — difusión

**Files:**
- Create: `frontend/src/pages/admin/notifications/Broadcast.tsx`
- Modify: `frontend/src/App.tsx` (ruta `/admin/notifications/difusion`)
- Modify: `frontend/src/components/layout/AdminLayout.tsx` (ítem de nav bajo "Reportes" o "Ajustes")

**Interfaces:**
- Consumes (HTTP): `POST /api/admin/push/broadcast`.

- [ ] **Step 1: Crear la página de difusión**

Create `frontend/src/pages/admin/notifications/Broadcast.tsx`:

```tsx
import { useState } from 'react';
import api from '@/lib/api';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useToast } from '@/components/ui/use-toast';

export default function PushBroadcast() {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'Título y mensaje son obligatorios.' });
      return;
    }
    if (!window.confirm('¿Enviar esta notificación a todas las clientas suscritas?')) return;
    setSending(true);
    try {
      const { data } = await api.post('/admin/push/broadcast', { title, body, url: url || undefined });
      toast({ title: 'Difusión enviada', description: `${data.sent} envíos a ${data.recipients} clientas.` });
      setTitle(''); setBody(''); setUrl('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'No se pudo enviar', description: e?.response?.data?.error || 'Error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthGuard requiredRoles={['admin', 'super_admin']}>
      <AdminLayout>
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="font-heading text-2xl text-balance-dark">Difusión push</h1>
          <p className="text-sm text-balance-dark/60">Manda un aviso a todas las clientas con notificaciones activadas.</p>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Título" className="w-full rounded-xl border px-4 py-3" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={160} placeholder="Mensaje" rows={3} className="w-full rounded-xl border px-4 py-3" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enlace (opcional, ej. /app/book)" className="w-full rounded-xl border px-4 py-3" />
          <button onClick={send} disabled={sending} className="rounded-full bg-[#2A4E36] px-6 py-3 text-[#F6F0E4] disabled:opacity-50">
            {sending ? 'Enviando…' : 'Enviar a todas'}
          </button>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Agregar la ruta en `App.tsx`**

Import lazy/normal del componente y `<Route path="/admin/notifications/difusion" element={<PushBroadcast />} />` dentro del bloque de rutas admin.

- [ ] **Step 3: Agregar el ítem al nav admin**

En `frontend/src/components/layout/AdminLayout.tsx`, dentro del grupo "Reportes" (o "Ajustes"), agregar `{ href: '/admin/notifications/difusion', label: 'Difusión push' }`.

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/notifications/Broadcast.tsx frontend/src/App.tsx frontend/src/components/layout/AdminLayout.tsx
git commit -m "feat(push): UI admin de difusión + ruta y nav"
```

---

### Task 11: Configuración Railway + deploy + verificación E2E

**Files:** (sin cambios de código; configuración y verificación)

- [ ] **Step 1: Setear variables VAPID en Railway**

Con la salida del Task 1:
- Servicio **backend**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- Servicio **frontend**: `VITE_VAPID_PUBLIC_KEY` (= público).

Vía CLI (ejemplo): `railway variables -s backend --set "VAPID_PUBLIC_KEY=..." --set "VAPID_PRIVATE_KEY=..." --set "VAPID_SUBJECT=mailto:saidromero19@gmail.com"` y `railway variables -s frontend --set "VITE_VAPID_PUBLIC_KEY=..."`.

- [ ] **Step 2: Correr toda la batería de tests backend**

Run: `cd backend && npm test`
Expected: todos los `test-*` pasan, incluidos los nuevos de push (los de DB requieren `DATABASE_URL`).

- [ ] **Step 3: Merge a main y desplegar** (ramas+PR ya hechas por cada task; mergear). Confirmar que backend redepliega (toma envs + migración) y frontend redepliega (toma `VITE_VAPID_PUBLIC_KEY`).

- [ ] **Step 4: Verificación E2E manual (dispositivo real)**

1. En Android/Chrome o iPhone con el PWA instalado: entrar a `/app`, ver el banner / ir a Ajustes → Activar notificaciones → aceptar permiso.
2. Confirmar la suscripción: `POST /api/push/subscribe` devolvió 201 (o que aparece fila en `push_subscriptions`).
3. Disparar un evento: reservar una clase (confirmación) **o** mandar una **difusión** desde `/admin/notifications/difusion`.
4. Con la pantalla **bloqueada**, llega la notificación; al tocarla, abre la pantalla correcta.
5. Desactivar desde Ajustes y confirmar que ya no llegan.

- [ ] **Step 5: Commit (si aplica algún ajuste de verificación)**

```bash
git commit --allow-empty -m "chore(push): verificación E2E de notificaciones push"
```

---

## Notas de cierre

- Los 4 grupos de eventos automáticos se cubren vía el enganche en `writeInAppNotification` (Task 5), que ya es el punto por el que pasan recordatorios, reservas, lista de espera, cancelaciones y `membership_expiring`. Si `membership_expiring` no tuviera un disparador (cron) en producción, se agrega un chequeo diario que llame `writeInAppNotification({ type: 'membership_expiring', ... })` — fuera del alcance estricto de este plan si ya existe; verificar en implementación.
- iOS: la activación solo funciona con el PWA instalado (16.4+); la UI ya lo comunica.
