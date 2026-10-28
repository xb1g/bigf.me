// Anchor data model (spec v1). Types only: safe to import anywhere with `import type`.

export type ISODate = string;            // 'YYYY-MM-DD' in Asia/Bangkok
export type ID = string;                 // crypto.randomUUID()
export type TimeCategory = 'build' | 'sell' | 'ops' | 'teach' | 'rest' | 'escape';
export type BetStatus = 'active' | 'parked' | 'killed' | 'won';
export type Verdict = 'continue' | 'change' | 'park' | 'kill';

export interface DayEntry {
  date: ISODate;
  anchor?: { text: string; metric?: string; byWhen?: string; betId?: ID; done: boolean };
  /** Max 3. `forAnchor`: a step toward the day's anchor (Today counts these on the anchor card). */
  actions: { id: ID; text: string; done: boolean; forAnchor?: true }[];
  checkin?: { sleepHours?: number; energy?: 1|2|3|4|5; mood?: 1|2|3|4|5; note?: string };
  shutdown?: { win?: string; lesson?: string; tomorrow?: string };
}
/** Where a timed session came from. 'escape' = started from an escape check's Go. */
export type TimerSource = 'escape';
/** Escape-check tags shared by a running timer and the entry it becomes. */
export interface TimerTags {
  /** 'escape' when the session was started from an escape check. */
  source?: TimerSource;
  /** true when that escape check recommended Park and Go was chosen anyway. Only set with source 'escape'. */
  overridden?: boolean;
}
export interface TimeEntry extends TimerTags { id: ID; category: TimeCategory; start: string; end: string; note?: string }   // ISO datetimes
export interface ActiveTimer extends TimerTags { category: TimeCategory; startedAt: string; note?: string; timeboxMin?: number }
export interface BetDecision { date: ISODate; verdict: Verdict; why: string }
export interface Bet {
  id: ID; name: string; hypothesis: string; metric: string; continueIf: string; killIf: string;
  reviewOn: ISODate; status: BetStatus; notes: string; createdAt: string; decisions: BetDecision[];
}
export interface EscapeCheck {
  id: ID; at: string; want: string; numberMoves: string; byWhen?: ISODate; howKnow: string;
  betId?: ID; avoiding?: string; recommended: 'go' | 'park'; verdict: 'go' | 'park'; timeboxMin?: number;
}
export interface ParkedIdea { id: ID; text: string; at: string; fromEscapeId?: ID }
export interface FunnelRow {
  id: ID; label: string; period: 'cohort' | 'week'; date?: ISODate;
  reach?: number; clicks?: number; applied?: number; paid?: number; finished?: number;
  verifiedTest?: number; posts?: number; referralApplied?: number;
  revenueThb?: number; costThb?: number; founderHours?: number; note?: string;
}
export type TalkRole = 'parent'|'teacher'|'student'|'alum'|'school'|'sponsor'|'partner'|'other';
export interface Talk {
  id: ID; date: ISODate; role: TalkRole; channel: string; who?: string;
  did: string; story: string; opinion: string; quote?: string; nextStep?: string; betId?: ID;
}
export type HeavyKind = 'legal'|'money'|'family'|'health'|'work'|'other';
export interface HeavyItem {
  /** nextAction may be '' (no next step yet): views prompt for one. */
  id: ID; title: string; kind: HeavyKind; nextAction: string; deadline?: ISODate; helper?: string;
  status: 'open' | 'waiting' | 'done'; notes: string; updatedAt: string;
}
export interface Worry { id: ID; at: string; text: string; triage?: 'action' | 'waiting' | 'let-go'; heavyId?: ID }
export interface WeeklyReview {
  id: ID; weekKey: string; createdAt: string; wins: string; lessons: string;
  betDecisions: { betId: ID; verdict: Verdict; why: string }[]; nextAnchor: string;
  snapshot: Record<string, number | string | null>;
}
export interface Profile { name: string; weeklyTalkTarget: number; buildSellTarget: number; maxActiveBets: number }
export interface LockSettings { pinHash?: string; pinSalt?: string; lockAfterMin: number }
export interface SyncMeta {
  rev: number; lastSyncedAt?: string;
  /** The state's updatedAt that the last push/pull matched. updatedAt ≠ this → unsynced changes. */
  syncedUpdatedAt?: string;
}
export interface AnchorState {
  schemaVersion: 1; createdAt: string; updatedAt: string;
  profile: Profile; days: Record<ISODate, DayEntry>; bets: Bet[];
  timeLog: TimeEntry[]; activeTimer?: ActiveTimer;
  escapes: EscapeCheck[]; parking: ParkedIdea[]; funnel: FunnelRow[]; talks: Talk[];
  heavy: HeavyItem[]; worries: Worry[]; reviews: WeeklyReview[];
  lock: LockSettings; sync: SyncMeta;
}

