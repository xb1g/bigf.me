import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bet } from '../core/types.ts';
import {
  AVOID_FIRST_MIN, ESCAPE_DRAFT_KEY, STEP_COPY, anchorFirst, avoidTimerNote, avoidingCopy, betChoices, betLabel,
  buildEscapeCheck, buildParkedIdea, buildWorry, byWhenHint, canOfferWorry, clampStep, draftHasContent, draftReasons,
  draftVerdict, emptyEscapeDraft, ESCAPE_STEPS, goTimerNote, goTimerPlan, goToastCopy, nextStep, NO_BET,
  parkingCountCopy, parseEscapeDraft, progressText, quickDates, recommendation, resultActions, RESULT_STEP,
  serializeEscapeDraft, STEP_COUNT, stepError, summaryRows, weekLine,
} from './escape.logic.ts';
import type { EscapeDraft } from './escape.logic.ts';

const TODAY = '2026-10-28';

function bet(id: string, status: Bet['status'], name = id): Bet {
  return {
    id, name, hypothesis: '', metric: '', continueIf: '', killIf: '', reviewOn: '2026-12-01', status, notes: '',
    createdAt: '2026-10-01T00:00:00.000Z', decisions: [],
  };
}

const BETS = [bet('a', 'active', 'SHIFT'), bet('p', 'parked', 'Side project'), bet('b', 'active', 'School')];

function draft(over: Partial<EscapeDraft> = {}): EscapeDraft {
  return { ...emptyEscapeDraft(), ...over };
}

const GOOD = draft({ want: 'Referral page', numberMoves: 'referral applies', byWhen: '2026-11-10', howKnow: 'LINE OA count', betId: 'a' });

test('six steps in spec order; result step follows the last question', () => {
  assert.equal(STEP_COUNT, 6);
  assert.deepEqual(ESCAPE_STEPS.map((s) => s.key), ['want', 'numberMoves', 'byWhen', 'howKnow', 'betId', 'avoiding']);
  assert.equal(RESULT_STEP, 6);
  assert.equal(progressText(0), 'Step 1 of 6');
  assert.equal(progressText(5), 'Step 6 of 6');
  assert.equal(progressText(6), 'All answered');
});

test('clampStep keeps the step in range', () => {
  assert.equal(clampStep(-3), 0);
  assert.equal(clampStep(99), RESULT_STEP);
  assert.equal(clampStep(2.7), 2);
  assert.equal(clampStep(Number.NaN), 0);
});

test('nextStep advances, or returns to the result when editing', () => {
  assert.equal(nextStep(draft({ step: 0 })), 1);
  assert.equal(nextStep(draft({ step: 5 })), RESULT_STEP);
  assert.equal(nextStep(draft({ step: 6 })), RESULT_STEP);
  assert.equal(nextStep(draft({ step: 1, editing: true })), RESULT_STEP);
});

test('only the idea is required; number and date may be empty; a past date is blocked', () => {
  assert.equal(stepError(draft(), 0, TODAY), 'Name it in a few words first.');
  assert.equal(stepError(draft({ want: '   ' }), 0, TODAY), 'Name it in a few words first.');
  assert.equal(stepError(draft({ want: 'x' }), 0, TODAY), null);
  assert.equal(stepError(draft(), 1, TODAY), null);
  assert.equal(stepError(draft(), 2, TODAY), null, 'no date is allowed (it parks)');
  assert.equal(stepError(draft({ byWhen: 'nope' }), 2, TODAY), 'Pick a date, or leave it empty.');
  assert.equal(stepError(draft({ byWhen: '2026-10-27' }), 2, TODAY), STEP_COPY.pastDate);
  assert.equal(stepError(draft({ byWhen: TODAY }), 2, TODAY), null, 'today is fine');
  assert.equal(stepError(draft({ byWhen: '2027-03-01' }), 2, TODAY), null, 'far is allowed (it parks)');
  assert.equal(stepError(draft({ byWhen: '2026-10-27' }), 3, TODAY), null, 'only checked on the date step');
  assert.equal(stepError(draft(), 4, TODAY), null);
});

