// Funnel: cohorts/weeks as cards with conversions, bottleneck, cash per founder hour, and trends.
import type { FunnelRow, ViewContext } from '../core/types.ts';
import { h, srOnly } from '../core/dom.ts';
import type { Child } from '../core/dom.ts';
import {
  badge, button, card, confirmDialog, dateField, emptyState, focusNext, form, icon, iconButton, openSheet,
  progressBar, sectionHeader, segmented, stat, textArea, textField, toast,
} from '../core/ui.ts';
import type { SheetHandle } from '../core/ui.ts';
import { datasetGeneration, findById, getState, newId, removeById } from '../core/store.ts';
import { FUNNEL_MONEY, FUNNEL_STAGES, formatPercent, formatThb } from '../core/metrics.ts';
import { MENTOR_FLOOR_THB_PER_HOUR, TARGET_THB_PER_HOUR } from '../core/constants.ts';
import {
  REFERRAL_GOAL, REFERRAL_KILL, VERIFIED_TEST_GOAL, VERIFIED_TEST_KILL, bottleneckLine, cashView, firstErrorField,
  formatCount, isIntegerKey, missingStages, moneyFacts, parseFunnelForm, previewLine, referralNotice, rowSubtitle,
  rowToForm, rowsNewestFirst, stageItems, trendSeries, trendSummary, trendTone, trendUntracked,
} from './funnel.logic.ts';
import type { CashView, FunnelForm, FunnelFormErrors, FunnelFormField, FunnelNumberKey, StageItem, TrendPoint } from './funnel.logic.ts';

const pct = (v: number) => `${(Math.max(0, Math.min(1, v)) * 100).toFixed(2)}%`;
const LIST_RESET = { listStyle: 'none', margin: '0', padding: '0' };

export function render(ctx: ViewContext): HTMLElement {
  const rows = ctx.state.funnel;
  const refYear = Number(ctx.today.slice(0, 4));
  const openAdd = () => openEditor(ctx, null);

  if (!rows.length) {
    return h('div', { class: 'view' },
      emptyState({
        icon: 'funnel',
        text: 'Add your first cohort or week to see where people drop off.',
        action: { label: 'Add a row', icon: 'plus', variant: 'primary', onClick: openAdd },
      }),
    );
  }

  const referral = referralNotice(rows);
  return h('div', { class: 'view' },
    h('div', { class: 'stack' },
      h('p', { class: 'muted' }, 'Where people drop off, and what an hour of your time earns. Empty means unknown.'),
      referral
        ? card({ tone: 'warn', variant: 'flat', key: 'funnel-referral-notice' },
            h('p', { class: 'row small', style: { alignItems: 'flex-start' } },
              h('span', { class: 'text-warn shrink-0', style: { marginTop: '1px' } }, icon('flag', { size: 16 })),
              h('span', null, referral)))
        : null,
      button('Add a row', { variant: 'primary', icon: 'plus', block: true, key: 'funnel-add', onClick: openAdd }),
    ),
    h('section', { class: 'stack', 'aria-labelledby': 'funnel-rows-title' },
      sectionHeader('Rows', { subtitle: 'Newest first.', id: 'funnel-rows-title' }),
      rowsNewestFirst(rows).map((r) => rowCard(ctx, r, refYear)),
    ),
    trendCard(rows),
  );
}

// ---------------------------------------------------------------------------
// Row card
// ---------------------------------------------------------------------------

function rowCard(ctx: ViewContext, row: FunnelRow, refYear: number): HTMLElement {
  const name = row.label || 'Untitled';
  return card({
    as: 'article',
    key: `funnel-row:${row.id}`,
    class: 'funnel-row',
    title: name,
    subtitle: rowSubtitle(row, refYear),
    action: iconButton('edit', `Edit ${name}`, { key: `funnel-edit:${row.id}`, onClick: () => openEditor(ctx, row.id) }),
  },
  stagesBlock(row),
  h('hr', { class: 'divider' }),
  cashBlock(row),
  row.note ? h('p', { class: 'small muted prewrap' }, row.note) : null,
  );
}

