import assert from 'node:assert/strict';
import { channelCapAvailable, channelCapCeiling, buildPoolSnapshot } from '../src/lib/totalpass/caps.js';

// cap null = canal apagado -> 0 disponible
assert.equal(channelCapAvailable(8, 0, 0, null), 0);
// clase vacía, cap 3 -> 3 disponibles, techo 3
assert.equal(channelCapAvailable(8, 0, 0, 3), 3);
assert.equal(channelCapCeiling(8, 0, 0, 3), 3);
// 2 reservas TP ya usadas de cap 3, clase con 2 reservas totales -> 1 disponible, techo 3
assert.equal(channelCapAvailable(8, 2, 2, 3), 1);
assert.equal(channelCapCeiling(8, 2, 2, 3), 3);
// clase casi llena físicamente (7/8), cap TP 3 sin usar -> solo 1 físico libre
assert.equal(channelCapAvailable(8, 7, 0, 3), 1);
assert.equal(channelCapCeiling(8, 7, 0, 3), 1);
// nunca negativo
assert.equal(channelCapAvailable(8, 10, 0, 3), 0);
// snapshot
const s = buildPoolSnapshot({ capacity: 8, total: 2, totalpass: 2 }, 3);
assert.equal(s.physicalFree, 6);
assert.equal(s.tpAvailable, 1);
assert.equal(s.tpCeiling, 3);
console.log('test-totalpass-caps: OK');
