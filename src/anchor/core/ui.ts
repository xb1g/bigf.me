// Shared UI components. Every function returns real DOM built with h(); user text is always text nodes.
// Styling lives in styles/anchor.css (class names noted per component).

import { cx, h } from './dom.ts';
import type { Child, ClassValue, Props } from './dom.ts';
import { icon } from './icons.ts';
import type { IconName } from './icons.ts';
import { formatElapsed } from './dates.ts';

export { icon };
export type { IconName };

/** Semantic colour. default = text, accent = pink, data = cyan, good/warn/danger, muted. */
export type Tone = 'default' | 'accent' | 'data' | 'good' | 'warn' | 'danger' | 'muted';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

export interface ButtonOpts {
  /** primary (pink, one per screen) · secondary (outlined) · ghost (text) · danger · subtle (raised surface). Default secondary. */
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  onClick?: (ev: MouseEvent) => void;
  key?: string;
  ariaLabel?: string;
  class?: ClassValue;
  /** Extra attributes/props passed to h(). */
  attrs?: Props;
}

function btnClass(o: ButtonOpts, extra?: ClassValue): string {
  return cx('btn', `btn--${o.variant ?? 'secondary'}`, o.size && o.size !== 'md' && `btn--${o.size}`, o.block && 'btn--block', o.class, extra);
}

function btnContent(label: Child, o: ButtonOpts): Child[] {
  return [o.icon ? icon(o.icon) : null, label === '' || label === null || label === undefined ? null : h('span', { class: 'btn__label' }, label), o.iconRight ? icon(o.iconRight) : null];
}

/** <button class="btn btn--{variant}">. Type defaults to "button". */
export function button(label: Child, opts: ButtonOpts = {}): HTMLButtonElement {
  return h('button', {
    ...opts.attrs,
    type: opts.type ?? 'button',
    class: btnClass(opts),
    disabled: opts.disabled ?? false,
    onClick: opts.onClick,
    key: opts.key,
    'aria-label': opts.ariaLabel,
  }, ...btnContent(label, opts));
}

/** <a class="btn"> for navigation (e.g. href('escape')). */
export function linkButton(label: Child, hrefValue: string, opts: Omit<ButtonOpts, 'type' | 'disabled'> = {}): HTMLAnchorElement {
  return h('a', {
    ...opts.attrs,
    href: hrefValue,
    class: btnClass(opts),
    onClick: opts.onClick,
    key: opts.key,
    'aria-label': opts.ariaLabel,
  }, ...btnContent(label, opts));
}

/** Square 44px icon-only button. `label` becomes aria-label + title. Default variant ghost. */
export function iconButton(name: IconName, label: string, opts: ButtonOpts = {}): HTMLButtonElement {
  return h('button', {
    ...opts.attrs,
    type: opts.type ?? 'button',
    class: btnClass({ variant: 'ghost', ...opts }, 'btn--icon'),
    disabled: opts.disabled ?? false,
    onClick: opts.onClick,
    key: opts.key,
    'aria-label': label,
    title: label,
  }, icon(name));
}

// ---------------------------------------------------------------------------
// Layout blocks
// ---------------------------------------------------------------------------

export interface CardOpts {
  title?: Child;
  subtitle?: Child;
  /** Small mono uppercase label above the title. */
  eyebrow?: string;
  /** Node shown at the top-right (e.g. an iconButton or badge). */
  action?: Node | null;
  tone?: Tone;
  /** raised = lighter surface; flat = no border. */
  variant?: 'default' | 'raised' | 'flat';
  /** Heading level for the title (default 3; 4 for cards nested under an h3 section). */
  titleLevel?: 2 | 3 | 4;
  as?: 'section' | 'div' | 'article';
  class?: ClassValue;
  key?: string;
  attrs?: Props;
}

/** .card — surface with optional header (eyebrow/title/subtitle/action) and body children. */
export function card(opts: CardOpts, ...children: Child[]): HTMLElement {
  const hasHeader = opts.title !== undefined || opts.eyebrow || opts.action || opts.subtitle !== undefined;
  const Title = opts.titleLevel === 2 ? 'h2' : opts.titleLevel === 4 ? 'h4' : 'h3';
  return h(opts.as ?? 'section', {
    ...opts.attrs,
    class: cx('card', opts.variant && opts.variant !== 'default' && `card--${opts.variant}`, opts.class),
    'data-tone': opts.tone && opts.tone !== 'default' ? opts.tone : undefined,
    key: opts.key,
  },
  hasHeader
    ? h('header', { class: 'card__header' },
        h('div', { class: 'card__heading' },
          opts.eyebrow ? h('p', { class: 'card__eyebrow label' }, opts.eyebrow) : null,
          opts.title !== undefined ? h(Title, { class: 'card__title' }, opts.title) : null,
          opts.subtitle !== undefined ? h('p', { class: 'card__subtitle' }, opts.subtitle) : null,
        ),
        opts.action ? h('div', { class: 'card__action' }, opts.action) : null,
      )
    : null,
  children.length ? h('div', { class: 'card__body' }, ...children) : null,
  );
}

