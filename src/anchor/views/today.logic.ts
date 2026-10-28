// Pure helpers for the Today view. No window/document access.

import type { AnchorState, Bet, DayEntry, HeavyItem, ID, ISODate } from '../core/types.ts';
import {
  addDays, addWeeks, bangkokHour, daysBetween, formatMinutes, isISODate, isoToBangkokInput, relativeDays, weekKey,
  weekStart,
} from '../core/dates.ts';
import { EVENING_HOUR, MAX_ACTIONS, SHUTDOWN_GRACE_HOUR } from '../core/constants.ts';
import {
  buildSellRatio, escapesThisWeek, hoursByCategory, nextBetReviewDue, numberIssue, talksThisWeek,
} from '../core/metrics.ts';
import type { BuildSell } from '../core/metrics.ts';
import { NO_NEXT_STEP_COPY } from './heavy.logic.ts';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** Shown only when he tries to add a 4th action (never just because three exist). */
export const LIMIT_COPY = 'That’s three. Swap one out?';
export const ANCHOR_PROMPT = 'Today’s one thing that moves a number.';
export const ANCHOR_REQUIRED_COPY = 'Name the one thing first.';
export const ANCHOR_SET_COPY = 'Locked in. This is the one that counts today.';
export const ANCHOR_UPDATED_COPY = 'Anchor updated.';
export const CHECKIN_SUBTITLE = 'How did you sleep? How’s your energy?';
export const SCALE_LEGEND = '1 = drained · 5 = great';
export const LOW_ENERGY_COPY = 'Low energy today. Make the anchor smaller? Half of it still counts.';
export const LOW_ENERGY_EMPTY_HINT = 'Low energy today. Pick a small one. It still counts.';
export const ANCHOR_OPEN_COPY = 'Anchor’s still open. Do 15 min of it, or move it to tomorrow?';
export const ANCHOR_MOVED_COPY = 'Moved to tomorrow. It’ll be waiting.';
/** Shown under the anchor form when nothing looks off. */
export const ANCHOR_TEST_COPY = 'Test: when it’s done, is that number higher than this morning?';
export const TWO_THINGS_COPY = 'Looks like two things. Keep the one that moves the number. Put the other in Actions.';
export const NO_NUMBER_COPY = 'Which number goes up when it’s done? Make it a count: testers sent, parents asked.';
/** Hint under the shutdown's "Tomorrow's anchor" when it was filled in from today's open anchor. */
export const SHUTDOWN_CARRY_HINT = 'Today’s anchor is still open. Keep it for tomorrow, or change it.';
/** Same words as on the Heavy item card (one source). */
export { NO_NEXT_STEP_COPY };
/** The first-run card, one line each. */
export const INTRO_LINES: readonly string[] = [
  'Anchor = the one thing today that moves a number.',
  'Want to build something new? Do the 2-minute check first.',
  'Heavy = where the stressful stuff goes.',
];
/** Minutes for "Do 15 min of it" on an anchor that is still open. */
export const ANCHOR_NUDGE_MIN = 15;

/** Device-local keys (prefix 'anchor:' so eraseAll removes them). */
export const INTRO_DISMISSED_KEY = 'anchor:today:intro-dismissed';
/** Holds the date whose unfinished actions he already answered ("Not today" or all carried). */
export const CARRY_DISMISSED_KEY = 'anchor:today:carry-dismissed';

// ---------------------------------------------------------------------------
// Time of day → layout
// ---------------------------------------------------------------------------

export const NOON_HOUR = 12;

export type DayPhase = 'morning' | 'day' | 'evening';

/** morning: 04:00–11:59 · day: 12:00–17:59 · evening: 18:00–03:59 (Bangkok; late nights still close yesterday). */
export function dayPhase(now: Date): DayPhase {
  const hour = bangkokHour(now);
  if (hour >= EVENING_HOUR || hour < SHUTDOWN_GRACE_HOUR) return 'evening';
  return hour < NOON_HOUR ? 'morning' : 'day';
}

export type TodaySection =
  | 'intro' | 'anchor' | 'checkin' | 'carry' | 'actions' | 'timer' | 'escape' | 'week' | 'heavy' | 'shutdown';

