import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnchorState, Bet, HeavyItem } from '../core/types.ts';
import { emptyState } from '../core/seed.ts';
import {
  ANCHOR_DEFAULT_DEADLINE, LIMIT_COPY, NO_NEXT_STEP_COPY, actionsFull, actionsLeft, anchorBetOptions, anchorDeadline,
  anchorMeta, anchorMovedToTomorrow, anchorStatus, anchorStillOpen, anchorTimerNote, applyShutdown, buildAnchor,
  carryAction, carryOverCandidates, checkNewAction, checkinComplete, checkinSummary, chipToSleep, dayPhase, escapeText,
  hasShutdown, heavyNudge, heavyNudgeMeta, inShutdownGrace, isEvening, isTime, lastNightLesson, lowEnergy,
  moveAnchorToTomorrow, msUntilAnchorDeadline, parseScale, pinnedWriteDate, primaryAction, reviewDueText,
  scaleOptions, scaleToChip, showCarryOver, showShutdown, shutdownDay, shutdownDefaults, sleepToChip, splitText,
  swapAction, swapChoices, todaySections, tomorrowAnchorConflict, weekAnchorSuggestion, weekStrip,
  anchorSteps, anchorStepsText, checkinPill, finishesAnchorSteps, carriesAnchorStep, openAnchorForTomorrow,
} from './today.logic.ts';
import { migrate } from '../core/store.ts';
import type { DayEntry } from '../core/types.ts';

const NOW = new Date('2026-10-28T03:00:00Z'); // 10:00 Bangkok, Wed 28 Oct (week 2026-W44)
const TODAY = '2026-10-28';

function bet(id: string, status: Bet['status'], reviewOn = '2026-12-01', name = id): Bet {
  return { id, name, hypothesis: '', metric: '', continueIf: '', killIf: '', reviewOn, status, notes: '', createdAt: NOW.toISOString(), decisions: [] };
}

function heavy(id: string, extra: Partial<HeavyItem> = {}): HeavyItem {
  return { id, title: id, kind: 'other', nextAction: 'Do the next thing', status: 'open', notes: '', updatedAt: NOW.toISOString(), ...extra };
}

function state(): AnchorState {
  return emptyState(NOW);
}

test('limit copy only asks to swap (shown when he tries a 4th)', () => {
  assert.equal(LIMIT_COPY, 'That’s three. Swap one out?');
});

test('actions: a 4th is blocked, empty is rejected, text is trimmed', () => {
  const a = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), text: 'x', done: false }));
  assert.deepEqual(checkNewAction(a(0), '  call 3 parents '), { ok: true, text: 'call 3 parents' });
  assert.deepEqual(checkNewAction(a(2), '   '), { ok: false, reason: 'empty' });
  assert.deepEqual(checkNewAction(a(3), '  '), { ok: false, reason: 'empty' }, 'an empty submit with three is not a 4th try');
  assert.deepEqual(checkNewAction(a(3), 'one more'), { ok: false, reason: 'limit' });
  assert.deepEqual(checkNewAction(a(4), 'one more'), { ok: false, reason: 'limit' });
  assert.equal(actionsFull(a(2)), false);
  assert.equal(actionsFull(a(3)), true);
  assert.equal(actionsLeft(a(1)), 2);
  assert.equal(actionsLeft(a(5)), 0);
});

test('sleep chips map 4…9+ and clamp', () => {
  assert.equal(sleepToChip(undefined), undefined);
  assert.equal(sleepToChip(7), '7');
  assert.equal(sleepToChip(6.6), '7');
  assert.equal(sleepToChip(11), '9');
  assert.equal(sleepToChip(2), '4');
  assert.equal(chipToSleep('9'), 9);
  assert.equal(chipToSleep('3'), undefined);
  assert.equal(chipToSleep('x'), undefined);
});

test('1–5 scales parse strictly', () => {
  assert.equal(parseScale('3'), 3);
  assert.equal(parseScale('0'), undefined);
  assert.equal(parseScale('6'), undefined);
  assert.equal(parseScale('2.5'), undefined);
  assert.equal(scaleToChip(5), '5');
  assert.equal(scaleToChip(undefined), undefined);
  assert.equal(scaleToChip(7), undefined);
});

test('check-in is complete only with sleep, energy and mood', () => {
  assert.equal(checkinComplete({ date: TODAY, actions: [] }), false);
  assert.equal(checkinComplete({ date: TODAY, actions: [], checkin: { sleepHours: 6, energy: 3 } }), false);
  assert.equal(checkinComplete({ date: TODAY, actions: [], checkin: { sleepHours: 6, energy: 3, mood: 2 } }), true);
});

test('anchor status: empty, set, done', () => {
  assert.equal(anchorStatus({ date: TODAY, actions: [] }), 'empty');
  assert.equal(anchorStatus({ date: TODAY, actions: [], anchor: { text: '  ', done: false } }), 'empty');
  assert.equal(anchorStatus({ date: TODAY, actions: [], anchor: { text: 'Call', done: false } }), 'set');
  assert.equal(anchorStatus({ date: TODAY, actions: [], anchor: { text: 'Call', done: true } }), 'done');
});

