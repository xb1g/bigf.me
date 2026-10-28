import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnchorState } from './types.ts';
import {
  closeTimer, createMemoryStorage, datasetGeneration, ensureDay, eraseAll, extendTimebox, findById, flush, getDay,
  getState, handleStorageEvent, hasPendingWrites, initStore, joinStopNote, migrate, onErase, onExternalChange,
  onPersistError, prepareImport, removeById, replaceState, startTimer, stopTimer, subscribe, update, upsert,
} from './store.ts';
import { emptyState } from './seed.ts';
import { COLLECTION_LIMITS, DATASET_GEN_KEY, ERASE_EVENT_KEY, MAX_STATE_BYTES, STORAGE_KEY } from './constants.ts';
import { escapeSessionHours, hoursByCategory } from './metrics.ts';

const NOW = new Date('2026-10-28T03:00:00.000Z');

// ----------------------------------------------------------------- migrate

test('migrate never throws on garbage and returns a full valid state', () => {
  const inputs: unknown[] = [
    undefined, null, 0, 42, '', 'hello', true, [], [1, 2, 3], () => 1, Symbol('x'),
    { schemaVersion: 99 }, { bets: 'nope' }, { days: [] }, { days: { 'not-a-date': {} } },
    { profile: null, lock: 5, sync: 'x' }, { bets: [null, 1, 'x', { status: 'weird' }] },
    { timeLog: [{ start: 'bad', end: 'bad' }] }, { funnel: [{ reach: 'NaN', paid: -3, applied: '12' }] },
    Object.create(null),
  ];
  for (const raw of inputs) {
    const s = migrate(raw, NOW);
    assert.equal(s.schemaVersion, 1);
    assert.ok(Array.isArray(s.bets));
    assert.ok(Array.isArray(s.timeLog));
    assert.ok(Array.isArray(s.talks));
    assert.equal(typeof s.days, 'object');
    assert.equal(typeof s.profile.name, 'string');
    assert.equal(typeof s.lock.lockAfterMin, 'number');
    assert.equal(typeof s.sync.rev, 'number');
    assert.doesNotThrow(() => JSON.stringify(s));
  }
});

test('migrate of a circular object does not throw', () => {
  const o: Record<string, unknown> = { bets: [] };
  o.self = o;
  (o.bets as unknown[]).push(o);
  assert.doesNotThrow(() => migrate(o, NOW));
});

test('migrate fills defaults for partial data', () => {
  const s = migrate({
    profile: { name: 'Big', weeklyTalkTarget: 'abc' },
    bets: [{ id: 'b1', name: 'SHIFT', status: 'active' }],
    talks: [{ role: 'mystery', did: 'Paid deposit' }],
    lock: {},
  }, NOW);
  assert.deepEqual(s.profile, { name: 'Big', weeklyTalkTarget: 10, buildSellTarget: 0.5, maxActiveBets: 3 });
  const b = s.bets[0];
  assert.equal(b.id, 'b1');
  assert.equal(b.status, 'active');
  assert.equal(b.hypothesis, '');
  assert.deepEqual(b.decisions, []);
  assert.equal(b.reviewOn, '2026-11-11'); // today (BKK) + 14
  assert.equal(b.createdAt, NOW.toISOString());
  const t = s.talks[0];
  assert.equal(t.role, 'other');
  assert.equal(t.date, '2026-10-28');
  assert.equal(t.did, 'Paid deposit');
  assert.equal(typeof t.id, 'string');
  assert.ok(t.id.length > 10);
  assert.deepEqual(s.lock, { lockAfterMin: 5 });
  assert.deepEqual(s.sync, { rev: 0 });
  assert.deepEqual(s.days, {});
});

