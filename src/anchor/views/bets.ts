// Bets: grouped lists, bet detail, create/edit form, review decisions, WIP limit, parking lot.
// Sub-screens live in the hash so the back button works:
//   #/bets                      list
//   #/bets?id=X                 detail
//   #/bets?edit=X | edit=new    form (edit=new&from=<parkedIdeaId> = "Make it a bet")
//   #/bets?review=X[&verdict=V] decision form

import type { Bet, BetDecision, BetStatus, ParkedIdea, Verdict, ViewContext } from '../core/types.ts';
import type { Child } from '../core/dom.ts';
import { cx, h } from '../core/dom.ts';
import { href } from '../core/router.ts';
import { datasetGeneration, findById, getState, newId, removeById } from '../core/store.ts';
import { formatDate, formatShortDate, relativeDays, toISODate, todayISO } from '../core/dates.ts';
import { nextBetReviewDue, wipStatus } from '../core/metrics.ts';
import { BET_STATUSES, VERDICTS, labelOf } from '../core/constants.ts';
import {
  badge, button, card, confirmDialog, dateField, disclosure, emptyState, focusNext, form, icon, iconButton, linkButton,
  openSheet, progressBar, sectionHeader, segmented, textArea, textField, toast,
} from '../core/ui.ts';
import type { Tone } from '../core/ui.ts';
import * as L from './bets.logic.ts';

const VERDICT_HINT: Record<Verdict, string> = {
  continue: 'Keep going as it is.',
  change: 'Keep it, adjust the plan.',
  park: 'Pause it. That frees a slot.',
  kill: 'Stop it and keep the lesson.',
};

const STATUS_TONE: Record<BetStatus, Tone> = { active: 'accent', won: 'good', parked: 'muted', killed: 'muted' };
const VERDICT_TONE: Record<Verdict, Tone> = { continue: 'good', change: 'data', kill: 'danger', park: 'muted' };

function statusTone(s: BetStatus): Tone {
  return STATUS_TONE[s] ?? 'muted';
}

function verdictTone(v: Verdict): Tone {
  return VERDICT_TONE[v] ?? 'muted';
}

function decisionTone(d: BetDecision): Tone {
  return L.isWonDecision(d) ? 'good' : verdictTone(d.verdict);
}

const yearOf = (iso: string) => Number(iso.slice(0, 4));
const nameOf = (b: Pick<Bet, 'name'>) => b.name.trim() || 'Untitled bet';

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function render(ctx: ViewContext): HTMLElement {
  const p = ctx.route.params;
  if (p.edit) return renderForm(ctx, p.edit, p.from);
  if (p.review) return renderReview(ctx, p.review, p.verdict);
  if (p.id) return renderDetail(ctx, p.id);
  return renderList(ctx);
}

function backLink(label: string, to: string, onClick?: () => void): HTMLElement {
  return linkButton(label, to, { variant: 'ghost', icon: 'chevron-left', onClick, class: 'bets-back' });
}

function missing(): HTMLElement {
  return h('div', { class: 'view' },
    emptyState({ icon: 'bets', text: 'That bet isn’t here anymore.', action: { label: 'All bets', href: href('bets') } }));
}

