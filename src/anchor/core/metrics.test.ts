import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnchorState, Bet, EscapeCheck, FunnelRow, Talk, TimeEntry } from './types.ts';
import {
  activeBetCount, anchorsInWeek, buildSellRatio, canActivateBet, cashBand, cashPerFounderHour, coveredMs, entryMinutes,
  escapeDateReason, escapeParkReasons, escapeReasons, escapeSessionHours, escapesThisWeek, escapeVerdict, formatPercent,
  formatThb, funnelBottleneck, funnelConversions, hoursByCategory, isReviewOverdue, latestFunnelRow, msUntilTimebox,
  nextBetReviewDue, referralShare, runningTimerMs, sortFunnelRows, talksThisWeek, timerCapMs, timerElapsedMs,
  timerOverCap, timerOverrunMin, timerPastTimebox, totalHours, verifiedTestRate, weekSnapshot, wipStatus,
} from './metrics.ts';
import { emptyState } from './seed.ts';

const TODAY = '2026-10-28';
const WK = '2026-W44';

function bet(id: string, status: Bet['status'], reviewOn = '2026-12-01'): Bet {
  return {
    id, name: id, hypothesis: '', metric: '', continueIf: '', killIf: '', reviewOn, status, notes: '',
    createdAt: '2026-10-01T00:00:00.000Z', decisions: [],
  };
}

function entry(category: TimeEntry['category'], start: string, minutes: number): TimeEntry {
  const s = new Date(start);
  return { id: `${category}-${start}`, category, start: s.toISOString(), end: new Date(s.getTime() + minutes * 60_000).toISOString() };
}

// ------------------------------------------------------------------ time

test('entryMinutes ignores invalid or negative spans', () => {
  assert.equal(entryMinutes({ start: '2026-10-28T01:00:00Z', end: '2026-10-28T02:30:00Z' }), 90);
  assert.equal(entryMinutes({ start: '2026-10-28T02:00:00Z', end: '2026-10-28T01:00:00Z' }), 0);
  assert.equal(entryMinutes({ start: 'x', end: '2026-10-28T01:00:00Z' }), 0);
});

test('hoursByCategory counts only the given Bangkok ISO week', () => {
  const log = [
    entry('build', '2026-10-27T02:00:00Z', 120),
    entry('build', '2026-10-28T02:00:00Z', 60),
    entry('sell', '2026-10-28T05:00:00Z', 90),
    entry('escape', '2026-10-29T05:00:00Z', 30),
    entry('build', '2026-10-25T16:30:00Z', 60), // Sun 25 Oct 23:30 BKK → previous week
    entry('sell', '2026-11-01T17:30:00Z', 60),  // Mon 2 Nov 00:30 BKK → next week
  ];
  const h = hoursByCategory(log, WK);
  assert.equal(h.build, 3);
  assert.equal(h.sell, 1.5);
  assert.equal(h.escape, 0.5);
  assert.equal(h.ops, 0);
  assert.equal(totalHours(h), 5);
});

test('hoursByCategory can include the running timer', () => {
  const now = new Date('2026-10-28T03:00:00Z');
  const h = hoursByCategory([], WK, { activeTimer: { category: 'sell', startedAt: '2026-10-28T02:00:00Z' }, now });
  assert.equal(h.sell, 1);
});

test('timer cap: a time-boxed timer gets its box + 30 min, an open one 16 hours', () => {
  assert.equal(timerCapMs({}), 16 * 3_600_000);
  assert.equal(timerCapMs({ timeboxMin: 90 }), 120 * 60_000);
  assert.equal(timerCapMs({ timeboxMin: 10 }), 40 * 60_000);
  assert.equal(timerCapMs({ timeboxMin: 1000 }), 1030 * 60_000);
  const t = { category: 'build' as const, startedAt: '2026-10-27T00:00:00Z', timeboxMin: 90 };
  assert.equal(timerOverCap(t, new Date('2026-10-27T02:00:00Z')), false, 'exactly box + 30 min');
  assert.equal(timerOverCap(t, new Date('2026-10-27T02:01:00Z')), true);
  const open = { category: 'sell' as const, startedAt: '2026-10-27T00:00:00Z' };
  assert.equal(timerOverCap(open, new Date('2026-10-27T15:59:00Z')), false);
  assert.equal(timerOverCap(open, new Date('2026-10-27T16:01:00Z')), true);
});