test('migrate keeps valid data intact (round-trip is stable)', () => {
  const full: AnchorState = {
    ...emptyState(NOW),
    days: {
      '2026-10-28': {
        date: '2026-10-28',
        anchor: { text: 'Call 3 parents', metric: 'talks', byWhen: '16:00', betId: 'b1', done: false },
        actions: [{ id: 'a1', text: 'Draft script', done: true }],
        checkin: { sleepHours: 6.5, energy: 3, mood: 4, note: 'ok' },
        shutdown: { win: 'w', lesson: 'l', tomorrow: 't' },
      },
    },
    bets: [{
      id: 'b1', name: 'SHIFT', hypothesis: 'h', metric: 'm', continueIf: 'c', killIf: 'k', reviewOn: '2026-12-20',
      status: 'active', notes: 'n', createdAt: NOW.toISOString(),
      decisions: [{ date: '2026-10-20', verdict: 'continue', why: 'signal' }],
    }],
    timeLog: [{ id: 't1', category: 'sell', start: '2026-10-28T01:00:00.000Z', end: '2026-10-28T02:00:00.000Z', note: 'calls' }],
    activeTimer: { category: 'build', startedAt: '2026-10-28T02:30:00.000Z', timeboxMin: 90 },
    escapes: [{
      id: 'e1', at: NOW.toISOString(), want: 'w', numberMoves: '', howKnow: '', recommended: 'park', verdict: 'park',
    }],
    parking: [{ id: 'p1', text: 'idea', at: NOW.toISOString(), fromEscapeId: 'e1' }],
    funnel: [{ id: 'f1', label: 'Cohort B', period: 'cohort', paid: 20, verifiedTest: 2, note: 'n' }],
    talks: [{ id: 'k1', date: '2026-10-27', role: 'parent', channel: 'LINE', did: 'd', story: 's', opinion: 'o', quote: 'q', betId: 'b1' }],
    heavy: [{ id: 'h1', title: 'Admin', kind: 'money', nextAction: 'Email', status: 'waiting', notes: '', updatedAt: NOW.toISOString(), deadline: '2026-11-01' }],
    worries: [{ id: 'w1', at: NOW.toISOString(), text: 'x', triage: 'let-go' }],
    reviews: [{
      id: 'r1', weekKey: '2026-W44', createdAt: NOW.toISOString(), wins: 'w', lessons: 'l',
      betDecisions: [{ betId: 'b1', verdict: 'change', why: 'y' }], nextAnchor: 'n', snapshot: { talks: 3, bottleneck: null, label: 'x' },
    }],
    lock: { pinHash: 'aGFzaA==', pinSalt: 'c2FsdA==', lockAfterMin: 5 },
    sync: { rev: 7, lastSyncedAt: NOW.toISOString() },
  };
  assert.deepEqual(migrate(structuredClone(full), NOW), full);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(full)), NOW), full);
});

test('migrate drops unknown fields and invalid enum values, coerces numbers', () => {
  const s = migrate({
    surprise: 1,
    bets: [{ id: 'b', name: 'x', status: 'active', extra: true, decisions: [{ verdict: 'maybe' }, { verdict: 'kill', why: 'w', date: 'bad' }] }],
    funnel: [{ id: 'f', label: 'w', period: 'month', reach: '120', paid: -1, clicks: 'abc', costThb: 0 }],
    days: { '2026-10-28': { actions: [{ text: 'a' }, { id: 'dup', text: 'b' }, { id: 'dup', text: 'c' }], checkin: { energy: 9, mood: 2, sleepHours: 30 } } },
    activeTimer: { category: 'nap', startedAt: NOW.toISOString() },
    lock: { pinHash: 'only-hash', lockAfterMin: -3 },
  }, NOW) as AnchorState & Record<string, unknown>;
  assert.equal(s.surprise, undefined);
  assert.equal((s.bets[0] as unknown as Record<string, unknown>).extra, undefined);
  assert.equal(s.bets[0].decisions.length, 1);
  assert.equal(s.bets[0].decisions[0].date, '2026-10-28');
  const f = s.funnel[0];
  assert.equal(f.period, 'cohort');
  assert.equal(f.reach, 120);
  assert.equal(f.paid, undefined);
  assert.equal(f.clicks, undefined);
  assert.equal(f.costThb, 0, 'zero is a real value, not unknown');
  const day = s.days['2026-10-28'];
  assert.equal(day.date, '2026-10-28');
  assert.equal(day.actions.length, 3);
  assert.equal(new Set(day.actions.map((a) => a.id)).size, 3, 'ids are unique');
  assert.deepEqual(day.checkin, { mood: 2 });
  assert.equal(s.activeTimer, undefined);
  assert.deepEqual(s.lock, { lockAfterMin: 5 }, 'half a PIN is no PIN');
});

test('migrate makes duplicate ids unique across a collection', () => {
  const s = migrate({ talks: [{ id: 'same', did: 'a' }, { id: 'same', did: 'b' }] }, NOW);
  assert.equal(s.talks.length, 2);
  assert.notEqual(s.talks[0].id, s.talks[1].id);
  assert.equal(s.talks[0].id, 'same');
});

// ------------------------------------------------------------ reducer helpers

test('upsert / removeById / findById', () => {
  const list = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
  upsert(list, { id: 'a', v: 10 });
  upsert(list, { id: 'c', v: 3 });
  assert.deepEqual(list, [{ id: 'a', v: 10 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }]);
  assert.deepEqual(removeById(list, 'b'), { id: 'b', v: 2 });
  assert.equal(removeById(list, 'zzz'), undefined);
  assert.equal(list.length, 2);
  assert.equal(findById(list, 'c')?.v, 3);
  assert.equal(findById(list, undefined), undefined);
});

test('getDay / ensureDay', () => {
  const s = emptyState(NOW);
  assert.deepEqual(getDay(s, '2026-10-28'), { date: '2026-10-28', actions: [] });
  assert.deepEqual(s.days, {}, 'getDay does not write');
  const d = ensureDay(s, '2026-10-28');
  d.actions.push({ id: 'x', text: 'y', done: false });
  assert.equal(s.days['2026-10-28'].actions.length, 1);
  assert.equal(ensureDay(s, '2026-10-28'), d);
});