/**
 * Order of Today's cards. The anchor always comes before the check-in. In the evening the shutdown moves
 * to the top and the check-in to the bottom; the carry-over prompt is a daytime thing.
 */
export function todaySections(phase: DayPhase, opts: { intro: boolean; carry: boolean }): TodaySection[] {
  const head: TodaySection[] = opts.intro ? ['intro'] : [];
  if (phase === 'evening') {
    return [...head, 'shutdown', 'anchor', 'actions', 'timer', 'escape', 'week', 'heavy', 'checkin'];
  }
  return [
    ...head, 'anchor', 'checkin', ...(opts.carry ? ['carry' as const] : []), 'actions', 'timer', 'escape', 'week', 'heavy',
    'shutdown',
  ];
}

// ---------------------------------------------------------------------------
// Drafts that keep their day (see ctx.pinnedDraft)
// ---------------------------------------------------------------------------

/**
 * Which day a write from a pinned card goes to: the draft's own day while it holds unsaved typing,
 * otherwise today right now (a tap a moment after midnight lands on the new day).
 */
export function pinnedWriteDate(draft: { date: ISODate; dirty?: boolean }, freshToday: ISODate): ISODate {
  return draft.dirty ? draft.date : freshToday;
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export type Scale = 1 | 2 | 3 | 4 | 5;
export type SleepChip = '4' | '5' | '6' | '7' | '8' | '9';
export type ScaleChip = '1' | '2' | '3' | '4' | '5';

export const SLEEP_OPTIONS: readonly { value: SleepChip; label: string; ariaLabel: string }[] = [
  { value: '4', label: '≤4', ariaLabel: '4 hours or less' },
  { value: '5', label: '5', ariaLabel: '5 hours' },
  { value: '6', label: '6', ariaLabel: '6 hours' },
  { value: '7', label: '7', ariaLabel: '7 hours' },
  { value: '8', label: '8', ariaLabel: '8 hours' },
  { value: '9', label: '9+', ariaLabel: '9 hours or more' },
];

/** 1–5 chips. The ends say what they mean ("Energy 1 of 5 (drained)"). */
export function scaleOptions(name: string): { value: ScaleChip; label: string; ariaLabel: string }[] {
  const ends: Partial<Record<ScaleChip, string>> = { 1: ' (drained)', 5: ' (great)' };
  return (['1', '2', '3', '4', '5'] as const).map((v) => ({ value: v, label: v, ariaLabel: `${name} ${v} of 5${ends[v] ?? ''}` }));
}

/** Stored sleep hours → chip value (clamped to the 4…9+ range). */
export function sleepToChip(hours: number | undefined): SleepChip | undefined {
  if (hours === undefined || !Number.isFinite(hours)) return undefined;
  const n = Math.min(9, Math.max(4, Math.round(hours)));
  return String(n) as SleepChip;
}

export function chipToSleep(chip: string): number | undefined {
  const n = Number(chip);
  return Number.isInteger(n) && n >= 4 && n <= 9 ? n : undefined;
}

export function parseScale(v: string): Scale | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as Scale) : undefined;
}

export function scaleToChip(v: number | undefined): ScaleChip | undefined {
  return v !== undefined && Number.isInteger(v) && v >= 1 && v <= 5 ? (String(v) as ScaleChip) : undefined;
}

/** True when sleep, energy and mood are all filled in. */
export function checkinComplete(day: DayEntry): boolean {
  const c = day.checkin;
  return Boolean(c && c.sleepHours !== undefined && c.energy !== undefined && c.mood !== undefined);
}

/** "Slept 6h · Energy 2/5 · Mood 3/5" (only the parts that are filled in). */
export function checkinSummary(c: DayEntry['checkin']): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.sleepHours !== undefined) parts.push(`Slept ${c.sleepHours >= 9 ? '9+' : c.sleepHours <= 4 ? '≤4' : c.sleepHours}h`);
  if (c.energy !== undefined) parts.push(`Energy ${c.energy}/5`);
  if (c.mood !== undefined) parts.push(`Mood ${c.mood}/5`);
  return parts.join(' · ');
}