test('buildAnchor trims, drops empties and invalid times, keeps done', () => {
  assert.equal(buildAnchor({ text: '  ', metric: 'x', byWhen: '', betId: '' }), null);
  assert.deepEqual(
    buildAnchor({ text: ' Send offer ', metric: ' paid seats ', byWhen: '15:00', betId: 'b1' }, true),
    { text: 'Send offer', done: true, metric: 'paid seats', byWhen: '15:00', betId: 'b1' },
  );
  assert.deepEqual(buildAnchor({ text: 'A', metric: '', byWhen: '25:00', betId: 'none' }), { text: 'A', done: false });
  assert.equal(isTime('09:30'), true);
  assert.equal(isTime('9:30'), false);
});

test('anchor bet options: active bets, plus a linked bet that is no longer active', () => {
  const bets = [bet('a', 'active', undefined, 'SHIFT'), bet('p', 'parked', undefined, 'Side project'), bet('k', 'killed')];
  assert.deepEqual(anchorBetOptions(bets).map((o) => o.value), ['a']);
  const withLinked = anchorBetOptions(bets, 'p');
  assert.deepEqual(withLinked.map((o) => o.value), ['a', 'p']);
  assert.equal(withLinked[1].label, 'Side project (parked)');
  assert.deepEqual(anchorBetOptions(bets, 'missing').map((o) => o.value), ['a']);
});

test('anchor meta line', () => {
  const bets = [bet('a', 'active', undefined, 'SHIFT')];
  assert.equal(anchorMeta({ text: 'x', done: false, metric: 'paid seats', byWhen: '15:00', betId: 'a' }, bets), 'Moves: paid seats · by 15:00 · SHIFT');
  assert.equal(anchorMeta({ text: 'x', done: false }, bets), '');
});

test('evening: shutdown shows from 18:00 Bangkok, when opened early, or once saved', () => {
  const day = { date: TODAY, actions: [] };
  assert.equal(isEvening(new Date('2026-10-28T10:59:00Z')), false); // 17:59 BKK
  assert.equal(isEvening(new Date('2026-10-28T11:00:00Z')), true);  // 18:00 BKK
  assert.equal(isEvening(new Date('2026-10-28T16:30:00Z')), true);  // 23:30 BKK
  assert.equal(isEvening(new Date('2026-10-28T17:30:00Z')), false); // 00:30 BKK next day
  assert.equal(showShutdown({ now: NOW, openedEarly: false, day }), false);
  assert.equal(showShutdown({ now: NOW, openedEarly: true, day }), true);
  assert.equal(showShutdown({ now: NOW, openedEarly: false, day: { ...day, shutdown: { win: 'shipped' } } }), true);
  assert.equal(hasShutdown({ ...day, shutdown: {} }), false);
});

test('late shutdown: before 04:00 Bangkok it still closes yesterday', () => {
  const at0030 = new Date('2026-11-01T17:30:00Z'); // Mon 2 Nov 00:30 BKK (Sunday night for him)
  const at0430 = new Date('2026-11-01T21:30:00Z'); // Mon 2 Nov 04:30 BKK
  assert.equal(inShutdownGrace(at0030), true);
  assert.equal(inShutdownGrace(at0430), false);
  assert.equal(shutdownDay(at0030, '2026-11-02'), '2026-11-01');
  assert.equal(shutdownDay(at0430, '2026-11-02'), '2026-11-02');
  assert.equal(shutdownDay(NOW, TODAY), TODAY);

  const sunday = { date: '2026-11-01', actions: [] };
  assert.equal(showShutdown({ now: at0030, openedEarly: false, day: sunday }), true, 'shown after midnight');
  assert.equal(showShutdown({ now: at0430, openedEarly: false, day: { date: '2026-11-02', actions: [] } }), false);

  // Saving at 00:30 closes Sunday and puts the anchor on Monday — the day that just started.
  const s = state();
  const date = shutdownDay(at0030, '2026-11-02');
  applyShutdown(s, date, { win: 'Shipped', lesson: '', tomorrow: 'Call 5 alumni' });
  assert.deepEqual(s.days['2026-11-01'].shutdown, { win: 'Shipped', tomorrow: 'Call 5 alumni' });
  assert.deepEqual(s.days['2026-11-02'].anchor, { text: 'Call 5 alumni', done: false });
  assert.equal(s.days['2026-11-03'], undefined);
  assert.equal(hasShutdown(s.days['2026-11-02']), false, 'Monday is not closed');
});

test('applyShutdown writes today’s shutdown and tomorrow’s anchor text', () => {
  const s = state();
  applyShutdown(s, TODAY, { win: ' Called 3 parents ', lesson: '', tomorrow: ' Send the offer ' });
  assert.deepEqual(s.days[TODAY].shutdown, { win: 'Called 3 parents', tomorrow: 'Send the offer' });
  assert.deepEqual(s.days['2026-10-29'].anchor, { text: 'Send the offer', done: false });
  assert.deepEqual(s.days['2026-10-29'].actions, []);
});