test('draftHasContent', () => {
  assert.equal(draftHasContent(draft()), false);
  assert.equal(draftHasContent(draft({ want: '  ' })), false);
  assert.equal(draftHasContent(draft({ betId: NO_BET })), true);
  assert.equal(draftHasContent(GOOD), true);
});

test('byWhenHint flags past and >30 days, stays calm otherwise', () => {
  assert.equal(byWhenHint('', TODAY).tone, 'muted');
  assert.match(byWhenHint('', TODAY).text, /leans toward parking/);
  assert.doesNotMatch(byWhenHint('', TODAY).text, /soon/i);
  assert.deepEqual(byWhenHint('2026-10-29', TODAY), { text: 'Tomorrow.', tone: 'muted' });
  assert.deepEqual(byWhenHint('2026-11-27', TODAY), { text: 'In 30 days.', tone: 'muted' });
  const far = byWhenHint('2026-11-28', TODAY);
  assert.equal(far.tone, 'warn');
  assert.match(far.text, /^In 31 days — more than 30 days out/);
  const past = byWhenHint('2026-10-26', TODAY);
  assert.equal(past.tone, 'warn');
  assert.match(past.text, /2 days ago/);
  assert.equal(byWhenHint('garbage', TODAY).tone, 'warn');
});

test('quickDates are within the 30-day window', () => {
  assert.deepEqual(quickDates(TODAY).map((q) => q.value), ['2026-11-04', '2026-11-11', '2026-11-27']);
});

test('betChoices lists active bets then None', () => {
  assert.deepEqual(betChoices(BETS), [
    { value: 'a', label: 'SHIFT' }, { value: 'b', label: 'School' }, { value: NO_BET, label: 'None' },
  ]);
  assert.deepEqual(betChoices([]), [{ value: NO_BET, label: 'None' }]);
});

test('betLabel', () => {
  assert.equal(betLabel('', BETS), 'Not picked');
  assert.equal(betLabel(NO_BET, BETS), 'None');
  assert.equal(betLabel('a', BETS), 'SHIFT');
  assert.equal(betLabel('p', BETS), 'Side project (not active)');
  assert.equal(betLabel('gone', BETS), 'A bet that no longer exists');
});

test('verdict follows the spec rule', () => {
  assert.equal(draftVerdict(GOOD, BETS, TODAY), 'go');
  assert.equal(draftVerdict({ ...GOOD, numberMoves: '  ' }, BETS, TODAY), 'park');
  assert.equal(draftVerdict({ ...GOOD, betId: NO_BET }, BETS, TODAY), 'park');
  assert.equal(draftVerdict({ ...GOOD, betId: '' }, BETS, TODAY), 'park');
  assert.equal(draftVerdict({ ...GOOD, betId: 'p' }, BETS, TODAY), 'park');
  assert.equal(draftVerdict({ ...GOOD, betId: 'gone' }, BETS, TODAY), 'park');
  assert.equal(draftVerdict({ ...GOOD, byWhen: '2026-11-28' }, BETS, TODAY), 'park');
  assert.equal(draftVerdict({ ...GOOD, byWhen: '2026-11-27' }, BETS, TODAY), 'go');
  // No date, or a date already past, parks (core escapeVerdict rule).
  assert.equal(draftVerdict({ ...GOOD, byWhen: '' }, BETS, TODAY), 'park');
  assert.equal(draftVerdict({ ...GOOD, byWhen: '2026-10-27' }, BETS, TODAY), 'park');
});