function stagesBlock(row: FunnelRow): HTMLElement {
  const items = stageItems(row);
  const missing = missingStages(row);
  const hasBottleneck = items.some((i) => i.kind === 'step' && i.bottleneck);
  return h('div', { class: 'stack-sm funnel-stages' },
    h('p', { class: 'row small', style: { alignItems: 'flex-start' } },
      hasBottleneck ? h('span', { class: 'text-warn shrink-0', style: { marginTop: '1px' } }, icon('flag', { size: 16 })) : null,
      h('span', null, bottleneckLine(row)),
    ),
    items.length
      ? h('ul', { class: 'funnel-stages__list', style: { ...LIST_RESET, display: 'flex', flexDirection: 'column', gap: '2px' } },
          items.map(stageLi))
      : null,
    missing.length && items.length
      ? h('p', { class: 'tiny muted' }, `Not tracked yet: ${missing.join(' · ')}`)
      : null,
  );
}

function stageLi(item: StageItem): HTMLLIElement {
  if (item.kind === 'stage') {
    return h('li', { class: 'funnel-stage row-between', style: { minHeight: '28px' } },
      h('span', { class: 'small' }, item.label),
      h('span', { class: 'tnum strong' }, formatCount(item.value)),
    );
  }
  const tag = item.bottleneck ? badge('Bottleneck', 'warn', { icon: 'flag' }) : null;
  tag?.setAttribute('aria-hidden', 'true');
  return h('li', {
    class: 'funnel-step row',
    'data-tone': item.bottleneck ? 'warn' : undefined,
    style: {
      minHeight: '28px',
      paddingLeft: 'var(--space-2)',
      color: item.bottleneck ? 'var(--warn)' : 'var(--muted)',
      fontSize: 'var(--fs-sm)',
    },
  },
  h('span', { class: 'row', 'aria-hidden': 'true', style: { gap: '4px' } },
    icon('chevron-down', { size: 16 }),
    h('span', { class: 'tnum' }, item.text),
  ),
  srOnly(item.srText),
  tag,
  );
}

function cashBlock(row: FunnelRow): HTMLElement {
  const c = cashView(row);
  return h('div', { class: 'stack funnel-cash' },
    h('dl', { class: 'grid-3' },
      moneyFacts(row).map((f) => h('div', { class: 'stack-sm', style: { gap: '2px', minWidth: '0' } },
        h('dt', { class: 'label' }, f.label),
        h('dd', { class: 'tnum truncate' }, f.value),
      )),
    ),
    stat({ label: 'Cash per founder hour', value: c.value, tone: c.tone, sub: c.copy }),
    cashScale(c),
  );
}

