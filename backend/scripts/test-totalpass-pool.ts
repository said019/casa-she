import assert from 'node:assert/strict';
import { decidePoolChange, computeDesiredSlots } from '../src/lib/totalpass/pool.js';
import { channelCapCeiling } from '../src/lib/totalpass/caps.js';

// ── decidePoolChange: true cuando difiere, false cuando igual ────────────────
assert.equal(decidePoolChange(3, 3), false, 'igual -> no cambia');
assert.equal(decidePoolChange(0, 0), false, 'igual (0) -> no cambia');
assert.equal(decidePoolChange(3, 5), true, 'creció -> cambia');
assert.equal(decidePoolChange(5, 3), true, 'bajó -> cambia');
assert.equal(decidePoolChange(2.9, 3), true, 'compara por floor, no exacto: 2.9 -> floor 2 != 3');
assert.equal(decidePoolChange(3, 3.2), false, 'floor(3.2) = 3 -> no cambia');

// ── computeDesiredSlots: compone channelCapCeiling + piso por tpLive ─────────
// Mismos casos que test-totalpass-caps.ts (channelCapCeiling), sin reservas TP en vivo.
assert.equal(computeDesiredSlots(8, 0, 0, 3), channelCapCeiling(8, 0, 0, 3), 'clase vacía, cap 3 -> techo 3');
assert.equal(computeDesiredSlots(8, 0, 0, 3), 3);

// nonTp=2 (2 reservas de otros canales), tpLive=2 -> total real 4… pero replicamos
// el caso de caps con total=2/tp=2: aquí nonTp=0, tpLive=2 -> total real 2.
assert.equal(computeDesiredSlots(8, 0, 2, 3), channelCapCeiling(8, 2, 2, 3), 'nonTp=0, tpLive=2, cap 3');
assert.equal(computeDesiredSlots(8, 0, 2, 3), 3);

// clase casi llena físicamente por otros canales (7 no-TP), TP sin usar, cap 3 -> solo 1 físico libre.
assert.equal(computeDesiredSlots(8, 7, 0, 3), channelCapCeiling(8, 7, 0, 3), 'nonTp=7, tpLive=0, cap 3');
assert.equal(computeDesiredSlots(8, 7, 0, 3), 1);

// nunca negativo: 10 reservas no-TP en clase de 8 -> 0.
assert.equal(computeDesiredSlots(8, 10, 0, 3), 0, 'sobre-reservada por otros canales -> 0');

// nunca por debajo de tpLive: TP ya trae 5 reservas en vivo aunque el tope sea 3
// (el tope se editó hacia abajo con reservas ya hechas) -> el piso es 5, no 3.
assert.equal(computeDesiredSlots(8, 0, 5, 3), 5, 'nunca baja de tpLive aunque supere el tope');

// cap null (canal apagado en channel_inventory, edge defensivo) -> ceiling 0, piso tpLive.
assert.equal(computeDesiredSlots(8, 0, 0, null), 0, 'cap null -> 0');
assert.equal(computeDesiredSlots(8, 0, 2, null), 2, 'cap null pero tpLive=2 -> nunca baja de 2');

console.log('test-totalpass-pool: OK');
