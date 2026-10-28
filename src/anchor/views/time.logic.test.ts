import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TimeEntry } from '../core/types.ts';
import { buildSellRatio, emptyCategoryHours } from '../core/metrics.ts';
import {
  applyEdit, blockDurationHint, blockRangeLabel, blocksByDay, canGoNext, categoryColor, categoryRows,
  defaultBlockInput, defaultDateForWeek, entryToInput, isCategory, overlapNote, overlapping, ratioSummary,
  resolveWeek, RUNNING_TIMER_ID, stopMessage, stopTimeDefault, timeboxBannerText, validateBlock, validateStopTime,
  weekRangeLabel, weekTitle,
} from './time.logic.ts';

// Bangkok is UTC+7: 09:00 BKK = 02:00Z.
const entry = (id: string, start: string, end: string, extra: Partial<TimeEntry> = {}): TimeEntry =>
  ({ id, category: 'build', start, end, ...extra });

const NOW = new Date('2026-10-28T12:00:00Z'); // Wed 28 Oct 2026, 19:00 Bangkok (week 2026-W44)

test('categoryColor and isCategory', () => {
  assert.equal(categoryColor('sell'), 'var(--cat-sell)');
  assert.ok(isCategory('escape'));
  assert.ok(!isCategory('nap'));
  assert.ok(!isCategory(''));
});

test('categoryRows keeps spec order and scales to the biggest category', () => {
  const h = { ...emptyCategoryHours(), build: 4, sell: 2 };
  const rows = categoryRows(h);
  assert.deepEqual(rows.map((r) => r.value), ['build', 'sell', 'ops', 'teach', 'rest', 'escape']);
  assert.equal(rows[0].share, 1);
  assert.equal(rows[1].share, 0.5);
  assert.equal(rows[2].share, 0);
  assert.equal(rows[1].label, 'Sell & talk');
  assert.ok(categoryRows(emptyCategoryHours()).every((r) => r.share === 0));
});

test('resolveWeek clamps to the current week and rejects junk', () => {
  assert.equal(resolveWeek(null, '2026-W44'), '2026-W44');
  assert.equal(resolveWeek('nope', '2026-W44'), '2026-W44');
  assert.equal(resolveWeek('2026-W40', '2026-W44'), '2026-W40');
  assert.equal(resolveWeek('2026-W50', '2026-W44'), '2026-W44');
  assert.equal(resolveWeek('2025-W52', '2026-W01'), '2025-W52');
});

test('canGoNext only for past weeks', () => {
  assert.ok(canGoNext('2026-W43', '2026-W44'));
  assert.ok(!canGoNext('2026-W44', '2026-W44'));
  assert.ok(canGoNext('2025-W52', '2026-W01'));
});

test('weekTitle and weekRangeLabel', () => {
  assert.equal(weekTitle('2026-W44', '2026-W44'), 'This week');
  assert.equal(weekTitle('2026-W43', '2026-W44'), 'Last week');
  assert.equal(weekTitle('2026-W42', '2026-W44'), 'Week of 12 Oct');
  assert.equal(weekTitle('2025-W52', '2026-W02'), 'Week of 22 Dec 2025');
  assert.equal(weekRangeLabel('2026-W44', 2026), 'Mon 26 Oct – Sun 1 Nov');
});

test('blocksByDay groups by Bangkok start date, newest first', () => {
  const log = [
    entry('a', '2026-10-26T02:00:00Z', '2026-10-26T03:00:00Z'),            // Mon 09:00–10:00
    entry('b', '2026-10-27T02:00:00Z', '2026-10-27T02:30:00Z'),            // Tue 09:00–09:30
    entry('c', '2026-10-27T06:00:00Z', '2026-10-27T07:30:00Z'),            // Tue 13:00–14:30
    entry('d', '2026-10-25T18:00:00Z', '2026-10-25T19:00:00Z'),            // Mon 01:00 BKK (still W44)
    entry('e', '2026-10-25T10:00:00Z', '2026-10-25T11:00:00Z'),            // Sun 17:00 BKK → W43
  ];
  const g = blocksByDay(log, '2026-W44');
  assert.deepEqual(g.map((x) => x.date), ['2026-10-27', '2026-10-26']);
  assert.deepEqual(g[0].entries.map((e) => e.id), ['c', 'b']);
  assert.equal(g[0].minutes, 120);
  assert.deepEqual(g[1].entries.map((e) => e.id), ['a', 'd']);
  assert.deepEqual(blocksByDay([], '2026-W44'), []);
});

