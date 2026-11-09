import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOURLY_RATE_MAX, applyHourlyRate, hourlyRateIssue, hourlyRateText, hourlyRatesReady, parseHourlyRate,
  ratesFromProfile,
} from './rates.ts';

test('parseHourlyRate: blank clears, baht and commas are accepted, junk is not', () => {
  assert.deepEqual(parseHourlyRate(''), { ok: true, value: undefined });
  assert.deepEqual(parseHourlyRate('  '), { ok: true, value: undefined });
  assert.deepEqual(parseHourlyRate('฿1,250'), { ok: true, value: 1250 });
  assert.deepEqual(parseHourlyRate('80.5'), { ok: true, value: 80.5 });
  assert.deepEqual(parseHourlyRate('.5'), { ok: true, value: 0.5 });
  assert.deepEqual(parseHourlyRate('0'), { ok: true, value: 0 });
  assert.equal(parseHourlyRate('-5').ok, false);
  assert.equal(parseHourlyRate('1e3').ok, false);
  assert.equal(parseHourlyRate('12.345').ok, false);
  assert.equal(parseHourlyRate('abc').ok, false);
  assert.equal(parseHourlyRate(String(HOURLY_RATE_MAX + 1)).ok, false);
  assert.deepEqual(parseHourlyRate(String(HOURLY_RATE_MAX)), { ok: true, value: HOURLY_RATE_MAX });
});

test('applyHourlyRate writes and clears a profile field', () => {
  const profile: { hourlyFloorThb?: number; hourlyTargetThb?: number } = {};
  assert.equal(applyHourlyRate(profile, 'hourlyFloorThb', '100'), null);
  assert.equal(applyHourlyRate(profile, 'hourlyTargetThb', '250'), null);
  assert.deepEqual(profile, { hourlyFloorThb: 100, hourlyTargetThb: 250 });
  assert.equal(applyHourlyRate(profile, 'hourlyFloorThb', ''), null);
  assert.equal(profile.hourlyFloorThb, undefined);
  assert.equal(applyHourlyRate(profile, 'hourlyTargetThb', 'nope'), 'Use a number, or leave it blank.');
  assert.equal(profile.hourlyTargetThb, 250);
});

test('a range is ready only when the target sits above the floor', () => {
  assert.equal(hourlyRatesReady(undefined, undefined), false);
  assert.equal(hourlyRatesReady(100, undefined), false);
  assert.equal(hourlyRatesReady(100, 100), false);
  assert.equal(hourlyRatesReady(200, 100), false);
  assert.equal(hourlyRatesReady(100, 250), true);
  assert.equal(hourlyRateIssue(200, 100), 'The target should be above the floor.');
  assert.equal(hourlyRateIssue(100, 250), null);
  assert.equal(hourlyRateIssue(undefined, 250), null);
  assert.equal(hourlyRateText(undefined), '');
  assert.equal(hourlyRateText(80), '80');
  assert.deepEqual(ratesFromProfile({ hourlyFloorThb: 80 }), { floor: 80, target: undefined });
  assert.deepEqual(ratesFromProfile(undefined), {});
});
