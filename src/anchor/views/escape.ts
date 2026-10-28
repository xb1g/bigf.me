// Escape check: six short questions, then a recommendation (Go, time-boxed / Park it). It's his call.
// All user text goes into the DOM as text nodes via h(). The answers are mirrored to localStorage, so a
// reload (iOS restarts home-screen apps often) or a trip to another screen picks up where he left off.

import type { AnchorState, ViewContext } from '../core/types.ts';
import { h } from '../core/dom.ts';
import { href } from '../core/router.ts';
import { datasetGeneration, findById, getState, newId, onErase, removeById } from '../core/store.ts';
import { weekKey } from '../core/dates.ts';
import { escapesThisWeek } from '../core/metrics.ts';
import { DEFAULT_TIMEBOX_MIN, labelOf, TIME_CATEGORIES } from '../core/constants.ts';
import {
  badge, button, card, dateField, form, linkButton, listRow, progressBar, sectionHeader, textArea, textField, toast,
} from '../core/ui.ts';
import {
  AVOID_FIRST_MIN, ESCAPE_DRAFT_KEY, ESCAPE_STEPS, MAX_LEN, NO_BET, RESULT_STEP, STEP_COUNT,
  anchorFirst, avoidTimerNote, avoidingCopy, betChoices, buildEscapeCheck, buildParkedIdea, buildWorry, byWhenHint,
  canOfferWorry, clampStep, draftHasContent, draftVerdict, emptyEscapeDraft, goTimerPlan, goToastCopy, nextStep,
  parkingCountCopy, parseEscapeDraft, progressText, quickDates, recommendation, resultActions, serializeEscapeDraft,
  stepError, summaryRows, weekLine,
} from './escape.logic.ts';
import type { EscapeDraft, EscapeStep, ResultActionKind } from './escape.logic.ts';
import { startTimerSafely } from './timer-stop.ts';
import { stopMessage } from './time.logic.ts';

const DRAFT = 'check';

// ---------------------------------------------------------------------------
// The draft on this device
// ---------------------------------------------------------------------------

/** Bumped on every erase (here or in another tab): handlers drawn before it must not write the old draft back. */
let eraseEpoch = 0;
onErase(() => {
  eraseEpoch++;
  removeStored();
});

function readStored(): string | null {
  try { return globalThis.localStorage?.getItem(ESCAPE_DRAFT_KEY) ?? null; } catch { return null; }
}
function removeStored(): void {
  try { globalThis.localStorage?.removeItem(ESCAPE_DRAFT_KEY); } catch { /* best effort */ }
}

/** Mirror the draft to this device, or forget it when there is nothing worth keeping. */
function persist(d: EscapeDraft, epoch: number): void {
  if (epoch !== eraseEpoch) return;
  if (!draftHasContent(d) && d.step === 0) { removeStored(); return; }
  try { globalThis.localStorage?.setItem(ESCAPE_DRAFT_KEY, serializeEscapeDraft(d, new Date())); } catch { /* best effort */ }
}

/** A saved check (≤ 12 h old) when there is one, else a fresh draft. */
function restore(): EscapeDraft {
  const d = parseEscapeDraft(readStored(), new Date());
  if (!d) {
    removeStored();
    return emptyEscapeDraft();
  }
  d.resumed = true;
  d.focusPending = true;
  return d;
}

/** Finished or cancelled: drop the draft from memory and from this device. */
function forget(ctx: ViewContext): void {
  ctx.clearDraft(DRAFT);
  removeStored();
}