test('blockRangeLabel shows Bangkok times and flags next-day ends', () => {
  assert.equal(blockRangeLabel(entry('a', '2026-10-26T02:00:00Z', '2026-10-26T03:30:00Z')), '09:00–10:30');
  assert.equal(blockRangeLabel(entry('a', '2026-10-26T16:00:00Z', '2026-10-26T18:15:00Z')), '23:00–01:15 (next day)');
});

test('overlapping finds intersecting blocks and ignores touching or excluded ones', () => {
  const log = [
    entry('a', '2026-10-26T02:00:00Z', '2026-10-26T03:00:00Z'),
    entry('b', '2026-10-26T03:00:00Z', '2026-10-26T04:00:00Z'),
  ];
  assert.deepEqual(overlapping(log, '2026-10-26T02:30:00Z', '2026-10-26T02:45:00Z').map((e) => e.id), ['a']);
  assert.deepEqual(overlapping(log, '2026-10-26T01:00:00Z', '2026-10-26T02:00:00Z'), []);
  assert.deepEqual(overlapping(log, '2026-10-26T02:30:00Z', '2026-10-26T03:30:00Z', 'a').map((e) => e.id), ['b']);
  assert.deepEqual(overlapping(log, 'bad', 'bad'), []);
});

test('validateBlock: happy path builds Bangkok instants and trims the note', () => {
  const r = validateBlock({ category: 'sell', date: '2026-10-28', start: '09:00', end: '10:30', note: '  calls ' }, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value, { category: 'sell', start: '2026-10-28T02:00:00.000Z', end: '2026-10-28T03:30:00.000Z', note: 'calls' });
  assert.equal(r.minutes, 90);
  assert.equal(r.endsNextDay, false);
});

test('validateBlock: empty note is omitted', () => {
  const r = validateBlock({ category: 'ops', date: '2026-10-28', start: '09:00', end: '10:00', note: '   ' }, NOW);
  assert.ok(r.ok && !('note' in r.value));
});

test('validateBlock: end before start runs past midnight', () => {
  const r = validateBlock({ category: 'build', date: '2026-10-26', start: '23:00', end: '01:30', note: '' }, NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.endsNextDay, true);
  assert.equal(r.minutes, 150);
  assert.equal(r.value.end, '2026-10-26T18:30:00.000Z');
});

test('validateBlock: errors for missing fields, equal times, long spans and the future', () => {
  const missing = validateBlock({ category: '', date: '', start: '', end: '9:00', note: '' }, NOW);
  assert.ok(!missing.ok);
  if (!missing.ok) assert.deepEqual(Object.keys(missing.errors).sort(), ['category', 'date', 'end', 'start']);

  const same = validateBlock({ category: 'build', date: '2026-10-28', start: '09:00', end: '09:00', note: '' }, NOW);
  assert.ok(!same.ok && same.errors.end);

  const long = validateBlock({ category: 'build', date: '2026-10-27', start: '06:00', end: '23:30', note: '' }, NOW);
  assert.ok(!long.ok && /16 hours/.test(long.errors.end ?? ''));

  const future = validateBlock({ category: 'build', date: '2026-10-28', start: '18:00', end: '20:00', note: '' }, NOW);
  assert.ok(!future.ok && /future/.test(future.errors.end ?? ''));

  const badDate = validateBlock({ category: 'build', date: '2026-02-30', start: '09:00', end: '10:00', note: '' }, NOW);
  assert.ok(!badDate.ok && badDate.errors.date);
});

test('blockDurationHint', () => {
  assert.equal(blockDurationHint({ date: '2026-10-28', start: '09:00', end: '10:30' }), '1h 30m');
  assert.equal(blockDurationHint({ date: '2026-10-28', start: '23:30', end: '00:15' }), '45m · ends next day');
  assert.equal(blockDurationHint({ date: '2026-10-28', start: '09:00', end: '09:00' }), '');
  assert.equal(blockDurationHint({ date: '2026-10-28', start: '', end: '10:00' }), '');
});