test('applyShutdown keeps tomorrow’s other anchor fields and only changes the text', () => {
  const s = state();
  s.days['2026-10-29'] = { date: '2026-10-29', actions: [{ id: 'x', text: 'a', done: false }], anchor: { text: 'Old', metric: 'seats', betId: 'b', done: false } };
  applyShutdown(s, TODAY, { win: '', lesson: '', tomorrow: 'New' });
  assert.deepEqual(s.days['2026-10-29'].anchor, { text: 'New', metric: 'seats', betId: 'b', done: false });
  assert.equal(s.days['2026-10-29'].actions.length, 1);
});

test('applyShutdown with empty tomorrow leaves an unrelated anchor alone, removes one it wrote', () => {
  const s = state();
  applyShutdown(s, TODAY, { win: 'w', lesson: '', tomorrow: 'Plan' });
  applyShutdown(s, TODAY, { win: 'w', lesson: '', tomorrow: '' });
  assert.equal(s.days['2026-10-29'].anchor, undefined);
  assert.deepEqual(s.days[TODAY].shutdown, { win: 'w' });

  const s2 = state();
  s2.days['2026-10-29'] = { date: '2026-10-29', actions: [], anchor: { text: 'Mine', done: false } };
  applyShutdown(s2, TODAY, { win: '', lesson: '', tomorrow: '' });
  assert.deepEqual(s2.days['2026-10-29'].anchor, { text: 'Mine', done: false });
  assert.equal(s2.days[TODAY].shutdown, undefined);
});

test('applyShutdown across a month boundary', () => {
  const s = state();
  applyShutdown(s, '2026-10-31', { win: '', lesson: '', tomorrow: 'Nov 1 thing' });
  assert.equal(s.days['2026-11-01'].anchor?.text, 'Nov 1 thing');
});

test('shutdownDefaults prefers tomorrow’s current anchor text', () => {
  const s = state();
  s.days[TODAY] = { date: TODAY, actions: [], shutdown: { win: 'W', tomorrow: 'Old plan' } };
  assert.deepEqual(shutdownDefaults(s, TODAY), { win: 'W', lesson: '', tomorrow: 'Old plan', metric: '', betId: '' });
  s.days['2026-10-29'] = { date: '2026-10-29', actions: [], anchor: { text: 'Edited plan', done: false } };
  assert.equal(shutdownDefaults(s, TODAY).tomorrow, 'Edited plan');
  assert.deepEqual(shutdownDefaults(state(), TODAY), { win: '', lesson: '', tomorrow: '', metric: '', betId: '' });
});

test('the first shutdown offers today’s still-open anchor as tomorrow’s (named, not dropped)', () => {
  const s = state();
  s.days[TODAY] = { date: TODAY, actions: [], anchor: { text: ' DM 5 parents ', metric: 'referral applies', byWhen: '17:00', betId: 'b1', done: false } };
  assert.equal(openAnchorForTomorrow(s, TODAY), 'DM 5 parents');
  assert.deepEqual(shutdownDefaults(s, TODAY), { win: '', lesson: '', tomorrow: 'DM 5 parents', metric: 'referral applies', betId: 'b1' });
  // Saving it writes tomorrow's anchor with its number and bet; today's record stays as it was.
  applyShutdown(s, TODAY, shutdownDefaults(s, TODAY));
  assert.deepEqual(s.days['2026-10-29'].anchor, { text: 'DM 5 parents', done: false, metric: 'referral applies', betId: 'b1' });
  assert.equal(s.days[TODAY].anchor?.done, false);
  // Once tomorrow has an anchor, or a shutdown was saved, it is not offered again.
  assert.equal(openAnchorForTomorrow(s, TODAY), null);
  const s2 = state();
  s2.days[TODAY] = { date: TODAY, actions: [], anchor: { text: 'A', done: false }, shutdown: { win: 'w' } };
  assert.equal(openAnchorForTomorrow(s2, TODAY), null);
  assert.equal(shutdownDefaults(s2, TODAY).tomorrow, '');
  // Done or empty anchors are not carried.
  s2.days[TODAY] = { date: TODAY, actions: [], anchor: { text: 'A', done: true } };
  assert.equal(openAnchorForTomorrow(s2, TODAY), null);
  assert.equal(openAnchorForTomorrow(state(), TODAY), null);
});

test('shutdownDefaults: tomorrow’s anchor keeps today’s number and bet unless tomorrow has its own', () => {
  const s = state();
  s.days[TODAY] = { date: TODAY, actions: [], anchor: { text: 'DM 5 parents', metric: 'referral applies', betId: 'b1', done: false } };
  const d = shutdownDefaults(s, TODAY);
  assert.equal(d.metric, 'referral applies');
  assert.equal(d.betId, 'b1');
  s.days['2026-10-29'] = { date: '2026-10-29', actions: [], anchor: { text: 'Call the school', metric: 'paid seats', done: false } };
  assert.deepEqual([shutdownDefaults(s, TODAY).metric, shutdownDefaults(s, TODAY).betId], ['paid seats', '']);
});