/** h2/h3 heading row with optional subtitle and trailing action. */
export function sectionHeader(title: Child, opts: { subtitle?: Child; action?: Node | null; level?: 2 | 3; eyebrow?: string; id?: string } = {}): HTMLElement {
  const Tag = opts.level === 3 ? 'h3' : 'h2';
  return h('header', { class: 'section-header' },
    h('div', { class: 'section-header__text' },
      opts.eyebrow ? h('p', { class: 'label' }, opts.eyebrow) : null,
      h(Tag, { class: 'section-header__title', id: opts.id }, title),
      opts.subtitle !== undefined ? h('p', { class: 'section-header__subtitle' }, opts.subtitle) : null,
    ),
    opts.action ? h('div', { class: 'section-header__action' }, opts.action) : null,
  );
}

/** Tappable row (link or button) with title, meta line and trailing node/chevron. */
export function listRow(opts: {
  title: Child; meta?: Child; leading?: Node | null; trailing?: Node | null;
  href?: string; onClick?: (ev: MouseEvent) => void; key?: string; tone?: Tone; chevron?: boolean;
}): HTMLElement {
  const inner: Child[] = [
    opts.leading ? h('span', { class: 'list-row__leading' }, opts.leading) : null,
    h('span', { class: 'list-row__text' },
      h('span', { class: 'list-row__title' }, opts.title),
      opts.meta !== undefined ? h('span', { class: 'list-row__meta' }, opts.meta) : null,
    ),
    opts.trailing ? h('span', { class: 'list-row__trailing' }, opts.trailing) : null,
    (opts.chevron ?? Boolean(opts.href || opts.onClick)) ? icon('chevron-right', { class: 'list-row__chevron' }) : null,
  ];
  const common = { class: 'list-row', key: opts.key, 'data-tone': opts.tone && opts.tone !== 'default' ? opts.tone : undefined };
  if (opts.href) return h('a', { ...common, href: opts.href, onClick: opts.onClick }, ...inner);
  if (opts.onClick) return h('button', { ...common, type: 'button', onClick: opts.onClick }, ...inner);
  return h('div', common, ...inner);
}

/** Small pill label. */
export function badge(text: Child, tone: Tone = 'default', opts: { icon?: IconName; class?: ClassValue } = {}): HTMLSpanElement {
  return h('span', { class: cx('badge', opts.class), 'data-tone': tone === 'default' ? undefined : tone },
    opts.icon ? icon(opts.icon, { size: 14 }) : null, text);
}

/** Big number with a mono label. */
export function stat(opts: { label: string; value: Child; sub?: Child; tone?: Tone; key?: string }): HTMLDivElement {
  return h('div', { class: 'stat', 'data-tone': opts.tone && opts.tone !== 'default' ? opts.tone : undefined, key: opts.key },
    h('span', { class: 'stat__label label' }, opts.label),
    h('span', { class: 'stat__value tnum' }, opts.value),
    opts.sub !== undefined ? h('span', { class: 'stat__sub' }, opts.sub) : null,
  );
}

/** Empty state that teaches: one sentence + one button. */
export function emptyState(opts: {
  text: Child; icon?: IconName;
  action?: { label: string; onClick?: () => void; href?: string; icon?: IconName; variant?: ButtonVariant };
}): HTMLDivElement {
  const a = opts.action;
  return h('div', { class: 'empty' },
    opts.icon ? icon(opts.icon, { size: 28, class: 'empty__icon' }) : null,
    h('p', { class: 'empty__text' }, opts.text),
    a ? (a.href
      ? linkButton(a.label, a.href, { variant: a.variant ?? 'secondary', icon: a.icon, onClick: a.onClick ? () => a.onClick?.() : undefined })
      : button(a.label, { variant: a.variant ?? 'secondary', icon: a.icon, onClick: () => a.onClick?.() }))
      : null,
  );
}

/** Native <details> disclosure. Track `open` yourself (onToggle) if it must survive re-renders. */
export function disclosure(opts: { summary: Child; open?: boolean; onToggle?: (open: boolean) => void; key?: string; class?: ClassValue }, ...children: Child[]): HTMLDetailsElement {
  const d = h('details', { class: cx('disclosure', opts.class), open: opts.open ?? false, key: opts.key },
    h('summary', { class: 'disclosure__summary' }, h('span', null, opts.summary), icon('chevron-down', { class: 'disclosure__chevron' })),
    h('div', { class: 'disclosure__body' }, ...children),
  );
  if (opts.onToggle) d.addEventListener('toggle', () => opts.onToggle?.(d.open));
  return d;
}

/** <form novalidate> that calls onSubmit with default prevented. */
export function form(opts: { onSubmit: (form: HTMLFormElement, ev: SubmitEvent) => void; class?: ClassValue; key?: string; ariaLabel?: string }, ...children: Child[]): HTMLFormElement {
  const f = h('form', {
    class: cx('form', opts.class), novalidate: true, key: opts.key, 'aria-label': opts.ariaLabel,
    onSubmit: (ev: SubmitEvent) => { ev.preventDefault(); opts.onSubmit(f, ev); },
  }, ...children);
  return f;
}

// ---------------------------------------------------------------------------
// Fields (each returns the .field wrapper; the control gets id = opts.id and name = opts.id)
// ---------------------------------------------------------------------------

