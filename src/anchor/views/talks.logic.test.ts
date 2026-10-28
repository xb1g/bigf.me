import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bet, Talk } from '../core/types.ts';
import {
  STALE_EDIT_NOTICE, TALK_MORE_SUMMARY,
  buildTalk, draftFromTalk, editDraftState, emptyTalkDraft, evidenceMix, filterTalksByRole, groupTalksByWeek,
  hasErrors, hasExtraDetails, isDraftDirty, linkableBets, progressDetail, progressHeadline, roleFilterOptions,
  rolesPresent, savedMessage, talkDraftEdited, talkEvidence, talkSource, validateTalkDraft, weekHeading,
  weekProgress, weekSubheading, withExistingBet,
} from './talks.logic.ts';

// 2026-10-28 is a Wednesday in ISO week 2026-W44 (Mon 26 Oct – Sun 1 Nov).
const TODAY = '2026-10-28';

let n = 0;
function talk(p: Partial<Talk>): Talk {
  n += 1;
  return { id: `t${n}`, date: TODAY, role: 'parent', channel: 'call', did: '', story: '', opinion: '', ...p };
}

function bet(p: Partial<Bet>): Bet {
  return {
    id: 'b', name: 'Bet', hypothesis: '', metric: '', continueIf: '', killIf: '', reviewOn: '2026-12-01',
    status: 'active', notes: '', createdAt: '2026-10-01T00:00:00.000Z', decisions: [], ...p,
  };
}

test('emptyTalkDraft defaults to today and is not dirty', () => {
  const d = emptyTalkDraft(TODAY);
  assert.equal(d.date, TODAY);
  assert.equal(d.dateTouched, false);
  assert.equal(isDraftDirty(d), false);
  assert.equal(isDraftDirty({ ...d, did: '  ' }), false);
  assert.equal(isDraftDirty({ ...d, role: 'teacher' }), true);
  assert.equal(isDraftDirty({ ...d, story: 'x' }), true);
});

test('validateTalkDraft requires date, role and one line of substance', () => {
  const d = emptyTalkDraft(TODAY);
  const e = validateTalkDraft(d, TODAY);
  assert.ok(e.role);
  assert.ok(e.body);
  assert.equal(e.date, undefined);
  assert.equal(hasErrors(e), true);

  const ok = validateTalkDraft({ ...d, role: 'student', opinion: 'Would love it' }, TODAY);
  assert.deepEqual(ok, {});
  assert.equal(hasErrors(ok), false);

  // A key quote alone counts as substance.
  assert.equal(validateTalkDraft({ ...d, role: 'student', quote: '“I paid for a course last term.”' }, TODAY).body, undefined);
});

test('validateTalkDraft: an empty date means today; broken and future dates are flagged', () => {
  const base = { ...emptyTalkDraft(TODAY), role: 'parent' as const, did: 'Paid deposit' };
  assert.equal(validateTalkDraft({ ...base, date: '' }, TODAY).date, undefined);
  assert.equal(validateTalkDraft({ ...base, date: '  ' }, TODAY).date, undefined);
  assert.ok(validateTalkDraft({ ...base, date: '2026-13-01' }, TODAY).date);
  assert.ok(validateTalkDraft({ ...base, date: '2026-10-29' }, TODAY).date);
  assert.equal(validateTalkDraft({ ...base, date: '2026-10-01' }, TODAY).date, undefined);
});

test('quick mode: role + what they did (or a quote) is enough; the "Add …" fields are never required', () => {
  const quick = { ...emptyTalkDraft(TODAY), role: 'parent' as const, did: 'Paid the deposit' };
  assert.deepEqual(validateTalkDraft(quick, TODAY), {});
  // No channel, name, story, opinion or bet needed.
  const t = buildTalk(quick, 'q1', TODAY);
  assert.deepEqual(t, { id: 'q1', date: TODAY, role: 'parent', channel: '', did: 'Paid the deposit', story: '', opinion: '' });
  assert.deepEqual(validateTalkDraft({ ...emptyTalkDraft(TODAY), role: 'alum', quote: 'I’d pay for that.' }, TODAY), {});
  // A story typed under "Add …" still counts as the one line.
  assert.deepEqual(validateTalkDraft({ ...emptyTalkDraft(TODAY), role: 'alum', story: 'Last term…' }, TODAY), {});
  const e = validateTalkDraft({ ...emptyTalkDraft(TODAY), nextStep: 'Call Friday' }, TODAY);
  assert.deepEqual(Object.keys(e).sort(), ['body', 'role']);
  assert.match(e.body ?? '', /what they did/);
  assert.equal(TALK_MORE_SUMMARY, 'Add story, opinion, channel, name, date, bet');
});

