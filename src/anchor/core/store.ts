// Single AnchorState in localStorage ('anchor:v1').
// - migrate() and the reducer helpers are pure (Node-testable).
// - The runtime store touches storage/window only inside functions, never at import time.

import type {
  ActiveTimer, AnchorState, Bet, BetDecision, DayEntry, EscapeCheck, FunnelRow, HeavyItem, ID, ISODate,
  ParkedIdea, Profile, Talk, TimeCategory, TimeEntry, TimerSource, TimerTags, UpdateOptions, WeeklyReview, Worry,
} from './types.ts';
import { addDays, isDateTime, isISODate, toISODate } from './dates.ts';
import { newId } from './id.ts';
import { createSeedState, DEFAULT_LOCK_AFTER_MIN, DEFAULT_PROFILE, emptyState } from './seed.ts';
import {
  BET_STATUSES, COLLECTION_LIMITS, DATASET_GEN_KEY, ERASE_EVENT_KEY, HEAVY_KINDS, HEAVY_STATUSES, MAX_ACTIONS,
  MAX_BET_DECISIONS, MAX_DAYS, MAX_REVIEW_DECISIONS, MAX_STATE_BYTES, MIN_TIME_ENTRY_MS, STORAGE_KEY, TALK_ROLES,
  TIME_CATEGORIES, VERDICTS,
} from './constants.ts';
import { timerElapsedMs, timerOverCap, uncoveredSpans } from './metrics.ts';

export { newId };

// ===========================================================================
// migrate(raw) — validate + fill defaults. Never throws. Unknown fields are dropped.
// ===========================================================================

type Obj = Record<string, unknown>;

export interface MigrateOptions {
  /**
   * Import / pull: also cap each collection (COLLECTION_LIMITS, MAX_DAYS, decision limits) and drop records
   * with nothing meaningful in them (e.g. `{}` bets, blank talks, zero-length time blocks, empty days).
   * Normal saves never cap or drop records.
   */
  forImport?: boolean;
}

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, d = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : d;
const optStr = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const bool = (v: unknown): boolean => v === true;

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function numIn(v: unknown, min: number, max: number): number | undefined {
  const n = num(v);
  return n !== undefined && n >= min && n <= max ? n : undefined;
}

function intIn(v: unknown, min: number, max: number, d: number): number {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) && n >= min && n <= max ? n : d;
}

function scale5(v: unknown): 1 | 2 | 3 | 4 | 5 | undefined {
  const n = num(v);
  return n !== undefined && Number.isInteger(n) && n >= 1 && n <= 5 ? (n as 1 | 2 | 3 | 4 | 5) : undefined;
}

function oneOf<T extends string>(v: unknown, options: readonly { value: T }[], d: T): T {
  return options.some((o) => o.value === v) ? (v as T) : d;
}

function optOneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(v as T) ? (v as T) : undefined;
}

const optDate = (v: unknown): ISODate | undefined => (isISODate(v) ? v : undefined);
const dateTime = (v: unknown, d: string): string => (isDateTime(v) ? v : d);

/** Remove keys whose value is undefined (keeps JSON + deepEqual clean). */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

/** The last `max` items of an array (the newest: collections are appended over time). Cheap when under. */
function newest(v: unknown, max: number): unknown[] {
  const a = arr(v);
  return a.length > max ? a.slice(a.length - max) : a;
}

/**
 * Map array items through fn (dropping nulls) and make ids unique. At most `max` raw items are read (the
 * newest), before any normalising. `keep` (import only) drops records with nothing meaningful in them.
 */
