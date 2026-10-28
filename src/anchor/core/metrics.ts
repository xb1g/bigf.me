// Pure metrics. No window/document access; every function is deterministic given its inputs.

import type {
  ActiveTimer, AnchorState, Bet, DayEntry, EscapeCheck, FunnelRow, ID, ISODate, Talk,
  TimeCategory, TimeEntry,
} from './types.ts';
import {
  daysBetween, isDateTime, isISODate, weekDates, weekKey, weekKeyOf,
} from './dates.ts';
import {
  ESCAPE_MAX_DAYS, MAX_BLOCK_HOURS, MENTOR_FLOOR_THB_PER_HOUR, TARGET_THB_PER_HOUR, TIME_CATEGORIES, TIMER_GRACE_MIN,
} from './constants.ts';

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type CategoryHours = Record<TimeCategory, number>;

export function emptyCategoryHours(): CategoryHours {
  return { build: 0, sell: 0, ops: 0, teach: 0, rest: 0, escape: 0 };
}

/** Duration of a time entry in minutes (0 for invalid or negative spans). */
export function entryMinutes(e: Pick<TimeEntry, 'start' | 'end'>): number {
  const a = Date.parse(e.start), b = Date.parse(e.end);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return (b - a) / 60_000;
}

/** Elapsed ms of a running timer at `now`. */
export function timerElapsedMs(timer: Pick<ActiveTimer, 'startedAt'>, now: Date = new Date()): number {
  const a = Date.parse(timer.startedAt);
  return Number.isNaN(a) ? 0 : Math.max(0, now.getTime() - a);
}

/**
 * Longest a running timer can plausibly have been real work: a time-boxed timer's box + TIMER_GRACE_MIN
 * (30 min), else MAX_BLOCK_HOURS. Past this it was probably forgotten, so it counts no further and Stop asks
 * when it really ended (prefilled with the end of the box).
 */
export function timerCapMs(timer: Pick<ActiveTimer, 'timeboxMin'>): number {
  const box = timer.timeboxMin && timer.timeboxMin > 0 ? timer.timeboxMin : 0;
  return (box ? box + TIMER_GRACE_MIN : MAX_BLOCK_HOURS * 60) * 60_000;
}

/** True when the timer has run past its cap (see timerCapMs). */
export function timerOverCap(timer: Pick<ActiveTimer, 'startedAt' | 'timeboxMin'>, now: Date = new Date()): boolean {
  return timerElapsedMs(timer, now) > timerCapMs(timer);
}

/** True when a time-boxed timer has run past its box (the shell shows "Your N minutes are up"). */
export function timerPastTimebox(timer: Pick<ActiveTimer, 'startedAt' | 'timeboxMin'>, now: Date = new Date()): boolean {
  return Boolean(timer.timeboxMin && timer.timeboxMin > 0 && timerElapsedMs(timer, now) >= timer.timeboxMin * 60_000);
}

/** Ms until a time-boxed timer reaches its box (0 when already past; null without a timebox). */
export function msUntilTimebox(timer: Pick<ActiveTimer, 'startedAt' | 'timeboxMin'>, now: Date = new Date()): number | null {
  if (!timer.timeboxMin || timer.timeboxMin <= 0) return null;
  return Math.max(0, timer.timeboxMin * 60_000 - timerElapsedMs(timer, now));
}

/** Minutes past the timebox (0 when within it or no timebox). */
export function timerOverrunMin(timer: ActiveTimer, now: Date = new Date()): number {
  if (!timer.timeboxMin) return 0;
  return Math.max(0, timerElapsedMs(timer, now) / 60_000 - timer.timeboxMin);
}

/** Entries whose start falls in the given ISO week (Asia/Bangkok). */
export function entriesInWeek(timeLog: TimeEntry[], wk: string): TimeEntry[] {
  return timeLog.filter((e) => isDateTime(e.start) && weekKeyOf(e.start) === wk);
}

