import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnchorState, Bet, WeeklyReview } from '../core/types.ts';
import { emptyState } from '../core/seed.ts';
import { weekSnapshot } from '../core/metrics.ts';
import {
  applyReview, betNameFor, checkinAverages, checkinText, defaultReviewWeek, findReview, firstErrorKey, initReviewForm,
  isReviewDue, mergeJournal, pastReviews, pendingDecisionBets, REVIEW_COPY, reviewSnapshot, reviewWeeks, snapshotLines,
  snapshotView, splitPendingBets, validateReviewForm, viaEscapeText, weekJournal, weekNumberLabel, weekRangeLabel,
  whyRequired, heldOnEarlierWeek, reviewFormHasContent,
} from './review.logic.ts';

const TODAY = '2026-10-28'; // Wednesday, 2026-W44
const NOW = new Date('2026-10-28T12:00:00.000Z');

function bet(id: string, status: Bet['status'], reviewOn = '2026-12-01'): Bet {
  return {
    id, name: `Bet ${id}`, hypothesis: '', metric: '', continueIf: '', killIf: '', reviewOn, status, notes: '',
    createdAt: '2026-10-01T00:00:00.000Z', decisions: [],
  };
}

function review(weekKey: string, extra: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    id: `r-${weekKey}`, weekKey, createdAt: '2026-10-25T10:00:00.000Z', wins: '', lessons: '',
    betDecisions: [], nextAnchor: '', snapshot: {}, ...extra,
  };
}

function state(bets: Bet[], reviews: WeeklyReview[] = []): AnchorState {
  const s = emptyState(NOW);
  s.bets = bets;
  s.reviews = reviews;
  return s;
}

let idSeq = 0;
const nextId = () => `new-${++idSeq}`;

// ------------------------------------------------------------------ weeks

test('reviewWeeks gives this and last ISO week', () => {
  assert.deepEqual(reviewWeeks(TODAY), { this: '2026-W44', last: '2026-W43' });
  assert.deepEqual(reviewWeeks('2027-01-01'), { this: '2026-W53', last: '2026-W52' });
});

test('defaultReviewWeek: last week early in the week until it is reviewed', () => {
  assert.equal(defaultReviewWeek('2026-10-26', []), 'last');          // Monday
  assert.equal(defaultReviewWeek('2026-10-27', []), 'last');          // Tuesday
  assert.equal(defaultReviewWeek('2026-10-26', [review('2026-W43')]), 'this');
  assert.equal(defaultReviewWeek(TODAY, []), 'this');                 // Wednesday
  assert.equal(defaultReviewWeek('2026-11-01', []), 'this');          // Sunday
});

test('week labels', () => {
  assert.equal(weekNumberLabel('2026-W44'), 'Week 44');
  assert.equal(weekNumberLabel('2026-W05'), 'Week 5');
  assert.equal(weekNumberLabel('nope'), 'nope');
  assert.equal(weekRangeLabel('2026-W44', 2026), '26 Oct – 1 Nov');
  assert.equal(weekRangeLabel('2026-W53', 2026), '28 Dec – 3 Jan 2027');
  assert.equal(weekRangeLabel('bad'), 'bad');
});

// ------------------------------------------------------------------ reviews

test('findReview and pastReviews (newest first, excluding the shown week)', () => {
  const list = [review('2026-W42'), review('2026-W44'), review('2026-W43')];
  assert.equal(findReview(list, '2026-W43')?.id, 'r-2026-W43');
  assert.equal(findReview(list, '2026-W40'), undefined);
  assert.deepEqual(pastReviews(list).map((r) => r.weekKey), ['2026-W44', '2026-W43', '2026-W42']);
  assert.deepEqual(pastReviews(list, '2026-W44').map((r) => r.weekKey), ['2026-W43', '2026-W42']);
  assert.equal(list[0].weekKey, '2026-W42', 'does not mutate input');
});

test('pendingDecisionBets: active bets without a decision in this review', () => {
  const bets = [bet('a', 'active'), bet('b', 'active'), bet('p', 'parked')];
  assert.deepEqual(pendingDecisionBets(bets).map((b) => b.id), ['a', 'b']);
  const r = review('2026-W44', { betDecisions: [{ betId: 'a', verdict: 'continue', why: 'x' }] });
  assert.deepEqual(pendingDecisionBets(bets, r).map((b) => b.id), ['b']);
});

