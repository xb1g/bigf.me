import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bet, ParkedIdea } from '../core/types.ts';
import { wipStatus } from '../core/metrics.ts';
import {
  activateBet, applyDecision, betFromForm, closedOn, decisionLabel, decisionsNewestFirst, defaultNextReview,
  formFromBet, formFromParkedIdea, groupBets, hasErrors, ideaToBetName, isUnwritten, isWonDecision, killLesson,
  makeRoomWhy, markWonBet, newBetForm, overdueBets, overLimitWhy, parkBet, parkingNewestFirst, planActivation,
  reviewInfo, reviveBet, validateBetForm, validateDecision, wipCopy, IDEA_NAME_MAX, WON_WHY,
} from './bets.logic.ts';

const TODAY = '2026-10-28';

function bet(over: Partial<Bet> = {}): Bet {
  return {
    id: over.id ?? 'b1', name: 'Bet', hypothesis: 'h', metric: 'm', continueIf: 'c', killIf: 'k',
    reviewOn: '2026-12-01', status: 'active', notes: '', createdAt: '2026-10-01T00:00:00.000Z', decisions: [],
    ...over,
  };
}

test('isUnwritten treats empty and the seed placeholder as unwritten', () => {
  assert.equal(isUnwritten(''), true);
  assert.equal(isUnwritten('   '), true);
  assert.equal(isUnwritten(undefined), true);
  assert.equal(isUnwritten('(fill in)'), true);
  assert.equal(isUnwritten(' (Fill in) '), true);
  assert.equal(isUnwritten('Paid seats'), false);
});

test('groupBets splits by status and sorts overdue first, then soonest review', () => {
  const bets = [
    bet({ id: 'a', name: 'Later', reviewOn: '2026-12-20' }),
    bet({ id: 'b', name: 'Soon', reviewOn: '2026-11-01' }),
    bet({ id: 'c', name: 'Overdue', reviewOn: '2026-10-20' }),
    bet({ id: 'p1', status: 'parked', reviewOn: '2026-12-31', name: 'P1' }),
    bet({ id: 'p2', status: 'parked', reviewOn: '2026-10-01', name: 'P2' }),
    bet({ id: 'k', status: 'killed', decisions: [{ date: '2026-10-10', verdict: 'kill', why: 'x' }] }),
    bet({ id: 'w', status: 'won', decisions: [{ date: '2026-10-15', verdict: 'continue', why: 'y' }] }),
  ];
  const g = groupBets(bets, TODAY);
  assert.deepEqual(g.active.map((b) => b.id), ['c', 'b', 'a']);
  assert.deepEqual(g.parked.map((b) => b.id), ['p2', 'p1']);
  assert.deepEqual(g.closed.map((b) => b.id), ['w', 'k']);
  // input not mutated
  assert.equal(bets[0].id, 'a');
});

test('closedOn falls back to the Bangkok date the bet was created', () => {
  assert.equal(closedOn(bet({ status: 'won' })), '2026-10-01');
  // 20:00 UTC on 30 Sep is 03:00 on 1 Oct in Bangkok: slicing the UTC string would say 30 Sep.
  assert.equal(closedOn(bet({ status: 'won', createdAt: '2026-09-30T20:00:00.000Z' })), '2026-10-01');
  assert.equal(closedOn(bet({ status: 'won', createdAt: '2026-09-30T16:59:59.000Z' })), '2026-09-30');
});

test('markWonBet logs a dated "Won" decision, so the close date is the day it was won', () => {
  const old = bet({ decisions: [{ date: '2026-08-01', verdict: 'change', why: 'New price' }] });
  const won = markWonBet(old, TODAY);
  assert.equal(won.status, 'won');
  assert.equal(won.decisions.length, 2);
  assert.deepEqual(won.decisions[1], { date: TODAY, verdict: 'continue', why: WON_WHY });
  assert.equal(old.status, 'active', 'input untouched');
  assert.equal(old.decisions.length, 1);
  assert.equal(closedOn(won), TODAY, 'not the August decision');
  assert.equal(isWonDecision(won.decisions[1]), true);
  assert.equal(isWonDecision(won.decisions[0]), false);
  assert.equal(isWonDecision({ date: TODAY, verdict: 'continue', why: 'Numbers hold' }), false);
  assert.equal(decisionLabel(won.decisions[1]), 'Won');
  assert.equal(decisionLabel(won.decisions[0]), 'Change');
  assert.equal(decisionsNewestFirst(won)[0].why, WON_WHY);
  // Grouped as closed, newest close first.
  const g = groupBets([bet({ id: 'k', status: 'killed', decisions: [{ date: '2026-10-10', verdict: 'kill', why: 'x' }] }), { ...won, id: 'w' }], TODAY);
  assert.deepEqual(g.closed.map((b) => b.id), ['w', 'k']);
  // A won bet brought back keeps its log.
  assert.equal(reviveBet(won, TODAY).decisions.length, 2);
});

