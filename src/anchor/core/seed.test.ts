import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState, emptyState, SEED_FUNNEL_NOTE } from './seed.ts';
import { migrate } from './store.ts';
import { isISODate } from './dates.ts';
import { activeBetCount, cashPerFounderHour, funnelBottleneck, FUNNEL_MONEY, FUNNEL_STAGES } from './metrics.ts';

const NOW = new Date('2026-10-28T03:00:00.000Z');

test('emptyState has every collection and the default profile', () => {
  const s = emptyState(NOW);
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.createdAt, NOW.toISOString());
  assert.deepEqual(s.profile, { name: 'Big', weeklyTalkTarget: 10, buildSellTarget: 0.5, maxActiveBets: 3 });
  for (const k of ['bets', 'timeLog', 'escapes', 'parking', 'funnel', 'talks', 'heavy', 'worries', 'reviews'] as const) {
    assert.deepEqual(s[k], [], k);
  }
  assert.deepEqual(s.days, {});
  assert.deepEqual(s.lock, { lockAfterMin: 5 });
  assert.deepEqual(s.sync, { rev: 0 });
  assert.equal(s.activeTimer, undefined);
});

test('seed: three active bets with names only (the real text comes from the private start file)', () => {
  const s = createSeedState(NOW);
  assert.deepEqual(s.bets.map((b) => [b.name, b.status, b.reviewOn]), [
    ['SHIFT', 'active', '2026-12-20'],
    ['School SHIFT (first school)', 'active', '2026-12-15'],
    ['SHIFT High (alumni community)', 'active', '2026-12-01'],
  ]);
  assert.equal(activeBetCount(s.bets), 3);
  assert.ok(activeBetCount(s.bets) <= s.profile.maxActiveBets, 'seed respects the WIP limit');
  for (const b of s.bets) {
    assert.equal(b.notes, 'Draft — edit me.', b.name);
    assert.ok(isISODate(b.reviewOn));
    assert.deepEqual(b.decisions, []);
    assert.equal(b.createdAt, NOW.toISOString());
    for (const field of ['hypothesis', 'metric', 'continueIf', 'killIf'] as const) assert.equal(b[field], '(fill in)', `${b.name} ${field}`);
  }
  assert.deepEqual(s.parking, []);
  assert.equal(new Set(s.bets.map((b) => b.id)).size, s.bets.length, 'unique ids');
});

test('seed: funnel rows are named but carry no numbers (real ones come from the private start file)', () => {
  const s = createSeedState(NOW);
  assert.deepEqual(s.funnel.map((r) => [r.label, r.period]), [['SHIFT[1]', 'cohort'], ['SHIFT[2]', 'cohort']]);
  for (const r of s.funnel) {
    for (const k of [...FUNNEL_STAGES.map((x) => x.key), ...FUNNEL_MONEY.map((x) => x.key)]) {
      assert.equal(r[k], undefined, `${r.label} ${k} stays unknown`);
    }
    assert.equal(r.note, SEED_FUNNEL_NOTE);
    assert.equal(cashPerFounderHour(r), null);
    assert.equal(funnelBottleneck(r), null);
  }
});

test('seed: one neutral Heavy item with no next step yet, no other personal content', () => {
  const s = createSeedState(NOW);
  assert.equal(s.heavy.length, 1);
  const h = s.heavy[0];
  assert.equal(h.title, 'Legal matter');
  assert.equal(h.kind, 'legal');
  assert.equal(h.status, 'open');
  assert.equal(h.notes, '');
  assert.equal(h.nextAction, '', 'views prompt for the first step');
  assert.equal(h.deadline, undefined);
  assert.deepEqual(s.talks, []);
  assert.deepEqual(s.worries, []);
  assert.deepEqual(s.days, {});
});

test('seed: nothing private in the public bundle (no figures, prices, thresholds or side projects)', () => {
  const s = createSeedState(NOW);
  const text = JSON.stringify(s)
    .replace(/"id":"[^"]*"/g, '')
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?/g, '');
  assert.doesNotMatch(text, /\d{4,}/, 'no revenue, cost or other large figures');
  assert.doesNotMatch(text, /฿/, 'no prices');
  assert.doesNotMatch(text, /%/, 'no percentage thresholds');
  assert.doesNotMatch(text, /[≥≤<>]\s*\d/, 'no continue/kill lines');
  for (const b of s.bets) {
    const bet = JSON.stringify(b);
    assert.doesNotMatch(bet, /฿\s*\d|\d\s*%/, `${b.name} carries no ฿ or % figure`);
  }
  assert.equal(s.bets.filter((b) => b.status !== 'active').length, 0, 'no list of side projects');
});

test('seed: profile, lock, sync defaults', () => {
  const s = createSeedState(NOW);
  assert.deepEqual(s.profile, { name: 'Big', weeklyTalkTarget: 10, buildSellTarget: 0.5, maxActiveBets: 3 });
  assert.equal(s.lock.lockAfterMin, 5);
  assert.equal(s.lock.pinHash, undefined);
  assert.equal(s.sync.rev, 0);
});

test('seed survives migrate unchanged (it is already valid)', () => {
  const s = createSeedState(NOW);
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(s)), NOW), s);
});

test('each seed call makes fresh ids', () => {
  const a = createSeedState(NOW), b = createSeedState(NOW);
  assert.notEqual(a.bets[0].id, b.bets[0].id);
});
