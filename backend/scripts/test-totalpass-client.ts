import assert from 'node:assert/strict';
import { totalPassTime24, totalPassTime12, isTotalPassRateLimit, totalPassOccurrenceUuid } from '../src/lib/totalpass/client.js';

// Conversión de hora 12h -> 24h (string puro, sin Date).
assert.equal(totalPassTime24('01:30 PM'), '13:30');

// Conversión de hora 24h -> 12h.
assert.equal(totalPassTime12('13:30'), '01:30 PM');

// Detección de rate-limit (429) a partir del mensaje de error formateado.
assert.equal(isTotalPassRateLimit(new Error('TotalPass GET /x → 429: y')), true);
assert.equal(isTotalPassRateLimit(new Error('boom')), false);

// Extrae el uuid de ocurrencia priorizando occurrenceUuid, con fallback a eventOccurrenceUuid.
assert.equal(totalPassOccurrenceUuid({ eventOccurrenceUuid: 'abc' } as any), 'abc');

console.log('test-totalpass-client: OK');
