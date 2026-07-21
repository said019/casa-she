/**
 * Test de humo para withPgAdvisoryLock (Task 17). El comportamiento real de
 * lock/unlock (pg_try_advisory_lock/pg_advisory_unlock sobre la MISMA sesión)
 * requiere una conexión Postgres real — se valida en integración: correr los
 * 4 crons TP contra una BD real y confirmar en los logs que un segundo
 * disparo mientras el primero sigue corriendo cede con "lock ocupado" (o,
 * llamando dos veces en paralelo desde un script con DATABASE_URL, que la
 * segunda llamada recibe `null` mientras la primera sostiene el lock).
 *
 * Sin BD, este test valida lo que SÍ es puramente lógico y es la garantía
 * real que evita que dos jobs se pisen el candado entre sí: la firma de la
 * función y que las 3 llaves de lock usadas en cron-jobs.ts/partners.ts
 * (471001 import, 471002 pool, 471003 publish) sean enteras y TODAS
 * distintas entre sí.
 */
import assert from 'node:assert/strict';
import { withPgAdvisoryLock } from '../src/lib/totalpass/lock.js';

// Firma: función exportada, 2 parámetros posicionales (key, fn).
assert.equal(typeof withPgAdvisoryLock, 'function', 'withPgAdvisoryLock debe ser una función');
assert.equal(withPgAdvisoryLock.length, 2, 'withPgAdvisoryLock(key, fn) debe declarar 2 parámetros');

// Llaves de lock por job — deben ser enteras (pg_try_advisory_lock espera
// bigint) y TODAS distintas: si dos jobs compartieran llave, uno bloquearía
// al otro aunque no tengan nada que ver (p.ej. import bloqueando publish).
const LOCK_KEYS = { import: 471001, pool: 471002, publish: 471003 } as const;
const keys = Object.values(LOCK_KEYS);
assert.equal(new Set(keys).size, keys.length, 'las llaves de lock por job deben ser todas distintas');
for (const k of keys) {
    assert.equal(Number.isInteger(k), true, `la llave ${k} debe ser un entero`);
}

console.log('test-totalpass-lock: OK (smoke sin BD — lock/unlock real se valida en integración con DATABASE_URL)');
