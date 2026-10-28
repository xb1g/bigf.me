import type { HeavyItem, ID, ViewContext, Worry } from '../core/types.ts';
import { h, srOnly } from '../core/dom.ts';
import type { Child } from '../core/dom.ts';
import { datasetGeneration, getState, newId } from '../core/store.ts';
import { href } from '../core/router.ts';
import { HEAVY_KINDS, HEAVY_STATUSES, labelOf } from '../core/constants.ts';
import { formatDateTime } from '../core/dates.ts';
import {
  badge, button, card, confirmDialog, dateField, disclosure, emptyState, focusNext, form, icon, iconButton,
  linkButton, openSheet, sectionHeader, segmented, selectField, textArea, textField, toast,
} from '../core/ui.ts';
import type { SheetHandle, Tone } from '../core/ui.ts';
import {
  BREATH_LABEL_PX, BREATH_ORB_INSET, BREATH_PHASE_SEC, BREATH_SQUARE_PX, HEAVY_ERROR_COPY,
  NO_NEXT_STEP_COPY, RESET_TOTAL_SEC,
  addWorry, breathAt, breathDotTarget, breathScale, buildHeavyItem, deadlineInfo, deleteHeavyItem, deleteWorry,
  emptyHeavyForm, formatRemaining, hasErrors, heavyFormFromItem, linkWorryToItem, linkWorryWithStep, linkedPreview,
  linkedWorries, needsNextStep, restoreWorry, setHeavyStatus, setWorryTriage, sortActiveHeavy, sortDoneHeavy,
  titleFromWorry, validateHeavyForm, worryBuckets,
} from './heavy.logic.ts';
import type { DeadlineState, HeavyFormErrors, HeavyFormInput, HeavyStatus } from './heavy.logic.ts';

// ---------------------------------------------------------------------------
// View-local state
// ---------------------------------------------------------------------------

/** The worry box. Nothing is stored until Save; `saved` shows the confirmation until the next keystroke. */
interface DumpDraft { text: string; error: string | null; saved: boolean; announce: boolean }
interface UiDraft {
  showDone: boolean;
  showArchive: boolean;
  /** Inline, animation-free confirmation after a triage (with Undo). `gen` = dataset it belongs to. */
  recent: { snapshot: Worry; text: string; gen: number } | null;
  /** data-key to focus once the next render is mounted. */
  focusKey: string | null;
  /** Route param id already scrolled to. */
  scrolledTo: string | null;
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let statusTimer: ReturnType<typeof setTimeout> | null = null;
/** The ui draft of the last render, so leaving the screen can forget which ?id= it already handled. */
let uiRef: UiDraft | null = null;

export function cleanup(): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = null;
  // Runs before every re-render and when leaving. On leaving, a later link to the same item
  // (e.g. Today's "No next step yet" again) should scroll to it and open it again.
  if (uiRef && !window.location.hash.startsWith('#/heavy')) uiRef.scrolledTo = null;
}

/** An Undo captured before an import, pull or erase must not write into the new data. */
const sameDataset = (gen: number) => datasetGeneration() === gen;

const nowIso = () => new Date().toISOString();