test('closeTimer logs ≥1 minute and discards shorter runs', () => {
  const s = emptyState(NOW);
  s.activeTimer = { category: 'build', startedAt: '2026-10-28T02:00:00.000Z', note: 'box' };
  const e = closeTimer(s, new Date('2026-10-28T02:45:00.000Z'));
  assert.ok(e);
  assert.equal(e.category, 'build');
  assert.equal(e.note, 'box');
  assert.equal(s.activeTimer, undefined);
  assert.equal(s.timeLog.length, 1);
  s.activeTimer = { category: 'sell', startedAt: '2026-10-28T03:00:00.000Z' };
  assert.equal(closeTimer(s, new Date('2026-10-28T03:00:30.000Z')), null);
  assert.equal(s.activeTimer, undefined);
  assert.equal(s.timeLog.length, 1);
  assert.equal(closeTimer(s, NOW), null);
});

test('closeTimer: a forgotten timer logs only its timebox (or nothing), never the 16h cap', () => {
  const s = emptyState(NOW);
  s.activeTimer = { category: 'build', startedAt: '2026-10-27T01:00:00.000Z', timeboxMin: 90 };
  const boxed = closeTimer(s, NOW);
  assert.ok(boxed);
  assert.equal(boxed.end, '2026-10-27T02:30:00.000Z', 'the planned 90 minutes');
  s.activeTimer = { category: 'sell', startedAt: '2026-10-27T01:00:00.000Z' };
  assert.equal(closeTimer(s, NOW), null, 'no box and nobody said when it ended: nothing logged');
  assert.equal(s.activeTimer, undefined);
  assert.equal(s.timeLog.length, 1);
});

test('closeTimer honours an explicit end time and a "what moved" note', () => {
  const s = emptyState(NOW);
  s.activeTimer = { category: 'build', startedAt: '2026-10-27T01:00:00.000Z', timeboxMin: 90 };
  const asked = closeTimer(s, NOW, new Date('2026-10-27T02:30:00.000Z'));
  assert.equal(asked?.end, '2026-10-27T02:30:00.000Z');
  s.activeTimer = { category: 'sell', startedAt: '2026-10-28T02:00:00.000Z' };
  assert.equal(closeTimer(s, NOW, new Date('2026-10-28T09:00:00.000Z'))?.end, NOW.toISOString(), 'clamped to now');
  s.activeTimer = { category: 'sell', startedAt: '2026-10-28T02:00:00.000Z' };
  assert.equal(closeTimer(s, NOW, new Date('2026-10-28T01:00:00.000Z')), null);
  assert.equal(s.timeLog.length, 2);
  s.timeLog = [];
  s.activeTimer = { category: 'build', startedAt: '2026-10-28T01:00:00.000Z', note: 'Escape check: alumni board', source: 'escape', overridden: true };
  const e = closeTimer(s, NOW, { moved: '  Two alumni signed up  ' });
  assert.equal(e?.note, 'Escape check: alumni board · Moved: Two alumni signed up');
  assert.equal(e?.source, 'escape');
  assert.equal(e?.overridden, true);
  s.timeLog = [];
  s.activeTimer = { category: 'sell', startedAt: '2026-10-28T01:00:00.000Z' };
  assert.equal(closeTimer(s, NOW, { moved: 'Booked 2 calls' })?.note, 'Booked 2 calls');
});