export type CheckinQuestion = 'sleep' | 'energy' | 'mood';

export const CHECKIN_QUESTIONS: readonly CheckinQuestion[] = ['sleep', 'energy', 'mood'];

function checkinAnswer(c: DayEntry['checkin'], q: CheckinQuestion): { name: string; raw: number | undefined } {
  switch (q) {
    case 'sleep': return { name: 'Sleep', raw: c?.sleepHours };
    case 'energy': return { name: 'Energy', raw: c?.energy };
    default: return { name: 'Mood', raw: c?.mood };
  }
}

// ---------------------------------------------------------------------------
// Anchor coach: is it an anchor or a to-do?
// ---------------------------------------------------------------------------

const JOINER = /\s+(?:and|then|also|plus|&|\+)\s+|\s*[;,]\s+/i;
/** A part that starts like this is more of the same thing ("3 parents and 2 students"), not a second job. */
const NOT_A_TASK_START = /^(?:\d|the\b|a\b|an\b|my\b|some\b|all\b|their\b|our\b|his\b|her\b)/i;

/** True when the anchor reads like two jobs ("Send the tea and pack some testers"). */
export function looksLikeTwoThings(text: string): boolean {
  const parts = text.trim().split(JOINER).map((p) => p.trim()).filter(Boolean);
  return parts.slice(1).some((p) => p.split(/\s+/).length >= 2 && !NOT_A_TASK_START.test(p));
}

/**
 * Soft notes on an anchor, most useful first. Never blocks saving.
 * Catches the usual slips: two jobs in one, no number, a number that moves over months (ARR), or one you can't count.
 */
export function anchorCoach(text: string, metric: string | undefined): string[] {
  const notes: string[] = [];
  if (looksLikeTwoThings(text)) notes.push(TWO_THINGS_COPY);
  const m = (metric ?? '').trim();
  const issue = numberIssue(m);
  if (!m) {
    if (text.trim()) notes.push(NO_NUMBER_COPY);
  } else if (issue === 'slow') {
    notes.push(`${m} won’t move today. Count what you can finish today: testers sent, buyers asked, orders taken.`);
  } else if (issue === 'vague') {
    notes.push(`“${m}” is hard to count. Try a count, like “5 parents asked”.`);
  }
  return notes;
}

/**
 * One pill of the compact morning check-in: "Sleep —" until answered, then "Sleep 6h" / "Energy 2".
 * `ariaLabel` says the same in words ("Sleep: not answered yet").
 */
export function checkinPill(c: DayEntry['checkin'], q: CheckinQuestion): { label: string; ariaLabel: string; answered: boolean } {
  const { name, raw } = checkinAnswer(c, q);
  if (raw === undefined) return { label: `${name} —`, ariaLabel: `${name}: not answered yet`, answered: false };
  if (q === 'sleep') {
    const chip = SLEEP_OPTIONS.find((o) => o.value === sleepToChip(raw));
    return { label: `${name} ${chip?.label ?? raw}h`, ariaLabel: `${name}: ${chip?.ariaLabel ?? `${raw} hours`}`, answered: true };
  }
  return { label: `${name} ${raw}`, ariaLabel: `${name}: ${raw} of 5`, answered: true };
}

/** Energy 1 or 2: Today suggests a smaller anchor. */
export function lowEnergy(day: DayEntry): boolean {
  const e = day.checkin?.energy;
  return e !== undefined && e <= 2;
}

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

export type AnchorStatus = 'empty' | 'set' | 'done';

export function anchorStatus(day: DayEntry): AnchorStatus {
  const a = day.anchor;
  if (!a || !a.text.trim()) return 'empty';
  return a.done ? 'done' : 'set';
}

export interface AnchorInput { text: string; metric: string; byWhen: string; betId: string }

/** Valid 'HH:MM' (24h). */
export function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export function anchorInputFrom(day: DayEntry): AnchorInput {
  const a = day.anchor;
  return { text: a?.text ?? '', metric: a?.metric ?? '', byWhen: a?.byWhen ?? '', betId: a?.betId ?? '' };
}