const DEADLINE_TONE: Record<DeadlineState, Tone> = {
  none: 'muted', overdue: 'warn', today: 'data', soon: 'data', later: 'default',
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Focus an element by data-key after the app mounts the next render. */
function focusKeySoon(key: string): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: false });
  }, 0);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export function render(ctx: ViewContext): HTMLElement {
  const ui = ctx.draft<UiDraft>('ui', () => ({ showDone: false, showArchive: false, recent: null, focusKey: null, scrolledTo: null }));
  const dump = ctx.draft<DumpDraft>('dump', () => ({ text: '', error: null, saved: false, announce: false }));
  uiRef = ui;
  const { state } = ctx;

  const root = h('div', { class: 'view heavy-view' },
    itemsSection(ctx, ui),
    worrySection(ctx, ui, dump),
    resetSection(),
    h('footer', { class: 'heavy-footer center' },
      // The whole line is the link: a quiet look, but a full 44px tap target.
      h('a', { href: 'tel:1323', class: 'heavy-hotline tiny' }, 'Thailand Mental Health Hotline 1323 (24 hours).'),
    ),
  );

  if (ui.focusKey) {
    const key = ui.focusKey;
    ui.focusKey = null;
    focusKeySoon(key);
  } else {
    const target = ctx.route.params.id;
    const item = target ? state.heavy.find((i) => i.id === target) : undefined;
    if (item && ui.scrolledTo !== item.id) {
      ui.scrolledTo = item.id;
      // `focus=next` (e.g. Today's "No next step yet" line): open the edit straight on the next step.
      const editNext = ctx.route.params.focus === 'next';
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        const el = document.getElementById(`heavy-item-${item.id}`);
        el?.scrollIntoView({ block: 'center' });
        el?.focus({ preventScroll: true });
        const latest = getState().heavy.find((i) => i.id === item.id);
        if (editNext && latest) openItemSheet(ctx, { item: latest, focus: 'next' });
      }, 0);
    }
  }
  return root;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function itemsSection(ctx: ViewContext, ui: UiDraft): HTMLElement {
  const active = sortActiveHeavy(ctx.state.heavy);
  const done = sortDoneHeavy(ctx.state.heavy);
  const addBtn = button('Add', { icon: 'plus', key: 'heavy-add', onClick: () => openItemSheet(ctx, {}) });

  return h('section', { class: 'stack', 'aria-labelledby': 'heavy-items-title' },
    sectionHeader('What you’re carrying', {
      id: 'heavy-items-title',
      subtitle: 'One next physical step each. Nearest date first.',
      action: active.length ? addBtn : null,
    }),
    active.length
      ? h('div', { class: 'list' }, active.map((it) => itemCard(ctx, it)))
      : emptyState({
          icon: 'heavy',
          text: done.length ? 'All clear for now. Add something when it shows up.' : 'Nothing here yet. Add one thing you keep carrying around.',
          action: { label: 'Add item', icon: 'plus', onClick: () => openItemSheet(ctx, {}) },
        }),
    done.length
      ? disclosure({
          summary: `Done · ${done.length}`,
          open: ui.showDone,
          key: 'heavy-done',
          onToggle: (open) => { ui.showDone = open; },
        },
        h('ul', { class: 'list', role: 'list' }, done.map((it) => h('li', { class: 'row-between', key: `heavy-done:${it.id}` },
          h('div', { class: 'grow' },
            h('p', { class: 'strong' }, it.title),
            h('p', { class: 'muted small' }, `${labelOf(HEAVY_KINDS, it.kind)} · done ${formatDateTime(it.updatedAt)}`),
          ),
          button('Reopen', {
            key: `heavy-reopen:${it.id}`,
            ariaLabel: `Reopen ${it.title}`,
            onClick: () => ctx.update((d) => { setHeavyStatus(d, it.id, 'open', nowIso()); }),
          }),
        ))))
      : null,
  );
}

function itemCard(ctx: ViewContext, it: HeavyItem): HTMLElement {
  const dl = deadlineInfo(it.deadline, ctx.today);
  const overdue = dl.state === 'overdue';
  const from = linkedPreview(ctx.state.worries, it.id);

  return card({
    as: 'article',
    key: `heavy-item:${it.id}`,
    eyebrow: labelOf(HEAVY_KINDS, it.kind),
    title: it.title,
    tone: overdue ? 'warn' : undefined,
    class: 'heavy-item',
    attrs: { id: `heavy-item-${it.id}`, tabindex: -1 },
    action: iconButton('edit', `Edit ${it.title}`, { key: `heavy-edit:${it.id}`, onClick: () => openItemSheet(ctx, { item: it }) }),
  },
  h('div', { class: 'stack-sm' },
    h('p', { class: 'label' }, 'Next step'),
    it.nextAction.trim()
      ? h('p', { class: 'prewrap' }, it.nextAction)
      : button([NO_NEXT_STEP_COPY, srOnly(` (${it.title})`)], {
          variant: 'subtle', block: true, icon: 'plus', class: 'heavy-next-empty', key: `heavy-next-add:${it.id}`,
          onClick: () => openItemSheet(ctx, { item: it, focus: 'next' }),
        }),
  ),
  h('div', { class: 'row wrap' },
    dl.state === 'none' ? null : badge(dl.text, DEADLINE_TONE[dl.state], { icon: 'calendar' }),
    it.status === 'waiting' ? badge('Waiting', 'muted') : null,
    it.helper ? badge(`With ${it.helper}`, 'default', { icon: 'heart' }) : null,
  ),
  overdue ? h('p', { class: 'muted small' }, 'Past the date. The next step still counts.') : null,
  it.notes ? h('p', { class: 'muted small prewrap' }, it.notes) : null,
  from
    ? h('div', { class: 'stack-sm heavy-from' },
        h('p', { class: 'label' }, from.label),
        h('ul', { class: 'stack-sm', role: 'list' }, from.texts.map((t) => h('li', { class: 'muted small prewrap heavy-from__text' }, t))),
        from.more ? h('p', { class: 'tiny muted' }, `+${from.more} more. All of them are under Edit.`) : null,
      )
    : null,
  segmented<HeavyStatus>({
    id: `heavy-status-${it.id}`,
    label: `Status of ${it.title}`,
    hideLabel: true,
    value: it.status,
    options: HEAVY_STATUSES,
    onChange: (v) => changeStatus(ctx, it.id, v),
  }),
  );
}