function list<T extends { id: ID }>(v: unknown, max: number, fn: (o: Obj) => T | null, keep?: ((m: T) => boolean) | false): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of newest(v, max)) {
    if (!isObj(item)) continue;
    const m = fn(item);
    if (!m || (keep && !keep(m))) continue;
    if (seen.has(m.id)) m.id = newId();
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

const filled = (...vals: (string | undefined)[]): boolean => vals.some((v) => typeof v === 'string' && v.trim() !== '');

const idOf = (v: unknown): ID => (typeof v === 'string' && v.trim() ? v : newId());

const CATEGORY_VALUES = TIME_CATEGORIES.map((c) => c.value);

function migrateProfile(v: unknown): Profile {
  const p = isObj(v) ? v : {};
  const target = numIn(p.buildSellTarget, 0, 1);
  return {
    name: typeof p.name === 'string' ? p.name : DEFAULT_PROFILE.name,
    weeklyTalkTarget: intIn(p.weeklyTalkTarget, 1, 200, DEFAULT_PROFILE.weeklyTalkTarget),
    buildSellTarget: target ?? DEFAULT_PROFILE.buildSellTarget,
    maxActiveBets: intIn(p.maxActiveBets, 1, 20, DEFAULT_PROFILE.maxActiveBets),
  };
}

function migrateDay(date: string, v: unknown): DayEntry | null {
  if (!isISODate(date) || !isObj(v)) return null;
  const seen = new Set<string>();
  // Three is the limit: an import with a 4th action keeps the first three.
  const actions = arr(v.actions).filter(isObj).slice(0, MAX_ACTIONS).map((a) => {
    let id = idOf(a.id);
    if (seen.has(id)) id = newId();
    seen.add(id);
    return compact({ id, text: str(a.text), done: bool(a.done), forAnchor: a.forAnchor === true ? true as const : undefined });
  });
  const day: DayEntry = { date, actions };
  if (isObj(v.anchor)) {
    const a = v.anchor;
    day.anchor = compact({
      text: str(a.text), metric: optStr(a.metric), byWhen: optStr(a.byWhen), betId: optStr(a.betId), done: bool(a.done),
    });
  }
  if (isObj(v.checkin)) {
    const c = v.checkin;
    const checkin = compact({
      sleepHours: numIn(c.sleepHours, 0, 24), energy: scale5(c.energy), mood: scale5(c.mood), note: optStr(c.note),
    });
    if (Object.keys(checkin).length) day.checkin = checkin;
  }
  if (isObj(v.shutdown)) {
    const s = v.shutdown;
    const shutdown = compact({ win: optStr(s.win), lesson: optStr(s.lesson), tomorrow: optStr(s.tomorrow) });
    if (Object.keys(shutdown).length) day.shutdown = shutdown;
  }
  return day;
}

function migrateBet(b: Obj, now: Date, maxDecisions: number): Bet {
  const today = toISODate(now);
  const decisions: BetDecision[] = newest(b.decisions, maxDecisions)
    .filter(isObj)
    .filter((d) => VERDICTS.some((x) => x.value === d.verdict))
    .map((d) => ({ date: optDate(d.date) ?? today, verdict: d.verdict as BetDecision['verdict'], why: str(d.why) }));
  return {
    id: idOf(b.id),
    name: str(b.name),
    hypothesis: str(b.hypothesis),
    metric: str(b.metric),
    continueIf: str(b.continueIf),
    killIf: str(b.killIf),
    reviewOn: optDate(b.reviewOn) ?? addDays(today, 14),
    status: oneOf(b.status, BET_STATUSES, 'parked'),
    notes: str(b.notes),
    createdAt: dateTime(b.createdAt, now.toISOString()),
    decisions,
  };
}

/** source 'escape' (+ overridden: true only alongside it). Anything else is dropped. */
function timerTags(v: Obj): TimerTags {
  const source: TimerSource | undefined = v.source === 'escape' ? 'escape' : undefined;
  return { source, overridden: source && v.overridden === true ? true : undefined };
}

function migrateTimeEntry(e: Obj): TimeEntry | null {
  if (!isDateTime(e.start) || !isDateTime(e.end)) return null;
  return compact({
    id: idOf(e.id),
    category: oneOf<TimeCategory>(e.category, TIME_CATEGORIES, 'ops'),
    start: e.start,
    end: e.end,
    note: optStr(e.note),
    ...timerTags(e),
  });
}

function migrateTimer(v: unknown): ActiveTimer | undefined {
  if (!isObj(v) || !isDateTime(v.startedAt) || !CATEGORY_VALUES.includes(v.category as TimeCategory)) return undefined;
  const box = num(v.timeboxMin);
  return compact({
    category: v.category as TimeCategory,
    startedAt: v.startedAt,
    note: optStr(v.note),
    timeboxMin: box !== undefined && box > 0 ? box : undefined,
    ...timerTags(v),
  });
}

function migrateEscape(e: Obj, now: Date): EscapeCheck {
  const box = num(e.timeboxMin);
  return compact({
    id: idOf(e.id),
    at: dateTime(e.at, now.toISOString()),
    want: str(e.want),
    numberMoves: str(e.numberMoves),
    byWhen: optDate(e.byWhen),
    howKnow: str(e.howKnow),
    betId: optStr(e.betId),
    avoiding: optStr(e.avoiding),
    recommended: optOneOf(e.recommended, ['go', 'park'] as const) ?? 'park',
    verdict: optOneOf(e.verdict, ['go', 'park'] as const) ?? 'park',
    timeboxMin: box !== undefined && box > 0 ? box : undefined,
  });
}

function migrateParked(p: Obj, now: Date): ParkedIdea {
  return compact({ id: idOf(p.id), text: str(p.text), at: dateTime(p.at, now.toISOString()), fromEscapeId: optStr(p.fromEscapeId) });
}

const FUNNEL_NUMBER_KEYS = [
  'reach', 'clicks', 'applied', 'paid', 'finished', 'verifiedTest', 'posts', 'referralApplied',
  'revenueThb', 'costThb', 'founderHours',
] as const;

function migrateFunnel(r: Obj): FunnelRow {
  const row: FunnelRow = {
    id: idOf(r.id),
    label: str(r.label),
    period: optOneOf(r.period, ['cohort', 'week'] as const) ?? 'cohort',
    date: optDate(r.date),
    note: optStr(r.note),
  };
  for (const k of FUNNEL_NUMBER_KEYS) {
    const n = num(r[k]);
    row[k] = n !== undefined && n >= 0 ? n : undefined;
  }
  return compact(row);
}

function migrateTalk(t: Obj, now: Date): Talk {
  return compact({
    id: idOf(t.id),
    date: optDate(t.date) ?? toISODate(now),
    role: oneOf(t.role, TALK_ROLES, 'other'),
    channel: str(t.channel),
    who: optStr(t.who),
    did: str(t.did),
    story: str(t.story),
    opinion: str(t.opinion),
    quote: optStr(t.quote),
    nextStep: optStr(t.nextStep),
    betId: optStr(t.betId),
  });
}

function migrateHeavy(x: Obj, now: Date): HeavyItem {
  return compact({
    id: idOf(x.id),
    title: str(x.title),
    kind: oneOf(x.kind, HEAVY_KINDS, 'other'),
    nextAction: str(x.nextAction),
    deadline: optDate(x.deadline),
    helper: optStr(x.helper),
    status: oneOf(x.status, HEAVY_STATUSES, 'open'),
    notes: str(x.notes),
    updatedAt: dateTime(x.updatedAt, now.toISOString()),
  });
}

function migrateWorry(w: Obj, now: Date): Worry {
  return compact({
    id: idOf(w.id),
    at: dateTime(w.at, now.toISOString()),
    text: str(w.text),
    triage: optOneOf(w.triage, ['action', 'waiting', 'let-go'] as const),
    heavyId: optStr(w.heavyId),
  });
}

function migrateReview(r: Obj, now: Date, maxDecisions: number): WeeklyReview {
  const snapshot: Record<string, number | string | null> = {};
  if (isObj(r.snapshot)) {
    for (const [k, v] of Object.entries(r.snapshot)) {
      if (v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) snapshot[k] = v;
    }
  }
  return {
    id: idOf(r.id),
    weekKey: str(r.weekKey),
    createdAt: dateTime(r.createdAt, now.toISOString()),
    wins: str(r.wins),
    lessons: str(r.lessons),
    betDecisions: newest(r.betDecisions, maxDecisions)
      .filter(isObj)
      .filter((d) => typeof d.betId === 'string' && VERDICTS.some((x) => x.value === d.verdict))
      .map((d) => ({ betId: d.betId as ID, verdict: d.verdict as BetDecision['verdict'], why: str(d.why) })),
    nextAnchor: str(r.nextAnchor),
    snapshot,
  };
}

// Import only: what makes a record worth keeping.
const KEEP = {
  bet: (b: Bet) => filled(b.name, b.hypothesis, b.metric),
  time: (e: TimeEntry) => Date.parse(e.end) > Date.parse(e.start),
  escape: (e: EscapeCheck) => filled(e.want, e.numberMoves, e.howKnow, e.avoiding),
  parked: (p: ParkedIdea) => filled(p.text),
  funnel: (r: FunnelRow) => filled(r.label, r.note) || FUNNEL_NUMBER_KEYS.some((k) => r[k] !== undefined),
  talk: (t: Talk) => filled(t.did, t.story, t.opinion, t.quote, t.nextStep, t.who),
  heavy: (x: HeavyItem) => filled(x.title, x.nextAction),
  worry: (w: Worry) => filled(w.text),
  review: (r: WeeklyReview) => /^\d{4}-W\d{2}$/.test(r.weekKey)
    && (filled(r.wins, r.lessons, r.nextAnchor) || r.betDecisions.length > 0 || Object.keys(r.snapshot).length > 0),
  day: (d: DayEntry) => Boolean(d.anchor?.text.trim() || d.actions.some((a) => a.text.trim()) || d.checkin || d.shutdown),
};

/**
 * Validate and normalise any input into a full AnchorState.
 * Never throws: garbage → empty state; partial → defaults filled; unknown fields dropped.
 * Import / pull only (forImport): collections are capped (COLLECTION_LIMITS, MAX_DAYS, decision limits; the
 * newest are kept) before normalising. Normal saves never cap, so years of records are never trimmed silently.
 */
export function migrate(raw: unknown, now: Date = new Date(), opts: MigrateOptions = {}): AnchorState {
  try {
    return migrateUnsafe(raw, now, opts.forImport === true);
  } catch {
    return emptyState(now);
  }
}

function migrateUnsafe(raw: unknown, now: Date, strict: boolean): AnchorState {
  const base = emptyState(now);
  if (!isObj(raw)) return base;
  const keep = <T>(fn: (m: T) => boolean): ((m: T) => boolean) | false => (strict ? fn : false);
  const cap = (n: number): number => (strict ? n : Infinity);
  const days: Record<ISODate, DayEntry> = {};
  if (isObj(raw.days)) {
    let dayKeys = Object.keys(raw.days).filter((k) => isISODate(k)).sort();
    if (dayKeys.length > cap(MAX_DAYS)) dayKeys = dayKeys.slice(dayKeys.length - MAX_DAYS);
    for (const k of dayKeys) {
      const d = migrateDay(k, raw.days[k]);
      if (d && (!strict || KEEP.day(d))) days[k] = d;
    }
  }
  const lockRaw = isObj(raw.lock) ? raw.lock : {};
  const pinHash = optStr(lockRaw.pinHash), pinSalt = optStr(lockRaw.pinSalt);
  const syncRaw = isObj(raw.sync) ? raw.sync : {};
  return compact({
    schemaVersion: 1 as const,
    createdAt: dateTime(raw.createdAt, base.createdAt),
    updatedAt: dateTime(raw.updatedAt, base.updatedAt),
    profile: migrateProfile(raw.profile),
    days,
    bets: list(raw.bets, cap(COLLECTION_LIMITS.bets), (b) => migrateBet(b, now, cap(MAX_BET_DECISIONS)), keep(KEEP.bet)),
    timeLog: list(raw.timeLog, cap(COLLECTION_LIMITS.timeLog), migrateTimeEntry, keep(KEEP.time)),
    activeTimer: migrateTimer(raw.activeTimer),
    escapes: list(raw.escapes, cap(COLLECTION_LIMITS.escapes), (e) => migrateEscape(e, now), keep(KEEP.escape)),
    parking: list(raw.parking, cap(COLLECTION_LIMITS.parking), (p) => migrateParked(p, now), keep(KEEP.parked)),
    funnel: list(raw.funnel, cap(COLLECTION_LIMITS.funnel), migrateFunnel, keep(KEEP.funnel)),
    talks: list(raw.talks, cap(COLLECTION_LIMITS.talks), (t) => migrateTalk(t, now), keep(KEEP.talk)),
    heavy: list(raw.heavy, cap(COLLECTION_LIMITS.heavy), (x) => migrateHeavy(x, now), keep(KEEP.heavy)),
    worries: list(raw.worries, cap(COLLECTION_LIMITS.worries), (w) => migrateWorry(w, now), keep(KEEP.worry)),
    reviews: list(raw.reviews, cap(COLLECTION_LIMITS.reviews), (r) => migrateReview(r, now, cap(MAX_REVIEW_DECISIONS)), keep(KEEP.review)),
    lock: compact({
      pinHash: pinHash && pinSalt ? pinHash : undefined,
      pinSalt: pinHash && pinSalt ? pinSalt : undefined,
      lockAfterMin: numIn(lockRaw.lockAfterMin, 0, 1440) ?? DEFAULT_LOCK_AFTER_MIN,
    }),
    sync: compact({
      rev: intIn(syncRaw.rev, 0, Number.MAX_SAFE_INTEGER, 0),
      lastSyncedAt: isDateTime(syncRaw.lastSyncedAt) ? syncRaw.lastSyncedAt : undefined,
      syncedUpdatedAt: isDateTime(syncRaw.syncedUpdatedAt) ? syncRaw.syncedUpdatedAt : undefined,
    }),
  });
}

// ===========================================================================
// Pure reducer helpers (use inside update() mutators)
// ===========================================================================

/** Replace the item with the same id, or append it. Mutates `items`; returns `item`. */
export function upsert<T extends { id: ID }>(items: T[], item: T): T {
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) items[i] = item;
  else items.push(item);
  return item;
}

