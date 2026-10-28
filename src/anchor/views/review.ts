// Weekly review: auto snapshot, the week's evenings, wins/lessons, a call for each bet whose review is
// due (others optional), next week's anchor. One review per ISO week (Asia/Bangkok). Saving again edits it.

import type { Bet, ID, PinnedDraft, Verdict, ViewContext, WeeklyReview } from '../core/types.ts';
import { h } from '../core/dom.ts';
import type { Child } from '../core/dom.ts';
import {
  badge, button, card, confirmDialog, disclosure, emptyState, focusNext, form, progressBar, sectionHeader,
  segmented, splitBar, stat, textArea, textField, toast,
} from '../core/ui.ts';
import type { Tone } from '../core/ui.ts';
import { datasetGeneration, getState, newId } from '../core/store.ts';
import { href } from '../core/router.ts';
import { isReviewOverdue } from '../core/metrics.ts';
import { addWeeks, formatDate, formatDateTime, isDateTime, relativeDays, weekKeyOf } from '../core/dates.ts';
import { labelOf, VERDICTS } from '../core/constants.ts';
import {
  applyReview, betNameFor, defaultReviewWeek, findReview, firstErrorKey, heldOnEarlierWeek, initReviewForm, mergeJournal,
  pastReviews, pendingDecisionBets, reviewFormHasContent, reviewSnapshot, reviewWeeks, snapshotLines, snapshotView,
  splitPendingBets, validateReviewForm, weekJournal, weekNumberLabel, weekRangeLabel, whyRequired,
} from './review.logic.ts';
import type { DayLine, ReviewErrors, ReviewForm, ReviewWeekChoice } from './review.logic.ts';

/**
 * Screen state. Pinned to the day it was opened while the form holds unsaved typing (ctx.pinnedDraft), so
 * crossing midnight into a new week never swaps the review being written for another week's.
 */
interface UiDraft extends PinnedDraft {
  week: ReviewWeekChoice;
  /** weekKey → editing a saved review. */
  editing: Record<string, boolean>;
  /** Disclosure open state: past review id, or 'later:<wk>' for bets not due yet. */
  open: Record<string, boolean>;
  errors: ReviewErrors;
  /** Error key to focus after the next render. */
  focusKey: string | null;
  saving: boolean;
}

const VERDICT_TONE: Record<Verdict, Tone> = { continue: 'good', change: 'data', park: 'muted', kill: 'warn' };

const fieldId = {
  verdict: (betId: ID) => `review-verdict-${betId}`,
  why: (betId: ID) => `review-why-${betId}`,
};

/** Ignore placeholder bet copy like '(fill in)' when showing the bet's rules. */
const meaningful = (t: string): boolean => t.trim() !== '' && !/^\(fill in\)$/i.test(t.trim());

/** Enter moves on to the next field instead of submitting the whole review. */
const noEnterSubmit = (_v: string, ev: KeyboardEvent): void => focusNext(ev);

export function render(ctx: ViewContext): HTMLElement {
  const { state } = ctx;
  const year = Number(ctx.today.slice(0, 4));
  const ui = ctx.pinnedDraft<UiDraft>('ui', (date) => ({
    date,
    dirty: false,
    week: defaultReviewWeek(date, state.reviews),
    editing: {},
    open: {},
    errors: {},
    focusKey: null,
    saving: false,
  }));
  const weeks = reviewWeeks(ui.date);
  const wk = weeks[ui.week];
  const existing = findReview(state.reviews, wk);
  const editing = !existing || ui.editing[wk] === true;
  const { due, later } = splitPendingBets(state.bets, existing, ctx.today);
  const f = editing ? formDraft(ctx, wk, existing, [...due, ...later].map((b) => b.id)) : null;

  const snapshot = reviewSnapshot(state, wk, ctx.now);
  const journal = weekJournal(state.days, wk);

  return h('div', { class: 'view' },
    weekPicker(ctx, ui),
    heldOnEarlierWeek(ui.date, ctx.today, ui.dirty) ? heldNote(ctx, ui, wk) : null,
    sectionHeader(weekNumberLabel(wk), {
      subtitle: weekRangeLabel(wk, year),
      action: existing ? badge('Saved', 'good', { icon: 'check' }) : badge('Not reviewed yet', 'muted'),
    }),
    carriedAnchor(state.reviews, wk),
    snapshotCard(ctx, wk, snapshot),
    journal.length ? journalCard(ctx, journal, f, ui) : null,
    f
      ? reviewForm(ctx, ui, wk, f, existing, due, later)
      : savedCard(ctx, ui, wk, existing as WeeklyReview, due.length),
    pastSection(ctx, ui, wk),
  );
}