function changeStatus(ctx: ViewContext, id: ID, status: HeavyStatus): void {
  const before = getState().heavy.find((i) => i.id === id);
  if (!before || before.status === status) return;
  const prev = before.status;
  const prevAt = before.updatedAt;
  const at = nowIso();
  const gen = datasetGeneration();
  ctx.update((d) => { setHeavyStatus(d, id, status, at); });
  if (status === 'done') {
    toast('Done. One less thing to carry.', {
      tone: 'good',
      action: {
        label: 'Undo',
        onClick: () => { if (sameDataset(gen)) ctx.update((d) => { setHeavyStatus(d, id, prev, prevAt); }); },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Item sheet (add / edit / make a worry an action)
// ---------------------------------------------------------------------------

const FIELD_ORDER: (keyof HeavyFormErrors)[] = ['title', 'nextAction', 'deadline'];
const FIELD_ID: Record<keyof HeavyFormErrors, string> = { title: 'heavy-title', nextAction: 'heavy-next', deadline: 'heavy-deadline' };

/** "Make it an action" → part of an existing item: which one, and the next step typed for it. */
interface LinkDraft { to: ID | 'new'; next: string; error: string | null }

function openItemSheet(ctx: ViewContext, opts: { item?: HeavyItem; worry?: Worry; focus?: 'next' }): void {
  const { item, worry } = opts;
  const worryText = worry?.text.trim() ?? '';
  const worryTitle = worry ? titleFromWorry(worryText) : '';
  // New items and worry triage keep their text in a draft, so an accidental close never loses it.
  // Cleared on save or Cancel.
  const draftKey = item ? null : worry ? `worry:${worry.id}` : 'item-new';
  const linkKey = worry ? `link:${worry.id}` : null;
  const f: HeavyFormInput = item
    ? heavyFormFromItem(item)
    : ctx.draft<HeavyFormInput>(draftKey as string, () =>
        emptyHeavyForm({ title: worryTitle, notes: worry && worryTitle !== worryText ? worryText : '' }));
  const ld: LinkDraft = linkKey
    ? ctx.draft<LinkDraft>(linkKey, () => ({ to: 'new', next: '', error: null }))
    : { to: 'new', next: '', error: null };
  const dropDraft = () => {
    if (draftKey) ctx.clearDraft(draftKey);
    if (linkKey) ctx.clearDraft(linkKey);
  };
  const linkable = worry ? sortActiveHeavy(getState().heavy) : [];
  if (ld.to !== 'new' && !linkable.some((i) => i.id === ld.to)) ld.to = 'new';
  let errors: HeavyFormErrors = {};
  let handle: SheetHandle | null = null;

  const paint = (focusSel?: string) => {
    if (!handle) return;
    handle.setContent(build);
    if (focusSel) handle.body.querySelector<HTMLElement>(focusSel)?.focus();
  };

  const submitLink = (close: () => void) => {
    if (!worry || ld.to === 'new') return;
    const targetId = ld.to;
    const target = getState().heavy.find((i) => i.id === targetId);
    if (!target) {
      ld.to = 'new';
      paint('#heavy-link');
      toast('That item isn’t here anymore. Pick another, or make a new one.', { tone: 'warn' });
      return;
    }
    if (needsNextStep(target) && !ld.next.trim()) {
      ld.error = HEAVY_ERROR_COPY.nextAction;
      paint('#heavy-link-next');
      return;
    }
    const next = ld.next;
    const at = nowIso();
    let result = '';
    ctx.update((d) => { result = linkWorryWithStep(d, worry.id, targetId, next, at); }, { force: true });
    if (result === 'no-worry' || result === 'no-item') {
      close();
      toast('That changed somewhere else, so nothing was linked.', { tone: 'warn' });
      return;
    }
    dropDraft();
    close();
    toast(result === 'linked-step' ? `Linked to “${target.title}”. Next step updated.` : `Linked to “${target.title}”.`, { tone: 'good' });
  };

  const submit = (close: () => void) => {
    if (worry && ld.to !== 'new') {
      submitLink(close);
      return;
    }
    errors = validateHeavyForm(f, { requireNext: needsNextStep(item) });
    if (hasErrors(errors)) {
      const first = FIELD_ORDER.find((k) => errors[k]);
      paint(first ? `#${FIELD_ID[first]}` : undefined);
      return;
    }
    const id = item?.id ?? newId();
    const at = nowIso();
    let gone = false;
    ctx.update((d) => {
      const built = buildHeavyItem(f, id, at);
      const idx = d.heavy.findIndex((i) => i.id === id);
      if (idx >= 0) d.heavy[idx] = built;
      else if (item) gone = true; // deleted elsewhere while editing: don't bring it back
      else d.heavy.push(built);
      if (worry && !gone) linkWorryToItem(d, worry.id, id);
    }, { force: true });
    dropDraft();
    close();
    if (gone) {
      toast('That item was deleted somewhere else, so this edit wasn’t saved.', { tone: 'warn' });
      return;
    }
    toast(item ? 'Saved.' : worry ? 'Now it’s an action. One step at a time.' : 'Added. One step at a time.', { tone: 'good' });
  };

  const remove = async (close: () => void) => {
    if (!item) return;
    const gen = datasetGeneration();
    const linked = linkedWorries(getState().worries, item.id);
    const ok = await confirmDialog({
      title: 'Delete this item?',
      body: linked.length ? `Its ${plural(linked.length, 'linked worry', 'linked worries')} will move to Let go.` : 'You can undo right after.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok || !sameDataset(gen)) return;
    const snapItem = getState().heavy.find((i) => i.id === item.id);
    const snapWorries = linkedWorries(getState().worries, item.id).map((w) => ({ ...w }));
    ctx.update((d) => { deleteHeavyItem(d, item.id); }, { force: true });
    close();
    if (snapItem) {
      toast('Deleted.', {
        action: {
          label: 'Undo',
          onClick: () => {
            if (!sameDataset(gen)) return;
            ctx.update((d) => {
              if (!d.heavy.some((i) => i.id === snapItem.id)) d.heavy.push({ ...snapItem });
              snapWorries.forEach((w) => restoreWorry(d, w));
            }, { force: true });
          },
        },
      });
    }
  };

  const linkFields = (): Child => {
    const target = linkable.find((i) => i.id === ld.to);
    if (!target) return null;
    return textArea({
      id: 'heavy-link-next', label: 'Next physical action', value: ld.next, rows: 2, maxLength: 300,
      optional: !needsNextStep(target),
      placeholder: target.nextAction.trim() ? undefined : 'Who to message? Which document?',
      hint: target.nextAction.trim()
        ? 'Keep it, or write the step this worry needs first.'
        : 'This item has no next step yet. Add one if you can.',
      error: ld.error,
      onInput: (v) => { ld.next = v; },
    });
  };

  const build = (close: () => void): Child => {
    const linking = worry && ld.to !== 'new';
    const linked = item ? linkedWorries(getState().worries, item.id) : [];
    return form({ onSubmit: () => submit(close), ariaLabel: item ? 'Edit item' : 'New item', class: 'heavy-sheet-form' },
      worry
        ? h('div', { class: 'stack-sm' },
            h('p', { class: 'label' }, 'Your worry'),
            h('p', { class: 'prewrap muted' }, worryText),
          )
        : null,
      worry && linkable.length
        ? selectField<string>({
            id: 'heavy-link',
            label: 'Make it',
            value: ld.to,
            options: [{ value: 'new', label: 'A new item' }, ...linkable.map((i) => ({ value: i.id, label: `Part of: ${i.title}` }))],
            onChange: (v) => {
              ld.to = v || 'new';
              ld.next = linkable.find((i) => i.id === ld.to)?.nextAction ?? '';
              ld.error = null;
              errors = {};
              paint('#heavy-link');
            },
          })
        : null,
      linking ? linkFields() : [
        textField({
          id: 'heavy-title', label: 'What is it?', value: f.title, maxLength: 120, required: true,
          placeholder: 'e.g. Tax filing', error: errors.title, enterkeyhint: 'next',
          onInput: (v) => { f.title = v; }, onEnter: (_v, ev) => focusNext(ev),
        }),
        textArea({
          id: 'heavy-next', label: 'Next physical action', value: f.nextAction, rows: 2, maxLength: 300,
          required: needsNextStep(item), optional: !needsNextStep(item),
          placeholder: f.nextAction.trim() ? undefined : 'Who to message? Which document?',
          hint: 'Something your hands can do: call, write, send, find.', error: errors.nextAction,
          onInput: (v) => { f.nextAction = v; },
        }),
        h('div', { class: 'grid-2' },
          selectField({
            id: 'heavy-kind', label: 'Kind', value: f.kind, options: HEAVY_KINDS,
            onChange: (v) => { f.kind = v; },
          }),
          dateField({
            id: 'heavy-deadline', label: 'Deadline', optional: true, value: f.deadline, error: errors.deadline,
            onInput: (v) => { f.deadline = v; }, onChange: (v) => { f.deadline = v; },
          }),
        ),
        textField({
          id: 'heavy-helper', label: 'Who helps', optional: true, value: f.helper, maxLength: 80,
          placeholder: 'A name', enterkeyhint: 'next',
          onInput: (v) => { f.helper = v; }, onEnter: (_v, ev) => focusNext(ev),
        }),
        item
          ? segmented<HeavyStatus>({
              id: 'heavy-sheet-status', label: 'Status', value: f.status, options: HEAVY_STATUSES,
              onChange: (v) => { f.status = v; paint(`[data-key="heavy-sheet-status:${v}"]`); },
            })
          : null,
        textArea({
          id: 'heavy-notes', label: 'Notes', optional: true, value: f.notes, rows: 3, maxLength: 2000,
          onInput: (v) => { f.notes = v; },
        }),
        linked.length
          ? h('div', { class: 'stack-sm' },
              h('p', { class: 'label' }, 'Linked worries'),
              h('ul', { class: 'stack-sm', role: 'list' }, linked.map((w) => h('li', { class: 'muted small prewrap' }, w.text.trim()))),
            )
          : null,
      ],
      h('div', { class: 'dialog__actions' },
        item ? button('Delete', { variant: 'ghost', icon: 'trash', onClick: () => { void remove(close); }, attrs: { style: { marginRight: 'auto' } } }) : null,
        button('Cancel', { variant: 'ghost', onClick: () => { dropDraft(); close(); } }),
        button(linking ? 'Link' : item ? 'Save' : 'Add', { variant: 'primary', type: 'submit' }),
      ),
    );
  };

  handle = openSheet({
    title: item ? 'Edit' : worry ? 'Make it an action' : 'Add a heavy thing',
    content: build,
    initialFocus: opts.focus === 'next' ? '#heavy-next' : item || worry ? undefined : '#heavy-title',
    dismissOnBackdrop: false,
  });
}

// ---------------------------------------------------------------------------
// Worry dump + triage
// ---------------------------------------------------------------------------

const DUMP_SAVED = 'Saved. It’s in To sort below.';

function worrySection(ctx: ViewContext, ui: UiDraft, dump: DumpDraft): HTMLElement {
  const b = worryBuckets(ctx.state.worries, ctx.state.heavy);
  let status: HTMLElement | null = null;
  // "It's in To sort below" stops being true once everything is sorted.
  if (dump.saved && !b.toSort.length) dump.saved = false;

  const onInput = (v: string) => {
    dump.text = v;
    if (dump.error && v.trim()) dump.error = null;
    if (dump.saved) {
      dump.saved = false;
      if (status) status.textContent = '';
    }
  };

  // Explicit Save only: nothing is stored while typing, so there is one clear moment it's kept.
  const onSubmit = (f: HTMLFormElement) => {
    const box = f.querySelector<HTMLTextAreaElement>('#heavy-worry');
    const text = box ? box.value : dump.text;
    if (!text.trim()) {
      dump.text = text;
      dump.error = 'Write one line first. Anything is fine.';
      dump.saved = false;
      ctx.rerender();
      return;
    }
    const w = { id: newId(), at: nowIso(), text };
    ctx.update((d) => { addWorry(d, w); }, { force: true });
    // Reset in place: a keystroke that lands before the re-render starts the next worry.
    dump.text = '';
    dump.error = null;
    dump.saved = true;
    dump.announce = true;
    if (box) box.value = '';
  };

  // A live region only speaks when its text changes after it is on screen, so the confirmation is
  // written one tick after the post-save render mounts (and shown as plain text on later renders).
  const announce = dump.saved && dump.announce;
  if (announce) {
    dump.announce = false;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusTimer = null;
      if (status && dump.saved) status.textContent = DUMP_SAVED;
    }, 50);
  }

  const recent = ui.recent && ui.recent.gen === datasetGeneration() && getState().worries.some((w) => w.id === ui.recent?.snapshot.id)
    ? ui.recent
    : null;

  return h('section', { class: 'stack', 'aria-labelledby': 'heavy-worry-title' },
    sectionHeader('Worry dump', {
      id: 'heavy-worry-title',
      subtitle: 'Get it out of your head. Save it, sort it later.',
    }),
    form({ onSubmit, ariaLabel: 'Worry dump', class: 'card' },
      textArea({
        id: 'heavy-worry',
        label: 'What’s on your mind?',
        value: dump.text,
        rows: 3,
        maxLength: 2000,
        placeholder: 'Anything. One line is enough.',
        error: dump.error,
        onInput,
      }),
      h('div', { class: 'row-between heavy-dump-actions' },
        h('p', {
          class: 'small heavy-dump-status',
          role: 'status',
          'aria-live': 'polite',
          ref: (el: HTMLElement) => { status = el; },
        }, dump.saved && !announce ? DUMP_SAVED : ''),
        button('Save worry', { variant: 'primary', type: 'submit', key: 'heavy-worry-save' }),
      ),
    ),
    recent
      ? h('div', { class: 'card card--flat heavy-recent', role: 'status', 'data-tone': 'muted' },
          h('p', { class: 'small' }, recent.text),
          button('Undo', {
            variant: 'ghost',
            key: 'heavy-undo',
            onClick: () => {
              const snap = recent.snapshot;
              ui.recent = null;
              ui.focusKey = `worry-${snap.triage === 'waiting' ? 'waiting' : 'sort'}:${snap.id}:action`;
              ctx.update((d) => restoreWorry(d, snap), { force: true });
            },
          }),
        )
      : null,
    b.toSort.length
      ? h('div', { class: 'stack' },
          h('h3', null, `To sort · ${b.toSort.length}`),
          h('ul', { class: 'list', role: 'list' }, b.toSort.map((w) => worryCard(ctx, ui, w, 'sort'))),
        )
      : (b.waiting.length || b.letGo.length || b.actioned.length)
        ? h('p', { class: 'muted small' }, 'Nothing left to sort.')
        : null,
    b.waiting.length
      ? h('div', { class: 'stack' },
          h('h3', null, `Waiting on someone · ${b.waiting.length}`),
          h('ul', { class: 'list', role: 'list' }, b.waiting.map((w) => worryCard(ctx, ui, w, 'waiting'))),
        )
      : null,
    b.letGo.length
      ? disclosure({
          summary: `Let go · ${b.letGo.length}`,
          open: ui.showArchive,
          key: 'heavy-archive',
          onToggle: (open) => { ui.showArchive = open; },
        },
        h('ul', { class: 'list', role: 'list' }, b.letGo.map((w) => h('li', { class: 'stack-sm', key: `worry-archived:${w.id}` },
          h('p', { class: 'prewrap muted' }, w.text.trim()),
          h('div', { class: 'row-between' },
            h('p', { class: 'tiny muted' }, formatDateTime(w.at)),
            h('div', { class: 'row' },
              button('Bring back', {
                variant: 'ghost', key: `worry-back:${w.id}`, ariaLabel: `Bring back: ${titleFromWorry(w.text, 40)}`,
                onClick: () => ctx.update((d) => { setWorryTriage(d, w.id, undefined); }),
              }),
              iconButton('trash', `Delete for good: ${titleFromWorry(w.text, 40)}`, {
                key: `worry-del:${w.id}`,
                onClick: () => {
                  const snap = { ...w };
                  const gen = datasetGeneration();
                  ctx.update((d) => { deleteWorry(d, w.id); });
                  toast('Deleted.', {
                    action: { label: 'Undo', onClick: () => { if (sameDataset(gen)) ctx.update((d) => restoreWorry(d, snap)); } },
                  });
                },
              }),
            ),
          ),
        ))))
      : null,
  );
}

function worryCard(ctx: ViewContext, ui: UiDraft, w: Worry, where: 'sort' | 'waiting'): HTMLElement {
  const short = titleFromWorry(w.text, 40);
  const triage = (to: 'waiting' | 'let-go') => {
    const snap = { ...(getState().worries.find((x) => x.id === w.id) ?? w) };
    ui.recent = {
      snapshot: snap,
      text: to === 'let-go' ? 'Let go. It’s in the list below if you need it.' : 'Moved to waiting.',
      gen: datasetGeneration(),
    };
    ui.focusKey = 'heavy-undo';
    ctx.update((d) => { setWorryTriage(d, w.id, to); });
  };
  return h('li', { class: 'card card--raised', key: `worry:${w.id}` },
    h('p', { class: 'prewrap' }, w.text.trim()),
    h('p', { class: 'tiny muted' }, formatDateTime(w.at)),
    h('div', { class: 'row wrap', role: 'group', 'aria-label': `Sort: ${short}` },
      button('Make it an action', {
        icon: 'flag', key: `worry-${where}:${w.id}:action`,
        onClick: () => openItemSheet(ctx, { worry: w }),
      }),
      where === 'sort'
        ? button('Waiting on someone', { variant: 'subtle', key: `worry-${where}:${w.id}:waiting`, onClick: () => triage('waiting') })
        : null,
      button('Let it go', { variant: 'ghost', icon: 'wind', key: `worry-${where}:${w.id}:letgo`, onClick: () => triage('let-go') }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Reset: two-minute box breathing
// ---------------------------------------------------------------------------

function resetSection(): HTMLElement {
  return card({
    title: 'Reset · 2 min',
    subtitle: 'Box breathing: in 4, hold 4, out 4, hold 4.',
    action: icon('wind', { size: 22, class: 'text-data' }),
    class: 'heavy-reset',
  },
  button('Start reset', { icon: 'play', key: 'heavy-reset-start', onClick: () => openReset() }),
  );
}

const SQUARE = BREATH_SQUARE_PX;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Pause on 0:00 before the closing screen, so the countdown visibly ends. */
const END_PAUSE_MS = 900;

/**
 * Keep the phase word inside the circle: the label box is fixed (two lines at most), so if a long word
 * would still be clipped, step the font down a little. Runs once per step (every 4 s), at most a few passes.
 */
function fitLabel(el: HTMLElement): void {
  el.style.fontSize = '';
  let px = parseFloat(getComputedStyle(el).fontSize) || 16;
  while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && px > 11) {
    px -= 1;
    el.style.fontSize = `${px}px`;
  }
}

function openReset(): void {
  const reduced = prefersReducedMotion();
  let timer: ReturnType<typeof setInterval> | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let raf = 0;
  let startedAt = 0;
  let lastStep = -1;
  let lastSec = -1;
  let handle: SheetHandle | null = null;

  const stopClock = () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (endTimer) clearTimeout(endTimer);
    endTimer = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const first = breathAt(0);
  // Elements updated in place (the sheet is never re-rendered by the app).
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const phaseEl = h('p', { class: 'heavy-breath__label' }, first.label);
  const countEl = h('p', { class: 'heavy-breath__count tnum' }, String(first.count));
  const roundEl = h('span', { class: 'tnum' }, 'Getting ready');
  const leftEl = h('span', { class: 'tnum' }, `${formatRemaining(RESET_TOTAL_SEC)} left`);

  const tr = `${BREATH_PHASE_SEC * 1000}ms`;
  const dotAt = (x: number, y: number) => `translate(${x * (SQUARE - 2)}px, ${y * (SQUARE - 2)}px)`;
  const startDot = breathDotTarget(first.key);
  const dot = h('span', {
    class: 'heavy-breath__dot',
    style: { transform: dotAt(startDot.x, startDot.y), transition: `transform ${tr} linear` },
  });
  const orb = h('span', {
    class: 'heavy-breath__orb',
    style: { transform: `scale(${breathScale(first.key)})`, transition: `transform ${tr} ease-in-out` },
  });

  const stage = reduced
    ? h('div', { class: 'stack-sm center heavy-breath-text', 'aria-hidden': 'true' }, phaseEl, countEl)
    : h('div', {
        class: 'heavy-breath',
        'aria-hidden': 'true',
        // Sizes come from heavy.logic, where a test checks the label box fits the smallest circle.
        style: {
          '--breath-size': `${SQUARE}px`,
          '--breath-inset': `${BREATH_ORB_INSET * 100}%`,
          '--breath-label': `${BREATH_LABEL_PX}px`,
        },
      },
      h('span', { class: 'heavy-breath__frame' }),
      orb,
      h('span', { class: 'heavy-breath__center' }, phaseEl, countEl),
      dot,
    );

  const applyStep = (st: ReturnType<typeof breathAt>) => {
    phaseEl.textContent = st.label;
    if (!reduced) fitLabel(phaseEl);
    roundEl.textContent = st.leadIn ? 'Getting ready' : `Round ${st.round} of ${st.rounds}`;
    live.textContent = st.phase === 0 ? `Round ${st.round} of ${st.rounds}. ${st.label}.` : `${st.label}.`;
    if (!reduced) {
      const t = breathDotTarget(st.key);
      dot.style.transform = dotAt(t.x, t.y);
      orb.style.transform = `scale(${breathScale(st.key)})`;
    }
  };

  const showStart = () => {
    phaseEl.textContent = first.label;
    countEl.textContent = String(first.count);
    roundEl.textContent = 'Getting ready';
    leftEl.textContent = `${formatRemaining(RESET_TOTAL_SEC)} left`;
    if (!reduced) {
      // Jump back to the start without animating, then let the first step transition again.
      dot.style.transition = 'none';
      orb.style.transition = 'none';
      dot.style.transform = dotAt(startDot.x, startDot.y);
      orb.style.transform = `scale(${breathScale(first.key)})`;
      void dot.offsetWidth;
      dot.style.transition = `transform ${tr} linear`;
      orb.style.transition = `transform ${tr} ease-in-out`;
    }
  };

  const tick = () => {
    const st = breathAt(performance.now() - startedAt);
    if (st.done) {
      stopClock();
      countEl.textContent = '0';
      leftEl.textContent = `${formatRemaining(0)} left`;
      endTimer = setTimeout(() => { endTimer = null; finish('Two minutes, done.'); }, END_PAUSE_MS);
      return;
    }
    if (st.step !== lastStep) {
      lastStep = st.step;
      applyStep(st);
    }
    if (st.remainingSec !== lastSec) {
      lastSec = st.remainingSec;
      countEl.textContent = String(st.count);
      leftEl.textContent = `${formatRemaining(st.remainingSec)} left`;
    }
  };

  const start = () => {
    stopClock();
    lastStep = -1;
    lastSec = -1;
    showStart();
    // Two frames: the starting position paints first so the first move transitions.
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        raf = 0;
        startedAt = performance.now();
        tick();
        timer = setInterval(tick, 100);
      });
    });
  };

  const running = (close: () => void): Child => [
    h('p', { class: 'muted small' }, reduced ? 'Follow the words and the count.' : 'Follow the dot around the square.'),
    stage,
    live,
    h('p', { class: 'row-between muted small', 'aria-hidden': 'true' }, roundEl, leftEl),
    h('div', { class: 'dialog__actions' },
      button('Stop', { variant: 'secondary', icon: 'stop', onClick: () => finish('Stopped early. That still counts.') }),
      button('Close', { variant: 'ghost', onClick: () => close() }),
    ),
  ];

  const finish = (headline: string) => {
    stopClock();
    handle?.setContent((close) => [
      h('div', { class: 'stack-sm', role: 'status' },
        h('p', { class: 'strong' }, headline),
        h('p', { class: 'muted' }, 'Next small step?'),
      ),
      h('div', { class: 'stack-sm' },
        linkButton('Go to Today', href('today'), { variant: 'primary', iconRight: 'arrow-right', block: true, onClick: () => close() }),
        button('Again', {
          variant: 'ghost', block: true, icon: 'wind',
          onClick: () => { handle?.setContent(running); start(); },
        }),
      ),
    ]);
    handle?.body.querySelector<HTMLElement>('a.btn')?.focus();
  };

  handle = openSheet({
    title: 'Reset · 2 minutes',
    content: running,
    onClose: stopClock,
  });
  start();
}