/** Remove the item with this id. Mutates `items`; returns the removed item (or undefined). */
export function removeById<T extends { id: ID }>(items: T[], id: ID): T | undefined {
  const i = items.findIndex((x) => x.id === id);
  return i >= 0 ? items.splice(i, 1)[0] : undefined;
}

export function findById<T extends { id: ID }>(items: readonly T[], id: ID | undefined): T | undefined {
  return id === undefined ? undefined : items.find((x) => x.id === id);
}

/** Read a day (an empty, unsaved entry if none exists). Safe on a read-only snapshot. */
export function getDay(state: AnchorState, date: ISODate): DayEntry {
  return state.days[date] ?? { date, actions: [] };
}

/** Get-or-create a day inside a mutator. */
export function ensureDay(draft: AnchorState, date: ISODate): DayEntry {
  if (!draft.days[date]) draft.days[date] = { date, actions: [] };
  return draft.days[date];
}

/**
 * Note for a stopped timer's entry: the timer's own note plus the answer to "What moved?".
 * joinStopNote('Escape check: X', '3 replies') → 'Escape check: X · Moved: 3 replies'.
 */
export function joinStopNote(timerNote: string | undefined, moved: string | undefined): string | undefined {
  const a = timerNote?.trim() ?? '';
  const b = moved?.trim() ?? '';
  if (a && b) return `${a} · Moved: ${b}`;
  return a || b || undefined;
}