/**
 * Normalise anchor form input into a stored anchor (keeps the done flag).
 * Returns null when the text is empty (the anchor needs a "what").
 */
export function buildAnchor(input: AnchorInput, prevDone = false): NonNullable<DayEntry['anchor']> | null {
  const text = input.text.trim();
  if (!text) return null;
  const out: NonNullable<DayEntry['anchor']> = { text, done: prevDone };
  const metric = input.metric.trim();
  if (metric) out.metric = metric;
  if (isTime(input.byWhen.trim())) out.byWhen = input.byWhen.trim();
  if (input.betId && input.betId !== 'none') out.betId = input.betId;
  return out;
}

/** Bet choices for the anchor: active bets, plus the currently linked bet if it is no longer active. */
export function anchorBetOptions(bets: Bet[], currentId?: ID): { value: string; label: string }[] {
  const opts = bets.filter((b) => b.status === 'active').map((b) => ({ value: b.id, label: b.name || 'Untitled bet' }));
  if (currentId && !opts.some((o) => o.value === currentId)) {
    const b = bets.find((x) => x.id === currentId);
    if (b) opts.push({ value: b.id, label: `${b.name || 'Untitled bet'} (${b.status})` });
  }
  return opts;
}

/** One-line meta for a set anchor: "Moves: signups · by 15:00 · SHIFT". */
export function anchorMeta(anchor: Pick<NonNullable<DayEntry['anchor']>, 'metric' | 'byWhen' | 'betId'>, bets: Bet[]): string {
  const parts: string[] = [];
  if (anchor.metric) parts.push(`Moves: ${anchor.metric}`);
  if (anchor.byWhen) parts.push(`by ${anchor.byWhen}`);
  const bet = anchor.betId ? bets.find((b) => b.id === anchor.betId) : undefined;
  if (bet) parts.push(bet.name);
  return parts.join(' · ');
}

/** When an anchor without a by-when time counts as late: the start of the evening. */
export const ANCHOR_DEFAULT_DEADLINE = `${String(EVENING_HOUR).padStart(2, '0')}:00`;

/** The anchor's deadline 'HH:MM' (its by-when, else 18:00). */
export function anchorDeadline(anchor: Pick<NonNullable<DayEntry['anchor']>, 'byWhen'>): string {
  return anchor.byWhen && isTime(anchor.byWhen) ? anchor.byWhen : ANCHOR_DEFAULT_DEADLINE;
}

/** Today's anchor is set, not done, and its deadline has passed (Bangkok time). Only for today's entry. */
export function anchorStillOpen(day: DayEntry, today: ISODate, now: Date): boolean {
  if (day.date !== today || anchorStatus(day) !== 'set' || !day.anchor) return false;
  // 00:00–03:59 he is still closing yesterday; the new day's anchor isn't late yet.
  if (inShutdownGrace(now)) return false;
  return isoToBangkokInput(now).time >= anchorDeadline(day.anchor);
}

/** Ms until today's open anchor reaches its deadline (null when done, empty, or already past). */
export function msUntilAnchorDeadline(day: DayEntry, today: ISODate, now: Date): number | null {
  if (day.date !== today || anchorStatus(day) !== 'set' || !day.anchor || inShutdownGrace(now)) return null;
  const [hh, mm] = anchorDeadline(day.anchor).split(':').map(Number);
  const { time } = isoToBangkokInput(now);
  const [nh, nm] = time.split(':').map(Number);
  const mins = hh * 60 + mm - (nh * 60 + nm);
  if (mins <= 0) return null;
  return mins * 60_000 - (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds());
}

/** True once tomorrow carries the same anchor (after "Move it to tomorrow"). */
export function anchorMovedToTomorrow(state: AnchorState, date: ISODate): boolean {
  const a = state.days[date]?.anchor;
  const t = state.days[addDays(date, 1)]?.anchor;
  return Boolean(a && t && a.text.trim() && t.text.trim() === a.text.trim());
}

