// Pure helpers for the weekly review. No window/document access (runs under node --test).

import type { AnchorState, Bet, DayEntry, ID, ISODate, Verdict, WeeklyReview } from '../core/types.ts';
import {
  addDays, addWeeks, formatHours, formatShortDate, isISODate, isoWeekday, weekDates, weekKey, weekRange,
} from '../core/dates.ts';
import { cashBand, formatPercent, formatThb, weekSnapshot } from '../core/metrics.ts';
import type { CashBand } from '../core/metrics.ts';
import { REVIEW_PUSH_DAYS, TIME_CATEGORIES } from '../core/constants.ts';
import { PARK_LOOK_AGAIN_DAYS } from './bets.logic.ts';

export type ReviewWeekChoice = 'this' | 'last';

export interface DecisionDraft { verdict: Verdict | ''; why: string }

export interface ReviewForm {
  wins: string;
  lessons: string;
  nextAnchor: string;
  /** Keyed by bet id. Only bets that still need a decision in this review. */
  decisions: Record<ID, DecisionDraft>;
}

export type ReviewErrors = Record<string, string>;

export const REVIEW_COPY = {
  pickVerdict: 'Pick one: continue, change, park or kill.',
  needWhy: 'Add a one-line why.',
  empty: 'Write one line first. Small is fine.',
} as const;

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** This week's and last week's keys for a Bangkok date. */
export function reviewWeeks(today: ISODate): { this: string; last: string } {
  const thisWk = weekKey(today);
  return { this: thisWk, last: addWeeks(thisWk, -1) };
}

/**
 * Which week the review opens on. Early in the week (Mon/Tue) last week is usually the one
 * worth closing, so pick it while it has no saved review. Otherwise this week.
 */
export function defaultReviewWeek(today: ISODate, reviews: readonly Pick<WeeklyReview, 'weekKey'>[]): ReviewWeekChoice {
  const { last } = reviewWeeks(today);
  const early = isoWeekday(today) <= 2;
  return early && !reviews.some((r) => r.weekKey === last) ? 'last' : 'this';
}

/** 'Week 44' from '2026-W44'. */
export function weekNumberLabel(wk: string): string {
  const m = /^\d{4}-W(\d{2})$/.exec(wk);
  return m ? `Week ${Number(m[1])}` : wk;
}