test('initReviewForm prefills from a saved review', () => {
  assert.deepEqual(initReviewForm(undefined, ['a']), { wins: '', lessons: '', nextAnchor: '', decisions: { a: { verdict: '', why: '' } } });
  const f = initReviewForm(review('2026-W44', { wins: 'W', lessons: 'L', nextAnchor: 'N' }), []);
  assert.deepEqual(f, { wins: 'W', lessons: 'L', nextAnchor: 'N', decisions: {} });
});

// ------------------------------------------------------------------ validation

test('validateReviewForm: a call for each due bet; why is optional for continue only', () => {
  const f = initReviewForm(undefined, ['a', 'b']);
  let errs = validateReviewForm(f, ['a', 'b']);
  assert.equal(errs['verdict:a'], REVIEW_COPY.pickVerdict);
  assert.equal(errs['verdict:b'], REVIEW_COPY.pickVerdict);
  assert.equal(errs.form, undefined, 'bets count as content');
  assert.equal(firstErrorKey(errs, ['a', 'b']), 'verdict:a');

  f.decisions.a = { verdict: 'change', why: '   ' };
  f.decisions.b = { verdict: 'kill', why: 'No paying alumni after two offers.' };
  errs = validateReviewForm(f, ['a', 'b']);
  assert.deepEqual(errs, { 'why:a': REVIEW_COPY.needWhy });
  assert.equal(firstErrorKey(errs, ['a', 'b']), 'why:a');

  f.decisions.a = { verdict: 'continue', why: '' };
  assert.deepEqual(validateReviewForm(f, ['a', 'b']), {}, 'continue needs no why');
});

test('validateReviewForm: bets not due are optional, but a picked call still needs its why', () => {
  const f = initReviewForm(undefined, ['due', 'later']);
  f.wins = 'Two talks';
  f.decisions.due = { verdict: 'continue', why: '' };
  assert.deepEqual(validateReviewForm(f, ['due'], ['later']), {});
  f.decisions.later = { verdict: 'park', why: ' ' };
  assert.deepEqual(validateReviewForm(f, ['due'], ['later']), { 'why:later': REVIEW_COPY.needWhy });
  f.decisions.later = { verdict: 'continue', why: '' };
  assert.deepEqual(validateReviewForm(f, ['due'], ['later']), {});
});

test('validateReviewForm: with nothing due, wins + next anchor are enough', () => {
  const f = initReviewForm(undefined, ['x', 'y', 'z']);
  assert.deepEqual(validateReviewForm(f, [], ['x', 'y', 'z']), { form: REVIEW_COPY.empty });
  f.wins = 'Closed two schools';
  f.nextAnchor = 'Ten parent talks';
  assert.deepEqual(validateReviewForm(f, [], ['x', 'y', 'z']), {});
  const g = initReviewForm(undefined, ['x']);
  g.decisions.x = { verdict: 'continue', why: '' };
  assert.deepEqual(validateReviewForm(g, [], ['x']), {}, 'an optional call alone counts as content');
});

test('review due: on or after the review date; split pending into due and later', () => {
  assert.equal(isReviewDue(bet('a', 'active', '2026-10-27'), TODAY), true);
  assert.equal(isReviewDue(bet('a', 'active', TODAY), TODAY), true);
  assert.equal(isReviewDue(bet('a', 'active', '2026-10-29'), TODAY), false);
  assert.equal(isReviewDue(bet('a', 'active', 'nope'), TODAY), true);
  const bets = [bet('over', 'active', '2026-10-01'), bet('far', 'active', '2026-12-15'), bet('p', 'parked', '2026-10-01'), bet('done', 'active', '2026-10-02')];
  const r = review('2026-W44', { betDecisions: [{ betId: 'done', verdict: 'continue', why: '' }] });
  const split = splitPendingBets(bets, r, TODAY);
  assert.deepEqual(split.due.map((b) => b.id), ['over']);
  assert.deepEqual(split.later.map((b) => b.id), ['far']);
  assert.equal(whyRequired(''), false);
  assert.equal(whyRequired('continue'), false);
  assert.equal(whyRequired('change'), true);
  assert.equal(whyRequired('park'), true);
  assert.equal(whyRequired('kill'), true);
});

test('validateReviewForm with no bets needs at least one line', () => {
  const f = initReviewForm(undefined, []);
  assert.deepEqual(validateReviewForm(f, []), { form: REVIEW_COPY.empty });
  assert.equal(firstErrorKey({ form: 'x' }, []), 'form');
  f.lessons = 'Talk first.';
  assert.deepEqual(validateReviewForm(f, []), {});
  assert.equal(firstErrorKey({}, []), null);
});

