import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FunnelRow } from '../core/types.ts';
import {
  CASH_SCALE_MAX, FUNNEL_NUMBER_KEYS, bottleneckLine, cashMissing, cashView, emptyNums, firstErrorField,
  formatCount, joinList, missingStages, moneyFacts, parseFunnelForm, parseFunnelNumber, previewLine,
  REFERRAL_GOAL, REFERRAL_KILL, VERIFIED_TEST_GOAL, VERIFIED_TEST_KILL, referralNotice,
  rowSubtitle, rowToForm, rowsNewestFirst, stageItems, trendGap, trendSeries, trendSummary, trendTone, trendUntracked,
} from './funnel.logic.ts';
import type { FunnelForm } from './funnel.logic.ts';

// Made-up numbers shaped like the seeded cohorts (real figures stay out of this public repo).
const shift2: FunnelRow = {
  id: 'r2', label: 'SHIFT[2]', period: 'cohort', date: '2026-10-14',
  paid: 20, verifiedTest: 1, revenueThb: 12000, costThb: 3000, founderHours: 60,
};
const shift1: FunnelRow = { id: 'r1', label: 'SHIFT[1]', period: 'cohort', date: '2026-10-05', verifiedTest: 3 };

test('parseFunnelNumber: empty is unknown, not zero', () => {
  assert.deepEqual(parseFunnelNumber('', true), {});
  assert.deepEqual(parseFunnelNumber('   ', true), {});
  assert.deepEqual(parseFunnelNumber('0', true), { value: 0 });
});

test('parseFunnelNumber: accepts commas, baht sign and decimals where allowed', () => {
  assert.deepEqual(parseFunnelNumber('1,200', true), { value: 1200 });
  assert.deepEqual(parseFunnelNumber('฿9,250', false), { value: 9250 });
  assert.deepEqual(parseFunnelNumber('60.5', false), { value: 60.5 });
  assert.deepEqual(parseFunnelNumber('.5', false), { value: 0.5 });
});

test('parseFunnelNumber: rejects junk, negatives and fractions of people', () => {
  assert.ok(parseFunnelNumber('abc', true).error);
  assert.ok(parseFunnelNumber('0x10', true).error);
  assert.ok(parseFunnelNumber('1e3', true).error);
  assert.match(parseFunnelNumber('-3', false).error ?? '', /below zero/);
  assert.match(parseFunnelNumber('2.5', true).error ?? '', /Whole/);
});

test('rowToForm: blank form defaults and round trip keeps unknowns empty', () => {
  const blank = rowToForm(undefined, '2026-10-28');
  assert.equal(blank.label, '');
  assert.equal(blank.period, 'cohort');
  assert.equal(blank.date, '2026-10-28');
  assert.ok(FUNNEL_NUMBER_KEYS.every((k) => blank.nums[k] === ''));

  const f = rowToForm(shift2, '2026-10-28');
  assert.equal(f.nums.paid, '20');
  assert.equal(f.nums.reach, '');
  const back = parseFunnelForm(f);
  assert.equal(back.ok, true);
  const { id: _id, ...rest } = shift2;
  assert.deepEqual(back.row, rest);
  assert.equal('reach' in back.row, false);
});

test('parseFunnelForm: requires a label and reports field errors', () => {
  const form: FunnelForm = { label: '  ', period: 'week', date: 'nope', note: '', nums: { ...emptyNums(), paid: '2.5', costThb: 'x' } };
  const r = parseFunnelForm(form);
  assert.equal(r.ok, false);
  assert.ok(r.errors.label);
  assert.ok(r.errors.date);
  assert.ok(r.errors.paid);
  assert.ok(r.errors.costThb);
  assert.equal(firstErrorField(r.errors), 'label');
  assert.equal(firstErrorField({ costThb: 'x', paid: 'y' }), 'paid');
  assert.equal(firstErrorField({}), null);
});