test('buildTalk: an empty date falls back to today (new) or the talk’s own date (edit)', () => {
  const d = { ...emptyTalkDraft(TODAY), role: 'parent' as const, did: 'x', date: '' };
  assert.equal(buildTalk(d, 'a', TODAY).date, TODAY);
  assert.equal(buildTalk(d, 'a', '2026-10-01').date, '2026-10-01');
  assert.equal(buildTalk({ ...d, date: '2026-10-20' }, 'a', TODAY).date, '2026-10-20');
});

test('hasExtraDetails: opens "Add …" when editing a talk that has story, opinion, channel, name or bet', () => {
  const d = emptyTalkDraft(TODAY);
  assert.equal(hasExtraDetails({ ...d, did: 'x', quote: 'q', nextStep: 'n' }), false);
  assert.equal(hasExtraDetails({ ...d, story: 's' }), true);
  assert.equal(hasExtraDetails({ ...d, opinion: 'o' }), true);
  assert.equal(hasExtraDetails({ ...d, channel: 'LINE' }), true);
  assert.equal(hasExtraDetails({ ...d, who: 'K.' }), true);
  assert.equal(hasExtraDetails({ ...d, betId: 'b' }), true);
  assert.equal(hasExtraDetails({ ...d, who: '  ' }), false);
  const full = draftFromTalk(talk({ story: 'Last year', opinion: 'Nice', who: 'N.' }));
  assert.equal(hasExtraDetails(full), true, 'existing full data stays visible and editable');
});

test('edit drafts: a talk changed elsewhere (tab, import, pull) restarts the draft instead of overwriting it', () => {
  const t = talk({ did: 'Paid', quote: 'Old quote' });
  const draft = talkSource(t, 3);
  assert.equal(editDraftState(draft, talkSource(t, 3)), 'fresh');
  assert.equal(editDraftState(draft, talkSource({ ...t }, 3)), 'fresh', 'same content, new object');
  assert.equal(editDraftState(draft, talkSource({ ...t, quote: 'Newer quote from the import' }, 3)), 'stale');
  assert.equal(editDraftState(draft, talkSource(t, 4)), 'stale', 'dataset replaced, even with the same talk');
  assert.equal(editDraftState(draft, talkSource({ ...t, id: 'other' }, 3)), 'other');

  const d = draftFromTalk(t);
  assert.equal(talkDraftEdited(d, draft.src), false);
  assert.equal(talkDraftEdited({ ...d, dateTouched: false }, draft.src), false, 'bookkeeping flags are not edits');
  assert.equal(talkDraftEdited({ ...d, quote: 'My change' }, draft.src), true);
  assert.equal(talkDraftEdited(d, 'not json'), true);
  assert.match(STALE_EDIT_NOTICE, /changed somewhere else/);
});

test('withExistingBet drops a link to a bet that is gone', () => {
  const t = talk({ did: 'x', betId: 'gone' });
  assert.equal('betId' in withExistingBet(t, [{ id: 'a' }]), false);
  assert.equal(withExistingBet({ ...t, betId: 'a' }, [{ id: 'a' }]).betId, 'a');
  const plain = talk({ did: 'y' });
  assert.equal(withExistingBet(plain, []), plain);
});

test('validateTalkDraft rejects unknown roles', () => {
  const d = { ...emptyTalkDraft(TODAY), role: 'boss' as never, did: 'x' };
  assert.ok(validateTalkDraft(d, TODAY).role);
});

