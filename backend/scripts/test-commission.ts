import assert from 'node:assert/strict';
import { computeCommission, resolveCommissionSetting } from '../src/lib/commission.js';

// Alcanza el objetivo → % sobre las MEMBRESÍAS PÚBLICAS vendidas
assert.deepEqual(computeCommission({ commissionableSales: 50000, monthlyTarget: 40000, commissionRate: 5 }), { reached: true, commission: 2500 });
// No alcanza → 0
assert.deepEqual(computeCommission({ commissionableSales: 35000, monthlyTarget: 40000, commissionRate: 5 }), { reached: false, commission: 0 });
// Igual al objetivo → alcanza (>=)
assert.deepEqual(computeCommission({ commissionableSales: 40000, monthlyTarget: 40000, commissionRate: 5 }), { reached: true, commission: 2000 });
// Objetivo 0 → siempre alcanza
assert.deepEqual(computeCommission({ commissionableSales: 1000, monthlyTarget: 0, commissionRate: 10 }), { reached: true, commission: 100 });
// Rate 0 → comisión 0 aunque alcance
assert.deepEqual(computeCommission({ commissionableSales: 50000, monthlyTarget: 40000, commissionRate: 0 }), { reached: true, commission: 0 });
// Redondeo a 2 decimales
assert.deepEqual(computeCommission({ commissionableSales: 1234.56, monthlyTarget: 0, commissionRate: 7.5 }), { reached: true, commission: 92.59 });

// resolveCommissionSetting: override gana; sin override usa default
const def = { monthly_target: 40000, commission_rate: 5 };
assert.deepEqual(resolveCommissionSetting(def, null), def);
assert.deepEqual(resolveCommissionSetting(def, undefined), def);
assert.deepEqual(resolveCommissionSetting(def, { monthly_target: 50000, commission_rate: 6 }), { monthly_target: 50000, commission_rate: 6 });

console.log('test-commission: OK');