// ---------------------------------------------------------------------------
// Week + header bits
// ---------------------------------------------------------------------------

function weekPicker(ctx: ViewContext, ui: UiDraft): HTMLElement {
  return segmented<ReviewWeekChoice>({
    id: 'review-week',
    label: 'Which week',
    hideLabel: true,
    value: ui.week,
    options: [
      { value: 'this', label: 'This week' },
      { value: 'last', label: 'Last week' },
    ],
    onChange: (v) => {
      ui.week = v;
      ui.errors = {};
      ui.focusKey = null;
      ctx.rerender();
    },
  });
}

/**
 * Unsaved typing keeps the screen on the week it was started in (e.g. Week 44 on a Monday). Say so, and let
 * him let go of it: Discard drops the typed review and the screen moves on to today's weeks.
 */
function heldNote(ctx: ViewContext, ui: UiDraft, wk: string): HTMLElement {
  const discard = (): void => {
    const weeks = reviewWeeks(ui.date);
    ctx.clearDraft(`form:${weeks.this}`);
    ctx.clearDraft(`form:${weeks.last}`);
    ctx.clearDraft('ui');
    ctx.rerender();
  };
  return h('div', { class: 'row-between wrap', role: 'status', key: 'review-held' },
    h('p', { class: 'small' }, `Still writing ${weekNumberLabel(wk)}. Save it, or discard it to move on.`),
    button('Discard', { variant: 'ghost', size: 'sm', key: 'review-held-discard', onClick: discard }),
  );
}