export interface CloseTimerOptions {
  /** When it really stopped (asked after a forgotten timer). Clamped to `now`. */
  end?: Date;
  /** Answer to "What moved?" (optional), added to the entry's note. */
  moved?: string;
}

/**
 * End the running timer inside a mutator. Appends a TimeEntry when it ran ≥ 1 minute.
 * Without an explicit end the block ends `now` — unless the timer is past its cap (see timerCapMs), i.e.
 * probably forgotten: then it logs just its timebox when it had one, and nothing otherwise (the UI asks
 * "When did you stop?" first, see views/timer-stop.ts). The entry keeps the timer's source/overridden tags.
 * Time a logged block already covers is left out (see uncoveredSpans), so a block added by hand over the run
 * never counts twice and Stop doesn't change the week's totals: a block in the middle splits the run in two.
 * Returns the logged entry (the longest piece when split), or null (no timer / under a minute / end before
 * start / forgotten, no box / already covered).
 */
export function closeTimer(draft: AnchorState, now: Date = new Date(), endOrOpts?: Date | CloseTimerOptions): TimeEntry | null {
  const o: CloseTimerOptions = endOrOpts instanceof Date ? { end: endOrOpts } : (endOrOpts ?? {});
  const t = draft.activeTimer;
  if (!t) return null;
  draft.activeTimer = undefined;
  const start = Date.parse(t.startedAt);
  if (Number.isNaN(start)) return null;
  let endMs: number;
  if (o.end && !Number.isNaN(o.end.getTime())) {
    endMs = Math.min(o.end.getTime(), now.getTime());
  } else if (timerOverCap(t, now)) {
    if (!t.timeboxMin) return null;
    endMs = start + t.timeboxMin * 60_000;
  } else {
    endMs = now.getTime();
  }
  if (endMs - start < MIN_TIME_ENTRY_MS) return null;
  const note = joinStopNote(t.note, o.moved);
  const overridden = t.source === 'escape' && t.overridden ? true : undefined;
  let main: TimeEntry | null = null;
  for (const [a, b] of uncoveredSpans(draft.timeLog, start, endMs)) {
    if (b - a < MIN_TIME_ENTRY_MS) continue;
    const entry: TimeEntry = compact({
      id: newId(), category: t.category, start: a === start ? t.startedAt : new Date(a).toISOString(), end: new Date(b).toISOString(),
      note, source: t.source, overridden,
    });
    draft.timeLog.push(entry);
    if (!main || b - a > Date.parse(main.end) - Date.parse(main.start)) main = entry;
  }
  return main;
}

