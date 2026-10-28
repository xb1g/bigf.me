// Pure helpers for the Heavy screen. No window/document access: runs under Node tests.
import type { AnchorState, HeavyItem, HeavyKind, ID, ISODate, Worry } from '../core/types.ts';
import { daysBetween, formatDate, isISODate } from '../core/dates.ts';

export type HeavyStatus = HeavyItem['status'];
export type WorryTriage = NonNullable<Worry['triage']>;

// ---------------------------------------------------------------------------
// Items: sorting and deadlines
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<HeavyStatus, number> = { open: 0, waiting: 1, done: 2 };

/**
 * Open + waiting items, nearest deadline first. Undated items come after dated ones.
 * Ties: open before waiting, then most recently touched first, then title.
 */
export function sortActiveHeavy(items: readonly HeavyItem[]): HeavyItem[] {
  return items
    .filter((i) => i.status !== 'done')
    .slice()
    .sort((a, b) => {
      const ad = a.deadline && isISODate(a.deadline) ? a.deadline : null;
      const bd = b.deadline && isISODate(b.deadline) ? b.deadline : null;
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
      if (ad && !bd) return -1;
      if (!ad && bd) return 1;
      const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (s !== 0) return s;
      if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
}

/** Done items, most recently finished first. */
export function sortDoneHeavy(items: readonly HeavyItem[]): HeavyItem[] {
  return items
    .filter((i) => i.status === 'done')
    .slice()
    .sort((a, b) => (a.updatedAt === b.updatedAt ? 0 : a.updatedAt > b.updatedAt ? -1 : 1));
}

export type DeadlineState = 'none' | 'overdue' | 'today' | 'soon' | 'later';

export interface DeadlineInfo {
  state: DeadlineState;
  /** Days from today to the deadline (negative = past). null without a deadline. */
  days: number | null;
  /** Short, calm line, e.g. 'Due today', 'Due Fri 30 Oct · in 2 days', 'Was due Mon 26 Oct'. */
  text: string;
}

/** Within this many days a deadline counts as 'soon'. */
export const SOON_DAYS = 3;

export function deadlineInfo(deadline: ISODate | undefined, today: ISODate): DeadlineInfo {
  if (!deadline || !isISODate(deadline) || !isISODate(today)) return { state: 'none', days: null, text: 'No deadline' };
  const days = daysBetween(today, deadline);
  const refYear = Number(today.slice(0, 4));
  const when = formatDate(deadline, refYear);
  if (days < 0) {
    const ago = days === -1 ? 'yesterday' : `${-days} days ago`;
    return { state: 'overdue', days, text: `Was due ${when} · ${ago}` };
  }
  if (days === 0) return { state: 'today', days, text: 'Due today' };
  if (days === 1) return { state: 'soon', days, text: `Due tomorrow · ${when}` };
  if (days <= SOON_DAYS) return { state: 'soon', days, text: `Due ${when} · in ${days} days` };
  return { state: 'later', days, text: `Due ${when} · in ${days} days` };
}

/** The open/waiting item with the nearest deadline (dated first), or null. */
export function nearestHeavy(items: readonly HeavyItem[]): HeavyItem | null {
  return sortActiveHeavy(items)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Item form
// ---------------------------------------------------------------------------

export interface HeavyFormInput {
  title: string;
  kind: HeavyKind | '';
  nextAction: string;
  deadline: string;
  helper: string;
  status: HeavyStatus;
  notes: string;
}

export type HeavyFormErrors = Partial<Record<'title' | 'nextAction' | 'deadline', string>>;

export const HEAVY_ERROR_COPY = {
  title: 'Give it a short name.',
  nextAction: 'What is one thing you can physically do next?',
  deadline: 'Use a full date, or leave it empty.',
} as const;

/** Shown (on Heavy and Today) for an item with no next step yet. Tapping it opens the edit on that field. */
export const NO_NEXT_STEP_COPY = 'No next step yet. Tap to add one: who to message?';

/**
 * Whether a save must have a next step. New items always need one. An existing item that has none yet
 * (e.g. the seeded one) can still be saved without it, so changing a date or a note is never blocked;
 * clearing a step that was there is not allowed.
 */
export function needsNextStep(existing?: Pick<HeavyItem, 'nextAction'> | null): boolean {
  return !existing || existing.nextAction.trim() !== '';
}

export function emptyHeavyForm(partial: Partial<HeavyFormInput> = {}): HeavyFormInput {
  return { title: '', kind: 'other', nextAction: '', deadline: '', helper: '', status: 'open', notes: '', ...partial };
}

export function heavyFormFromItem(item: HeavyItem): HeavyFormInput {
  return {
    title: item.title,
    kind: item.kind,
    nextAction: item.nextAction,
    deadline: item.deadline ?? '',
    helper: item.helper ?? '',
    status: item.status,
    notes: item.notes,
  };
}

export function validateHeavyForm(f: HeavyFormInput, opts: { requireNext?: boolean } = {}): HeavyFormErrors {
  const errors: HeavyFormErrors = {};
  if (!f.title.trim()) errors.title = HEAVY_ERROR_COPY.title;
  if ((opts.requireNext ?? true) && !f.nextAction.trim()) errors.nextAction = HEAVY_ERROR_COPY.nextAction;
  if (f.deadline.trim() && !isISODate(f.deadline.trim())) errors.deadline = HEAVY_ERROR_COPY.deadline;
  return errors;
}

export function hasErrors(e: HeavyFormErrors): boolean {
  return Object.keys(e).length > 0;
}

/** Build a HeavyItem from a (valid) form. Trims text; empty optional fields are dropped. */
export function buildHeavyItem(f: HeavyFormInput, id: ID, updatedAt: string): HeavyItem {
  const item: HeavyItem = {
    id,
    title: f.title.trim(),
    kind: f.kind || 'other',
    nextAction: f.nextAction.trim(),
    status: f.status,
    notes: f.notes.trim(),
    updatedAt,
  };
  const deadline = f.deadline.trim();
  if (deadline && isISODate(deadline)) item.deadline = deadline;
  const helper = f.helper.trim();
  if (helper) item.helper = helper;
  return item;
}

/** First line of a worry, shortened for use as an item title. */
export function titleFromWorry(text: string, max = 80): string {
  const line = text.trim().split(/\r?\n/)[0]?.trim() ?? '';
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Worries
// ---------------------------------------------------------------------------

export interface WorryBuckets {
  /** Not yet triaged, newest first. */
  toSort: Worry[];
  waiting: Worry[];
  letGo: Worry[];
  /** Triaged to an action whose item still exists. */
  actioned: Worry[];
}

const newestFirst = (a: Worry, b: Worry) => (a.at === b.at ? 0 : a.at > b.at ? -1 : 1);

/**
 * Group worries for display. `excludeId` hides the one being typed right now.
 * Empty worries are skipped. An 'action' worry whose item is gone counts as let go.
 */
export function worryBuckets(worries: readonly Worry[], items: readonly HeavyItem[], excludeId?: ID | null): WorryBuckets {
  const ids = new Set(items.map((i) => i.id));
  const out: WorryBuckets = { toSort: [], waiting: [], letGo: [], actioned: [] };
  for (const w of worries) {
    if (w.id === excludeId || !w.text.trim()) continue;
    if (!w.triage) out.toSort.push(w);
    else if (w.triage === 'waiting') out.waiting.push(w);
    else if (w.triage === 'let-go') out.letGo.push(w);
    else if (w.heavyId && ids.has(w.heavyId)) out.actioned.push(w);
    else out.letGo.push(w);
  }
  out.toSort.sort(newestFirst);
  out.waiting.sort(newestFirst);
  out.letGo.sort(newestFirst);
  out.actioned.sort(newestFirst);
  return out;
}

export function linkedWorries(worries: readonly Worry[], heavyId: ID): Worry[] {
  return worries.filter((w) => w.triage === 'action' && w.heavyId === heavyId && w.text.trim()).sort(newestFirst);
}

export interface LinkedPreview {
  /** 'From your worry' · 'From 3 worries'. */
  label: string;
  /** Newest first, trimmed. */
  texts: string[];
  /** Linked worries not shown on the card (all of them are in the edit sheet). */
  more: number;
}

/** What an item card shows of the worries it came from (null when none). */
export function linkedPreview(worries: readonly Worry[], heavyId: ID, max = 2): LinkedPreview | null {
  const list = linkedWorries(worries, heavyId);
  if (!list.length) return null;
  const shown = list.slice(0, Math.max(1, max));
  return {
    label: list.length === 1 ? 'From your worry' : `From ${list.length} worries`,
    texts: shown.map((w) => w.text.trim()),
    more: list.length - shown.length,
  };
}

// ---------------------------------------------------------------------------
// Mutators (run inside ctx.update; they mutate the draft)
// ---------------------------------------------------------------------------

/**
 * The worry dump's Save. Adds one untriaged worry. Idempotent per id (a replayed edit never adds it twice).
 * Returns false for blank text.
 */
export function addWorry(draft: AnchorState, w: { id: ID; at: string; text: string }): boolean {
  if (!w.text.trim()) return false;
  if (!draft.worries.some((x) => x.id === w.id)) draft.worries.push({ id: w.id, at: w.at, text: w.text });
  return true;
}

/** Mark a worry as waiting / let go / back to unsorted (triage undefined). Clears any item link. */
export function setWorryTriage(draft: AnchorState, id: ID, triage: Exclude<WorryTriage, 'action'> | undefined): boolean {
  const w = draft.worries.find((x) => x.id === id);
  if (!w) return false;
  if (triage) w.triage = triage;
  else delete w.triage;
  delete w.heavyId;
  return true;
}

/** Link a worry to a Heavy item (the 'Make it an action' triage). */
export function linkWorryToItem(draft: AnchorState, worryId: ID, heavyId: ID): boolean {
  const w = draft.worries.find((x) => x.id === worryId);
  if (!w || !draft.heavy.some((i) => i.id === heavyId)) return false;
  w.triage = 'action';
  w.heavyId = heavyId;
  return true;
}

export type LinkResult = 'linked' | 'linked-step' | 'no-worry' | 'no-item';

/**
 * 'Make it an action' → part of an existing item, in one step: link the worry and, when a next step was
 * typed and differs, make it the item's next step (touching updatedAt). An empty step keeps the item's own.
 */
export function linkWorryWithStep(draft: AnchorState, worryId: ID, heavyId: ID, nextAction: string, at: string): LinkResult {
  const item = draft.heavy.find((i) => i.id === heavyId);
  if (!item) return 'no-item';
  if (!linkWorryToItem(draft, worryId, heavyId)) return 'no-worry';
  const next = nextAction.trim();
  if (!next || next === item.nextAction.trim()) return 'linked';
  item.nextAction = next;
  item.updatedAt = at;
  return 'linked-step';
}

/** Restore a worry's triage exactly (used by Undo). */
export function restoreWorry(draft: AnchorState, snapshot: Worry): void {
  const w = draft.worries.find((x) => x.id === snapshot.id);
  if (!w) {
    draft.worries.push({ ...snapshot });
    return;
  }
  if (snapshot.triage) w.triage = snapshot.triage;
  else delete w.triage;
  if (snapshot.heavyId) w.heavyId = snapshot.heavyId;
  else delete w.heavyId;
}

export function deleteWorry(draft: AnchorState, id: ID): Worry | undefined {
  const idx = draft.worries.findIndex((w) => w.id === id);
  return idx >= 0 ? draft.worries.splice(idx, 1)[0] : undefined;
}

/** Change an item's status and touch updatedAt. */
export function setHeavyStatus(draft: AnchorState, id: ID, status: HeavyStatus, at: string): boolean {
  const item = draft.heavy.find((i) => i.id === id);
  if (!item) return false;
  item.status = status;
  item.updatedAt = at;
  return true;
}

/** Delete an item. Worries linked to it move to the archive (let go). Returns the removed item. */
export function deleteHeavyItem(draft: AnchorState, id: ID): HeavyItem | undefined {
  const idx = draft.heavy.findIndex((i) => i.id === id);
  if (idx < 0) return undefined;
  const [removed] = draft.heavy.splice(idx, 1);
  for (const w of draft.worries) {
    if (w.heavyId === id) {
      w.triage = 'let-go';
      delete w.heavyId;
    }
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Reset: box breathing 4-4-4-4, exactly two minutes
// ---------------------------------------------------------------------------

export const BREATH_PHASE_SEC = 4;
export const BREATH_PHASES = [
  { key: 'in', label: 'Breathe in' },
  { key: 'hold-in', label: 'Hold' },
  { key: 'out', label: 'Breathe out' },
  { key: 'hold-out', label: 'Hold' },
] as const;
/** Before the first round: settle, then empty the lungs, so round 1 starts on a full breath in. */
export const BREATH_LEAD_IN = [
  { key: 'settle', label: 'Get comfy' },
  { key: 'empty', label: 'Breathe out' },
] as const;
export type BreathPhaseKey = (typeof BREATH_PHASES)[number]['key'];
export type BreathStepKey = BreathPhaseKey | (typeof BREATH_LEAD_IN)[number]['key'];

/** 8 s lead-in + 7 rounds of 16 s = 120 s: the countdown starts at 2:00 and ends at 0:00. */
export const BREATH_ROUNDS = 7;
export const RESET_TOTAL_SEC = (BREATH_LEAD_IN.length + BREATH_ROUNDS * BREATH_PHASES.length) * BREATH_PHASE_SEC;

export interface BreathState {
  done: boolean;
  /** 0-based step since the start, lead-in included (0 … lead-in + rounds*4 - 1). */
  step: number;
  /** 0..3 within the round; -1 during the lead-in. */
  phase: number;
  key: BreathStepKey;
  label: string;
  /** Seconds left in this step, counting down 4 → 1 (0 once done). */
  count: number;
  /** 1-based round number; 0 during the lead-in. */
  round: number;
  rounds: number;
  /** Whole seconds left in the session (rounded up, so it reads 2:00 at the start and 0:00 only at the end). */
  remainingSec: number;
  leadIn: boolean;
}

export function breathAt(elapsedMs: number, rounds = BREATH_ROUNDS, phaseSec = BREATH_PHASE_SEC): BreathState {
  const lead = BREATH_LEAD_IN.length;
  const phases = BREATH_PHASES.length;
  const steps = lead + rounds * phases;
  const stepMs = phaseSec * 1000;
  const totalMs = steps * stepMs;
  const ms = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  if (ms >= totalMs) {
    const last = BREATH_PHASES[phases - 1];
    return {
      done: true, step: steps - 1, phase: phases - 1, key: last.key, label: last.label, count: 0,
      round: rounds, rounds, remainingSec: 0, leadIn: false,
    };
  }
  const step = Math.floor(ms / stepMs);
  const count = phaseSec - Math.floor((ms - step * stepMs) / 1000);
  const remainingSec = Math.ceil((totalMs - ms) / 1000);
  if (step < lead) {
    const p = BREATH_LEAD_IN[step];
    return { done: false, step, phase: -1, key: p.key, label: p.label, count, round: 0, rounds, remainingSec, leadIn: true };
  }
  const k = step - lead;
  const phase = k % phases;
  const p = BREATH_PHASES[phase];
  return {
    done: false, step, phase, key: p.key, label: p.label, count,
    round: Math.floor(k / phases) + 1, rounds, remainingSec, leadIn: false,
  };
}

/** Where the guide dot sits at the END of a step, as fractions of the square (x, y from top-left). */
export function breathDotTarget(key: BreathStepKey): { x: 0 | 1; y: 0 | 1 } {
  switch (key) {
    case 'in': return { x: 0, y: 0 };       // up the left side
    case 'hold-in': return { x: 1, y: 0 };  // across the top
    case 'out': return { x: 1, y: 1 };      // down the right side
    case 'hold-out': return { x: 0, y: 1 }; // back along the bottom
    default: return { x: 0, y: 1 };         // lead-in: waits at the start corner
  }
}

/** Smallest scale of the soft inner circle (lungs empty). The label is sized to fit this. */
export const BREATH_SCALE_MIN = 0.66;

/** Scale of the soft inner circle at the END of a step. */
export function breathScale(key: BreathStepKey): number {
  if (key === 'in' || key === 'hold-in') return 1;
  if (key === 'settle') return 0.8;
  return BREATH_SCALE_MIN;
}

/** Guide square (px) and the inner circle's inset on each side (fraction of the square). */
export const BREATH_SQUARE_PX = 200;
export const BREATH_ORB_INSET = 0.1;
/** Label box inside the circle: width (px) and the height of label (2 lines max) + count. */
export const BREATH_LABEL_PX = 84;
export const BREATH_LABEL_BLOCK_PX = 56;

/** Diameter (px) of the inner circle at `scale`. */
export function breathOrbPx(scale: number, square = BREATH_SQUARE_PX): number {
  return square * (1 - 2 * BREATH_ORB_INSET) * scale;
}

/** Widest centred box (px) that stays inside a circle of `diameter` when the box is `height` px tall. */
export function widthInCircle(diameter: number, height: number): number {
  const r = diameter / 2;
  const half = height / 2;
  return half >= r ? 0 : 2 * Math.sqrt(r * r - half * half);
}

/** 'm:ss' for the remaining time. */
export function formatRemaining(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