test('stopping a timer that a manual block overlaps changes no totals (B4: logs only the uncovered part)', () => {
  // Build timer from 09:00 BKK; at 10:00 a Sell block 09:00–10:00 is added by hand; Stop at 10:30.
  const s = emptyState(NOW);
  s.activeTimer = { category: 'build', startedAt: '2026-10-28T02:00:00.000Z', note: 'Deck', source: 'escape' };
  s.timeLog.push({ id: 'm', category: 'sell', start: '2026-10-28T02:00:00.000Z', end: '2026-10-28T03:00:00.000Z' });
  const stopAt = new Date('2026-10-28T03:30:00.000Z');
  const before = hoursByCategory(s.timeLog, '2026-W44', { activeTimer: s.activeTimer, now: stopAt });
  const viaBefore = escapeSessionHours(s.timeLog, '2026-W44', { activeTimer: s.activeTimer, now: stopAt }).hours;
  const e = closeTimer(s, stopAt);
  assert.deepEqual(hoursByCategory(s.timeLog, '2026-W44', { now: stopAt }), before);
  assert.equal(escapeSessionHours(s.timeLog, '2026-W44', { now: stopAt }).hours, viaBefore);
  assert.deepEqual(before, { build: 0.5, sell: 1, ops: 0, teach: 0, rest: 0, escape: 0 });
  assert.deepEqual(e && { start: e.start, end: e.end, note: e.note, source: e.source }, {
    start: '2026-10-28T03:00:00.000Z', end: '2026-10-28T03:30:00.000Z', note: 'Deck', source: 'escape',
  });

  // A block in the middle splits the run; the longer piece is returned, both are logged.
  const m = emptyState(NOW);
  m.activeTimer = { category: 'build', startedAt: '2026-10-28T00:00:00.000Z' };
  m.timeLog.push({ id: 'mid', category: 'sell', start: '2026-10-28T01:00:00.000Z', end: '2026-10-28T01:20:00.000Z' });
  const piece = closeTimer(m, NOW);
  assert.deepEqual(m.timeLog.slice(1).map((x) => [x.start, x.end]), [
    ['2026-10-28T00:00:00.000Z', '2026-10-28T01:00:00.000Z'],
    ['2026-10-28T01:20:00.000Z', '2026-10-28T03:00:00.000Z'],
  ]);
  assert.equal(piece?.start, '2026-10-28T01:20:00.000Z');
  assert.ok(Math.abs(hoursByCategory(m.timeLog, '2026-W44').build - (3 - 20 / 60)) < 1e-9, 'the 20 min block is not counted as build too');

  // Fully covered already: nothing new to log.
  const f = emptyState(NOW);
  f.activeTimer = { category: 'build', startedAt: '2026-10-28T02:00:00.000Z' };
  f.timeLog.push({ id: 'all', category: 'sell', start: '2026-10-28T01:00:00.000Z', end: NOW.toISOString() });
  assert.equal(closeTimer(f, NOW), null);
  assert.equal(f.timeLog.length, 1);
  assert.equal(f.activeTimer, undefined);
});

test('joinStopNote', () => {
  assert.equal(joinStopNote(undefined, undefined), undefined);
  assert.equal(joinStopNote('  ', ' '), undefined);
  assert.equal(joinStopNote('Box', ''), 'Box');
  assert.equal(joinStopNote('', 'Moved it'), 'Moved it');
  assert.equal(joinStopNote('Box', 'Moved it'), 'Box · Moved: Moved it');
});

test('initStore seeds on first run and persists it', () => {
  const storage = createMemoryStorage();
  const r = initStore({ storage, now: NOW });
  assert.equal(r.firstRun, true);
  assert.equal(r.recovered, false);
  assert.ok(r.state.bets.length > 0);
  const saved = JSON.parse(storage.getItem(STORAGE_KEY) as string);
  assert.deepEqual(saved.bets.map((b: { id: string }) => b.id), r.state.bets.map((b) => b.id));
  // Second boot loads the same data (same ids).
  const r2 = initStore({ storage, now: NOW });
  assert.equal(r2.firstRun, false);
  assert.deepEqual(r2.state.bets.map((b) => b.id), r.state.bets.map((b) => b.id));
});

test('initStore keeps a backup of unreadable data and starts fresh', () => {
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_KEY, '{not json');
  const r = initStore({ storage, now: NOW });
  assert.equal(r.recovered, true);
  assert.ok(r.state.bets.length > 0);
  assert.equal(storage.getItem(`${STORAGE_KEY}:corrupt:${NOW.getTime()}`), '{not json');
});

test('update: clone → mutate → updatedAt → validate → notify; persist is debounced until flush', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const before = getState();
  const calls: { force?: boolean }[] = [];
  const off = subscribe((_s, prev, opts) => {
    assert.equal(prev, before);
    calls.push(opts);
  });
  const next = update((d) => {
    d.talks.push({ id: 't1', date: '2026-10-28', role: 'parent', channel: 'LINE', did: 'Paid', story: '', opinion: '' });
    (d.profile as unknown as Record<string, unknown>).weeklyTalkTarget = 'junk'; // validated back to default
  }, { force: true });
  off();
  assert.notEqual(next, before);
  assert.equal(before.talks.length, 0, 'previous snapshot untouched');
  assert.equal(next.talks.length, 1);
  assert.equal(next.profile.weeklyTalkTarget, 10);
  assert.notEqual(next.updatedAt, before.updatedAt);
  assert.deepEqual(calls, [{ force: true }]);
  assert.equal(hasPendingWrites(), true);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) as string).talks.length, 0, 'not written yet');
  flush();
  assert.equal(hasPendingWrites(), false);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) as string).talks.length, 1);
});

test('update with silent: true does not notify', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  let n = 0;
  const off = subscribe(() => { n++; });
  update((d) => { d.profile.name = 'B'; }, { silent: true });
  off();
  flush();
  assert.equal(n, 0);
  assert.equal(getState().profile.name, 'B');
});

test('a throwing mutator changes nothing', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  const before = getState();
  assert.throws(() => update((d) => { d.profile.name = 'X'; throw new Error('boom'); }));
  assert.equal(getState(), before);
  flush();
});

