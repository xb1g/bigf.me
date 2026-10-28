// Pure helpers for the Time view. No window/document access.

import type { ActiveTimer, ID, ISODate, TimeCategory, TimeEntry } from '../core/types.ts';
import type { BuildSell, CategoryHours } from '../core/metrics.ts';
import { MAX_BLOCK_HOURS, MIN_TIME_ENTRY_MS, TIME_CATEGORIES, labelOf } from '../core/constants.ts';
import {
  addDays, addWeeks, bangkokDateTimeToIso, formatDate, formatMinutes, formatShortDate, isISODate, isoToBangkokInput,
  toISODate, weekKey, weekRange,
} from '../core/dates.ts';
import { entriesInWeek, entryMinutes, timerCapMs, timerElapsedMs } from '../core/metrics.ts';

/** Longest block a manual entry may span (shared with the forgotten-timer cap). */
export { MAX_BLOCK_HOURS };
/** Build share this far from target still counts as "on target". */
export const RATIO_TOLERANCE = 0.1;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** CSS colour for a category (tokens live in anchor.css). */
export function categoryColor(c: TimeCategory): string {
  return `var(--cat-${c})`;
}

export function isCategory(x: unknown): x is TimeCategory {
  return typeof x === 'string' && TIME_CATEGORIES.some((c) => c.value === x);
}

export interface CategoryRow { value: TimeCategory; label: string; hours: number; share: number }

/** One row per category (spec order). `share` is hours / the biggest category (0..1), for bars. */
export function categoryRows(hours: CategoryHours): CategoryRow[] {
  const max = Math.max(0, ...TIME_CATEGORIES.map((c) => hours[c.value] || 0));
  return TIME_CATEGORIES.map((c) => {
    const h = Math.max(0, hours[c.value] || 0);
    return { value: c.value, label: c.label, hours: h, share: max > 0 ? h / max : 0 };
  });
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

const WEEK_RE = /^\d{4}-W\d{2}$/;

/** A valid week key no later than `currentWk`, else `currentWk`. */
export function resolveWeek(candidate: string | null | undefined, currentWk: string): string {
  if (!candidate || !WEEK_RE.test(candidate)) return currentWk;
  try {
    weekRange(candidate);
  } catch {
    return currentWk;
  }
  return candidate > currentWk ? currentWk : candidate;
}

export function canGoNext(wk: string, currentWk: string): boolean {
  return wk < currentWk;
}

/** 'This week' · 'Last week' · 'Week of 12 Oct'. */
export function weekTitle(wk: string, currentWk: string): string {
  if (wk === currentWk) return 'This week';
  if (wk === addWeeks(currentWk, -1)) return 'Last week';
  const curYear = Number(weekRange(currentWk).start.slice(0, 4));
  return `Week of ${formatShortDate(weekRange(wk).start, curYear)}`;
}

/** 'Mon 26 Oct – Sun 1 Nov'. */
export function weekRangeLabel(wk: string, refYear?: number): string {
  const { start, end } = weekRange(wk);
  return `${formatDate(start, refYear)} – ${formatDate(end, refYear)}`;
}

// ---------------------------------------------------------------------------
// Blocks list
// ---------------------------------------------------------------------------

export interface DayGroup { date: ISODate; entries: TimeEntry[]; minutes: number }

/** Entries starting in the week, grouped by Bangkok start date. Newest day first, newest entry first. */
export function blocksByDay(timeLog: TimeEntry[], wk: string): DayGroup[] {
  const groups = new Map<ISODate, TimeEntry[]>();
  for (const e of entriesInWeek(timeLog, wk)) {
    const d = toISODate(e.start);
    const list = groups.get(d) ?? [];
    list.push(e);
    groups.set(d, list);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, entries]) => {
      const sorted = [...entries].sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
      return { date, entries: sorted, minutes: sorted.reduce((s, e) => s + entryMinutes(e), 0) };
    });
}

/** The running timer as a time entry [startedAt, now], capped at timerCapMs. */
export function runningAsEntry(t: ActiveTimer, now: Date = new Date()): TimeEntry {
  const startMs = Date.parse(t.startedAt);
  const endMs = Number.isNaN(startMs) ? now.getTime() : startMs + Math.min(timerElapsedMs(t, now), timerCapMs(t));
  return { id: RUNNING_TIMER_ID, category: t.category, start: t.startedAt, end: new Date(endMs).toISOString() };
}

/** Toast after adding/saving a block: names what it overlaps (the running timer or another block). */
export function overlapNote(overlaps: readonly Pick<TimeEntry, 'id'>[]): string {
  if (!overlaps.length) return '';
  return overlaps.some((e) => e.id === RUNNING_TIMER_ID) ? 'It overlaps the running timer.' : 'It overlaps another block.';
}

/** '09:00–10:30', with ' (next day)' when the block ends on a later Bangkok date. */
export function blockRangeLabel(e: Pick<TimeEntry, 'start' | 'end'>): string {
  const a = isoToBangkokInput(e.start);
  const b = isoToBangkokInput(e.end);
  return `${a.time}–${b.time}${b.date !== a.date ? ' (next day)' : ''}`;
}