test('a time-boxed timer left running for hours stops counting at its box + 30 min (B1)', () => {
  // "Go anyway (90 min)" at 08:30 BKK, back 5 hours later: the week holds nothing past the cap.
  const t = { category: 'escape' as const, startedAt: '2026-10-28T01:30:00Z', timeboxMin: 90, source: 'escape' as const };
  const later = new Date('2026-10-28T06:30:00Z');
  assert.equal(runningTimerMs([], t, later), 0);
  assert.equal(hoursByCategory([], WK, { activeTimer: t, now: later }).escape, 0);
  assert.equal(escapeSessionHours([], WK, { activeTimer: t, now: later }).hours, 0);
  // Inside the grace it still counts live.
  assert.equal(hoursByCategory([], WK, { activeTimer: t, now: new Date('2026-10-28T03:30:00Z') }).escape, 2);
});

test('hoursByCategory leaves out a running timer past its cap (B1: a review never stores the cap as hours)', () => {
  // Escape-check Go at 07:00 BKK Tue, app closed, back 26h later: nothing counts until Stop asks when it ended.
  const t = { category: 'build' as const, startedAt: '2026-10-27T00:00:00Z', timeboxMin: 90 };
  const h = hoursByCategory([], WK, { activeTimer: t, now: new Date('2026-10-28T02:00:00Z') });
  assert.equal(h.build, 0);
  const s: AnchorState = emptyState(new Date('2026-10-28T02:00:00Z'));
  s.activeTimer = t;
  assert.equal(weekSnapshot(s, WK, new Date('2026-10-28T02:00:00Z'))['hours.build'], 0);
});

test('a manual block over the running timer counts once (B4)', () => {
  const now = new Date('2026-10-28T03:00:00Z');
  const timer = { category: 'build' as const, startedAt: '2026-10-28T01:00:00Z' };
  const log = [
    entry('build', '2026-10-28T01:30:00Z', 60), // 01:30–02:30 overlaps the timer
    entry('sell', '2026-10-28T02:00:00Z', 30),  // 02:00–02:30 overlaps that block too (counted once)
  ];
  assert.equal(runningTimerMs(log, timer, now), 60 * 60_000, '2h running minus the 1h already logged');
  const h = hoursByCategory(log, WK, { activeTimer: timer, now });
  assert.equal(h.build, 2, '1h logged + 1h of the timer not covered by a block');
  assert.equal(h.sell, 0.5);
  assert.equal(coveredMs([], 0, 10), 0);
  assert.equal(coveredMs(log, Date.parse('2026-10-28T00:00:00Z'), Date.parse('2026-10-28T02:00:00Z')), 30 * 60_000);
});

test('timebox helpers for the "time is up" banner', () => {
  const t = { startedAt: '2026-10-28T01:00:00Z', timeboxMin: 90 };
  assert.equal(timerPastTimebox(t, new Date('2026-10-28T02:29:00Z')), false);
  assert.equal(timerPastTimebox(t, new Date('2026-10-28T02:30:00Z')), true);
  assert.equal(timerPastTimebox({ startedAt: t.startedAt }, new Date('2026-10-29T00:00:00Z')), false);
  assert.equal(msUntilTimebox(t, new Date('2026-10-28T02:00:00Z')), 30 * 60_000);
  assert.equal(msUntilTimebox(t, new Date('2026-10-28T03:00:00Z')), 0);
  assert.equal(msUntilTimebox({ startedAt: t.startedAt }), null);
});