/** "The anchor you set for this week", from the previous week's review. */
function carriedAnchor(reviews: readonly WeeklyReview[], wk: string): HTMLElement | null {
  const prev = findReview(reviews, addWeeks(wk, -1));
  if (!prev || !prev.nextAnchor.trim()) return null;
  return card({ eyebrow: 'Anchor you set for this week', variant: 'raised' },
    h('p', { class: 'prewrap strong' }, prev.nextAnchor));
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function snapshotCard(ctx: ViewContext, wk: string, snap: Record<string, number | string | null>): HTMLElement {
  const v = snapshotView(snap);
  const timer = ctx.state.activeTimer;
  const timerInWeek = Boolean(timer && isDateTime(timer.startedAt) && weekKeyOf(timer.startedAt) === wk);
  const ck = v.checkin;
  const fmt = (x: number | null, unit = '') => (x === null ? '—' : `${Math.round(x * 10) / 10}${unit}`);

  const funnel: Child = v.funnelRow
    ? h('div', { class: 'stack-sm' },
        h('p', { class: 'label' }, `Funnel · ${v.funnelRow}`),
        h('div', { class: 'grid-2' },
          stat({
            label: 'Bottleneck',
            value: v.bottleneck ? v.bottleneckRateText : '—',
            sub: v.bottleneck ?? 'Not enough data yet',
            tone: v.bottleneck ? 'data' : 'muted',
          }),
          stat({ label: 'Cash per hour', value: v.cashText, sub: v.cashNote ?? 'Needs revenue, costs and hours', tone: v.cashTone }),
        ))
    : h('p', { class: 'muted small' }, 'No funnel rows yet. ', h('a', { href: href('funnel') }, 'Add one on Funnel.'));

  return card({ title: 'The numbers', subtitle: 'Filled in from your logs.' },
    splitBar({
      label: 'Build vs sell',
      parts: [
        { label: `Build ${v.hours[0].text}`, value: v.build, tone: 'data' },
        { label: `Sell & talk ${v.hours[1].text}`, value: v.sell, tone: 'accent' },
      ],
      target: v.buildSellTarget,
      targetLabel: `Target ${Math.round(v.buildSellTarget * 100)}% build`,
      valueText: v.buildSellText,
    }),
    progressBar({
      label: 'Talks',
      value: v.talks,
      max: Math.max(1, v.talkTarget),
      valueText: v.talksText,
      tone: 'data',
    }),
    h('div', { class: 'grid-2' },
      stat({
        label: 'Escape checks',
        value: `${v.escapesGo} go`,
        sub: `${v.escapesPark} parked`,
      }),
      stat({
        label: 'Anchors done',
        value: `${v.anchorsDone} of ${v.anchorsSet}`,
        sub: v.anchorsSet === 0 ? 'None set yet' : undefined,
      }),
    ),
    h('div', { class: 'stack-sm' },
      h('p', { class: 'label' }, 'Hours by category'),
      h('div', { class: 'grid-3' },
        v.hours.map((x) => stat({ label: x.label, value: x.text, tone: x.hours > 0 ? 'default' : 'muted' })),
      ),
      v.viaEscape && v.viaEscape.sessions > 0
        ? h('p', { class: 'small review-via-escape' },
            h('span', { class: 'muted' }, 'Of which via escape check: '), v.viaEscape.text, '.')
        : null,
      timerInWeek ? h('p', { class: 'muted small' }, 'Includes the timer that’s running.') : null,
    ),
    ck && ck.days > 0
      ? h('div', { class: 'stack-sm' },
          h('p', { class: 'label' }, `Check-ins · ${ck.days} day${ck.days === 1 ? '' : 's'}`),
          h('div', { class: 'grid-3' },
            stat({ label: 'Sleep', value: fmt(ck.sleep, 'h'), sub: 'average' }),
            stat({ label: 'Energy', value: fmt(ck.energy), sub: 'of 5', tone: ck.energy !== null && ck.energy <= 2 ? 'warn' : 'default' }),
            stat({ label: 'Mood', value: fmt(ck.mood), sub: 'of 5', tone: ck.mood !== null && ck.mood <= 2 ? 'warn' : 'default' }),
          ))
      : null,
    funnel,
  );
}

/** The week's shutdown wins and lessons, day by day; "Use these" copies them into the form. */
function journalCard(ctx: ViewContext, lines: DayLine[], f: ReviewForm | null, ui: UiDraft): HTMLElement {
  const use = () => {
    if (!f) return;
    f.wins = mergeJournal(f.wins, lines.map((l) => l.win));
    f.lessons = mergeJournal(f.lessons, lines.map((l) => l.lesson));
    ui.dirty = true;
    ctx.rerender();
  };
  return card({ title: 'From your evenings', subtitle: 'What you wrote at each shutdown this week.', key: 'review-journal' },
    h('ul', { class: 'stack-sm review-journal', role: 'list' },
      lines.map((l) => h('li', { class: 'stack-sm', key: `review-journal-${l.date}` },
        h('p', { class: 'label' }, formatDate(l.date)),
        l.win ? h('p', { class: 'small prewrap' }, h('span', { class: 'muted' }, 'Win: '), l.win) : null,
        l.lesson ? h('p', { class: 'small prewrap' }, h('span', { class: 'muted' }, 'Lesson: '), l.lesson) : null,
      ))),
    f
      ? h('div', null, button('Use these in the review', { variant: 'ghost', size: 'sm', icon: 'plus', key: 'review-journal-use', onClick: use }))
      : null,
  );
}

// ---------------------------------------------------------------------------
// Form (new review, or editing this week's saved one)
// ---------------------------------------------------------------------------

/** The form for week `wk` (kept across re-renders), with an empty decision for every pending bet. */
function formDraft(ctx: ViewContext, wk: string, existing: WeeklyReview | undefined, pendingIds: readonly ID[]): ReviewForm {
  const f = ctx.draft<ReviewForm>(`form:${wk}`, () => initReviewForm(existing, pendingIds));
  for (const id of pendingIds) if (!f.decisions[id]) f.decisions[id] = { verdict: '', why: '' };
  return f;
}

/** Focus the first invalid field once, right after the render that shows the errors. */
function focusRef(ui: UiDraft, key: string, selector?: string) {
  return (el: HTMLElement) => {
    if (ui.focusKey !== key) return;
    ui.focusKey = null;
    setTimeout(() => {
      const target = selector ? el.querySelector<HTMLElement>(selector) : el;
      target?.focus();
    }, 0);
  };
}

function reviewForm(
  ctx: ViewContext, ui: UiDraft, wk: string, f: ReviewForm, existing: WeeklyReview | undefined, due: Bet[], later: Bet[],
): HTMLElement {
  const formKey = `form:${wk}`;
  const dueIds = due.map((b) => b.id);
  const laterIds = later.map((b) => b.id);
  const errors = ui.errors;
  const decided = existing?.betDecisions ?? [];
  // A new review cleared back to empty is clean again (so it no longer holds the screen on its week).
  const touch = () => { ui.dirty = existing ? true : reviewFormHasContent(f); };
  const held = heldOnEarlierWeek(ui.date, ctx.today, ui.dirty);
  const laterKey = `later:${wk}`;
  // Open the optional group when one of its bets has a call or an error, so nothing is hidden.
  const laterOpen = ui.open[laterKey] === true
    || laterIds.some((id) => f.decisions[id]?.verdict || errors[`why:${id}`]);

  const save = async (): Promise<void> => {
    if (ui.saving) return;
    const gen = datasetGeneration();
    const fresh = getState();
    // Ask only about bets still waiting for a call (another tab may have decided some meanwhile).
    const stillPending = new Set(pendingDecisionBets(fresh.bets, findReview(fresh.reviews, wk)).map((b) => b.id));
    const dIds = dueIds.filter((id) => stillPending.has(id));
    const lIds = laterIds.filter((id) => stillPending.has(id));
    const errs = validateReviewForm(f, dIds, lIds);
    ui.errors = errs;
    if (Object.keys(errs).length) {
      ui.focusKey = firstErrorKey(errs, [...dIds, ...lIds]);
      ctx.rerender();
      return;
    }
    const ids = [...dIds, ...lIds];
    const kills = ids.filter((id) => f.decisions[id]?.verdict === 'kill');
    if (kills.length) {
      const names = kills.map((id) => betNameFor(fresh.bets, id));
      ui.saving = true;
      const ok = await confirmDialog({
        title: kills.length === 1 ? `Kill ${names[0]}?` : `Kill ${kills.length} bets?`,
        body: kills.length === 1
          ? 'It moves to Killed. Your why stays in its log.'
          : `${names.join(', ')} move to Killed. Each why stays in its log.`,
        confirmLabel: kills.length === 1 ? 'Kill it' : 'Kill them',
        cancelLabel: 'Not yet',
        danger: true,
      });
      ui.saving = false;
      if (!ok || gen !== datasetGeneration()) return;
    }
    let created = false;
    const saveDay = ctx.freshToday();
    ctx.update((d) => {
      const res = applyReview(d, {
        weekKey: wk, form: f, betIds: ids, today: saveDay, now: new Date(),
        snapshot: reviewSnapshot(d, wk, new Date()), newId,
      });
      created = res.created;
    }, { force: true });
    ui.errors = {};
    ui.editing[wk] = false;
    ui.dirty = false;
    ctx.clearDraft(formKey);
    toast(created ? 'Review saved. Nice work closing the week.' : 'Review updated.', { tone: 'good' });
  };

  // Cancel an edit of a saved review, or Discard a new one that has something in it.
  const cancel = (): void => {
    ui.editing[wk] = false;
    ui.errors = {};
    ui.focusKey = null;
    ui.dirty = false;
    ctx.clearDraft(formKey);
    ctx.rerender();
  };

  const betsSubtitle = due.length
    ? 'A call for each bet whose review is due. The why goes into its log.'
    : later.length ? 'No bet reviews are due. Calls are optional this week.' : undefined;

  return form({ onSubmit: () => { void save(); }, ariaLabel: `Review for ${weekNumberLabel(wk)}`, class: 'stack-lg' },
    card({ title: 'Look back' },
      textArea({
        id: 'review-wins', label: 'Wins', optional: true, rows: 3, maxLength: 2000,
        placeholder: 'What went well, even small things?',
        value: f.wins, onInput: (val) => { f.wins = val; touch(); },
      }),
      textArea({
        id: 'review-lessons', label: 'Lessons', optional: true, rows: 3, maxLength: 2000,
        placeholder: 'What would you do differently?',
        value: f.lessons, onInput: (val) => { f.lessons = val; touch(); },
      }),
    ),

    card({ title: 'Bets', subtitle: betsSubtitle },
      decided.length
        ? h('div', { class: 'stack-sm' },
            h('p', { class: 'label' }, 'Already decided this week'),
            h('ul', { class: 'list', role: 'list' }, decided.map((d) => decisionItem(ctx.state.bets, d))),
            h('p', { class: 'muted small' }, 'These are in each bet’s log. Change them on ', h('a', { href: href('bets') }, 'Bets'), '.'),
          )
        : null,
      due.map((b, i) => betDecisionBlock(ctx, ui, b, f, { divider: i > 0 || decided.length > 0, due: true, touch })),
      later.length
        ? disclosure({
            summary: `Not due yet · ${later.length} bet${later.length === 1 ? '' : 's'} (optional)`,
            open: laterOpen,
            onToggle: (o) => { ui.open[laterKey] = o; },
            key: `review-later-${wk}`,
            class: 'review-later',
          },
          h('p', { class: 'muted small' }, 'Their reviews aren’t due. Skip them, or make a call if something changed.'),
          later.map((b, i) => betDecisionBlock(ctx, ui, b, f, { divider: i > 0, due: false, touch })))
        : null,
      !due.length && !later.length && !decided.length ? h('p', { class: 'muted' }, 'No active bets right now.') : null,
    ),

    card({ title: 'Next week' },
      textField({
        id: 'review-next-anchor', label: 'Next week’s anchor', optional: true, maxLength: 200,
        hint: 'One thing that moves a number. It waits on Today on Monday.',
        enterkeyhint: 'done',
        value: f.nextAnchor, onInput: (val) => { f.nextAnchor = val; touch(); }, onEnter: noEnterSubmit,
      }),
    ),

    errors.form
      ? h('p', { class: 'field__error', role: 'alert', id: 'review-form-error', tabindex: -1, ref: focusRef(ui, 'form') }, errors.form)
      : null,

    h('div', { class: 'stack-sm' },
      button(existing ? 'Save changes' : 'Save review', { variant: 'primary', type: 'submit', block: true, size: 'lg', icon: 'check', key: 'review-save' }),
      existing ? button('Cancel', { variant: 'ghost', block: true, onClick: cancel, key: 'review-cancel' })
        // The note at the top already offers Discard while the screen is held on an earlier week.
        : !held && reviewFormHasContent(f) ? button('Discard', { variant: 'ghost', block: true, onClick: cancel, key: 'review-discard' })
        : null,
    ),
  );
}

function betDecisionBlock(
  ctx: ViewContext, ui: UiDraft, bet: Bet, f: ReviewForm, o: { divider: boolean; due: boolean; touch: () => void },
): HTMLElement {
  const today = ctx.today;
  const errors = ui.errors;
  const d = f.decisions[bet.id];
  const verdictErr = errors[`verdict:${bet.id}`];
  const whyErr = errors[`why:${bet.id}`];
  const overdue = isReviewOverdue(bet, today);
  const needWhy = whyRequired(d.verdict);
  // Not due yet: only ask why once a call that changes something is picked.
  const showWhy = o.due || Boolean(d.verdict) || Boolean(whyErr);
  const rules: Child[] = [
    meaningful(bet.continueIf) ? h('p', { class: 'small' }, h('span', { class: 'muted' }, 'Continue if: '), bet.continueIf) : null,
    meaningful(bet.killIf) ? h('p', { class: 'small' }, h('span', { class: 'muted' }, 'Kill if: '), bet.killIf) : null,
  ];

  return h('div', { class: 'stack-sm', key: `review-bet:${bet.id}` },
    o.divider ? h('hr', { class: 'divider' }) : null,
    h('div', { class: 'row-between' },
      h('p', { class: 'strong' }, bet.name),
      overdue ? badge('Review was due', 'warn') : bet.reviewOn === today ? badge('Due today', 'data') : null,
    ),
    h('p', { class: 'muted small' }, `Review on ${formatDate(bet.reviewOn)} · ${relativeDays(bet.reviewOn, today)}`),
    o.due && rules.some(Boolean) ? h('div', { class: 'stack-sm' }, rules) : null,
    h('div', { ref: focusRef(ui, `verdict:${bet.id}`, '[role="radio"]') },
      segmented<Verdict>({
        id: fieldId.verdict(bet.id),
        label: `Decision for ${bet.name}`,
        hideLabel: true,
        value: d.verdict || undefined,
        options: VERDICTS,
        onChange: (v) => {
          d.verdict = v;
          o.touch();
          delete ui.errors[`verdict:${bet.id}`];
          if (!whyRequired(v)) delete ui.errors[`why:${bet.id}`];
          ctx.rerender();
        },
        // Not due: tapping the chosen call again clears it (the bet is skipped).
        onClear: o.due ? undefined : () => {
          d.verdict = '';
          o.touch();
          delete ui.errors[`why:${bet.id}`];
          ctx.rerender();
        },
      }),
    ),
    verdictErr ? h('p', { class: 'field__error', role: 'alert', id: `${fieldId.verdict(bet.id)}-error` }, verdictErr) : null,
    showWhy
      ? textField({
          id: fieldId.why(bet.id),
          label: 'Why',
          optional: !needWhy,
          hint: d.verdict === 'kill' ? 'One line. What did you learn?'
            : needWhy ? 'One line, based on the numbers if you can.'
            : 'Optional for continue.',
          error: whyErr,
          maxLength: 280,
          enterkeyhint: 'next',
          value: d.why,
          onInput: (val) => { d.why = val; o.touch(); },
          onEnter: noEnterSubmit,
          attrs: { ref: focusRef(ui, `why:${bet.id}`) },
        })
      : null,
  );
}

// ---------------------------------------------------------------------------
// Saved review (read-only) + past list
// ---------------------------------------------------------------------------

function decisionItem(bets: readonly Bet[], d: WeeklyReview['betDecisions'][number]): HTMLElement {
  return h('li', { class: 'stack-sm' },
    h('div', { class: 'row wrap' },
      h('span', { class: 'strong' }, betNameFor(bets, d.betId)),
      badge(labelOf(VERDICTS, d.verdict), VERDICT_TONE[d.verdict]),
    ),
    d.why ? h('p', { class: 'prewrap muted small' }, d.why) : null,
  );
}

function textBlock(label: string, text: string): HTMLElement | null {
  if (!text.trim()) return null;
  return h('div', { class: 'stack-sm' }, h('p', { class: 'label' }, label), h('p', { class: 'prewrap' }, text));
}

function reviewBody(bets: readonly Bet[], r: WeeklyReview, opts: { snapshot: boolean }): Child[] {
  const wrote = r.wins.trim() || r.lessons.trim() || r.nextAnchor.trim() || r.betDecisions.length;
  return [
    textBlock('Wins', r.wins),
    textBlock('Lessons', r.lessons),
    r.betDecisions.length
      ? h('div', { class: 'stack-sm' },
          h('p', { class: 'label' }, 'Bet calls'),
          h('ul', { class: 'list', role: 'list' }, r.betDecisions.map((d) => decisionItem(bets, d))))
      : null,
    textBlock('Next week’s anchor', r.nextAnchor),
    wrote ? null : h('p', { class: 'muted' }, 'No notes this week.'),
    opts.snapshot
      ? h('div', { class: 'stack-sm' },
          h('p', { class: 'label' }, 'Numbers that week'),
          h('dl', { class: 'stack-sm' },
            snapshotLines(r.snapshot).map((l) => h('div', { class: 'row-between' },
              h('dt', { class: 'muted small' }, l.label),
              h('dd', { class: 'small', style: { textAlign: 'right' } }, l.value),
            ))))
      : null,
  ];
}

function savedCard(ctx: ViewContext, ui: UiDraft, wk: string, r: WeeklyReview, dueCount: number): HTMLElement {
  const edit = (): void => {
    ui.editing[wk] = true;
    ui.errors = {};
    ctx.clearDraft(`form:${wk}`);
    ctx.rerender();
  };
  return card({
    title: 'Your review',
    subtitle: `Saved ${formatDateTime(r.createdAt)}`,
    tone: 'good',
  },
  ...reviewBody(ctx.state.bets, r, { snapshot: false }),
  dueCount
    ? h('p', { class: 'small', role: 'status' },
        dueCount === 1 ? '1 bet’s review is due and still needs a call.' : `${dueCount} bets’ reviews are due and still need a call.`)
    : null,
  button(dueCount ? 'Edit and add calls' : 'Edit review', { icon: 'edit', block: true, onClick: edit, key: 'review-edit' }),
  );
}

function pastSection(ctx: ViewContext, ui: UiDraft, wk: string): HTMLElement {
  const list = pastReviews(ctx.state.reviews, wk);
  const year = Number(ctx.today.slice(0, 4));
  return h('section', { class: 'stack', 'aria-labelledby': 'review-past-title' },
    sectionHeader('Past reviews', { id: 'review-past-title', subtitle: list.length ? 'Read-only. One per week.' : undefined }),
    list.length
      ? h('div', { class: 'list' },
          list.map((r) => disclosure({
            summary: h('span', { class: 'row wrap' },
              h('span', { class: 'strong' }, weekNumberLabel(r.weekKey)),
              h('span', { class: 'muted small' }, weekRangeLabel(r.weekKey, year)),
            ),
            open: ui.open[r.id] === true,
            onToggle: (o) => { ui.open[r.id] = o; },
            key: `review-past:${r.id}`,
          }, ...reviewBody(ctx.state.bets, r, { snapshot: true }))))
      : emptyState({
          icon: 'review',
          text: 'Saved reviews show up here, one per week.',
          action: { label: 'Look at your bets', href: href('bets'), icon: 'bets' },
        }),
  );
}
