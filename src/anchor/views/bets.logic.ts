// Pure helpers for the Bets view. No window/document here: these run under `node --test`.

import type { Bet, BetDecision, BetStatus, ID, ISODate, ParkedIdea, Verdict } from '../core/types.ts';
import type { WipStatus } from '../core/metrics.ts';
import { addDays, daysBetween, isDateTime, isISODate, toISODate } from '../core/dates.ts';
import { REVIEW_PUSH_DAYS, VERDICTS, labelOf } from '../core/constants.ts';
import { isReviewOverdue } from '../core/metrics.ts';

/** Default days until a parked bet is looked at again. */
export const PARK_LOOK_AGAIN_DAYS = 30;
/** Longest bet name we derive from a parked idea. */
export const IDEA_NAME_MAX = 80;

const VERDICT_VALUES: readonly Verdict[] = ['continue', 'change', 'park', 'kill'];

export function isVerdict(x: unknown): x is Verdict {
  return typeof x === 'string' && (VERDICT_VALUES as readonly string[]).includes(x);
}

/** Empty, or the seed placeholder "(fill in)". */
export function isUnwritten(text: string | undefined): boolean {
  const t = (text ?? '').trim();
  return t === '' || /^\(fill in\)$/i.test(t);
}

// ---------------------------------------------------------------------------
// Grouping and review status
// ---------------------------------------------------------------------------

export interface BetGroups { active: Bet[]; parked: Bet[]; closed: Bet[] }

/**
 * Date a killed/won bet was closed: its last decision date (kill and Mark won both log one), else the
 * Bangkok date it was created (createdAt is UTC, so slicing it would be a day early before 07:00).
 */
export function closedOn(bet: Bet): ISODate {
  const last = bet.decisions[bet.decisions.length - 1];
  if (last?.date) return last.date;
  return isDateTime(bet.createdAt) ? toISODate(bet.createdAt) : bet.createdAt.slice(0, 10);
}