test('escapeSessionHours: "of which via escape check", running session included', () => {
  const log: TimeEntry[] = [
    { ...entry('build', '2026-10-27T02:00:00Z', 90), source: 'escape' },
    { ...entry('escape', '2026-10-27T05:00:00Z', 60), source: 'escape', overridden: true },
    entry('build', '2026-10-27T08:00:00Z', 60),
    { ...entry('build', '2026-10-20T02:00:00Z', 60), source: 'escape' }, // last week
  ];
  const now = new Date('2026-10-28T03:30:00Z');
  const running = { category: 'build' as const, startedAt: '2026-10-28T03:00:00Z', source: 'escape' as const };
  const v = escapeSessionHours(log, WK, { activeTimer: running, now });
  assert.equal(v.hours, 3);
  assert.equal(v.overriddenHours, 1);
  assert.equal(v.sessions, 3);
  assert.equal(v.byCategory.build, 2);
  assert.equal(v.byCategory.escape, 1);
  const s: AnchorState = emptyState(now);
  s.timeLog = log;
  const snap = weekSnapshot(s, WK, now);
  assert.equal(snap.viaEscapeHours, 2.5);
  assert.equal(snap.viaEscapeOverriddenHours, 1);
  assert.equal(snap.viaEscapeSessions, 2);
});

test('buildSellRatio', () => {
  assert.deepEqual(buildSellRatio({ build: 0, sell: 0 }), { build: 0, sell: 0, total: 0, buildShare: null, sellShare: null });
  const r = buildSellRatio({ build: 3, sell: 1 });
  assert.equal(r.total, 4);
  assert.equal(r.buildShare, 0.75);
  assert.equal(r.sellShare, 0.25);
});

test('timer elapsed and overrun', () => {
  const t = { category: 'build' as const, startedAt: '2026-10-28T01:00:00Z', timeboxMin: 90 };
  assert.equal(timerElapsedMs(t, new Date('2026-10-28T01:30:00Z')), 30 * 60_000);
  assert.equal(timerOverrunMin(t, new Date('2026-10-28T02:00:00Z')), 0);
  assert.equal(timerOverrunMin(t, new Date('2026-10-28T03:00:00Z')), 30);
  assert.equal(timerOverrunMin({ category: 'build', startedAt: t.startedAt }, new Date('2026-10-29T00:00:00Z')), 0);
});

// ------------------------------------------------------------- weekly counts

test('talksThisWeek and escapesThisWeek', () => {
  const talks = [
    { date: '2026-10-26' }, { date: '2026-11-01' }, { date: '2026-11-02' }, { date: '2026-10-25' },
  ] as Talk[];
  assert.equal(talksThisWeek(talks, WK), 2);
  const escapes = [
    { at: '2026-10-27T05:00:00Z', verdict: 'go' },
    { at: '2026-10-28T05:00:00Z', verdict: 'park' },
    { at: '2026-10-28T06:00:00Z', verdict: 'park' },
    { at: '2026-10-20T06:00:00Z', verdict: 'go' },
  ] as EscapeCheck[];
  assert.deepEqual(escapesThisWeek(escapes, WK), { go: 1, park: 2, total: 3 });
});

test('anchorsInWeek counts non-empty anchors and done ones', () => {
  const days = {
    '2026-10-26': { date: '2026-10-26', actions: [], anchor: { text: 'Call 3 parents', done: true } },
    '2026-10-27': { date: '2026-10-27', actions: [], anchor: { text: '  ', done: false } },
    '2026-10-28': { date: '2026-10-28', actions: [], anchor: { text: 'Post Day-6 recap', done: false } },
    '2026-10-20': { date: '2026-10-20', actions: [], anchor: { text: 'old', done: true } },
  };
  assert.deepEqual(anchorsInWeek(days, WK), { set: 2, done: 1 });
});

