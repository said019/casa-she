import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const routes = readFileSync(new URL('../src/routes/instructors.ts', import.meta.url), 'utf8');
for (const path of ["router.get('/:id/classes/:classId/attendees'", "router.get('/:id/history/:classId/attendees'"]) {
    const section = routes.slice(routes.indexOf(path)).split('\n});')[0];
    assert.match(section, /requireSelfInstructorOrStaff/);
    assert.match(section, /LEFT JOIN users u ON b.user_id = u.id/);
    assert.match(section, /b.channel/);
    assert.match(section, /COALESCE\(NULLIF\(u.display_name/);
    assert.match(section, /403/);
}
const current = routes.slice(routes.indexOf("router.get('/:id/classes/:classId/attendees'")).split('\n});')[0];
assert.match(current, /b.status != 'cancelled'/);
const ui = readFileSync(new URL('../../frontend/src/pages/coach/ClassDetail.tsx', import.meta.url), 'utf8');
assert.match(ui, /refetchInterval: 15000/);
assert.match(ui, /attendeesError/);
assert.match(ui, /attendee.channel === 'fitpass' \? 'FitPass'/);
assert.match(ui, /attendee.channel === 'totalpass' \? 'TotalPass'/);
console.log('Coach platform roster: 15 regression checks passed');
