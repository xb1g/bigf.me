// Time: this week's blocks by category, build:sell vs target, the shared timer, and a block log.

import type { AnchorState, TimeCategory, ViewContext } from '../core/types.ts';
import { h } from '../core/dom.ts';
import {
  badge, button, card, chips, dateField, emptyState, form, iconButton, liveElapsed, listRow,
  openSheet, progressBar, sectionHeader, selectField, splitBar, textField, toast,
} from '../core/ui.ts';
import { TIME_CATEGORIES, labelOf } from '../core/constants.ts';
import { addWeeks, formatDate, formatHours, formatMinutes, formatTime, weekKey, weekKeyOf, weekRange } from '../core/dates.ts';
import { buildSellRatio, entryMinutes, escapeSessionHours, hoursByCategory, totalHours } from '../core/metrics.ts';
import { findById, getState, newId, removeById } from '../core/store.ts';
import { startTimerSafely, stopRunningTimer } from './timer-stop.ts';
import type { BlockField, BlockInput } from './time.logic.ts';
import {
  applyEdit, blockDurationHint, blockRangeLabel, blocksByDay, canGoNext, categoryRows,
  defaultBlockInput, entryToInput, overlapNote, overlapping, ratioSummary, resolveWeek, validateBlock,
  weekRangeLabel, weekTitle,
} from './time.logic.ts';

type Errors = Partial<Record<BlockField, string>>;
type AddDraft = BlockInput & { errors: Errors };

const NOTE_MAX = 140;
const FIELD_ORDER: BlockField[] = ['category', 'date', 'start', 'end'];

/** Category colour dot (same look as the top-bar timer chip). */
function dot(c: TimeCategory): HTMLElement {
  return h('span', { class: 'timer-chip__dot', 'data-category': c, 'aria-hidden': 'true' });
}

/** Focus the first field with an error once the pending re-render has run. */
function focusFirstError(prefix: string, errors: Errors, root: ParentNode = document): void {
  const first = FIELD_ORDER.find((f) => errors[f]);
  if (!first) return;
  requestAnimationFrame(() => root.querySelector<HTMLElement>(`#${prefix}-${first}`)?.focus());
}

// ---------------------------------------------------------------------------
// Timer (shared with Today through state.activeTimer)
// ---------------------------------------------------------------------------

function timerCard(ctx: ViewContext): HTMLElement {
  const t = ctx.state.activeTimer;
  if (t) {
    const label = labelOf(TIME_CATEGORIES, t.category);
    // The top-bar chip already announces elapsed minutes; this copy has no live region.
    const clock = liveElapsed(t.startedAt, { timeboxMin: t.timeboxMin, class: 'time-clock', live: false });
    return card({ title: 'Timer running' },
      h('div', { class: 'row-between' },
        h('span', { class: 'row' }, dot(t.category), h('span', { class: 'strong' }, label)),
        clock,
      ),
      t.note ? h('p', { class: 'small prewrap' }, t.note) : null,
      h('p', { class: 'small muted' },
        `Started ${formatTime(t.startedAt)}`, t.timeboxMin ? ` · ${t.timeboxMin} min box` : ''),
      button('Stop and log', {
        variant: 'primary', icon: 'stop', block: true, size: 'lg', key: 'time-timer-toggle',
        onClick: () => { void stopRunningTimer(); },
      }),
    );
  }

  const tf = ctx.draft('timer', () => ({ category: 'sell' as TimeCategory, note: '' }));
  const start = () => {
    void startTimerSafely(tf.category, { note: tf.note }).then((r) => {
      if (!r.started) return;
      tf.note = '';
      ctx.rerender();
    });
  };
  return card({ title: 'Start a block', subtitle: 'Same timer as Today.' },
    chips({
      id: 'time-timer-cat', label: 'Category', value: tf.category, options: TIME_CATEGORIES,
      onChange: (v) => { tf.category = v; ctx.rerender(); },
    }),
    textField({
      id: 'time-timer-note', label: 'Note', optional: true, value: tf.note, placeholder: 'What is it for?',
      maxLength: NOTE_MAX, enterkeyhint: 'go',
      onInput: (v) => { tf.note = v; }, onEnter: start,
    }),
    button('Start timer', { variant: 'primary', icon: 'play', block: true, size: 'lg', key: 'time-timer-toggle', onClick: start }),
  );
}