/** Move focus to the first invalid field after the forced re-render lands. */
function focusLater(selector: string): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function renderList(ctx: ViewContext): HTMLElement {
  const s = ctx.state;
  const today = ctx.today;
  const year = yearOf(today);
  const max = s.profile.maxActiveBets;
  const g = L.groupBets(s.bets, today);
  const w = wipStatus(s.bets, max);
  const ui = ctx.draft('list', () => ({ closedOpen: false }));
  const overdue = L.overdueBets(s.bets, today);
  const next = nextBetReviewDue(s.bets, today);
  const ideas = L.parkingNewestFirst(s.parking);

  const statusLine = overdue.length
    ? `${overdue.length} review${overdue.length === 1 ? '' : 's'} due. A short decision keeps bets honest.`
    : next ? `Next review: ${nameOf(next.bet)}, ${relativeDays(next.bet.reviewOn, today)}.` : null;

  return h('div', { class: 'view' },
    // Active
    h('section', { class: 'stack', 'aria-labelledby': 'bets-active-title' },
      sectionHeader('Active', {
        id: 'bets-active-title',
        subtitle: L.wipCopy(w),
        action: g.active.length ? button('New bet', { variant: 'primary', size: 'sm', icon: 'plus', key: 'bets-new', onClick: () => ctx.navigate('bets', { edit: 'new' }) }) : null,
      }),
      progressBar({ value: w.active, max, label: 'Active bets', valueText: `${w.active} of ${max}`, tone: w.over ? 'warn' : 'accent', showLabel: false, size: 'sm' }),
      statusLine ? h('p', { class: cx('small', overdue.length ? 'text-warn' : 'muted') }, statusLine) : null,
      w.over ? overLimitCard(ctx, g.active, max) : null,
      g.active.length
        ? h('ul', { class: 'list', role: 'list' }, g.active.map((b) => h('li', null, betCard(ctx, b, year, false))))
        : emptyState({
            icon: 'target',
            text: 'No active bets. Pick one thing to test, with a number that decides it.',
            action: { label: 'New bet', icon: 'plus', variant: 'primary', onClick: () => ctx.navigate('bets', { edit: 'new' }) },
          }),
    ),

    // Parked
    h('section', { class: 'stack', 'aria-labelledby': 'bets-parked-title' },
      sectionHeader('Parked', { id: 'bets-parked-title', subtitle: 'Not now. Not never.' }),
      g.parked.length
        ? h('ul', { class: 'list', role: 'list' }, g.parked.map((b) => h('li', null, betCard(ctx, b, year, true))))
        : h('p', { class: 'muted small' }, 'Nothing parked.'),
    ),

    // Killed / won
    g.closed.length
      ? h('section', { class: 'stack', 'aria-label': 'Killed and won' },
          disclosure({
            summary: `Killed and won (${g.closed.length})`,
            open: ui.closedOpen,
            key: 'bets-closed',
            onToggle: (open) => { ui.closedOpen = open; },
          },
          h('ul', { class: 'list', role: 'list' }, g.closed.map((b) => h('li', null, closedRow(b, year))))),
        )
      : null,

    // Parking lot
    h('section', { class: 'stack', 'aria-labelledby': 'bets-parking-title' },
      sectionHeader('Parking lot', {
        id: 'bets-parking-title',
        subtitle: ideas.length ? 'Ideas that can wait. They’re safe here.' : undefined,
      }),
      ideas.length
        ? h('ul', { class: 'list', role: 'list' }, ideas.map((i) => h('li', null, parkingItem(ctx, i, today))))
        : emptyState({ icon: 'park', text: 'Nothing here yet. When an escape check says “park it”, the idea waits here.' }),
    ),
  );
}

function betCard(ctx: ViewContext, b: Bet, year: number, compact: boolean): HTMLElement {
  const r = L.reviewInfo(b, ctx.today);
  const detail = href('bets', { id: b.id });
  return h('article', {
    class: cx('card bets-item', compact && 'bets-item--compact'),
    key: `bet:${b.id}`,
    'data-tone': r.overdue ? 'warn' : undefined,
    // Whole card is a mouse/touch target; keyboard users use the title link.
    onClick: (ev: MouseEvent) => {
      if ((ev.target as Element).closest('a, button, input, label')) return;
      ctx.navigate('bets', { id: b.id });
    },
  },
  h('div', { class: 'row-between bets-item__head' },
    h('h3', { class: 'card__title' },
      h('a', { href: detail, class: 'bets-item__link' }, nameOf(b))),
    icon('chevron-right', { class: 'list-row__chevron' }),
  ),
  !compact && !L.isUnwritten(b.hypothesis) ? h('p', { class: 'muted small bets-clamp-2' }, b.hypothesis) : null,
  !compact && !L.isUnwritten(b.metric) ? h('p', { class: 'small' }, h('span', { class: 'label' }, 'Metric '), b.metric) : null,
  h('div', { class: 'row-between wrap' },
    h('span', { class: cx('small tnum', r.overdue ? 'text-warn' : r.tone === 'data' ? 'text-data' : 'muted') },
      `${r.text} · ${formatShortDate(b.reviewOn, year)}`),
    r.overdue
      ? button('Review due', {
          variant: 'subtle', size: 'sm', icon: 'flag', key: `bet-review:${b.id}`, class: 'bets-review-btn',
          ariaLabel: `Review due: ${nameOf(b)}. Decide now.`,
          onClick: () => ctx.navigate('bets', { review: b.id }),
        })
      : null,
  ));
}