// ------------------------------------------------------------------ apply

test('applyReview creates one review and writes decisions to bets', () => {
  const s = state([bet('a', 'active', '2026-11-01'), bet('b', 'active'), bet('c', 'active', '2027-01-31'), bet('d', 'active')]);
  const form = initReviewForm(undefined, ['a', 'b', 'c', 'd']);
  form.wins = '  Shipped the form  ';
  form.nextAnchor = 'Ten talks';
  form.decisions.a = { verdict: 'continue', why: ' Numbers moving ' };
  form.decisions.b = { verdict: 'park', why: 'Not now' };
  form.decisions.c = { verdict: 'change', why: 'New price' };
  form.decisions.d = { verdict: 'kill', why: 'No one paid' };
  const res = applyReview(s, {
    weekKey: '2026-W44', form, betIds: ['a', 'b', 'c', 'd'], today: TODAY, now: NOW, snapshot: { talks: 3 }, newId: nextId,
  });
  assert.equal(res.created, true);
  assert.equal(s.reviews.length, 1);
  assert.equal(res.review.wins, 'Shipped the form');
  assert.equal(res.review.nextAnchor, 'Ten talks');
  assert.equal(res.review.createdAt, NOW.toISOString());
  assert.deepEqual(res.review.snapshot, { talks: 3 });
  assert.deepEqual(res.review.betDecisions.map((d) => d.verdict), ['continue', 'park', 'change', 'kill']);

  const [a, b, c, d] = s.bets;
  assert.deepEqual(a.decisions, [{ date: TODAY, verdict: 'continue', why: 'Numbers moving' }]);
  assert.equal(a.status, 'active');
  assert.equal(a.reviewOn, '2026-11-01', 'a review that is not due yet keeps its pre-set date');
  assert.equal(b.status, 'parked');
  assert.equal(c.status, 'active');
  assert.equal(c.reviewOn, '2027-01-31', 'a later review date is kept');
  assert.equal(d.status, 'killed');
  assert.equal(res.applied.length, 4);
});

test('applyReview: continue/change push the review only when it is due', () => {
  const s = state([
    bet('over', 'active', '2026-10-20'), bet('due', 'active', TODAY), bet('soon', 'active', '2026-10-29'),
    bet('chg', 'active', '2026-10-01'),
  ]);
  const ids = ['over', 'due', 'soon', 'chg'];
  const form = initReviewForm(undefined, ids);
  form.decisions.over = { verdict: 'continue', why: 'on track' };
  form.decisions.due = { verdict: 'continue', why: 'on track' };
  form.decisions.soon = { verdict: 'continue', why: 'on track' };
  form.decisions.chg = { verdict: 'change', why: 'new price' };
  applyReview(s, { weekKey: '2026-W44', form, betIds: ids, today: TODAY, now: NOW, snapshot: {}, newId: nextId });
  const by = Object.fromEntries(s.bets.map((b) => [b.id, b.reviewOn]));
  assert.equal(by.over, '2026-11-11', 'overdue → today + 14');
  assert.equal(by.due, '2026-11-11', 'due today → today + 14');
  assert.equal(by.soon, '2026-10-29', 'due tomorrow → unchanged, so it still comes due');
  assert.equal(by.chg, '2026-11-11', 'change on an overdue bet → today + 14');
});

test('applyReview: weekly continues never move a future decision date', () => {
  const s = state([bet('high', 'active', '2026-12-01')]);
  for (const [today, wk] of [['2026-11-23', '2026-W48'], ['2026-11-30', '2026-W49']] as const) {
    const form = initReviewForm(undefined, ['high']);
    form.decisions.high = { verdict: 'continue', why: 'fine' };
    applyReview(s, { weekKey: wk, form, betIds: ['high'], today, now: NOW, snapshot: {}, newId: nextId });
  }
  assert.equal(s.bets[0].reviewOn, '2026-12-01');
  assert.equal(s.bets[0].decisions.length, 2);
});