// --------------------------------------------------------------------- funnel

// Made-up numbers (real cohort figures live only in the private start file, never in this public repo).
const SHIFT2: FunnelRow = {
  id: 'f2', label: 'SHIFT[2]', period: 'cohort', paid: 20, verifiedTest: 2, revenueThb: 12000, costThb: 3000, founderHours: 60,
};

test('funnelConversions skips empty stages (unknown ≠ zero)', () => {
  const c = funnelConversions(SHIFT2);
  assert.equal(c.length, 1);
  assert.equal(c[0].from, 'paid');
  assert.equal(c[0].to, 'verifiedTest');
  assert.equal(c[0].rate, 2 / 20);
  assert.deepEqual(funnelConversions({ id: 'x', label: 'x', period: 'week', verifiedTest: 4 }), []);
});

test('funnelBottleneck = lowest conversion; zero denominators are skipped', () => {
  const row: FunnelRow = {
    id: 'r', label: 'r', period: 'week',
    reach: 1000, clicks: 100, applied: 40, paid: 20, finished: 18, verifiedTest: 3, posts: 0, referralApplied: 2,
  };
  const b = funnelBottleneck(row);
  assert.ok(b);
  assert.equal(b.from, 'verifiedTest');
  assert.equal(b.to, 'posts');
  assert.equal(b.rate, 0);
  const conv = funnelConversions(row);
  assert.equal(conv.at(-1)?.rate, null); // posts (0) → referrals: no rate
  assert.equal(funnelBottleneck({ id: 'e', label: 'e', period: 'week' }), null);
  assert.equal(funnelBottleneck({ id: 'z', label: 'z', period: 'week', reach: 0, clicks: 5 }), null);
});

test('funnelBottleneck picks the first of equal lowest rates', () => {
  const b = funnelBottleneck({ id: 't', label: 't', period: 'week', reach: 100, clicks: 50, applied: 25 });
  assert.equal(b?.from, 'reach');
});

test('cashPerFounderHour and cash bands', () => {
  const v = cashPerFounderHour(SHIFT2);
  assert.ok(v !== null);
  assert.ok(Math.abs(v - 9000 / 60) < 1e-9);
  assert.equal(Math.round(v), 150);
  assert.equal(cashBand(v), 'above-floor');
  assert.equal(cashBand(129.99), 'below-floor');
  assert.equal(cashBand(130), 'above-floor');
  assert.equal(cashBand(300), 'on-target');
  assert.equal(cashBand(null), null);
  assert.equal(cashPerFounderHour({ revenueThb: 100, founderHours: 2 }), null, 'unknown costs → unknown');
  assert.equal(cashPerFounderHour({ revenueThb: 100, costThb: 0, founderHours: 0 }), null);
  assert.equal(cashPerFounderHour({ revenueThb: 100, costThb: 300, founderHours: 2 }), -100);
});

test('verifiedTestRate and referralShare', () => {
  assert.equal(verifiedTestRate(SHIFT2), 2 / 20);
  assert.equal(verifiedTestRate({ id: 'a', label: 'a', period: 'cohort', finished: 8, paid: 10, verifiedTest: 4 }), 0.5);
  assert.equal(verifiedTestRate({ id: 'b', label: 'b', period: 'cohort', verifiedTest: 4 }), null);
  assert.equal(referralShare({ id: 'c', label: 'c', period: 'week', applied: 20, referralApplied: 5 }), 0.25);
  assert.equal(referralShare({ id: 'd', label: 'd', period: 'week', paid: 20, referralApplied: 0 }), 0);
  assert.equal(referralShare(SHIFT2), null);
});