function closedRow(b: Bet, year: number): HTMLElement {
  const lesson = b.status === 'killed' ? L.killLesson(b) : '';
  const when = formatShortDate(L.closedOn(b), year);
  return h('a', { class: 'list-row', href: href('bets', { id: b.id }), key: `bet:${b.id}` },
    h('span', { class: 'list-row__text' },
      h('span', { class: 'list-row__title' }, nameOf(b)),
      h('span', { class: 'list-row__meta' }, lesson ? `${when} · Lesson: ${lesson}` : when),
    ),
    h('span', { class: 'list-row__trailing' }, badge(labelOf(BET_STATUSES, b.status), statusTone(b.status))),
    icon('chevron-right', { class: 'list-row__chevron' }),
  );
}

function overLimitCard(ctx: ViewContext, active: Bet[], max: number): HTMLElement {
  return card({ tone: 'warn', title: 'More active bets than slots', subtitle: `The limit is ${max}. Pick the one that can wait.` },
    button('Choose one to park', {
      icon: 'park', key: 'bets-over-limit',
      onClick: () => openMakeRoom({
        title: 'Park one to get back under',
        intro: `${active.length} active, limit ${max}. Which one can wait?`,
        active,
        confirmLabel: 'Park it',
        onConfirm: (parkId) => {
          const parked = findById(getState().bets, parkId);
          try {
            ctx.update((d) => {
              const i = d.bets.findIndex((x) => x.id === parkId);
              if (i < 0 || d.bets[i].status !== 'active') throw new Error('gone');
              d.bets[i] = L.parkBet(d.bets[i], L.overLimitWhy(d.profile.maxActiveBets), todayISO());
            }, { force: true });
            toast(`${parked ? nameOf(parked) : 'Bet'} parked.`, { tone: 'good' });
          } catch {
            toast('That bet changed. Try again.', { tone: 'warn' });
          }
        },
      }),
    }));
}

function parkingItem(ctx: ViewContext, idea: ParkedIdea, today: string): HTMLElement {
  const text = idea.text.trim() || 'Untitled idea';
  const short = L.ideaToBetName(text);
  return h('div', { class: 'card bets-compact-card', key: `idea:${idea.id}` },
    h('p', { class: 'prewrap' }, text),
    h('div', { class: 'row-between wrap' },
      h('span', { class: 'small muted' }, `Parked ${relativeDays(toISODate(idea.at), today)}`),
      h('div', { class: 'row wrap' },
        linkButton('Re-open', href('escape', { idea: idea.id }), {
          variant: 'ghost', size: 'sm', icon: 'sparkle', key: `idea-reopen:${idea.id}`,
          ariaLabel: `Re-open with an escape check: ${short}`,
        }),
        button('Make it a bet', {
          size: 'sm', icon: 'bets', key: `idea-bet:${idea.id}`,
          ariaLabel: `Make it a bet: ${short}`,
          onClick: () => ctx.navigate('bets', { edit: 'new', from: idea.id }),
        }),
        iconButton('trash', `Delete idea: ${short}`, { key: `idea-del:${idea.id}`, onClick: () => deleteIdea(ctx, idea) }),
      ),
    ),
  );
}

function deleteIdea(ctx: ViewContext, idea: ParkedIdea): void {
  const idx = getState().parking.findIndex((x) => x.id === idea.id);
  if (idx < 0) return;
  const gen = datasetGeneration();
  ctx.update((d) => { removeById(d.parking, idea.id); }, { force: true });
  toast('Idea deleted.', {
    action: {
      label: 'Undo',
      onClick: () => {
        // An Undo from before an import, pull or erase must not write into the new data.
        if (datasetGeneration() !== gen) return;
        ctx.update((d) => {
          if (!findById(d.parking, idea.id)) d.parking.splice(Math.min(idx, d.parking.length), 0, idea);
        }, { force: true });
      },
    },
  });
}

// ---------------------------------------------------------------------------
// "Park one to make room" chooser (sheet; not re-rendered by the app)
// ---------------------------------------------------------------------------