function getDraft(ctx: ViewContext, save: (d: EscapeDraft) => void): EscapeDraft {
  let d = ctx.draft<EscapeDraft>(DRAFT, restore);
  const ideaId = ctx.route.params.idea;
  // A plain '#/escape' (Today's button after "Do that first" or "Back to my anchor", or a relaunch) carries on
  // with a re-opened idea's check while that idea is still parked: its id goes back into the URL (no new
  // history entry), so Go/Park remove that idea. Only when the idea is gone does the check start fresh.
  if (!ideaId && d.fromIdeaId) {
    if (findById(ctx.state.parking, d.fromIdeaId)) {
      ctx.replaceParams({ idea: d.fromIdeaId });
    } else {
      forget(ctx);
      d = ctx.draft<EscapeDraft>(DRAFT, emptyEscapeDraft);
    }
  }
  // '#/escape?idea=<id>' re-opens a parked idea: start a fresh check with its text as the idea.
  if (ideaId && d.fromIdeaId !== ideaId) {
    const idea = findById(ctx.state.parking, ideaId);
    if (idea) {
      forget(ctx);
      d = ctx.draft<EscapeDraft>(DRAFT, emptyEscapeDraft);
      d.want = idea.text.trim().slice(0, MAX_LEN.want);
      d.fromIdeaId = idea.id;
      d.focusPending = true;
      save(d);
    }
  }
  d.step = clampStep(d.step);
  return d;
}

/** After this render is mounted (and the app's own focus restore ran), move focus to `el`. */
function focusAfterRender(d: EscapeDraft, el: HTMLElement | null): void {
  if (!d.focusPending || !el) return;
  d.focusPending = false;
  queueMicrotask(() => {
    if (el.isConnected) el.focus({ preventScroll: true });
  });
}

interface Env { ctx: ViewContext; d: EscapeDraft; save: () => void }

function go(env: Env, step: number, opts: { editing?: boolean } = {}): void {
  const { ctx, d } = env;
  d.error = null;
  d.resumed = false;
  d.step = clampStep(step);
  if (opts.editing !== undefined) d.editing = opts.editing;
  d.focusPending = true;
  env.save();
  ctx.rerender();
}

function progress(step: number): HTMLElement {
  return progressBar({
    label: 'Escape check',
    value: Math.min(step + 1, STEP_COUNT),
    max: STEP_COUNT,
    valueText: progressText(step),
    size: 'sm',
    tone: 'accent',
  });
}

export function render(ctx: ViewContext): HTMLElement {
  const epoch = eraseEpoch;
  const d = getDraft(ctx, (x) => persist(x, epoch));
  const env: Env = { ctx, d, save: () => persist(d, epoch) };
  return d.step >= RESULT_STEP ? resultView(env) : stepView(env);
}

function resumedNote(d: EscapeDraft): HTMLElement | null {
  return d.resumed ? h('p', { class: 'small muted', role: 'status' }, 'Picked up where you left off.') : null;
}

// ---------------------------------------------------------------------------
// Question steps
// ---------------------------------------------------------------------------

function stepView(env: Env): HTMLElement {
  const { ctx, d } = env;
  const step = ESCAPE_STEPS[d.step];
  const { node, focusTarget } = stepControl(env, step);
  const last = d.step === STEP_COUNT - 1;
  const nextLabel = d.editing ? 'Back to result' : last ? 'See result' : 'Next';

  const submit = () => {
    const err = stepError(d, d.step, ctx.freshToday());
    if (err) {
      d.error = err;
      d.focusPending = true;
      ctx.rerender();
      return;
    }
    go(env, nextStep(d), { editing: false });
  };

  const back = d.step === 0
    ? linkButton('Not now', href('today'), { variant: 'ghost', key: 'escape-notnow', onClick: () => forget(ctx) })
    : button('Back', { variant: 'secondary', icon: 'chevron-left', key: 'escape-back', onClick: () => go(env, d.step - 1) });

  const s = ctx.state;
  const wk = escapesThisWeek(s.escapes, weekKey(ctx.today));
  const week = d.step === 0 ? weekLine(wk.go, wk.park, s.parking.length) : '';

  focusAfterRender(d, focusTarget);

  return h('div', { class: 'view' },
    h('div', { class: 'stack-sm' },
      progress(d.step),
      d.step === 0
        ? h('p', { class: 'muted' }, d.fromIdeaId
            ? 'Re-opening a parked idea. Same six questions, then it’s your call.'
            : 'Before you start something new: six quick questions. Then it’s your call.')
        : null,
      resumedNote(d),
    ),
    form({ onSubmit: submit, ariaLabel: `Escape check, ${progressText(d.step).toLowerCase()}`, key: 'escape-form' },
      h('h2', { class: 'escape-q', id: 'escape-question' }, step.question),
      node,
      h('div', { class: 'row' },
        back,
        button(nextLabel, {
          variant: 'primary', type: 'submit', size: 'lg', class: 'grow', key: 'escape-next',
          iconRight: d.editing || last ? undefined : 'arrow-right',
        }),
      ),
    ),
    draftHasContent(d)
      ? h('div', { class: 'row-between' },
          week ? h('p', { class: 'muted small' }, week) : h('span'),
          button('Start over', { variant: 'ghost', size: 'sm', key: 'escape-reset', onClick: () => startOver(ctx) }))
      : week ? h('p', { class: 'muted small' }, week) : null,
  );
}