test('recommendation copy: go is primary when clear, park lists reasons', () => {
  const go = recommendation(GOOD, BETS, TODAY);
  assert.equal(go.verdict, 'go');
  assert.equal(go.primaryLabel, 'Go for 90 min');
  assert.equal(go.overrideLabel, 'Park it anyway');
  assert.deepEqual(go.reasons, []);
  // Never "soon" without a date: Go names the bet, the number and the date.
  assert.doesNotMatch(go.body, /soon/i);
  assert.equal(go.body, 'It’s tied to SHIFT, and you’d see referral applies move by Tue 10 Nov. Give it 90 min, then write what moved.');

  const park = recommendation({ ...GOOD, numberMoves: '', betId: NO_BET }, BETS, TODAY);
  assert.equal(park.verdict, 'park');
  assert.equal(park.primaryLabel, 'Park it');
  assert.equal(park.overrideLabel, 'Go anyway (90 min)');
  assert.equal(park.reasons.length, 2);
  assert.match(park.reasons[0], /number/i);
});

test('the walkthrough case parks: no date, and a past date, each give a reason', () => {
  const noDate = recommendation({ ...GOOD, byWhen: '' }, BETS, TODAY);
  assert.equal(noDate.verdict, 'park');
  assert.deepEqual(noDate.reasons, ['There’s no date yet for when you’d see it move.']);
  const past = recommendation({ ...GOOD, byWhen: '2026-10-01' }, BETS, TODAY);
  assert.deepEqual(past.reasons, ['That date has already passed.']);
  assert.deepEqual(draftReasons({ ...GOOD, numberMoves: '', byWhen: '' }, BETS, TODAY).map((r) => r.field), ['numberMoves', 'byWhen']);
});

test('result buttons: a named avoidance comes first, then the recommendation, then the other way', () => {
  const go = recommendation(GOOD, BETS, TODAY);
  assert.deepEqual(resultActions(go, GOOD).map((a) => a.kind), ['go', 'park']);
  const avoiding = { ...GOOD, avoiding: ' the tax call ' };
  assert.deepEqual(resultActions(go, avoiding), [
    { kind: 'avoid-first', label: `Do that first (${AVOID_FIRST_MIN} min)` },
    { kind: 'go', label: 'Go for 90 min' },
    { kind: 'park', label: 'Park it anyway' },
  ]);
  const park = recommendation({ ...avoiding, byWhen: '' }, BETS, TODAY);
  assert.deepEqual(resultActions(park, avoiding).map((a) => a.kind), ['avoid-first', 'park', 'go']);
  // After the ten minutes, the decision is the main call again.
  assert.deepEqual(resultActions(park, { ...avoiding, avoidFirstAt: '2026-10-28T03:00:00.000Z' }).map((a) => a.kind), ['park', 'go']);
});

test('avoiding copy names it and offers ten minutes first', () => {
  assert.equal(avoidingCopy(GOOD), null);
  const c = avoidingCopy({ ...GOOD, avoiding: ' the tax call ' });
  assert.equal(c?.title, 'Do that first?');
  assert.match(c?.body ?? '', /^You said you’re avoiding: the tax call\. Do that first \(10 min\)/);
  assert.equal(avoidingCopy({ ...GOOD, avoiding: 'x', avoidFirstAt: '2026-10-28T03:00:00.000Z' })?.title, 'You gave it ten minutes');
  assert.equal(avoidTimerNote('  the   tax call '), 'First: the tax call');
});

test('anchor first: only when today’s anchor is set and not done', () => {
  assert.equal(anchorFirst(undefined), null);
  assert.equal(anchorFirst({ date: TODAY, actions: [] }), null);
  assert.equal(anchorFirst({ date: TODAY, actions: [], anchor: { text: ' DM 5 parents ', done: false } }), 'DM 5 parents');
  assert.equal(anchorFirst({ date: TODAY, actions: [], anchor: { text: 'DM 5 parents', done: true } }), null);
  assert.equal(anchorFirst({ date: TODAY, actions: [], anchor: { text: '  ', done: false } }), null);
});

