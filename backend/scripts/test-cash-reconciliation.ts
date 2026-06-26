import assert from 'node:assert/strict';
import { computeExpectedCash, computeDifference } from '../src/lib/cashReconciliation.js';

// Solo fondo
assert.equal(computeExpectedCash({ openingFloat: 500, cashSales: 0, cashIn: 0, cashOut: 0, cashEgresos: 0 }), 500);
// Ventas en efectivo suman
assert.equal(computeExpectedCash({ openingFloat: 500, cashSales: 1200, cashIn: 0, cashOut: 0, cashEgresos: 0 }), 1700);
// Entradas suman, salidas y egresos restan
assert.equal(computeExpectedCash({ openingFloat: 500, cashSales: 1000, cashIn: 200, cashOut: 150, cashEgresos: 100 }), 1450);
// Diferencia: sobrante (+) y faltante (-)
assert.equal(computeDifference(1450, 1500), 50);
assert.equal(computeDifference(1450, 1400), -50);
assert.equal(computeDifference(1450, 1450), 0);
// Redondeo a 2 decimales
assert.equal(computeExpectedCash({ openingFloat: 0.1, cashSales: 0.2, cashIn: 0, cashOut: 0, cashEgresos: 0 }), 0.3);

console.log('test-cash-reconciliation: OK');
