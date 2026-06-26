import assert from 'node:assert/strict';
import { ManualIncomeSchema } from '../src/lib/manualIncome.js';

const ok = ManualIncomeSchema.safeParse({
    amount: 250, concept: 'Venta de grip socks', paymentMethod: 'cash',
});
assert.equal(ok.success, true);
if (ok.success) {
    assert.equal(ok.data.currency, 'MXN');
    assert.equal(ok.data.facilityId, undefined);
}
assert.equal(ManualIncomeSchema.safeParse({ amount: 0, concept: 'x', paymentMethod: 'cash' }).success, false);
assert.equal(ManualIncomeSchema.safeParse({ amount: 10, concept: '', paymentMethod: 'cash' }).success, false);
assert.equal(ManualIncomeSchema.safeParse({ amount: 10, concept: 'x', paymentMethod: 'crypto' }).success, false);

console.log('test-manual-income: OK');