// ===========================================================================
// Runtime store
// ===========================================================================

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}

export type Listener = (state: AnchorState, prev: AnchorState, opts: UpdateOptions) => void;

export interface InitResult {
  state: AnchorState;
  /** Nothing was stored: the seed was written. */
  firstRun: boolean;
  /** Stored data could not be parsed; a backup copy was kept and a fresh seed started. */
  recovered: boolean;
}

const PERSIST_DEBOUNCE_MS = 300;

let current: AnchorState | null = null;
let storage: StorageLike | null = null;
const listeners = new Set<Listener>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let failing = false;
/** The error of the write that started the current failing streak (passed to a handler registered late). */
let lastPersistError: unknown = null;
let persistErrorHandler: ((err: unknown) => void) | null = null;
let externalChangeHandler: ((info: { dropped: boolean }) => void) | null = null;
export interface EraseInfo {
  /** true when another tab (or this tab before it was frozen) erased; false for this tab's own eraseAll(). */
  remote: boolean;
}
const eraseHooks = new Set<(info: EraseInfo) => void>();
let lifecycleBound = false;
/**
 * The exact text this tab last read from or wrote to STORAGE_KEY. If storage holds something else,
 * another tab changed it: adopt that copy instead of overwriting it with this tab's older one.
 */
let lastSeenRaw: string | null = null;
/**
 * Mutators applied since the last successful write, in order. When another tab saved meanwhile, they are
 * re-applied on top of its copy (so an unrelated edit made here inside the debounce is never lost).
 */
interface PendingEdit { mutator: (draft: AnchorState) => void; touch: boolean }
let pending: PendingEdit[] = [];
const MAX_PENDING = 2_000;
/** Pending edits were discarded (too many queued, or the dataset was replaced elsewhere): report it once. */
let pendingLost = false;
/** Bumped whenever this device's dataset is replaced or erased (here or in another tab). */
let generation = 0;
/** The ERASE_EVENT_KEY value this tab last saw (a different one = another tab erased). */
let seenEraseGen: string | null = null;

/** In-memory Storage (tests, or when localStorage is unavailable). */
export function createMemoryStorage(): StorageLike & { dump(): Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    dump: () => Object.fromEntries(m),
  };
}

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