function cashScale(c: CashView): HTMLElement {
  const tick = (at: number, text: string) => h('span', {
    class: 'tiny muted tnum',
    style: { position: 'absolute', left: pct(at), transform: 'translateX(-50%)', whiteSpace: 'nowrap' },
  }, text);
  return h('div', { class: 'funnel-cash-scale', role: 'img', 'aria-label': c.ariaLabel, style: { paddingTop: '4px' } },
    h('div', { class: 'progress__track', 'data-tone': c.tone === 'muted' ? undefined : c.tone, 'aria-hidden': 'true' },
      c.perHour !== null ? h('span', { class: 'progress__fill', style: { width: pct(c.fill) } }) : null,
      h('span', { class: 'progress__marker', style: { left: pct(c.floorAt) } }),
      h('span', { class: 'progress__marker', style: { left: pct(c.targetAt) } }),
    ),
    h('div', { 'aria-hidden': 'true', style: { position: 'relative', height: '1.25rem', marginTop: '8px' } },
      tick(c.floorAt, `${formatThb(MENTOR_FLOOR_THB_PER_HOUR)} floor`),
      tick(c.targetAt, `${formatThb(TARGET_THB_PER_HOUR)} target`),
    ),
  );
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

function trendCard(rows: FunnelRow[]): HTMLElement {
  return card({ title: 'Trend', subtitle: 'Oldest to newest. The line marks the SHIFT goal; amber is under its kill line.', class: 'funnel-trend' },
    trendBlock('Verified real-user test rate', 'Verified tests ÷ finished (or paid).', trendSeries(rows, 'verified'), VERIFIED_TEST_GOAL, VERIFIED_TEST_KILL),
    h('hr', { class: 'divider' }),
    trendBlock('Referral share', 'Friend/referral applies ÷ applied (or paid).', trendSeries(rows, 'referral'), REFERRAL_GOAL, REFERRAL_KILL),
  );
}

function trendBlock(title: string, how: string, points: TrendPoint[], goal: number, kill: number): HTMLElement {
  const summary = trendSummary(points);
  const goalText = formatPercent(goal);
  const head = [
    h('h4', { class: 'small strong' }, title),
    h('p', { class: 'tiny muted' }, `${how} Goal ${goalText}. Kill line under ${formatPercent(kill)}.`),
  ];
  // Nothing known on any row: one clear line instead of a column of dashes. (A typed 0 is known: those
  // rows say "… is 0, so there’s no rate." instead.)
  if (trendUntracked(points)) {
    return h('div', { class: 'stack-sm' }, ...head, h('p', { class: 'small text-warn' }, 'Not tracked on any row yet.'));
  }
  return h('div', { class: 'stack-sm' },
    ...head,
    summary ? h('p', { class: 'small' }, summary) : null,
    h('ul', { class: 'stack-sm', style: LIST_RESET },
      points.map((p) => h('li', { key: `funnel-trend:${title}:${p.id}` },
        p.value !== null
          ? progressBar({
              label: p.label, value: p.value, max: 1, size: 'sm',
              valueText: formatPercent(p.value), tone: trendTone(p.value, goal, kill),
              marker: goal, markerLabel: `Goal ${goalText}`,
            })
          : h('div', { class: 'progress' },
              h('div', { class: 'progress__head' },
                h('span', { class: 'progress__label' }, p.label),
                h('span', { class: 'progress__value muted tnum' }, h('span', { 'aria-hidden': 'true' }, '—'), srOnly('unknown')),
              ),
              p.missing ? h('p', { class: 'tiny muted' }, p.missing) : null,
            ),
      )),
    ),
  );
}

// ---------------------------------------------------------------------------
// Add / edit sheet
// ---------------------------------------------------------------------------

const PERIOD_OPTIONS = [
  { value: 'cohort' as const, label: 'Cohort' },
  { value: 'week' as const, label: 'Week' },
];

function fieldset(legend: string, hint: string | null, ...children: Child[]): HTMLFieldSetElement {
  return h('fieldset', { class: 'stack fieldset' },
    h('legend', { class: 'field__label', style: { marginBottom: 'var(--space-1)' } }, legend),
    hint ? h('p', { class: 'field__hint' }, hint) : null,
    ...children,
  );
}

function openEditor(ctx: ViewContext, id: string | null): void {
  const existing = id ? findById(getState().funnel, id) : undefined;
  if (id && !existing) {
    toast('That row is no longer here.');
    return;
  }
  const isNew = !existing;
  const f: FunnelForm = isNew
    ? ctx.draft<FunnelForm>('new', () => rowToForm(undefined, ctx.today))
    : rowToForm(existing, ctx.today);
  const rowId = existing?.id ?? newId();
  let errors: FunnelFormErrors = {};
  let handle: SheetHandle | null = null;
  let previewTimer: ReturnType<typeof setTimeout> | null = null;

  const rebuild = (focusSel?: string) => {
    if (!handle) return;
    const top = handle.body.scrollTop;
    handle.setContent(build);
    handle.body.scrollTop = top;
    if (focusSel) handle.el.querySelector<HTMLElement>(focusSel)?.focus();
  };

  const save = () => {
    const res = parseFunnelForm(f);
    if (!res.ok) {
      errors = res.errors;
      const first = firstErrorField(errors);
      rebuild(first ? `#funnel-${first}` : undefined);
      return;
    }
    handle?.close();
    let gone = false;
    ctx.update((d) => {
      const i = d.funnel.findIndex((r) => r.id === rowId);
      if (i >= 0) d.funnel[i] = { ...res.row, id: rowId };
      else if (isNew) d.funnel.push({ ...res.row, id: rowId });
      else gone = true; // deleted elsewhere while editing: don't bring it back
    }, { force: true });
    if (isNew) ctx.clearDraft('new');
    if (gone) toast('That row was deleted somewhere else, so this edit wasn’t saved.', { tone: 'warn' });
    else toast(isNew ? 'Row added.' : 'Saved.', { tone: 'good' });
  };

  const remove = async () => {
    const name = existing?.label || 'This row';
    const gen = datasetGeneration();
    const ok = await confirmDialog({
      title: 'Delete this row?',
      body: `“${name}” and its numbers will be removed.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok || datasetGeneration() !== gen) return;
    handle?.close();
    const out: { row?: FunnelRow; index: number } = { index: -1 };
    ctx.update((d) => {
      out.index = d.funnel.findIndex((r) => r.id === rowId);
      out.row = removeById(d.funnel, rowId);
    }, { force: true });
    const removed = out.row;
    if (!removed) return;
    toast('Row deleted.', {
      action: {
        label: 'Undo',
        onClick: () => {
          // An Undo from before an import, pull or erase must not write into the new data.
          if (datasetGeneration() !== gen) return;
          ctx.update((d) => {
            if (findById(d.funnel, removed.id)) return;
            d.funnel.splice(Math.max(0, Math.min(out.index, d.funnel.length)), 0, removed);
          }, { force: true });
        },
      },
    });
  };

  /** Drop a field's error as soon as it's edited (no rebuild, so typing is never interrupted). */
  const clearError = (field: FunnelFormField) => {
    if (!errors[field] || !handle) return;
    delete errors[field];
    const input = handle.el.querySelector<HTMLElement>(`#funnel-${field}`);
    input?.removeAttribute('aria-invalid');
    const rest = (input?.getAttribute('aria-describedby') ?? '').split(' ').filter((t) => t && t !== `funnel-${field}-error`);
    if (rest.length) input?.setAttribute('aria-describedby', rest.join(' '));
    else input?.removeAttribute('aria-describedby');
    input?.closest('.field')?.classList.remove('field--error');
    handle.el.querySelector(`#funnel-${field}-error`)?.remove();
  };

  function build(close: () => void): Child {
    const preview = h('p', { class: 'small', id: 'funnel-preview', 'aria-live': 'polite' }, previewLine(parseFunnelForm(f).row));
    const schedulePreview = () => {
      if (previewTimer) clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        const t = previewLine(parseFunnelForm(f).row);
        if (preview.textContent !== t) preview.textContent = t;
      }, 400);
    };
    const numField = (key: FunnelNumberKey, label: string) => textField({
      id: `funnel-${key}`,
      label,
      value: f.nums[key],
      inputmode: isIntegerKey(key) ? 'numeric' : 'decimal',
      enterkeyhint: 'next',
      error: errors[key],
      attrs: isIntegerKey(key) ? { pattern: '[0-9]*' } : undefined,
      onInput: (v) => { f.nums[key] = v; clearError(key); schedulePreview(); },
      onEnter: (_v, ev) => focusNext(ev),
    });

    return form({ onSubmit: save, ariaLabel: isNew ? 'Add a funnel row' : 'Edit funnel row', key: 'funnel-form' },
      textField({
        id: 'funnel-label', label: 'Name', value: f.label, placeholder: 'SHIFT[3] or Week 44',
        maxLength: 80, required: true, enterkeyhint: 'next', error: errors.label,
        onInput: (v) => { f.label = v; clearError('label'); },
        onEnter: (_v, ev) => focusNext(ev),
      }),
      segmented({
        id: 'funnel-period', label: 'Type', value: f.period, options: PERIOD_OPTIONS,
        onChange: (v) => { f.period = v; rebuild(`[data-key="funnel-period:${v}"]`); },
      }),
      dateField({
        id: 'funnel-date', label: 'Start date', optional: true, value: f.date,
        hint: 'Rows are ordered by this date.', error: errors.date,
        onInput: (v) => { f.date = v; clearError('date'); }, onChange: (v) => { f.date = v; clearError('date'); },
      }),
      fieldset('Stages', 'Leave a box empty if you don’t know. Empty means unknown, not zero.',
        h('div', { class: 'grid-2', style: { alignItems: 'end' } }, FUNNEL_STAGES.map((s) => numField(s.key, s.label))),
      ),
      fieldset('Money and time', null,
        h('div', { class: 'grid-2', style: { alignItems: 'end' } }, FUNNEL_MONEY.map((m) => numField(m.key, m.label))),
      ),
      textArea({ id: 'funnel-note', label: 'Note', optional: true, value: f.note, rows: 3, onInput: (v) => { f.note = v; } }),
      h('div', { class: 'card card--raised stack-sm', style: { padding: 'var(--space-3) var(--space-4)' } },
        h('p', { class: 'label' }, 'Preview'),
        preview,
      ),
      h('div', { class: 'row-between wrap' },
        isNew
          ? h('span')
          : button('Delete', { variant: 'danger', icon: 'trash', key: 'funnel-delete', onClick: () => { void remove(); } }),
        h('div', { class: 'row-end' },
          button('Cancel', {
            variant: 'ghost',
            onClick: () => { if (isNew) ctx.clearDraft('new'); close(); },
          }),
          button(isNew ? 'Add row' : 'Save', { variant: 'primary', type: 'submit', key: 'funnel-save' }),
        ),
      ),
    );
  }

  handle = openSheet({
    title: isNew ? 'Add a row' : `Edit ${existing?.label || 'row'}`,
    content: build,
    initialFocus: isNew ? '#funnel-label' : undefined,
    dismissOnBackdrop: false,
    onClose: () => { if (previewTimer) clearTimeout(previewTimer); },
  });
}