/** The parts of [a, b) covered by logged entries, merged (overlapping or touching entries become one) and in order. */
function coveredSpans(timeLog: readonly Pick<TimeEntry, 'start' | 'end'>[], a: number, b: number): [number, number][] {
  if (!(b > a)) return [];
  const spans: [number, number][] = [];
  for (const e of timeLog) {
    const s = Math.max(a, Date.parse(e.start)), t = Math.min(b, Date.parse(e.end));
    if (!Number.isNaN(s) && !Number.isNaN(t) && t > s) spans.push([s, t]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  const merged: [number, number][] = [];
  for (const [s, t] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], t);
    else merged.push([s, t]);
  }
  return merged;
}

/** Milliseconds of [a, b) covered by at least one logged entry (overlapping entries count once). */
export function coveredMs(timeLog: readonly Pick<TimeEntry, 'start' | 'end'>[], a: number, b: number): number {
  return coveredSpans(timeLog, a, b).reduce((n, [s, t]) => n + (t - s), 0);
}

/**
 * The parts of [a, b) that no logged entry covers, in order. A stopped timer logs only these, so a block
 * added by hand over part of its run never counts twice (the same rule as runningTimerMs).
 */
export function uncoveredSpans(timeLog: readonly Pick<TimeEntry, 'start' | 'end'>[], a: number, b: number): [number, number][] {
  if (!(b > a)) return [];
  const out: [number, number][] = [];
  let cur = a;
  for (const [s, t] of coveredSpans(timeLog, a, b)) {
    if (s > cur) out.push([cur, s]);
    cur = Math.max(cur, t);
  }
  if (b > cur) out.push([cur, b]);
  return out;
}

/**
 * Time the running timer adds on top of the log at `now`: [startedAt, now] minus any part already covered
 * by a logged block (a manual block added for the same time must not count twice). A timer past its cap
 * (probably forgotten, see timerCapMs) adds nothing until Stop asks when it really ended.
 */
export function runningTimerMs(timeLog: readonly Pick<TimeEntry, 'start' | 'end'>[], t: ActiveTimer, now: Date = new Date()): number {
  if (!isDateTime(t.startedAt) || timerOverCap(t, now)) return 0;
  const a = Date.parse(t.startedAt);
  const b = a + timerElapsedMs(t, now);
  return Math.max(0, b - a - coveredMs(timeLog, a, b));
}

/**
 * Hours per category for an ISO week. Entries count in the week their start falls in.
 * Pass `activeTimer` + `now` to include the running timer (see runningTimerMs: no double counting with
 * logged blocks, nothing once it is past its cap).
 */
export function hoursByCategory(
  timeLog: TimeEntry[],
  wk: string,
  opts: { activeTimer?: ActiveTimer; now?: Date } = {},
): CategoryHours {
  const out = emptyCategoryHours();
  for (const e of entriesInWeek(timeLog, wk)) {
    if (e.category in out) out[e.category] += entryMinutes(e) / 60;
  }
  const t = opts.activeTimer;
  if (t && isDateTime(t.startedAt) && weekKeyOf(t.startedAt) === wk && t.category in out) {
    out[t.category] += runningTimerMs(timeLog, t, opts.now ?? new Date()) / 3_600_000;
  }
  return out;
}

export interface EscapeSessionHours {
  /** Hours from sessions started by an escape check's Go (any category). */
  hours: number;
  /** Of those, hours where the check said Park and Go was chosen anyway. */
  overriddenHours: number;
  /** Number of such sessions (a running one counts). */
  sessions: number;
  /** The same hours split by the category they were logged under. */
  byCategory: CategoryHours;
}

/**
 * "Of which via escape check": time in an ISO week from sessions tagged source 'escape'.
 * Same week and running-timer rules as hoursByCategory.
 */