/**
 * Load state from storage (or seed on first run) and bind flush-on-hide listeners.
 * Call once at boot. Tests pass `{ storage: createMemoryStorage() }`.
 */
export function initStore(opts: { storage?: StorageLike | null; now?: Date } = {}): InitResult {
  const now = opts.now ?? new Date();
  storage = opts.storage !== undefined ? opts.storage : defaultStorage();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  dirty = false;
  failing = false;
  lastPersistError = null;
  lastSeenRaw = null;
  pending = [];
  pendingLost = false;
  seenEraseGen = readKey(ERASE_EVENT_KEY);
  let raw: string | null = null;
  try {
    raw = storage ? storage.getItem(STORAGE_KEY) : null;
  } catch {
    raw = null;
  }
  let firstRun = false, recovered = false;
  if (raw === null) {
    current = createSeedState(now);
    firstRun = true;
    dirty = true;
    writeNow(true);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      recovered = true;
      try { storage?.setItem(`${STORAGE_KEY}:corrupt:${now.getTime()}`, raw); } catch { /* best effort */ }
      current = createSeedState(now);
      dirty = true;
      writeNow(true);
    }
    if (!recovered) {
      current = migrate(parsed, now);
      lastSeenRaw = raw;
    }
  }
  bindLifecycle();
  return { state: current as AnchorState, firstRun, recovered };
}

function readKey(key: string): string | null {
  try {
    return storage ? storage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try { storage?.setItem(key, value); } catch { /* best effort: same-tab logic does not depend on it */ }
}

const genToken = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function bindLifecycle(): void {
  if (lifecycleBound) return;
  const doc = (globalThis as { document?: Document }).document;
  const win = (globalThis as { addEventListener?: Window['addEventListener'] });
  if (!doc || typeof win.addEventListener !== 'function') return;
  lifecycleBound = true;
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') flush();
    else catchUpWithStorage();
  });
  win.addEventListener('pagehide', () => flush());
  // Back from the bfcache: storage events were missed while frozen.
  win.addEventListener('pageshow', ((e: PageTransitionEvent) => { if (e.persisted) catchUpWithStorage(); }) as EventListener);
  win.addEventListener('storage', ((e: StorageEvent) => { handleStorageEvent(e.key, e.newValue); }) as EventListener);
}

/**
 * React to a change another tab made to storage. Exported for tests (a real StorageEvent can't be
 * dispatched in Node). key: the changed key; newValue: null when removed.
 */
export function handleStorageEvent(key: string | null, newValue: string | null): void {
  if (newValue === null) return;
  if (key === ERASE_EVENT_KEY) {
    if (newValue !== seenEraseGen) remoteErase(newValue);
    return;
  }
  if (key === DATASET_GEN_KEY) {
    // Imported / pulled elsewhere: in-flight sync work here is stale, and edits queued here belong to the
    // old dataset (they are dropped, and the adopt that follows says so).
    generation++;
    dropPending();
    return;
  }
  if (key === STORAGE_KEY && newValue !== lastSeenRaw) adoptStored(newValue);
}

/** After being hidden or frozen: apply an erase or a save another tab made meanwhile. */
function catchUpWithStorage(): void {
  if (!storage) return;
  const erase = readKey(ERASE_EVENT_KEY);
  if (erase !== null && erase !== seenEraseGen) remoteErase(erase);
  const raw = readKey(STORAGE_KEY);
  if (raw !== null && raw !== lastSeenRaw) adoptStored(raw);
}

function dropPending(): void {
  if (pending.length) pendingLost = true;
  pending = [];
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  dirty = false;
}

/** Another tab erased Anchor: forget queued edits, secrets and drafts here too, then take the fresh copy. */
function remoteErase(token: string): void {
  seenEraseGen = token;
  generation++;
  pending = [];
  pendingLost = false;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  dirty = false;
  runEraseHooks({ remote: true });
  const raw = readKey(STORAGE_KEY);
  if (raw !== null && raw !== lastSeenRaw) adoptStored(raw);
}

function runEraseHooks(info: EraseInfo): void {
  for (const fn of Array.from(eraseHooks)) {
    try { fn(info); } catch (err) { console.error('[anchor] erase hook failed', err); }
  }
}

/**
 * Take a copy another tab stored, then re-apply this tab's edits that were not written yet on top of it
 * and write the result. Returns false (and changes nothing) when that copy can't be parsed.
 * The external-change handler hears `dropped: true` only when an edit could not be kept.
 */
function adoptStored(raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const prev = current ?? emptyState();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  let next = migrate(parsed);
  lastSeenRaw = raw;
  let lost = pendingLost;
  pendingLost = false;
  const replay = pending;
  pending = [];
  for (const p of replay) {
    try {
      const d = structuredClone(next);
      p.mutator(d);
      if (p.touch) d.updatedAt = new Date().toISOString();
      next = migrate(d);
      pending.push(p);
    } catch {
      lost = true;
    }
  }
  current = next;
  dirty = pending.length > 0;
  if (dirty) writeNow();
  notify(current, prev, { force: true });
  externalChangeHandler?.({ dropped: lost });
  return true;
}