/** Tomorrow's anchor text when it would be replaced by a different one (ask first), else null. */
export function tomorrowAnchorConflict(state: AnchorState, date: ISODate): string | null {
  const a = state.days[date]?.anchor;
  const t = state.days[addDays(date, 1)]?.anchor;
  if (!a || !t || !t.text.trim()) return null;
  return t.text.trim() === a.text.trim() ? null : t.text.trim();
}

/**
 * Copy `date`'s anchor (text, number, by-when, bet) onto the next day, not done. Today's own record stays
 * as it was (set, not done), so the week's numbers stay honest. Mutates; use inside store.update.
 */
export function moveAnchorToTomorrow(draft: AnchorState, date: ISODate): boolean {
  const a = draft.days[date]?.anchor;
  if (!a || !a.text.trim()) return false;
  const next = getOrCreateDay(draft, addDays(date, 1));
  next.anchor = { ...a, text: a.text.trim(), done: false };
  return true;
}

/** Note on the timer started by "Do 15 min of it" (kept short for the timer chip and the log). */
export function anchorTimerNote(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  const max = 80;
  return `Anchor: ${t.length > max ? `${t.slice(0, max - 1)}…` : t}`;
}

/** The lesson written in last night's shutdown (yesterday's entry), if any. */
export function lastNightLesson(state: AnchorState, today: ISODate): string | null {
  const lesson = state.days[addDays(today, -1)]?.shutdown?.lesson?.trim();
  return lesson || null;
}

/**
 * Last week's review "next week's anchor", offered (never saved by itself) while today's anchor is empty and
 * no anchor has been set earlier this week: so on Monday, or the first day of the week he opens Anchor.
 */
export function weekAnchorSuggestion(state: AnchorState, today: ISODate): string | null {
  if (!isISODate(today) || state.days[today]?.anchor?.text.trim()) return null;
  for (let d = weekStart(today); d < today; d = addDays(d, 1)) {
    if (state.days[d]?.anchor?.text.trim()) return null;
  }
  const prev = state.reviews.find((r) => r.weekKey === addWeeks(weekKey(today), -1));
  return prev?.nextAnchor.trim() || null;
}

// ---------------------------------------------------------------------------
// Actions (max 3)
// ---------------------------------------------------------------------------

export type ActionItem = DayEntry['actions'][number];

export function actionsFull(actions: readonly unknown[]): boolean {
  return actions.length >= MAX_ACTIONS;
}

export type AddActionResult = { ok: true; text: string } | { ok: false; reason: 'empty' | 'limit' };

/** Validate a new action. A 4th action is blocked. */
export function checkNewAction(actions: readonly unknown[], raw: string): AddActionResult {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (actionsFull(actions)) return { ok: false, reason: 'limit' };
  return { ok: true, text };
}

export function actionsLeft(actions: readonly unknown[]): number {
  return Math.max(0, MAX_ACTIONS - actions.length);
}

/** Toast when the last action marked "Toward the anchor" is ticked while the anchor is still open. */
export const ANCHOR_LAST_STEP_COPY = 'That was the anchor’s last step. Mark the anchor done?';

/** Actions marked "Toward the anchor": how many, and how many are done. */
export function anchorSteps(day: Pick<DayEntry, 'actions'>): { done: number; total: number } {
  const linked = day.actions.filter((a) => a.forAnchor === true);
  return { done: linked.filter((a) => a.done).length, total: linked.length };
}

/** "Steps: 1 of 2 done" on the anchor card (null when no action is tied to the anchor). */
export function anchorStepsText(day: Pick<DayEntry, 'actions'>): string | null {
  const s = anchorSteps(day);
  return s.total ? `Steps: ${s.done} of ${s.total} done` : null;
}

/**
 * True when ticking action `id` (not done yet) finishes the last open step toward an anchor that is still
 * open, so Today can offer "Mark done". Call it on the day as it is before the tick.
 */
export function finishesAnchorSteps(day: DayEntry, id: ID): boolean {
  if (anchorStatus(day) !== 'set') return false;
  const a = day.actions.find((x) => x.id === id);
  if (!a || a.forAnchor !== true || a.done) return false;
  return day.actions.every((x) => x.forAnchor !== true || x.done || x.id === id);
}

