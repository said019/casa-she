import assert from 'node:assert/strict';
import { addDaysToDateStr, localDateStr, GYM_TIMEZONE } from '../src/lib/mx-time.js';
import { GYM_TEAM_NAME } from '../src/lib/gym-config.js';

// Aritmética de calendario pura (sin zona) sobre string YYYY-MM-DD.
assert.equal(addDaysToDateStr('2026-07-20', 5), '2026-07-25');

// Fecha local en America/Mexico_City: 05:00 UTC del 20-jul es 23:00 del 19-jul en CDMX (UTC-6).
assert.equal(GYM_TIMEZONE, 'America/Mexico_City');
assert.equal(localDateStr(new Date('2026-07-20T05:00:00Z')), '2026-07-19');

// Identidad del gym, portada de Hundred con el default cambiado.
assert.equal(GYM_TEAM_NAME, 'Casa Shé');

console.log('test-totalpass-time: OK');