/** Id of the stand-in entry `overlapping` returns for the running timer. */
export const RUNNING_TIMER_ID = 'running-timer';

/**
 * Other entries that overlap [start, end). Pass `running` to include the running timer as an entry with
 * id RUNNING_TIMER_ID spanning [startedAt, now] (capped like the metrics: a forgotten timer past its cap
 * counts up to the cap), so saving a manual block over it warns.
 */
export function overlapping(
  timeLog: TimeEntry[], start: string, end: string, excludeId?: ID,
  running?: { timer?: ActiveTimer; now?: Date },
): TimeEntry[] {
  const a = Date.parse(start), b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return [];
  const list = running?.timer ? [...timeLog, runningAsEntry(running.timer, running.now ?? new Date())] : timeLog;
  return list.filter((e) => {
    if (e.id === excludeId) return false;
    const s = Date.parse(e.start), t = Date.parse(e.end);
    return !Number.isNaN(s) && !Number.isNaN(t) && s < b && a < t;
  });
}

// ---------------------------------------------------------------------------
// Manual block form
// ---------------------------------------------------------------------------

export interface BlockInput { category: TimeCategory | ''; date: string; start: string; end: string; note: string }
export type BlockField = 'category' | 'date' | 'start' | 'end';
export interface BlockValue { category: TimeCategory; start: string; end: string; note?: string }
export type BlockResult =
  | { ok: true; value: BlockValue; minutes: number; endsNextDay: boolean }
  | { ok: false; errors: Partial<Record<BlockField, string>> };

/**
 * Validate a start/end form. An end time earlier than the start means the block ran past midnight.
 * Equal times, spans over MAX_BLOCK_HOURS, and blocks ending in the future are rejected.
 */
export function validateBlock(input: BlockInput, now: Date = new Date()): BlockResult {
  const errors: Partial<Record<BlockField, string>> = {};
  if (!isCategory(input.category)) errors.category = 'Pick a category.';
  if (!isISODate(input.date)) errors.date = 'Pick a date.';
  if (!TIME_RE.test(input.start)) errors.start = 'Add a start time.';
  if (!TIME_RE.test(input.end)) errors.end = 'Add an end time.';
  if (Object.keys(errors).length) return { ok: false, errors };

  if (input.start === input.end) return { ok: false, errors: { end: 'End needs to be after start.' } };
  const endsNextDay = input.end < input.start;
  const start = bangkokDateTimeToIso(input.date, input.start);
  const endDate = endsNextDay ? addDays(input.date, 1) : input.date;
  const end = bangkokDateTimeToIso(endDate, input.end);
  const minutes = entryMinutes({ start, end });
  if (minutes > MAX_BLOCK_HOURS * 60) {
    return { ok: false, errors: { end: `That is over ${MAX_BLOCK_HOURS} hours. Check the times.` } };
  }
  if (Date.parse(end) > now.getTime() + 60_000) {
    return { ok: false, errors: { end: 'That ends in the future. Log it once it is done.' } };
  }
  const note = input.note.trim();
  return {
    ok: true,
    value: { category: input.category as TimeCategory, start, end, ...(note ? { note } : {}) },
    minutes,
    endsNextDay,
  };
}

/** Live hint under the times: '1h 30m' / '1h 30m · ends next day' / ''. Never an error. */
export function blockDurationHint(input: Pick<BlockInput, 'date' | 'start' | 'end'>): string {
  if (!TIME_RE.test(input.start) || !TIME_RE.test(input.end) || input.start === input.end) return '';
  const [sh, sm] = input.start.split(':').map(Number);
  const [eh, em] = input.end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  const nextDay = mins < 0;
  if (nextDay) mins += 24 * 60;
  return `${formatMinutes(mins)}${nextDay ? ' · ends next day' : ''}`;
}

/**
 * Validate an edit. When date/start/end are untouched, the original instants are kept as they are
 * (timer entries carry seconds, and a long timer run should not fail the manual-entry checks).
 */
export function applyEdit(original: TimeEntry, input: BlockInput, now: Date = new Date()): BlockResult {
  const before = entryToInput(original);
  const timesSame = input.date === before.date && input.start === before.start && input.end === before.end;
  if (!timesSame) return validateBlock(input, now);
  if (!isCategory(input.category)) return { ok: false, errors: { category: 'Pick a category.' } };
  const note = input.note.trim();
  return {
    ok: true,
    value: { category: input.category, start: original.start, end: original.end, ...(note ? { note } : {}) },
    minutes: entryMinutes(original),
    endsNextDay: toISODate(original.end) !== before.date,
  };
}

/** Form values for an existing entry. */
export function entryToInput(e: TimeEntry): BlockInput {
  const a = isoToBangkokInput(e.start);
  const b = isoToBangkokInput(e.end);
  return { category: e.category, date: a.date, start: a.time, end: b.time, note: e.note ?? '' };
}