/** '26 Oct – 1 Nov' (adds years when the week is not in refYear). */
export function weekRangeLabel(wk: string, refYear?: number): string {
  try {
    const { start, end } = weekRange(wk);
    return `${formatShortDate(start, refYear)} – ${formatShortDate(end, refYear)}`;
  } catch {
    return wk;
  }
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export function findReview<T extends Pick<WeeklyReview, 'weekKey'>>(reviews: readonly T[], wk: string): T | undefined {
  return reviews.find((r) => r.weekKey === wk);
}

/** Saved reviews newest week first, optionally leaving one week out (the one shown in full). */
export function pastReviews<T extends Pick<WeeklyReview, 'weekKey' | 'createdAt'>>(reviews: readonly T[], excludeWk?: string): T[] {
  return reviews
    .filter((r) => r.weekKey !== excludeWk)
    .slice()
    .sort((a, b) => (a.weekKey === b.weekKey ? (a.createdAt < b.createdAt ? 1 : -1) : a.weekKey < b.weekKey ? 1 : -1));
}

/** Active bets that do not have a decision in this week's review yet (all active bets when there is none). */
export function pendingDecisionBets(bets: readonly Bet[], existing?: Pick<WeeklyReview, 'betDecisions'>): Bet[] {
  const decided = new Set((existing?.betDecisions ?? []).map((d) => d.betId));
  return bets.filter((b) => b.status === 'active' && !decided.has(b.id));
}

/** A bet's review is due on or after its review date (a missing date counts as due). */
export function isReviewDue(bet: Pick<Bet, 'reviewOn'>, today: ISODate): boolean {
  return !isISODate(bet.reviewOn) || bet.reviewOn <= today;
}

/**
 * Pending bets split for the 2-minute review: `due` need a call now; `later` (review not due yet) are
 * optional and shown collapsed.
 */
export function splitPendingBets(
  bets: readonly Bet[], existing: Pick<WeeklyReview, 'betDecisions'> | undefined, today: ISODate,
): { due: Bet[]; later: Bet[] } {
  const pending = pendingDecisionBets(bets, existing);
  return {
    due: pending.filter((b) => isReviewDue(b, today)),
    later: pending.filter((b) => !isReviewDue(b, today)),
  };
}

/** "Why" is optional for continue (nothing changes), required for change, park and kill. */
export function whyRequired(verdict: Verdict | ''): boolean {
  return verdict === 'change' || verdict === 'park' || verdict === 'kill';
}

/** Fresh form state: prefilled from a saved review when editing, with an empty decision per pending bet. */
export function initReviewForm(existing: Pick<WeeklyReview, 'wins' | 'lessons' | 'nextAnchor'> | undefined, pendingBetIds: readonly ID[]): ReviewForm {
  const decisions: Record<ID, DecisionDraft> = {};
  for (const id of pendingBetIds) decisions[id] = { verdict: '', why: '' };
  return {
    wins: existing?.wins ?? '',
    lessons: existing?.lessons ?? '',
    nextAnchor: existing?.nextAnchor ?? '',
    decisions,
  };
}

/** True when a review form holds anything typed or picked (a cleared-out new review counts as clean again). */
export function reviewFormHasContent(form: ReviewForm): boolean {
  if ([form.wins, form.lessons, form.nextAnchor].some((t) => t.trim() !== '')) return true;
  return Object.values(form.decisions).some((d) => Boolean(d.verdict) || d.why.trim() !== '');
}

/**
 * The review screen is still held on an earlier week's unsaved form (its draft is pinned to the day it
 * was opened): e.g. Week 44's review was started on Sunday and it is Monday now. Say so, and offer Discard.
 */
export function heldOnEarlierWeek(draftDate: ISODate, today: ISODate, dirty: boolean | undefined): boolean {
  return Boolean(dirty) && isISODate(draftDate) && isISODate(today) && weekKey(draftDate) !== weekKey(today);
}

/**
 * Keys: 'verdict:<betId>', 'why:<betId>', 'form'. Empty object = valid.
 * - Bets whose review is due (`dueIds`) need a call; the why is optional for continue.
 * - Other bets (`optionalIds`) can be skipped; once a call is picked, the same why rule applies.
 * - With no call at all, one line of wins, lessons or next week's anchor is enough.
 */
export function validateReviewForm(form: ReviewForm, dueIds: readonly ID[], optionalIds: readonly ID[] = []): ReviewErrors {
  const errors: ReviewErrors = {};
  const blank: DecisionDraft = { verdict: '', why: '' };
  for (const id of dueIds) {
    const d = form.decisions[id] ?? blank;
    if (!d.verdict) errors[`verdict:${id}`] = REVIEW_COPY.pickVerdict;
    else if (whyRequired(d.verdict) && !d.why.trim()) errors[`why:${id}`] = REVIEW_COPY.needWhy;
  }
  let calls = dueIds.length;
  for (const id of optionalIds) {
    const d = form.decisions[id] ?? blank;
    if (!d.verdict) continue;
    calls++;
    if (whyRequired(d.verdict) && !d.why.trim()) errors[`why:${id}`] = REVIEW_COPY.needWhy;
  }
  const hasText = [form.wins, form.lessons, form.nextAnchor].some((t) => t.trim() !== '');
  if (!hasText && calls === 0) errors.form = REVIEW_COPY.empty;
  return errors;
}

/** Order in which error fields appear on screen, for focusing the first one. */
export function firstErrorKey(errors: ReviewErrors, pendingBetIds: readonly ID[]): string | null {
  for (const id of pendingBetIds) {
    if (errors[`verdict:${id}`]) return `verdict:${id}`;
    if (errors[`why:${id}`]) return `why:${id}`;
  }
  return errors.form ? 'form' : null;
}

export interface ApplyReviewArgs {
  weekKey: string;
  form: ReviewForm;
  /** Bets the form asked about (pending at render time). Ones left without a call are skipped. */
  betIds: readonly ID[];
  /** Bangkok today when saving (not when the screen was drawn). */
  today: ISODate;
  now: Date;
  snapshot: Record<string, number | string | null>;
  newId: () => ID;
}

export interface ApplyReviewResult {
  review: WeeklyReview;
  created: boolean;
  /** Decisions actually written to bets (missing bets are skipped). */
  applied: { betId: ID; verdict: Verdict }[];
}

/**
 * Save the review into `state` (mutates; use inside store.update).
 * - One review per week: an existing review for the week is updated in place (same id, createdAt).
 * - Each new bet decision is appended to the bet's decision log. Park/kill change an active bet's status.
 * - Continue/change move the review date only when that review is due (reviewOn ≤ today): then it goes to
 *   today + 14 days. A weekly "continue" never pushes back a decision date set in advance.
 * - Park moves a review date that is due (or missing) to today + 30 days, so a parked bet isn't overdue.
 */
export function applyReview(state: AnchorState, args: ApplyReviewArgs): ApplyReviewResult {
  const { form, today } = args;
  const existing = state.reviews.find((r) => r.weekKey === args.weekKey);
  const betDecisions = existing ? existing.betDecisions.map((d) => ({ ...d })) : [];
  const applied: ApplyReviewResult['applied'] = [];

  for (const betId of args.betIds) {
    const d = form.decisions[betId];
    if (!d || !d.verdict) continue;
    if (betDecisions.some((x) => x.betId === betId)) continue;   // already decided in this review
    const bet = state.bets.find((b) => b.id === betId);
    if (!bet) continue;
    const why = d.why.trim();
    bet.decisions.push({ date: today, verdict: d.verdict, why });
    if (bet.status === 'active') {
      const due = !isISODate(bet.reviewOn) || bet.reviewOn <= today;
      if (d.verdict === 'park') {
        bet.status = 'parked';
        if (due) bet.reviewOn = addDays(today, PARK_LOOK_AGAIN_DAYS);
      } else if (d.verdict === 'kill') {
        bet.status = 'killed';
      } else if (due) {
        bet.reviewOn = addDays(today, REVIEW_PUSH_DAYS);
      }
    }
    betDecisions.push({ betId, verdict: d.verdict, why });
    applied.push({ betId, verdict: d.verdict });
  }

  const review: WeeklyReview = {
    id: existing?.id ?? args.newId(),
    weekKey: args.weekKey,
    createdAt: existing?.createdAt ?? args.now.toISOString(),
    wins: form.wins.trim(),
    lessons: form.lessons.trim(),
    betDecisions,
    nextAnchor: form.nextAnchor.trim(),
    snapshot: { ...args.snapshot },
  };
  if (existing) state.reviews[state.reviews.indexOf(existing)] = review;
  else state.reviews.push(review);
  return { review, created: !existing, applied };
}

// ---------------------------------------------------------------------------
// The week's evenings and check-ins
// ---------------------------------------------------------------------------

export interface DayLine { date: ISODate; win: string; lesson: string }

/** Each day of the week that has a shutdown win or lesson, Monday first. */
export function weekJournal(days: Record<ISODate, DayEntry>, wk: string): DayLine[] {
  let dates: ISODate[];
  try { dates = weekDates(wk); } catch { return []; }
  const out: DayLine[] = [];
  for (const date of dates) {
    const s = days[date]?.shutdown;
    const win = s?.win?.trim() ?? '';
    const lesson = s?.lesson?.trim() ?? '';
    if (win || lesson) out.push({ date, win, lesson });
  }
  return out;
}

/**
 * Add the week's daily lines to a review field: one "• line" each, skipping lines already in it.
 * Returns the field unchanged when there is nothing new.
 */
export function mergeJournal(current: string, lines: readonly string[]): string {
  const have = current.trim();
  const fresh = lines.map((l) => l.trim()).filter((l) => l && !have.includes(l));
  if (!fresh.length) return current;
  const bullets = fresh.map((l) => `• ${l}`).join('\n');
  return have ? `${have}\n${bullets}` : bullets;
}

export interface CheckinAverages { days: number; sleep: number | null; energy: number | null; mood: number | null }

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Average sleep, energy and mood over the week's check-ins (each over the days it was filled in). */
export function checkinAverages(days: Record<ISODate, DayEntry>, wk: string): CheckinAverages {
  let dates: ISODate[];
  try { dates = weekDates(wk); } catch { return { days: 0, sleep: null, energy: null, mood: null }; }
  const sums = { sleep: [0, 0], energy: [0, 0], mood: [0, 0] };
  let n = 0;
  for (const date of dates) {
    const c = days[date]?.checkin;
    if (!c) continue;
    let any = false;
    const add = (k: keyof typeof sums, v: unknown) => {
      if (typeof v === 'number' && Number.isFinite(v)) { sums[k][0] += v; sums[k][1]++; any = true; }
    };
    add('sleep', c.sleepHours);
    add('energy', c.energy);
    add('mood', c.mood);
    if (any) n++;
  }
  const avg = (k: keyof typeof sums) => (sums[k][1] ? round1(sums[k][0] / sums[k][1]) : null);
  return { days: n, sleep: avg('sleep'), energy: avg('energy'), mood: avg('mood') };
}

/** weekSnapshot plus the week's check-in averages (stored with the review; older reviews lack these keys). */
export function reviewSnapshot(state: AnchorState, wk: string, now: Date = new Date()): Record<string, number | string | null> {
  const c = checkinAverages(state.days, wk);
  return {
    ...weekSnapshot(state, wk, now),
    'checkin.days': c.days,
    'checkin.sleep': c.sleep,
    'checkin.energy': c.energy,
    'checkin.mood': c.mood,
  };
}

// ---------------------------------------------------------------------------
// Snapshot → display
// ---------------------------------------------------------------------------

type Snap = Record<string, number | string | null | undefined>;
export type SnapTone = 'default' | 'good' | 'warn' | 'data' | 'muted';

const CASH_BAND_TONE: Record<CashBand, SnapTone> = { 'below-floor': 'warn', 'above-floor': 'data', 'on-target': 'good' };

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

export interface SnapshotView {
  hours: { key: string; label: string; hours: number; text: string }[];
  totalHours: number;
  build: number;
  sell: number;
  buildShare: number | null;
  buildSellTarget: number;
  /** '60% build · target 50%' or 'No build or sell hours yet'. */
  buildSellText: string;
  talks: number;
  talkTarget: number;
  talksText: string;
  escapesGo: number;
  escapesPark: number;
  escapesText: string;
  /** Time from escape-check sessions; null on snapshots saved before this was tracked. */
  viaEscape: { hours: number; overriddenHours: number; sessions: number; text: string } | null;
  /** The week's check-in averages; null on snapshots saved before this was tracked. */
  checkin: { days: number; sleep: number | null; energy: number | null; mood: number | null; text: string } | null;
  anchorsSet: number;
  anchorsDone: number;
  anchorsText: string;
  funnelRow: string | null;
  bottleneck: string | null;
  bottleneckText: string;
  /** '6%' or '—'. */
  bottleneckRateText: string;
  cashPerHour: number | null;
  cashText: string;
  cashTone: SnapTone;
  cashNote: string | null;
}

/** "1.5h in 2 sessions · 0.5h after a Park" / "None". */
export function viaEscapeText(hours: number, sessions: number, overriddenHours: number): string {
  if (sessions <= 0) return 'None';
  const base = `${formatHours(hours)} in ${sessions} session${sessions === 1 ? '' : 's'}`;
  return overriddenHours > 0 ? `${base} · ${formatHours(overriddenHours)} after a Park` : base;
}

/** "Sleep 6.2h · Energy 2.4 · Mood 3 (5 days)" / "No check-ins". */
export function checkinText(c: { days: number; sleep: number | null; energy: number | null; mood: number | null }): string {
  if (c.days <= 0) return 'No check-ins';
  const parts: string[] = [];
  if (c.sleep !== null) parts.push(`Sleep ${formatHours(c.sleep)}`);
  if (c.energy !== null) parts.push(`Energy ${round1(c.energy)}`);
  if (c.mood !== null) parts.push(`Mood ${round1(c.mood)}`);
  return `${parts.join(' · ')} (${c.days} day${c.days === 1 ? '' : 's'})`;
}

/** Turn a stored snapshot (possibly from an older version with missing keys) into display values. */
export function snapshotView(snap: Snap): SnapshotView {
  const hours = TIME_CATEGORIES.map((c) => {
    const h = n(snap[`hours.${c.value}`]) ?? 0;
    return { key: c.value, label: c.label, hours: h, text: formatHours(h) };
  });
  const totalHours = hours.reduce((a, x) => a + x.hours, 0);
  const build = n(snap['hours.build']) ?? 0;
  const sell = n(snap['hours.sell']) ?? 0;
  const buildShare = n(snap.buildShare);
  const target = n(snap.buildSellTarget) ?? 0.5;
  const buildSellText = buildShare === null
    ? 'No build or sell hours yet'
    : `${formatPercent(buildShare)} build · target ${formatPercent(target)}`;

  const talks = n(snap.talks) ?? 0;
  const talkTarget = n(snap.talkTarget) ?? 0;
  const escapesGo = n(snap.escapesGo) ?? 0;
  const escapesPark = n(snap.escapesPark) ?? 0;
  const anchorsSet = n(snap.anchorsSet) ?? 0;
  const anchorsDone = n(snap.anchorsDone) ?? 0;

  const viaHours = n(snap.viaEscapeHours);
  const viaSessions = n(snap.viaEscapeSessions);
  const viaOver = n(snap.viaEscapeOverriddenHours) ?? 0;
  const viaEscape = viaHours === null && viaSessions === null
    ? null
    : { hours: viaHours ?? 0, overriddenHours: viaOver, sessions: viaSessions ?? 0, text: viaEscapeText(viaHours ?? 0, viaSessions ?? 0, viaOver) };

  const ckDays = n(snap['checkin.days']);
  const checkin = ckDays === null
    ? null
    : (() => {
        const c = { days: ckDays, sleep: n(snap['checkin.sleep']), energy: n(snap['checkin.energy']), mood: n(snap['checkin.mood']) };
        return { ...c, text: checkinText(c) };
      })();

  const bottleneck = s(snap.bottleneck);
  const rate = n(snap.bottleneckRate);
  const bottleneckText = bottleneck ? (rate === null ? bottleneck : `${bottleneck} · ${formatPercent(rate)}`) : 'Not enough funnel data yet';

  const cash = n(snap.cashPerHour);
  const band = cashBand(cash);
  const cashTone: SnapTone = band ? CASH_BAND_TONE[band] : 'muted';
  const cashNote = band === 'below-floor' ? 'Below the ฿130/h floor.'
    : band === 'above-floor' ? 'Above the floor, under the ฿300/h target.'
    : band === 'on-target' ? 'At or above the ฿300/h target.'
    : null;

  return {
    hours, totalHours, build, sell, buildShare, buildSellTarget: target, buildSellText,
    talks, talkTarget,
    talksText: talkTarget > 0 ? `${talks} of ${talkTarget}` : String(talks),
    escapesGo, escapesPark,
    escapesText: escapesGo + escapesPark === 0 ? 'None' : `${escapesGo} go · ${escapesPark} parked`,
    viaEscape, checkin,
    anchorsSet, anchorsDone,
    anchorsText: anchorsSet === 0 ? 'None set' : `${anchorsDone} of ${anchorsSet} done`,
    funnelRow: s(snap.funnelRow),
    bottleneck, bottleneckText,
    bottleneckRateText: formatPercent(rate),
    cashPerHour: cash,
    cashText: cash === null ? '—' : `${formatThb(cash)}/h`,
    cashTone, cashNote,
  };
}

/** Compact one-line summaries for a saved review (read-only list). */
export function snapshotLines(snap: Snap): { label: string; value: string }[] {
  const v = snapshotView(snap);
  const hoursText = v.hours.filter((x) => x.hours > 0).map((x) => `${x.label} ${x.text}`).join(' · ') || 'No time logged';
  const lines = [
    { label: 'Hours', value: hoursText },
    { label: 'Build : sell', value: v.buildSellText },
    { label: 'Talks', value: v.talksText },
    { label: 'Escape checks', value: v.escapesText },
    { label: 'Anchors', value: v.anchorsText },
  ];
  if (v.viaEscape && v.viaEscape.sessions > 0) lines.push({ label: 'Of which via escape check', value: v.viaEscape.text });
  if (v.checkin && v.checkin.days > 0) lines.push({ label: 'Check-ins', value: v.checkin.text });
  if (v.funnelRow) lines.push({ label: 'Funnel', value: v.funnelRow });
  if (v.bottleneck) lines.push({ label: 'Bottleneck', value: v.bottleneckText });
  if (v.cashPerHour !== null) lines.push({ label: 'Cash per founder hour', value: v.cashText });
  return lines;
}

/** Name for a bet id in a saved review (the bet may have been deleted since). */
export function betNameFor(bets: readonly Pick<Bet, 'id' | 'name'>[], id: ID): string {
  return bets.find((b) => b.id === id)?.name || 'A removed bet';
}