function startOver(ctx: ViewContext): void {
  forget(ctx);
  const fresh = ctx.draft<EscapeDraft>(DRAFT, emptyEscapeDraft);
  fresh.focusPending = true;
  ctx.rerender();
}

function stepControl(env: Env, step: EscapeStep): { node: HTMLElement; focusTarget: HTMLElement | null } {
  const { ctx, d, save } = env;
  const q = step.question;
  const error = d.error;
  switch (step.key) {
    case 'want': {
      const node = textField({
        id: 'escape-want', label: q, hideLabel: true, value: d.want, error,
        placeholder: 'In a few words', maxLength: MAX_LEN.want, enterkeyhint: 'next',
        onInput: (v) => { d.want = v; save(); },
      });
      return { node, focusTarget: node.querySelector('input') };
    }
    case 'numberMoves': {
      const node = textField({
        id: 'escape-number', label: q, hideLabel: true, value: d.numberMoves, error,
        placeholder: 'e.g. paid seats, referral applies', maxLength: MAX_LEN.numberMoves, enterkeyhint: 'next',
        hint: 'Empty is allowed. It leans toward parking.',
        onInput: (v) => { d.numberMoves = v; save(); },
      });
      return { node, focusTarget: node.querySelector('input') };
    }
    case 'byWhen': return byWhenControl(env, q);
    case 'howKnow': {
      const node = textArea({
        id: 'escape-how', label: q, hideLabel: true, value: d.howKnow, error, rows: 3,
        placeholder: 'What you’ll look at, and what would count', maxLength: MAX_LEN.howKnow,
        onInput: (v) => { d.howKnow = v; save(); },
      });
      return { node, focusTarget: node.querySelector('textarea') };
    }
    case 'betId': return betControl(ctx.state, d, q, save);
    case 'avoiding': {
      const node = textArea({
        id: 'escape-avoid', label: q, hideLabel: true, value: d.avoiding, error, rows: 3, optional: true,
        placeholder: 'A call, an email, a decision…', maxLength: MAX_LEN.avoiding,
        hint: 'Optional. If you name it, you can give it ten minutes first.',
        onInput: (v) => { d.avoiding = v; save(); },
      });
      return { node, focusTarget: node.querySelector('textarea') };
    }
  }
}