test('parseFunnelForm: trims, keeps zero, drops empty date and note', () => {
  const r = parseFunnelForm({ label: ' Week 44 ', period: 'week', date: '', note: '  ', nums: { ...emptyNums(), reach: '0', clicks: '' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.row, { label: 'Week 44', period: 'week', reach: 0 });
});

test('stageItems: known stages with steps between, bottleneck flagged', () => {
  const row: FunnelRow = { id: 'x', label: 'x', period: 'cohort', reach: 1000, clicks: 100, paid: 10, verifiedTest: 5 };
  const items = stageItems(row);
  assert.deepEqual(items.map((i) => i.kind), ['stage', 'step', 'stage', 'step', 'stage', 'step', 'stage']);
  const steps = items.filter((i) => i.kind === 'step');
  assert.deepEqual(steps.map((s) => s.kind === 'step' && s.text), ['10%', '10%', '50%']);
  // ties → first one wins
  assert.deepEqual(steps.map((s) => s.kind === 'step' && s.bottleneck), [true, false, false]);
  assert.match((steps[0] as { srText: string }).srText, /Reach to Link clicks, the bottleneck/);
});

test('stageItems: zero "from" gives an unknown rate, never a bottleneck', () => {
  const row: FunnelRow = { id: 'x', label: 'x', period: 'cohort', applied: 0, paid: 0, finished: 0 };
  const steps = stageItems(row).filter((i) => i.kind === 'step');
  assert.equal(steps.length, 2);
  for (const s of steps) {
    assert.equal(s.kind === 'step' && s.rate, null);
    assert.equal(s.kind === 'step' && s.bottleneck, false);
    assert.equal(s.kind === 'step' && s.text, '—');
  }
  assert.equal((steps[0] as { srText: string }).srText, 'Applied is 0, so there’s no rate to Paid.');
  assert.equal(bottleneckLine(row), 'Applied is 0, so there’s no rate after it.', 'a typed 0 is not "missing"');
});

test('stageItems / missingStages / bottleneckLine on seed-like rows', () => {
  assert.equal(stageItems(shift1).length, 1);
  assert.equal(bottleneckLine(shift1), 'Add one more stage to see a conversion.');
  assert.equal(bottleneckLine({ id: 'e', label: 'e', period: 'week' }), 'No stage numbers yet.');
  assert.equal(bottleneckLine(shift2), 'Biggest drop: Paid → Verified real-user test, 5%.');
  assert.equal(missingStages(shift2).length, 6);
  assert.ok(!missingStages(shift2).includes('Paid'));
});

test('cashView: SHIFT[2] sits above the floor, under target', () => {
  const c = cashView(shift2);
  assert.equal(c.band, 'above-floor');
  assert.equal(c.tone, 'data');
  assert.equal(c.value, '฿150/h');
  assert.ok(Math.abs(c.fill - (12000 - 3000) / 60 / CASH_SCALE_MAX) < 1e-9);
  assert.equal(c.floorAt, 130 / CASH_SCALE_MAX);
  assert.equal(c.targetAt, 300 / CASH_SCALE_MAX);
  assert.match(c.copy, /Above the ฿130 floor/);
});

test('cashView: bands, clamping and unknowns', () => {
  const below = cashView({ id: 'a', label: 'a', period: 'cohort', revenueThb: 1000, costThb: 2000, founderHours: 10 });
  assert.equal(below.band, 'below-floor');
  assert.equal(below.tone, 'warn');
  assert.equal(below.fill, 0);
  const high = cashView({ id: 'b', label: 'b', period: 'cohort', revenueThb: 50000, costThb: 0, founderHours: 10 });
  assert.equal(high.band, 'on-target');
  assert.equal(high.fill, 1);
  const unknown = cashView({ id: 'c', label: 'c', period: 'cohort', revenueThb: 1000 });
  assert.equal(unknown.perHour, null);
  assert.equal(unknown.copy, 'Add costs and founder hours to see this.');
  const zeroHours = cashView({ id: 'd', label: 'd', period: 'cohort', revenueThb: 1, costThb: 0, founderHours: 0 });
  assert.equal(zeroHours.perHour, null);
  assert.match(zeroHours.copy, /Founder hours is 0/);
  assert.deepEqual(cashMissing(shift1), ['revenue', 'costs', 'founder hours']);
});

test('trendSeries: oldest first, with a hint when a rate is unknown', () => {
  const v = trendSeries([shift2, shift1], 'verified');
  assert.deepEqual(v.map((p) => p.id), ['r1', 'r2']);
  assert.equal(v[0].value, null);
  assert.equal(v[0].missing, 'Add finished or paid.');
  assert.equal(v[0].gap, 'unknown');
  assert.equal(v[1].value, 1 / 20);
  assert.equal(v[1].missing, null);
  assert.equal(v[1].gap, null);
  const r = trendSeries([shift2], 'referral');
  assert.equal(r[0].missing, 'Add referral applies.');
  const r2 = trendSeries([{ ...shift1, referralApplied: 2 }], 'referral');
  assert.equal(r2[0].missing, 'Add applied or paid.');
});

test('a typed 0 denominator says "is 0, so there’s no rate", not "Add …" (B9)', () => {
  const base: FunnelRow = { id: 'z', label: 'Z', period: 'cohort', verifiedTest: 0, referralApplied: 0 };
  assert.deepEqual(trendGap({ ...base, finished: 0 }, 'verified'), { gap: 'zero', text: 'Finished is 0, so there’s no rate.' });
  // Finished is preferred: a 0 there means no rate even when paid is known.
  assert.deepEqual(trendGap({ ...base, finished: 0, paid: 12 }, 'verified'), { gap: 'zero', text: 'Finished is 0, so there’s no rate.' });
  assert.deepEqual(trendGap({ ...base, paid: 0 }, 'verified'), { gap: 'zero', text: 'Paid is 0, so there’s no rate.' });
  assert.deepEqual(trendGap({ ...base, applied: 0, paid: 4 }, 'referral'), { gap: 'zero', text: 'Applied is 0, so there’s no rate.' });
  assert.deepEqual(trendGap({ ...base, paid: 0 }, 'referral'), { gap: 'zero', text: 'Paid is 0, so there’s no rate.' });
  // "Add …" only when the numbers really are unknown.
  assert.deepEqual(trendGap(base, 'verified'), { gap: 'unknown', text: 'Add finished or paid.' });
  assert.deepEqual(trendGap(base, 'referral'), { gap: 'unknown', text: 'Add applied or paid.' });
  assert.deepEqual(trendGap({ id: 'n', label: 'n', period: 'cohort', finished: 0 }, 'verified').gap, 'zero', 'adding verified tests would not help');
  assert.deepEqual(trendGap({ id: 'n', label: 'n', period: 'cohort', finished: 5 }, 'verified'), { gap: 'unknown', text: 'Add verified tests.' });

  const pts = trendSeries([{ ...base, finished: 0 }], 'verified');
  assert.equal(pts[0].value, null);
  assert.equal(pts[0].missing, 'Finished is 0, so there’s no rate.');
  assert.equal(trendUntracked(pts), false, 'a 0 is tracked');
  assert.equal(trendUntracked(trendSeries([shift1], 'referral')), true);
  assert.equal(trendUntracked(trendSeries([shift1, shift2], 'verified')), false, 'one known point');
  assert.equal(trendUntracked([]), false);
});

test('trendTone: good at the goal, warn under the SHIFT kill line, data in between', () => {
  assert.equal(trendTone(1 / 20, VERIFIED_TEST_GOAL, VERIFIED_TEST_KILL), 'warn', 'SHIFT[2] at 5% is under the 30% kill line');
  assert.equal(trendTone(0.3, VERIFIED_TEST_GOAL, VERIFIED_TEST_KILL), 'data');
  assert.equal(trendTone(0.55, VERIFIED_TEST_GOAL, VERIFIED_TEST_KILL), 'data');
  assert.equal(trendTone(0.6, VERIFIED_TEST_GOAL, VERIFIED_TEST_KILL), 'good');
  assert.equal(trendTone(0.05, REFERRAL_GOAL, REFERRAL_KILL), 'warn');
  assert.equal(trendTone(0.1, REFERRAL_GOAL, REFERRAL_KILL), 'data');
  assert.equal(trendTone(0.2, REFERRAL_GOAL, REFERRAL_KILL), 'good');
});

test('referralNotice: flags an untracked or tiny referral share, quiet otherwise', () => {
  assert.equal(referralNotice([]), null);
  assert.match(referralNotice([shift1, shift2]) ?? '', /isn’t tracked on any row yet/);
  const zero = { ...shift2, referralApplied: 0 };
  assert.match(referralNotice([shift1, zero]) ?? '', /SHIFT\[2\] is 0%, under the 10% kill line/);
  const fine = { ...shift2, referralApplied: 5 };
  assert.equal(referralNotice([shift1, fine]), null, '5 of 20 = 25%');
  assert.equal(referralNotice([zero, { ...fine, id: 'r3', label: 'SHIFT[3]', date: '2026-11-01' }]), null, 'the latest known point counts');
  // Referral applies typed but applied/paid is 0: tracked, just no rate. Not "isn’t tracked".
  assert.equal(referralNotice([{ ...shift1, referralApplied: 0, applied: 0 }]), null);
});

test('trendSummary compares the last two known points', () => {
  const p = (value: number | null) => ({ id: String(value), label: 'x', value, missing: null, gap: null });
  assert.equal(trendSummary([p(0.1)]), null);
  assert.equal(trendSummary([p(0.0625), p(null), p(0.25)]), 'Up from 6% to 25%.');
  assert.equal(trendSummary([p(0.5), p(0.25)]), 'Down from 50% to 25%.');
  assert.equal(trendSummary([p(0.25), p(0.251)]), 'Steady at 25%.');
});

test('rowsNewestFirst, rowSubtitle, moneyFacts, formatting', () => {
  assert.deepEqual(rowsNewestFirst([shift1, shift2]).map((r) => r.id), ['r2', 'r1']);
  assert.equal(rowSubtitle(shift2), 'Cohort · Wed 14 Oct');
  assert.equal(rowSubtitle({ id: 'w', label: 'w', period: 'week' }), 'Week');
  assert.deepEqual(moneyFacts(shift2).map((f) => f.value), ['฿12,000', '฿3,000', '60h']);
  assert.deepEqual(moneyFacts(shift1).map((f) => f.value), ['—', '—', '—']);
  assert.equal(formatCount(1200), '1,200');
  assert.equal(joinList(['a']), 'a');
  assert.equal(joinList(['a', 'b', 'c']), 'a, b and c');
});

test('previewLine summarises bottleneck and cash', () => {
  const { id: _id, ...input } = shift2;
  assert.equal(previewLine(input), 'Biggest drop: Paid → Verified real-user test, 5%. Cash per founder hour: ฿150/h.');
  assert.equal(previewLine({ label: '', period: 'cohort' }), 'No stage numbers yet.');
});