function openMakeRoom(o: {
  title: string; intro: string; active: Bet[]; confirmLabel: string;
  onConfirm: (parkId: string) => void;
  alternative?: { label: string; onClick: () => void };
}): void {
  const today = todayISO();
  let picked = '';
  const confirmBtn = button(o.confirmLabel, { variant: 'primary', type: 'submit', disabled: true });
  openSheet({
    title: o.title,
    initialFocus: 'input[name="bets-room"]',
    content: (close) => form({
      ariaLabel: o.title,
      onSubmit: () => {
        if (!picked) return;
        const id = picked;
        close();
        o.onConfirm(id);
      },
    },
    h('p', { class: 'muted' }, o.intro),
    h('fieldset', { class: 'stack-sm fieldset' },
      h('legend', { class: 'field__label bets-room-legend' }, 'Which one waits?'),
      o.active.map((b) => {
        const rid = `bets-room-${b.id}`;
        const r = L.reviewInfo(b, today);
        return h('div', { class: 'check-row' },
          h('input', {
            type: 'radio', name: 'bets-room', id: rid, value: b.id, class: 'check-row__box',
            onChange: () => { picked = b.id; confirmBtn.disabled = false; },
          }),
          h('label', { class: 'check-row__label', htmlFor: rid },
            h('span', { class: 'check-row__text' }, nameOf(b)),
            r.text ? h('span', { class: 'check-row__hint' }, r.text) : null,
          ),
        );
      }),
    ),
    h('p', { class: 'small muted' }, 'Its decision log gets a note. You can bring it back any time.'),
    h('div', { class: 'dialog__actions' },
      button('Cancel', { variant: 'ghost', onClick: () => close() }),
      o.alternative ? button(o.alternative.label, { onClick: () => { close(); o.alternative?.onClick(); } }) : null,
      confirmBtn,
    )),
  });
}