test('applyReview: parking a due bet looks again in 30 days (B3); a future date is kept', () => {
  const s = state([bet('over', 'active', '2026-10-20'), bet('due', 'active', TODAY), bet('later', 'active', '2026-12-01')]);
  const ids = ['over', 'due', 'later'];
  const form = initReviewForm(undefined, ids);
  for (const id of ids) form.decisions[id] = { verdict: 'park', why: 'Not now' };
  applyReview(s, { weekKey: '2026-W44', form, betIds: ids, today: TODAY, now: NOW, snapshot: {}, newId: nextId });
  const by = Object.fromEntries(s.bets.map((b) => [b.id, b]));
  assert.equal(by.over.status, 'parked');
  assert.equal(by.over.reviewOn, '2026-11-27', 'overdue → today + 30, no longer overdue');
  assert.equal(by.due.reviewOn, '2026-11-27');
  assert.equal(by.later.reviewOn, '2026-12-01');
  assert.equal(isReviewDue(by.over, TODAY), false);
});

test('applyReview skips optional bets left without a call', () => {
  const s = state([bet('a', 'active', '2026-12-01'), bet('b', 'active', '2026-12-01')]);
  const form = initReviewForm(undefined, ['a', 'b']);
  form.wins = 'w';
  form.decisions.a = { verdict: 'continue', why: '' };
  const res = applyReview(s, { weekKey: '2026-W44', form, betIds: ['a', 'b'], today: TODAY, now: NOW, snapshot: {}, newId: nextId });
  assert.deepEqual(res.applied, [{ betId: 'a', verdict: 'continue' }]);
  assert.deepEqual(res.review.betDecisions, [{ betId: 'a', verdict: 'continue', why: '' }]);
  assert.equal(s.bets[1].decisions.length, 0);
});

test('applyReview edits the existing week instead of adding a duplicate', () => {
  const prior = review('2026-W44', {
    id: 'keep', createdAt: '2026-10-27T01:00:00.000Z', wins: 'old',
    betDecisions: [{ betId: 'a', verdict: 'continue', why: 'first' }],
  });
  const a = bet('a', 'active');
  a.decisions = [{ date: '2026-10-27', verdict: 'continue', why: 'first' }];
  const s = state([a, bet('b', 'active')], [prior]);
  const form = initReviewForm(prior, ['b']);
  form.wins = 'new';
  form.decisions.b = { verdict: 'continue', why: 'ok' };
  // Even if 'a' sneaks into betIds, it is not decided twice.
  form.decisions.a = { verdict: 'kill', why: 'again' };
  const res = applyReview(s, {
    weekKey: '2026-W44', form, betIds: ['a', 'b'], today: TODAY, now: NOW, snapshot: {}, newId: nextId,
  });
  assert.equal(res.created, false);
  assert.equal(s.reviews.length, 1);
  assert.equal(s.reviews[0].id, 'keep');
  assert.equal(s.reviews[0].createdAt, '2026-10-27T01:00:00.000Z');
  assert.equal(s.reviews[0].wins, 'new');
  assert.deepEqual(s.reviews[0].betDecisions.map((d) => d.betId), ['a', 'b']);
  assert.equal(s.bets[0].decisions.length, 1, 'bet a log untouched');
  assert.equal(s.bets[0].status, 'active');
  assert.equal(s.bets[1].decisions.length, 1);
  assert.deepEqual(res.applied, [{ betId: 'b', verdict: 'continue' }]);
});

test('applyReview skips missing bets and does not revive non-active ones', () => {
  const k = bet('k', 'killed');
  const s = state([k]);
  const form = initReviewForm(undefined, ['k', 'gone']);
  form.decisions.k = { verdict: 'continue', why: 'hm' };
  form.decisions.gone = { verdict: 'park', why: 'x' };
  const res = applyReview(s, { weekKey: '2026-W44', form, betIds: ['k', 'gone'], today: TODAY, now: NOW, snapshot: {}, newId: nextId });
  assert.equal(k.status, 'killed');
  assert.equal(k.reviewOn, '2026-12-01');
  assert.equal(k.decisions.length, 1);
  assert.deepEqual(res.applied.map((x) => x.betId), ['k']);
});

// ------------------------------------------------------------------ snapshot display