test('buildTalk trims text and drops empty optionals', () => {
  const d = {
    ...emptyTalkDraft(TODAY), role: 'teacher' as const, channel: 'LINE', who: '  K. ',
    did: '  Shared the form with 3 parents ', story: '', opinion: ' ', quote: '', nextStep: ' Call Friday ', betId: '',
  };
  const t = buildTalk(d, 'id-1');
  assert.deepEqual(t, {
    id: 'id-1', date: TODAY, role: 'teacher', channel: 'LINE', who: 'K.',
    did: 'Shared the form with 3 parents', story: '', opinion: '', nextStep: 'Call Friday',
  });
  assert.equal('quote' in t, false);
  assert.equal('betId' in t, false);
});

test('buildTalk keeps betId and caps long text', () => {
  const t = buildTalk({ ...emptyTalkDraft(TODAY), role: 'alum', did: 'x'.repeat(5000), betId: 'b1' }, 'id');
  assert.equal(t.betId, 'b1');
  assert.equal(t.did.length, 2000);
});

test('draftFromTalk round-trips through buildTalk', () => {
  const original = talk({ role: 'school', channel: 'in person', who: 'Ajarn N', did: 'Booked a room', story: 'Last year…', opinion: 'Sounds fun', quote: 'q', nextStep: 'Send deck', betId: 'b2' });
  const d = draftFromTalk(original);
  assert.equal(d.dateTouched, true);
  assert.deepEqual(buildTalk(d, original.id), original);
});

test('talkEvidence ranks Did > Story > Opinion', () => {
  assert.equal(talkEvidence({ did: 'paid', story: 's', opinion: 'o' }), 'did');
  assert.equal(talkEvidence({ did: ' ', story: 's', opinion: 'o' }), 'story');
  assert.equal(talkEvidence({ did: '', story: '', opinion: 'o' }), 'opinion');
  assert.equal(talkEvidence({ did: '', story: '', opinion: '' }), 'none');
  assert.deepEqual(evidenceMix([talk({ did: 'a' }), talk({ opinion: 'b' }), talk({ opinion: 'c' })]), { did: 1, story: 0, opinion: 2, none: 0 });
});

test('weekProgress counts this week and last week (Bangkok ISO weeks)', () => {
  const talks = [
    talk({ date: '2026-10-26', did: 'paid' }),     // Mon this week
    talk({ date: '2026-10-28', opinion: 'nice' }), // today
    talk({ date: '2026-10-25' }),                  // Sun last week
    talk({ date: '2026-10-19' }),                  // Mon last week
    talk({ date: '2026-10-12' }),                  // two weeks ago
    talk({ date: 'garbage' }),
  ];
  const p = weekProgress(talks, TODAY, 10);
  assert.equal(p.count, 2);
  assert.equal(p.lastWeek, 2);
  assert.equal(p.remaining, 8);
  assert.equal(p.met, false);
  assert.equal(p.daysLeft, 5); // Wed..Sun
  assert.equal(p.withDid, 1);
});

test('weekProgress: Sunday leaves one day; target guards against 0', () => {
  const p = weekProgress([], '2026-11-01', 0);
  assert.equal(p.daysLeft, 1);
  assert.equal(p.target, 1);
  assert.equal(p.met, false);
});

test('progress copy is calm in every state', () => {
  const base = { target: 10, lastWeek: 3, withDid: 0, daysLeft: 5 };
  assert.match(progressHeadline({ ...base, count: 0, remaining: 10, met: false }), /good start/);
  assert.equal(progressHeadline({ ...base, count: 4, remaining: 6, met: false }), '6 to go, 5 days left.');
  assert.equal(progressHeadline({ ...base, count: 9, remaining: 1, met: false, daysLeft: 1 }), '1 to go, 1 day left.');
  assert.match(progressHeadline({ ...base, count: 10, remaining: 0, met: true }), /Target met/);
  assert.match(progressHeadline({ ...base, count: 12, remaining: 0, met: true }), /plus 2/);
  assert.equal(progressDetail({ ...base, count: 0, remaining: 10, met: false }), 'Last week: 3');
  assert.equal(progressDetail({ ...base, count: 4, withDid: 1, remaining: 6, met: false }), 'Last week: 3 · 1 of 4 with a Did');
});

