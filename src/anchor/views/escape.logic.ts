// Pure helpers for the Escape check view. No window/document access (Node-testable).

import type { Bet, DayEntry, EscapeCheck, ID, ISODate, ParkedIdea, TimeCategory, Worry } from '../core/types.ts';
import { addDays, daysBetween, formatDate, isDateTime, isISODate, relativeDays } from '../core/dates.ts';
import { escapeDateReason, escapeParkReasons, escapeReasons, escapeVerdict } from '../core/metrics.ts';
import type { EscapeParkReason, EscapeReason, EscapeReasonField } from '../core/metrics.ts';
import { DEFAULT_TIMEBOX_MIN, ESCAPE_MAX_DAYS } from '../core/constants.ts';

export type EscapeStepKey = 'want' | 'numberMoves' | 'byWhen' | 'howKnow' | 'betId' | 'avoiding';

export interface EscapeStep {
  key: EscapeStepKey;
  /** The question, shown big. Also the field's accessible label. */
  question: string;
  /** Short label for the answers summary. */
  short: string;
}

/** One question per step, in spec order. */
export const ESCAPE_STEPS: readonly EscapeStep[] = [
  { key: 'want', question: 'What do you want to build or start?', short: 'Idea' },
  { key: 'numberMoves', question: 'Which number does it move?', short: 'Number' },
  { key: 'byWhen', question: 'By when will you see it move?', short: 'By when' },
  { key: 'howKnow', question: 'How will you know?', short: 'How you’ll know' },
  { key: 'betId', question: 'Which active bet does it serve?', short: 'Bet' },
  { key: 'avoiding', question: 'Is there something you’re avoiding right now?', short: 'Avoiding' },
];

export const STEP_COUNT = ESCAPE_STEPS.length;
/** Step index of the result screen (after the last question). */
export const RESULT_STEP = STEP_COUNT;

export const MAX_LEN: Record<EscapeStepKey, number> = {
  want: 200, numberMoves: 160, byWhen: 10, howKnow: 300, betId: 64, avoiding: 500,
};

/** "Do that first": minutes on the avoided thing before deciding. */
export const AVOID_FIRST_MIN = 10;

/** Form state for one check (ctx.draft in memory, mirrored to localStorage so a reload resumes it). */
export interface EscapeDraft {
  step: number;
  want: string;
  numberMoves: string;
  byWhen: string;
  howKnow: string;
  /** '' = not chosen yet, 'none' = no bet, otherwise a bet id. */
  betId: string;
  avoiding: string;
  error: string | null;
  /** Trimmed `avoiding` text already saved as a Worry (prevents duplicates). */
  worryText: string;
  /** Move focus to the current step's control after the next render. */
  focusPending: boolean;
  /** Came from the result screen to change one answer: Next returns to the result. */
  editing: boolean;
  /** The parked idea this check re-opened (Bets → Parking lot → Re-open). */
  fromIdeaId?: string;
  /** When "Do that first (10 min)" was started for the avoided thing. */
  avoidFirstAt?: string;
  /** Restored from this device after a reload or a trip to another screen. */
  resumed?: boolean;
}

export function emptyEscapeDraft(): EscapeDraft {
  return {
    step: 0, want: '', numberMoves: '', byWhen: '', howKnow: '', betId: '', avoiding: '',
    error: null, worryText: '', focusPending: false, editing: false,
  };
}

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(RESULT_STEP, Math.max(0, Math.trunc(step)));
}

/** True once anything has been typed or picked. */
export function draftHasContent(d: EscapeDraft): boolean {
  return Boolean(d.want.trim() || d.numberMoves.trim() || d.byWhen || d.howKnow.trim() || d.betId || d.avoiding.trim());
}

export const STEP_COPY = {
  needWant: 'Name it in a few words first.',
  badDate: 'Pick a date, or leave it empty.',
  pastDate: 'That date has already passed. Pick one ahead, or leave it empty.',
} as const;

/** Validation for leaving a step. Only the idea itself is required; a date may be empty but not past. */
export function stepError(d: EscapeDraft, step: number, today: ISODate): string | null {
  if (step === 0 && !d.want.trim()) return STEP_COPY.needWant;
  if (step === 2 && d.byWhen) {
    if (!isISODate(d.byWhen)) return STEP_COPY.badDate;
    if (escapeDateReason(d.byWhen, today) === 'past-date') return STEP_COPY.pastDate;
  }
  return null;
}

/** Where Next goes from `step`: the following question, or straight back to the result when editing. */
export function nextStep(d: EscapeDraft): number {
  return d.editing ? RESULT_STEP : clampStep(d.step + 1);
}