test('entryToInput round-trips through validateBlock', () => {
  const e = entry('x', '2026-10-26T16:00:00Z', '2026-10-26T18:15:00Z', { category: 'teach', note: 'class' });
  const input = entryToInput(e);
  assert.deepEqual(input, { category: 'teach', date: '2026-10-26', start: '23:00', end: '01:15', note: 'class' });
  const r = validateBlock(input, NOW);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { category: 'teach', start: '2026-10-26T16:00:00.000Z', end: '2026-10-26T18:15:00.000Z', note: 'class' });
});

test('applyEdit keeps exact instants when the times are untouched', () => {
  // A timer entry with seconds, run for 18h (longer than manual entries allow).
  const e = entry('x', '2026-10-26T01:00:12.345Z', '2026-10-26T19:00:40.000Z', { category: 'build' });
  const input = { ...entryToInput(e), category: 'sell' as const, note: ' renamed ' };
  const r = applyEdit(e, input, NOW);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { category: 'sell', start: e.start, end: e.end, note: 'renamed' });

  const changed = applyEdit(e, { ...entryToInput(e), end: '09:00' }, NOW);
  assert.ok(changed.ok);
  if (changed.ok) assert.equal(changed.value.start, '2026-10-26T01:00:00.000Z');

  const noCat = applyEdit(e, { ...entryToInput(e), category: '' }, NOW);
  assert.ok(!noCat.ok && noCat.errors.category);
});

test('defaultBlockInput is the hour that just ended, rounded to 5 minutes', () => {
  const d = defaultBlockInput(new Date('2026-10-28T12:03:40Z'), 'sell'); // 19:03 BKK
  assert.deepEqual(d, { category: 'sell', date: '2026-10-28', start: '18:00', end: '19:00', note: '' });
  const early = defaultBlockInput(new Date('2026-10-27T17:20:00Z')); // 00:20 BKK on the 28th
  assert.deepEqual(early, { category: 'build', date: '2026-10-27', start: '23:20', end: '00:20', note: '' });
  const r = validateBlock(early, new Date('2026-10-27T17:20:00Z'));
  assert.ok(r.ok && r.endsNextDay && r.minutes === 60);
});

test('defaultDateForWeek', () => {
  assert.equal(defaultDateForWeek('2026-W44', '2026-10-28'), '2026-10-28');
  assert.equal(defaultDateForWeek('2026-W43', '2026-10-28'), '2026-10-25');
});

test('ratioSummary: calm copy, never shaming', () => {
  const none = ratioSummary(buildSellRatio({ build: 0, sell: 0 }), 0.5);
  assert.equal(none.tone, 'muted');
  assert.equal(none.valueText, 'No build or sell time yet');

  const heavy = ratioSummary(buildSellRatio({ build: 8, sell: 2 }), 0.5);
  assert.equal(heavy.tone, 'warn');
  assert.equal(heavy.valueText, '80% build · 20% sell');
  assert.match(heavy.text, /50% target/);

  const even = ratioSummary(buildSellRatio({ build: 5, sell: 5 }), 0.5);
  assert.equal(even.tone, 'good');
  assert.match(even.text, /target/i);

  const selling = ratioSummary(buildSellRatio({ build: 1, sell: 9 }), 0.5);
  assert.equal(selling.tone, 'good');

  const edge = ratioSummary(buildSellRatio({ build: 6, sell: 4 }), 0.5);
  assert.equal(edge.tone, 'good');
});

test('stopMessage', () => {
  assert.equal(stopMessage(null), 'Under a minute — not logged.');
  assert.equal(stopMessage({ category: 'sell', start: '2026-10-28T02:00:00Z', end: '2026-10-28T03:05:00Z' }), 'Logged 1h 05m of Sell & talk.');
});

