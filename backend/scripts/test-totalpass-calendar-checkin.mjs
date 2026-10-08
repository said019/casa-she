import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const routes = read('../src/routes/bookings.ts');
const panel = read('../../frontend/src/pages/admin/classes/calendario/PanelClase.tsx');
const list = routes.slice(routes.indexOf("router.get('/class/:classId'"), routes.indexOf("router.post('/:id/check-in'"));
assert.match(list, /ck\.booking_id = b\.id/);
assert.match(list, /ck\.channel = 'totalpass' AND ck\.status = 'confirmed'/);
assert.match(list, /AS totalpass_checkin_confirmed/);
for (const endpoint of ['check-in', 'uncheck-in']) {
    const body = routes.slice(routes.indexOf(`router.post('/:id/${endpoint}'`)).split('\n});')[0];
    assert.match(body, /source\?\.channel === 'totalpass'/);
    assert.match(body, /TOTALPASS_CHECKIN_REQUIRED/);
    assert.match(body, /channel IS DISTINCT FROM 'totalpass'/);
}
assert.match(panel, /totalpass_checkin_confirmed \? 'Check-in validado' : 'Check-in pendiente'/);
assert.match(panel, /attendee\.channel !== 'totalpass' && attendee\.status === 'checked_in'/);
assert.match(panel, /attendee\.channel !== 'totalpass' && <Button[\s\S]*?title="Marcar asistencia"/);
console.log('TotalPass calendar: confirmed external check-in and manual-action guards OK');