/**
 * Changes whenever this device's whole dataset is replaced: import, pull or erase, in this tab or another.
 * Async work (sync push/pull, decrypt) captures it first and must not apply its result when it moved.
 */
export function datasetGeneration(): number {
  return generation;
}

/** Current state (initialises from default storage on first call). Treat as read-only. */
export function getState(): AnchorState {
  if (!current) initStore();
  return current as AnchorState;
}

/**
 * clone → mutate → set updatedAt → validate (migrate) → persist (debounced) → notify.
 * If the mutator throws, nothing changes and the error propagates.
 */
export function update(mutator: (draft: AnchorState) => void, opts: UpdateOptions = {}): AnchorState {
  const prev = getState();
  const draft = structuredClone(prev);
  mutator(draft);
  if (opts.touch !== false) draft.updatedAt = new Date().toISOString();
  const next = migrate(draft);
  current = next;
  pending.push({ mutator, touch: opts.touch !== false });
  if (pending.length > MAX_PENDING) {
    pending.splice(0, pending.length - MAX_PENDING);
    pendingLost = true;
  }
  schedulePersist();
  if (!opts.silent) notify(next, prev, opts);
  return next;
}

/** Replace everything (import / sync pull). `preserve` keeps this device's lock and/or sync meta. */
export function replaceState(next: unknown, opts: { preserve?: ('lock' | 'sync')[] } = {}): AnchorState {
  const prev = getState();
  const s = migrate(next);
  if (opts.preserve?.includes('lock')) s.lock = structuredClone(prev.lock);
  if (opts.preserve?.includes('sync')) s.sync = structuredClone(prev.sync);
  current = s;
  pending = [];
  pendingLost = false;
  generation++;
  // Tell other tabs first (they drop edits queued for the old dataset), then write the new one.
  writeKey(DATASET_GEN_KEY, genToken());
  dirty = true;
  writeNow(true);
  notify(s, prev, { force: true });
  return s;
}

/**
 * Erase every 'anchor:*' key on this device and start again from the first-run seed.
 */
export function eraseAll(now: Date = new Date()): AnchorState {
  const prev = getState();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (storage) {
    const keys: string[] = [];
    try {
      const n = storage.length ?? 0;
      for (let i = 0; i < n; i++) {
        const k = storage.key?.(i);
        if (k && k.startsWith('anchor:')) keys.push(k);
      }
    } catch { /* ignore */ }
    if (!keys.includes(STORAGE_KEY)) keys.push(STORAGE_KEY);
    for (const k of keys) {
      try { storage.removeItem(k); } catch { /* ignore */ }
    }
  }
  lastSeenRaw = null;
  pending = [];
  pendingLost = false;
  generation++;
  // Other tabs hear this first: they drop secrets, drafts, dialogs and queued edits before taking the seed.
  seenEraseGen = genToken();
  writeKey(ERASE_EVENT_KEY, seenEraseGen);
  // Forget in-memory secrets and unsaved text too (sync session, drafts), not just storage.
  runEraseHooks({ remote: false });
  current = createSeedState(now);
  dirty = true;
  writeNow(true);
  notify(current, prev, { force: true });
  return current;
}

/**
 * Run `fn` whenever Anchor is erased: by eraseAll() in this tab (remote false) or in another tab
 * (remote true; this tab then adopts the fresh copy right after). Clear in-memory secrets, drafts, dialogs,
 * undo actions and pending work here. Returns an unsubscribe function.
 */
export function onErase(fn: (info: EraseInfo) => void): () => void {
  eraseHooks.add(fn);
  return () => { eraseHooks.delete(fn); };
}

/** Called after this tab took a newer copy saved by another tab (dropped = local unsaved changes were discarded). */
export function onExternalChange(fn: ((info: { dropped: boolean }) => void) | null): void {
  externalChangeHandler = fn;
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Called when a write fails (e.g. quota, or storage blocked). The in-memory state is kept; the write is
 * retried on the next change. Reported once per failing streak; a handler registered while writes are
 * already failing (e.g. the first-run write in initStore) hears about it right away.
 */
export function onPersistError(fn: ((err: unknown) => void) | null): void {
  persistErrorHandler = fn;
  if (fn && failing) fn(lastPersistError);
}

/** Write pending changes now (bound to visibilitychange→hidden and pagehide). */
export function flush(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (dirty) writeNow();
}

/** True while a change has not been written yet. */
export function hasPendingWrites(): boolean {
  return dirty;
}

function notify(next: AnchorState, prev: AnchorState, opts: UpdateOptions): void {
  for (const fn of Array.from(listeners)) {
    try {
      fn(next, prev, opts);
    } catch (err) {
      console.error('[anchor] listener failed', err);
    }
  }
}

function schedulePersist(): void {
  dirty = true;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    writeNow();
  }, PERSIST_DEBOUNCE_MS);
}

