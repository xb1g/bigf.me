// Talks — Mom Test conversation log: weekly progress, quick add, guide, list by week with role filter.

import type { Talk, TalkRole, ViewContext } from '../core/types.ts';
import { cx, h } from '../core/dom.ts';
import type { Child } from '../core/dom.ts';
import {
  badge, button, card, chips, dateField, disclosure, emptyState, focusNext, form, icon, iconButton,
  progressRing, sectionHeader, selectField, textArea, textField, toast,
} from '../core/ui.ts';
import type { Tone } from '../core/ui.ts';
import { TALK_CHANNELS, TALK_ROLES } from '../core/constants.ts';
import { datasetGeneration, findById, getState, newId, onErase, removeById, update } from '../core/store.ts';
import { formatDate, weekKey } from '../core/dates.ts';
import { talksThisWeek } from '../core/metrics.ts';
import {
  EVIDENCE_LABEL, MAX_LONG, MAX_SHORT, ROLE_FILTER_ALL, STALE_EDIT_NOTICE, TALK_MORE_SUMMARY, TALK_MORE_SUMMARY_EDIT,
  buildTalk, channelLabel, draftFromTalk, editDraftState, emptyTalkDraft, filterTalksByRole, groupTalksByWeek,
  hasErrors, hasExtraDetails, linkableBets, progressDetail, progressHeadline, roleFilterOptions, roleLabel,
  savedMessage, talkDraftEdited, talkEvidence, talkSource, validateTalkDraft, weekHeading, weekProgress,
  weekSubheading, withExistingBet,
} from './talks.logic.ts';
import type { Evidence, RoleFilter, TalkDraft, TalkDraftErrors, TalkSource, TalkWeekGroup } from './talks.logic.ts';

/** Weeks shown in the log before "Show older weeks". */
const WEEKS_STEP = 6;

interface FormState { d: TalkDraft; errors: TalkDraftErrors; moreOpen: boolean; notice?: string }
/** An edit remembers the talk it started from (`src`, `gen`), so it can never write old values back. */
interface EditState extends FormState, TalkSource {}
interface UiState { filter: RoleFilter; weeks: number; guideOpen: boolean }

const EVIDENCE_TONE: Record<Evidence, Tone> = { did: 'good', story: 'data', opinion: 'muted', none: 'muted' };

/** A second tap on Save this soon after a save is a double-tap: no duplicate talk, no errors on the fresh form. */
const RESUBMIT_GUARD_MS = 1000;
let lastSavedAt = 0;

let pendingFrame = 0;
/** Field to focus once the next render is on screen (set by submit on validation errors). */
let focusAfterRender: string | null = null;
/** Field the pending frame will focus (kept so cleanup() can hand it to the next render). */
let pendingFocus: string | null = null;

function focusField(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  // Chip groups: focus the roving-tabindex button.
  const target = el.getAttribute('role') === 'radiogroup' ? el.querySelector<HTMLElement>('[tabindex="0"]') : el;
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'center' });
}

/** cleanup() runs before every re-render, so the focus frame is scheduled from render() instead. */
function scheduleFocus(): void {
  if (!focusAfterRender) return;
  const id = focusAfterRender;
  focusAfterRender = null;
  pendingFocus = id;
  pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; pendingFocus = null; focusField(id); });
}

/** Runs before every re-render: cancel the frame but hand its target to the next render. */
export function cleanup(): void {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = 0;
  if (pendingFocus) focusAfterRender = pendingFocus;
  pendingFocus = null;
}

// An erase (here or in another tab) starts this screen from scratch: no double-tap guard or focus left over.
onErase(() => {
  lastSavedAt = 0;
  focusAfterRender = null;
  pendingFocus = null;
});

/**
 * The edit draft for `talk`, started again from the talk when it belongs to another talk, or when the talk
 * or the whole dataset changed since it started (another tab, an import, a sync pull). If the old draft
 * had unsaved changes, the new one says why they're gone.
 */