/** Actions that can be swapped out for a new one: the ones not done yet. */
export function swapChoices(actions: readonly ActionItem[]): ActionItem[] {
  return actions.filter((a) => !a.done);
}

/**
 * Replace action `outId` with `item` at the same place. Mutates `day`. Returns the removed action and its
 * index, or null when `outId` is no longer there.
 */
export function swapAction(day: DayEntry, outId: ID, item: ActionItem): { removed: ActionItem; index: number } | null {
  const index = day.actions.findIndex((a) => a.id === outId);
  if (index < 0) return null;
  const [removed] = day.actions.splice(index, 1, item);
  return { removed, index };
}

const norm = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();

export interface CarryOver { from: ISODate; items: ActionItem[] }

/**
 * Unfinished actions from the last day before today that had any actions (looking back up to a week),
 * minus the ones already on today's list. Null when there is nothing to carry.
 */
export function carryOverCandidates(state: AnchorState, today: ISODate, lookbackDays = 7): CarryOver | null {
  if (!isISODate(today)) return null;
  const onToday = new Set((state.days[today]?.actions ?? []).map((a) => norm(a.text)));
  for (let i = 1; i <= lookbackDays; i++) {
    const date = addDays(today, -i);
    const day = state.days[date];
    if (!day || !day.actions.length) continue;
    const items = day.actions.filter((a) => !a.done && a.text.trim() && !onToday.has(norm(a.text)));
    return items.length ? { from: date, items } : null;
  }
  return null;
}

/** Show the carry-over prompt: something to carry, not in the evening, and not answered for that day. */
export function showCarryOver(c: CarryOver | null, phase: DayPhase, dismissedFrom: string | null): boolean {
  return Boolean(c && c.items.length && phase !== 'evening' && dismissedFrom !== c.from);
}

/**
 * Add a copy of an unfinished action to `today` (not done, new id). Mutates. 'full' when today has three,
 * 'dupe' when the same text is already there. `forAnchor` keeps the "Toward the anchor" mark.
 */
export function carryAction(
  draft: AnchorState, today: ISODate, text: string, id: ID, forAnchor = false,
): 'ok' | 'full' | 'dupe' | 'empty' {
  const t = text.trim();
  if (!t) return 'empty';
  const day = getOrCreateDay(draft, today);
  if (day.actions.some((a) => norm(a.text) === norm(t))) return 'dupe';
  if (actionsFull(day.actions)) return 'full';
  day.actions.push(forAnchor ? { id, text: t, done: false, forAnchor: true } : { id, text: t, done: false });
  return 'ok';
}

/**
 * A carried step keeps "Toward the anchor" only when its anchor came along too: today's anchor is still open
 * and has the same text as the anchor of the day the step came from.
 */
export function carriesAnchorStep(state: AnchorState, from: ISODate, today: ISODate, item: ActionItem): boolean {
  if (item.forAnchor !== true) return false;
  const src = state.days[from]?.anchor;
  const dst = state.days[today];
  if (!src || !dst?.anchor || anchorStatus(dst) !== 'set') return false;
  return norm(src.text) === norm(dst.anchor.text);
}

// ---------------------------------------------------------------------------
// Evening shutdown
// ---------------------------------------------------------------------------

export function isEvening(now: Date): boolean {
  return bangkokHour(now) >= EVENING_HOUR;
}

/** 00:00–03:59 Bangkok: still "tonight" for a late shutdown. */
export function inShutdownGrace(now: Date): boolean {
  return bangkokHour(now) < SHUTDOWN_GRACE_HOUR;
}

/**
 * The day a shutdown closes. Before 04:00 Bangkok that is yesterday, so a 00:30 shutdown closes the
 * evening he is still in, and its "tomorrow" anchor lands on the calendar day that just started.
 */
export function shutdownDay(now: Date, today: ISODate): ISODate {
  return inShutdownGrace(now) ? addDays(today, -1) : today;
}

/**
 * Show the shutdown form/summary after 18:00 Bangkok (and on until 04:00), when opened early,
 * or once it has been saved. `day` is the shutdown day (see shutdownDay).
 */
