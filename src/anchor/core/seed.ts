// First-run seed (spec v1). Pure module.

import type { AnchorState, Bet, FunnelRow, HeavyItem, Profile } from './types.ts';
import { newId } from './id.ts';

const DRAFT = 'Draft — edit me.';
const FILL = '(fill in)';

export const DEFAULT_PROFILE: Readonly<Profile> = {
  name: 'Big',
  weeklyTalkTarget: 10,
  buildSellTarget: 0.5,
  maxActiveBets: 3,
};

export const DEFAULT_LOCK_AFTER_MIN = 5;

/** A valid, empty state (no seed content). */
export function emptyState(now: Date = new Date()): AnchorState {
  const at = now.toISOString();
  return {
    schemaVersion: 1,
    createdAt: at,
    updatedAt: at,
    profile: { ...DEFAULT_PROFILE },
    days: {},
    bets: [],
    timeLog: [],
    escapes: [],
    parking: [],
    funnel: [],
    talks: [],
    heavy: [],
    worries: [],
    reviews: [],
    lock: { lockAfterMin: DEFAULT_LOCK_AFTER_MIN },
    sync: { rev: 0 },
  };
}

// Generic on purpose: this seed ships in the public JS bundle, so it holds names only: no hypotheses,
// metrics, continue/kill lines, prices or side projects. The real bets and numbers live in a private start
// file kept outside the repo (Settings → Import a backup).

function activeBet(createdAt: string, name: string, reviewOn: string): Bet {
  return {
    id: newId(), createdAt, decisions: [],
    name, hypothesis: FILL, metric: FILL, continueIf: FILL, killIf: FILL, reviewOn, status: 'active', notes: DRAFT,
  };
}

export function seedBets(createdAt: string): Bet[] {
  return [
    activeBet(createdAt, 'SHIFT', '2026-12-20'),
    activeBet(createdAt, 'School SHIFT (first school)', '2026-12-15'),
    activeBet(createdAt, 'SHIFT High (alumni community)', '2026-12-01'),
  ];
}

/** Shown on seeded funnel rows: the real numbers are not in the public code. */
export const SEED_FUNNEL_NOTE = 'Fill in, or import your private start file.';

export function seedFunnel(): FunnelRow[] {
  return [
    { id: newId(), label: 'SHIFT[1]', period: 'cohort', note: SEED_FUNNEL_NOTE },
    { id: newId(), label: 'SHIFT[2]', period: 'cohort', note: SEED_FUNNEL_NOTE },
  ];
}

/** One neutral Heavy item with no next step yet (Heavy and Today show a prompt to add one). */
export function seedHeavy(updatedAt: string): HeavyItem[] {
  return [
    {
      id: newId(),
      title: 'Legal matter',
      kind: 'legal',
      nextAction: '',
      status: 'open',
      notes: '',
      updatedAt,
    },
  ];
}

/** Full first-run state. */
export function createSeedState(now: Date = new Date()): AnchorState {
  const s = emptyState(now);
  s.bets = seedBets(s.createdAt);
  s.funnel = seedFunnel();
  s.heavy = seedHeavy(s.createdAt);
  return s;
}
