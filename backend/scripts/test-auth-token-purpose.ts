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

// 5. Sin userId, o userId que no es string no vacío: rechazado.
{
  const t = jwt.sign({ email: 'a@b.mx', role: 'client' }, SECRET, { expiresIn: '1h' });
  assert.throws(() => decodeSessionToken(t, SECRET), jwt.JsonWebTokenError);

  for (const userId of ['', 123]) {
    const t2 = jwt.sign({ ...sesion, userId }, SECRET, { expiresIn: '1h' });
    assert.throws(() => decodeSessionToken(t2, SECRET), jwt.JsonWebTokenError, `userId=${JSON.stringify(userId)}`);
  }
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

console.log('✅ test-auth-token-purpose: decodeSessionToken OK');