test('write failures keep in-memory state and report once', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const errors: unknown[] = [];
  onPersistError((e) => errors.push(e));
  const realSet = storage.setItem;
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  update((d) => { d.profile.name = 'One'; });
  flush();
  update((d) => { d.profile.name = 'Two'; });
  flush();
  assert.equal(getState().profile.name, 'Two');
  assert.equal(errors.length, 1);
  assert.equal(hasPendingWrites(), true);
  storage.setItem = realSet;
  update((d) => { d.profile.name = 'Three'; });
  flush();
  assert.equal(hasPendingWrites(), false);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) as string).profile.name, 'Three');
  onPersistError(null);
});

test('a write that failed before anyone listened (first run, storage blocked or full) is still reported once', () => {
  // No storage at all (site storage blocked): the first-run write fails inside initStore.
  initStore({ storage: null, now: NOW });
  const blocked: unknown[] = [];
  onPersistError((e) => blocked.push(e));
  assert.equal(blocked.length, 1, 'told right away');
  assert.match(String((blocked[0] as Error)?.message), /Storage unavailable/);
  update((d) => { d.profile.name = 'Still here'; });
  flush();
  assert.equal(blocked.length, 1, 'once per failing streak, not on every write');
  assert.equal(getState().profile.name, 'Still here');
  onPersistError(null);

  // Storage that throws on write (quota): same.
  const full = createMemoryStorage();
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  initStore({ storage: full, now: NOW });
  const quota: unknown[] = [];
  onPersistError((e) => quota.push(e));
  update((d) => { d.profile.name = 'x'; });
  flush();
  assert.equal(quota.length, 1);
  assert.match(String((quota[0] as Error)?.message), /Quota/);
  onPersistError(null);

  // Storage that works: nothing to report.
  initStore({ storage: createMemoryStorage(), now: NOW });
  const none: unknown[] = [];
  onPersistError((e) => none.push(e));
  assert.equal(none.length, 0);
  onPersistError(null);
});

test('replaceState migrates, persists immediately, can preserve lock/sync', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  update((d) => { d.lock = { pinHash: 'aA==', pinSalt: 'bB==', lockAfterMin: 1 }; d.sync = { rev: 4 }; });
  flush();
  let forced = false;
  const off = subscribe((_s, _p, o) => { forced = Boolean(o.force); });
  const s = replaceState({ talks: [{ id: 'imported', did: 'x' }], lock: { lockAfterMin: 9 }, sync: { rev: 1 } }, { preserve: ['lock', 'sync'] });
  off();
  assert.equal(forced, true);
  assert.equal(s.talks[0].id, 'imported');
  assert.equal(s.bets.length, 0);
  assert.deepEqual(s.lock, { pinHash: 'aA==', pinSalt: 'bB==', lockAfterMin: 1 });
  assert.deepEqual(s.sync, { rev: 4 });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) as string).talks[0].id, 'imported');
  const t = replaceState({ lock: { lockAfterMin: 9 } });
  assert.deepEqual(t.lock, { lockAfterMin: 9 });
});

test('eraseAll removes anchor:* keys only and reseeds', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  storage.setItem('anchor:sync:pass', 'secret');
  storage.setItem('other-app', 'keep');
  update((d) => { d.talks.push({ id: 'x', date: '2026-10-28', role: 'other', channel: '', did: '', story: '', opinion: '' }); });
  const s = eraseAll(NOW);
  assert.equal(s.talks.length, 0);
  assert.ok(s.bets.length > 0);
  assert.equal(storage.getItem('anchor:sync:pass'), null);
  assert.equal(storage.getItem('other-app'), 'keep');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) as string).talks.length, 0);
});

test('startTimer / stopTimer', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  startTimer('build', { note: '  Time-boxed  ', timeboxMin: 90 });
  const t = getState().activeTimer;
  assert.ok(t);
  assert.equal(t.category, 'build');
  assert.equal(t.note, 'Time-boxed');
  assert.equal(t.timeboxMin, 90);
  assert.equal(t.source, undefined);
  assert.equal(stopTimer(), null);
  assert.equal(getState().activeTimer, undefined);
  assert.equal(getState().timeLog.length, 0);
  update((d) => { d.activeTimer = { category: 'sell', startedAt: new Date(Date.now() - 30 * 60_000).toISOString() }; });
  const r = startTimer('ops');
  assert.equal(r.logged?.category, 'sell');
  assert.equal(getState().timeLog.length, 1);
  assert.equal(getState().timeLog[0].category, 'sell');
  assert.equal(getState().activeTimer?.category, 'ops');
  update((d) => { d.activeTimer = { category: 'build', startedAt: new Date(Date.now() - 50 * 60_000).toISOString(), timeboxMin: 45 }; });
  const logged = stopTimer({ moved: 'Shipped the form' });
  assert.equal(logged?.note, 'Shipped the form');
  flush();
});