function byReview(today: ISODate) {
  return (a: Bet, b: Bet): number => {
    const ao = isReviewOverdue(a, today) ? 0 : 1;
    const bo = isReviewOverdue(b, today) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (a.reviewOn !== b.reviewOn) return a.reviewOn < b.reviewOn ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
}

/** Active and parked: overdue first, then soonest review. Closed (killed/won): most recently closed first. */
export function groupBets(bets: readonly Bet[], today: ISODate): BetGroups {
  const active = bets.filter((b) => b.status === 'active').sort(byReview(today));
  const parked = bets.filter((b) => b.status === 'parked').sort(byReview(today));
  const closed = bets
    .filter((b) => b.status === 'killed' || b.status === 'won')
    .sort((a, b) => {
      const ca = closedOn(a);
      const cb = closedOn(b);
      return ca === cb ? a.name.localeCompare(b.name) : ca < cb ? 1 : -1;
    });
  return { active, parked, closed };
}

export type ReviewTone = 'warn' | 'data' | 'muted';
export interface ReviewInfo { overdue: boolean; days: number | null; text: string; tone: ReviewTone }

/** Calm one-liner about the next review. days = reviewOn − today (negative = overdue). */
export function reviewInfo(bet: Bet, today: ISODate): ReviewInfo {
  if (bet.status === 'killed' || bet.status === 'won' || !isISODate(bet.reviewOn) || !isISODate(today)) {
    return { overdue: false, days: null, text: '', tone: 'muted' };
  }
  const days = daysBetween(today, bet.reviewOn);
  const overdue = isReviewOverdue(bet, today);
  let text: string;
  if (days < -1) text = `Review was due ${-days} days ago`;
  else if (days === -1) text = 'Review was due yesterday';
  else if (days === 0) text = 'Review today';
  else if (days === 1) text = 'Review tomorrow';
  else text = `Review in ${days} days`;
  const tone: ReviewTone = overdue ? 'warn' : days <= 3 ? 'data' : 'muted';
  return { overdue, days, text, tone };
}

/** Bets (active or parked) whose review date has passed. */
export function overdueBets(bets: readonly Bet[], today: ISODate): Bet[] {
  return bets.filter((b) => isReviewOverdue(b, today)).sort(byReview(today));
}

/** Short WIP line for the top of the list. */
export function wipCopy(w: WipStatus): string {
  if (w.over) return `${w.active} active, limit ${w.max}. Park one to get back under.`;
  if (w.atLimit) return `${w.active} of ${w.max} active. Park one before starting another.`;
  if (w.room === 1) return `${w.active} of ${w.max} active. Room for one more.`;
  return `${w.active} of ${w.max} active. Room for ${w.room} more.`;
}

// ---------------------------------------------------------------------------
// Review decisions
// ---------------------------------------------------------------------------

export interface DecisionInput { verdict: Verdict | ''; why: string; nextReview: string }
export interface DecisionErrors { verdict?: string; why?: string; nextReview?: string }

/** Default next review for a verdict: +14 days for continue/change, +30 for park, none for kill. */
export function defaultNextReview(verdict: Verdict | '', today: ISODate): ISODate | '' {
  if (verdict === 'continue' || verdict === 'change') return addDays(today, REVIEW_PUSH_DAYS);
  if (verdict === 'park') return addDays(today, PARK_LOOK_AGAIN_DAYS);
  return '';
}

export function validateDecision(input: DecisionInput, today: ISODate): DecisionErrors {
  const e: DecisionErrors = {};
  if (!isVerdict(input.verdict)) e.verdict = 'Pick one.';
  if (!input.why.trim()) {
    e.why = input.verdict === 'kill' ? 'One line on what it taught you.' : 'One line on why. Future you will want it.';
  }
  if (isVerdict(input.verdict) && input.verdict !== 'kill') {
    if (!isISODate(input.nextReview)) e.nextReview = 'Pick a date for the next look.';
    else if (input.nextReview < today) e.nextReview = 'Pick today or later.';
  }
  return e;
}

export function hasErrors(e: object): boolean {
  return Object.values(e).some(Boolean);
}

/**
 * Apply a review decision. Returns a new Bet (input untouched).
 * continue/change keep the status; park → parked; kill → killed (why = the lesson).
 * reviewOn moves to nextReview (or the verdict default) unless killed.
 * Throws if the input is invalid.
 */
export function applyDecision(bet: Bet, input: DecisionInput, today: ISODate): Bet {
  if (hasErrors(validateDecision(input, today)) || !isVerdict(input.verdict)) throw new Error('Invalid decision');
  const verdict = input.verdict;
  const decision: BetDecision = { date: today, verdict, why: input.why.trim() };
  const status: BetStatus = verdict === 'kill' ? 'killed' : verdict === 'park' ? 'parked' : bet.status;
  const reviewOn = verdict === 'kill' ? bet.reviewOn : (input.nextReview || defaultNextReview(verdict, today) || bet.reviewOn);
  return { ...bet, status, reviewOn, decisions: [...bet.decisions, decision] };
}

/** Newest first (decisions are appended in order). */
export function decisionsNewestFirst(bet: Bet): BetDecision[] {
  return bet.decisions.map((d, i) => ({ d, i })).sort((a, b) => (a.d.date === b.d.date ? b.i - a.i : a.d.date < b.d.date ? 1 : -1)).map((x) => x.d);
}

// ---------------------------------------------------------------------------
// Won
// ---------------------------------------------------------------------------

/** Why-line of the decision "Mark won" logs (verdict 'continue'); the log shows it as "Won". */
export const WON_WHY = 'Marked as won.';

/** The decision written by markWonBet. */
export function isWonDecision(d: BetDecision): boolean {
  return d.verdict === 'continue' && d.why.trim() === WON_WHY;
}

/** Badge text for a decision in the log. */
export function decisionLabel(d: BetDecision): string {
  return isWonDecision(d) ? 'Won' : labelOf(VERDICTS, d.verdict);
}

/** Mark a bet won today (Bangkok date), with a dated "Won" entry in its decision log. Returns a new Bet. */
export function markWonBet(bet: Bet, today: ISODate): Bet {
  return { ...bet, status: 'won', decisions: [...bet.decisions, { date: today, verdict: 'continue', why: WON_WHY }] };
}

/** The lesson written when the bet was killed (last kill decision), if any. */
export function killLesson(bet: Bet): string {
  for (let i = bet.decisions.length - 1; i >= 0; i--) {
    if (bet.decisions[i].verdict === 'kill') return bet.decisions[i].why;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Status changes (WIP limit)
// ---------------------------------------------------------------------------

export type ActivationPlan =
  | { kind: 'ok' }
  | { kind: 'needs-room'; active: Bet[] }
  | { kind: 'already-active' }
  | { kind: 'missing' };

/** Can `betId` become active now, or must one be parked first? */
export function planActivation(bets: readonly Bet[], betId: ID, max: number): ActivationPlan {
  const bet = bets.find((b) => b.id === betId);
  if (!bet) return { kind: 'missing' };
  if (bet.status === 'active') return { kind: 'already-active' };
  const active = bets.filter((b) => b.status === 'active');
  return active.length < max ? { kind: 'ok' } : { kind: 'needs-room', active };
}

/** Park a bet with a logged decision. Keeps a future reviewOn; a past one moves to +30 days. */
export function parkBet(bet: Bet, why: string, today: ISODate): Bet {
  const reviewOn = isISODate(bet.reviewOn) && bet.reviewOn >= today ? bet.reviewOn : addDays(today, PARK_LOOK_AGAIN_DAYS);
  return { ...bet, status: 'parked', reviewOn, decisions: [...bet.decisions, { date: today, verdict: 'park', why }] };
}

export function makeRoomWhy(forName: string): string {
  const n = forName.trim();
  return n ? `Parked to make room for ${n}.` : 'Parked to make room for another bet.';
}

export function overLimitWhy(max: number): string {
  return `Parked to stay within ${max} active bet${max === 1 ? '' : 's'}.`;
}

/**
 * Activate `betId` inside a store mutator (mutates `bets` in place).
 * If `parkId` is given, that active bet is parked first with a logged reason.
 * A past reviewOn on the activated bet moves to +14 days.
 * Throws if the bet is missing or the WIP limit would break (so the store change is dropped).
 */
export function activateBet(bets: Bet[], betId: ID, opts: { max: number; today: ISODate; parkId?: ID }): void {
  const i = bets.findIndex((b) => b.id === betId);
  if (i < 0) throw new Error('Bet not found');
  const target = bets[i];
  if (target.status === 'active') return;
  if (opts.parkId) {
    const j = bets.findIndex((b) => b.id === opts.parkId);
    if (j < 0 || bets[j].status !== 'active' || j === i) throw new Error('Bet to park not found');
    bets[j] = parkBet(bets[j], makeRoomWhy(target.name), opts.today);
  }
  const activeCount = bets.filter((b) => b.status === 'active').length;
  if (activeCount >= opts.max) throw new Error('WIP limit');
  const reviewOn = isISODate(target.reviewOn) && target.reviewOn >= opts.today ? target.reviewOn : addDays(opts.today, REVIEW_PUSH_DAYS);
  bets[i] = { ...target, status: 'active', reviewOn };
}

/** Bring a killed/won bet back as parked, with a fresh review date if the old one passed. */
export function reviveBet(bet: Bet, today: ISODate): Bet {
  const reviewOn = isISODate(bet.reviewOn) && bet.reviewOn >= today ? bet.reviewOn : addDays(today, REVIEW_PUSH_DAYS);
  return { ...bet, status: 'parked', reviewOn };
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

export interface BetForm {
  name: string; hypothesis: string; metric: string; continueIf: string; killIf: string;
  reviewOn: string; notes: string;
  /** Only used when creating. */
  status: 'active' | 'parked';
}
export interface BetFormErrors { name?: string; reviewOn?: string }

export function formFromBet(bet: Bet): BetForm {
  return {
    name: bet.name, hypothesis: bet.hypothesis, metric: bet.metric, continueIf: bet.continueIf, killIf: bet.killIf,
    reviewOn: bet.reviewOn, notes: bet.notes, status: bet.status === 'active' ? 'active' : 'parked',
  };
}

/** Blank form. Starts active when there is room, otherwise parked. */
export function newBetForm(today: ISODate, opts: { canActivate: boolean }): BetForm {
  return {
    name: '', hypothesis: '', metric: '', continueIf: '', killIf: '',
    reviewOn: addDays(today, REVIEW_PUSH_DAYS), notes: '', status: opts.canActivate ? 'active' : 'parked',
  };
}

/** First line of the idea, cut to IDEA_NAME_MAX chars on a word boundary when possible. */
export function ideaToBetName(text: string): string {
  const first = (text.split(/\r?\n/).find((l) => l.trim()) ?? '').trim().replace(/\s+/g, ' ');
  if (first.length <= IDEA_NAME_MAX) return first;
  const cut = first.slice(0, IDEA_NAME_MAX - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > IDEA_NAME_MAX / 2 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** "Make it a bet": name prefilled from the idea, starts parked. Full idea text goes to notes when the name had to be shortened. */
export function formFromParkedIdea(idea: ParkedIdea, today: ISODate): BetForm {
  const name = ideaToBetName(idea.text);
  const full = idea.text.trim();
  return {
    name, hypothesis: '', metric: '', continueIf: '', killIf: '',
    reviewOn: addDays(today, REVIEW_PUSH_DAYS),
    notes: full && full !== name ? `From the parking lot: ${full}` : '',
    status: 'parked',
  };
}

export function validateBetForm(f: BetForm): BetFormErrors {
  const e: BetFormErrors = {};
  if (!f.name.trim()) e.name = 'Give it a short name.';
  if (!isISODate(f.reviewOn)) e.reviewOn = 'Pick a review date.';
  return e;
}

/** Build a Bet from the form. Editing keeps id, status, createdAt and decisions. */
export function betFromForm(f: BetForm, opts: { id: ID; now: Date; existing?: Bet }): Bet {
  const t = (s: string) => s.trim();
  const base = {
    name: t(f.name).replace(/\s+/g, ' '), hypothesis: t(f.hypothesis), metric: t(f.metric),
    continueIf: t(f.continueIf), killIf: t(f.killIf), reviewOn: f.reviewOn, notes: t(f.notes),
  };
  if (opts.existing) return { ...opts.existing, ...base };
  return { id: opts.id, ...base, status: f.status, createdAt: opts.now.toISOString(), decisions: [] };
}

// ---------------------------------------------------------------------------
// Parking lot
// ---------------------------------------------------------------------------

export function parkingNewestFirst(parking: readonly ParkedIdea[]): ParkedIdea[] {
  return [...parking].sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1));
}