test('applyShutdown writes tomorrow’s number and bet when given, keeps them when not', () => {
  const s = state();
  applyShutdown(s, TODAY, { win: '', lesson: '', tomorrow: 'DM 5 parents', metric: ' referral applies ', betId: 'b1' });
  assert.deepEqual(s.days['2026-10-29'].anchor, { text: 'DM 5 parents', done: false, metric: 'referral applies', betId: 'b1' });
  applyShutdown(s, TODAY, { win: '', lesson: '', tomorrow: 'DM 6 parents' });
  assert.deepEqual(s.days['2026-10-29'].anchor, { text: 'DM 6 parents', done: false, metric: 'referral applies', betId: 'b1' });
  applyShutdown(s, TODAY, { win: '', lesson: '', tomorrow: 'DM 6 parents', metric: '', betId: 'none' });
  assert.deepEqual(s.days['2026-10-29'].anchor, { text: 'DM 6 parents', done: false });
  // Written by the shutdown (even with a number and bet) → clearing "tomorrow" removes it again.
  applyShutdown(s, TODAY, { win: '', lesson: '', tomorrow: 'X', metric: 'm', betId: 'b1' });
  applyShutdown(s, TODAY, { win: '', lesson: '', tomorrow: '' });
  assert.equal(s.days['2026-10-29'].anchor, undefined);
});

test('review due copy is calm', () => {
  assert.equal(reviewDueText(-1), '1 day overdue');
  assert.equal(reviewDueText(-3), '3 days overdue');
  assert.equal(reviewDueText(0), 'today');
  assert.equal(reviewDueText(1), 'tomorrow');
  assert.equal(reviewDueText(9), 'in 9 days');
});

test('week strip uses metrics for this ISO week', () => {
  const s = state();
  s.bets = [bet('a', 'active', '2026-11-02', 'SHIFT'), bet('b', 'active', '2026-12-15'), bet('p', 'parked', '2026-10-01')];
  s.timeLog = [
    { id: '1', category: 'build', start: '2026-10-26T02:00:00Z', end: '2026-10-26T05:00:00Z' }, // 3h this week
    { id: '2', category: 'sell', start: '2026-10-27T02:00:00Z', end: '2026-10-27T03:00:00Z' },  // 1h this week
    { id: '3', category: 'sell', start: '2026-10-19T02:00:00Z', end: '2026-10-19T09:00:00Z' },  // last week
  ];
  s.activeTimer = { category: 'sell', startedAt: '2026-10-28T02:00:00Z' }; // +1h at NOW
  s.talks = [
    { id: 't1', date: '2026-10-27', role: 'parent', channel: 'call', did: '', story: '', opinion: '' },
    { id: 't2', date: '2026-10-20', role: 'parent', channel: 'call', did: '', story: '', opinion: '' },
  ];
  s.escapes = [
    { id: 'e1', at: '2026-10-27T05:00:00Z', want: '', numberMoves: '', howKnow: '', recommended: 'park', verdict: 'park' },
    { id: 'e2', at: '2026-10-28T01:00:00Z', want: '', numberMoves: 'x', howKnow: '', recommended: 'go', verdict: 'go' },
  ];
  const w = weekStrip(s, TODAY, NOW);
  assert.equal(w.weekKey, '2026-W44');
  assert.equal(w.buildSell.build, 3);
  assert.equal(w.buildSell.sell, 2);
  assert.equal(w.buildSell.buildShare, 0.6);
  assert.equal(w.target, 0.5);
  assert.equal(w.splitText, 'Build 3h 00m · Sell 2h 00m');
  assert.equal(w.talks, 1);
  assert.equal(w.talkTarget, 10);
  assert.deepEqual(w.escapes, { go: 1, park: 1, total: 2 });
  assert.equal(w.escapeText, '1 go · 1 parked');
  assert.deepEqual(w.nextReview, { betId: 'a', name: 'SHIFT', days: 5, text: 'in 5 days' });
});

test('week strip on an empty state', () => {
  const w = weekStrip(state(), TODAY, NOW);
  assert.equal(w.buildSell.buildShare, null);
  assert.equal(w.splitText, 'No build or sell time yet');
  assert.equal(w.escapeText, 'None yet');
  assert.equal(w.nextReview, null);
  assert.equal(splitText({ build: 1.25, sell: 0, total: 1.25, buildShare: 1, sellShare: 0 }), 'Build 1h 15m · Sell 0m');
  assert.equal(escapeText({ go: 0, park: 2, total: 2 }), '0 go · 2 parked');
});