test('Go timer: recommended Go is time-boxed build; Go after a Park counts as escape', () => {
  assert.deepEqual(goTimerPlan('go', 'Alumni board', 90), {
    category: 'build', opts: { note: 'Escape check: Alumni board', timeboxMin: 90, source: 'escape', overridden: false },
  });
  assert.deepEqual(goTimerPlan('park', 'Alumni board', 90), {
    category: 'escape', opts: { note: 'Escape check: Alumni board', timeboxMin: 90, source: 'escape', overridden: true },
  });
  assert.equal(goToastCopy(false), 'Go. 90 minutes on the clock, then write what moved.');
  assert.equal(goToastCopy(true, 45), 'Your call. 45 minutes on the clock, counted as escape time.');
});

test('the draft survives a reload: saved, read back, capped, and dropped when stale', () => {
  const now = new Date('2026-10-28T03:00:00.000Z');
  assert.equal(ESCAPE_DRAFT_KEY.startsWith('anchor:'), true, 'erase removes it');
  const d = draft({ ...GOOD, step: 4, avoiding: 'the tax call', worryText: 'the tax call', fromIdeaId: 'i1', avoidFirstAt: now.toISOString(), error: 'x', focusPending: true });
  const back = parseEscapeDraft(serializeEscapeDraft(d, now), new Date(now.getTime() + 60_000));
  assert.ok(back);
  assert.deepEqual({ ...back, resumed: undefined }, { ...d, error: null, focusPending: false, editing: false, resumed: undefined });
  assert.equal(parseEscapeDraft(serializeEscapeDraft(d, now), new Date(now.getTime() + 13 * 3_600_000)), null, 'older than 12 h');
  assert.equal(parseEscapeDraft(serializeEscapeDraft(d, now), new Date(now.getTime() - 3_600_000)), null, 'from the future');
  assert.equal(parseEscapeDraft(serializeEscapeDraft(emptyEscapeDraft(), now), now), null, 'nothing to resume');
  assert.equal(parseEscapeDraft(null, now), null);
  assert.equal(parseEscapeDraft('not json', now), null);
  assert.equal(parseEscapeDraft('{"v":2}', now), null);
  const odd = parseEscapeDraft(JSON.stringify({
    v: 1, savedAt: now.toISOString(), step: 99, want: 'x'.repeat(500), numberMoves: 7, betId: { a: 1 }, editing: 'yes',
  }), now);
  assert.equal(odd?.step, RESULT_STEP);
  assert.equal(odd?.want.length, 200);
  assert.equal(odd?.numberMoves, '');
  assert.equal(odd?.betId, '');
  assert.equal(odd?.editing, false);
  const noIdea = parseEscapeDraft(JSON.stringify({ v: 1, savedAt: now.toISOString(), step: 3, howKnow: 'h' }), now);
  assert.equal(noIdea?.step, 0, 'never resumes past an empty first answer');
  const editing = parseEscapeDraft(serializeEscapeDraft(draft({ ...GOOD, step: 2, editing: true }), now), now);
  assert.equal(editing?.editing, false, 'editing only makes sense from the result');
});

test('summaryRows flag empty number, inactive bet and far dates', () => {
  const rows = summaryRows({ ...GOOD, numberMoves: '', betId: 'p', byWhen: '2026-12-30' }, BETS, TODAY);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((r) => r.step), [0, 1, 2, 3, 4, 5]);
  const by = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(by['Number'].flagged, true);
  assert.equal(by['Number'].value, 'No number yet');
  assert.equal(by['Bet'].flagged, true);
  assert.equal(by['By when'].flagged, true);
  assert.equal(by['Idea'].flagged, false);
  const ok = Object.fromEntries(summaryRows(GOOD, BETS, TODAY).map((r) => [r.label, r]));
  assert.equal(ok['Bet'].flagged, false);
  assert.equal(ok['By when'].flagged, false);
  assert.match(ok['By when'].value, /in 13 days/);
});

test('summaryRows flag a missing or past date too', () => {
  const none = Object.fromEntries(summaryRows({ ...GOOD, byWhen: '' }, BETS, TODAY).map((r) => [r.label, r]));
  assert.equal(none['By when'].flagged, true);
  assert.equal(none['By when'].value, 'No date');
  const past = Object.fromEntries(summaryRows({ ...GOOD, byWhen: '2026-10-26' }, BETS, TODAY).map((r) => [r.label, r]));
  assert.equal(past['By when'].flagged, true);
  assert.match(past['By when'].value, /2 days ago/);
  assert.equal(past['Number'].flagged, false);
});