test('savedMessage', () => {
  assert.equal(savedMessage(5, 10, true), 'Saved. 5 of 10 this week.');
  assert.match(savedMessage(10, 10, true), /target met/);
  assert.equal(savedMessage(11, 10, true), 'Saved. 11 this week.');
  assert.equal(savedMessage(1, 10, false), 'Talk saved.');
});

test('filterTalksByRole and rolesPresent', () => {
  const talks = [talk({ role: 'student' }), talk({ role: 'parent' }), talk({ role: 'student' })];
  assert.equal(filterTalksByRole(talks, 'all').length, 3);
  assert.equal(filterTalksByRole(talks, '').length, 3);
  assert.equal(filterTalksByRole(talks, 'student').length, 2);
  assert.equal(filterTalksByRole(talks, 'sponsor').length, 0);
  // TALK_ROLES order: parent before student.
  assert.deepEqual(rolesPresent(talks), [
    { role: 'parent', label: 'Parent', count: 1 },
    { role: 'student', label: 'Student', count: 2 },
  ]);
});

test('roleFilterOptions keeps the active filter visible even with zero talks', () => {
  const talks = [talk({ role: 'student' })];
  const opts = roleFilterOptions(talks, 'teacher');
  assert.deepEqual(opts.map((o) => o.value), ['all', 'teacher', 'student']);
  assert.equal(opts[0].label, 'All 1');
  assert.equal(opts[1].ariaLabel, 'Teacher, 0 talks');
  assert.equal(opts[2].ariaLabel, 'Student, 1 talk');
  assert.deepEqual(roleFilterOptions([], 'all').map((o) => o.value), ['all']);
});

test('groupTalksByWeek: newest week first, newest date first, later-logged first on ties', () => {
  const a = talk({ date: '2026-10-20' });
  const b = talk({ date: '2026-10-27' });
  const c = talk({ date: '2026-10-27' });
  const d = talk({ date: '2026-10-28' });
  const bad = talk({ date: 'nope' });
  const groups = groupTalksByWeek([a, b, c, d, bad]);
  assert.deepEqual(groups.map((g) => g.weekKey), ['2026-W44', '2026-W43']);
  assert.deepEqual(groups[0].talks.map((t) => t.id), [d.id, c.id, b.id]);
  assert.deepEqual(groups[1].talks.map((t) => t.id), [a.id]);
  assert.equal(groups[0].start, '2026-10-26');
  assert.equal(groups[0].end, '2026-11-01');
  assert.deepEqual(groupTalksByWeek([]), []);
});

test('groupTalksByWeek handles the year boundary (ISO week 2026-W53 / 2027-W01)', () => {
  const groups = groupTalksByWeek([talk({ date: '2026-12-31' }), talk({ date: '2027-01-04' })]);
  assert.deepEqual(groups.map((g) => g.weekKey), ['2027-W01', '2026-W53']);
});

test('weekHeading and weekSubheading', () => {
  assert.equal(weekHeading('2026-W44', TODAY), 'This week');
  assert.equal(weekHeading('2026-W43', TODAY), 'Last week');
  assert.equal(weekHeading('2026-W42', TODAY), 'Week of 12 Oct');
  assert.equal(weekHeading('2025-W42', TODAY), 'Week of 13 Oct 2025');
  const [g] = groupTalksByWeek([talk({ date: TODAY }), talk({ date: TODAY })]);
  assert.equal(weekSubheading(g, TODAY), '26 Oct – 1 Nov · 2 talks');
});

test('linkableBets: active bets plus the linked one', () => {
  const bets = [
    bet({ id: 'a', name: 'SHIFT', status: 'active' }),
    bet({ id: 'p', name: 'Side project', status: 'parked' }),
    bet({ id: 'k', name: 'Old', status: 'killed' }),
  ];
  assert.deepEqual(linkableBets(bets), [{ value: 'a', label: 'SHIFT' }]);
  assert.deepEqual(linkableBets(bets, 'p'), [{ value: 'a', label: 'SHIFT' }, { value: 'p', label: 'Side project (parked)' }]);
});