test('heavy nudge: nearest deadline among open items, undated last, done ignored', () => {
  assert.equal(heavyNudge([], TODAY), null);
  assert.equal(heavyNudge([heavy('d', { status: 'done', deadline: '2026-10-29' })], TODAY), null);

  const items = [
    heavy('undated'),
    heavy('later', { deadline: '2026-11-10' }),
    heavy('done', { status: 'done', deadline: '2026-10-01' }),
    heavy('soon', { deadline: '2026-10-30' }),
  ];
  const n = heavyNudge(items, TODAY);
  assert.equal(n?.item.id, 'soon');
  assert.equal(n?.due, 'due in 2 days');
  assert.equal(n?.overdue, false);

  const over = heavyNudge([heavy('a', { deadline: '2026-10-26' }), heavy('b', { deadline: '2026-10-28' })], TODAY);
  assert.equal(over?.item.id, 'a');
  assert.equal(over?.due, 'was due 2 days ago');
  assert.equal(over?.overdue, true);

  const undated = heavyNudge([heavy('w', { status: 'waiting' }), heavy('o')], TODAY);
  assert.equal(undated?.item.id, 'o');
  assert.equal(undated?.due, null);
});

test('heavy nudge meta line', () => {
  assert.equal(heavyNudgeMeta({ item: heavy('x', { nextAction: ' Email the bank ' }), due: 'due tomorrow' }), 'Next: Email the bank · due tomorrow');
  assert.equal(heavyNudgeMeta({ item: heavy('x', { nextAction: '', status: 'waiting' }), due: null }), 'waiting');
});

test('heavy nudge: an open item with no next step asks for one', () => {
  assert.equal(NO_NEXT_STEP_COPY, 'No next step yet. Tap to add one: who to message?');
  assert.equal(heavyNudgeMeta({ item: heavy('x', { nextAction: '  ' }), due: null }), NO_NEXT_STEP_COPY);
  assert.equal(heavyNudgeMeta({ item: heavy('x', { nextAction: '' }), due: 'due today' }), `${NO_NEXT_STEP_COPY} · due today`);
});

test('one primary button per screen; in the evening an open shutdown wins', () => {
  assert.equal(primaryAction({ anchorEditing: true, shutdownEditing: true }), 'anchor');
  assert.equal(primaryAction({ anchorEditing: false, shutdownEditing: true }), 'shutdown');
  assert.equal(primaryAction({ anchorEditing: false, shutdownEditing: false }), null);
  assert.equal(primaryAction({ anchorEditing: true, shutdownEditing: true, phase: 'evening' }), 'shutdown');
  assert.equal(primaryAction({ anchorEditing: true, shutdownEditing: false, phase: 'evening' }), 'anchor');
  assert.equal(primaryAction({ anchorEditing: true, shutdownEditing: true, phase: 'morning' }), 'anchor');
});

// ------------------------------------------------------------------ time of day

const at = (bkk: string) => new Date(`${bkk}+07:00`); // Bangkok wall-clock → instant

test('day phase: morning before 12, day until 18, evening until 04 the next day', () => {
  assert.equal(dayPhase(at('2026-10-28T04:00:00')), 'morning');
  assert.equal(dayPhase(at('2026-10-28T11:59:00')), 'morning');
  assert.equal(dayPhase(at('2026-10-28T12:00:00')), 'day');
  assert.equal(dayPhase(at('2026-10-28T17:59:00')), 'day');
  assert.equal(dayPhase(at('2026-10-28T18:00:00')), 'evening');
  assert.equal(dayPhase(at('2026-10-29T03:59:00')), 'evening');
});

test('Today order: anchor before check-in; evening puts the shutdown on top and the check-in last', () => {
  const morning = todaySections('morning', { intro: true, carry: true });
  assert.deepEqual(morning.slice(0, 5), ['intro', 'anchor', 'checkin', 'carry', 'actions']);
  assert.equal(morning.at(-1), 'shutdown');
  assert.deepEqual(todaySections('day', { intro: false, carry: false }).slice(0, 3), ['anchor', 'checkin', 'actions']);
  const evening = todaySections('evening', { intro: false, carry: true });
  assert.deepEqual(evening.slice(0, 2), ['shutdown', 'anchor']);
  assert.equal(evening.at(-1), 'checkin');
  assert.equal(evening.includes('carry'), false, 'no carry-over prompt in the evening');
  assert.equal(todaySections('evening', { intro: true, carry: false })[0], 'intro');
});

test('pinned drafts: unsaved typing keeps its day, a plain tap goes to today', () => {
  assert.equal(pinnedWriteDate({ date: '2026-10-27', dirty: true }, TODAY), '2026-10-27');
  assert.equal(pinnedWriteDate({ date: '2026-10-27', dirty: false }, TODAY), TODAY);
  assert.equal(pinnedWriteDate({ date: '2026-10-27' }, TODAY), TODAY);
});

// ------------------------------------------------------------------ check-in