function byWhenControl(env: Env, q: string): { node: HTMLElement; focusTarget: HTMLElement | null } {
  const { ctx, d, save } = env;
  const initial = byWhenHint(d.byWhen, ctx.today);
  const field = dateField({
    id: 'escape-by', label: q, hideLabel: true, value: d.byWhen, error: d.error, hint: initial.text, min: ctx.today,
    onInput: (v) => setDate(v),
    onChange: (v) => setDate(v),
  });
  const input = field.querySelector('input');
  const hintEl = field.querySelector<HTMLElement>('.field__hint');
  if (hintEl) {
    hintEl.setAttribute('aria-live', 'polite');
    hintEl.classList.toggle('text-warn', initial.tone === 'warn');
  }
  // Update the hint in place (no re-render) so the date input keeps its caret/segment.
  function setDate(v: string): void {
    d.byWhen = v;
    save();
    if (input && input.value !== v) input.value = v;
    const hint = byWhenHint(v, ctx.freshToday());
    if (hintEl) {
      if (hintEl.textContent !== hint.text) hintEl.textContent = hint.text;
      hintEl.classList.toggle('text-warn', hint.tone === 'warn');
    }
  }
  const quick = h('div', { class: 'row wrap', role: 'group', 'aria-label': 'Quick picks' },
    quickDates(ctx.today).map((p) => button(p.label, {
      variant: 'subtle', size: 'sm', key: `escape-by-${p.label}`, onClick: () => setDate(p.value),
    })),
    button('No date', { variant: 'ghost', size: 'sm', key: 'escape-by-none', onClick: () => setDate('') }),
  );
  return { node: h('div', { class: 'stack' }, field, quick), focusTarget: input };
}

