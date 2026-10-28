import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnchorState, HeavyItem, Worry } from '../core/types.ts';
import { emptyState } from '../core/seed.ts';
import {
  BREATH_LABEL_BLOCK_PX, BREATH_LABEL_PX, BREATH_LEAD_IN, BREATH_PHASES, BREATH_ROUNDS, BREATH_SCALE_MIN,
  BREATH_SQUARE_PX, NO_NEXT_STEP_COPY, RESET_TOTAL_SEC, HEAVY_ERROR_COPY,
  addWorry, breathAt, breathDotTarget, breathOrbPx, breathScale, buildHeavyItem, deadlineInfo, deleteHeavyItem,
  deleteWorry, emptyHeavyForm, formatRemaining, hasErrors, heavyFormFromItem, linkWorryToItem, linkWorryWithStep,
  linkedPreview, linkedWorries, nearestHeavy, needsNextStep, restoreWorry, setHeavyStatus, setWorryTriage,
  sortActiveHeavy, sortDoneHeavy, titleFromWorry, validateHeavyForm, widthInCircle, worryBuckets,
} from './heavy.logic.ts';

const T = '2026-10-28T03:00:00.000Z';

function item(p: Partial<HeavyItem> & { id: string }): HeavyItem {
  return { title: p.id, kind: 'other', nextAction: 'step', status: 'open', notes: '', updatedAt: T, ...p };
}

function state(): AnchorState {
  return emptyState(new Date(T));
}

test('sortActiveHeavy: nearest deadline first, undated last, done excluded', () => {
  const items = [
    item({ id: 'undated' }),
    item({ id: 'late', deadline: '2026-11-20' }),
    item({ id: 'done', deadline: '2026-10-01', status: 'done' }),
    item({ id: 'overdue', deadline: '2026-10-20' }),
    item({ id: 'soon', deadline: '2026-10-30', status: 'waiting' }),
  ];
  assert.deepEqual(sortActiveHeavy(items).map((i) => i.id), ['overdue', 'soon', 'late', 'undated']);
});

test('sortActiveHeavy: ties → open before waiting, then newest touch', () => {
  const items = [
    item({ id: 'w', status: 'waiting', updatedAt: '2026-10-28T05:00:00.000Z' }),
    item({ id: 'old', updatedAt: '2026-10-01T00:00:00.000Z' }),
    item({ id: 'new', updatedAt: '2026-10-27T00:00:00.000Z' }),
  ];
  assert.deepEqual(sortActiveHeavy(items).map((i) => i.id), ['new', 'old', 'w']);
});

test('sortActiveHeavy does not mutate input; invalid deadline counts as undated', () => {
  const items = [item({ id: 'bad', deadline: 'soon' }), item({ id: 'ok', deadline: '2026-12-01' })];
  const copy = items.map((i) => i.id);
  assert.deepEqual(sortActiveHeavy(items).map((i) => i.id), ['ok', 'bad']);
  assert.deepEqual(items.map((i) => i.id), copy);
});

test('sortDoneHeavy: only done, newest first', () => {
  const items = [
    item({ id: 'a', status: 'done', updatedAt: '2026-10-01T00:00:00.000Z' }),
    item({ id: 'b', status: 'done', updatedAt: '2026-10-05T00:00:00.000Z' }),
    item({ id: 'c' }),
  ];
  assert.deepEqual(sortDoneHeavy(items).map((i) => i.id), ['b', 'a']);
});

test('nearestHeavy', () => {
  assert.equal(nearestHeavy([]), null);
  assert.equal(nearestHeavy([item({ id: 'x', status: 'done' })]), null);
  assert.equal(nearestHeavy([item({ id: 'a' }), item({ id: 'b', deadline: '2027-01-01' })])?.id, 'b');
});