function editDraft(ctx: ViewContext, talk: Talk): EditState {
  const current = talkSource(talk, datasetGeneration());
  const init = (notice?: string) => (): EditState => {
    const d = draftFromTalk(talk);
    return { ...current, d, errors: {}, moreOpen: hasExtraDetails(d), notice };
  };
  const e = ctx.draft<EditState>('edit', init());
  const status = editDraftState(e, current);
  if (status === 'fresh') return e;
  const notice = status === 'stale' && talkDraftEdited(e.d, e.src) ? STALE_EDIT_NOTICE : undefined;
  ctx.clearDraft('edit');
  return ctx.draft<EditState>('edit', init(notice));
}

export function render(ctx: ViewContext): HTMLElement {
  const { state, today } = ctx;
  // The guide starts collapsed so the quick-add form sits high on the first screen.
  const ui = ctx.draft<UiState>('ui', () => ({ filter: ROLE_FILTER_ALL, weeks: WEEKS_STEP, guideOpen: false }));

  const editId = ctx.route.params.id;
  const editing = editId ? findById(state.talks, editId) : undefined;
  let fs: FormState;
  if (editing) {
    fs = editDraft(ctx, editing);
  } else {
    fs = ctx.draft<FormState>('new', () => ({ d: emptyTalkDraft(today), errors: {}, moreOpen: false }));
    // An untouched date follows "today" (the app may stay open past midnight).
    if (!fs.d.dateTouched && fs.d.date !== today) fs.d.date = today;
  }

  const formCard = talkForm(ctx, fs, editing);
  const top: Child[] = editing
    ? [formCard, weekCard(ctx), guide(ui)]
    : [weekCard(ctx), guide(ui), formCard];

  const el = h('div', { class: 'view talks' }, ...top, logSection(ctx, ui));
  scheduleFocus();
  return el;
}

// ---------------------------------------------------------------------------
// Week progress
// ---------------------------------------------------------------------------