test('sortFunnelRows / latestFunnelRow', () => {
  const rows: FunnelRow[] = [
    { id: 'u1', label: 'undated', period: 'week' },
    { id: 'b', label: 'b', period: 'cohort', date: '2026-10-14' },
    { id: 'a', label: 'a', period: 'cohort', date: '2026-10-05' },
  ];
  assert.deepEqual(sortFunnelRows(rows).map((r) => r.id), ['a', 'b', 'u1']);
  assert.equal(latestFunnelRow(rows)?.id, 'u1');
  assert.equal(latestFunnelRow(rows.slice(1))?.id, 'b');
  assert.equal(latestFunnelRow([]), null);
});

// ---------------------------------------------------------------- bets / WIP

test('WIP: active count, limit, room', () => {
  const bets = [bet('a', 'active'), bet('b', 'active'), bet('c', 'active'), bet('d', 'parked'), bet('e', 'killed')];
  assert.equal(activeBetCount(bets), 3);
  assert.equal(canActivateBet(bets, 3), false);
  assert.equal(canActivateBet(bets.slice(1), 3), true);
  assert.deepEqual(wipStatus(bets, 3), { active: 3, max: 3, atLimit: true, over: false, room: 0 });
  assert.deepEqual(wipStatus([...bets, bet('f', 'active')], 3), { active: 4, max: 3, atLimit: true, over: true, room: 0 });
  assert.equal(wipStatus([], 3).room, 3);
});

test('review due + overdue', () => {
  const bets = [bet('a', 'active', '2026-12-20'), bet('b', 'active', '2026-12-01'), bet('p', 'parked', '2026-10-01')];
  const next = nextBetReviewDue(bets, TODAY);
  assert.equal(next?.bet.id, 'b');
  assert.equal(next?.days, 34);
  assert.equal(nextBetReviewDue([bet('p', 'parked')], TODAY), null);
  assert.equal(isReviewOverdue(bet('x', 'active', '2026-10-27'), TODAY), true);
  assert.equal(isReviewOverdue(bet('x', 'active', TODAY), TODAY), false);
  assert.equal(isReviewOverdue(bet('x', 'parked', '2026-10-01'), TODAY), true);
  assert.equal(isReviewOverdue(bet('x', 'killed', '2026-10-01'), TODAY), false);
  assert.equal(nextBetReviewDue([bet('o', 'active', '2026-10-20')], TODAY)?.days, -8);
});

// ------------------------------------------------------------ escape verdict

test('escapeVerdict: Go only when number + active bet + a date within the next 30 days', () => {
  const bets = [bet('active1', 'active'), bet('parked1', 'parked'), bet('killed1', 'killed')];
  const ok = { numberMoves: 'Paid seats', byWhen: '2026-11-15', betId: 'active1' };
  assert.equal(escapeVerdict(ok, bets, TODAY), 'go');
  assert.deepEqual(escapeParkReasons(ok, bets, TODAY), []);

  assert.equal(escapeVerdict({ ...ok, numberMoves: '' }, bets, TODAY), 'park');
  assert.equal(escapeVerdict({ ...ok, numberMoves: '   ' }, bets, TODAY), 'park');
  assert.equal(escapeVerdict({ ...ok, betId: undefined }, bets, TODAY), 'park');
  assert.equal(escapeVerdict({ ...ok, betId: 'none' }, bets, TODAY), 'park');
  assert.equal(escapeVerdict({ ...ok, betId: '' }, bets, TODAY), 'park');
  assert.equal(escapeVerdict({ ...ok, betId: 'parked1' }, bets, TODAY), 'park');
  assert.equal(escapeVerdict({ ...ok, betId: 'killed1' }, bets, TODAY), 'park');
  assert.equal(escapeVerdict({ ...ok, betId: 'missing' }, bets, TODAY), 'park');

  // Today and exactly 30 days away are Go; 31 is Park.
  assert.equal(escapeVerdict({ ...ok, byWhen: TODAY }, bets, TODAY), 'go');
  assert.equal(escapeVerdict({ ...ok, byWhen: '2026-11-27' }, bets, TODAY), 'go');
  assert.equal(escapeVerdict({ ...ok, byWhen: '2026-11-28' }, bets, TODAY), 'park');
  // No date, or a date already past, parks: "soon" without a date is how the escape slips through.
  assert.equal(escapeVerdict({ ...ok, byWhen: undefined }, bets, TODAY), 'park');
  assert.deepEqual(escapeParkReasons({ ...ok, byWhen: undefined }, bets, TODAY), ['no-date']);
  assert.deepEqual(escapeParkReasons({ ...ok, byWhen: 'not a date' }, bets, TODAY), ['no-date']);
  assert.deepEqual(escapeParkReasons({ ...ok, byWhen: '2026-10-27' }, bets, TODAY), ['past-date']);

  assert.deepEqual(
    escapeParkReasons({ numberMoves: '', betId: 'none', byWhen: '2027-03-01' }, bets, TODAY),
    ['no-number', 'no-bet', 'too-far'],
  );
  assert.deepEqual(escapeParkReasons({ ...ok, betId: 'parked1' }, bets, TODAY), ['bet-not-active']);
});