test('startTimer: a forgotten timer is closed at the end the user gave, never at the 16h cap (B1)', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  const start = new Date(Date.now() - 30 * 3_600_000);
  update((d) => { d.activeTimer = { category: 'sell', startedAt: start.toISOString() }; });
  const end = new Date(start.getTime() + 2 * 3_600_000);
  const r = startTimer('build', { prev: { end, moved: 'Called 4 parents' } });
  assert.equal(r.logged?.end, end.toISOString());
  assert.equal(r.logged?.note, 'Called 4 parents');
  update((d) => { d.activeTimer = { category: 'sell', startedAt: start.toISOString() }; });
  assert.equal(startTimer('ops').logged, null, 'no end given and no box: not logged as 16 hours');
  assert.equal(getState().timeLog.length, 1);
  flush();
});

test('startTimer tags escape-check sessions; the tags reach the entry and survive migrate', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  startTimer('escape', { timeboxMin: 90, source: 'escape', overridden: true });
  assert.deepEqual(
    { source: getState().activeTimer?.source, overridden: getState().activeTimer?.overridden },
    { source: 'escape', overridden: true },
  );
  startTimer('build', { overridden: true });
  assert.equal(getState().activeTimer?.overridden, undefined, 'overridden only means something with source escape');
  const m = migrate({
    activeTimer: { category: 'build', startedAt: NOW.toISOString(), source: 'escape' },
    timeLog: [
      { id: 'a', category: 'build', start: '2026-10-28T01:00:00Z', end: '2026-10-28T02:00:00Z', source: 'escape', overridden: true },
      { id: 'b', category: 'build', start: '2026-10-28T01:00:00Z', end: '2026-10-28T02:00:00Z', source: 'nope', overridden: true },
    ],
  }, NOW);
  assert.equal(m.activeTimer?.source, 'escape');
  assert.equal(m.timeLog[0].source, 'escape');
  assert.equal(m.timeLog[0].overridden, true);
  assert.equal(m.timeLog[1].source, undefined);
  assert.equal(m.timeLog[1].overridden, undefined);
  flush();
});

test('extendTimebox gives a time-boxed timer more time from now', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  update((d) => { d.activeTimer = { category: 'build', startedAt: new Date(Date.now() - 100 * 60_000).toISOString(), timeboxMin: 90 }; });
  extendTimebox(15);
  const box = getState().activeTimer?.timeboxMin ?? 0;
  assert.ok(box >= 115 && box <= 116, `box is time run + 15 (got ${box})`);
  update((d) => { d.activeTimer = { category: 'sell', startedAt: new Date().toISOString() }; });
  extendTimebox(15);
  assert.equal(getState().activeTimer?.timeboxMin, undefined, 'no box: unchanged');
  flush();
});

test('update with touch: false keeps updatedAt (bookkeeping is not a change)', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  update((d) => { d.profile.name = 'A'; });
  const before = getState().updatedAt;
  update((d) => { d.sync.rev = 4; d.sync.syncedUpdatedAt = d.updatedAt; }, { touch: false });
  assert.equal(getState().updatedAt, before);
  assert.equal(getState().sync.syncedUpdatedAt, before);
  assert.equal(getState().sync.rev, 4);
  flush();
});

test('a write never overwrites a newer copy saved by another tab, and keeps this tab\'s edit on top', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const seen: boolean[] = [];
  onExternalChange((info) => { seen.push(info.dropped); });
  const theirs = structuredClone(getState());
  theirs.talks.push({ id: 'other-tab', date: '2026-10-28', role: 'parent', channel: '', did: 'Paid', story: '', opinion: '' });
  theirs.updatedAt = '2026-10-28T04:00:00.000Z';
  storage.setItem(STORAGE_KEY, JSON.stringify(theirs));
  let notified = 0;
  const off = subscribe(() => { notified++; });
  update((d) => { d.profile.name = 'This tab'; });
  flush();
  off();
  onExternalChange(null);
  const stored = JSON.parse(storage.getItem(STORAGE_KEY) as string);
  assert.deepEqual(stored.talks.map((t: { id: string }) => t.id), ['other-tab'], 'their talk survives');
  assert.equal(stored.profile.name, 'This tab', 'this tab\'s unrelated edit survives too');
  assert.equal(getState().talks[0]?.id, 'other-tab', 'this tab now shows their copy');
  assert.equal(getState().profile.name, 'This tab');
  assert.deepEqual(seen, [false], 'nothing was dropped');
  assert.equal(hasPendingWrites(), false);
  assert.ok(notified >= 2, 'the view re-renders with the merged copy');
});