export function showShutdown(opts: { now: Date; openedEarly: boolean; day: DayEntry }): boolean {
  return isEvening(opts.now) || inShutdownGrace(opts.now) || opts.openedEarly || hasShutdown(opts.day);
}

export function hasShutdown(day: DayEntry): boolean {
  const s = day.shutdown;
  return Boolean(s && (s.win || s.lesson || s.tomorrow));
}

export interface ShutdownInput {
  win: string; lesson: string; tomorrow: string;
  /** Tomorrow's anchor number. undefined = leave tomorrow's as it is; '' = none. */
  metric?: string;
  /** Tomorrow's anchor bet. undefined = leave as it is; '' or 'none' = no bet. */
  betId?: string;
}

/**
 * Today's anchor text when it is still open at the first shutdown of the day (none saved yet) and tomorrow has
 * no anchor yet: the shutdown offers it as tomorrow's anchor, so a slipped anchor is named, not dropped.
 */
export function openAnchorForTomorrow(state: AnchorState, today: ISODate): string | null {
  const day = state.days[today];
  if (!day || anchorStatus(day) !== 'set' || hasShutdown(day)) return null;
  if (state.days[addDays(today, 1)]?.anchor?.text.trim()) return null;
  return day.anchor?.text.trim() || null;
}

/**
 * Prefill for the shutdown form: saved values, tomorrow's anchor if one already exists (else today's anchor
 * when it is still open), and its number and bet (else today's anchor's), so tomorrow's anchor keeps them
 * unless he changes them.
 */
export function shutdownDefaults(state: AnchorState, today: ISODate): Required<ShutdownInput> {
  const s = state.days[today]?.shutdown ?? {};
  const t = state.days[addDays(today, 1)]?.anchor;
  const a = state.days[today]?.anchor;
  const src = t && t.text.trim() ? t : a;
  return {
    win: s.win ?? '',
    lesson: s.lesson ?? '',
    tomorrow: t?.text || s.tomorrow || openAnchorForTomorrow(state, today) || '',
    metric: src?.metric ?? '',
    betId: src?.betId ?? '',
  };
}

function getOrCreateDay(state: AnchorState, date: ISODate): DayEntry {
  if (!state.days[date]) state.days[date] = { date, actions: [] };
  return state.days[date];
}

/**
 * Save the shutdown into today's entry and write "tomorrow" into tomorrow's anchor (text, plus number and
 * bet when given). Mutates `draft` (use inside store.update). Keeps tomorrow's other anchor fields.
 * Clearing "tomorrow" removes tomorrow's anchor only if it is untouched since the last shutdown.
 */
export function applyShutdown(draft: AnchorState, today: ISODate, input: ShutdownInput): void {
  const day = getOrCreateDay(draft, today);
  const prevTomorrow = day.shutdown?.tomorrow;
  const win = input.win.trim(), lesson = input.lesson.trim(), tomorrow = input.tomorrow.trim();
  const shutdown: NonNullable<DayEntry['shutdown']> = {};
  if (win) shutdown.win = win;
  if (lesson) shutdown.lesson = lesson;
  if (tomorrow) shutdown.tomorrow = tomorrow;
  if (Object.keys(shutdown).length) day.shutdown = shutdown;
  else delete day.shutdown;

  const tDate = addDays(today, 1);
  if (tomorrow) {
    const next = getOrCreateDay(draft, tDate);
    const anchor: NonNullable<DayEntry['anchor']> = next.anchor ?? { text: tomorrow, done: false };
    anchor.text = tomorrow;
    if (input.metric !== undefined) {
      const m = input.metric.trim();
      if (m) anchor.metric = m;
      else delete anchor.metric;
    }
    if (input.betId !== undefined) {
      if (input.betId && input.betId !== 'none') anchor.betId = input.betId;
      else delete anchor.betId;
    }
    next.anchor = anchor;
    return;
  }
  const next = draft.days[tDate];
  const a = next?.anchor;
  if (next && a && prevTomorrow && a.text === prevTomorrow && !a.done && !a.byWhen) {
    delete next.anchor;
  }
}

// ---------------------------------------------------------------------------
// This week strip
// ---------------------------------------------------------------------------

