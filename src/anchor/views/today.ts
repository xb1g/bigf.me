import type { DayEntry, PinnedDraft, TimeCategory, ViewContext } from '../core/types.ts';
import { cx, h, isTextEntry } from '../core/dom.ts';
import { href } from '../core/router.ts';
import { datasetGeneration, ensureDay, getDay, getState, newId, onErase, removeById } from '../core/store.ts';
import { formatPercent } from '../core/metrics.ts';
import { addDays, daysBetween, formatDate } from '../core/dates.ts';
import { MAX_ACTIONS, TIME_CATEGORIES, labelOf } from '../core/constants.ts';
import {
  badge, button, card, checkboxRow, chips, confirmDialog, disclosure, form, icon, iconButton, linkButton, listRow,
  liveElapsed, selectField, splitBar, stat, textField, toast,
} from '../core/ui.ts';
import {
  ANCHOR_LAST_STEP_COPY, ANCHOR_MOVED_COPY, ANCHOR_NUDGE_MIN, ANCHOR_OPEN_COPY, ANCHOR_PROMPT, ANCHOR_REQUIRED_COPY,
  ANCHOR_SET_COPY, ANCHOR_UPDATED_COPY, CARRY_DISMISSED_KEY, CHECKIN_QUESTIONS, CHECKIN_SUBTITLE, INTRO_DISMISSED_KEY,
  INTRO_LINES, LIMIT_COPY, LOW_ENERGY_COPY, LOW_ENERGY_EMPTY_HINT, SCALE_LEGEND, SHUTDOWN_CARRY_HINT, SLEEP_OPTIONS,
  actionsFull, actionsLeft, anchorBetOptions, anchorInputFrom, anchorMeta, anchorMovedToTomorrow, anchorStatus,
  anchorStepsText, anchorStillOpen, anchorTimerNote, applyShutdown, buildAnchor, carriesAnchorStep, carryAction,
  carryOverCandidates,
  checkNewAction, checkinComplete, checkinPill, checkinSummary, chipToSleep, dayPhase, finishesAnchorSteps, hasShutdown,
  heavyNudge, heavyNudgeAsksStep, heavyNudgeMeta, lastNightLesson,
  lowEnergy, moveAnchorToTomorrow, openAnchorForTomorrow, msUntilAnchorDeadline, parseScale, pinnedWriteDate, primaryAction, scaleOptions,
  scaleToChip, showCarryOver, showShutdown, shutdownDay, shutdownDefaults, sleepToChip, swapAction, swapChoices,
  todaySections, tomorrowAnchorConflict, weekAnchorSuggestion, weekStrip,
} from './today.logic.ts';
import type { ActionItem, AnchorInput, CarryOver, CheckinQuestion, DayPhase, ShutdownInput } from './today.logic.ts';
import { startTimerSafely, stopRunningTimer } from './timer-stop.ts';
import { stopMessage } from './time.logic.ts';

/** The anchor form keeps its day while he is typing (see ctx.pinnedDraft). */
interface AnchorDraft extends AnchorInput, PinnedDraft {
  editing: boolean; error: string;
  /** The text came from last week's review (an offer, not saved yet). */
  suggested: boolean;
}
/** `date` is the day the shutdown closes (yesterday before 04:00, see shutdownDay). */
interface ShutdownDraft extends Required<ShutdownInput>, PinnedDraft { openedEarly: boolean; editing: boolean; moreOpen: boolean }
/**
 * open: the full three-row form ("Change", or any time in the evening). Otherwise an unfinished check-in is one
 * compact row of pills; `active` is the question whose chips are showing under it.
 */
interface CheckinDraft extends PinnedDraft { open: boolean; noteOpen: boolean; active: CheckinQuestion | null }
/** forAnchor: the "Toward the anchor" toggle on the add form (applies to the next action added). */
interface ActionDraft { text: string; swapping: boolean; forAnchor: boolean }

// ---------------------------------------------------------------------------
// Module state: one timer that re-renders when today's anchor reaches its deadline.
// ---------------------------------------------------------------------------

let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

export function cleanup(): void {
  if (deadlineTimer) clearTimeout(deadlineTimer);
  deadlineTimer = null;
}

onErase(() => cleanup());

function scheduleDeadline(ctx: ViewContext): void {
  const ms = msUntilAnchorDeadline(getDay(ctx.state, ctx.today), ctx.today, ctx.now);
  if (ms === null || ms > 2 ** 31 - 1) return;
  const fire = (): void => {
    deadlineTimer = null;
    // Never pull the screen out from under typing; look again a little later.
    if (isTextEntry(document.activeElement)) { deadlineTimer = setTimeout(fire, 30_000); return; }
    ctx.rerender();
  };
  deadlineTimer = setTimeout(fire, ms + 1000);
}