// ---------------------------------------------------------------------------
// Week summary
// ---------------------------------------------------------------------------

function weekNav(ctx: ViewContext, nav: { wk: string }, wk: string, currentWk: string): HTMLElement {
  const go = (next: string) => { nav.wk = resolveWeek(next, currentWk); ctx.rerender(); };
  const nextOk = canGoNext(wk, currentWk);
  const refYear = Number(weekRange(currentWk).start.slice(0, 4));
  return h('div', { class: 'stack-sm' },
    h('div', { class: 'row-between' },
      iconButton('chevron-left', 'Previous week', { key: 'time-prev', onClick: () => go(addWeeks(wk, -1)) }),
      h('div', { class: 'grow center', 'aria-live': 'polite', 'aria-atomic': 'true' },
        h('h2', { class: 'section-header__title', id: 'time-week-title' }, weekTitle(wk, currentWk)),
        h('p', { class: 'small muted tnum' }, weekRangeLabel(wk, refYear)),
      ),
      // aria-disabled (not disabled) so focus stays on the button after reaching this week.
      iconButton('chevron-right', 'Next week', {
        key: 'time-next', attrs: { 'aria-disabled': nextOk ? undefined : 'true' },
        onClick: () => { if (nextOk) go(addWeeks(wk, 1)); },
      }),
    ),
    wk !== currentWk
      ? h('div', { class: 'center' }, button('Back to this week', { variant: 'ghost', size: 'sm', key: 'time-this-week', onClick: () => go(currentWk) }))
      : null,
  );
}

function totalsCard(state: AnchorState, wk: string, now: Date): { el: HTMLElement; hours: ReturnType<typeof hoursByCategory> } {
  const t = state.activeTimer;
  const hours = hoursByCategory(state.timeLog, wk, { activeTimer: t, now });
  const total = totalHours(hours);
  const timerInWeek = Boolean(t && weekKeyOf(t.startedAt) === wk);
  const rows = categoryRows(hours);
  const via = escapeSessionHours(state.timeLog, wk, { activeTimer: t, now });
  const el = card({
    title: 'Totals',
    subtitle: timerInWeek ? 'Includes the running timer.' : undefined,
    action: badge(formatHours(total), total > 0 ? 'data' : 'muted'),
  },
  total > 0
    ? h('div', { class: 'stack-sm' }, rows.map((r) =>
        h('div', { 'data-category': r.value },
          progressBar({ value: r.share, max: 1, label: r.label, valueText: formatHours(r.hours), size: 'sm' }))))
    : h('p', { class: 'small muted' }, 'No time logged in this week.'),
  via.sessions > 0
    ? h('p', { class: 'small muted tnum', key: 'time-via-escape' },
        `Of which via escape check: ${formatHours(via.hours)}`,
        via.overriddenHours > 0 ? ` (${formatHours(via.overriddenHours)} after a Park).` : '.')
    : null,
  );
  return { el, hours };
}

function ratioCard(hours: ReturnType<typeof hoursByCategory>, target: number): HTMLElement {
  const r = buildSellRatio(hours);
  const sum = ratioSummary(r, target);
  const targetPct = Math.round(target * 100);
  return card({ title: 'Build : sell', subtitle: `Target ${targetPct}% build, ${100 - targetPct}% sell.` },
    splitBar({
      label: 'Build vs sell',
      parts: [
        { label: `Build ${formatHours(r.build)}`, value: r.build, tone: 'data' },
        { label: `Sell & talk ${formatHours(r.sell)}`, value: r.sell, tone: 'accent' },
      ],
      target, targetLabel: `Target ${targetPct}% build`, valueText: sum.valueText,
    }),
    h('p', { class: ['small', sum.tone === 'warn' ? 'text-warn' : sum.tone === 'good' ? 'text-good' : 'muted'] }, sum.text),
  );
}

// ---------------------------------------------------------------------------
// Blocks list + edit sheet
// ---------------------------------------------------------------------------