test('snapshotView formats a real weekSnapshot', () => {
  const s = state([bet('a', 'active')]);
  s.timeLog = [
    { id: 't1', category: 'build', start: '2026-10-27T02:00:00.000Z', end: '2026-10-27T05:00:00.000Z' },
    { id: 't2', category: 'sell', start: '2026-10-27T06:00:00.000Z', end: '2026-10-27T07:00:00.000Z' },
  ];
  // Made-up numbers: real cohort figures stay out of this public repo.
  s.funnel = [{ id: 'f', label: 'SHIFT[2]', period: 'cohort', paid: 20, verifiedTest: 1, revenueThb: 12000, costThb: 3000, founderHours: 60 }];
  s.talks = [{ id: 'x', date: TODAY, role: 'parent', channel: 'call', did: '', story: '', opinion: '' }];
  const v = snapshotView(weekSnapshot(s, '2026-W44', NOW));
  assert.equal(v.build, 3);
  assert.equal(v.sell, 1);
  assert.equal(v.buildSellText, '75% build · target 50%');
  assert.equal(v.talksText, '1 of 10');
  assert.equal(v.escapesText, 'None');
  assert.equal(v.anchorsText, 'None set');
  assert.equal(v.funnelRow, 'SHIFT[2]');
  assert.equal(v.bottleneckText, 'Paid → Verified real-user test · 5%');
  assert.equal(v.cashText, '฿150/h');
  assert.equal(v.cashTone, 'data');
  assert.equal(v.totalHours, 4);
});

test('snapshotView tolerates empty or old snapshots', () => {
  const v = snapshotView({});
  assert.equal(v.buildShare, null);
  assert.equal(v.buildSellText, 'No build or sell hours yet');
  assert.equal(v.bottleneckText, 'Not enough funnel data yet');
  assert.equal(v.cashText, '—');
  assert.equal(v.cashTone, 'muted');
  assert.equal(v.cashNote, null);
  assert.equal(v.talksText, '0');
  const low = snapshotView({ cashPerHour: 120, escapesGo: 1, escapesPark: 2, anchorsSet: 4, anchorsDone: 2, bottleneck: 'A → B', bottleneckRate: null });
  assert.equal(low.cashTone, 'warn');
  assert.equal(low.cashNote, 'Below the ฿130/h floor.');
  assert.equal(low.escapesText, '1 go · 2 parked');
  assert.equal(low.anchorsText, '2 of 4 done');
  assert.equal(low.bottleneckText, 'A → B');
  assert.equal(snapshotView({ cashPerHour: 300 }).cashTone, 'good');
});

test('snapshotLines lists hours and only known funnel lines', () => {
  const lines = snapshotLines({ 'hours.build': 2, 'hours.rest': 1.25, talks: 2, talkTarget: 10 });
  assert.deepEqual(lines.map((l) => l.label), ['Hours', 'Build : sell', 'Talks', 'Escape checks', 'Anchors']);
  assert.equal(lines[0].value, 'Build 2h · Rest 1.3h');
  assert.equal(snapshotLines({})[0].value, 'No time logged');
  const withFunnel = snapshotLines({ funnelRow: 'Cohort', bottleneck: 'A → B', bottleneckRate: 0.5, cashPerHour: 200 });
  assert.deepEqual(withFunnel.slice(5).map((l) => l.value), ['Cohort', 'A → B · 50%', '฿200/h']);
});

test('the week’s evenings: shutdown wins and lessons per day, Monday first', () => {
  const days = {
    '2026-10-26': { date: '2026-10-26', actions: [], shutdown: { win: ' Two talks ', lesson: 'Anchor first' } },
    '2026-10-27': { date: '2026-10-27', actions: [], shutdown: { tomorrow: 'x' } },
    '2026-10-28': { date: '2026-10-28', actions: [], shutdown: { lesson: 'Sleep' } },
    '2026-10-19': { date: '2026-10-19', actions: [], shutdown: { win: 'last week' } },
  };
  assert.deepEqual(weekJournal(days, '2026-W44'), [
    { date: '2026-10-26', win: 'Two talks', lesson: 'Anchor first' },
    { date: '2026-10-28', win: '', lesson: 'Sleep' },
  ]);
  assert.deepEqual(weekJournal(days, 'bad'), []);
});

test('mergeJournal adds new lines as bullets and skips ones already there', () => {
  assert.equal(mergeJournal('', ['Two talks', '', 'Closed a school']), '• Two talks\n• Closed a school');
  assert.equal(mergeJournal('My own words', ['Two talks']), 'My own words\n• Two talks');
  assert.equal(mergeJournal('• Two talks', ['Two talks']), '• Two talks');
  assert.equal(mergeJournal('keep  ', ['', ' ']), 'keep  ');
});