test('forgotten timer: stop time defaults to the timebox end; without one, only the day (never the 16h cap)', () => {
  const now = new Date('2026-10-28T02:00:00Z'); // 09:00 BKK Wed
  const boxed = { startedAt: '2026-10-27T00:00:00Z', timeboxMin: 90 }; // 07:00 BKK Tue
  assert.deepEqual(stopTimeDefault(boxed, now), { date: '2026-10-27', time: '08:30' });
  // B1: a Sell timer from Tue 07:00 must not come prefilled with Tue 23:00 (16 h). He picks the time.
  const open = { startedAt: '2026-10-27T00:00:00Z' };
  const v = stopTimeDefault(open, now);
  assert.deepEqual(v, { date: '2026-10-27', time: '' });
  const r = validateStopTime(open, v, now);
  assert.ok(!r.ok && r.error === 'Pick a date and a time.', 'one tap on the prefill is refused');
  // A box that hasn't ended yet: never later than now.
  assert.deepEqual(stopTimeDefault({ startedAt: '2026-10-28T01:00:00Z', timeboxMin: 240 }, now), { date: '2026-10-28', time: '09:00' });
});

test('forgotten timer: the stop time follows the manual-block rules', () => {
  const now = new Date('2026-10-28T02:00:00Z'); // 09:00 BKK Wed
  const t = { startedAt: '2026-10-27T00:00:00Z' }; // 07:00 BKK Tue
  const ok = validateStopTime(t, { date: '2026-10-27', time: '08:30' }, now);
  assert.ok(ok.ok);
  assert.equal(ok.end.toISOString(), '2026-10-27T01:30:00.000Z');
  assert.equal(ok.minutes, 90);
  const before = validateStopTime(t, { date: '2026-10-27', time: '06:59' }, now);
  assert.ok(!before.ok && /before the timer started/.test(before.error));
  const tooLong = validateStopTime(t, { date: '2026-10-28', time: '00:00' }, now);
  assert.ok(!tooLong.ok && /over 16 hours/.test(tooLong.error));
  const future = validateStopTime({ startedAt: '2026-10-28T01:00:00Z' }, { date: '2026-10-28', time: '10:00' }, now);
  assert.ok(!future.ok && /future/.test(future.error));
  const bad = validateStopTime(t, { date: '', time: '08:30' }, now);
  assert.ok(!bad.ok);
});

test('forgotten timer: a stop time under a minute after the start is refused, not silently dropped (B8)', () => {
  const now = new Date('2026-10-28T02:00:00Z');
  const t = { startedAt: '2026-10-28T01:00:30Z' }; // 08:00:30 BKK
  const tooShort = validateStopTime(t, { date: '2026-10-28', time: '08:01' }, now);
  assert.ok(!tooShort.ok && /under a minute/.test(tooShort.error));
  const ok = validateStopTime(t, { date: '2026-10-28', time: '08:02' }, now);
  assert.ok(ok.ok);
  assert.equal(ok.minutes, 1.5);
});

test('overlapping can include the running timer (B4: saving over it warns)', () => {
  const now = new Date('2026-10-28T03:00:00Z');
  const timer = { category: 'build' as const, startedAt: '2026-10-28T02:00:00Z' };
  const log = [entry('a', '2026-10-28T00:00:00Z', '2026-10-28T01:00:00Z')];
  const hit = overlapping(log, '2026-10-28T02:30:00Z', '2026-10-28T02:45:00Z', undefined, { timer, now });
  assert.deepEqual(hit.map((e) => e.id), [RUNNING_TIMER_ID]);
  assert.equal(hit[0].end, now.toISOString());
  assert.deepEqual(overlapping(log, '2026-10-28T03:10:00Z', '2026-10-28T03:20:00Z', undefined, { timer, now }), [], 'after now: no overlap');
  assert.deepEqual(overlapping(log, '2026-10-28T02:30:00Z', '2026-10-28T02:45:00Z'), [], 'without the timer: as before');
  assert.equal(overlapNote(hit), 'It overlaps the running timer.');
  assert.equal(overlapNote([log[0]]), 'It overlaps another block.');
  assert.equal(overlapNote([]), '');
});

test('timebox banner copy', () => {
  assert.equal(timeboxBannerText({ timeboxMin: 90 }), 'Your 90 minutes are up. What moved?');
  assert.equal(timeboxBannerText({ timeboxMin: 60 }), 'Your 1 hour is up. What moved?');
  assert.equal(timeboxBannerText({ timeboxMin: 120 }), 'Your 2 hours are up. What moved?');
  assert.equal(timeboxBannerText({ timeboxMin: 10 }), 'Your 10 minutes are up. What moved?');
});