// Device-local flags (the intro card, the carry-over answer). Best effort: private mode may refuse storage.
function readLocal(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}
function writeLocal(key: string, value: string): void {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx: ViewContext): HTMLElement {
  cleanup();
  const { state, today, now } = ctx;
  const phase = dayPhase(now);

  const ad = ctx.pinnedDraft<AnchorDraft>('anchor', (date) => ({
    date, dirty: false, ...anchorInputFrom(getDay(state, date)), editing: false, error: '', suggested: false,
  }));
  const aDay = getDay(state, ad.date);
  const aEmpty = anchorStatus(aDay) === 'empty';
  if (!ad.dirty) {
    // A clean form follows the saved anchor; an empty one offers last week's "next week's anchor".
    Object.assign(ad, anchorInputFrom(aDay));
    const suggestion = aEmpty ? weekAnchorSuggestion(state, ad.date) : null;
    ad.suggested = Boolean(suggestion);
    if (suggestion) ad.text = suggestion;
  }
  const anchorEditing = aEmpty || ad.editing;

  const sDate = shutdownDay(now, today);
  const sd = ctx.pinnedDraft<ShutdownDraft>('shutdown', (date) => ({
    date, dirty: false, ...shutdownDefaults(state, date), openedEarly: false, editing: !hasShutdown(getDay(state, date)),
    moreOpen: false,
  }), sDate);
  if (!sd.dirty) Object.assign(sd, shutdownDefaults(state, sd.date));
  const sDay = getDay(state, sd.date);
  // Unsaved lines from an earlier evening stay on screen (with Save/Discard) instead of hiding in memory.
  const shutdownVisible = showShutdown({ now, openedEarly: sd.openedEarly, day: sDay }) || Boolean(sd.dirty && sd.date !== sDate);

  const ck = ctx.pinnedDraft<CheckinDraft>('checkin', (date) => ({
    date, dirty: false, open: false, noteOpen: false, active: null,
  }));

  const carry = carryOverCandidates(state, today);
  const sections = todaySections(phase, {
    intro: readLocal(INTRO_DISMISSED_KEY) === null,
    carry: showCarryOver(carry, phase, readLocal(CARRY_DISMISSED_KEY)),
  });
  const primary = primaryAction({ anchorEditing, shutdownEditing: shutdownVisible && sd.editing, phase });
  const todayDay = getDay(state, today);

  scheduleDeadline(ctx);

  return h('div', { class: 'view today', 'data-phase': phase },
    sections.map((s) => {
      switch (s) {
        case 'intro': return introCard(ctx);
        case 'anchor': return anchorCard(ctx, ad, aDay, anchorEditing, primary === 'anchor');
        case 'checkin': return checkinCard(ctx, ck, phase);
        case 'carry': return carry ? carryCard(ctx, carry) : null;
        case 'actions': return actionsCard(ctx, todayDay);
        case 'timer': return timerCard(ctx);
        case 'escape': return escapeEntry();
        case 'week': return weekCard(ctx);
        case 'heavy': return heavyCard(ctx);
        case 'shutdown': return shutdownCard(ctx, sd, sDay, shutdownVisible, primary === 'shutdown', phase);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// First-run card
// ---------------------------------------------------------------------------

function introCard(ctx: ViewContext): HTMLElement {
  return card({ title: 'Start here', titleLevel: 2, variant: 'raised', class: 'today-intro', key: 'today-intro' },
    h('ul', { class: 'stack-sm today-intro__list', role: 'list' }, INTRO_LINES.map((line) => h('li', null, line))),
    h('div', { class: 'row-between' },
      linkButton('How it works', href('more', { section: 'how' }), { variant: 'ghost', size: 'sm', key: 'today-intro-more' }),
      button('Got it', {
        variant: 'secondary', size: 'sm', icon: 'check', key: 'today-intro-dismiss',
        onClick: () => { writeLocal(INTRO_DISMISSED_KEY, new Date().toISOString()); ctx.rerender(); },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Check-in (compact)
// ---------------------------------------------------------------------------

function checkinCard(ctx: ViewContext, ck: CheckinDraft, phase: DayPhase): HTMLElement {
  const day = getDay(ctx.state, ck.date);
  const c = day.checkin ?? {};
  const complete = checkinComplete(day);
  const setCheckin = (fn: (c: NonNullable<DayEntry['checkin']>) => void, silent = false) => {
    const date = pinnedWriteDate(ck, ctx.freshToday());
    ctx.update((d) => {
      const dd = ensureDay(d, date);
      const next = { ...(dd.checkin ?? {}) };
      fn(next);
      if (Object.keys(next).length) dd.checkin = next;
      else delete dd.checkin;
    }, { silent });
  };
  // One chip row per question (the full form shows all three; the compact row shows the one tapped).
  const questionChips = (q: CheckinQuestion, onPicked?: () => void): HTMLElement => {
    const picked = (fn: (x: NonNullable<DayEntry['checkin']>) => void) => { onPicked?.(); setCheckin(fn); };
    if (q === 'sleep') {
      return chips({
        id: 'today-sleep', label: 'Sleep (hours)', size: 'sm', class: 'today-checkin__chips',
        value: sleepToChip(c.sleepHours), options: SLEEP_OPTIONS,
        onChange: (v) => picked((x) => { const n = chipToSleep(v); if (n !== undefined) x.sleepHours = n; }),
        onClear: () => picked((x) => { delete x.sleepHours; }),
      });
    }
    const name = q === 'energy' ? 'Energy' : 'Mood';
    return chips({
      id: `today-${q}`, label: name, size: 'sm', class: 'today-checkin__chips',
      value: scaleToChip(c[q]), options: scaleOptions(name),
      onChange: (v) => picked((x) => { const n = parseScale(v); if (n) x[q] = n; }),
      onClear: () => picked((x) => { delete x[q]; }),
    });
  };

  if (!ck.open && complete) {
    return card({
      title: 'Check-in', titleLevel: 2, variant: 'flat', class: 'today-checkin',
      action: button('Change', { variant: 'ghost', key: 'today-checkin-change', onClick: () => { ck.open = true; ck.active = null; ctx.rerender(); } }),
    },
    h('p', { class: 'muted tnum' }, checkinSummary(c)),
    c.note ? h('p', { class: 'small prewrap' }, c.note) : null,
    );
  }

  // Morning and day: an unfinished check-in is one compact row, so the anchor and actions stay in view.
  if (!ck.open && phase !== 'evening') {
    const active = ck.active;
    const toggle = (q: CheckinQuestion) => { ck.active = ck.active === q ? null : q; ctx.rerender(); };
    return card({ title: 'Check-in', titleLevel: 2, variant: 'flat', class: 'today-checkin today-checkin--compact', key: 'today-checkin' },
      h('div', { class: 'today-checkin__pills', role: 'group', 'aria-label': CHECKIN_SUBTITLE },
        CHECKIN_QUESTIONS.map((q) => {
          const p = checkinPill(c, q);
          return h('button', {
            type: 'button', class: cx('chip today-checkin__pill', p.answered && 'is-answered'), key: `today-checkin-pill-${q}`,
            'aria-label': p.ariaLabel, 'aria-expanded': active === q ? 'true' : 'false',
            'aria-controls': active === q ? 'today-checkin-panel' : undefined,
            onClick: () => toggle(q),
          }, p.label);
        })),
      active
        ? h('div', { class: 'stack-sm', id: 'today-checkin-panel' },
            questionChips(active, () => {
              ck.active = null;
              // Back to the pill just answered (the chip that had focus goes away with the panel).
              requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-key="today-checkin-pill-${active}"]`)?.focus());
            }),
            active === 'sleep' ? null : h('p', { class: 'tiny muted' }, SCALE_LEGEND))
        : null,
    );
  }

  const showNote = ck.noteOpen || Boolean(c.note);
  return card({
    title: 'Check-in', titleLevel: 2, subtitle: CHECKIN_SUBTITLE, class: 'today-checkin',
    action: complete || ck.open
      ? button('Done', { variant: 'ghost', key: 'today-checkin-done', onClick: () => { ck.open = false; ck.noteOpen = false; ctx.rerender(); } })
      : null,
  },
  h('div', { class: 'today-checkin__rows' }, CHECKIN_QUESTIONS.map((q) => questionChips(q))),
  h('p', { class: 'tiny muted' }, SCALE_LEGEND),
  showNote
    ? textField({
        id: 'today-checkin-note', label: 'Note', optional: true, value: c.note ?? '',
        placeholder: 'Anything on your mind', enterkeyhint: 'done', maxLength: 500,
        onInput: (v) => {
          ck.dirty = true;
          setCheckin((x) => { if (v.trim()) x.note = v; else delete x.note; }, true);
        },
        onChange: () => { ck.dirty = false; },
        onEnter: (_v, ev) => (ev.target as HTMLInputElement).blur(),
      })
    : h('div', null,
        button('Add a note', {
          variant: 'ghost', size: 'sm', icon: 'plus', key: 'today-checkin-add-note',
          onClick: () => {
            ck.noteOpen = true;
            ctx.rerender();
            requestAnimationFrame(() => document.getElementById('today-checkin-note')?.focus());
          },
        })),
  );
}

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

function anchorCard(ctx: ViewContext, d: AnchorDraft, day: DayEntry, editing: boolean, isPrimary: boolean): HTMLElement {
  const { state } = ctx;
  const status = anchorStatus(day);
  const date = d.date;
  const lesson = lastNightLesson(state, date);
  const lessonLine = lesson
    ? h('p', { class: 'small muted prewrap today-lesson' }, h('span', { class: 'strong' }, 'Last night’s lesson: '), lesson)
    : null;
  const forOtherDay = date !== ctx.today ? h('p', { class: 'small muted' }, `For ${formatDate(date)}.`) : null;

  const startEdit = (focus = false) => {
    Object.assign(d, anchorInputFrom(getDay(getState(), date)), { editing: true, error: '', dirty: false });
    ctx.rerender();
    if (focus) requestAnimationFrame(() => document.getElementById('today-anchor-text')?.focus());
  };

  if (!editing && day.anchor) {
    const a = day.anchor;
    const meta = anchorMeta(a, state.bets);
    const open = anchorStillOpen(day, ctx.today, ctx.now);
    const moved = status === 'set' && anchorMovedToTomorrow(state, date);
    const steps = anchorStepsText(day);
    return card({
      title: 'Today’s anchor', titleLevel: 2, tone: status === 'done' ? 'good' : 'accent', variant: 'raised',
      action: h('div', { class: 'row' },
        status === 'done' ? badge('Done', 'good', { icon: 'check' }) : null,
        iconButton('edit', 'Edit anchor', { key: 'today-anchor-edit', onClick: () => startEdit() })),
    },
    forOtherDay,
    checkboxRow({
      id: 'today-anchor-done', label: a.text, checked: a.done, strike: true,
      hint: meta || 'Which number does it move? Tap edit to add it.',
      onChange: (checked) => {
        ctx.update((dr) => { const an = ensureDay(dr, date).anchor; if (an) an.done = checked; });
        if (checked) toast('Done. That’s the one thing.', { tone: 'good' });
      },
    }),
    steps ? h('p', { class: 'small muted today-step-mark', key: 'today-anchor-steps' }, icon('anchor', { size: 14 }), steps) : null,
    moved
      ? h('p', { class: 'small muted' }, ANCHOR_MOVED_COPY)
      : status === 'set' && open
        ? anchorOpenNudge(ctx, a.text, date)
        : status === 'set' && lowEnergy(day)
          ? h('div', { class: 'today-nudge' },
              h('p', { class: 'small' }, LOW_ENERGY_COPY),
              h('div', null, button('Make it smaller', {
                variant: 'ghost', size: 'sm', icon: 'edit', key: 'today-anchor-smaller', onClick: () => startEdit(true),
              })))
          : null,
    lessonLine,
    );
  }

  const hasAnchor = status !== 'empty';
  const betOptions = anchorBetOptions(state.bets, d.betId || undefined);
  const hint = d.error ? undefined
    : d.suggested ? 'From last week’s review. Keep it or change it.'
    : lowEnergy(day) ? LOW_ENERGY_EMPTY_HINT
    : 'Small is fine. Just one.';
  const dirty = () => { d.dirty = true; };
  return card({
    title: 'Today’s anchor', titleLevel: 2, tone: 'accent', variant: 'raised',
    subtitle: ANCHOR_PROMPT,
  },
  forOtherDay,
  form({
    ariaLabel: 'Today’s anchor',
    onSubmit: () => {
      const prev = getDay(getState(), date).anchor;
      const next = buildAnchor(d, prev?.done ?? false);
      if (!next) {
        d.error = ANCHOR_REQUIRED_COPY;
        ctx.rerender();
        requestAnimationFrame(() => document.getElementById('today-anchor-text')?.focus());
        return;
      }
      ctx.update((dr) => { ensureDay(dr, date).anchor = next; }, { force: true });
      ctx.clearDraft('anchor');
      const msg = hasAnchor ? ANCHOR_UPDATED_COPY : date === ctx.freshToday() ? ANCHOR_SET_COPY : `Saved for ${formatDate(date)}.`;
      toast(msg, { tone: 'good' });
    },
  },
  h('div', { class: 'stack' },
    textField({
      id: 'today-anchor-text', label: 'What', value: d.text, maxLength: 200,
      placeholder: 'e.g. Send the offer to 5 alumni', error: d.error || null, hint,
      onInput: (v) => { d.text = v; d.suggested = false; dirty(); },
    }),
    textField({
      id: 'today-anchor-metric', label: 'Which number', optional: true, value: d.metric, maxLength: 120,
      placeholder: 'e.g. paid seats', onInput: (v) => { d.metric = v; dirty(); },
    }),
    h('div', { class: 'grid-2' },
      textField({
        id: 'today-anchor-by', label: 'By when', optional: true, type: 'time', value: d.byWhen,
        onInput: (v) => { d.byWhen = v; dirty(); }, onChange: (v) => { d.byWhen = v; dirty(); },
      }),
      selectField<string>({
        id: 'today-anchor-bet', label: 'Bet', optional: true, value: d.betId, placeholder: 'No bet',
        options: betOptions, onChange: (v) => { d.betId = v; dirty(); },
      }),
    ),
    h('div', { class: 'row-end' },
      // A form kept from an earlier day can always be let go of, even when that day had no anchor.
      hasAnchor || forOtherDay
        ? button(hasAnchor ? 'Cancel' : 'Discard', {
            variant: 'ghost', key: 'today-anchor-cancel',
            onClick: () => { ctx.clearDraft('anchor'); ctx.rerender(); },
          })
        : null,
      button(hasAnchor ? 'Save anchor' : 'Set anchor', {
        variant: isPrimary ? 'primary' : 'secondary', type: 'submit', icon: 'anchor', key: 'today-anchor-save',
      }),
    ),
  )),
  lessonLine,
  );
}

/** "Anchor's still open. Do 15 min of it, or move it to tomorrow?" */
function anchorOpenNudge(ctx: ViewContext, text: string, date: string): HTMLElement {
  return h('div', { class: 'today-nudge', key: 'today-anchor-open' },
    h('p', { class: 'small' }, ANCHOR_OPEN_COPY),
    h('div', { class: 'row wrap' },
      button(`Do ${ANCHOR_NUDGE_MIN} min`, {
        variant: 'secondary', size: 'sm', icon: 'play', key: 'today-anchor-15',
        onClick: () => { void anchorMinutes(ctx, text); },
      }),
      button('Move it to tomorrow', {
        variant: 'ghost', size: 'sm', iconRight: 'arrow-right', key: 'today-anchor-move',
        onClick: () => { void moveToTomorrow(ctx, date); },
      }),
    ),
  );
}

async function anchorMinutes(ctx: ViewContext, text: string): Promise<void> {
  const gen = datasetGeneration();
  const category = timerDraft(ctx).category;
  const r = await startTimerSafely(category, { note: anchorTimerNote(text), timeboxMin: ANCHOR_NUDGE_MIN });
  if (!r.started || gen !== datasetGeneration()) return;
  const logged = r.logged ? ` ${stopMessage(r.logged)}` : '';
  toast(`${ANCHOR_NUDGE_MIN} minutes on the anchor (${labelOf(TIME_CATEGORIES, category)}). The clock is running.${logged}`, { tone: 'good' });
}

async function moveToTomorrow(ctx: ViewContext, date: string): Promise<void> {
  const gen = datasetGeneration();
  const conflict = tomorrowAnchorConflict(getState(), date);
  if (conflict) {
    const ok = await confirmDialog({
      title: 'Replace tomorrow’s anchor?',
      body: h('p', { class: 'prewrap' }, `Tomorrow already has one: ${conflict}`),
      confirmLabel: 'Replace it',
      cancelLabel: 'Keep tomorrow’s',
    });
    if (!ok || gen !== datasetGeneration()) return;
  }
  let moved = false;
  ctx.update((dr) => { moved = moveAnchorToTomorrow(dr, date); }, { force: true });
  if (moved) toast(`Moved to ${formatDate(addDays(date, 1))}.`, { tone: 'good' });
}

// ---------------------------------------------------------------------------
// Carry over yesterday's unfinished actions
// ---------------------------------------------------------------------------

function carryCard(ctx: ViewContext, c: CarryOver): HTMLElement {
  const full = actionsFull(getDay(ctx.state, ctx.today).actions);
  const from = daysBetween(c.from, ctx.today) === 1 ? 'yesterday' : `on ${formatDate(c.from)}`;
  const carry = (a: ActionItem) => {
    const date = ctx.freshToday();
    const box: { res: ReturnType<typeof carryAction> } = { res: 'empty' };
    ctx.update((dr) => { box.res = carryAction(dr, date, a.text, newId(), carriesAnchorStep(dr, c.from, date, a)); }, { force: true });
    if (box.res === 'full') toast('Today has three already. Swap one out first.');
  };
  return card({
    title: 'Carry over?', titleLevel: 2, key: 'today-carry',
    subtitle: `Not finished ${from}. Bring any into today?`,
  },
  h('ul', { class: 'list', role: 'list', 'aria-label': 'Unfinished actions' },
    c.items.map((a) => h('li', { class: 'row-between today-carry__row', key: `today-carry-row-${a.id}` },
      h('span', { class: 'grow prewrap' }, a.text),
      button('Carry over', {
        variant: 'secondary', size: 'sm', disabled: full, key: `today-carry-${a.id}`,
        ariaLabel: `Carry over: ${a.text}`, onClick: () => carry(a),
      }),
    ))),
  full ? h('p', { class: 'small muted' }, 'Today has three already. Swap one out first, or let these go.') : null,
  h('div', { class: 'row-end' },
    button('Not today', {
      variant: 'ghost', size: 'sm', key: 'today-carry-dismiss',
      onClick: () => { writeLocal(CARRY_DISMISSED_KEY, c.from); ctx.rerender(); },
    }),
  ));
}

// ---------------------------------------------------------------------------
// Actions (max 3; a 4th asks to swap)
// ---------------------------------------------------------------------------

function actionsCard(ctx: ViewContext, day: DayEntry): HTMLElement {
  const d = ctx.draft<ActionDraft>('action-new', () => ({ text: '', swapping: false, forAnchor: false }));
  const date = day.date;
  const actions = day.actions;
  const full = actionsFull(actions);
  if (!full || !d.text.trim()) d.swapping = false;

  const focusSwap = () => requestAnimationFrame(() => document.getElementById('today-swap')?.focus({ preventScroll: false }));

  const add = () => {
    const target = ctx.freshToday();
    const res = checkNewAction(getDay(getState(), target).actions, d.text);
    if (!res.ok) {
      if (res.reason === 'limit') {
        d.swapping = true;
        ctx.rerender();
        focusSwap();
      }
      return;
    }
    let added = false;
    const forAnchor = d.forAnchor;
    ctx.update((dr) => {
      const t = ensureDay(dr, target);
      if (actionsFull(t.actions)) return;
      t.actions.push(newActionItem(t, res.text, forAnchor));
      added = true;
    }, { force: true });
    if (added) { d.text = ''; d.swapping = false; d.forAnchor = false; }
  };

  // "Toward the anchor" only means something while that day's anchor is still open.
  const newActionItem = (t: DayEntry, text: string, forAnchor: boolean): ActionItem => (
    forAnchor && anchorStatus(t) === 'set' ? { id: newId(), text, done: false, forAnchor: true } : { id: newId(), text, done: false }
  );

  const swap = (outId: string) => {
    const text = d.text.trim();
    if (!text) return;
    const item = newActionItem(getDay(getState(), date), text, d.forAnchor);
    const box: { r: ReturnType<typeof swapAction> } = { r: null };
    ctx.update((dr) => { box.r = swapAction(ensureDay(dr, date), outId, item); }, { force: true });
    const r = box.r;
    if (!r) return;
    d.text = '';
    d.swapping = false;
    d.forAnchor = false;
    toast(`Swapped. “${r.removed.text}” can wait.`, {
      action: {
        label: 'Undo',
        onClick: () => ctx.update((dr) => { swapAction(ensureDay(dr, date), item.id, r.removed); }),
      },
    });
  };

  const forTomorrow = () => {
    const text = d.text.trim();
    if (!text) return;
    const box: { res: ReturnType<typeof carryAction> } = { res: 'empty' };
    ctx.update((dr) => { box.res = carryAction(dr, addDays(date, 1), text, newId()); }, { force: true });
    if (box.res === 'ok' || box.res === 'dupe') { d.text = ''; d.swapping = false; toast('On tomorrow’s list.', { tone: 'good' }); }
    else if (box.res === 'full') toast('Tomorrow has three already.');
  };

  const remove = (id: string) => {
    let removed: ActionItem | undefined;
    let index = -1;
    ctx.update((dr) => {
      const list = ensureDay(dr, date).actions;
      index = list.findIndex((x) => x.id === id);
      removed = removeById(list, id);
    });
    const item = removed;
    if (!item) return;
    toast('Action removed.', {
      action: {
        label: 'Undo',
        onClick: () => {
          if (actionsFull(getDay(getState(), date).actions)) { toast('Three already on the list.'); return; }
          ctx.update((dr) => {
            const list = ensureDay(dr, date).actions;
            if (list.some((x) => x.id === item.id)) return;
            list.splice(Math.min(Math.max(0, index), list.length), 0, item);
          });
        },
      },
    });
  };

  const left = actionsLeft(actions);
  const anchorOpen = anchorStatus(day) === 'set';
  const doneCount = actions.filter((a) => a.done).length;
  const choices = swapChoices(actions);
  return card({
    title: 'Actions', titleLevel: 2,
    subtitle: actions.length
      ? `${doneCount} of ${actions.length} done`
      : anchorOpen ? `Up to ${MAX_ACTIONS} small steps. Start with one toward the anchor.` : `Up to ${MAX_ACTIONS}. Small and concrete.`,
  },
  actions.length
    ? h('ul', { class: 'list', 'aria-label': 'Today’s actions' },
        actions.map((a, i) => h('li', { key: `today-action-row-${a.id}` },
          checkboxRow({
            id: `today-action-${a.id}`, label: a.text || `Action ${i + 1}`, checked: a.done, strike: true,
            hint: a.forAnchor ? h('span', { class: 'today-step-mark' }, icon('anchor', { size: 14 }), 'Toward the anchor') : undefined,
            onChange: (checked) => {
              const finishes = checked && finishesAnchorSteps(getDay(getState(), date), a.id);
              ctx.update((dr) => {
                const x = ensureDay(dr, date).actions.find((y) => y.id === a.id);
                if (x) x.done = checked;
              });
              if (finishes) offerAnchorDone(ctx, date);
            },
            trailing: iconButton('x', `Remove action: ${a.text || `Action ${i + 1}`}`, {
              key: `today-action-remove-${a.id}`, onClick: () => remove(a.id),
            }),
          }))))
    : null,
  form({ ariaLabel: 'Add an action', class: 'mt-2', onSubmit: add },
    h('div', { class: 'row' },
      textField({
        id: 'today-action-new', label: 'New action', hideLabel: true, value: d.text, maxLength: 160,
        placeholder: left === MAX_ACTIONS || left === 0 ? 'Add an action' : `Add an action (${left} left)`,
        enterkeyhint: 'done', class: 'grow',
        onInput: (v) => { d.text = v; },
      }),
      button('Add', { type: 'submit', icon: 'plus', key: 'today-action-add', class: 'shrink-0' }),
    ),
    anchorOpen
      ? h('div', { class: 'row mt-2' },
          h('button', {
            type: 'button', class: 'chip today-for-anchor', key: 'today-action-for-anchor', 'aria-pressed': d.forAnchor ? 'true' : 'false',
            onClick: () => { d.forAnchor = !d.forAnchor; ctx.rerender(); },
          }, icon('anchor', { size: 16 }), 'Toward the anchor'))
      : null),
  d.swapping
    ? h('div', { class: 'today-swap stack-sm', id: 'today-swap', tabindex: -1, role: 'group', 'aria-labelledby': 'today-swap-title' },
        h('p', { class: 'strong', id: 'today-swap-title', role: 'status' }, LIMIT_COPY),
        choices.length
          ? [
              h('p', { class: 'small muted' }, 'Tap the one that can wait.'),
              h('div', { class: 'stack-sm' }, choices.map((a) => button(a.text, {
                variant: 'subtle', block: true, icon: 'x', key: `today-swap-${a.id}`,
                ariaLabel: `Swap out: ${a.text}`, class: 'today-swap__choice', onClick: () => swap(a.id),
              }))),
            ]
          : [
              h('p', { class: 'small muted' }, 'All three are done. Nice. Put this one on tomorrow’s list?'),
              h('div', null, button('Add it for tomorrow', { variant: 'subtle', size: 'sm', key: 'today-swap-tomorrow', onClick: forTomorrow })),
            ],
        h('div', { class: 'row-end' },
          button('Keep my three', {
            variant: 'ghost', size: 'sm', key: 'today-swap-cancel',
            onClick: () => { d.swapping = false; ctx.rerender(); },
          })),
      )
    : null,
  );
}

/** The last step toward the anchor was just ticked: offer to mark the anchor itself done (his call). */
function offerAnchorDone(ctx: ViewContext, date: string): void {
  toast(ANCHOR_LAST_STEP_COPY, {
    tone: 'good',
    action: {
      label: 'Mark done',
      onClick: () => {
        let marked = false;
        ctx.update((dr) => {
          const an = ensureDay(dr, date).anchor;
          if (an && an.text.trim() && !an.done) { an.done = true; marked = true; }
        }, { force: true });
        if (marked) toast('Done. That’s the one thing.', { tone: 'good' });
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

function timerDraft(ctx: ViewContext): { category: TimeCategory } {
  return ctx.draft<{ category: TimeCategory }>('timer', () => ({ category: 'sell' }));
}

async function startCategory(category: TimeCategory): Promise<void> {
  const r = await startTimerSafely(category);
  if (r.started && r.logged) toast(stopMessage(r.logged), { tone: 'good' });
}

function timerCard(ctx: ViewContext): HTMLElement {
  const t = ctx.state.activeTimer;
  const d = timerDraft(ctx);

  if (t) {
    const label = labelOf(TIME_CATEGORIES, t.category);
    return card({
      title: 'Timer', titleLevel: 2, variant: 'raised', tone: t.category === 'escape' ? 'warn' : 'data',
      action: badge(label, t.category === 'build' ? 'data' : t.category === 'sell' ? 'accent' : 'muted'),
    },
    h('div', { class: 'row-between' },
      h('div', { class: 'stack-sm grow' },
        h('span', { class: 'today-timer-clock' }, liveElapsed(t.startedAt, { timeboxMin: t.timeboxMin, live: false })),
        t.note ? h('p', { class: 'small muted truncate' }, t.note) : null,
        t.timeboxMin ? h('p', { class: 'tiny muted' }, `Time-box ${t.timeboxMin} min`) : null,
        t.source === 'escape'
          ? h('p', { class: 'tiny muted' }, t.overridden ? 'From an escape check, after a Park. Counts as escape time.' : 'From an escape check.')
          : null,
      ),
      button('Stop', {
        icon: 'stop', key: 'today-timer-stop', class: 'shrink-0',
        onClick: () => { void stopRunningTimer(); },
      }),
    ));
  }

  return card({ title: 'Timer', titleLevel: 2, subtitle: 'What are you doing right now?' },
    h('div', { class: 'stack' },
      chips({
        id: 'today-timer-cat', label: 'Category', hideLabel: true, value: d.category, options: TIME_CATEGORIES,
        onChange: (v) => { d.category = v; ctx.rerender(); },
      }),
      button(`Start ${labelOf(TIME_CATEGORIES, d.category)}`, {
        icon: 'play', key: 'today-timer-start', block: true,
        onClick: () => { void startCategory(d.category); },
      }),
    ));
}

function escapeEntry(): HTMLElement {
  return h('div', { class: 'stack-sm' },
    linkButton('I want to build something new', href('escape'), {
      variant: 'subtle', size: 'lg', block: true, icon: 'sparkle', key: 'today-escape',
    }),
    h('p', { class: 'tiny muted center' }, 'A two-minute check first. Then it’s your call.'),
  );
}

// ---------------------------------------------------------------------------
// This week + Heavy
// ---------------------------------------------------------------------------

function nextReviewValue(days: number | undefined): string {
  if (days === undefined) return '—';
  if (days < 0) return 'Due';
  if (days === 0) return 'Today';
  return `${days}d`;
}

function weekCard(ctx: ViewContext): HTMLElement {
  const w = weekStrip(ctx.state, ctx.today, ctx.now);
  const rv = w.nextReview;
  const reviewValue = nextReviewValue(rv?.days);
  return card({
    title: 'This week', titleLevel: 2,
    action: linkButton('Time', href('time'), { variant: 'ghost', iconRight: 'chevron-right', key: 'today-week-time' }),
  },
  h('div', { class: 'stack' },
    splitBar({
      label: 'Build vs sell',
      parts: [
        { label: 'Build', value: w.buildSell.build, tone: 'data' },
        { label: 'Sell & talk', value: w.buildSell.sell, tone: 'accent' },
      ],
      target: w.target,
      targetLabel: `Target: ${formatPercent(w.target)} build`,
      valueText: w.splitText,
    }),
    h('div', { class: 'grid-3' },
      h('a', { class: 'today-stat-link', href: href('talks'), key: 'today-week-talks' },
        stat({
          label: 'Talks', value: `${w.talks}/${w.talkTarget}`, tone: w.talks >= w.talkTarget ? 'good' : 'data',
          sub: w.talks >= w.talkTarget ? 'Target hit' : `${w.talkTarget - w.talks} to go`,
        })),
      stat({ label: 'Escapes', value: String(w.escapes.total), sub: w.escapeText }),
      rv
        ? h('a', { class: 'today-stat-link', href: href('bets', { id: rv.betId }), key: 'today-week-review' },
            stat({ label: 'Next review', value: reviewValue, sub: rv.days < 0 ? `${rv.name} · ${rv.text}` : rv.name, tone: rv.days < 0 ? 'warn' : 'default' }))
        : stat({ label: 'Next review', value: '—', sub: 'No active bets' }),
    ),
  ));
}

function heavyCard(ctx: ViewContext): HTMLElement | null {
  const n = heavyNudge(ctx.state.heavy, ctx.today);
  if (!n) return null;
  return h('section', { class: 'stack-sm', 'aria-labelledby': 'today-heavy-title' },
    h('h2', { class: 'label', id: 'today-heavy-title' }, 'Heavy'),
    listRow({
      // No next step yet: open the item's edit straight on "Next physical action".
      href: href('heavy', heavyNudgeAsksStep(n.item) ? { id: n.item.id, focus: 'next' } : { id: n.item.id }), key: 'today-heavy',
      leading: icon('heavy', { size: 22 }),
      title: n.item.title,
      meta: heavyNudgeMeta(n),
      tone: n.overdue ? 'warn' : undefined,
    }),
  );
}

// ---------------------------------------------------------------------------
// Evening shutdown
// ---------------------------------------------------------------------------

function shutdownCard(
  ctx: ViewContext, sd: ShutdownDraft, day: DayEntry, visible: boolean, isPrimary: boolean, phase: DayPhase,
): HTMLElement {
  const date = sd.date;

  if (!visible) {
    return h('div', { class: 'center' },
      button('Close the day early', {
        variant: 'ghost', icon: 'moon', key: 'today-shutdown-open',
        onClick: () => { sd.openedEarly = true; ctx.rerender(); },
      }));
  }

  const saved = day.shutdown;
  if (!sd.editing && saved && hasShutdown(day)) {
    const tomorrow = ctx.state.days[addDays(date, 1)]?.anchor;
    const tomorrowMeta = tomorrow && saved.tomorrow && tomorrow.text === saved.tomorrow ? anchorMeta(tomorrow, ctx.state.bets) : '';
    const line = (label: string, value?: string, meta?: string) => value
      ? h('div', { class: 'stack-sm' },
          h('p', { class: 'label' }, label),
          h('p', { class: 'prewrap' }, value),
          meta ? h('p', { class: 'small muted' }, meta) : null)
      : null;
    return card({
      title: 'Evening shutdown', titleLevel: 2, variant: 'flat',
      action: iconButton('edit', 'Edit shutdown', {
        key: 'today-shutdown-edit',
        onClick: () => {
          Object.assign(sd, shutdownDefaults(getState(), date), { editing: true, dirty: false });
          ctx.rerender();
        },
      }),
    },
    h('div', { class: 'stack' },
      line('Win', saved.win),
      line('Lesson', saved.lesson),
      line('Tomorrow’s anchor', saved.tomorrow, tomorrowMeta),
      h('p', { class: 'small muted' }, 'Day closed. Rest well.'),
    ));
  }

  const dirty = () => { sd.dirty = true; };
  const meta = anchorMeta({ metric: sd.metric.trim(), betId: sd.betId || undefined }, ctx.state.bets);
  // Kept from an earlier evening while typing (see ctx.pinnedDraft): say which day it closes.
  const otherDay = date !== shutdownDay(ctx.now, ctx.today);
  const openAnchor = openAnchorForTomorrow(ctx.state, date);
  return card({
    title: 'Evening shutdown', titleLevel: 2,
    subtitle: otherDay ? `Closing ${formatDate(date)}.` : phase === 'evening' ? 'Close the day in three lines.' : 'Closing early. Three lines.',
    action: !hasShutdown(day) && sd.openedEarly
      ? iconButton('x', 'Hide shutdown', { key: 'today-shutdown-hide', onClick: () => { sd.openedEarly = false; ctx.rerender(); } })
      : null,
  },
  form({
    ariaLabel: 'Evening shutdown',
    onSubmit: () => {
      const input: ShutdownInput = { win: sd.win, lesson: sd.lesson, tomorrow: sd.tomorrow, metric: sd.metric, betId: sd.betId };
      ctx.update((dr) => applyShutdown(dr, date, input), { force: true });
      ctx.clearDraft('shutdown');
      toast(input.tomorrow.trim() ? 'Saved. Tomorrow’s anchor is ready.' : 'Saved. Rest well.', { tone: 'good' });
    },
  },
  h('div', { class: 'stack' },
    textField({
      id: 'today-shutdown-win', label: 'Today’s win', value: sd.win, maxLength: 300,
      placeholder: 'Even a small one counts', onInput: (v) => { sd.win = v; dirty(); },
    }),
    textField({
      id: 'today-shutdown-lesson', label: 'One lesson', value: sd.lesson, maxLength: 300,
      hint: 'You’ll see it under tomorrow’s anchor.',
      onInput: (v) => { sd.lesson = v; dirty(); },
    }),
    textField({
      id: 'today-shutdown-tomorrow', label: 'Tomorrow’s anchor', value: sd.tomorrow, maxLength: 200,
      hint: openAnchor && sd.tomorrow.trim() === openAnchor ? SHUTDOWN_CARRY_HINT : 'It will be waiting for you in the morning.',
      onInput: (v) => { sd.tomorrow = v; dirty(); },
    }),
    disclosure({
      summary: meta ? `Number and bet · ${meta}` : 'Number and bet (optional)',
      open: sd.moreOpen, onToggle: (o) => { sd.moreOpen = o; }, key: 'today-shutdown-more', class: 'today-shutdown-more',
    },
    h('div', { class: 'grid-2' },
      textField({
        id: 'today-shutdown-metric', label: 'Tomorrow’s number', optional: true, value: sd.metric, maxLength: 120,
        placeholder: 'e.g. paid seats', onInput: (v) => { sd.metric = v; dirty(); },
      }),
      selectField<string>({
        id: 'today-shutdown-bet', label: 'Tomorrow’s bet', optional: true, value: sd.betId, placeholder: 'No bet',
        options: anchorBetOptions(ctx.state.bets, sd.betId || undefined),
        onChange: (v) => { sd.betId = v; dirty(); },
      }),
    )),
    h('div', { class: 'row-end' },
      hasShutdown(day) || otherDay
        ? button(hasShutdown(day) ? 'Cancel' : 'Discard', { variant: 'ghost', key: 'today-shutdown-cancel', onClick: () => { ctx.clearDraft('shutdown'); ctx.rerender(); } })
        : null,
      button('Save shutdown', { variant: isPrimary ? 'primary' : 'secondary', type: 'submit', icon: 'moon', key: 'today-shutdown-save' }),
    ),
  )));
}
