import assert from 'node:assert/strict';
import { manualDiscountNote, resolveManualPriceAdjustment } from '../src/lib/manual-price-adjustment.js';

const none = resolveManualPriceAdjustment({ listPrice: 1300 });
assert.deepEqual(none, {
  ok: true, applied: false, amount: 1300, discountAmount: 0,
  discountType: null, discountValue: 0, reason: null,
});

const percentage = resolveManualPriceAdjustment({
  listPrice: 1300,
  discountType: 'percentage',
  discountValue: 15,
  reason: 'Promoción de apertura',
});
assert.equal(percentage.ok && percentage.amount, 1105);
assert.equal(percentage.ok && percentage.discountAmount, 195);
assert.ok(percentage.ok && percentage.applied && manualDiscountNote(percentage).includes('15%'));

const fixed = resolveManualPriceAdjustment({
  listPrice: 2880,
  discountType: 'fixed',
  discountValue: 380.25,
  reason: 'Ajuste autorizado por gerencia',
});
assert.equal(fixed.ok && fixed.amount, 2499.75);

const noComment = resolveManualPriceAdjustment({
  listPrice: 2000,
  discountType: 'fixed',
  discountValue: 200,
  reason: 'no',
});
assert.equal(noComment.ok, false);

const invalidType = resolveManualPriceAdjustment({
  listPrice: 2000,
  discountType: 'arbitrary' as 'fixed',
  discountValue: 200,
  reason: 'Tipo alterado desde el navegador',
});
assert.equal(invalidType.ok, false);

const disguisedFreePercent = resolveManualPriceAdjustment({
  listPrice: 2000,
  discountType: 'percentage',
  discountValue: 100,
  reason: 'Se pretende regalar el plan',
});
assert.equal(disguisedFreePercent.ok, false);

const disguisedFreeFixed = resolveManualPriceAdjustment({
  listPrice: 2000,
  discountType: 'fixed',
  discountValue: 2000,
  reason: 'Se pretende regalar el plan',
});
assert.equal(disguisedFreeFixed.ok, false);

console.log('✓ Descuentos manuales: porcentaje/fijo auditables y cortesía $0 separada.');