export function escapeSessionHours(
  timeLog: TimeEntry[],
  wk: string,
  opts: { activeTimer?: ActiveTimer; now?: Date } = {},
): EscapeSessionHours {
  const out: EscapeSessionHours = { hours: 0, overriddenHours: 0, sessions: 0, byCategory: emptyCategoryHours() };
  const add = (category: TimeCategory, h: number, overridden: boolean | undefined) => {
    out.hours += h;
    out.sessions++;
    if (overridden) out.overriddenHours += h;
    if (category in out.byCategory) out.byCategory[category] += h;
  };
  for (const e of entriesInWeek(timeLog, wk)) {
    if (e.source === 'escape') add(e.category, entryMinutes(e) / 60, e.overridden);
  }
  const t = opts.activeTimer;
  if (t && t.source === 'escape' && isDateTime(t.startedAt) && weekKeyOf(t.startedAt) === wk) {
    add(t.category, runningTimerMs(timeLog, t, opts.now ?? new Date()) / 3_600_000, t.overridden);
  }
  return out;
}

export function totalHours(h: CategoryHours): number {
  return TIME_CATEGORIES.reduce((s, c) => s + h[c.value], 0);
}

export interface BuildSell {
  build: number;           // hours
  sell: number;            // hours
  total: number;           // build + sell
  /** build / (build + sell), null when both are 0. Compare with profile.buildSellTarget. */
  buildShare: number | null;
  sellShare: number | null;
}

/** Build vs sell split from category hours. Target is profile.buildSellTarget (0.5 = 50/50). */
export function buildSellRatio(h: Pick<CategoryHours, 'build' | 'sell'>): BuildSell {
  const total = h.build + h.sell;
  if (total <= 0) return { build: h.build, sell: h.sell, total: 0, buildShare: null, sellShare: null };
  return { build: h.build, sell: h.sell, total, buildShare: h.build / total, sellShare: h.sell / total };
}

// ---------------------------------------------------------------------------
// Talks, escapes, anchors
// ---------------------------------------------------------------------------

export function talksInWeek(talks: Talk[], wk: string): Talk[] {
  return talks.filter((t) => isISODate(t.date) && weekKey(t.date) === wk);
}

export function talksThisWeek(talks: Talk[], wk: string): number {
  return talksInWeek(talks, wk).length;
}

export function escapesInWeek(escapes: EscapeCheck[], wk: string): EscapeCheck[] {
  return escapes.filter((e) => isDateTime(e.at) && weekKeyOf(e.at) === wk);
}

export function escapesThisWeek(escapes: EscapeCheck[], wk: string): { go: number; park: number; total: number } {
  let go = 0, park = 0;
  for (const e of escapesInWeek(escapes, wk)) {
    if (e.verdict === 'go') go++;
    else park++;
  }
  return { go, park, total: go + park };
}

/** Anchors set (non-empty text) and done across the 7 days of a week. */
export function anchorsInWeek(days: Record<ISODate, DayEntry>, wk: string): { set: number; done: number } {
  let set = 0, done = 0;
  for (const d of weekDates(wk)) {
    const a = days[d]?.anchor;
    if (a && a.text.trim()) {
      set++;
      if (a.done) done++;
    }
  }
  return { set, done };
}

// ---------------------------------------------------------------------------
// Funnel
// ---------------------------------------------------------------------------

export type FunnelStageKey =
  | 'reach' | 'clicks' | 'applied' | 'paid' | 'finished' | 'verifiedTest' | 'posts' | 'referralApplied';

export const FUNNEL_STAGES: readonly { key: FunnelStageKey; label: string; short: string }[] = [
  { key: 'reach', label: 'Reach', short: 'Reach' },
  { key: 'clicks', label: 'Link clicks', short: 'Clicks' },
  { key: 'applied', label: 'Applied', short: 'Applied' },
  { key: 'paid', label: 'Paid', short: 'Paid' },
  { key: 'finished', label: 'Finished day 7', short: 'Finished' },
  { key: 'verifiedTest', label: 'Verified real-user test', short: 'Verified' },
  { key: 'posts', label: 'Day-6 posts', short: 'Posts' },
  { key: 'referralApplied', label: 'Friend/referral applies', short: 'Referrals' },
];

export type FunnelMoneyKey = 'revenueThb' | 'costThb' | 'founderHours';

export const FUNNEL_MONEY: readonly { key: FunnelMoneyKey; label: string }[] = [
  { key: 'revenueThb', label: 'Revenue (THB)' },
  { key: 'costThb', label: 'Cash costs (THB)' },
  { key: 'founderHours', label: 'Founder hours' },
];