function blockFields(prefix: string, v: BlockInput, errors: Errors, today: string, onTimes: () => void): HTMLElement[] {
  const setTime = (k: 'start' | 'end') => (val: string) => { v[k] = val; onTimes(); };
  return [
    selectField<TimeCategory>({
      id: `${prefix}-category`, label: 'Category', value: v.category, options: TIME_CATEGORIES, error: errors.category,
      onChange: (val) => { v.category = val; },
    }),
    dateField({
      id: `${prefix}-date`, label: 'Date', value: v.date, max: today, error: errors.date,
      onInput: (val) => { v.date = val; }, onChange: (val) => { v.date = val; },
    }),
    h('div', { class: 'grid-2' },
      textField({ id: `${prefix}-start`, type: 'time', label: 'Start', value: v.start, error: errors.start, onInput: setTime('start'), onChange: setTime('start') }),
      textField({ id: `${prefix}-end`, type: 'time', label: 'End', value: v.end, error: errors.end, onInput: setTime('end'), onChange: setTime('end') }),
    ),
  ];
}

function durationHint(id: string, v: BlockInput): { el: HTMLElement; refresh: () => void } {
  const el = h('p', { class: 'small muted tnum', id, 'aria-live': 'polite' }, blockDurationHint(v));
  return { el, refresh: () => { el.textContent = blockDurationHint(v); } };
}

function openEdit(ctx: ViewContext, id: string): void {
  const original = findById(getState().timeLog, id);
  if (!original) return;
  const v: BlockInput = entryToInput(original);
  let errors: Errors = {};

  const save = (close: () => void) => {
    const cur = findById(getState().timeLog, id);
    if (!cur) { close(); toast('That block is already gone.'); return; }
    const r = applyEdit(cur, v, new Date());
    if (!r.ok) {
      errors = r.errors;
      sheet.setContent(body);
      focusFirstError('time-edit', errors, sheet.body);
      return;
    }
    const cur2 = getState();
    const note = overlapNote(overlapping(cur2.timeLog, r.value.start, r.value.end, id, { timer: cur2.activeTimer }));
    ctx.update((d) => {
      const e = findById(d.timeLog, id);
      if (!e) return;
      e.category = r.value.category;
      e.start = r.value.start;
      e.end = r.value.end;
      if (r.value.note) e.note = r.value.note;
      else delete e.note;
    }, { force: true });
    close();
    toast(note ? `Saved. ${note}` : 'Block saved.', { tone: note ? 'warn' : 'good' });
  };

  const remove = (close: () => void) => {
    const back = findById(getState().timeLog, id);
    ctx.update((d) => { removeById(d.timeLog, id); }, { force: true });
    close();
    if (!back) return;
    toast('Block deleted.', {
      action: {
        label: 'Undo',
        onClick: () => ctx.update((d) => { if (!findById(d.timeLog, back.id)) d.timeLog.push(back); }, { force: true }),
      },
    });
  };

  const body = (close: () => void) => {
    const hint = durationHint('time-edit-duration', v);
    return form({ ariaLabel: 'Edit time block', onSubmit: () => save(close) },
      blockFields('time-edit', v, errors, ctx.freshToday(), hint.refresh),
      hint.el,
      textField({
        id: 'time-edit-note', label: 'Note', optional: true, value: v.note, maxLength: NOTE_MAX,
        onInput: (val) => { v.note = val; },
      }),
      h('div', { class: 'row-between' },
        button('Delete', { variant: 'ghost', icon: 'trash', onClick: () => remove(close) }),
        button('Save', { variant: 'primary', type: 'submit', icon: 'check' }),
      ),
    );
  };

  const sheet = openSheet({ title: 'Edit block', content: body, dismissOnBackdrop: false });
}