export interface FieldBase {
  /** Stable, unique id (used for <label for>, focus restore across re-renders). */
  id: string;
  label: Child;
  hint?: Child;
  error?: string | null;
  /** Shows "(optional)" next to the label. */
  optional?: boolean;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  class?: ClassValue;
}

function describedBy(o: FieldBase): string | undefined {
  const ids = [o.hint !== undefined ? `${o.id}-hint` : null, o.error ? `${o.id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

/** Wrap any control with label, hint and error. The control should carry id = opts.id. */
export function fieldWrap(o: FieldBase, control: Node): HTMLDivElement {
  return h('div', { class: cx('field', o.error && 'field--error', o.class) },
    h('label', { class: cx('field__label', o.hideLabel && 'sr-only'), htmlFor: o.id },
      o.label, o.optional ? h('span', { class: 'field__optional' }, ' (optional)') : null),
    control,
    o.hint !== undefined ? h('p', { class: 'field__hint', id: `${o.id}-hint` }, o.hint) : null,
    o.error ? h('p', { class: 'field__error', id: `${o.id}-error`, role: 'alert' }, o.error) : null,
  );
}

export interface TextFieldOpts extends FieldBase {
  value?: string;
  type?: 'text' | 'email' | 'url' | 'tel' | 'password' | 'search' | 'date' | 'time';
  placeholder?: string;
  inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search' | 'none';
  autocomplete?: string;
  maxLength?: number;
  required?: boolean;
  enterkeyhint?: 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
  min?: string;
  max?: string;
  onInput?: (value: string, ev: Event) => void;
  onChange?: (value: string, ev: Event) => void;
  /** Enter pressed (IME-safe). Default is prevented so forms do not submit twice. */
  onEnter?: (value: string, ev: KeyboardEvent) => void;
  attrs?: Props;
}

/** Labelled <input class="input">. */
export function textField(o: TextFieldOpts): HTMLDivElement {
  const input = h('input', {
    ...o.attrs,
    id: o.id,
    name: o.id,
    class: 'input',
    type: o.type ?? 'text',
    value: o.value ?? '',
    placeholder: o.placeholder,
    inputmode: o.inputmode,
    autocomplete: o.autocomplete ?? 'off',
    maxlength: o.maxLength,
    required: o.required ?? false,
    enterkeyhint: o.enterkeyhint,
    min: o.min,
    max: o.max,
    'aria-describedby': describedBy(o),
    'aria-invalid': o.error ? 'true' : undefined,
    onInput: o.onInput ? (ev: Event) => o.onInput?.((ev.target as HTMLInputElement).value, ev) : undefined,
    onChange: o.onChange ? (ev: Event) => o.onChange?.((ev.target as HTMLInputElement).value, ev) : undefined,
    onKeydown: o.onEnter ? (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); o.onEnter?.((ev.target as HTMLInputElement).value, ev); }
    } : undefined,
  });
  return fieldWrap(o, input);
}

function isNextStop(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if ((el as HTMLInputElement).disabled || el.closest('[hidden], [inert]')) return false;
  const details = el.closest('details');
  if (details && !details.open && !el.closest('summary')) return false; // inside a closed <details>
  if (!el.getClientRects().length) return false; // not rendered
  if (el instanceof HTMLInputElement) return !['button', 'submit', 'reset', 'hidden', 'image'].includes(el.type);
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  // Chip / segmented groups use a roving tabindex: stop on the group's focusable radio.
  return el.getAttribute('role') === 'radio' && el.getAttribute('tabindex') === '0';
}

/**
 * Enter in a single-line field that isn't the last one: move to the next field of its form instead of
 * submitting half a form. Blurs (closing the keyboard) when there is no next field.
 * Use as `onEnter: (_v, ev) => focusNext(ev)`.
 */
export function focusNext(ev: Event): void {
  const el = ev.target as HTMLInputElement | null;
  if (!el) return;
  const controls = el.form ? Array.from(el.form.elements) : [];
  const next = controls.slice(controls.indexOf(el) + 1).find(isNextStop);
  if (next) next.focus();
  else el.blur();
}

/** Labelled date input ('YYYY-MM-DD'). */
export function dateField(o: Omit<TextFieldOpts, 'type' | 'inputmode'>): HTMLDivElement {
  return textField({ ...o, type: 'date' });
}

export interface TextAreaOpts extends FieldBase {
  value?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  required?: boolean;
  onInput?: (value: string, ev: Event) => void;
  onChange?: (value: string, ev: Event) => void;
  attrs?: Props;
}

/** Labelled <textarea class="textarea">. */
export function textArea(o: TextAreaOpts): HTMLDivElement {
  const ta = h('textarea', {
    ...o.attrs,
    id: o.id,
    name: o.id,
    class: 'textarea',
    rows: o.rows ?? 3,
    placeholder: o.placeholder,
    maxlength: o.maxLength,
    required: o.required ?? false,
    'aria-describedby': describedBy(o),
    'aria-invalid': o.error ? 'true' : undefined,
    onInput: o.onInput ? (ev: Event) => o.onInput?.((ev.target as HTMLTextAreaElement).value, ev) : undefined,
    onChange: o.onChange ? (ev: Event) => o.onChange?.((ev.target as HTMLTextAreaElement).value, ev) : undefined,
  });
  ta.value = o.value ?? '';
  return fieldWrap(o, ta);
}

/** Parse a numeric text input. '' → undefined (unknown, not zero). Accepts '1,200' and '12.5'. */
export function parseNumberInput(raw: string): number | undefined {
  const t = raw.replace(/[,\s฿]/g, '');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export interface NumberFieldOpts extends FieldBase {
  /** undefined renders as empty (= unknown). */
  value?: number;
  /** Allow decimals (inputmode="decimal"); default integers (inputmode="numeric"). */
  decimal?: boolean;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  onInput?: (value: number | undefined, ev: Event) => void;
  onChange?: (value: number | undefined, ev: Event) => void;
  attrs?: Props;
}

/** Numeric text input (type=text + inputmode so iOS shows the number pad and empty stays empty). */
export function numberField(o: NumberFieldOpts): HTMLDivElement {
  const input = h('input', {
    ...o.attrs,
    id: o.id,
    name: o.id,
    class: 'input tnum',
    type: 'text',
    inputmode: o.decimal ? 'decimal' : 'numeric',
    pattern: o.decimal ? undefined : '[0-9]*',
    autocomplete: 'off',
    value: o.value === undefined ? '' : String(o.value),
    placeholder: o.placeholder,
    'aria-describedby': describedBy(o),
    'aria-invalid': o.error ? 'true' : undefined,
    onInput: o.onInput ? (ev: Event) => o.onInput?.(parseNumberInput((ev.target as HTMLInputElement).value), ev) : undefined,
    onChange: o.onChange ? (ev: Event) => o.onChange?.(parseNumberInput((ev.target as HTMLInputElement).value), ev) : undefined,
  });
  const control = o.prefix || o.suffix
    ? h('div', { class: 'input-affix' },
        o.prefix ? h('span', { class: 'input-affix__text', 'aria-hidden': 'true' }, o.prefix) : null,
        input,
        o.suffix ? h('span', { class: 'input-affix__text', 'aria-hidden': 'true' }, o.suffix) : null)
    : input;
  return fieldWrap(o, control);
}

export interface SelectFieldOpts<T extends string> extends FieldBase {
  value?: T | '';
  options: readonly { value: T; label: string }[];
  /** Adds a first empty option with this label (value ''). */
  placeholder?: string;
  onChange: (value: T | '', ev: Event) => void;
  attrs?: Props;
}

/** Labelled native <select class="select">. */
export function selectField<T extends string>(o: SelectFieldOpts<T>): HTMLDivElement {
  const sel = h('select', {
    ...o.attrs,
    id: o.id,
    name: o.id,
    class: 'select',
    value: o.value ?? '',
    'aria-describedby': describedBy(o),
    'aria-invalid': o.error ? 'true' : undefined,
    onChange: (ev: Event) => o.onChange((ev.target as HTMLSelectElement).value as T | '', ev),
  },
  o.placeholder !== undefined ? h('option', { value: '' }, o.placeholder) : null,
  ...o.options.map((opt) => h('option', { value: opt.value }, opt.label)));
  sel.value = o.value ?? '';
  return fieldWrap(o, h('div', { class: 'select-wrap' }, sel, icon('chevron-down', { class: 'select-wrap__chevron' })));
}

// ---------------------------------------------------------------------------
// Choice controls
// ---------------------------------------------------------------------------

export interface ChoiceOpts<T extends string> {
  /** Stable id; buttons get data-key `${id}:${value}`. */
  id: string;
  label: string;
  hideLabel?: boolean;
  /** Shows "(optional)" next to the label, like text fields. */
  optional?: boolean;
  value: T | undefined;
  options: readonly { value: T; label: Child; ariaLabel?: string }[];
  onChange: (value: T) => void;
  /** Tapping the selected option clears it (calls onClear). */
  onClear?: () => void;
  size?: 'sm' | 'md';
  class?: ClassValue;
}

function choiceGroup<T extends string>(o: ChoiceOpts<T>, kind: 'seg' | 'chips'): HTMLDivElement {
  const labelId = `${o.id}-label`;
  const buttons: HTMLButtonElement[] = [];
  const selectedIndex = o.options.findIndex((x) => x.value === o.value);
  const group = h('div', {
    class: cx(kind, o.size === 'sm' && `${kind}--sm`, o.class),
    role: 'radiogroup',
    'aria-labelledby': labelId,
    id: o.id,
  });
  o.options.forEach((opt, i) => {
    const selected = i === selectedIndex;
    const b = h('button', {
      type: 'button',
      class: kind === 'seg' ? 'seg__btn' : 'chip',
      role: 'radio',
      'aria-checked': selected ? 'true' : 'false',
      'aria-label': opt.ariaLabel,
      tabindex: selected || (selectedIndex < 0 && i === 0) ? 0 : -1,
      key: `${o.id}:${opt.value}`,
      onClick: () => {
        if (selected && o.onClear) o.onClear();
        else if (!selected) o.onChange(opt.value);
      },
      onKeydown: (ev: KeyboardEvent) => {
        const dir = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
        if (!dir) return;
        ev.preventDefault();
        const next = (i + dir + o.options.length) % o.options.length;
        buttons[next]?.focus();
        o.onChange(o.options[next].value);
      },
    }, opt.label);
    buttons.push(b);
    group.appendChild(b);
  });
  return h('div', { class: 'choice' },
    h('span', { class: cx('field__label', o.hideLabel && 'sr-only'), id: labelId },
      o.label, o.optional ? h('span', { class: 'field__optional' }, ' (optional)') : null),
    group,
  );
}

/** Segmented control (equal-width options in one row). */
export function segmented<T extends string>(o: ChoiceOpts<T>): HTMLDivElement {
  return choiceGroup(o, 'seg');
}

/** Wrapping chip group (single select). Use for quick picks like sleep 4–9+ or energy 1–5. */
export function chips<T extends string>(o: ChoiceOpts<T>): HTMLDivElement {
  return choiceGroup(o, 'chips');
}

/** − value + stepper. Value may be undefined (shows "—"). */
export function stepper(o: {
  id: string; label: string; hideLabel?: boolean; value: number | undefined;
  min: number; max: number; step?: number; format?: (v: number | undefined) => string;
  onChange: (v: number) => void;
}): HTMLDivElement {
  const step = o.step ?? 1;
  const fmt = o.format ?? ((v: number | undefined) => (v === undefined ? '—' : String(v)));
  const clamp = (v: number) => Math.min(o.max, Math.max(o.min, Math.round(v / step) * step));
  const start = o.value ?? o.min;
  const labelId = `${o.id}-label`;
  return h('div', { class: 'choice' },
    h('span', { class: cx('field__label', o.hideLabel && 'sr-only'), id: labelId }, o.label),
    h('div', { class: 'stepper', role: 'group', 'aria-labelledby': labelId, id: o.id },
      h('button', {
        type: 'button', class: 'stepper__btn', key: `${o.id}:dec`, 'aria-label': `Decrease ${o.label}`,
        disabled: o.value !== undefined && o.value <= o.min,
        onClick: () => o.onChange(clamp(o.value === undefined ? start : o.value - step)),
      }, icon('minus')),
      h('output', { class: 'stepper__value tnum', 'aria-live': 'polite' }, fmt(o.value)),
      h('button', {
        type: 'button', class: 'stepper__btn', key: `${o.id}:inc`, 'aria-label': `Increase ${o.label}`,
        disabled: o.value !== undefined && o.value >= o.max,
        onClick: () => o.onChange(clamp(o.value === undefined ? start : o.value + step)),
      }, icon('plus')),
    ),
  );
}

/** Full-width 44px+ checkbox row. Label text is clickable. */
export function checkboxRow(o: {
  id: string; label: Child; checked: boolean; onChange: (checked: boolean) => void;
  hint?: Child; strike?: boolean; trailing?: Node | null; disabled?: boolean;
}): HTMLDivElement {
  return h('div', { class: cx('check-row', o.checked && 'is-checked', o.strike && 'check-row--strike') },
    h('input', {
      type: 'checkbox', id: o.id, name: o.id, class: 'check-row__box', checked: o.checked, disabled: o.disabled ?? false,
      'aria-describedby': o.hint !== undefined ? `${o.id}-hint` : undefined,
      onChange: (ev: Event) => o.onChange((ev.target as HTMLInputElement).checked),
    }),
    h('label', { class: 'check-row__label', htmlFor: o.id },
      h('span', { class: 'check-row__text' }, o.label),
      o.hint !== undefined ? h('span', { class: 'check-row__hint', id: `${o.id}-hint` }, o.hint) : null,
    ),
    o.trailing ? h('div', { class: 'check-row__trailing' }, o.trailing) : null,
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

const pct = (v: number) => `${Math.max(0, Math.min(100, v * 100)).toFixed(2)}%`;

/** Horizontal bar. `marker` (0..1) draws a target tick. */
export function progressBar(o: {
  value: number; max: number; label: string; tone?: Tone; valueText?: string;
  /** Show the label/value row above the bar (default true). */
  showLabel?: boolean; marker?: number; markerLabel?: string; size?: 'sm' | 'md';
}): HTMLDivElement {
  const ratio = o.max > 0 ? Math.max(0, Math.min(1, o.value / o.max)) : 0;
  const valueText = o.valueText ?? `${o.value} of ${o.max}`;
  return h('div', { class: cx('progress', o.size === 'sm' && 'progress--sm'), 'data-tone': o.tone && o.tone !== 'default' ? o.tone : undefined },
    o.showLabel === false ? null : h('div', { class: 'progress__head' },
      h('span', { class: 'progress__label' }, o.label),
      h('span', { class: 'progress__value tnum' }, valueText),
    ),
    h('div', {
      class: 'progress__track', role: 'progressbar',
      'aria-label': o.label, 'aria-valuemin': 0, 'aria-valuemax': o.max, 'aria-valuenow': Math.min(o.value, o.max), 'aria-valuetext': valueText,
    },
      h('span', { class: 'progress__fill', style: { width: pct(ratio) } }),
      o.marker !== undefined ? h('span', { class: 'progress__marker', style: { left: pct(o.marker) }, title: o.markerLabel }) : null,
    ),
  );
}

/** Stacked split bar (e.g. build vs sell) with an optional target marker (0..1 from the left). */
export function splitBar(o: {
  label: string; parts: { label: string; value: number; tone: Tone }[];
  target?: number; targetLabel?: string; valueText?: string;
}): HTMLDivElement {
  const total = o.parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  return h('div', { class: 'split' },
    h('div', { class: 'progress__head' },
      h('span', { class: 'progress__label' }, o.label),
      o.valueText ? h('span', { class: 'progress__value tnum' }, o.valueText) : null,
    ),
    h('div', { class: 'split__track', role: 'img', 'aria-label': `${o.label}: ${o.valueText ?? o.parts.map((p) => `${p.label} ${p.value}`).join(', ')}` },
      total > 0
        ? o.parts.map((p) => h('span', { class: 'split__part', 'data-tone': p.tone, style: { width: pct(Math.max(0, p.value) / total) } }))
        : h('span', { class: 'split__empty' }),
      o.target !== undefined ? h('span', { class: 'split__target', style: { left: pct(o.target) }, title: o.targetLabel }) : null,
    ),
    h('div', { class: 'split__legend' },
      o.parts.map((p) => h('span', { class: 'split__key', 'data-tone': p.tone }, h('span', { class: 'split__dot', 'aria-hidden': 'true' }), p.label))),
  );
}

/** Circular progress (e.g. talks x/target). `center` overrides the middle text. */
export function progressRing(o: { value: number; max: number; label: string; size?: number; tone?: Tone; center?: Child }): HTMLDivElement {
  const size = o.size ?? 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = o.max > 0 ? Math.max(0, Math.min(1, o.value / o.max)) : 0;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const mk = (cls: string, dash?: string) => {
    const el = document.createElementNS(NS, 'circle');
    el.setAttribute('class', cls);
    el.setAttribute('cx', String(size / 2));
    el.setAttribute('cy', String(size / 2));
    el.setAttribute('r', String(r));
    el.setAttribute('stroke-width', String(stroke));
    if (dash) {
      el.setAttribute('stroke-dasharray', `${c} ${c}`);
      el.setAttribute('stroke-dashoffset', dash);
      el.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
    }
    return el;
  };
  svg.append(mk('ring__track'), mk('ring__fill', String(c * (1 - ratio))));
  return h('div', {
    class: 'ring', role: 'progressbar', 'aria-label': o.label,
    'aria-valuemin': 0, 'aria-valuemax': o.max, 'aria-valuenow': Math.min(o.value, o.max), 'aria-valuetext': `${o.value} of ${o.max}`,
    'data-tone': o.tone && o.tone !== 'default' ? o.tone : undefined, style: { width: `${size}px`, height: `${size}px` },
  }, svg, h('span', { class: 'ring__center tnum' }, o.center ?? `${o.value}/${o.max}`));
}

// ---------------------------------------------------------------------------
// Live elapsed clock (one shared 1s ticker; no re-render needed)
// ---------------------------------------------------------------------------

let ticker: ReturnType<typeof setInterval> | null = null;

/** Update every live clock. Stops the shared interval once none are left (only from the interval itself). */
function tickElapsed(fromInterval = true): void {
  const els = document.querySelectorAll<HTMLElement>('[data-elapsed-since]');
  if (!els.length) {
    if (fromInterval && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
    return;
  }
  const now = Date.now();
  els.forEach((el) => {
    const since = Date.parse(el.dataset.elapsedSince ?? '');
    if (Number.isNaN(since)) return;
    const ms = Math.max(0, now - since);
    const vis = el.querySelector<HTMLElement>('.elapsed__clock');
    const text = formatElapsed(ms);
    if (vis && vis.textContent !== text) vis.textContent = text;
    const box = Number(el.dataset.timeboxMin);
    if (box > 0) el.classList.toggle('is-over', ms > box * 60_000);
    const sr = el.querySelector<HTMLElement>('.elapsed__sr');
    const mins = Math.floor(ms / 60_000);
    if (sr && sr.dataset.min !== String(mins)) {
      sr.dataset.min = String(mins);
      const over = box > 0 && mins >= box ? `, past the ${box} minute timebox` : '';
      sr.textContent = `${mins} minute${mins === 1 ? '' : 's'} elapsed${over}`;
    }
  });
}

function ensureTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => tickElapsed(true), 1000);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ticker) tickElapsed(false);
  });
}

/**
 * Running clock for a timer: visible mm:ss / h:mm:ss (aria-hidden, updates 1/s, tabular digits)
 * plus a polite live region that updates once per minute. Adds .is-over past the timebox.
 */
export function liveElapsed(
  startedAt: string,
  opts: { timeboxMin?: number; class?: ClassValue; /** false = no live region (another clock already announces). */ live?: boolean } = {},
): HTMLSpanElement {
  const ms = Math.max(0, Date.now() - Date.parse(startedAt));
  const mins = Math.floor(ms / 60_000);
  const box = opts.timeboxMin ?? 0;
  const el = h('span', {
    class: cx('elapsed', opts.class, box > 0 && ms > box * 60_000 && 'is-over'),
    dataset: { elapsedSince: startedAt, timeboxMin: opts.timeboxMin },
  },
  h('span', { class: 'elapsed__clock tnum', 'aria-hidden': 'true' }, formatElapsed(Number.isNaN(ms) ? 0 : ms)),
  h('span', {
    class: 'elapsed__sr sr-only', 'aria-live': opts.live === false ? 'off' : 'polite', dataset: { min: mins },
  }, `${mins} minute${mins === 1 ? '' : 's'} elapsed`),
  );
  ensureTicker();
  return el;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export interface ToastOpts {
  tone?: 'default' | 'good' | 'warn' | 'danger';
  action?: { label: string; onClick: () => void };
  /** ms; default 3500 (6000 with an action). 0 = stays until dismissed. */
  durationMs?: number;
}

function toastRegion(): HTMLElement {
  let region = document.getElementById('anchor-toasts');
  if (!region) {
    region = h('div', { id: 'anchor-toasts', class: 'toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' });
    document.body.appendChild(region);
  }
  return region;
}

/** At most this many toasts on screen; a new one pushes out the oldest. */
const MAX_TOASTS = 2;

function syncToastRoom(region: HTMLElement): void {
  // While toasts are up, the page gets extra bottom room so they never sit on the last card for good.
  document.documentElement.classList.toggle('has-toasts', region.querySelector('.toast:not(.is-leaving)') !== null);
}

/** Show a short message above the tab bar. Returns a dismiss function. */
export function toast(message: string, opts: ToastOpts = {}): () => void {
  const region = toastRegion();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    if (timer) clearTimeout(timer);
    el.classList.add('is-leaving');
    syncToastRoom(region);
    setTimeout(() => { el.remove(); syncToastRoom(region); }, 180);
  };
  const el = h('div', {
    class: 'toast', 'data-tone': opts.tone && opts.tone !== 'default' ? opts.tone : undefined,
    dataset: { born: Date.now() },
  },
    h('span', { class: 'toast__text' }, message),
    opts.action ? h('button', { type: 'button', class: 'toast__action', onClick: () => { opts.action?.onClick(); dismiss(); } }, opts.action.label) : null,
    h('button', { type: 'button', class: 'toast__close', 'aria-label': 'Dismiss', onClick: dismiss }, icon('x', { size: 16 })),
  );
  (el as HTMLElement & { _dismiss?: () => void })._dismiss = dismiss;
  const live = Array.from(region.querySelectorAll<HTMLElement>('.toast:not(.is-leaving)'));
  for (const old of live.slice(0, Math.max(0, live.length - (MAX_TOASTS - 1)))) old.remove();
  region.appendChild(el);
  syncToastRoom(region);
  const ms = opts.durationMs ?? (opts.action ? 6000 : 3500);
  if (ms > 0) timer = setTimeout(dismiss, ms);
  return dismiss;
}

/**
 * Remove toasts (and their Undo actions). `olderThanMs` keeps toasts shown in the last N ms — the app
 * passes it on a route change so a toast fired right before navigating ("Parked.") still shows on the
 * new screen, while older ones from the previous screen go.
 */
export function clearToasts(opts: { olderThanMs?: number } = {}): void {
  const region = document.getElementById('anchor-toasts');
  if (!region) return;
  const now = Date.now();
  for (const el of Array.from(region.querySelectorAll<HTMLElement>('.toast'))) {
    const born = Number(el.dataset.born) || 0;
    if (opts.olderThanMs !== undefined && now - born < opts.olderThanMs) continue;
    const d = (el as HTMLElement & { _dismiss?: () => void })._dismiss;
    if (d) d(); else el.remove();
  }
  syncToastRoom(region);
}

// ---------------------------------------------------------------------------
// Sheet / dialogs (native <dialog>: focus trap, Esc, inert background)
// ---------------------------------------------------------------------------

let openModals = 0;

function lockScroll(on: boolean): void {
  openModals = Math.max(0, openModals + (on ? 1 : -1));
  document.documentElement.classList.toggle('has-modal', openModals > 0);
}

export interface SheetHandle {
  el: HTMLDialogElement;
  body: HTMLElement;
  close: () => void;
  /** Replace the sheet body (sheets are NOT re-rendered by the app on state change). */
  setContent: (content: Child | ((close: () => void) => Child)) => void;
}

/**
 * Bottom sheet on phones, centered dialog on desktop. Lives outside the view, so view re-renders
 * never touch it. Closes on Esc, the close button, or a backdrop tap (unless dismissOnBackdrop is false).
 */
export function openSheet(o: {
  title: string;
  content: Child | ((close: () => void) => Child);
  onClose?: () => void;
  /** 'dialog' = compact centered card (used by confirm/prompt). Default 'sheet'. */
  kind?: 'sheet' | 'dialog';
  /** Element (or selector inside the sheet) to focus first. */
  initialFocus?: string;
  /**
   * Close on a tap on the dimmed backdrop (default true). Pass false for form sheets so a stray tap
   * (e.g. trying to dismiss the keyboard) can't throw away typed text, or a function that returns
   * whether it may close now.
   */
  dismissOnBackdrop?: boolean | (() => boolean);
}): SheetHandle {
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const body = h('div', { class: 'sheet__body' });
  let closed = false;
  const dlg = h('dialog', { class: cx('sheet', o.kind === 'dialog' && 'sheet--dialog'), 'aria-labelledby': titleId },
    h('div', { class: 'sheet__panel' },
      h('header', { class: 'sheet__header' },
        // autofocus + tabindex=-1: showModal() lands on the title (announced, no keyboard pop-up).
        h('h2', { class: 'sheet__title', id: titleId, tabindex: -1, autofocus: !o.initialFocus }, o.title),
        iconButton('x', 'Close', { onClick: () => close(), class: 'sheet__close' }),
      ),
      body,
    ),
  );
  const close = () => {
    if (closed) return;
    closed = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    lockScroll(false);
    o.onClose?.();
  };
  const setContent = (content: Child | ((close: () => void) => Child)) => {
    body.replaceChildren();
    const c = typeof content === 'function' ? content(close) : content;
    const f = document.createDocumentFragment();
    const add = (x: Child): void => {
      if (x === null || x === undefined || x === false || x === true) return;
      if (Array.isArray(x)) x.forEach(add);
      else f.appendChild(x instanceof Node ? x : document.createTextNode(String(x)));
    };
    add(c);
    body.appendChild(f);
  };
  setContent(o.content);
  dlg.addEventListener('close', close);
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); close(); });
  // Backdrop tap: the click lands on the <dialog> itself, outside the panel.
  dlg.addEventListener('click', (ev) => {
    if (ev.target !== dlg) return;
    const allow = o.dismissOnBackdrop ?? true;
    if (typeof allow === 'function' ? allow() : allow) close();
  });
  document.body.appendChild(dlg);
  lockScroll(true);
  dlg.showModal();
  if (o.initialFocus) dlg.querySelector<HTMLElement>(o.initialFocus)?.focus({ preventScroll: true });
  return { el: dlg, body, close, setContent };
}

/** Yes/no confirmation. `requireText: 'ERASE'` makes the user type it before confirming. */
export function confirmDialog(o: {
  title: string; body?: Child; confirmLabel?: string; cancelLabel?: string; danger?: boolean; requireText?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    let typed = '';
    const confirmBtn = button(o.confirmLabel ?? 'Confirm', {
      variant: o.danger ? 'danger' : 'primary', type: 'submit', disabled: Boolean(o.requireText),
    });
    openSheet({
      title: o.title,
      kind: 'dialog',
      onClose: () => resolve(result),
      initialFocus: o.requireText ? '#confirm-require-text' : '.dialog__cancel',
      content: (close) => form({
        onSubmit: () => {
          if (o.requireText && typed.trim() !== o.requireText) return;
          result = true;
          close();
        },
      },
      o.body !== undefined ? h('div', { class: 'dialog__text' }, o.body) : null,
      o.requireText ? textField({
        id: 'confirm-require-text', label: `Type ${o.requireText} to confirm`, autocomplete: 'off',
        attrs: { autocapitalize: 'characters', spellcheck: false },
        onInput: (v) => { typed = v; confirmBtn.disabled = v.trim() !== o.requireText; },
      }) : null,
      h('div', { class: 'dialog__actions' },
        button(o.cancelLabel ?? 'Cancel', { variant: 'ghost', class: 'dialog__cancel', onClick: () => close() }),
        confirmBtn,
      )),
    });
  });
}

/** Ask for one line (or a few lines) of text. Resolves the trimmed text, or null if cancelled. */
export function promptDialog(o: {
  title: string; body?: Child; label: string; placeholder?: string; value?: string;
  required?: boolean; multiline?: boolean; confirmLabel?: string; cancelLabel?: string; danger?: boolean;
}): Promise<string | null> {
  return new Promise((resolve) => {
    let result: string | null = null;
    let value = o.value ?? '';
    let errorShown = false;
    openSheet({
      title: o.title,
      kind: 'dialog',
      onClose: () => resolve(result),
      initialFocus: '#prompt-dialog-input',
      content: (close) => {
        const fieldEl = o.multiline
          ? textArea({ id: 'prompt-dialog-input', label: o.label, value, placeholder: o.placeholder, rows: 3, onInput: (v) => { value = v; } })
          : textField({ id: 'prompt-dialog-input', label: o.label, value, placeholder: o.placeholder, enterkeyhint: 'done', onInput: (v) => { value = v; } });
        const err = h('p', { class: 'field__error', role: 'alert', hidden: true }, 'This one is needed.');
        return form({
          onSubmit: () => {
            const v = value.trim();
            if (o.required && !v) {
              if (!errorShown) { err.hidden = false; errorShown = true; }
              fieldEl.querySelector<HTMLElement>('input, textarea')?.focus();
              return;
            }
            result = v;
            close();
          },
        },
        o.body !== undefined ? h('div', { class: 'dialog__text' }, o.body) : null,
        fieldEl,
        err,
        h('div', { class: 'dialog__actions' },
          button(o.cancelLabel ?? 'Cancel', { variant: 'ghost', class: 'dialog__cancel', onClick: () => close() }),
          button(o.confirmLabel ?? 'Save', { variant: o.danger ? 'danger' : 'primary', type: 'submit' }),
        ));
      },
    });
  });
}
