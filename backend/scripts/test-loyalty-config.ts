import assert from 'node:assert/strict';
import { DEFAULT_LOYALTY_CONFIG, normalizeConfig } from '../src/lib/loyalty.js';

// Los 3 toggles existen y default true
assert.equal(DEFAULT_LOYALTY_CONFIG.birthday_enabled, true, 'birthday_enabled default true');
assert.equal(DEFAULT_LOYALTY_CONFIG.anniversary_enabled, true, 'anniversary_enabled default true');
assert.equal(DEFAULT_LOYALTY_CONFIG.streak_enabled, true, 'streak_enabled default true');

// normalizeConfig rellena toggles ausentes a true
const n1 = normalizeConfig({ birthday_bonus: 100 });
assert.equal(n1.birthday_enabled, true, 'toggle ausente -> true');
assert.equal(n1.streak_enabled, true, 'toggle ausente -> true');

// normalizeConfig respeta false explícito y coacciona a boolean
const n2 = normalizeConfig({ birthday_enabled: false, anniversary_enabled: 0, streak_enabled: 'x' as unknown });
assert.equal(n2.birthday_enabled, false, 'false explícito se respeta');
assert.equal(n2.anniversary_enabled, false, '0 -> false');
assert.equal(n2.streak_enabled, true, 'truthy -> true');

// normalizeConfig sigue rellenando los montos existentes (no regresión)
const n3 = normalizeConfig({});
assert.equal(n3.birthday_bonus, DEFAULT_LOYALTY_CONFIG.birthday_bonus, 'monto default intacto');

console.log('test-loyalty-config OK');