test('deadlineInfo states and calm copy', () => {
  const today = '2026-10-28';
  assert.deepEqual(deadlineInfo(undefined, today), { state: 'none', days: null, text: 'No deadline' });
  assert.equal(deadlineInfo('nope', today).state, 'none');
  const over = deadlineInfo('2026-10-26', today);
  assert.equal(over.state, 'overdue');
  assert.equal(over.days, -2);
  assert.equal(over.text, 'Was due Mon 26 Oct · 2 days ago');
  assert.equal(deadlineInfo('2026-10-27', today).text, 'Was due Tue 27 Oct · yesterday');
  assert.deepEqual(deadlineInfo('2026-10-28', today), { state: 'today', days: 0, text: 'Due today' });
  assert.equal(deadlineInfo('2026-10-29', today).text, 'Due tomorrow · Thu 29 Oct');
  assert.equal(deadlineInfo('2026-10-31', today).state, 'soon');
  const later = deadlineInfo('2026-11-10', today);
  assert.equal(later.state, 'later');
  assert.equal(later.text, 'Due Tue 10 Nov · in 13 days');
  assert.match(deadlineInfo('2027-01-04', today).text, /2027/);
  // Overdue copy never shames.
  assert.doesNotMatch(over.text, /late|fail|missed|!/i);
});

test('validateHeavyForm: title and next action required, deadline must be a date', () => {
  const e = validateHeavyForm(emptyHeavyForm());
  assert.equal(e.title, HEAVY_ERROR_COPY.title);
  assert.equal(e.nextAction, HEAVY_ERROR_COPY.nextAction);
  assert.equal(e.deadline, undefined);
  assert.ok(hasErrors(e));
  const ok = validateHeavyForm(emptyHeavyForm({ title: 'Tax', nextAction: 'Call the office' }));
  assert.equal(hasErrors(ok), false);
  assert.equal(validateHeavyForm(emptyHeavyForm({ title: 'a', nextAction: '   ' })).nextAction, HEAVY_ERROR_COPY.nextAction);
  assert.equal(validateHeavyForm(emptyHeavyForm({ title: 'a', nextAction: 'b', deadline: '2026-13-01' })).deadline, HEAVY_ERROR_COPY.deadline);
});

test('an item with no next step yet can be saved without one; new items and cleared steps still need one', () => {
  assert.equal(needsNextStep(undefined), true, 'new item');
  assert.equal(needsNextStep(item({ id: 'x', nextAction: '' })), false, 'seeded item without a step');
  assert.equal(needsNextStep(item({ id: 'x', nextAction: '  ' })), false);
  assert.equal(needsNextStep(item({ id: 'x', nextAction: 'Call' })), true, 'clearing a step is not allowed');
  const f = emptyHeavyForm({ title: 'Legal matter', nextAction: '' });
  assert.equal(validateHeavyForm(f, { requireNext: false }).nextAction, undefined);
  assert.equal(validateHeavyForm(f, { requireNext: true }).nextAction, HEAVY_ERROR_COPY.nextAction);
  assert.equal(validateHeavyForm(f).nextAction, HEAVY_ERROR_COPY.nextAction, 'default stays strict');
  assert.equal(buildHeavyItem(f, 'h', T).nextAction, '');
  assert.equal(NO_NEXT_STEP_COPY, 'No next step yet. Tap to add one: who to message?');
});

test('buildHeavyItem trims and drops empty optionals; round-trips through the form', () => {
  const f = emptyHeavyForm({ title: '  Tax  ', kind: 'money', nextAction: ' Call ', deadline: '', helper: '  ', notes: ' n ' });
  const it = buildHeavyItem(f, 'id1', T);
  assert.deepEqual(it, { id: 'id1', title: 'Tax', kind: 'money', nextAction: 'Call', status: 'open', notes: 'n', updatedAt: T });
  assert.equal('deadline' in it, false);
  assert.equal('helper' in it, false);
  const full = buildHeavyItem(emptyHeavyForm({ title: 'A', kind: '', nextAction: 'B', deadline: '2026-11-01', helper: 'Mom', status: 'waiting' }), 'id2', T);
  assert.equal(full.kind, 'other');
  assert.equal(full.deadline, '2026-11-01');
  assert.equal(full.helper, 'Mom');
  assert.deepEqual(buildHeavyItem(heavyFormFromItem(full), 'id2', T), full);
});

test('titleFromWorry: first line, shortened at a word boundary', () => {
  assert.equal(titleFromWorry('  Rent is due\nand more  '), 'Rent is due');
  assert.equal(titleFromWorry(''), '');
  const long = 'word '.repeat(40);
  const t = titleFromWorry(long, 30);
  assert.ok(t.length <= 30);
  assert.ok(t.endsWith('…'));
  assert.doesNotMatch(t, /\s…$/);
});

