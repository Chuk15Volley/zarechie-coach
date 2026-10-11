import {playerLocalDate,DEFAULT_PLAYER_TIME_ZONE} from './playerTimeZone.mjs';
export function calendarToday(now = new Date(), timeZone = DEFAULT_PLAYER_TIME_ZONE) {
  return playerLocalDate(timeZone,now);
}
export function validCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function shiftCalendarDate(value, days) {
  if (!validCalendarDate(value)) throw new Error('Invalid calendar date');
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function calendarWeek(value) {
  const weekday = new Date(`${value}T12:00:00Z`).getUTCDay();
  const monday = shiftCalendarDate(value, -((weekday + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftCalendarDate(monday, i));
}
export function calendarMonthCells(month) {
  const first = `${month}-01`;
  const monday = calendarWeek(first)[0];
  return Array.from({ length: 42 }, (_, i) => {
    const date = shiftCalendarDate(monday, i);
    return { date, inMonth: date.startsWith(month) };
  });
}
export function shiftCalendarMonth(month, delta) {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}
export function calendarDateAllowed(date, minDate, maxDate) {
  return validCalendarDate(date) && (!minDate || date >= minDate) && (!maxDate || date <= maxDate);
}