test('check-in scale says what the ends mean', () => {
  const o = scaleOptions('Energy');
  assert.equal(o[0].ariaLabel, 'Energy 1 of 5 (drained)');
  assert.equal(o[2].ariaLabel, 'Energy 3 of 5');
  assert.equal(o[4].ariaLabel, 'Energy 5 of 5 (great)');
});

test('check-in summary and low energy', () => {
  assert.equal(checkinSummary(undefined), '');
  assert.equal(checkinSummary({ sleepHours: 5, energy: 2, mood: 2 }), 'Slept 5h · Energy 2/5 · Mood 2/5');
  assert.equal(checkinSummary({ sleepHours: 10 }), 'Slept 9+h');
  assert.equal(checkinSummary({ sleepHours: 3, mood: 4 }), 'Slept ≤4h · Mood 4/5');
  assert.equal(lowEnergy({ date: TODAY, actions: [], checkin: { energy: 2 } }), true);
  assert.equal(lowEnergy({ date: TODAY, actions: [], checkin: { energy: 1 } }), true);
  assert.equal(lowEnergy({ date: TODAY, actions: [], checkin: { energy: 3 } }), false);
  assert.equal(lowEnergy({ date: TODAY, actions: [] }), false);
});

// ------------------------------------------------------------------ anchor still open / move

test('anchor still open: past its by-when (else 18:00), not done, today only, not in the late-night grace', () => {
  const day = (a: Partial<NonNullable<import('../core/types.ts').DayEntry['anchor']>> | null, date = TODAY) =>
    ({ date, actions: [], ...(a ? { anchor: { text: 'DM 5 parents', done: false, ...a } } : {}) });
  assert.equal(ANCHOR_DEFAULT_DEADLINE, '18:00');
  assert.equal(anchorDeadline({ byWhen: '17:00' }), '17:00');
  assert.equal(anchorDeadline({}), '18:00');
  assert.equal(anchorDeadline({ byWhen: '5pm' }), '18:00');
  assert.equal(anchorStillOpen(day({ byWhen: '17:00' }), TODAY, at('2026-10-28T16:59:00')), false);
  assert.equal(anchorStillOpen(day({ byWhen: '17:00' }), TODAY, at('2026-10-28T17:00:00')), true);
  assert.equal(anchorStillOpen(day({ byWhen: '17:00', done: true }), TODAY, at('2026-10-28T21:30:00')), false);
  assert.equal(anchorStillOpen(day({}), TODAY, at('2026-10-28T17:30:00')), false);
  assert.equal(anchorStillOpen(day({}), TODAY, at('2026-10-28T21:30:00')), true);
  assert.equal(anchorStillOpen(day(null), TODAY, at('2026-10-28T21:30:00')), false);
  assert.equal(anchorStillOpen(day({ byWhen: '09:00' }, '2026-10-27'), TODAY, at('2026-10-28T10:00:00')), false, 'another day');
  assert.equal(anchorStillOpen(day({ byWhen: '00:15' }), TODAY, at('2026-10-28T00:30:00')), false, 'grace hours');
});

test('ms until the anchor deadline (to redraw Today right then)', () => {
  const d = { date: TODAY, actions: [], anchor: { text: 'x', done: false, byWhen: '17:00' } };
  assert.equal(msUntilAnchorDeadline(d, TODAY, at('2026-10-28T16:30:00')), 30 * 60_000);
  assert.equal(msUntilAnchorDeadline(d, TODAY, at('2026-10-28T16:59:30')), 30_000);
  assert.equal(msUntilAnchorDeadline(d, TODAY, at('2026-10-28T17:00:00')), null);
  assert.equal(msUntilAnchorDeadline({ ...d, anchor: { ...d.anchor, done: true } }, TODAY, at('2026-10-28T16:00:00')), null);
});

test('move the anchor to tomorrow: copies text, number, by-when and bet; today stays as it was', () => {
  const s = state();
  s.days[TODAY] = { date: TODAY, actions: [], anchor: { text: ' DM 5 parents ', metric: 'referral applies', byWhen: '17:00', betId: 'b1', done: false } };
  assert.equal(anchorMovedToTomorrow(s, TODAY), false);
  assert.equal(tomorrowAnchorConflict(s, TODAY), null);
  assert.equal(moveAnchorToTomorrow(s, TODAY), true);
  assert.deepEqual(s.days['2026-10-29'].anchor, { text: 'DM 5 parents', metric: 'referral applies', byWhen: '17:00', betId: 'b1', done: false });
  assert.equal(s.days[TODAY].anchor?.done, false);
  assert.equal(anchorMovedToTomorrow(s, TODAY), true);

  const t = state();
  t.days[TODAY] = { date: TODAY, actions: [], anchor: { text: 'A', done: false } };
  t.days['2026-10-29'] = { date: '2026-10-29', actions: [{ id: 'k', text: 'keep', done: false }], anchor: { text: 'B', done: false } };
  assert.equal(tomorrowAnchorConflict(t, TODAY), 'B');
  moveAnchorToTomorrow(t, TODAY);
  assert.equal(t.days['2026-10-29'].anchor?.text, 'A');
  assert.equal(t.days['2026-10-29'].actions.length, 1, 'tomorrow’s actions stay');
  assert.equal(moveAnchorToTomorrow(state(), TODAY), false);
});