const known = (v: number | undefined | null): v is number => typeof v === 'number' && Number.isFinite(v);

export interface Conversion {
  from: FunnelStageKey;
  to: FunnelStageKey;
  fromValue: number;
  toValue: number;
  /** to / from; null when `from` is 0. */
  rate: number | null;
}

/** Conversions between consecutive NON-EMPTY stages (empty = unknown, skipped). */
export function funnelConversions(row: FunnelRow): Conversion[] {
  const present = FUNNEL_STAGES.filter((s) => known(row[s.key]));
  const out: Conversion[] = [];
  for (let i = 1; i < present.length; i++) {
    const a = present[i - 1].key, b = present[i].key;
    const av = row[a] as number, bv = row[b] as number;
    out.push({ from: a, to: b, fromValue: av, toValue: bv, rate: av > 0 ? bv / av : null });
  }
  return out;
}

/** Lowest conversion (first one on ties); null when there is no computable conversion. */
export function funnelBottleneck(row: FunnelRow): Conversion | null {
  let worst: Conversion | null = null;
  for (const c of funnelConversions(row)) {
    if (c.rate === null) continue;
    if (!worst || c.rate < (worst.rate as number)) worst = c;
  }
  return worst;
}

/** (revenue − costs) / founder hours. Null unless all three are known and hours > 0. */
export function cashPerFounderHour(row: Pick<FunnelRow, 'revenueThb' | 'costThb' | 'founderHours'>): number | null {
  if (!known(row.revenueThb) || !known(row.costThb) || !known(row.founderHours) || row.founderHours <= 0) return null;
  return (row.revenueThb - row.costThb) / row.founderHours;
}

export type CashBand = 'below-floor' | 'above-floor' | 'on-target';

/** below-floor: < ฿130/h · above-floor: ฿130–299/h · on-target: ≥ ฿300/h. */
export function cashBand(perHour: number | null): CashBand | null {
  if (perHour === null || !Number.isFinite(perHour)) return null;
  if (perHour < MENTOR_FLOOR_THB_PER_HOUR) return 'below-floor';
  if (perHour < TARGET_THB_PER_HOUR) return 'above-floor';
  return 'on-target';
}

/** Verified tests ÷ students who finished (falls back to paid). Null when unknown. */
export function verifiedTestRate(row: FunnelRow): number | null {
  const denom = known(row.finished) ? row.finished : known(row.paid) ? row.paid : undefined;
  if (!known(row.verifiedTest) || denom === undefined || denom <= 0) return null;
  return row.verifiedTest / denom;
}

/** Friend/referral applies ÷ all applies (falls back to paid seats). Null when unknown. */
export function referralShare(row: FunnelRow): number | null {
  const denom = known(row.applied) ? row.applied : known(row.paid) ? row.paid : undefined;
  if (!known(row.referralApplied) || denom === undefined || denom <= 0) return null;
  return row.referralApplied / denom;
}

/** Rows oldest → newest: dated rows by date, undated rows keep their list order after them. */
export function sortFunnelRows(rows: FunnelRow[]): FunnelRow[] {
  const indexed = rows.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    const ad = a.r.date, bd = b.r.date;
    if (ad && bd) return ad < bd ? -1 : ad > bd ? 1 : a.i - b.i;
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return a.i - b.i;
  });
  return indexed.map((x) => x.r);
}