function betControl(state: AnchorState, d: EscapeDraft, q: string, save: () => void): { node: HTMLElement; focusTarget: HTMLElement | null } {
  const choices = betChoices(state.bets);
  const hasActive = choices.length > 1;
  const radios: HTMLInputElement[] = [];
  const rows = choices.map((c) => {
    const id = `escape-bet-${c.value}`;
    const input = h('input', {
      type: 'radio', id, name: 'escape-bet', value: c.value, class: 'check-row__box',
      checked: d.betId === c.value,
      onChange: (ev: Event) => { if ((ev.target as HTMLInputElement).checked) { d.betId = c.value; save(); } },
    });
    radios.push(input);
    return h('div', { class: 'check-row' },
      input,
      h('label', { class: 'check-row__label', htmlFor: id },
        h('span', { class: 'check-row__text' }, c.label),
        c.value === NO_BET ? h('span', { class: 'check-row__hint' }, 'An honest answer is fine.') : null,
      ),
    );
  });
  const node = h('fieldset', { class: 'stack-sm fieldset' },
    h('legend', { class: 'sr-only' }, q),
    hasActive ? null : h('p', { class: 'muted small' }, 'No active bets right now.'),
    rows,
  );
  return { node, focusTarget: radios.find((r) => r.checked) ?? radios[0] ?? null };
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

function resultView(env: Env): HTMLElement {
  const { ctx, d } = env;
  const s = ctx.state;
  const rec = recommendation(d, s.bets, ctx.today, DEFAULT_TIMEBOX_MIN);
  const actions = resultActions(rec, d);
  const primaryKind = actions[0].kind;
  const other: 'go' | 'park' = rec.verdict === 'go' ? 'park' : 'go';
  const anchorText = anchorFirst(s.days[ctx.today]);
  const avoid = avoidingCopy(d);
  const running = s.activeTimer;
  let busy = false;

  const run = async (kind: ResultActionKind): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      if (kind === 'go') await decideGo(env);
      else if (kind === 'park') decidePark(env);
      else await avoidFirst(env);
    } catch (err) {
      console.error('[anchor] escape decision failed', err);
      toast('That didn’t save. Try again.', { tone: 'danger' });
    } finally {
      busy = false;
    }
  };
  const label = (kind: ResultActionKind) => actions.find((a) => a.kind === kind)?.label ?? '';

  const heading = sectionHeader('Your call', { id: 'escape-result-title' });
  const title = heading.querySelector<HTMLElement>('#escape-result-title');
  title?.setAttribute('tabindex', '-1');
  focusAfterRender(d, title);

  const rows = summaryRows(d, s.bets, ctx.today);
  const offerWorry = canOfferWorry(d);

  const worryRow = avoid
    ? offerWorry
      ? h('div', { class: 'row wrap' },
          button('Put it in Heavy', { variant: 'ghost', size: 'sm', icon: 'heavy', key: 'escape-worry', onClick: () => addWorry(env) }))
      : h('div', { class: 'row-between' },
          badge('In Heavy', 'good', { icon: 'check' }),
          linkButton('Open Heavy', href('heavy'), { variant: 'ghost', size: 'sm', iconRight: 'arrow-right', key: 'escape-open-heavy' }))
    : null;

  const avoidCard = avoid
    ? card({ title: avoid.title, tone: primaryKind === 'avoid-first' ? 'accent' : undefined, key: 'escape-avoid-card' },
        h('p', { class: 'prewrap' }, avoid.body),
        primaryKind === 'avoid-first'
          ? button(label('avoid-first'), {
              variant: 'primary', size: 'lg', block: true, icon: 'play', key: 'escape-avoid-first',
              onClick: () => { void run('avoid-first'); },
            })
          : null,
        worryRow,
      )
    : null;

  const anchorCard = anchorText
    ? card({ eyebrow: 'Anchor first?', title: anchorText, variant: 'raised', key: 'escape-anchor-first', class: 'escape-anchor-first' },
        h('p', { class: 'small muted' }, 'Today’s anchor is still open. Do that first? Your answers here will wait.'),
        h('div', null,
          linkButton('Back to my anchor', href('today'), {
            variant: 'secondary', size: 'sm', icon: 'anchor', key: 'escape-anchor-back', onClick: () => env.save(),
          })),
      )
    : null;

  const recCard = card({
    eyebrow: 'Recommended', title: rec.title, tone: rec.verdict === 'go' ? 'good' : 'data', key: 'escape-rec',
  },
    h('p', null, rec.body),
    rec.reasons.length
      ? h('ul', { class: 'stack-sm escape-reasons' },
          rec.reasons.map((r) => h('li', { class: 'small' }, r)))
      : null,
    h('div', { class: 'stack-sm' },
      button(label(rec.verdict), {
        variant: primaryKind === rec.verdict ? 'primary' : 'secondary', size: primaryKind === rec.verdict ? 'lg' : 'md',
        block: true, key: `escape-${rec.verdict}`, icon: rec.verdict === 'go' ? 'play' : 'park',
        onClick: () => { void run(rec.verdict); },
      }),
      button(label(other), {
        variant: primaryKind === rec.verdict ? 'secondary' : 'ghost', block: true, key: `escape-${other}`,
        icon: other === 'go' ? 'play' : 'park', onClick: () => { void run(other); },
      }),
    ),
    h('p', { class: 'muted small' },
      rec.verdict === 'park' ? 'It’s your call either way. Going anyway counts as escape time.' : 'It’s your call either way.',
      running ? ` Go stops your ${labelOf(TIME_CATEGORIES, running.category).toLowerCase()} timer first.` : ''),
  );

  const decisionCards = primaryKind === 'avoid-first'
    ? [avoidCard, anchorCard, recCard]
    : [anchorCard, recCard, avoidCard];

  return h('div', { class: 'view' },
    h('div', { class: 'stack' }, progress(RESULT_STEP), heading, resumedNote(d)),
    decisionCards,
    card({ title: 'Your answers', subtitle: 'Tap one to change it.', key: 'escape-answers' },
      h('div', { class: 'list' },
        rows.map((r) => listRow({
          key: `escape-edit-${r.step}`,
          title: r.label,
          meta: r.value,
          tone: r.flagged ? 'warn' : undefined,
          trailing: r.flagged ? badge('Leans park', 'warn') : null,
          onClick: () => go(env, r.step, { editing: true }),
        })),
      ),
    ),
    h('div', { class: 'row-between' },
      button('Back', { variant: 'ghost', icon: 'chevron-left', key: 'escape-result-back', onClick: () => go(env, STEP_COUNT - 1, { editing: false }) }),
      button('Start over', { variant: 'ghost', key: 'escape-reset', onClick: () => startOver(ctx) }),
    ),
  );
}