test('storage event from another tab: pending edits inside the debounce are re-applied, not dropped (A4)', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const seen: boolean[] = [];
  onExternalChange((info) => { seen.push(info.dropped); });
  update((d) => { d.profile.name = 'Typed in B'; }, { silent: true }); // still inside the 300 ms debounce
  const theirs = structuredClone(getState());
  theirs.profile.name = 'Big';
  theirs.profile.weeklyTalkTarget = 12; // tab A saved another field
  const raw = JSON.stringify(theirs);
  storage.setItem(STORAGE_KEY, raw);
  handleStorageEvent(STORAGE_KEY, raw);
  onExternalChange(null);
  assert.equal(getState().profile.name, 'Typed in B');
  assert.equal(getState().profile.weeklyTalkTarget, 12);
  const stored = JSON.parse(storage.getItem(STORAGE_KEY) as string);
  assert.equal(stored.profile.name, 'Typed in B', 'written right away');
  assert.equal(stored.profile.weeklyTalkTarget, 12);
  assert.deepEqual(seen, [false]);
  assert.equal(hasPendingWrites(), false);
});

test('a pending edit that can\'t be re-applied is reported as dropped', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const seen: boolean[] = [];
  onExternalChange((info) => { seen.push(info.dropped); });
  update((d) => {
    const b = d.bets.find((x) => x.name === 'SHIFT');
    if (!b) throw new Error('gone');
    b.notes = 'edited';
  });
  const theirs = { ...structuredClone(getState()), bets: [] };
  const raw = JSON.stringify(theirs);
  storage.setItem(STORAGE_KEY, raw);
  handleStorageEvent(STORAGE_KEY, raw);
  onExternalChange(null);
  assert.deepEqual(seen, [true]);
  assert.equal(getState().bets.length, 0);
});

test('import/pull in another tab: generation moves and edits queued for the old dataset are dropped', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const seen: boolean[] = [];
  onExternalChange((info) => { seen.push(info.dropped); });
  const gen = datasetGeneration();
  update((d) => { d.profile.name = 'Old dataset edit'; }, { silent: true });
  handleStorageEvent(DATASET_GEN_KEY, 'x-1');
  assert.equal(datasetGeneration(), gen + 1);
  const imported = { ...emptyState(NOW), talks: [{ id: 'imp', date: '2026-10-28', role: 'other', channel: '', did: 'x', story: '', opinion: '' }] };
  const raw = JSON.stringify(imported);
  storage.setItem(STORAGE_KEY, raw);
  handleStorageEvent(STORAGE_KEY, raw);
  onExternalChange(null);
  assert.equal(getState().profile.name, 'Big');
  assert.equal(getState().talks[0].id, 'imp');
  assert.deepEqual(seen, [true], 'the dropped edit is reported');
});

test('replaceState and eraseAll move the dataset generation and tell other tabs', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const g0 = datasetGeneration();
  replaceState({ talks: [] });
  assert.equal(datasetGeneration(), g0 + 1);
  assert.ok(storage.getItem(DATASET_GEN_KEY));
  eraseAll(NOW);
  assert.equal(datasetGeneration(), g0 + 2);
  assert.ok(storage.getItem(ERASE_EVENT_KEY), 'erase generation is persisted (survives for frozen tabs)');
});

test('erase in another tab: hooks run with remote: true, queued edits are dropped, the fresh copy is adopted (A6)', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  const infos: { remote: boolean }[] = [];
  const off = onErase((info) => { infos.push(info); });
  update((d) => { d.talks.push({ id: 'mine', date: '2026-10-28', role: 'other', channel: '', did: 'x', story: '', opinion: '' }); });
  const gen = datasetGeneration();
  // What the other tab's eraseAll leaves in storage.
  storage.removeItem('anchor:sync:pass');
  storage.setItem(ERASE_EVENT_KEY, 'erase-1');
  const fresh = JSON.stringify(emptyState(NOW));
  storage.setItem(STORAGE_KEY, fresh);
  handleStorageEvent(ERASE_EVENT_KEY, 'erase-1');
  off();
  assert.deepEqual(infos, [{ remote: true }]);
  assert.ok(datasetGeneration() > gen);
  assert.equal(getState().talks.length, 0, 'the erased copy is shown, not the old one');
  assert.equal(hasPendingWrites(), false);
  flush();
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) as string).talks.length, 0, 'the old talk is not written back');
  handleStorageEvent(ERASE_EVENT_KEY, 'erase-1');
  assert.equal(infos.length, 1, 'the same erase is handled once');
});

test('import/pull (replaceState) and erase still write over another tab', () => {
  const storage = createMemoryStorage();
  initStore({ storage, now: NOW });
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...getState(), talks: [] , updatedAt: '2026-10-28T04:00:00.000Z' }));
  replaceState({ talks: [{ id: 'imported', date: '2026-10-28', role: 'other', channel: '', did: 'x', story: '', opinion: '' }] });
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY) as string).talks[0].id, 'imported');
});

test('eraseAll runs the erase hooks (in-memory secrets and drafts)', () => {
  initStore({ storage: createMemoryStorage(), now: NOW });
  let calls = 0;
  const off = onErase(() => { calls++; });
  eraseAll(NOW);
  off();
  eraseAll(NOW);
  assert.equal(calls, 1);
});