test('reviewInfo wording and tone', () => {
  assert.deepEqual(reviewInfo(bet({ reviewOn: '2026-10-25' }), TODAY), { overdue: true, days: -3, text: 'Review was due 3 days ago', tone: 'warn' });
  assert.equal(reviewInfo(bet({ reviewOn: '2026-10-27' }), TODAY).text, 'Review was due yesterday');
  assert.deepEqual(reviewInfo(bet({ reviewOn: TODAY }), TODAY), { overdue: false, days: 0, text: 'Review today', tone: 'data' });
  assert.equal(reviewInfo(bet({ reviewOn: '2026-10-29' }), TODAY).text, 'Review tomorrow');
  assert.deepEqual(reviewInfo(bet({ reviewOn: '2026-11-07' }), TODAY), { overdue: false, days: 10, text: 'Review in 10 days', tone: 'muted' });
  assert.equal(reviewInfo(bet({ status: 'parked', reviewOn: '2026-10-01' }), TODAY).overdue, true);
  assert.deepEqual(reviewInfo(bet({ status: 'killed', reviewOn: '2026-10-01' }), TODAY), { overdue: false, days: null, text: '', tone: 'muted' });
});

test('overdueBets includes active and parked only', () => {
  const bets = [
    bet({ id: 'a', reviewOn: '2026-10-01' }),
    bet({ id: 'p', status: 'parked', reviewOn: '2026-10-27' }),
    bet({ id: 'k', status: 'killed', reviewOn: '2026-10-01' }),
    bet({ id: 'f', reviewOn: TODAY }),
  ];
  assert.deepEqual(overdueBets(bets, TODAY).map((b) => b.id), ['a', 'p']);
});

test('wipCopy covers room, at limit and over', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => bet({ id: `x${i}` }));
  assert.equal(wipCopy(wipStatus(mk(1), 3)), '1 of 3 active. Room for 2 more.');
  assert.equal(wipCopy(wipStatus(mk(2), 3)), '2 of 3 active. Room for one more.');
  assert.equal(wipCopy(wipStatus(mk(3), 3)), '3 of 3 active. Park one before starting another.');
  assert.equal(wipCopy(wipStatus(mk(4), 3)), '4 active, limit 3. Park one to get back under.');
});

test('defaultNextReview: +14 continue/change, +30 park, none for kill', () => {
  assert.equal(defaultNextReview('continue', TODAY), '2026-11-11');
  assert.equal(defaultNextReview('change', TODAY), '2026-11-11');
  assert.equal(defaultNextReview('park', TODAY), '2026-11-27');
  assert.equal(defaultNextReview('kill', TODAY), '');
  assert.equal(defaultNextReview('', TODAY), '');
});

test('validateDecision requires a verdict and a why; next review for non-kill', () => {
  const e = validateDecision({ verdict: '', why: ' ', nextReview: '' }, TODAY);
  assert.ok(e.verdict);
  assert.ok(e.why);
  assert.equal(e.nextReview, undefined);
  assert.equal(validateDecision({ verdict: 'kill', why: '', nextReview: '' }, TODAY).why, 'One line on what it taught you.');
  assert.equal(hasErrors(validateDecision({ verdict: 'kill', why: 'Nobody paid.', nextReview: '' }, TODAY)), false);
  assert.equal(validateDecision({ verdict: 'continue', why: 'ok', nextReview: '' }, TODAY).nextReview, 'Pick a date for the next look.');
  assert.equal(validateDecision({ verdict: 'continue', why: 'ok', nextReview: '2026-10-01' }, TODAY).nextReview, 'Pick today or later.');
  assert.equal(hasErrors(validateDecision({ verdict: 'change', why: 'ok', nextReview: TODAY }, TODAY)), false);
});

test('applyDecision continue appends the decision and pushes review +14 by default', () => {
  const b = bet({ reviewOn: '2026-10-20' });
  const out = applyDecision(b, { verdict: 'continue', why: '  12 paid seats  ', nextReview: defaultNextReview('continue', TODAY) }, TODAY);
  assert.equal(out.status, 'active');
  assert.equal(out.reviewOn, '2026-11-11');
  assert.deepEqual(out.decisions, [{ date: TODAY, verdict: 'continue', why: '12 paid seats' }]);
  assert.equal(b.decisions.length, 0, 'input untouched');
  assert.equal(b.reviewOn, '2026-10-20');
});

test('applyDecision change keeps status and uses the chosen date', () => {
  const out = applyDecision(bet({ status: 'parked' }), { verdict: 'change', why: 'new price', nextReview: '2026-11-05' }, TODAY);
  assert.equal(out.status, 'parked');
  assert.equal(out.reviewOn, '2026-11-05');
});

