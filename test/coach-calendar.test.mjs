import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarToday, validCalendarDate, calendarWeek, calendarMonthCells, shiftCalendarDate, shiftCalendarMonth, calendarDateAllowed } from '../lib/coachCalendar.mjs';
test('day switching crosses years and leap days without local timezone drift', () => {
  assert.equal(shiftCalendarDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftCalendarDate('2024-03-01', -1), '2024-02-29');
  assert.equal(validCalendarDate('2026-02-29'), false);
  assert.equal(calendarToday(new Date('2026-10-04T21:01:00Z')), '2026-10-05');
});
test('week starts on Monday and month grid retains all dates including leap February', () => {
  assert.deepEqual(calendarWeek('2026-10-04'), ['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04']);
  const cells = calendarMonthCells('2024-02');
  assert.equal(cells.length, 42); assert.equal(cells.filter(c => c.inMonth).length, 29);
  assert.equal(new Set(cells.map(c=>c.date)).size, 42);
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
});
test('navigation and calendar selection preserve inclusive permitted date boundaries', () => {
  for (const date of ['2026-09-30','2026-10-06','invalid']) assert.equal(calendarDateAllowed(date,'2026-10-01','2026-10-05'),false);
  for (const date of ['2026-10-01','2026-10-05']) assert.equal(calendarDateAllowed(date,'2026-10-01','2026-10-05'),true);
});