function weekCard(ctx: ViewContext): HTMLElement {
  const p = weekProgress(ctx.state.talks, ctx.today, ctx.state.profile.weeklyTalkTarget);
  return card({ title: 'Week so far', titleLevel: 2, class: 'talks-week', key: 'talks-week' },
    h('div', { class: 'row' },
      progressRing({ value: p.count, max: p.target, label: 'Talks this week', tone: p.met ? 'good' : 'accent' }),
      h('div', { class: 'stack-sm grow' },
        h('p', { class: 'strong' }, progressHeadline(p)),
        h('p', { class: 'muted small' }, progressDetail(p)),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Mom Test in 3 lines
// ---------------------------------------------------------------------------

function guide(ui: UiState): HTMLElement {
  return disclosure({
    summary: h('span', { class: 'row' }, icon('info', { size: 18 }), 'Mom Test in 3 lines'),
    open: ui.guideOpen,
    onToggle: (open) => { ui.guideOpen = open; },
    key: 'talks-guide',
    class: 'talks-guide',
  },
  h('ol', { class: 'stack-sm' },
    h('li', null, 'Talk about their life, not your idea.'),
    h('li', null, 'Ask about specifics in the past.'),
    h('li', null, 'Talk less. Listen more.'),
  ),
  h('p', { class: 'muted small' }, 'What they did beats a story. A story beats an opinion.'),
  );
}

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

function talkForm(ctx: ViewContext, fs: FormState, editing: Talk | undefined): HTMLElement {
  const { d, errors } = fs;
  const refYear = Number(ctx.today.slice(0, 4));

  const roleError = errors.role
    ? h('p', { class: 'field__error', id: 'talk-role-error', role: 'alert' }, errors.role)
    : null;
  const setDate = (v: string) => { d.date = v; d.dateTouched = true; };

  const actions = editing
    ? h('div', { class: 'row-between wrap' },
        button('Delete', { variant: 'ghost', icon: 'trash', key: 'talk-delete', class: 'text-danger', onClick: () => deleteTalk(ctx, editing.id) }),
        h('div', { class: 'row-end' },
          button('Cancel', { variant: 'ghost', key: 'talk-cancel', onClick: () => leaveEdit(ctx) }),
          button('Save changes', { variant: 'primary', type: 'submit', icon: 'check', key: 'talk-save' }),
        ),
      )
    : button('Save talk', { variant: 'primary', type: 'submit', icon: 'check', block: true, key: 'talk-save' });

  return card({
    title: editing ? 'Edit talk' : 'Log a talk',
    titleLevel: 2,
    subtitle: editing ? `From ${formatDate(editing.date, refYear)}.` : 'What they actually did matters most.',
    class: 'talks-form',
    key: editing ? 'talks-form-edit' : 'talks-form-new',
  },
  fs.notice ? h('p', { class: 'small text-warn talks-notice', role: 'status' }, fs.notice) : null,
  // Quick mode: role, what they did, one quote, next step, Save. Everything else is one tap away.
  form({ onSubmit: () => submit(ctx, fs, editing), ariaLabel: editing ? 'Edit talk' : 'Log a talk', key: 'talk-form' },
    h('div', { class: 'stack-sm' },
      chips<TalkRole>({
        id: 'talk-role', label: 'Role', value: d.role || undefined, options: TALK_ROLES,
        onChange: (v) => { d.role = v; fs.errors.role = undefined; ctx.rerender(); },
      }),
      roleError,
    ),
    textArea({
      id: 'talk-did', label: 'What did they actually do?', rows: 2, value: d.did, maxLength: MAX_LONG,
      hint: 'Paid, signed up, asked a friend. Counts most.', error: errors.body,
      onInput: (v) => { d.did = v; },
    }),
    textArea({
      id: 'talk-quote', label: 'One key quote', optional: true, rows: 2, value: d.quote, maxLength: MAX_LONG,
      hint: 'Their words, as close as you remember.',
      onInput: (v) => { d.quote = v; },
    }),
    textField({
      id: 'talk-next', label: 'Next step', optional: true, value: d.nextStep, maxLength: MAX_SHORT,
      placeholder: 'e.g. Send the form on Friday', enterkeyhint: 'done',
      onInput: (v) => { d.nextStep = v; }, onEnter: (_v, ev) => focusNext(ev),
    }),
    disclosure({
      summary: editing ? TALK_MORE_SUMMARY_EDIT : TALK_MORE_SUMMARY,
      open: fs.moreOpen,
      onToggle: (open) => { fs.moreOpen = open; },
      key: 'talk-more',
      class: 'talks-more',
    },
    textArea({
      id: 'talk-story', label: 'Story', optional: true, rows: 2, value: d.story, maxLength: MAX_LONG,
      hint: 'One specific time in the past. “Last term, when…”',
      onInput: (v) => { d.story = v; },
    }),
    textArea({
      id: 'talk-opinion', label: 'Opinion', optional: true, rows: 2, value: d.opinion, maxLength: MAX_LONG,
      hint: 'What they say they’d do or like. Counts least.',
      onInput: (v) => { d.opinion = v; },
    }),
    chips<string>({
      id: 'talk-channel', label: 'Channel', optional: true, value: d.channel || undefined, options: TALK_CHANNELS,
      onChange: (v) => { d.channel = v; ctx.rerender(); },
      onClear: () => { d.channel = ''; ctx.rerender(); },
    }),
    h('div', { class: 'grid-2' },
      textField({
        id: 'talk-who', label: 'Who', optional: true, value: d.who, placeholder: 'Name or initials',
        maxLength: MAX_SHORT, enterkeyhint: 'next', attrs: { autocapitalize: 'words' },
        onInput: (v) => { d.who = v; }, onEnter: (_v, ev) => focusNext(ev),
      }),
      // iOS date pickers may only fire `change`: listen to both so a picked date survives a re-render.
      dateField({
        id: 'talk-date', label: 'Date', value: d.date, max: ctx.today, error: errors.date,
        hint: editing ? undefined : 'Empty means today.',
        onInput: setDate, onChange: setDate,
      }),
    ),
    selectField<string>({
      id: 'talk-bet', label: 'Linked bet', optional: true, value: d.betId, placeholder: 'No bet',
      options: linkableBets(ctx.state.bets, d.betId),
      onChange: (v) => { d.betId = v; },
    }),
    ),
    actions,
  ));
}

function submit(ctx: ViewContext, fs: FormState, editing: Talk | undefined): void {
  if (Date.now() - lastSavedAt < RESUBMIT_GUARD_MS) return;
  const today = ctx.freshToday();
  const errors = validateTalkDraft(fs.d, today);
  fs.errors = errors;
  if (hasErrors(errors)) {
    // The date lives in "Add …": open it so the message is visible.
    if (errors.date) fs.moreOpen = true;
    focusAfterRender = errors.role ? 'talk-role' : errors.body ? 'talk-did' : 'talk-date';
    ctx.rerender();
    return;
  }

  if (editing) {
    const e = fs as EditState;
    const current = findById(getState().talks, e.id);
    if (!current) {
      toast('That talk isn’t here anymore.', { tone: 'warn' });
      leaveEdit(ctx);
      return;
    }
    // Changed elsewhere since this edit started: never write the old copy back. The re-render starts the
    // form again from the latest version and says so.
    if (editDraftState(e, talkSource(current, datasetGeneration())) !== 'fresh') {
      ctx.rerender();
      return;
    }
    const talk = buildTalk(fs.d, e.id, current.date);
    let saved = false;
    ctx.update((s) => {
      const i = s.talks.findIndex((t) => t.id === talk.id);
      if (i < 0) return; // deleted in another tab meanwhile: don't bring it back
      s.talks[i] = withExistingBet(talk, s.bets);
      saved = true;
    }, { force: true });
    lastSavedAt = Date.now();
    // Toast first: route changes clear toasts older than a second, so this one carries over.
    toast(saved ? 'Changes saved.' : 'That talk was deleted somewhere else, so this edit wasn’t saved.', { tone: saved ? 'good' : 'warn' });
    leaveEdit(ctx);
    return;
  }

  const talk = buildTalk(fs.d, newId(), today);
  const next = ctx.update((s) => {
    if (s.talks.some((t) => t.id === talk.id)) return;
    s.talks.push(withExistingBet(talk, s.bets));
  }, { force: true });
  lastSavedAt = Date.now();
  ctx.clearDraft('new');
  const wk = weekKey(today);
  toast(savedMessage(talksThisWeek(next.talks, wk), next.profile.weeklyTalkTarget, weekKey(talk.date) === wk), { tone: 'good' });
}

function leaveEdit(ctx: ViewContext): void {
  ctx.clearDraft('edit');
  ctx.navigate('talks');
}

function deleteTalk(ctx: ViewContext, id: string): void {
  const current = getState().talks;
  const index = current.findIndex((t) => t.id === id);
  const saved = findById(current, id);
  if (!saved) { leaveEdit(ctx); return; }
  const copy = structuredClone(saved);
  const gen = datasetGeneration();
  ctx.update((s) => { removeById(s.talks, id); }, { force: true });
  toast('Talk deleted.', {
    action: {
      label: 'Undo',
      onClick: () => {
        // An Undo from before an import, pull or erase must not write into the new data.
        if (datasetGeneration() !== gen) return;
        update((s) => {
          if (s.talks.some((t) => t.id === copy.id)) return;
          s.talks.splice(Math.min(Math.max(index, 0), s.talks.length), 0, copy);
        }, { force: true });
      },
    },
  });
  leaveEdit(ctx);
}

// ---------------------------------------------------------------------------
// Log: filter + weeks
// ---------------------------------------------------------------------------

function logSection(ctx: ViewContext, ui: UiState): HTMLElement {
  const talks = ctx.state.talks;
  const filtered = filterTalksByRole(talks, ui.filter);
  const groups = groupTalksByWeek(filtered);
  const shown = groups.slice(0, ui.weeks);
  const total = talks.length;

  let body: Child;
  if (total === 0) {
    body = emptyState({
      icon: 'talks',
      text: 'No talks yet. A five-minute chat counts.',
      action: { label: 'Log your first talk', icon: 'plus', onClick: () => focusField('talk-role') },
    });
  } else if (groups.length === 0) {
    body = emptyState({
      text: `No ${roleLabel(ui.filter).toLowerCase()} talks yet.`,
      action: { label: 'Show all roles', onClick: () => { ui.filter = ROLE_FILTER_ALL; ctx.rerender(); } },
    });
  } else {
    body = [
      shown.map((g) => weekGroup(ctx, g)),
      groups.length > shown.length
        ? button('Show older weeks', {
            variant: 'subtle', block: true, key: 'talks-more-weeks',
            onClick: () => { ui.weeks += WEEKS_STEP; ctx.rerender(); },
          })
        : null,
    ];
  }

  return h('section', { class: 'stack talks-log', 'aria-labelledby': 'talks-log-title' },
    sectionHeader('Log', {
      id: 'talks-log-title',
      subtitle: total ? `${total} ${total === 1 ? 'talk' : 'talks'} so far.` : undefined,
    }),
    total
      ? chips<RoleFilter>({
          id: 'talks-filter', label: 'Filter by role', hideLabel: true, value: ui.filter,
          options: roleFilterOptions(talks, ui.filter),
          onChange: (v) => { ui.filter = v; ui.weeks = WEEKS_STEP; ctx.rerender(); },
        })
      : null,
    body,
  );
}

function weekGroup(ctx: ViewContext, g: TalkWeekGroup): HTMLElement {
  const headingId = `talks-wk-${g.weekKey}`;
  return h('section', { class: 'stack-sm talks-weekgroup', 'aria-labelledby': headingId },
    sectionHeader(weekHeading(g.weekKey, ctx.today), { level: 3, id: headingId, subtitle: weekSubheading(g, ctx.today) }),
    h('ul', { class: 'list', role: 'list' }, g.talks.map((t) => h('li', null, talkItem(ctx, t)))),
  );
}

function talkItem(ctx: ViewContext, t: Talk): HTMLElement {
  const refYear = Number(ctx.today.slice(0, 4));
  const date = formatDate(t.date, refYear);
  const role = roleLabel(t.role);
  const channel = channelLabel(t.channel);
  const title = t.who || role;
  const titleId = `talk-title-${t.id}`;
  const evidence = talkEvidence(t);
  const bet = t.betId ? findById(ctx.state.bets, t.betId) : undefined;

  const line = (label: string, text: string, muted = false): Child => (text
    ? h('div', null,
        h('p', { class: 'label' }, label),
        h('p', { class: cx('prewrap', muted && 'muted') }, text))
    : null);

  return h('article', { class: 'card talks-item', key: `talk-${t.id}`, 'aria-labelledby': titleId },
    h('header', { class: 'card__header' },
      h('div', { class: 'card__heading' },
        h('p', { class: 'card__eyebrow label' }, [date, t.who ? role : null, channel || null].filter(Boolean).join(' · ')),
        h('h4', { class: 'card__title', id: titleId }, title),
      ),
      h('div', { class: 'card__action' },
        iconButton('edit', `Edit talk: ${title}, ${date}`, { key: `talk-edit-${t.id}`, onClick: () => ctx.navigate('talks', { id: t.id }) }),
      ),
    ),
    h('div', { class: 'card__body' },
      evidence !== 'none' || bet
        ? h('div', { class: 'row wrap' },
            evidence !== 'none' ? badge(EVIDENCE_LABEL[evidence], EVIDENCE_TONE[evidence]) : null,
            bet ? badge(bet.name || 'Bet', 'data', { icon: 'bets' }) : null)
        : null,
      line('Did', t.did),
      line('Story', t.story),
      line('Opinion', t.opinion, true),
      t.quote
        ? h('blockquote', { class: 'prewrap' }, `“${t.quote}”`)
        : null,
      t.nextStep
        ? h('p', { class: 'row small', style: { alignItems: 'flex-start' } },
            icon('arrow-right', { size: 16, class: 'shrink-0' }),
            h('span', null, h('span', { class: 'strong' }, 'Next: '), t.nextStep))
        : null,
    ),
  );
}
