import assert from 'node:assert/strict';
import { resolveFacilityScope } from '../src/lib/facilityScope.js';

// admin sin request → all
assert.deepEqual(resolveFacilityScope({ role: 'admin', assignedFacilityId: null, requestedFacilityId: null }), { kind: 'all' });
// super_admin con request → facility
assert.deepEqual(resolveFacilityScope({ role: 'super_admin', assignedFacilityId: null, requestedFacilityId: 'F2' }), { kind: 'facility', facilityId: 'F2' });
// reception sin asignar → error 403
assert.equal(resolveFacilityScope({ role: 'reception', assignedFacilityId: null, requestedFacilityId: null }).kind, 'error');
// reception pidiendo otra sucursal → error 403
{
  const r = resolveFacilityScope({ role: 'reception', assignedFacilityId: 'A', requestedFacilityId: 'B' });
  assert.equal(r.kind, 'error'); assert.equal((r as any).status, 403);
}
// reception con la suya (request explícito igual) → su facility
assert.deepEqual(resolveFacilityScope({ role: 'reception', assignedFacilityId: 'A', requestedFacilityId: 'A' }), { kind: 'facility', facilityId: 'A' });
// reception sin request → su facility
assert.deepEqual(resolveFacilityScope({ role: 'reception', assignedFacilityId: 'A', requestedFacilityId: null }), { kind: 'facility', facilityId: 'A' });

console.log('test-facility-scope: OK');
