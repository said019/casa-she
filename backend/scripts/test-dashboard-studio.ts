import assert from 'node:assert/strict';
import { fillStudioCounts } from '../src/lib/dashboardStudio.js';

const facilities = [
    { id: 'w', name: 'Wunda' },
    { id: 'b', name: 'Barre' },
    { id: 'h', name: 'Hot Room' },
];
const raw = [
    { facility_id: 'w', count: '3' },
    { facility_id: 'h', count: '5' },
];

const result = fillStudioCounts(facilities, raw);
assert.deepEqual(result, [
    { facilityId: 'w', name: 'Wunda', count: 3 },
    { facilityId: 'b', name: 'Barre', count: 0 },
    { facilityId: 'h', name: 'Hot Room', count: 5 },
]);

const r2 = fillStudioCounts(facilities, [{ facility_id: null, count: '9' }]);
assert.deepEqual(r2.map(x => x.count), [0, 0, 0]);

console.log('test-dashboard-studio: OK');