test('check-in averages for the week', () => {
  const days = {
    '2026-10-26': { date: '2026-10-26', actions: [], checkin: { sleepHours: 5, energy: 2 as const, mood: 2 as const } },
    '2026-10-27': { date: '2026-10-27', actions: [], checkin: { sleepHours: 6, energy: 3 as const } },
    '2026-10-28': { date: '2026-10-28', actions: [], checkin: { note: 'only a note' } },
    '2026-10-19': { date: '2026-10-19', actions: [], checkin: { sleepHours: 9, energy: 5 as const, mood: 5 as const } },
  };
  assert.deepEqual(checkinAverages(days, '2026-W44'), { days: 2, sleep: 5.5, energy: 2.5, mood: 2 });
  assert.deepEqual(checkinAverages({}, '2026-W44'), { days: 0, sleep: null, energy: null, mood: null });
  assert.equal(checkinText({ days: 2, sleep: 5.5, energy: 2.5, mood: 2 }), 'Sleep 5.5h · Energy 2.5 · Mood 2 (2 days)');
  assert.equal(checkinText({ days: 0, sleep: null, energy: null, mood: null }), 'No check-ins');
});

test('reviewSnapshot adds check-ins; escape-check hours show as "of which via escape check"', () => {
  const s = state([]);
  s.days['2026-10-26'] = { date: '2026-10-26', actions: [], checkin: { sleepHours: 5, energy: 2, mood: 3 } };
  s.timeLog = [
    { id: 'g', category: 'build', start: '2026-10-27T02:00:00.000Z', end: '2026-10-27T03:30:00.000Z', source: 'escape' },
    { id: 'o', category: 'escape', start: '2026-10-27T05:00:00.000Z', end: '2026-10-27T05:30:00.000Z', source: 'escape', overridden: true },
    { id: 'p', category: 'build', start: '2026-10-27T07:00:00.000Z', end: '2026-10-27T08:00:00.000Z' },
  ];
  const snap = reviewSnapshot(s, '2026-W44', NOW);
  assert.equal(snap['checkin.days'], 1);
  assert.equal(snap['checkin.energy'], 2);
  const v = snapshotView(snap);
  assert.equal(v.hours.find((x) => x.key === 'escape')?.hours, 0.5);
  assert.deepEqual(v.viaEscape, { hours: 2, overriddenHours: 0.5, sessions: 2, text: '2h in 2 sessions · 0.5h after a Park' });
  assert.equal(v.checkin?.text, 'Sleep 5h · Energy 2 · Mood 3 (1 day)');
  const labels = snapshotLines(snap).map((l) => l.label);
  assert.ok(labels.includes('Of which via escape check'));
  assert.ok(labels.includes('Check-ins'));
  assert.equal(viaEscapeText(0, 0, 0), 'None');
  assert.equal(viaEscapeText(1.5, 1, 0), '1.5h in 1 session');
});

test('old snapshots without escape or check-in keys still display', () => {
  const v = snapshotView({ 'hours.build': 2 });
  assert.equal(v.viaEscape, null);
  assert.equal(v.checkin, null);
  assert.deepEqual(snapshotLines({ 'hours.build': 2 }).map((l) => l.label), ['Hours', 'Build : sell', 'Talks', 'Escape checks', 'Anchors']);
});

test('betNameFor falls back for deleted bets', () => {
  assert.equal(betNameFor([bet('a', 'active')], 'a'), 'Bet a');
  assert.equal(betNameFor([], 'zzz'), 'A removed bet');
});

test('an unsaved review: clean again once cleared out; held on an earlier week only while it has content', () => {
  const f = initReviewForm(undefined, ['a', 'b']);
  assert.equal(reviewFormHasContent(f), false);
  f.wins = 'Two parents paid';
  assert.equal(reviewFormHasContent(f), true);
  f.wins = '   ';
  assert.equal(reviewFormHasContent(f), false, 'cleared text is clean again');
  f.decisions.b = { verdict: 'continue', why: '' };
  assert.equal(reviewFormHasContent(f), true, 'a picked call counts');
  f.decisions.b = { verdict: '', why: 'numbers flat' };
  assert.equal(reviewFormHasContent(f), true, 'a typed why counts');

  // Started Sunday of Week 44, now Monday of Week 45.
  assert.equal(heldOnEarlierWeek('2026-11-01', '2026-11-02', true), true);
  assert.equal(heldOnEarlierWeek('2026-11-01', '2026-11-02', false), false, 'a clean draft moves on by itself');
  assert.equal(heldOnEarlierWeek('2026-10-27', '2026-10-28', true), false, 'same week');
});