test('migrate keeps at most 3 actions per day (B10)', () => {
  const s = migrate({ days: { '2026-10-28': { actions: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] } } }, NOW);
  assert.deepEqual(s.days['2026-10-28'].actions.map((a) => a.text), ['a', 'b', 'c']);
});

test('migrate for an import caps collections before normalising and keeps the newest (A7)', () => {
  const n = COLLECTION_LIMITS.bets + 50;
  const bets = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bet ${i}` }));
  const s = migrate({ bets }, NOW, { forImport: true });
  assert.equal(s.bets.length, COLLECTION_LIMITS.bets);
  assert.equal(s.bets.at(-1)?.id, `b${n - 1}`);
  assert.equal(s.bets[0].id, 'b50');
  assert.equal(migrate({ bets }, NOW).bets.length, n, 'a normal save keeps them all');
});

test('normal saves never trim old records (the caps are for imports only)', () => {
  const n = COLLECTION_LIMITS.timeLog + 1;
  const timeLog = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`, category: 'build', start: new Date(Date.UTC(2023, 0, 1) + i * 3_600_000).toISOString(),
    end: new Date(Date.UTC(2023, 0, 1) + i * 3_600_000 + 1_800_000).toISOString(),
  }));
  const plain = migrate({ timeLog }, NOW);
  assert.equal(plain.timeLog.length, n);
  assert.equal(plain.timeLog[0].id, 'e0', 'the oldest block is still there');

  // Through the store: one more block on top of 10,001 keeps every one of them.
  const storage = createMemoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyState(NOW), timeLog }));
  initStore({ storage, now: NOW });
  update((d) => { d.timeLog.push({ id: 'new', category: 'sell', start: NOW.toISOString(), end: new Date(NOW.getTime() + 600_000).toISOString() }); });
  flush();
  const stored = JSON.parse(storage.getItem(STORAGE_KEY) as string);
  assert.equal(stored.timeLog.length, n + 1);
  assert.equal(stored.timeLog[0].id, 'e0');

  const days: Record<string, unknown> = {};
  for (let i = 0; i < 3_701; i++) days[new Date(Date.UTC(2016, 0, 1) + i * 86_400_000).toISOString().slice(0, 10)] = { actions: [{ text: 'a' }] };
  assert.equal(Object.keys(migrate({ days }, NOW).days).length, 3_701);
  assert.equal(Object.keys(migrate({ days }, NOW, { forImport: true }).days).length, 3_700);
  const decisions = Array.from({ length: 401 }, () => ({ verdict: 'continue', why: '', date: '2026-01-01' }));
  assert.equal(migrate({ bets: [{ id: 'b', name: 'x', decisions }] }, NOW).bets[0].decisions.length, 401);
  assert.equal(migrate({ bets: [{ id: 'b', name: 'x', decisions }] }, NOW, { forImport: true }).bets[0].decisions.length, 400);
});

test('prepareImport drops empty records and refuses an oversized result (A7)', () => {
  const tiny = { schemaVersion: 1, bets: Array.from({ length: 300 }, () => ({})), talks: [{}, { did: 'Paid' }],
    worries: [{ text: '  ' }, { text: 'Visa' }], timeLog: [{ start: '2026-10-28T01:00:00Z', end: '2026-10-28T01:00:00Z' }],
    heavy: [{ title: 'Legal matter', nextAction: '' }], days: { '2026-10-27': {}, '2026-10-28': { actions: [{ text: 'Call' }] } },
    reviews: [{}], funnel: [{}, { label: 'SHIFT[2]' }], escapes: [{}], parking: [{ text: '' }] };
  const r = prepareImport(tiny, NOW);
  assert.ok(r.ok);
  assert.equal(r.state.bets.length, 0);
  assert.deepEqual(r.state.talks.map((t) => t.did), ['Paid']);
  assert.deepEqual(r.state.worries.map((w) => w.text), ['Visa']);
  assert.equal(r.state.timeLog.length, 0);
  assert.equal(r.state.heavy.length, 1, 'a titled item with no next step is kept');
  assert.deepEqual(Object.keys(r.state.days), ['2026-10-28']);
  assert.equal(r.state.reviews.length, 0);
  assert.deepEqual(r.state.funnel.map((f) => f.label), ['SHIFT[2]']);
  assert.equal(r.state.escapes.length, 0);
  assert.equal(r.state.parking.length, 0);
  // Normal saves never drop records.
  assert.equal(migrate(tiny, NOW).bets.length, 300);
  const big = { talks: Array.from({ length: 900 }, (_, i) => ({ id: `t${i}`, did: 'x'.repeat(5000) })) };
  const tooBig = prepareImport(big, NOW);
  assert.equal(tooBig.ok, false);
  assert.ok(tooBig.bytes > MAX_STATE_BYTES);
});
