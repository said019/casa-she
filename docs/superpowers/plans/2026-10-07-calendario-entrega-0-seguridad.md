# Entrega 0 — Un link no es una sesión: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ningún JWT con `purpose` (reset de contraseña, magic-link de coach) ni sin `userId` sea aceptado como sesión por `authenticate()` u `optionalAuth()`.

**Architecture:** Se extrae la verificación del token de sesión a una función pura `decodeSessionToken` en `backend/src/lib/sessionToken.ts` (sin importar la base de datos), y los dos middlewares de `backend/src/middleware/auth.ts` la usan. Una prueba `tsx` + `node:assert` cubre la función y fija el cableado leyendo el código fuente del middleware.

**Tech Stack:** Node 22 / TypeScript ESM, Express, `jsonwebtoken` 9, pruebas como scripts `tsx` con `node:assert/strict` (patrón del repo, no hay framework de pruebas).

**Spec:** `docs/superpowers/specs/2026-10-07-calendario-recepcion-design.md` (sección "Entrega 0").

## Global Constraints

- Trabajar en el clon `/Users/saidromero/Desktop/Casa She/casa-she-calendario`, rama `fix/token-proposito-no-es-sesion` creada desde `origin/main`. Nunca en `main`.
- Commits y PR en español; terminar commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Los mensajes de error HTTP existentes no cambian de texto (`'Token inválido'` / `'El token de autenticación es inválido'`, `'Sesión expirada'`).
- No tocar `generateResetToken`, `verifyResetToken`, `generateMagicLinkToken`, `verifyMagicLinkToken`: siguen funcionando para sus flujos.
- La prueba nueva no debe importar `src/config/database.ts` (abre conexión al importarse y deja el proceso vivo).

## Review Focus

- Token de reset válido contra cualquier ruta con `authenticate` → 401 "Token inválido", **antes** de consultar la base. Cubierto en Task 1 (función) y Task 2 (cableado).
- Token de sesión normal (sin `purpose`) sigue entrando igual: mismo `JwtPayload`. Cubierto en Task 1.
- `optionalAuth` con token de reset: la petición sigue como anónima (sin `req.user`), no 401. Cubierto en Task 2.
- Token expirado sigue respondiendo "Sesión expirada" (no "Token inválido"). Cubierto en Task 1: `decodeSessionToken` deja pasar `TokenExpiredError` tal cual.
- Token con `purpose` vacío (`''`) o `null`: también se rechaza (cualquier clave `purpose` presente). Cubierto en Task 1.

---

### Task 1: `decodeSessionToken` con su prueba

**Files:**
- Create: `backend/src/lib/sessionToken.ts`
- Create: `backend/scripts/test-auth-token-purpose.ts`
- Modify: `backend/package.json` (agregar la prueba a `scripts.test`)

**Interfaces:**
- Produces: `decodeSessionToken(token: string, secret: string): JwtPayload` — lanza `jwt.TokenExpiredError` si expiró, `jwt.JsonWebTokenError` si la firma es inválida, si el payload trae la clave `purpose` (cualquier valor) o si no trae `userId` string no vacío.

- [ ] **Step 0: Preparar el entorno**

```bash
cd "/Users/saidromero/Desktop/Casa She/casa-she-calendario"
git fetch origin main
git checkout -b fix/token-proposito-no-es-sesion origin/main
cd backend && npm ci
```

Expected: rama nueva creada; `npm ci` termina sin errores.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `backend/scripts/test-auth-token-purpose.ts`:

```ts
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { decodeSessionToken } from '../src/lib/sessionToken.js';

const SECRET = 'secreto-de-prueba';
const sesion = { userId: 'u-1', email: 'a@b.mx', role: 'client' };

// 1. Token de sesión normal: pasa y conserva el payload.
{
  const t = jwt.sign(sesion, SECRET, { expiresIn: '1h' });
  const d = decodeSessionToken(t, SECRET);
  assert.equal(d.userId, 'u-1');
  assert.equal(d.email, 'a@b.mx');
  assert.equal(d.role, 'client');
}

// 2. Token de reset de contraseña ({ userId, purpose: 'reset' }): rechazado.
{
  const t = jwt.sign({ userId: 'u-1', purpose: 'reset' }, SECRET, { expiresIn: '1h' });
  assert.throws(() => decodeSessionToken(t, SECRET), jwt.JsonWebTokenError);
}

// 3. Magic-link de coach ({ email, purpose: 'magic-link' }): rechazado.
{
  const t = jwt.sign({ email: 'coach@b.mx', purpose: 'magic-link' }, SECRET, { expiresIn: '1h' });
  assert.throws(() => decodeSessionToken(t, SECRET), jwt.JsonWebTokenError);
}

// 4. Cualquier clave purpose presente, aunque esté vacía o null: rechazado.
for (const purpose of ['', null, 'session']) {
  const t = jwt.sign({ ...sesion, purpose }, SECRET, { expiresIn: '1h' });
  assert.throws(() => decodeSessionToken(t, SECRET), jwt.JsonWebTokenError, `purpose=${String(purpose)}`);
}

// 5. Sin userId: rechazado.
{
  const t = jwt.sign({ email: 'a@b.mx', role: 'client' }, SECRET, { expiresIn: '1h' });
  assert.throws(() => decodeSessionToken(t, SECRET), jwt.JsonWebTokenError);
}

// 6. Expirado: sigue siendo TokenExpiredError (el middleware responde "Sesión expirada").
{
  const t = jwt.sign({ ...sesion, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET);
  assert.throws(() => decodeSessionToken(t, SECRET), jwt.TokenExpiredError);
}

// 7. Firmado con otro secreto: JsonWebTokenError.
{
  const t = jwt.sign(sesion, 'otro-secreto', { expiresIn: '1h' });
  assert.throws(() => decodeSessionToken(t, SECRET), jwt.JsonWebTokenError);
}

console.log('✅ test-auth-token-purpose: decodeSessionToken OK');
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd backend && npx tsx scripts/test-auth-token-purpose.ts`
Expected: FAIL con `Cannot find module '../src/lib/sessionToken.js'` (o equivalente).

- [ ] **Step 3: Implementar `decodeSessionToken`**

Crear `backend/src/lib/sessionToken.ts`:

```ts
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types/auth.js';

/**
 * Verifica un JWT de SESIÓN. Los tokens de un solo propósito (reset de contraseña,
 * magic-link de coach, y cualquiera que se agregue después) llevan la clave `purpose`
 * y NO pueden usarse como sesión: antes, el token de reset ({ userId, purpose: 'reset' })
 * entraba a cualquier ruta protegida durante su hora de vida.
 *
 * Lanza jwt.TokenExpiredError si expiró (el middleware lo traduce a "Sesión expirada")
 * y jwt.JsonWebTokenError en cualquier otro rechazo ("Token inválido").
 */
export function decodeSessionToken(token: string, secret: string): JwtPayload {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded !== 'object' || decoded === null) {
        throw new jwt.JsonWebTokenError('token de sesión con formato inválido');
    }
    if (Object.prototype.hasOwnProperty.call(decoded, 'purpose')) {
        throw new jwt.JsonWebTokenError('token de un solo propósito, no es de sesión');
    }
    const userId = (decoded as Record<string, unknown>).userId;
    if (typeof userId !== 'string' || userId.length === 0) {
        throw new jwt.JsonWebTokenError('token de sesión sin userId');
    }
    return decoded as unknown as JwtPayload;
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `cd backend && npx tsx scripts/test-auth-token-purpose.ts`
Expected: `✅ test-auth-token-purpose: decodeSessionToken OK`

- [ ] **Step 5: Agregar la prueba a `npm test`**

En `backend/package.json`, dentro de `scripts.test`, agregar al final de la cadena (después de `tsx scripts/test-membership-validity.ts`):

```
 && tsx scripts/test-auth-token-purpose.ts
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/sessionToken.ts backend/scripts/test-auth-token-purpose.ts backend/package.json
git commit -m "fix(auth): función que solo acepta tokens de sesión

decodeSessionToken rechaza cualquier JWT con clave purpose o sin userId.
Todavía no está cableada a los middlewares.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cablear `authenticate` y `optionalAuth`

**Files:**
- Modify: `backend/src/middleware/auth.ts` (líneas ~36 en `authenticate` y ~139 en `optionalAuth`, donde hoy está `jwt.verify(token, secret) as JwtPayload`)
- Modify: `backend/scripts/test-auth-token-purpose.ts` (agregar pruebas de cableado y de `optionalAuth`)

**Interfaces:**
- Consumes: `decodeSessionToken(token: string, secret: string): JwtPayload` de `backend/src/lib/sessionToken.ts` (Task 1).
- Produces: sin cambios de firma; `authenticate` y `optionalAuth` conservan su comportamiento para tokens de sesión.

- [ ] **Step 1: Agregar las pruebas que fallan**

Al final de `backend/scripts/test-auth-token-purpose.ts`, **antes** del `console.log` final, agregar:

```ts
// 8. Cableado: ambos middlewares usan decodeSessionToken y ya no verifican a mano.
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const ruta = fileURLToPath(new URL('../src/middleware/auth.ts', import.meta.url));
  const src = readFileSync(ruta, 'utf8');

  const cuerpo = (nombre: string) => {
    const inicio = src.indexOf(`export async function ${nombre}(`) >= 0
      ? src.indexOf(`export async function ${nombre}(`)
      : src.indexOf(`export function ${nombre}(`);
    assert.ok(inicio >= 0, `no encontré ${nombre}`);
    const fin = src.indexOf('\nexport ', inicio + 1);
    return src.slice(inicio, fin === -1 ? undefined : fin);
  };

  for (const nombre of ['authenticate', 'optionalAuth']) {
    const c = cuerpo(nombre);
    assert.ok(c.includes('decodeSessionToken(token, secret)'), `${nombre} debe usar decodeSessionToken`);
    assert.ok(!c.includes('jwt.verify('), `${nombre} no debe llamar jwt.verify directo`);
  }
}
```

Como el archivo ahora usa `await` de nivel superior, verificar que sigue siendo módulo ESM (lo es: `backend/package.json` tiene `"type": "module"`).

- [ ] **Step 2: Correrla y ver que falla**

Run: `cd backend && npx tsx scripts/test-auth-token-purpose.ts`
Expected: FAIL con `AssertionError: authenticate debe usar decodeSessionToken`.

- [ ] **Step 3: Cambiar el middleware**

En `backend/src/middleware/auth.ts`:

1. Agregar el import junto a los demás:

```ts
import { decodeSessionToken } from '../lib/sessionToken.js';
```

2. En `authenticate`, reemplazar:

```ts
        const decoded = jwt.verify(token, secret) as JwtPayload;
```

por:

```ts
        // Solo tokens de SESIÓN: un token de reset o de magic-link (llevan `purpose`)
        // se rechaza aquí con 401, antes de tocar la base.
        const decoded = decodeSessionToken(token, secret);
```

3. En `optionalAuth`, reemplazar:

```ts
            const decoded = jwt.verify(token, secret) as JwtPayload;
```

por:

```ts
            // Un token que no es de sesión cae al catch y la petición sigue como anónima.
            const decoded = decodeSessionToken(token, secret);
```

No cambiar nada más: el `catch` de `authenticate` ya traduce `TokenExpiredError` → "Sesión expirada" y `JsonWebTokenError` → "Token inválido"; el de `optionalAuth` ya ignora el error. El import de `jwt` se queda porque el `catch` usa `jwt.TokenExpiredError` / `jwt.JsonWebTokenError` y `generateToken` usa `jwt.sign`.

- [ ] **Step 4: Correr la prueba y el typecheck**

Run: `cd backend && npx tsx scripts/test-auth-token-purpose.ts && npx tsc --noEmit`
Expected: `✅ test-auth-token-purpose: decodeSessionToken OK` y `tsc` sin errores.

- [ ] **Step 5: Correr la suite completa que no necesita base**

Run: `cd backend && npx tsx scripts/test-permissions.ts && npx tsx scripts/test-totalpass-cableado.ts && npx tsx scripts/test-auth-token-purpose.ts`
Expected: las tres terminan sin `AssertionError`.

(La suite completa `npm test` incluye pruebas que necesitan Postgres local en `DATABASE_URL`; si hay Postgres local, correr `npm test` completo y reportar el resultado tal cual.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/auth.ts backend/scripts/test-auth-token-purpose.ts
git commit -m "fix(auth): el token de reset ya no sirve como sesión

authenticate y optionalAuth usan decodeSessionToken: cualquier JWT con
purpose (reset de contraseña, magic-link) o sin userId se rechaza con
401 'Token inválido' antes de consultar la base. Prueba fija el cableado.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: PR

**Files:** ninguno nuevo.

- [ ] **Step 1: Subir la rama y abrir el PR**

```bash
git push -u origin fix/token-proposito-no-es-sesion
gh pr create --base main --title "fix(auth): el token de reset de contraseña ya no sirve como sesión" --body "$(cat <<'EOF'
## Qué pasaba
`authenticate()` aceptaba cualquier JWT firmado con `JWT_SECRET`. El token de
"olvidé mi contraseña" (`{ userId, purpose: 'reset' }`, 1 h) trae `userId`, así que
servía como sesión iniciada durante una hora en cualquier ruta protegida.

## Qué cambia
- `backend/src/lib/sessionToken.ts`: `decodeSessionToken` rechaza todo token con clave
  `purpose` o sin `userId`.
- `authenticate` y `optionalAuth` la usan. Los tokens de sesión normales no cambian.
- Los flujos de reset y magic-link siguen igual (tienen sus propios verificadores).

## Pruebas
- `backend/scripts/test-auth-token-purpose.ts` (agregada a `npm test`): sesión pasa;
  reset, magic-link, `purpose` vacío/null y sin `userId` se rechazan; expirado sigue
  siendo "Sesión expirada"; el cableado de ambos middlewares queda fijado.

Primera entrega del rediseño del calendario de recepción
(`docs/superpowers/specs/2026-10-07-calendario-recepcion-design.md`): cierra esta
falla antes de empezar a mandar links de acceso de 7 días.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: URL del PR.
