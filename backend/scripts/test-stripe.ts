process.env.APP_SLUG = 'bmb';
import assert from 'node:assert/strict';
import { buildLineItem, buildIdempotencyKey, validateStripeConfig } from '../src/lib/stripe.js';

const li = buildLineItem({ name: 'Plan Multi 8', amountMxn: 1234.5, quantity: 1 });
assert.equal((li.price_data as any).unit_amount, 123450);
assert.equal((li.price_data as any).currency, 'mxn');
assert.equal((li.price_data as any).product_data.name, 'Plan Multi 8');
assert.throws(() => buildLineItem({ name: '', amountMxn: 100 }), /NAME_REQUIRED/);
assert.throws(() => buildLineItem({ name: 'x', amountMxn: 0 }), /AMOUNT_INVALID/);

assert.equal(buildIdempotencyKey('order-1'), 'bmb:order-1');
assert.equal(buildIdempotencyKey('order-1', 2), 'bmb:order-1:retry-2');

assert.equal(validateStripeConfig({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_STATEMENT_DESCRIPTOR: 'BMB STUDIO' } as any).ok, true);
assert.equal(validateStripeConfig({} as any).ok, false);
assert.ok(validateStripeConfig({ STRIPE_SECRET_KEY: 'sk_test_x', NODE_ENV: 'production', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_STATEMENT_DESCRIPTOR: 'BMB' } as any).errors.some(e => /test key in production/.test(e)));
assert.ok(validateStripeConfig({ STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_STATEMENT_DESCRIPTOR: 'ab' } as any).errors.some(e => /3–22/.test(e)));

console.log('test-stripe: OK');