function blocksSection(ctx: ViewContext, wk: string, currentWk: string): HTMLElement {
  const groups = blocksByDay(ctx.state.timeLog, wk);
  const refYear = Number(ctx.today.slice(0, 4));
  return h('section', { class: 'stack', 'aria-labelledby': 'time-blocks-title' },
    sectionHeader('Blocks', { id: 'time-blocks-title', level: 3, subtitle: groups.length ? 'Tap a block to edit or delete it.' : undefined }),
    groups.length
      ? groups.map((g) => h('div', { class: 'stack-sm', key: `time-day-${g.date}` },
          h('h4', { class: 'label row-between' },
            h('span', null, formatDate(g.date, refYear)),
            h('span', { class: 'tnum' }, formatMinutes(g.minutes))),
          h('div', { class: 'list' }, g.entries.map((e) => listRow({
            key: `time-block-${e.id}`,
            leading: dot(e.category),
            title: labelOf(TIME_CATEGORIES, e.category),
            meta: [`${blockRangeLabel(e)} · ${formatMinutes(entryMinutes(e))}`, e.note ? ` · ${e.note}` : ''].join(''),
            onClick: () => openEdit(ctx, e.id),
          }))),
        ))
      : emptyState({
          icon: 'time',
          text: wk === currentWk ? 'No blocks yet this week. Start the timer, or add one you forgot.' : 'Nothing logged that week.',
          action: {
            label: 'Add a block', icon: 'plus',
            onClick: () => {
              const el = document.getElementById('time-add-start');
              el?.scrollIntoView({ block: 'center' });
              el?.focus({ preventScroll: true });
            },
          },
        }),
  );
}

// ---------------------------------------------------------------------------
// Manual add
// ---------------------------------------------------------------------------

function addCard(ctx: ViewContext, nav: { wk: string }): HTMLElement {
  const add = ctx.draft<AddDraft>('add', () => ({ ...defaultBlockInput(ctx.now), errors: {} }));
  const hint = durationHint('time-add-duration', add);

  const submit = () => {
    const r = validateBlock(add, new Date());
    if (!r.ok) {
      add.errors = r.errors;
      ctx.rerender();
      focusFirstError('time-add', r.errors);
      return;
    }
    const cur = getState();
    // Includes the running timer: a block over it would otherwise count twice (the metrics subtract it).
    const note = overlapNote(overlapping(cur.timeLog, r.value.start, r.value.end, undefined, { timer: cur.activeTimer }));
    ctx.update((d) => { d.timeLog.push({ id: newId(), ...r.value }); }, { force: true });
    nav.wk = weekKeyOf(r.value.start);
    Object.assign(add, defaultBlockInput(new Date(), add.category), { errors: {} });
    const msg = `Added ${formatMinutes(r.minutes)} of ${labelOf(TIME_CATEGORIES, r.value.category)}.`;
    toast(note ? `${msg} ${note}` : msg, { tone: note ? 'warn' : 'good' });
  };

  return card({ title: 'Add a block', subtitle: 'Forgot the timer? Log it here.', key: 'time-add' },
    form({ ariaLabel: 'Add a time block', onSubmit: submit },
      blockFields('time-add', add, add.errors, ctx.today, hint.refresh),
      hint.el,
      textField({
        id: 'time-add-note', label: 'Note', optional: true, value: add.note, maxLength: NOTE_MAX,
        onInput: (v) => { add.note = v; },
      }),
      button('Add block', { type: 'submit', icon: 'plus', block: true, key: 'time-add-submit' }),
    ),
  );
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function render(ctx: ViewContext): HTMLElement {
  const currentWk = weekKey(ctx.today);
  const nav = ctx.draft('nav', () => ({ wk: currentWk, day: ctx.today }));
  // A new day brings the view back to the current week.
  if (nav.day !== ctx.today) { nav.day = ctx.today; nav.wk = currentWk; }
  nav.wk = resolveWeek(nav.wk, currentWk);
  const wk = nav.wk;

  const totals = totalsCard(ctx.state, wk, ctx.now);
  return h('div', { class: 'view' },
    timerCard(ctx),
    h('section', { class: 'stack', 'aria-labelledby': 'time-week-title' },
      weekNav(ctx, nav, wk, currentWk),
      totals.el,
      ratioCard(totals.hours, ctx.state.profile.buildSellTarget),
    ),
    blocksSection(ctx, wk, currentWk),
    addCard(ctx, nav),
  );
}