test('addWorry: explicit save adds one untriaged worry, never twice, never blank', () => {
  const s = state();
  assert.equal(addWorry(s, { id: 'w1', at: T, text: 'Rent is due' }), true);
  assert.deepEqual(s.worries, [{ id: 'w1', at: T, text: 'Rent is due' }]);
  // A replayed edit (cross-tab) with the same id does not duplicate it.
  assert.equal(addWorry(s, { id: 'w1', at: T, text: 'Rent is due' }), true);
  assert.equal(s.worries.length, 1);
  assert.equal(addWorry(s, { id: 'w2', at: T, text: '   ' }), false);
  assert.equal(s.worries.length, 1);
  assert.equal('triage' in s.worries[0], false);
});

test('triage: waiting, let go, back to unsorted, link to item, undo', () => {
  const s = state();
  s.heavy.push(item({ id: 'h1' }));
  s.worries.push({ id: 'w1', at: T, text: 'Rent' });
  const before: Worry = { ...s.worries[0] };

  assert.equal(setWorryTriage(s, 'missing', 'waiting'), false);
  assert.ok(setWorryTriage(s, 'w1', 'waiting'));
  assert.equal(s.worries[0].triage, 'waiting');

  assert.ok(linkWorryToItem(s, 'w1', 'h1'));
  assert.equal(s.worries[0].triage, 'action');
  assert.equal(s.worries[0].heavyId, 'h1');
  assert.equal(linkWorryToItem(s, 'w1', 'nope'), false);

  assert.ok(setWorryTriage(s, 'w1', 'let-go'));
  assert.equal(s.worries[0].triage, 'let-go');
  assert.equal('heavyId' in s.worries[0], false);

  restoreWorry(s, before);
  assert.equal('triage' in s.worries[0], false);

  setWorryTriage(s, 'w1', 'waiting');
  setWorryTriage(s, 'w1', undefined);
  assert.equal('triage' in s.worries[0], false);

  assert.equal(deleteWorry(s, 'w1')?.id, 'w1');
  assert.equal(s.worries.length, 0);
  restoreWorry(s, before);
  assert.equal(s.worries.length, 1);
});

test('worryBuckets groups, sorts newest first, skips the one being typed and blanks', () => {
  const items = [item({ id: 'h1' })];
  const worries: Worry[] = [
    { id: 'a', at: '2026-10-01T00:00:00.000Z', text: 'old' },
    { id: 'b', at: '2026-10-02T00:00:00.000Z', text: 'new' },
    { id: 'typing', at: '2026-10-03T00:00:00.000Z', text: 'draft' },
    { id: 'blank', at: '2026-10-03T00:00:00.000Z', text: '  ' },
    { id: 'w', at: T, text: 'x', triage: 'waiting' },
    { id: 'l', at: T, text: 'x', triage: 'let-go' },
    { id: 'act', at: T, text: 'x', triage: 'action', heavyId: 'h1' },
    { id: 'orphan', at: T, text: 'x', triage: 'action', heavyId: 'deleted' },
  ];
  const b = worryBuckets(worries, items, 'typing');
  assert.deepEqual(b.toSort.map((w) => w.id), ['b', 'a']);
  assert.deepEqual(b.waiting.map((w) => w.id), ['w']);
  assert.deepEqual(b.letGo.map((w) => w.id).sort(), ['l', 'orphan']);
  assert.deepEqual(b.actioned.map((w) => w.id), ['act']);
  assert.deepEqual(linkedWorries(worries, 'h1').map((w) => w.id), ['act']);
});

test('linkWorryWithStep: links and sets a new next step in one go; an empty step keeps the item\'s own', () => {
  const s = state();
  s.heavy.push(item({ id: 'visa', nextAction: '' }), item({ id: 'tax', nextAction: 'Find the form' }));
  s.worries.push({ id: 'w1', at: T, text: 'The office hasn’t replied' }, { id: 'w2', at: T, text: 'Tax' }, { id: 'w3', at: T, text: 'More tax' });
  const LATER = '2026-10-29T01:00:00.000Z';

  assert.equal(linkWorryWithStep(s, 'w1', 'visa', '  Email the office  ', LATER), 'linked-step');
  assert.equal(s.heavy[0].nextAction, 'Email the office');
  assert.equal(s.heavy[0].updatedAt, LATER);
  assert.deepEqual({ triage: s.worries[0].triage, heavyId: s.worries[0].heavyId }, { triage: 'action', heavyId: 'visa' });

  assert.equal(linkWorryWithStep(s, 'w2', 'tax', '', LATER), 'linked');
  assert.equal(s.heavy[1].nextAction, 'Find the form');
  assert.equal(s.heavy[1].updatedAt, T, 'unchanged step does not touch the item');
  assert.equal(linkWorryWithStep(s, 'w3', 'tax', ' Find the form ', LATER), 'linked', 'same text is no change');

  assert.equal(linkWorryWithStep(s, 'gone', 'tax', 'x', LATER), 'no-worry');
  assert.equal(s.heavy[1].nextAction, 'Find the form', 'nothing written when the worry is gone');
  assert.equal(linkWorryWithStep(s, 'w1', 'gone', 'x', LATER), 'no-item');
});