test('applyDecision park and kill set status; kill keeps reviewOn', () => {
  const parked = applyDecision(bet(), { verdict: 'park', why: 'later', nextReview: '2026-11-27' }, TODAY);
  assert.equal(parked.status, 'parked');
  assert.equal(parked.reviewOn, '2026-11-27');
  const killed = applyDecision(bet({ reviewOn: '2026-10-01' }), { verdict: 'kill', why: 'No one paid.', nextReview: '' }, TODAY);
  assert.equal(killed.status, 'killed');
  assert.equal(killed.reviewOn, '2026-10-01');
  assert.equal(killLesson(killed), 'No one paid.');
});

test('applyDecision throws without a why', () => {
  assert.throws(() => applyDecision(bet(), { verdict: 'continue', why: '', nextReview: '2026-11-11' }, TODAY));
  assert.throws(() => applyDecision(bet(), { verdict: '', why: 'x', nextReview: '2026-11-11' }, TODAY));
});

test('decisionsNewestFirst orders by date then append order', () => {
  const b = bet({
    decisions: [
      { date: '2026-10-01', verdict: 'continue', why: 'a' },
      { date: '2026-10-10', verdict: 'change', why: 'b' },
      { date: '2026-10-10', verdict: 'park', why: 'c' },
    ],
  });
  assert.deepEqual(decisionsNewestFirst(b).map((d) => d.why), ['c', 'b', 'a']);
  assert.equal(b.decisions[0].why, 'a');
});

test('killLesson returns the last kill why, or empty', () => {
  assert.equal(killLesson(bet()), '');
  assert.equal(killLesson(bet({ decisions: [{ date: TODAY, verdict: 'kill', why: 'one' }, { date: TODAY, verdict: 'kill', why: 'two' }] })), 'two');
});

test('planActivation reports room, need for room, already active and missing', () => {
  const bets = [bet({ id: 'a' }), bet({ id: 'b' }), bet({ id: 'p', status: 'parked' })];
  assert.deepEqual(planActivation(bets, 'p', 3), { kind: 'ok' });
  const r = planActivation(bets, 'p', 2);
  assert.equal(r.kind, 'needs-room');
  assert.deepEqual(r.kind === 'needs-room' && r.active.map((b) => b.id), ['a', 'b']);
  assert.deepEqual(planActivation(bets, 'a', 2), { kind: 'already-active' });
  assert.deepEqual(planActivation(bets, 'zzz', 2), { kind: 'missing' });
});

test('activateBet enforces the WIP limit', () => {
  const bets = [bet({ id: 'a' }), bet({ id: 'b' }), bet({ id: 'p', status: 'parked', name: 'New thing' })];
  assert.throws(() => activateBet(bets, 'p', { max: 2, today: TODAY }), /WIP limit/);
  assert.equal(bets[2].status, 'parked');
});

test('activateBet parks the chosen bet with a logged reason, then activates', () => {
  const bets = [bet({ id: 'a', reviewOn: '2026-10-01' }), bet({ id: 'b' }), bet({ id: 'p', status: 'parked', name: 'New thing', reviewOn: '2026-10-02' })];
  activateBet(bets, 'p', { max: 2, today: TODAY, parkId: 'a' });
  assert.equal(bets[0].status, 'parked');
  assert.equal(bets[0].reviewOn, '2026-11-27', 'past review moved out');
  assert.deepEqual(bets[0].decisions.at(-1), { date: TODAY, verdict: 'park', why: 'Parked to make room for New thing.' });
  assert.equal(bets[2].status, 'active');
  assert.equal(bets[2].reviewOn, '2026-11-11', 'past review moved to +14');
  assert.equal(bets.filter((b) => b.status === 'active').length, 2);
});

test('activateBet keeps a future reviewOn and rejects bad park ids', () => {
  const bets = [bet({ id: 'a' }), bet({ id: 'p', status: 'parked', reviewOn: '2026-12-31' })];
  activateBet(bets, 'p', { max: 3, today: TODAY });
  assert.equal(bets[1].reviewOn, '2026-12-31');
  const bets2 = [bet({ id: 'a' }), bet({ id: 'p', status: 'parked' }), bet({ id: 'q', status: 'parked' })];
  assert.throws(() => activateBet(bets2, 'p', { max: 1, today: TODAY, parkId: 'q' }), /not found/);
  assert.throws(() => activateBet(bets2, 'missing', { max: 3, today: TODAY }), /not found/);
});

test('activateBet on an already active bet is a no-op', () => {
  const bets = [bet({ id: 'a' })];
  activateBet(bets, 'a', { max: 1, today: TODAY });
  assert.equal(bets[0].status, 'active');
});