test('anchor timer note is prefixed and capped', () => {
  assert.equal(anchorTimerNote('  DM   5 parents '), 'Anchor: DM 5 parents');
  assert.equal(anchorTimerNote('x'.repeat(200)).length, 'Anchor: '.length + 80);
});

// ------------------------------------------------------------------ closing loops

test('last night’s lesson shows under today’s anchor', () => {
  const s = state();
  assert.equal(lastNightLesson(s, TODAY), null);
  s.days['2026-10-27'] = { date: '2026-10-27', actions: [], shutdown: { win: 'w', lesson: '  Anchor before building. ' } };
  assert.equal(lastNightLesson(s, TODAY), 'Anchor before building.');
});

test('last week’s review anchor is offered on the first day of the week with no anchor yet', () => {
  const s = state();
  const MON = '2026-11-02', TUE = '2026-11-03';
  assert.equal(weekAnchorSuggestion(s, MON), null);
  s.reviews = [{ id: 'r', weekKey: '2026-W44', createdAt: NOW.toISOString(), wins: '', lessons: '', betDecisions: [], nextAnchor: ' Ten parent talks ', snapshot: {} }];
  assert.equal(weekAnchorSuggestion(s, MON), 'Ten parent talks');
  assert.equal(weekAnchorSuggestion(s, TUE), 'Ten parent talks', 'first day he opens it this week');
  s.days[MON] = { date: MON, actions: [], anchor: { text: 'Something', done: false } };
  assert.equal(weekAnchorSuggestion(s, MON), null, 'today already has one');
  assert.equal(weekAnchorSuggestion(s, TUE), null, 'an anchor was set earlier this week');
  assert.equal(weekAnchorSuggestion(s, '2026-11-09'), null, 'only last week’s review counts');
});

test('swap: only unfinished actions are offered; the new one takes the same place', () => {
  const day = { date: TODAY, actions: [{ id: 'a', text: 'A', done: true }, { id: 'b', text: 'B', done: false }, { id: 'c', text: 'C', done: false }] };
  assert.deepEqual(swapChoices(day.actions).map((a) => a.id), ['b', 'c']);
  const r = swapAction(day, 'b', { id: 'n', text: 'New', done: false });
  assert.deepEqual(r, { removed: { id: 'b', text: 'B', done: false }, index: 1 });
  assert.deepEqual(day.actions.map((a) => a.id), ['a', 'n', 'c']);
  assert.equal(swapAction(day, 'gone', { id: 'm', text: 'M', done: false }), null);
  assert.equal(day.actions.length, 3);
});

test('carry over: yesterday’s unfinished actions, minus ones already on today, within a week', () => {
  const s = state();
  assert.equal(carryOverCandidates(s, TODAY), null);
  s.days['2026-10-24'] = { date: '2026-10-24', actions: [{ id: 'old', text: 'Old thing', done: false }] };
  s.days['2026-10-27'] = { date: '2026-10-27', actions: [
    { id: 'd', text: 'Done one', done: true }, { id: 'u1', text: 'Call the school', done: false }, { id: 'u2', text: ' Post the recap ', done: false },
  ] };
  s.days[TODAY] = { date: TODAY, actions: [{ id: 't', text: 'post the recap', done: false }] };
  const c = carryOverCandidates(s, TODAY);
  assert.equal(c?.from, '2026-10-27');
  assert.deepEqual(c?.items.map((a) => a.id), ['u1'], 'done and already-carried items are left out');
  // The latest day with actions decides: all done there → nothing older is offered.
  s.days['2026-10-27'].actions = [{ id: 'd', text: 'Done one', done: true }];
  assert.equal(carryOverCandidates(s, TODAY), null);
  delete s.days['2026-10-27'];
  assert.equal(carryOverCandidates(s, TODAY)?.from, '2026-10-24', 'skips days without actions');
  assert.equal(carryOverCandidates(s, '2026-11-05'), null, 'older than a week');

  assert.equal(showCarryOver(c, 'morning', null), true);
  assert.equal(showCarryOver(c, 'day', null), true);
  assert.equal(showCarryOver(c, 'evening', null), false);
  assert.equal(showCarryOver(c, 'morning', '2026-10-27'), false, 'answered for that day');
  assert.equal(showCarryOver(null, 'morning', null), false);
});

test('carryAction respects the limit of three and skips duplicates', () => {
  const s = state();
  assert.equal(carryAction(s, TODAY, ' Call the school ', 'n1'), 'ok');
  assert.deepEqual(s.days[TODAY].actions, [{ id: 'n1', text: 'Call the school', done: false }]);
  assert.equal(carryAction(s, TODAY, 'call the school', 'n2'), 'dupe');
  assert.equal(carryAction(s, TODAY, ' ', 'n3'), 'empty');
  carryAction(s, TODAY, 'B', 'n4');
  carryAction(s, TODAY, 'C', 'n5');
  assert.equal(carryAction(s, TODAY, 'D', 'n6'), 'full');
  assert.equal(s.days[TODAY].actions.length, 3);
});