export interface WeekStrip {
  weekKey: string;
  buildSell: BuildSell;
  target: number;
  splitText: string;
  talks: number;
  talkTarget: number;
  escapes: { go: number; park: number; total: number };
  escapeText: string;
  nextReview: { betId: ID; name: string; days: number; text: string } | null;
}

export function reviewDueText(days: number): string {
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export function splitText(bs: BuildSell): string {
  // Other time (escape, ops…) may be logged: this line is only about build and sell.
  if (bs.total <= 0) return 'No build or sell time yet';
  return `Build ${formatMinutes(bs.build * 60)} · Sell ${formatMinutes(bs.sell * 60)}`;
}

export function escapeText(e: { go: number; park: number; total: number }): string {
  if (e.total === 0) return 'None yet';
  return `${e.go} go · ${e.park} parked`;
}

export function weekStrip(state: AnchorState, today: ISODate, now: Date): WeekStrip {
  const wk = weekKey(today);
  const hours = hoursByCategory(state.timeLog, wk, { activeTimer: state.activeTimer, now });
  const bs = buildSellRatio(hours);
  const escapes = escapesThisWeek(state.escapes, wk);
  const due = nextBetReviewDue(state.bets, today);
  return {
    weekKey: wk,
    buildSell: bs,
    target: state.profile.buildSellTarget,
    splitText: splitText(bs),
    talks: talksThisWeek(state.talks, wk),
    talkTarget: state.profile.weeklyTalkTarget,
    escapes,
    escapeText: escapeText(escapes),
    nextReview: due ? { betId: due.bet.id, name: due.bet.name, days: due.days, text: reviewDueText(due.days) } : null,
  };
}

// ---------------------------------------------------------------------------
// Heavy nudge
// ---------------------------------------------------------------------------

/** The open Heavy item with the nearest deadline (undated items last, open before waiting). */
export function heavyNudge(heavy: HeavyItem[], today: ISODate): { item: HeavyItem; due: string | null; overdue: boolean } | null {
  const open = heavy.filter((x) => x.status !== 'done');
  if (!open.length) return null;
  const rank = (x: HeavyItem) => (x.status === 'open' ? 0 : 1);
  const sorted = open
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ad = a.item.deadline && isISODate(a.item.deadline) ? a.item.deadline : null;
      const bd = b.item.deadline && isISODate(b.item.deadline) ? b.item.deadline : null;
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      return rank(a.item) - rank(b.item) || a.i - b.i;
    });
  const item = sorted[0].item;
  const dl = item.deadline && isISODate(item.deadline) ? item.deadline : null;
  if (!dl) return { item, due: null, overdue: false };
  const overdue = daysBetween(today, dl) < 0;
  return { item, due: overdue ? `was due ${relativeDays(dl, today)}` : `due ${relativeDays(dl, today)}`, overdue };
}

/** An open item with no next step yet: the nudge opens its edit on the next step (Heavy `focus=next`). */
export function heavyNudgeAsksStep(item: HeavyItem): boolean {
  return item.status === 'open' && !item.nextAction.trim();
}

/** "Next: call the bank · due tomorrow"; an item with no step yet asks for one. */
export function heavyNudgeMeta(n: { item: HeavyItem; due: string | null }): string {
  const parts: string[] = [];
  const step = n.item.nextAction.trim();
  if (step) parts.push(`Next: ${step}`);
  else if (heavyNudgeAsksStep(n.item)) parts.push(NO_NEXT_STEP_COPY);
  if (n.due) parts.push(n.due);
  if (n.item.status === 'waiting') parts.push('waiting');
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Screen-level
// ---------------------------------------------------------------------------

/**
 * One primary button per screen. In the evening an open shutdown form wins; otherwise the anchor form while
 * it is being set or edited, else the shutdown form when it shows.
 */
export function primaryAction(opts: { anchorEditing: boolean; shutdownEditing: boolean; phase?: DayPhase }): 'anchor' | 'shutdown' | null {
  if (opts.phase === 'evening' && opts.shutdownEditing) return 'shutdown';
  if (opts.anchorEditing) return 'anchor';
  if (opts.shutdownEditing) return 'shutdown';
  return null;
}
