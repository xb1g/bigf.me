import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addWeeks, bangkokDateTimeToIso, bangkokHour, daysBetween, formatDate, formatDateLong, formatElapsed,
  formatHours, formatMinutes, formatShortDate, formatTime, isDateTime, isISODate, isoToBangkokInput, isoWeekday,
  relativeDays, todayISO, toISODate, weekDates, weekKey, weekKeyOf, weekRange, weekStart,
} from './dates.ts';

test('todayISO uses Asia/Bangkok, not UTC', () => {
  // 2026-10-27T18:30Z is 01:30 on the 28th in Bangkok.
  assert.equal(todayISO(new Date('2026-10-27T18:30:00Z')), '2026-10-28');
  // 2026-10-27T16:59Z is 23:59 on the 27th in Bangkok.
  assert.equal(todayISO(new Date('2026-10-27T16:59:00Z')), '2026-10-27');
  assert.equal(toISODate('2026-12-31T17:00:00Z'), '2027-01-01');
});

test('bangkokHour', () => {
  assert.equal(bangkokHour(new Date('2026-10-28T11:00:00Z')), 18);
  assert.equal(bangkokHour(new Date('2026-10-28T17:00:00Z')), 0);
});

test('isISODate rejects impossible dates and junk', () => {
  assert.ok(isISODate('2026-02-28'));
  assert.ok(isISODate('2028-02-29'));
  assert.ok(!isISODate('2026-02-29'));
  assert.ok(!isISODate('2026-13-01'));
  assert.ok(!isISODate('2026-1-01'));
  assert.ok(!isISODate(20261028));
  assert.ok(!isISODate(undefined));
});

test('isDateTime', () => {
  assert.ok(isDateTime('2026-10-28T10:00:00.000Z'));
  assert.ok(!isDateTime('nope'));
  assert.ok(!isDateTime(5));
});

test('addDays crosses months, years and leap days', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-28', 14), '2026-11-11');
  assert.equal(addDays('2026-10-28', 0), '2026-10-28');
});

test('daysBetween is b − a in whole days', () => {
  assert.equal(daysBetween('2026-10-28', '2026-10-30'), 2);
  assert.equal(daysBetween('2026-10-30', '2026-10-28'), -2);
  assert.equal(daysBetween('2026-10-28', '2026-12-20'), 53);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('weekKey follows ISO-8601 (Monday start, week 1 has the first Thursday)', () => {
  assert.equal(weekKey('2026-10-28'), '2026-W44');
  assert.equal(weekKey('2026-10-26'), '2026-W44'); // Monday
  assert.equal(weekKey('2026-11-01'), '2026-W44'); // Sunday
  assert.equal(weekKey('2026-11-02'), '2026-W45');
  assert.equal(weekKey('2027-01-01'), '2026-W53'); // Friday → belongs to 2026's last week
  assert.equal(weekKey('2026-01-01'), '2026-W01'); // Thursday
  assert.equal(weekKey('2024-12-30'), '2025-W01'); // Monday → 2025 W01
  assert.equal(weekKey('2021-01-03'), '2020-W53');
});

test('weekKeyOf uses the Bangkok date of an instant', () => {
  // Sunday 23:30 UTC = Monday 06:30 Bangkok → next week.
  assert.equal(weekKeyOf('2026-11-01T23:30:00Z'), '2026-W45');
});

test('weekStart / weekRange / weekDates / addWeeks', () => {
  assert.equal(isoWeekday('2026-10-28'), 3);
  assert.equal(isoWeekday('2026-11-01'), 7);
  assert.equal(weekStart('2026-10-28'), '2026-10-26');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.deepEqual(weekRange('2026-W44'), { start: '2026-10-26', end: '2026-11-01' });
  assert.deepEqual(weekRange('2026-W53'), { start: '2026-12-28', end: '2027-01-03' });
  assert.deepEqual(weekRange('2025-W01'), { start: '2024-12-30', end: '2025-01-05' });
  const days = weekDates('2026-W44');
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-10-26');
  assert.equal(days[6], '2026-11-01');
  assert.equal(addWeeks('2026-W44', 1), '2026-W45');
  assert.equal(addWeeks('2026-W01', -1), '2025-W52');
  assert.throws(() => weekRange('2026-44'));
});

test('Bangkok local input <-> instant', () => {
  assert.equal(bangkokDateTimeToIso('2026-10-28', '09:30'), '2026-10-28T02:30:00.000Z');
  assert.deepEqual(isoToBangkokInput('2026-10-28T02:30:00.000Z'), { date: '2026-10-28', time: '09:30' });
  assert.deepEqual(isoToBangkokInput('2026-10-27T17:05:00.000Z'), { date: '2026-10-28', time: '00:05' });
});

test('format helpers', () => {
  assert.equal(formatDate('2026-10-28'), 'Wed 28 Oct');
  assert.equal(formatDate('2027-01-02', 2026), 'Sat 2 Jan 2027');
  assert.equal(formatShortDate('2026-12-20'), '20 Dec');
  assert.equal(formatDateLong('2026-10-28'), 'Wednesday, 28 October');
  assert.equal(formatDate('garbage'), '');
  assert.equal(formatTime('2026-10-28T02:30:00.000Z'), '09:30');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(125), '2h 05m');
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatHours(1.25), '1.3h');
  assert.equal(formatHours(2), '2h');
  assert.equal(formatElapsed(75_000), '01:15');
  assert.equal(formatElapsed(3_725_000), '1:02:05');
  assert.equal(formatElapsed(-5), '00:00');
});

test('relativeDays', () => {
  assert.equal(relativeDays('2026-10-28', '2026-10-28'), 'today');
  assert.equal(relativeDays('2026-10-29', '2026-10-28'), 'tomorrow');
  assert.equal(relativeDays('2026-10-27', '2026-10-28'), 'yesterday');
  assert.equal(relativeDays('2026-11-01', '2026-10-28'), 'in 4 days');
  assert.equal(relativeDays('2026-10-25', '2026-10-28'), '3 days ago');
});