test('escapeReasons: structured reasons with the answer they point at and calm copy', () => {
  const bets = [bet('active1', 'active')];
  const r = escapeReasons({ numberMoves: '', betId: 'none' }, bets, TODAY);
  assert.deepEqual(r.map((x) => [x.code, x.field]), [['no-number', 'numberMoves'], ['no-bet', 'betId'], ['no-date', 'byWhen']]);
  for (const x of r) assert.ok(x.text.length > 0 && x.text.length < 70);
  assert.equal(r[0].text, 'No number moves yet.');
  assert.equal(escapeDateReason('2026-10-27', TODAY), 'past-date');
  assert.equal(escapeDateReason('2026-10-28', TODAY), null);
  assert.equal(escapeDateReason(undefined, TODAY), 'no-date');
  assert.equal(escapeDateReason('2026-12-31', TODAY), 'too-far');
});

// ----------------------------------------------------------- weekly snapshot

test('weekSnapshot summarises the week', () => {
  const s: AnchorState = emptyState(new Date('2026-10-28T03:00:00Z'));
  s.timeLog = [entry('build', '2026-10-27T02:00:00Z', 180), entry('sell', '2026-10-27T06:00:00Z', 60)];
  s.talks = [{ id: 't', date: '2026-10-27', role: 'parent', channel: 'call', did: '', story: '', opinion: '' }];
  s.escapes = [{ id: 'e', at: '2026-10-27T05:00:00Z', want: '', numberMoves: '', howKnow: '', recommended: 'park', verdict: 'park' }];
  s.funnel = [SHIFT2];
  s.days = { '2026-10-27': { date: '2026-10-27', actions: [], anchor: { text: 'x', done: true } } };
  const snap = weekSnapshot(s, WK, new Date('2026-10-28T03:00:00Z'));
  assert.equal(snap['hours.build'], 3);
  assert.equal(snap['hours.sell'], 1);
  assert.equal(snap.buildShare, 0.75);
  assert.equal(snap.talks, 1);
  assert.equal(snap.talkTarget, 10);
  assert.equal(snap.escapesPark, 1);
  assert.equal(snap.escapesGo, 0);
  assert.equal(snap.anchorsSet, 1);
  assert.equal(snap.anchorsDone, 1);
  assert.equal(snap.funnelRow, 'SHIFT[2]');
  assert.equal(snap.bottleneck, 'Paid → Verified real-user test');
  assert.equal(snap.cashPerHour, 150);
  for (const v of Object.values(snap)) assert.ok(v === null || typeof v === 'number' || typeof v === 'string');
});

test('number formatting', () => {
  assert.equal(formatPercent(0.0625), '6%');
  assert.equal(formatPercent(0.0625, 1), '6.3%');
  assert.equal(formatPercent(null), '—');
  assert.equal(formatThb(9000), '฿9,000');
  assert.equal(formatThb(undefined), '—');
});