test('linkedPreview shows the worry text an item came from', () => {
  const worries: Worry[] = [
    { id: 'a', at: '2026-10-01T00:00:00.000Z', text: '  Renewal letter  ', triage: 'action', heavyId: 'h1' },
    { id: 'b', at: '2026-10-03T00:00:00.000Z', text: 'Appointment date?', triage: 'action', heavyId: 'h1' },
    { id: 'c', at: '2026-10-02T00:00:00.000Z', text: 'Fees', triage: 'action', heavyId: 'h1' },
    { id: 'd', at: T, text: 'Other', triage: 'action', heavyId: 'h2' },
  ];
  assert.equal(linkedPreview(worries, 'none'), null);
  assert.deepEqual(linkedPreview(worries, 'h2'), { label: 'From your worry', texts: ['Other'], more: 0 });
  assert.deepEqual(linkedPreview(worries, 'h1'), { label: 'From 3 worries', texts: ['Appointment date?', 'Fees'], more: 1 });
  assert.equal(linkedPreview(worries, 'h1', 5)?.more, 0);
});

test('setHeavyStatus and deleteHeavyItem (linked worries move to the archive)', () => {
  const s = state();
  s.heavy.push(item({ id: 'h1' }), item({ id: 'h2' }));
  s.worries.push({ id: 'w1', at: T, text: 'x', triage: 'action', heavyId: 'h1' }, { id: 'w2', at: T, text: 'y', triage: 'action', heavyId: 'h2' });
  assert.ok(setHeavyStatus(s, 'h1', 'done', '2026-10-29T00:00:00.000Z'));
  assert.equal(s.heavy[0].status, 'done');
  assert.equal(s.heavy[0].updatedAt, '2026-10-29T00:00:00.000Z');
  assert.equal(setHeavyStatus(s, 'nope', 'done', T), false);

  assert.equal(deleteHeavyItem(s, 'h1')?.id, 'h1');
  assert.deepEqual(s.heavy.map((i) => i.id), ['h2']);
  assert.equal(s.worries[0].triage, 'let-go');
  assert.equal('heavyId' in s.worries[0], false);
  assert.equal(s.worries[1].heavyId, 'h2');
  assert.equal(deleteHeavyItem(s, 'h1'), undefined);
});