export function progressText(step: number): string {
  const s = clampStep(step);
  return s >= RESULT_STEP ? 'All answered' : `Step ${s + 1} of ${STEP_COUNT}`;
}

// ---------------------------------------------------------------------------
// Keeping the draft on this device (iOS often restarts a home-screen app)
// ---------------------------------------------------------------------------

/** Device-local key (prefix 'anchor:' so eraseAll removes it). */
export const ESCAPE_DRAFT_KEY = 'anchor:escape:draft';
/** A saved check older than this starts fresh instead of resuming. */
export const ESCAPE_DRAFT_MAX_AGE_MS = 12 * 3_600_000;

interface StoredDraft {
  v: 1; savedAt: string; step: number; want: string; numberMoves: string; byWhen: string; howKnow: string;
  betId: string; avoiding: string; worryText: string; editing: boolean; fromIdeaId?: string; avoidFirstAt?: string;
}

export function serializeEscapeDraft(d: EscapeDraft, now: Date): string {
  const out: StoredDraft = {
    v: 1, savedAt: now.toISOString(), step: clampStep(d.step), want: d.want, numberMoves: d.numberMoves,
    byWhen: d.byWhen, howKnow: d.howKnow, betId: d.betId, avoiding: d.avoiding, worryText: d.worryText,
    editing: d.editing,
  };
  if (d.fromIdeaId) out.fromIdeaId = d.fromIdeaId;
  if (d.avoidFirstAt) out.avoidFirstAt = d.avoidFirstAt;
  return JSON.stringify(out);
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Read a saved check back. Null when missing, unreadable, older than 12 hours (or from the future), or
 * empty. Never throws; every field is type-checked and length-capped.
 */
export function parseEscapeDraft(raw: string | null, now: Date, maxAgeMs = ESCAPE_DRAFT_MAX_AGE_MS): EscapeDraft | null {
  if (!raw) return null;
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const s = o as Partial<Record<keyof StoredDraft, unknown>>;
  if (s.v !== 1 || !isDateTime(s.savedAt)) return null;
  const age = now.getTime() - Date.parse(s.savedAt);
  if (age > maxAgeMs || age < -5 * 60_000) return null;
  const d: EscapeDraft = {
    ...emptyEscapeDraft(),
    step: clampStep(typeof s.step === 'number' ? s.step : 0),
    want: str(s.want, MAX_LEN.want),
    numberMoves: str(s.numberMoves, MAX_LEN.numberMoves),
    byWhen: str(s.byWhen, MAX_LEN.byWhen),
    howKnow: str(s.howKnow, MAX_LEN.howKnow),
    betId: str(s.betId, MAX_LEN.betId),
    avoiding: str(s.avoiding, MAX_LEN.avoiding),
    worryText: str(s.worryText, MAX_LEN.avoiding),
    editing: s.editing === true,
  };
  const idea = str(s.fromIdeaId, 64);
  if (idea) d.fromIdeaId = idea;
  if (isDateTime(s.avoidFirstAt)) d.avoidFirstAt = s.avoidFirstAt;
  if (!draftHasContent(d) && d.step === 0) return null;
  // The idea is required before step 2: never resume past an empty first answer.
  if (!d.want.trim()) d.step = 0;
  if (d.step < RESULT_STEP) d.editing = false;
  return d;
}

// ---------------------------------------------------------------------------
// By when
// ---------------------------------------------------------------------------

export type HintTone = 'muted' | 'warn';

/** Live hint under the date input. No date is allowed, and leans toward parking. */
export function byWhenHint(byWhen: string, today: ISODate): { text: string; tone: HintTone } {
  if (!byWhen) return { text: 'No date leans toward parking. When would you see it move?', tone: 'muted' };
  if (!isISODate(byWhen)) return { text: STEP_COPY.badDate, tone: 'warn' };
  const n = daysBetween(today, byWhen);
  const rel = relativeDays(byWhen, today);
  if (n < 0) return { text: `That’s ${rel}. Pick a date ahead.`, tone: 'warn' };
  if (n > ESCAPE_MAX_DAYS) return { text: `${capitalize(rel)} — more than ${ESCAPE_MAX_DAYS} days out. That leans toward parking.`, tone: 'warn' };
  return { text: `${capitalize(rel)}.`, tone: 'muted' };
}

/** Quick picks for the date step. */
export function quickDates(today: ISODate): { value: ISODate; label: string }[] {
  return [
    { value: addDays(today, 7), label: '1 week' },
    { value: addDays(today, 14), label: '2 weeks' },
    { value: addDays(today, ESCAPE_MAX_DAYS), label: `${ESCAPE_MAX_DAYS} days` },
  ];
}

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

export const NO_BET = 'none';

/** Active bets first (in list order), then "None". */
export function betChoices(bets: readonly Bet[]): { value: string; label: string }[] {
  return [
    ...bets.filter((b) => b.status === 'active').map((b) => ({ value: b.id, label: b.name || 'Untitled bet' })),
    { value: NO_BET, label: 'None' },
  ];
}

export function betLabel(betId: string, bets: readonly Bet[]): string {
  if (!betId) return 'Not picked';
  if (betId === NO_BET) return 'None';
  const b = bets.find((x) => x.id === betId);
  if (!b) return 'A bet that no longer exists';
  return b.status === 'active' ? b.name || 'Untitled bet' : `${b.name || 'Untitled bet'} (not active)`;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

function escapeInput(d: EscapeDraft) {
  return {
    numberMoves: d.numberMoves,
    byWhen: isISODate(d.byWhen) ? d.byWhen : undefined,
    betId: d.betId,
  };
}

export function draftVerdict(d: EscapeDraft, bets: Bet[], today: ISODate): 'go' | 'park' {
  return escapeVerdict(escapeInput(d), bets, today);
}

export function draftParkReasons(d: EscapeDraft, bets: Bet[], today: ISODate): EscapeParkReason[] {
  return escapeParkReasons(escapeInput(d), bets, today);
}

/** Park reasons with the answer each one points at (flags the row / step). */
export function draftReasons(d: EscapeDraft, bets: Bet[], today: ISODate): EscapeReason[] {
  return escapeReasons(escapeInput(d), bets, today);
}

export interface Recommendation {
  verdict: 'go' | 'park';
  title: string;
  body: string;
  reasons: string[];
  primaryLabel: string;
  overrideLabel: string;
}

/**
 * The recommendation. Go only happens with a number, an active bet and a date within 30 days, so the
 * Go copy names them (it never says "soon" without a date).
 */
export function recommendation(d: EscapeDraft, bets: Bet[], today: ISODate, timeboxMin = DEFAULT_TIMEBOX_MIN): Recommendation {
  const reasons = draftReasons(d, bets, today);
  if (reasons.length === 0) {
    const bet = bets.find((b) => b.id === d.betId);
    return {
      verdict: 'go',
      title: 'Go, time-boxed',
      body: `It’s tied to ${bet?.name || 'an active bet'}, and you’d see ${d.numberMoves.trim()} move by ${formatDate(d.byWhen)}. `
        + `Give it ${timeboxMin} min, then write what moved.`,
      reasons: [],
      primaryLabel: `Go for ${timeboxMin} min`,
      overrideLabel: 'Park it anyway',
    };
  }
  return {
    verdict: 'park',
    title: 'Park it',
    body: 'Not now. It waits in the parking lot, and you can make it a bet later.',
    reasons: reasons.map((r) => r.text),
    primaryLabel: 'Park it',
    overrideLabel: `Go anyway (${timeboxMin} min)`,
  };
}

export type ResultActionKind = 'avoid-first' | 'go' | 'park';

/**
 * Result buttons in order; the first is the primary one. A named avoidance (not tackled yet) comes first:
 * "Do that first (10 min)". Then the recommendation, then the other way (it's always his call).
 */
export function resultActions(rec: Recommendation, d: EscapeDraft): { kind: ResultActionKind; label: string }[] {
  const other: 'go' | 'park' = rec.verdict === 'go' ? 'park' : 'go';
  const list: { kind: ResultActionKind; label: string }[] = [
    { kind: rec.verdict, label: rec.primaryLabel },
    { kind: other, label: rec.overrideLabel },
  ];
  if (d.avoiding.trim() && !d.avoidFirstAt) list.unshift({ kind: 'avoid-first', label: `Do that first (${AVOID_FIRST_MIN} min)` });
  return list;
}

/** "You said you're avoiding …" copy for the result screen (null when nothing was named). */
export function avoidingCopy(d: EscapeDraft): { title: string; body: string } | null {
  const t = d.avoiding.trim();
  if (!t) return null;
  if (d.avoidFirstAt) return { title: 'You gave it ten minutes', body: 'That counts. Now it’s your call on the idea.' };
  return {
    title: 'Do that first?',
    body: `You said you’re avoiding: ${clip(t, 140)}. Do that first (${AVOID_FIRST_MIN} min), then decide on the idea. Your answers wait here.`,
  };
}

/** Today's anchor when it is set and not done yet: the result asks "Anchor first?". */
export function anchorFirst(day: DayEntry | undefined): string | null {
  const a = day?.anchor;
  if (!a || a.done || !a.text.trim()) return null;
  return a.text.trim();
}

/**
 * The timer a Go starts. A recommended Go is time-boxed build; going ahead after a Park counts as
 * escape time (category 'escape'). Both are tagged source 'escape'.
 */
export function goTimerPlan(
  recommended: 'go' | 'park', want: string, timeboxMin = DEFAULT_TIMEBOX_MIN,
): { category: TimeCategory; opts: { note: string; timeboxMin: number; source: 'escape'; overridden: boolean } } {
  const overridden = recommended === 'park';
  return {
    category: overridden ? 'escape' : 'build',
    opts: { note: goTimerNote(want), timeboxMin, source: 'escape', overridden },
  };
}

/** Toast after Go (the caller adds what was logged for the previous timer). */
export function goToastCopy(overridden: boolean, timeboxMin = DEFAULT_TIMEBOX_MIN): string {
  return overridden
    ? `Your call. ${timeboxMin} minutes on the clock, counted as escape time.`
    : `Go. ${timeboxMin} minutes on the clock, then write what moved.`;
}

// ---------------------------------------------------------------------------
// Answers summary
// ---------------------------------------------------------------------------

export interface SummaryRow { step: number; label: string; value: string; flagged: boolean }

/** One row per answer. Number, by-when and bet are flagged when they are a reason to park. */
export function summaryRows(d: EscapeDraft, bets: Bet[], today: ISODate): SummaryRow[] {
  const by = isISODate(d.byWhen) ? d.byWhen : '';
  const flagged = new Set<EscapeReasonField>(draftReasons(d, bets, today).map((r) => r.field));
  const values: Record<EscapeStepKey, { value: string; flagged: boolean }> = {
    want: { value: d.want.trim() || 'Empty', flagged: !d.want.trim() },
    numberMoves: { value: d.numberMoves.trim() || 'No number yet', flagged: flagged.has('numberMoves') },
    byWhen: { value: by ? `${formatDate(by)} (${relativeDays(by, today)})` : 'No date', flagged: flagged.has('byWhen') },
    howKnow: { value: d.howKnow.trim() || 'Empty', flagged: false },
    betId: { value: betLabel(d.betId, bets), flagged: flagged.has('betId') },
    avoiding: { value: d.avoiding.trim() || 'Nothing named', flagged: false },
  };
  return ESCAPE_STEPS.map((s, i) => ({ step: i, label: s.short, ...values[s.key] }));
}

// ---------------------------------------------------------------------------
// Records saved on decision
// ---------------------------------------------------------------------------

export function buildEscapeCheck(
  d: EscapeDraft,
  o: { id: ID; at: string; today: ISODate; bets: Bet[]; verdict: 'go' | 'park'; timeboxMin?: number },
): EscapeCheck {
  const recommended = draftVerdict(d, o.bets, o.today);
  const check: EscapeCheck = {
    id: o.id,
    at: o.at,
    want: d.want.trim(),
    numberMoves: d.numberMoves.trim(),
    howKnow: d.howKnow.trim(),
    recommended,
    verdict: o.verdict,
  };
  if (isISODate(d.byWhen)) check.byWhen = d.byWhen;
  if (d.betId && d.betId !== NO_BET) check.betId = d.betId;
  const avoiding = d.avoiding.trim();
  if (avoiding) check.avoiding = avoiding;
  if (o.verdict === 'go') check.timeboxMin = o.timeboxMin ?? DEFAULT_TIMEBOX_MIN;
  return check;
}

export function buildParkedIdea(check: EscapeCheck, id: ID): ParkedIdea {
  return { id, text: check.want, at: check.at, fromEscapeId: check.id };
}

export function buildWorry(text: string, id: ID, at: string): Worry {
  return { id, at, text: text.trim() };
}

/** Whether to offer "Put it in Heavy" (something named and not saved yet). */
export function canOfferWorry(d: EscapeDraft): boolean {
  const t = d.avoiding.trim();
  return Boolean(t) && t !== d.worryText;
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Note on the Go timer, so the session shows where it came from (kept short for the chip and the log). */
export function goTimerNote(want: string): string {
  return `Escape check: ${clip(want, 80)}`;
}

/** Note on the "Do that first" timer. */
export function avoidTimerNote(avoiding: string): string {
  return `First: ${clip(avoiding, 80)}`;
}

export function parkingCountCopy(count: number): string {
  if (count <= 1) return 'Parked. It’s the only idea in the parking lot.';
  return `Parked. ${count} ideas in the parking lot.`;
}

export function weekLine(go: number, park: number, parkingCount: number): string {
  const parts: string[] = [];
  if (go + park > 0) parts.push(`This week: ${go} go · ${park} parked.`);
  if (parkingCount > 0) parts.push(`${parkingCount} idea${parkingCount === 1 ? '' : 's'} waiting in the parking lot.`);
  return parts.join(' ');
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