test('parkBet keeps future review, logs why', () => {
  const out = parkBet(bet({ reviewOn: '2026-12-01' }), overLimitWhy(3), TODAY);
  assert.equal(out.status, 'parked');
  assert.equal(out.reviewOn, '2026-12-01');
  assert.equal(out.decisions[0].why, 'Parked to stay within 3 active bets.');
  assert.equal(overLimitWhy(1), 'Parked to stay within 1 active bet.');
  assert.equal(makeRoomWhy('  '), 'Parked to make room for another bet.');
});

test('reviveBet returns a closed bet as parked with a fresh review date', () => {
  const out = reviveBet(bet({ status: 'killed', reviewOn: '2026-09-01' }), TODAY);
  assert.equal(out.status, 'parked');
  assert.equal(out.reviewOn, '2026-11-11');
  assert.equal(reviveBet(bet({ status: 'won', reviewOn: '2027-01-01' }), TODAY).reviewOn, '2027-01-01');
});

test('newBetForm starts active only when there is room', () => {
  assert.equal(newBetForm(TODAY, { canActivate: true }).status, 'active');
  const f = newBetForm(TODAY, { canActivate: false });
  assert.equal(f.status, 'parked');
  assert.equal(f.reviewOn, '2026-11-11');
});

test('validateBetForm needs a name and a review date', () => {
  const f = newBetForm(TODAY, { canActivate: true });
  assert.deepEqual(validateBetForm(f), { name: 'Give it a short name.' });
  assert.deepEqual(validateBetForm({ ...f, name: 'X', reviewOn: '' }), { reviewOn: 'Pick a review date.' });
  assert.equal(hasErrors(validateBetForm({ ...f, name: 'X' })), false);
});

test('betFromForm creates a trimmed new bet', () => {
  const now = new Date('2026-10-28T03:00:00.000Z');
  const f = { ...newBetForm(TODAY, { canActivate: false }), name: '  School   SHIFT ', hypothesis: ' h ' };
  const b = betFromForm(f, { id: 'new1', now });
  assert.equal(b.id, 'new1');
  assert.equal(b.name, 'School SHIFT');
  assert.equal(b.hypothesis, 'h');
  assert.equal(b.status, 'parked');
  assert.equal(b.createdAt, now.toISOString());
  assert.deepEqual(b.decisions, []);
});

test('betFromForm edit keeps id, status, createdAt and decisions', () => {
  const existing = bet({ id: 'e', status: 'killed', decisions: [{ date: TODAY, verdict: 'kill', why: 'x' }] });
  const f = { ...formFromBet(existing), name: 'Renamed', status: 'active' as const };
  const b = betFromForm(f, { id: 'ignored', now: new Date(), existing });
  assert.equal(b.id, 'e');
  assert.equal(b.status, 'killed');
  assert.equal(b.name, 'Renamed');
  assert.equal(b.createdAt, existing.createdAt);
  assert.equal(b.decisions.length, 1);
});

test('formFromBet maps closed statuses to parked for the form', () => {
  assert.equal(formFromBet(bet({ status: 'won' })).status, 'parked');
  assert.equal(formFromBet(bet()).status, 'active');
});

test('ideaToBetName uses the first non-empty line and shortens long text', () => {
  assert.equal(ideaToBetName('\n  A  tiny   app \nmore detail'), 'A tiny app');
  const long = 'word '.repeat(40);
  const name = ideaToBetName(long);
  assert.ok(name.length <= IDEA_NAME_MAX);
  assert.ok(name.endsWith('…'));
  assert.equal(ideaToBetName(''), '');
});

test('formFromParkedIdea prefills the name and starts parked', () => {
  const idea: ParkedIdea = { id: 'i1', text: 'Alumni Discord bot', at: '2026-10-20T10:00:00.000Z' };
  const f = formFromParkedIdea(idea, TODAY);
  assert.equal(f.name, 'Alumni Discord bot');
  assert.equal(f.status, 'parked');
  assert.equal(f.notes, '');
  const f2 = formFromParkedIdea({ ...idea, text: 'Line one\nLine two' }, TODAY);
  assert.equal(f2.name, 'Line one');
  assert.equal(f2.notes, 'From the parking lot: Line one\nLine two');
});

test('parkingNewestFirst sorts by time without mutating', () => {
  const list: ParkedIdea[] = [
    { id: 'a', text: 'a', at: '2026-10-01T00:00:00.000Z' },
    { id: 'b', text: 'b', at: '2026-10-20T00:00:00.000Z' },
  ];
  assert.deepEqual(parkingNewestFirst(list).map((x) => x.id), ['b', 'a']);
  assert.equal(list[0].id, 'a');
});
