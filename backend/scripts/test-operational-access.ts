import assert from 'node:assert/strict';
import { isReportRole, operationalRole } from '../src/lib/operationalAccess.js';

assert.equal(operationalRole('reception'), 'admin', 'recepción debe operar como admin');
assert.equal(operationalRole('client'), 'client');
assert.equal(isReportRole('reception'), false, 'recepción no debe acceder a reportes');
assert.equal(isReportRole('admin'), true);
assert.equal(isReportRole('super_admin'), true);

console.log('✓ paridad operativa y excepción de reportes');