/**
 * Go: start the session timer first (it may ask about the running one); only once it started save the
 * check. A recommended Go is time-boxed build; going ahead after a Park logs as escape time.
 */
async function decideGo(env: Env): Promise<void> {
  const { ctx, d } = env;
  const gen = datasetGeneration();
  const recommended = draftVerdict(d, getState().bets, ctx.freshToday());
  const plan = goTimerPlan(recommended, d.want, DEFAULT_TIMEBOX_MIN);
  const r = await startTimerSafely(plan.category, plan.opts);
  if (!r.started || gen !== datasetGeneration()) return;
  const s = getState();
  const now = new Date();
  const check = buildEscapeCheck(d, {
    id: newId(), at: now.toISOString(), today: ctx.freshToday(), bets: s.bets, verdict: 'go', timeboxMin: DEFAULT_TIMEBOX_MIN,
  });
  const fromIdea = d.fromIdeaId;
  ctx.update((draft) => {
    draft.escapes.push(check);
    if (fromIdea) removeById(draft.parking, fromIdea);
  }, { force: true });
  forget(ctx);
  toast(`${goToastCopy(plan.opts.overridden, DEFAULT_TIMEBOX_MIN)}${r.logged ? ` ${stopMessage(r.logged)}` : ''}`, { tone: 'good' });
  ctx.navigate('today');
}

function decidePark(env: Env): void {
  const { ctx, d } = env;
  const s = getState();
  const now = new Date();
  const check = buildEscapeCheck(d, {
    id: newId(), at: now.toISOString(), today: ctx.freshToday(), bets: s.bets, verdict: 'park',
  });
  const fromIdea = d.fromIdeaId;
  const next = ctx.update((draft) => {
    draft.escapes.push(check);
    // A re-opened idea is replaced by the new parked copy (linked to this check), not duplicated.
    if (fromIdea) removeById(draft.parking, fromIdea);
    draft.parking.push(buildParkedIdea(check, newId()));
  }, { force: true });
  forget(ctx);
  toast(parkingCountCopy(next.parking.length), {
    action: { label: 'See it', onClick: () => ctx.navigate('bets') },
  });
  ctx.navigate('today');
}

/**
 * "Do that first (10 min)": a 10-minute Ops timer on the thing he's avoiding. The check isn't decided:
 * its answers stay on this device and the result screen waits for him (now with Go/Park as the main call).
 */
async function avoidFirst(env: Env): Promise<void> {
  const { ctx, d } = env;
  const text = d.avoiding.trim();
  if (!text) return;
  const gen = datasetGeneration();
  const r = await startTimerSafely('ops', { note: avoidTimerNote(text), timeboxMin: AVOID_FIRST_MIN });
  if (!r.started || gen !== datasetGeneration()) return;
  d.avoidFirstAt = new Date().toISOString();
  env.save();
  const msg = `${AVOID_FIRST_MIN} minutes on it. The escape check will be where you left it.${r.logged ? ` ${stopMessage(r.logged)}` : ''}`;
  toast(msg, canOfferWorry(d)
    ? { tone: 'good', action: { label: 'Put it in Heavy', onClick: () => addWorry(env) } }
    : { tone: 'good' });
  ctx.navigate('today');
}

function addWorry(env: Env): void {
  const { ctx, d } = env;
  const text = d.avoiding.trim();
  if (!text || text === d.worryText) return;
  d.worryText = text;
  try {
    ctx.update((draft) => { draft.worries.push(buildWorry(text, newId(), new Date().toISOString())); }, { force: true });
    env.save();
    toast('In Heavy. Triage it when you’re ready.', { tone: 'good' });
  } catch (err) {
    d.worryText = '';
    console.error('[anchor] could not save worry', err);
    toast('That didn’t save. Try again.', { tone: 'danger' });
  }
}