/** Raw text another tab saved since this tab last read/wrote, or null when storage still matches. */
function storedByAnotherTab(): string | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return raw !== null && raw !== lastSeenRaw ? raw : null;
}

/**
 * Persist the in-memory state. Unless `force` (seed, import, pull, erase), first check that no other tab
 * saved since this tab last read/wrote: if one did, adopt its copy instead of overwriting it.
 */
function writeNow(force = false): void {
  if (!current) return;
  if (!force) {
    const theirs = storedByAnotherTab();
    if (theirs !== null && adoptStored(theirs)) return;
  }
  try {
    if (!storage) throw new Error('Storage unavailable');
    const raw = JSON.stringify(current);
    storage.setItem(STORAGE_KEY, raw);
    lastSeenRaw = raw;
    dirty = false;
    failing = false;
    lastPersistError = null;
    pending = [];
    pendingLost = false;
  } catch (err) {
    // Keep in-memory state; report once until a write succeeds again.
    if (!failing) {
      failing = true;
      lastPersistError = err;
      persistErrorHandler?.(err);
    }
  }
}

export interface StartTimerOptions extends TimerTags {
  note?: string;
  timeboxMin?: number;
  /** How to close a timer that is already running (its real end, what moved). Default: now, no note. */
  prev?: CloseTimerOptions;
}

/**
 * Timer: start. A running timer is stopped and logged first (see closeTimer: a forgotten one past its cap is
 * not logged as hours unless `prev.end` says when it ended). Views should call startTimerSafely()
 * (views/timer-stop.ts), which asks "When did you stop?" / "What moved?" first when needed.
 * `source: 'escape'` (+ `overridden`) tags the session as started from an escape check.
 */
export function startTimer(category: TimeCategory, opts: StartTimerOptions = {}): { logged: TimeEntry | null; timer: ActiveTimer } {
  const now = new Date();
  let logged: TimeEntry | null = null;
  const source = opts.source === 'escape' ? 'escape' : undefined;
  const timer: ActiveTimer = compact({
    category,
    startedAt: now.toISOString(),
    note: opts.note?.trim() || undefined,
    timeboxMin: opts.timeboxMin && opts.timeboxMin > 0 ? opts.timeboxMin : undefined,
    source,
    overridden: source && opts.overridden ? true : undefined,
  });
  update((d) => {
    logged = closeTimer(d, now, opts.prev);
    d.activeTimer = structuredClone(timer);
  });
  return { logged, timer };
}

/**
 * Timer: stop. `end` = when it really stopped (for a forgotten timer); `moved` = answer to "What moved?".
 * Returns the logged TimeEntry, or null when nothing ran or it was under a minute (discarded).
 */
export function stopTimer(endOrOpts?: Date | CloseTimerOptions): TimeEntry | null {
  let logged: TimeEntry | null = null;
  const now = new Date();
  update((d) => { logged = closeTimer(d, now, endOrOpts); });
  return logged;
}

/**
 * Give a time-boxed timer more time ("+15 min" on the banner): the box becomes the time already run
 * (rounded up to a minute) plus `minutes`. No-op without a running time-boxed timer.
 */
export function extendTimebox(minutes: number, now: Date = new Date()): void {
  const t = getState().activeTimer;
  if (!t || !t.timeboxMin || !(minutes > 0)) return;
  const ran = Math.ceil(timerElapsedMs(t, now) / 60_000);
  const startedAt = t.startedAt;
  update((d) => {
    if (d.activeTimer && d.activeTimer.startedAt === startedAt && d.activeTimer.timeboxMin) {
      d.activeTimer.timeboxMin = Math.max(d.activeTimer.timeboxMin, ran) + minutes;
    }
  }, { force: true });
}

// ===========================================================================
// Import / pull preparation (pure)
// ===========================================================================

function jsonBytes(v: unknown): number {
  const text = JSON.stringify(v);
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length * 3;
}

export type ImportPrep =
  | { ok: true; state: AnchorState; bytes: number }
  | { ok: false; reason: 'too_large'; bytes: number };

/**
 * Normalise data from a backup file or the sync server BEFORE showing its preview: collections capped,
 * empty records dropped (migrate forImport), and the result refused when it would be over MAX_STATE_BYTES.
 */
export function prepareImport(raw: unknown, now: Date = new Date()): ImportPrep {
  const state = migrate(raw, now, { forImport: true });
  const bytes = jsonBytes(state);
  return bytes > MAX_STATE_BYTES ? { ok: false, reason: 'too_large', bytes } : { ok: true, state, bytes };
}