/** Defaults for a new block: the hour that just ended (rounded down to 5 min). */
export function defaultBlockInput(now: Date, category: TimeCategory | '' = 'build'): BlockInput {
  const step = 5 * 60_000;
  const endMs = Math.floor(now.getTime() / step) * step;
  const a = isoToBangkokInput(new Date(endMs - 60 * 60_000));
  const b = isoToBangkokInput(new Date(endMs));
  return { category, date: a.date, start: a.time, end: b.time, note: '' };
}

/** Default date for the add form when looking at `wk`: today if it is in that week, else its Sunday. */
export function defaultDateForWeek(wk: string, today: ISODate): ISODate {
  if (weekKey(today) === wk) return today;
  return weekRange(wk).end;
}

// ---------------------------------------------------------------------------
// Build : sell
// ---------------------------------------------------------------------------

export interface RatioSummary {
  tone: 'good' | 'warn' | 'muted';
  /** One calm sentence. */
  text: string;
  /** '62% build · 38% sell' or 'No build or sell time yet'. */
  valueText: string;
}

/** Copy for the build vs sell card. Selling more than the target is fine (that is the point). */
export function ratioSummary(r: BuildSell, target: number): RatioSummary {
  if (r.buildShare === null || r.sellShare === null) {
    return { tone: 'muted', text: 'Log a build or sell block to see the split.', valueText: 'No build or sell time yet' };
  }
  const valueText = `${Math.round(r.buildShare * 100)}% build · ${Math.round(r.sellShare * 100)}% sell`;
  const targetPct = Math.round(target * 100);
  if (r.buildShare > target + RATIO_TOLERANCE) {
    return { tone: 'warn', text: `Building is ahead of the ${targetPct}% target. One talk would tip it back.`, valueText };
  }
  if (r.buildShare < target - RATIO_TOLERANCE) {
    return { tone: 'good', text: 'Selling is ahead. Good.', valueText };
  }
  return { tone: 'good', text: 'Close to target. Keep the balance.', valueText };
}

// ---------------------------------------------------------------------------
// Timer feedback
// ---------------------------------------------------------------------------

export interface StopTimeInput { date: string; time: string }
export type StopTimeResult = { ok: true; end: Date; minutes: number } | { ok: false; error: string };

/**
 * Prefill for "When did you stop?" (a forgotten timer): the end of its timebox (never later than now). A timer
 * without a box gets only the day it started and no time, so one tap can't log the 16-hour cap: he picks a
 * real time (or "Don't log it").
 */
export function stopTimeDefault(t: Pick<ActiveTimer, 'startedAt' | 'timeboxMin'>, now: Date = new Date()): StopTimeInput {
  const start = Date.parse(t.startedAt);
  const box = t.timeboxMin && t.timeboxMin > 0 ? t.timeboxMin : 0;
  if (!box) return { date: isoToBangkokInput(Number.isNaN(start) ? now : new Date(start)).date, time: '' };
  const end = Number.isNaN(start) ? now.getTime() : Math.min(start + box * 60_000, now.getTime());
  return isoToBangkokInput(new Date(end));
}

/** Check a stop time with the manual-block rules: after the start, at most MAX_BLOCK_HOURS, not in the future. */
export function validateStopTime(t: Pick<ActiveTimer, 'startedAt'>, input: StopTimeInput, now: Date = new Date()): StopTimeResult {
  if (!isISODate(input.date) || !TIME_RE.test(input.time)) return { ok: false, error: 'Pick a date and a time.' };
  const start = Date.parse(t.startedAt);
  const end = Date.parse(bangkokDateTimeToIso(input.date, input.time));
  if (Number.isNaN(start) || Number.isNaN(end)) return { ok: false, error: 'Pick a date and a time.' };
  if (end <= start) return { ok: false, error: 'That is before the timer started.' };
  const minutes = (end - start) / 60_000;
  if (minutes > MAX_BLOCK_HOURS * 60) return { ok: false, error: `That is over ${MAX_BLOCK_HOURS} hours. Check the time.` };
  if (end > now.getTime() + 60_000) return { ok: false, error: 'That is in the future. Pick when you stopped.' };
  const clamped = Math.min(end, now.getTime());
  // Under a minute would not be logged at all (MIN_TIME_ENTRY_MS): say so instead of silently dropping it.
  if (clamped - start < MIN_TIME_ENTRY_MS) return { ok: false, error: 'That is under a minute after it started. Pick a later time.' };
  return { ok: true, end: new Date(clamped), minutes: (clamped - start) / 60_000 };
}

/** Banner on every screen once a time-boxed timer has run past its box. */
export function timeboxBannerText(t: Pick<ActiveTimer, 'timeboxMin'>): string {
  const box = t.timeboxMin ?? 0;
  const span = box % 60 === 0 && box >= 60 ? `${box / 60} hour${box === 60 ? ' is' : 's are'}` : `${box} minutes are`;
  return `Your ${span} up. What moved?`;
}

/** Toast after stopping the timer. */
export function stopMessage(e: Pick<TimeEntry, 'category' | 'start' | 'end'> | null): string {
  if (!e) return 'Under a minute — not logged.';
  return `Logged ${formatMinutes(entryMinutes(e))} of ${labelOf(TIME_CATEGORIES, e.category)}.`;
}