test('buildEscapeCheck trims, drops empties, records recommended vs chosen', () => {
  const c = buildEscapeCheck({ ...GOOD, want: '  Referral page ', avoiding: '  ' }, {
    id: 'e1', at: '2026-10-28T03:00:00.000Z', today: TODAY, bets: BETS, verdict: 'go',
  });
  assert.deepEqual(c, {
    id: 'e1', at: '2026-10-28T03:00:00.000Z', want: 'Referral page', numberMoves: 'referral applies',
    howKnow: 'LINE OA count', recommended: 'go', verdict: 'go', byWhen: '2026-11-10', betId: 'a', timeboxMin: 90,
  });

  const parkedOverride = buildEscapeCheck({ ...GOOD, betId: NO_BET, byWhen: '', avoiding: ' a call ' }, {
    id: 'e2', at: '2026-10-28T03:00:00.000Z', today: TODAY, bets: BETS, verdict: 'go', timeboxMin: 45,
  });
  assert.equal(parkedOverride.recommended, 'park');
  assert.equal(parkedOverride.verdict, 'go');
  assert.equal(parkedOverride.betId, undefined);
  assert.equal(parkedOverride.byWhen, undefined);
  assert.equal(parkedOverride.avoiding, 'a call');
  assert.equal(parkedOverride.timeboxMin, 45);
  assert.equal('byWhen' in parkedOverride, false);

  const park = buildEscapeCheck(GOOD, { id: 'e3', at: '2026-10-28T03:00:00.000Z', today: TODAY, bets: BETS, verdict: 'park' });
  assert.equal(park.recommended, 'go');
  assert.equal(park.verdict, 'park');
  assert.equal('timeboxMin' in park, false);
});

test('buildParkedIdea links back to the check', () => {
  const c = buildEscapeCheck(GOOD, { id: 'e1', at: '2026-10-28T03:00:00.000Z', today: TODAY, bets: BETS, verdict: 'park' });
  assert.deepEqual(buildParkedIdea(c, 'p1'), { id: 'p1', text: 'Referral page', at: '2026-10-28T03:00:00.000Z', fromEscapeId: 'e1' });
});

test('worry offer appears once per distinct text', () => {
  assert.equal(canOfferWorry(draft()), false);
  assert.equal(canOfferWorry(draft({ avoiding: ' a call ' })), true);
  assert.equal(canOfferWorry(draft({ avoiding: ' a call ', worryText: 'a call' })), false);
  assert.equal(canOfferWorry(draft({ avoiding: 'a call, and email', worryText: 'a call' })), true);
  assert.deepEqual(buildWorry('  x ', 'w1', '2026-10-28T03:00:00.000Z'), { id: 'w1', at: '2026-10-28T03:00:00.000Z', text: 'x' });
});

test('goTimerNote says it came from an escape check, and is capped', () => {
  assert.equal(goTimerNote('  Referral   page '), 'Escape check: Referral page');
  const long = goTimerNote('x'.repeat(200));
  assert.equal(long.length, 'Escape check: '.length + 80);
  assert.ok(long.endsWith('…'));
});

test('parking and week copy', () => {
  assert.equal(parkingCountCopy(1), 'Parked. It’s the only idea in the parking lot.');
  assert.equal(parkingCountCopy(4), 'Parked. 4 ideas in the parking lot.');
  assert.equal(weekLine(0, 0, 0), '');
  assert.equal(weekLine(1, 2, 0), 'This week: 1 go · 2 parked.');
  assert.equal(weekLine(0, 0, 1), '1 idea waiting in the parking lot.');
  assert.equal(weekLine(1, 0, 3), 'This week: 1 go · 0 parked. 3 ideas waiting in the parking lot.');
});