test('a carried step keeps "Toward the anchor" only when its anchor moved over too', () => {
  const s = state();
  const step = { id: 's1', text: 'Draft the DM', done: false, forAnchor: true };
  s.days['2026-10-27'] = { date: '2026-10-27', actions: [step, { id: 'p', text: 'Poster', done: false }], anchor: { text: 'DM 5 parents', done: false } };
  s.days[TODAY] = { date: TODAY, actions: [], anchor: { text: ' dm 5 parents', done: false } };
  assert.equal(carriesAnchorStep(s, '2026-10-27', TODAY, step), true);
  assert.equal(carriesAnchorStep(s, '2026-10-27', TODAY, s.days['2026-10-27'].actions[1]), false, 'not a step');
  assert.equal(carryAction(s, TODAY, step.text, 'n1', true), 'ok');
  assert.deepEqual(s.days[TODAY].actions, [{ id: 'n1', text: 'Draft the DM', done: false, forAnchor: true }]);
  // A different, done or missing anchor today: the step comes over as a plain action.
  s.days[TODAY].anchor = { text: 'Call the school', done: false };
  assert.equal(carriesAnchorStep(s, '2026-10-27', TODAY, step), false);
  s.days[TODAY].anchor = { text: 'DM 5 parents', done: true };
  assert.equal(carriesAnchorStep(s, '2026-10-27', TODAY, step), false);
  delete s.days[TODAY].anchor;
  assert.equal(carriesAnchorStep(s, '2026-10-27', TODAY, step), false);
});

test('anchor steps: actions marked "Toward the anchor" are counted on the anchor card', () => {
  const day: DayEntry = {
    date: TODAY,
    anchor: { text: 'DM 5 parents for referrals', done: false },
    actions: [
      { id: 'a', text: 'Write the DM', done: true, forAnchor: true },
      { id: 'b', text: 'Fix login bug', done: false },
      { id: 'c', text: 'Send it to 5 parents', done: false, forAnchor: true },
    ],
  };
  assert.deepEqual(anchorSteps(day), { done: 1, total: 2 });
  assert.equal(anchorStepsText(day), 'Steps: 1 of 2 done');
  assert.equal(anchorStepsText({ actions: [{ id: 'x', text: 'y', done: false }] }), null, 'nothing linked: no line');

  // Ticking the last linked step while the anchor is open offers "Mark done".
  assert.equal(finishesAnchorSteps(day, 'c'), true);
  assert.equal(finishesAnchorSteps(day, 'b'), false, 'an unrelated action');
  assert.equal(finishesAnchorSteps(day, 'a'), false, 'already done');
  const twoOpen: DayEntry = { ...day, actions: day.actions.map((x) => ({ ...x, done: false })) };
  assert.equal(finishesAnchorSteps(twoOpen, 'a'), false, 'another step is still open');
  assert.equal(finishesAnchorSteps({ ...day, anchor: { ...day.anchor!, done: true } }, 'c'), false, 'anchor already done');
  assert.equal(finishesAnchorSteps({ ...day, anchor: undefined }, 'c'), false, 'no anchor');
});

test('migrate keeps "Toward the anchor" on actions and drops anything else in that field', () => {
  const s = migrate({ days: { [TODAY]: { actions: [
    { id: 'a', text: 'Write the DM', done: false, forAnchor: true },
    { id: 'b', text: 'Fix login bug', done: false, forAnchor: 'yes' },
    { id: 'c', text: 'Reply', done: true },
  ] } } }, NOW);
  assert.deepEqual(s.days[TODAY].actions, [
    { id: 'a', text: 'Write the DM', done: false, forAnchor: true },
    { id: 'b', text: 'Fix login bug', done: false },
    { id: 'c', text: 'Reply', done: true },
  ]);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s)), NOW).days, s.days, 'round-trips');
});

test('compact check-in pills: a dash until answered, then the value', () => {
  assert.deepEqual(checkinPill(undefined, 'sleep'), { label: 'Sleep —', ariaLabel: 'Sleep: not answered yet', answered: false });
  assert.deepEqual(checkinPill({ energy: 2 }, 'energy'), { label: 'Energy 2', ariaLabel: 'Energy: 2 of 5', answered: true });
  assert.equal(checkinPill({ energy: 2 }, 'mood').label, 'Mood —');
  assert.deepEqual(checkinPill({ sleepHours: 6 }, 'sleep'), { label: 'Sleep 6h', ariaLabel: 'Sleep: 6 hours', answered: true });
  assert.equal(checkinPill({ sleepHours: 3 }, 'sleep').label, 'Sleep ≤4h');
  assert.equal(checkinPill({ sleepHours: 10 }, 'sleep').label, 'Sleep 9+h');
});
