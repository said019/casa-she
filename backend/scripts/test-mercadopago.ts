import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildPreferenceBody, verifyWebhookSignature } from '../src/lib/mercadopago.js';

// ─── buildPreferenceBody ───────────────────────────────────────────────
const body: any = buildPreferenceBody({
    orderId: 'order-123',
    orderNumber: 'CS-0001',
    items: [{ title: 'Membresía Black', quantity: 1, unit_price: 4200 }],
    payerEmail: 'clienta@casashe.mx',
    backUrl: 'https://casashe.mx/app/orders/order-123',
    notificationUrl: 'https://backend.example.com/webhooks/mercadopago',
});
assert.equal(body.external_reference, 'order-123', 'external_reference = orderId');
assert.equal(body.items[0].currency_id, 'MXN');
assert.equal(body.items[0].unit_price, 4200, 'monto en PESOS, no centavos');
assert.equal(body.items[0].quantity, 1);
assert.equal(body.payer.email, 'clienta@casashe.mx');
assert.equal(body.auto_return, 'approved');
assert.equal(body.back_urls.success, 'https://casashe.mx/app/orders/order-123?mp=success');
assert.equal(body.notification_url, 'https://backend.example.com/webhooks/mercadopago');
assert.equal(body.metadata.order_number, 'CS-0001');

// redondeo a 2 decimales
const rounded: any = buildPreferenceBody({
    orderId: 'o', items: [{ title: 'x', quantity: 1, unit_price: 1350.005 }], backUrl: 'https://x/y',
});
assert.equal(rounded.items[0].unit_price, 1350.01);
// notification_url y payer opcionales → se omiten
assert.equal(rounded.notification_url, undefined);
assert.equal(rounded.payer, undefined);

// validaciones
assert.throws(() => buildPreferenceBody({ orderId: '', items: [{ title: 'x', quantity: 1, unit_price: 1 }], backUrl: 'u' }), /ORDER_ID_REQUIRED/);
assert.throws(() => buildPreferenceBody({ orderId: 'o', items: [], backUrl: 'u' }), /ITEMS_REQUIRED/);
assert.throws(() => buildPreferenceBody({ orderId: 'o', items: [{ title: '', quantity: 1, unit_price: 1 }], backUrl: 'u' }), /ITEM_TITLE_REQUIRED/);
assert.throws(() => buildPreferenceBody({ orderId: 'o', items: [{ title: 'x', quantity: 1, unit_price: 0 }], backUrl: 'u' }), /ITEM_PRICE_INVALID/);

// ─── verifyWebhookSignature ────────────────────────────────────────────
const secret = 'super-secreto-de-prueba';
const dataId = 'ABC123';   // se compara en minúsculas
const xRequestId = 'req-987';
const ts = '1700000000';
const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
const v1 = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
const xSignature = `ts=${ts}, v1=${v1}`;   // MP a veces mete espacios

// firma válida
assert.equal(verifyWebhookSignature({ xSignature, xRequestId, dataId, secret }), true, 'firma válida pasa');
// firma alterada
assert.equal(verifyWebhookSignature({ xSignature: `ts=${ts},v1=deadbeef`, xRequestId, dataId, secret }), false, 'v1 alterado falla');
// dataId distinto (el manifest cambia)
assert.equal(verifyWebhookSignature({ xSignature, xRequestId, dataId: 'OTRO', secret }), false, 'dataId distinto falla');
// falta header
assert.equal(verifyWebhookSignature({ xSignature: undefined, xRequestId, dataId, secret }), false, 'sin x-signature falla');
// secreto vacío → fail-closed: se rechaza (false). Antes fallaba abierto (true) — un
// webhook falsificado se habría aceptado como válido si MP_WEBHOOK_SECRET llegara a
// faltar por error de configuración (P0-4, pre-prod audit 2026-07-16).
assert.equal(verifyWebhookSignature({ xSignature, xRequestId, dataId, secret: '' }), false, 'sin secreto se rechaza (fail-closed)');

console.log('test-mercadopago OK');