// ---------------------------------------------------------------------------
// App-level types (not persisted)
// ---------------------------------------------------------------------------

export type RouteName =
  | 'today' | 'escape' | 'bets' | 'funnel' | 'talks'
  | 'heavy' | 'time' | 'review' | 'settings' | 'more';

export interface Route {
  name: RouteName;
  /** Query params after the hash path, e.g. `#/bets?id=abc` → `{ id: 'abc' }`. */
  params: Record<string, string>;
}

export interface UpdateOptions {
  /** Persist but do NOT notify subscribers (no re-render). Use for keystroke-level saves. */
  silent?: boolean;
  /** Re-render the view on the next frame even if a text field in the view has focus. Use after form submits. */
  force?: boolean;
  /** false = keep updatedAt as it was (bookkeeping writes such as sync status, not user changes). Default true. */
  touch?: boolean;
}

export interface ViewContext {
  /** Snapshot of the current state. Read-only: never mutate; use `ctx.update`. */
  state: AnchorState;
  /**
   * Today in Asia/Bangkok ('YYYY-MM-DD') when this render started. Fine for display; inside event handlers
   * (which may run after midnight) use `freshToday()` or the date pinned on the draft.
   */
  today: ISODate;
  /** Today in Asia/Bangkok right now (call it inside handlers: save, check-in, actions, review). */
  freshToday: () => ISODate;
  /** The moment this render started. */
  now: Date;
  route: Route;
  /** store.update — clone → mutate → validate → persist → notify. Returns the new state. */
  update: (mutator: (draft: AnchorState) => void, opts?: UpdateOptions) => AnchorState;
  /** Go to another route: `ctx.navigate('bets', { id })`. */
  navigate: (name: RouteName, params?: Record<string, string>) => void;
  /**
   * Swap this route's query params in the URL without a new history entry and without re-rendering
   * (later renders see them in `route.params`). No-op once another route is showing.
   */
  replaceParams: (params: Record<string, string>) => void;
  /** Re-render the current view now (use after changing view-local state such as drafts or steps). */
  rerender: () => void;
  /**
   * Per-view in-memory object that survives re-renders and route changes (not persisted).
   * Same key → same object. Keys are namespaced per view automatically.
   */
  draft: <T extends object>(key: string, init: () => T) => T;
  /**
   * A draft tied to a day. It is created for `today` and keeps that date (`draft.date`) across midnight and
   * the 04:00 shutdown switch while it is dirty, so typed text is never swapped for an empty form. A clean
   * draft (dirty falsy) whose date is no longer today is re-initialised for the new day. Set `dirty = true`
   * on input; save to `draft.date`; call `clearDraft(key)` on Save/Cancel. `today` defaults to ctx.today
   * (pass e.g. the shutdown day instead).
   */
  pinnedDraft: <T extends PinnedDraft>(key: string, init: (date: ISODate) => T, today?: ISODate) => T;
  /** Forget a draft so the next `draft(key, init)` call re-initialises it. */
  clearDraft: (key: string) => void;
  /** Show the PIN lock screen immediately (no-op when no PIN is set). */
  lockNow: () => void;
}

/** Shape required by ctx.pinnedDraft. */
export interface PinnedDraft { date: ISODate; dirty?: boolean }

export interface ViewModule {
  render: (ctx: ViewContext) => HTMLElement;
  /** Called before every re-render of this view and when leaving its route. */
  cleanup?: () => void;
}
