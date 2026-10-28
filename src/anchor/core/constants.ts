// Shared enums, labels and limits. Pure module.

import type { BetStatus, HeavyKind, TalkRole, TimeCategory, Verdict } from './types.ts';

export const STORAGE_KEY = 'anchor:v1';
export const APP_VERSION = '1.0.0';

export const MAX_ACTIONS = 3;
export const DEFAULT_TIMEBOX_MIN = 90;
export const ESCAPE_MAX_DAYS = 30;
export const REVIEW_PUSH_DAYS = 14;
export const MENTOR_FLOOR_THB_PER_HOUR = 130;
export const TARGET_THB_PER_HOUR = 300;
export const EVENING_HOUR = 18;               // shutdown shows from 18:00 Bangkok
export const MIN_TIME_ENTRY_MS = 60_000;      // timers under a minute are not logged
export const SHUTDOWN_GRACE_HOUR = 4;         // before 04:00 Bangkok, the shutdown still closes yesterday
export const MAX_BLOCK_HOURS = 16;            // longest block a manual entry (or a forgotten timer) may log
export const TIMER_GRACE_MIN = 30;            // a timer may run this far past its timebox before Stop asks
export const TIMEBOX_SNOOZE_MIN = 15;         // "+15 min" on the timebox banner

/** Device-local keys broadcast to other tabs through storage events (never part of AnchorState). */
export const ERASE_EVENT_KEY = 'anchor:erase-gen';      // changes on every erase: other tabs drop secrets, drafts, dialogs
export const DATASET_GEN_KEY = 'anchor:dataset-gen';    // changes on every import / pull (dataset replaced)

/**
 * Most items an import or pull keeps per collection (the newest: lists are kept from the end, days by latest
 * date). They stop a small file from expanding into a huge state. Normal saves are never capped.
 */
export const COLLECTION_LIMITS = {
  bets: 500,
  timeLog: 10_000,
  escapes: 3_000,
  parking: 2_000,
  funnel: 1_000,
  talks: 5_000,
  heavy: 2_000,
  worries: 5_000,
  reviews: 1_000,
} as const;
export const MAX_DAYS = 3_700;                // about ten years of days
export const MAX_BET_DECISIONS = 400;         // per bet
export const MAX_REVIEW_DECISIONS = 50;       // per weekly review
/** Largest normalised state (JSON bytes) an import or pull may write to this device. */
export const MAX_STATE_BYTES = 4 * 1024 * 1024;

export interface Option<T extends string> { value: T; label: string }

export const TIME_CATEGORIES: readonly Option<TimeCategory>[] = [
  { value: 'build', label: 'Build' },
  { value: 'sell', label: 'Sell & talk' },
  { value: 'ops', label: 'Ops' },
  { value: 'teach', label: 'Teach' },
  { value: 'rest', label: 'Rest' },
  { value: 'escape', label: 'Escape' },
];

export const BET_STATUSES: readonly Option<BetStatus>[] = [
  { value: 'active', label: 'Active' },
  { value: 'parked', label: 'Parked' },
  { value: 'killed', label: 'Killed' },
  { value: 'won', label: 'Won' },
];

export const VERDICTS: readonly Option<Verdict>[] = [
  { value: 'continue', label: 'Continue' },
  { value: 'change', label: 'Change' },
  { value: 'park', label: 'Park' },
  { value: 'kill', label: 'Kill' },
];

export const TALK_ROLES: readonly Option<TalkRole>[] = [
  { value: 'parent', label: 'Parent' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
  { value: 'alum', label: 'Alum' },
  { value: 'school', label: 'School' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'partner', label: 'Partner' },
  { value: 'other', label: 'Other' },
];

export const TALK_CHANNELS: readonly Option<string>[] = [
  { value: 'call', label: 'Call' },
  { value: 'in person', label: 'In person' },
  { value: 'LINE', label: 'LINE' },
  { value: 'IG', label: 'IG' },
  { value: 'Discord', label: 'Discord' },
  { value: 'other', label: 'Other' },
];

export const HEAVY_KINDS: readonly Option<HeavyKind>[] = [
  { value: 'legal', label: 'Legal' },
  { value: 'money', label: 'Money' },
  { value: 'family', label: 'Family' },
  { value: 'health', label: 'Health' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

export const HEAVY_STATUSES: readonly Option<'open' | 'waiting' | 'done'>[] = [
  { value: 'open', label: 'Open' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
];

/** Label for an option value (falls back to the raw value). */
export function labelOf<T extends string>(options: readonly Option<T>[], value: T | string | undefined): string {
  if (value === undefined) return '';
  return options.find((o) => o.value === value)?.label ?? String(value);
}
