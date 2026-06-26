import assert from 'node:assert/strict';
import { addMinutesToTime, capacityError, buildScheduleRows } from '../src/lib/schedule.js';

assert.equal(addMinutesToTime('07:10', 50), '08:00');
assert.equal(addMinutesToTime('20:10', 50), '21:00');
assert.equal(addMinutesToTime('23:30', 50), '00:20');

assert.equal(capacityError('reformer', 8), null);
assert.equal(capacityError('reformer', 9), 'El cupo de Reformer no puede exceder 8 (número de máquinas).');
assert.equal(capacityError('multi', 20), null);
assert.equal(capacityError('reformer', 0), 'El cupo debe ser un entero positivo.');

const rows = buildScheduleRows({
  facility: 'BMB Studio Tepa', category: 'reformer', capacity: 8, durationMin: 50,
  slots: [
    { day: 1, start: '07:10', classType: 'Pilates Reformer', instructor: 'Por asignar' },
    { day: 6, start: '11:10', classType: 'Pilates Reformer', instructor: 'Por asignar', active: false },
  ],
});
assert.equal(rows.length, 2);
assert.deepEqual(rows[0], {
  facility: 'BMB Studio Tepa', class_type: 'Pilates Reformer', category: 'reformer',
  instructor: 'Por asignar', day_of_week: 1, start_time: '07:10', end_time: '08:00',
  max_capacity: 8, is_active: true,
});
assert.equal(rows[1].is_active, false);

console.log('test-schedule: OK');