/** Make a parked/closed bet active, asking to park one first when at the limit. */
function activate(ctx: ViewContext, id: string): void {
  const s = getState();
  const max = s.profile.maxActiveBets;
  const plan = L.planActivation(s.bets, id, max);
  const target = findById(s.bets, id);
  if (!target || plan.kind === 'missing' || plan.kind === 'already-active') return;
  const run = (parkId?: string) => {
    const parked = parkId ? findById(getState().bets, parkId) : undefined;
    try {
      ctx.update((d) => L.activateBet(d.bets, id, { max: d.profile.maxActiveBets, today: todayISO(), parkId }), { force: true });
      toast(parked ? `${nameOf(parked)} parked. ${nameOf(target)} is active.` : `${nameOf(target)} is active.`, { tone: 'good' });
    } catch {
      toast('Still at the limit. Park one first.', { tone: 'warn' });
    }
  };
  if (plan.kind === 'ok') { run(); return; }
  openMakeRoom({
    title: 'Park one to make room',
    intro: `${plan.active.length} of ${max} bets are active. Park one so ${nameOf(target)} can start.`,
    active: plan.active,
    confirmLabel: 'Park and activate',
    onConfirm: run,
  });
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function fieldRow(label: string, text: string): HTMLElement {
  const empty = L.isUnwritten(text);
  return h('div', { class: 'stack-sm bets-field' },
    h('dt', { class: 'label' }, label),
    h('dd', { class: cx('prewrap', empty && 'muted') }, empty ? 'Not written yet.' : text.trim()),
  );
}

function renderDetail(ctx: ViewContext, id: string): HTMLElement {
  const b = findById(ctx.state.bets, id);
  if (!b) return missing();
  const today = ctx.today;
  const year = yearOf(today);
  const r = L.reviewInfo(b, today);
  const closed = b.status === 'killed' || b.status === 'won';
  const lesson = L.killLesson(b);
  const log = L.decisionsNewestFirst(b);
  const toReview = (verdict?: Verdict) => ctx.navigate('bets', verdict ? { review: b.id, verdict } : { review: b.id });

  const subtitle = closed
    ? `Since ${formatDate(L.closedOn(b), year)}`
    : `${r.text} · ${formatDate(b.reviewOn, year)}`;

  const actions: Child[] = [];
  if (b.status === 'active') {
    if (!r.overdue) actions.push(button('Review', { icon: 'flag', key: 'bet-act-review', onClick: () => toReview() }));
    actions.push(
      button('Edit', { icon: 'edit', key: 'bet-act-edit', onClick: () => ctx.navigate('bets', { edit: b.id }) }),
      button('Park', { icon: 'park', key: 'bet-act-park', onClick: () => toReview('park') }),
      button('Mark won', { icon: 'check', key: 'bet-act-won', onClick: () => markWon(ctx, b) }),
      button('Kill', { variant: 'danger', icon: 'x', key: 'bet-act-kill', onClick: () => toReview('kill') }),
    );
  } else if (b.status === 'parked') {
    actions.push(button('Make active', { icon: 'bolt', key: 'bet-act-activate', onClick: () => activate(ctx, b.id) }));
    if (!r.overdue) actions.push(button('Review', { icon: 'flag', key: 'bet-act-review', onClick: () => toReview() }));
    actions.push(
      button('Edit', { icon: 'edit', key: 'bet-act-edit', onClick: () => ctx.navigate('bets', { edit: b.id }) }),
      button('Kill', { variant: 'danger', icon: 'x', key: 'bet-act-kill', onClick: () => toReview('kill') }),
    );
  } else {
    actions.push(
      button('Bring it back', { icon: 'arrow-right', key: 'bet-act-revive', onClick: () => revive(ctx, b) }),
      button('Edit', { icon: 'edit', key: 'bet-act-edit', onClick: () => ctx.navigate('bets', { edit: b.id }) }),
    );
  }

  return h('div', { class: 'view' },
    backLink('All bets', href('bets')),
    h('section', { class: 'stack' },
      sectionHeader(nameOf(b), { eyebrow: labelOf(BET_STATUSES, b.status), subtitle }),
      r.overdue
        ? card({ tone: 'warn', title: 'Time to decide', subtitle: 'Check the number against what you set. Then continue, change, park or kill.' },
            button('Review now', { variant: 'primary', block: true, icon: 'flag', key: 'bet-review-now', onClick: () => toReview() }))
        : null,
      b.status === 'killed' && lesson
        ? card({ variant: 'raised', eyebrow: 'Lesson' }, h('p', { class: 'prewrap' }, lesson))
        : null,
    ),
    card({ title: 'The bet' },
      h('dl', { class: 'stack bets-dl' },
        fieldRow('Hypothesis', b.hypothesis),
        fieldRow('Metric', b.metric),
        fieldRow('Continue if', b.continueIf),
        fieldRow('Kill if', b.killIf),
        b.notes.trim() ? fieldRow('Notes', b.notes) : null,
      ),
    ),
    h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Bet actions' }, actions),
    h('section', { class: 'stack', 'aria-labelledby': 'bets-log-title' },
      sectionHeader('Decision log', { id: 'bets-log-title' }),
      log.length
        ? h('ol', { class: 'list', role: 'list' }, log.map((d) =>
            h('li', { class: 'card card--flat bets-compact-card' },
              h('div', { class: 'row-between' },
                badge(L.decisionLabel(d), decisionTone(d)),
                h('span', { class: 'small muted tnum' }, formatDate(d.date, year)),
              ),
              L.isWonDecision(d) ? null : h('p', { class: 'prewrap' }, d.why.trim() || '—'),
            )))
        : h('p', { class: 'muted small' }, 'No decisions yet. The first review starts the log.'),
    ),
    h('div', { class: 'row-end' },
      button('Delete bet', { variant: 'ghost', size: 'sm', icon: 'trash', key: 'bet-act-delete', onClick: () => deleteBet(ctx, b) }),
    ),
  );
}

async function markWon(ctx: ViewContext, b: Bet): Promise<void> {
  const gen = datasetGeneration();
  const ok = await confirmDialog({
    title: `Mark ${nameOf(b)} as won?`,
    body: 'It moves to Killed and won, with today in its log. That frees a slot. You can bring it back later.',
    confirmLabel: 'Mark won',
  });
  if (!ok || datasetGeneration() !== gen) return;
  // Dated now (Bangkok), not when the dialog opened: it may have stayed open past midnight.
  const today = ctx.freshToday();
  try {
    ctx.update((d) => {
      const i = d.bets.findIndex((x) => x.id === b.id);
      if (i < 0 || d.bets[i].status !== 'active') throw new Error('gone');
      d.bets[i] = L.markWonBet(d.bets[i], today);
    }, { force: true });
    toast('Marked as won. Nice.', { tone: 'good' });
  } catch {
    toast('That bet changed somewhere else. Nothing was marked.', { tone: 'warn' });
  }
}

function revive(ctx: ViewContext, b: Bet): void {
  try {
    ctx.update((d) => {
      const i = d.bets.findIndex((x) => x.id === b.id);
      if (i < 0) throw new Error('gone');
      d.bets[i] = L.reviveBet(d.bets[i], todayISO());
    }, { force: true });
    toast('Back in Parked.', { tone: 'good' });
  } catch {
    toast('That bet isn’t here anymore.', { tone: 'warn' });
  }
}

async function deleteBet(ctx: ViewContext, b: Bet): Promise<void> {
  const gen = datasetGeneration();
  const ok = await confirmDialog({
    title: `Delete ${nameOf(b)}?`,
    body: 'The bet and its decision log are removed for good. Killing it keeps the lesson instead.',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok || datasetGeneration() !== gen) return;
  ctx.update((d) => { removeById(d.bets, b.id); }, { force: true });
  ctx.clearDraft(`form:${b.id}`);
  toast('Bet deleted.');
  ctx.navigate('bets');
}

// ---------------------------------------------------------------------------
// Review decision form
// ---------------------------------------------------------------------------

interface ReviewDraft {
  verdict: Verdict | ''; why: string; nextReview: string; dateTouched: boolean;
  errors: L.DecisionErrors; focusError: boolean; busy: boolean;
}

function renderReview(ctx: ViewContext, id: string, preset?: string): HTMLElement {
  const b = findById(ctx.state.bets, id);
  if (!b) return missing();
  const today = ctx.today;
  const detail = href('bets', { id });
  if (b.status === 'killed' || b.status === 'won') {
    return h('div', { class: 'view' },
      backLink('Back to bet', detail),
      emptyState({ text: `${nameOf(b)} is ${b.status}. Bring it back first to review it.`, action: { label: 'Open bet', href: detail } }));
  }
  const key = `review:${id}:${L.isVerdict(preset) ? preset : ''}`;
  const d = ctx.draft<ReviewDraft>(key, () => {
    const v = L.isVerdict(preset) ? preset : '';
    return { verdict: v, why: '', nextReview: L.defaultNextReview(v, today), dateTouched: false, errors: {}, focusError: false, busy: false };
  });

  if (d.focusError) {
    d.focusError = false;
    const sel = d.errors.verdict ? '#bet-verdict [role="radio"]' : d.errors.why ? '#bet-why' : d.errors.nextReview ? '#bet-next-review' : '';
    if (sel) focusLater(sel);
  }

  const isKill = d.verdict === 'kill';
  const last = b.decisions[b.decisions.length - 1];
  const r = L.reviewInfo(b, today);

  const submit = async () => {
    if (d.busy) return;
    const input: L.DecisionInput = { verdict: d.verdict, why: d.why, nextReview: d.nextReview };
    const now = todayISO();
    const errs = L.validateDecision(input, now);
    if (L.hasErrors(errs)) {
      d.errors = errs;
      d.focusError = true;
      ctx.rerender();
      return;
    }
    if (input.verdict === 'kill') {
      d.busy = true;
      const gen = datasetGeneration();
      const ok = await confirmDialog({
        title: `Kill ${nameOf(b)}?`,
        body: 'It moves to Killed with your lesson in the log. That frees a slot. You can bring it back later.',
        confirmLabel: 'Kill it',
        danger: true,
      });
      d.busy = false;
      if (!ok || datasetGeneration() !== gen) return;
    }
    try {
      ctx.update((s) => {
        const i = s.bets.findIndex((x) => x.id === id);
        if (i < 0) throw new Error('gone');
        s.bets[i] = L.applyDecision(s.bets[i], input, now);
      }, { force: true });
    } catch {
      toast('Couldn’t save that. The bet may have changed.', { tone: 'warn' });
      return;
    }
    ctx.clearDraft(key);
    ctx.navigate('bets', { id });
    const when = input.nextReview ? formatShortDate(input.nextReview, yearOf(now)) : '';
    if (input.verdict === 'kill') toast('Killed. The lesson is in the log.');
    else if (input.verdict === 'park') toast(`Parked. Look again ${when}.`, { tone: 'good' });
    else if (input.verdict === 'change') {
      toast(`Saved. Next review ${when}. Update the bet to match?`, { action: { label: 'Edit bet', onClick: () => ctx.navigate('bets', { edit: id }) } });
    } else toast(`Saved. Next review ${when}.`, { tone: 'good' });
  };

  return h('div', { class: 'view' },
    backLink('Back to bet', detail, () => ctx.clearDraft(key)),
    sectionHeader(nameOf(b), { eyebrow: 'Review', subtitle: r.text ? `${r.text}.` : undefined }),
    card({ variant: 'raised', title: 'What you set in advance' },
      h('dl', { class: 'stack bets-dl' },
        fieldRow('Metric', b.metric),
        fieldRow('Continue if', b.continueIf),
        fieldRow('Kill if', b.killIf),
      ),
      last
        ? h('p', { class: 'small muted' }, L.isWonDecision(last)
            ? `Last call (${formatShortDate(last.date, yearOf(today))}): Won.`
            : `Last call (${formatShortDate(last.date, yearOf(today))}): ${labelOf(VERDICTS, last.verdict)}. ${last.why}`)
        : null,
    ),
    form({ ariaLabel: `Review ${nameOf(b)}`, key: 'bet-review-form', class: 'stack-lg', onSubmit: () => { void submit(); } },
      h('div', { class: 'stack-sm' },
        segmented<Verdict>({
          id: 'bet-verdict',
          label: 'Decision',
          value: d.verdict || undefined,
          options: VERDICTS,
          onChange: (v) => {
            d.verdict = v;
            if (!d.dateTouched) d.nextReview = L.defaultNextReview(v, todayISO());
            d.errors = { ...d.errors, verdict: undefined, nextReview: undefined };
            ctx.rerender();
          },
        }),
        d.errors.verdict
          ? h('p', { class: 'field__error', id: 'bet-verdict-error', role: 'alert' }, d.errors.verdict)
          : d.verdict ? h('p', { class: 'field__hint' }, VERDICT_HINT[d.verdict]) : null,
      ),
      textArea({
        id: 'bet-why',
        label: isKill ? 'One-line lesson' : 'Why',
        hint: isKill ? 'What did this bet teach you?' : 'Which number or fact made the call?',
        value: d.why,
        rows: 2,
        maxLength: 500,
        error: d.errors.why,
        onInput: (v) => { d.why = v; },
      }),
      d.verdict && !isKill
        ? dateField({
            id: 'bet-next-review',
            label: d.verdict === 'park' ? 'Look again on' : 'Next review',
            hint: d.verdict === 'park' ? 'Default: in 30 days.' : 'Default: in 14 days.',
            value: d.nextReview,
            min: today,
            error: d.errors.nextReview,
            onInput: (v) => { d.nextReview = v; d.dateTouched = true; },
            onChange: (v) => { d.nextReview = v; d.dateTouched = true; },
          })
        : null,
      h('div', { class: 'dialog__actions' },
        linkButton('Cancel', detail, { variant: 'ghost', onClick: () => ctx.clearDraft(key) }),
        button(isKill ? 'Kill bet' : 'Save decision', { variant: isKill ? 'danger' : 'primary', type: 'submit', key: 'bet-review-submit' }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

/**
 * `src` = the bet as it was when the draft started (JSON) and `gen` = the dataset generation then, so a
 * draft never outlives later changes (another tab, an import, a sync pull).
 */
interface FormDraft { f: L.BetForm; errors: L.BetFormErrors; focusError: boolean; src: string; gen: number }

function renderForm(ctx: ViewContext, editParam: string, fromId?: string): HTMLElement {
  const s = ctx.state;
  const today = ctx.today;
  const isNew = editParam === 'new';
  const existing = isNew ? undefined : findById(s.bets, editParam);
  if (!isNew && !existing) return missing();
  const idea = isNew && fromId ? findById(s.parking, fromId) : undefined;
  const key = isNew ? `form:new:${idea?.id ?? ''}` : `form:${editParam}`;
  const max = s.profile.maxActiveBets;
  const w = wipStatus(s.bets, max);
  const src = existing ? JSON.stringify(existing) : '';
  const gen = datasetGeneration();
  const init = (): FormDraft => ({
    f: existing ? L.formFromBet(existing) : idea ? L.formFromParkedIdea(idea, today) : L.newBetForm(today, { canActivate: w.room > 0 }),
    errors: {},
    focusError: false,
    src,
    gen,
  });
  let d = ctx.draft<FormDraft>(key, init);
  // The bet changed since this draft started (a review decision, sync pull, import…): an old draft
  // would write stale values back over it (e.g. an overdue review date), so start again from the bet.
  if (d.src !== src || (existing && d.gen !== gen)) {
    ctx.clearDraft(key);
    d = ctx.draft<FormDraft>(key, init);
  }
  const f = d.f;
  const back = existing ? href('bets', { id: existing.id }) : href('bets');

  if (d.focusError) {
    d.focusError = false;
    const sel = d.errors.name ? '#bet-name' : d.errors.reviewOn ? '#bet-review-on' : '';
    if (sel) focusLater(sel);
  }

  const submit = () => {
    const errs = L.validateBetForm(f);
    if (L.hasErrors(errs)) {
      d.errors = errs;
      d.focusError = true;
      ctx.rerender();
      return;
    }
    const today2 = todayISO();
    if (!isNew && existing) {
      try {
        ctx.update((st) => {
          const i = st.bets.findIndex((x) => x.id === existing.id);
          if (i < 0) throw new Error('gone');
          st.bets[i] = L.betFromForm(f, { id: existing.id, now: new Date(), existing: st.bets[i] });
        }, { force: true });
      } catch {
        toast('That bet isn’t here anymore.', { tone: 'warn' });
        return;
      }
      ctx.clearDraft(key);
      ctx.navigate('bets', { id: existing.id });
      toast('Saved.', { tone: 'good' });
      return;
    }

    const bet = L.betFromForm({ ...f, status: 'parked' }, { id: newId(), now: new Date() });
    const save = (status: 'active' | 'parked', parkId?: string) => {
      try {
        ctx.update((st) => {
          st.bets.push(bet);
          if (status === 'active') L.activateBet(st.bets, bet.id, { max: st.profile.maxActiveBets, today: today2, parkId });
          if (idea) removeById(st.parking, idea.id);
        }, { force: true });
      } catch {
        toast('Still at the limit. Park one first, or save it parked.', { tone: 'warn' });
        return;
      }
      ctx.clearDraft(key);
      ctx.navigate('bets', { id: bet.id });
      toast(status === 'active' ? `${nameOf(bet)} is active.` : `${nameOf(bet)} saved as parked.`, { tone: 'good' });
    };

    const st = getState();
    const live = wipStatus(st.bets, st.profile.maxActiveBets);
    if (f.status === 'active' && live.atLimit) {
      openMakeRoom({
        title: 'Park one to make room',
        intro: `${live.active} of ${live.max} bets are active. Park one so ${nameOf(bet)} can start, or save it parked.`,
        active: st.bets.filter((b) => b.status === 'active'),
        confirmLabel: 'Park and add',
        onConfirm: (parkId) => save('active', parkId),
        alternative: { label: 'Save it parked', onClick: () => save('parked') },
      });
      return;
    }
    save(f.status);
  };

  const cancel = () => ctx.clearDraft(key);

  return h('div', { class: 'view' },
    backLink(existing ? 'Back to bet' : 'All bets', back, cancel),
    sectionHeader(existing ? 'Edit bet' : idea ? 'Make it a bet' : 'New bet', {
      subtitle: existing ? undefined : 'Write the numbers before you start. Future you decides by them.',
    }),
    form({ ariaLabel: existing ? 'Edit bet' : 'New bet', key: 'bet-form', class: 'stack-lg', onSubmit: submit },
      textField({
        id: 'bet-name', label: 'Name', value: f.name, maxLength: 120, required: true,
        placeholder: 'A short name', error: d.errors.name, enterkeyhint: 'next',
        onInput: (v) => { f.name = v; }, onEnter: (_v, ev) => focusNext(ev),
      }),
      textArea({
        id: 'bet-hypothesis', label: 'Hypothesis', optional: true, rows: 3, value: f.hypothesis,
        hint: 'Who does what, and why you believe it.',
        onInput: (v) => { f.hypothesis = v; },
      }),
      textField({
        id: 'bet-metric', label: 'Metric', optional: true, value: f.metric,
        hint: 'The number that tells you.', enterkeyhint: 'next',
        onInput: (v) => { f.metric = v; }, onEnter: (_v, ev) => focusNext(ev),
      }),
      textArea({
        id: 'bet-continue-if', label: 'Continue if', optional: true, rows: 2, value: f.continueIf,
        hint: 'A number and a date.',
        onInput: (v) => { f.continueIf = v; },
      }),
      textArea({
        id: 'bet-kill-if', label: 'Kill if', optional: true, rows: 2, value: f.killIf,
        hint: 'Decide it now, while it’s easy.',
        onInput: (v) => { f.killIf = v; },
      }),
      dateField({
        id: 'bet-review-on', label: 'Review on', value: f.reviewOn, required: true, error: d.errors.reviewOn,
        onInput: (v) => { f.reviewOn = v; },
        onChange: (v) => { f.reviewOn = v; },
      }),
      isNew
        ? h('div', { class: 'stack-sm' },
            segmented<'active' | 'parked'>({
              id: 'bet-start-as',
              label: 'Start as',
              value: f.status,
              options: [{ value: 'active', label: 'Active' }, { value: 'parked', label: 'Parked' }],
              onChange: (v) => { f.status = v; ctx.rerender(); },
            }),
            h('p', { class: cx('field__hint', f.status === 'active' && w.atLimit && 'text-warn') },
              f.status === 'active' && w.atLimit
                ? `${w.active} of ${max} active. Saving asks you to park one.`
                : L.wipCopy(w)),
          )
        : null,
      textArea({
        id: 'bet-notes', label: 'Notes', optional: true, rows: 3, value: f.notes,
        onInput: (v) => { f.notes = v; },
      }),
      h('div', { class: 'dialog__actions' },
        linkButton('Cancel', back, { variant: 'ghost', onClick: cancel }),
        button(existing ? 'Save' : 'Add bet', { variant: 'primary', type: 'submit', key: 'bet-form-submit' }),
      ),
    ),
  );
}