test('reset is exactly two minutes: 8 s lead-in, then 7 rounds of 4-4-4-4', () => {
  assert.equal(RESET_TOTAL_SEC, 120);
  assert.equal(BREATH_ROUNDS, 7);
  assert.equal(formatRemaining(RESET_TOTAL_SEC), '2:00');
  const s0 = breathAt(0);
  assert.deepEqual(
    { key: s0.key, label: s0.label, count: s0.count, round: s0.round, done: s0.done, remainingSec: s0.remainingSec, leadIn: s0.leadIn },
    { key: 'settle', label: 'Get comfy', count: 4, round: 0, done: false, remainingSec: 120, leadIn: true },
  );
  assert.equal(formatRemaining(breathAt(0).remainingSec), '2:00');
  assert.equal(formatRemaining(breathAt(999).remainingSec), '2:00', 'shows 2:00 for the whole first second');
  assert.equal(formatRemaining(breathAt(1000).remainingSec), '1:59');
  assert.equal(breathAt(999).count, 4);
  assert.equal(breathAt(1000).count, 3);
  assert.equal(breathAt(3999).count, 1);
  const empty = breathAt(4000);
  assert.deepEqual([empty.key, empty.label, empty.phase, empty.leadIn], ['empty', 'Breathe out', -1, true]);
  const r1 = breathAt(8000);
  assert.deepEqual([r1.key, r1.label, r1.round, r1.phase, r1.leadIn], ['in', 'Breathe in', 1, 0, false]);
  assert.equal(breathAt(12000).key, 'hold-in');
  assert.equal(breathAt(16000).key, 'out');
  assert.equal(breathAt(16000).label, 'Breathe out');
  assert.equal(breathAt(20000).key, 'hold-out');
  const r2 = breathAt(24000);
  assert.equal(r2.key, 'in');
  assert.equal(r2.round, 2);
  assert.equal(r2.step, BREATH_LEAD_IN.length + 4);
  const last = breathAt(RESET_TOTAL_SEC * 1000 - 1);
  assert.equal(last.done, false);
  assert.equal(last.round, BREATH_ROUNDS);
  assert.equal(last.key, 'hold-out', 'ends with lungs empty, after a full breath out');
  assert.equal(last.remainingSec, 1);
  assert.equal(formatRemaining(last.remainingSec), '0:01');
  const end = breathAt(RESET_TOTAL_SEC * 1000);
  assert.equal(end.done, true);
  assert.equal(end.count, 0);
  assert.equal(end.remainingSec, 0);
  assert.equal(formatRemaining(end.remainingSec), '0:00');
  assert.equal(breathAt(-50).key, 'settle');
  assert.equal(breathAt(Number.NaN).count, 4);
  // 1 round of 2 s steps: 2 lead-in + 4 phases = 12 s.
  assert.equal(breathAt(12000, 1, 2).done, true);
  assert.equal(breathAt(11999, 1, 2).key, 'hold-out');
});

test('the countdown never skips or repeats a second', () => {
  const seen: number[] = [];
  for (let ms = 0; ms <= RESET_TOTAL_SEC * 1000; ms += 100) {
    const r = breathAt(ms).remainingSec;
    if (seen[seen.length - 1] !== r) seen.push(r);
  }
  assert.equal(seen.length, RESET_TOTAL_SEC + 1);
  assert.equal(seen[0], 120);
  assert.equal(seen[seen.length - 1], 0);
  seen.forEach((v, i) => assert.equal(v, 120 - i));
});

test('breath visuals: dot travels the square, circle grows on in, lead-in waits at the start', () => {
  assert.deepEqual(BREATH_PHASES.map((p) => breathDotTarget(p.key)), [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
  ]);
  assert.deepEqual(BREATH_LEAD_IN.map((p) => breathDotTarget(p.key)), [{ x: 0, y: 1 }, { x: 0, y: 1 }]);
  assert.equal(breathScale('in'), 1);
  assert.equal(breathScale('hold-in'), 1);
  assert.ok(breathScale('out') < 1);
  assert.equal(breathScale('hold-out'), breathScale('out'));
  assert.equal(breathScale('empty'), BREATH_SCALE_MIN);
  assert.ok(breathScale('settle') > BREATH_SCALE_MIN && breathScale('settle') < 1);
});

test('the breathing label box fits inside the smallest circle (390 px phone)', () => {
  const smallest = Math.min(...[...BREATH_LEAD_IN, ...BREATH_PHASES].map((p) => breathScale(p.key)));
  assert.equal(smallest, BREATH_SCALE_MIN);
  const orb = breathOrbPx(BREATH_SCALE_MIN);
  assert.ok(orb >= 100, `circle ${orb}px`);
  // Label (2 lines max) + count, centred: its corners stay inside the circle.
  assert.ok(widthInCircle(orb, BREATH_LABEL_BLOCK_PX) >= BREATH_LABEL_PX, `${widthInCircle(orb, BREATH_LABEL_BLOCK_PX)} < ${BREATH_LABEL_PX}`);
  // "Breathe" (the longest word) at 16 px semibold is about 62 px: one line inside the box.
  assert.ok(BREATH_LABEL_PX >= 7 * 0.6 * 16);
  // The square itself fits a 390 px screen with sheet padding.
  assert.ok(BREATH_SQUARE_PX <= 390 - 2 * 32);
  assert.equal(widthInCircle(10, 20), 0);
  assert.equal(widthInCircle(100, 0), 100);
});

test('formatRemaining', () => {
  assert.equal(formatRemaining(128), '2:08');
  assert.equal(formatRemaining(120), '2:00');
  assert.equal(formatRemaining(59.2), '1:00');
  assert.equal(formatRemaining(0), '0:00');
  assert.equal(formatRemaining(-3), '0:00');
});