/** Newest funnel row (see sortFunnelRows), or null. */
export function latestFunnelRow(rows: FunnelRow[]): FunnelRow | null {
  const sorted = sortFunnelRows(rows);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

export function stageLabel(key: FunnelStageKey): string {
  return FUNNEL_STAGES.find((s) => s.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Bets / WIP
// ---------------------------------------------------------------------------

export function activeBets(bets: Bet[]): Bet[] {
  return bets.filter((b) => b.status === 'active');
}

export function activeBetCount(bets: Bet[]): number {
  return activeBets(bets).length;
}

export interface WipStatus { active: number; max: number; atLimit: boolean; over: boolean; room: number }

export function wipStatus(bets: Bet[], maxActive: number): WipStatus {
  const active = activeBetCount(bets);
  return { active, max: maxActive, atLimit: active >= maxActive, over: active > maxActive, room: Math.max(0, maxActive - active) };
}

/** True if one more bet can become active without breaking the WIP limit. */
export function canActivateBet(bets: Bet[], maxActive: number): boolean {
  return activeBetCount(bets) < maxActive;
}

/** Review is overdue when reviewOn < today, for active or parked bets. */
export function isReviewOverdue(bet: Bet, today: ISODate): boolean {
  if (bet.status !== 'active' && bet.status !== 'parked') return false;
  if (!isISODate(bet.reviewOn)) return false;
  return bet.reviewOn < today;
}

/** The active bet whose review is soonest, with days until it (negative = overdue). */
export function nextBetReviewDue(bets: Bet[], today: ISODate): { bet: Bet; days: number } | null {
  let best: Bet | null = null;
  for (const b of activeBets(bets)) {
    if (!isISODate(b.reviewOn)) continue;
    if (!best || b.reviewOn < best.reviewOn) best = b;
  }
  return best ? { bet: best, days: daysBetween(today, best.reviewOn) } : null;
}

// ---------------------------------------------------------------------------
// Escape check
// ---------------------------------------------------------------------------

export interface EscapeInput {
  numberMoves: string;
  byWhen?: ISODate;
  /** undefined / '' / 'none' = no bet. */
  betId?: ID | 'none' | '';
}

export type EscapeParkReason = 'no-number' | 'vague-number' | 'no-bet' | 'bet-not-active' | 'no-date' | 'past-date' | 'too-far';

/** Which escape-check answer a reason points at (so the view can flag that answer / step). */
export type EscapeReasonField = 'numberMoves' | 'betId' | 'byWhen';

export interface EscapeReason {
  code: EscapeParkReason;
  field: EscapeReasonField;
  /** One calm sentence for the result screen. */
  text: string;
}

export const ESCAPE_REASON_COPY: Record<EscapeParkReason, string> = {
  'no-number': 'No number moves yet.',
  'vague-number': 'That number is hard to count. Name a count you can check.',
  'no-bet': 'It doesn’t serve an active bet.',
  'bet-not-active': 'The bet it serves isn’t active.',
  'no-date': 'There’s no date yet for when you’d see it move.',
  'past-date': 'That date has already passed.',
  'too-far': `You won’t see it move within ${ESCAPE_MAX_DAYS} days.`,
};

const REASON_FIELD: Record<EscapeParkReason, EscapeReasonField> = {
  'no-number': 'numberMoves',
  'vague-number': 'numberMoves',
  'no-bet': 'betId',
  'bet-not-active': 'betId',
  'no-date': 'byWhen',
  'past-date': 'byWhen',
  'too-far': 'byWhen',
};

/** Results that show up months later. Fine for a bet; a day's anchor can't move them. */
const SLOW_NUMBER = /\b(arr|mrr|run[- ]?rate|valuation|ltv|churn|retention|nps|market share)\b/i;
/** Words that sound like a number but can't be counted. */
const VAGUE_NUMBER = /\b(engagement|awareness|growth|traction|momentum|feedback|learnings?|quality|brand|buzz|hype|vibes?|progress|exposure|interest|visibility|impact|insights?)\b/i;

/** 'slow' = moves over months (ARR, retention); 'vague' = no count in it (engagement). Null when fine or empty. */
export function numberIssue(metric: string | undefined): 'slow' | 'vague' | null {
  const m = (metric ?? '').trim();
  if (!m) return null;
  if (SLOW_NUMBER.test(m)) return 'slow';
  if (!/\d/.test(m) && VAGUE_NUMBER.test(m)) return 'vague';
  return null;
}

/** The by-when problem alone (null when the date is fine): none, in the past, or more than 30 days away. */
export function escapeDateReason(byWhen: string | undefined, today: ISODate): 'no-date' | 'past-date' | 'too-far' | null {
  if (!byWhen || !isISODate(byWhen)) return 'no-date';
  const days = daysBetween(today, byWhen);
  if (days < 0) return 'past-date';
  if (days > ESCAPE_MAX_DAYS) return 'too-far';
  return null;
}

/**
 * Why the escape check recommends parking (empty array → Go). Order: number, bet, date.
 * Park when: no number or a vague one · no bet / bet not active · no by-when date · by-when already past · by-when > 30 days.
 */
export function escapeParkReasons(input: EscapeInput, bets: Bet[], today: ISODate): EscapeParkReason[] {
  const reasons: EscapeParkReason[] = [];
  if (!input.numberMoves || !input.numberMoves.trim()) reasons.push('no-number');
  else if (numberIssue(input.numberMoves) === 'vague') reasons.push('vague-number');
  const betId = input.betId;
  if (!betId || betId === 'none') {
    reasons.push('no-bet');
  } else {
    const bet = bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'active') reasons.push('bet-not-active');
  }
  const date = escapeDateReason(input.byWhen, today);
  if (date) reasons.push(date);
  return reasons;
}

/** Same as escapeParkReasons, with the answer each reason points at and its copy. */
export function escapeReasons(input: EscapeInput, bets: Bet[], today: ISODate): EscapeReason[] {
  return escapeParkReasons(input, bets, today).map((code) => ({ code, field: REASON_FIELD[code], text: ESCAPE_REASON_COPY[code] }));
}

/**
 * Park if any escapeParkReasons apply (no number, no active bet, no date, a past date, or a date more than
 * 30 days away); otherwise Go (time-boxed, default 90 min).
 */
export function escapeVerdict(input: EscapeInput, bets: Bet[], today: ISODate): 'go' | 'park' {
  return escapeParkReasons(input, bets, today).length ? 'park' : 'go';
}

// ---------------------------------------------------------------------------
// Weekly snapshot (Review)
// ---------------------------------------------------------------------------

/** Auto snapshot stored on WeeklyReview.snapshot. Keys are stable; values number | string | null. */
export function weekSnapshot(state: AnchorState, wk: string, now: Date = new Date()): Record<string, number | string | null> {
  const hours = hoursByCategory(state.timeLog, wk, { activeTimer: state.activeTimer, now });
  const bs = buildSellRatio(hours);
  const esc = escapesThisWeek(state.escapes, wk);
  const anchors = anchorsInWeek(state.days, wk);
  const row = latestFunnelRow(state.funnel);
  const bottleneck = row ? funnelBottleneck(row) : null;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const snap: Record<string, number | string | null> = {};
  for (const c of TIME_CATEGORIES) snap[`hours.${c.value}`] = round1(hours[c.value]);
  snap.buildShare = bs.buildShare === null ? null : Math.round(bs.buildShare * 100) / 100;
  snap.buildSellTarget = state.profile.buildSellTarget;
  snap.talks = talksThisWeek(state.talks, wk);
  snap.talkTarget = state.profile.weeklyTalkTarget;
  snap.escapesGo = esc.go;
  snap.escapesPark = esc.park;
  const via = escapeSessionHours(state.timeLog, wk, { activeTimer: state.activeTimer, now });
  snap.viaEscapeHours = round1(via.hours);
  snap.viaEscapeOverriddenHours = round1(via.overriddenHours);
  snap.viaEscapeSessions = via.sessions;
  snap.anchorsSet = anchors.set;
  snap.anchorsDone = anchors.done;
  snap.funnelRow = row ? row.label : null;
  snap.bottleneck = bottleneck ? `${stageLabel(bottleneck.from)} → ${stageLabel(bottleneck.to)}` : null;
  snap.bottleneckRate = bottleneck && bottleneck.rate !== null ? Math.round(bottleneck.rate * 1000) / 1000 : null;
  const cph = row ? cashPerFounderHour(row) : null;
  snap.cashPerHour = cph === null ? null : Math.round(cph);
  return snap;
}

// ---------------------------------------------------------------------------
// Small formatting helpers for numbers
// ---------------------------------------------------------------------------

/** 0.0625 → '6%', null → '—'. */
export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits)}%`;
}

/** 9000 → '฿9,000', null → '—'. */
export function formatThb(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `฿${Math.round(v).toLocaleString('en-US')}`;
}
