// Tiny DOM builder. Text is always set via text nodes / textContent — never innerHTML.

export type Child = Node | string | number | boolean | null | undefined | Child[];

export type ClassValue = string | false | null | undefined | ClassValue[] | Record<string, boolean | null | undefined>;

export type StyleValue = string | Record<string, string | number | null | undefined>;

type Handler = (ev: any) => void;

export interface Props {
  /** 'a b', ['a', cond && 'b'], or { a: true, b: false }. */
  class?: ClassValue;
  /** CSS text or an object. Keys may be camelCase or '--custom-prop'. */
  style?: StyleValue;
  /** data-* attributes: { key: 'x' } → data-key="x". */
  dataset?: Record<string, string | number | boolean | null | undefined>;
  /** Called with the element after creation. */
  ref?: (el: any) => void;
  /** Stable identity used to restore focus across re-renders (sets data-key). */
  key?: string;
  /**
   * Event handlers: onClick, onInput, onChange, onSubmit, onKeydown, onFocusout, … (any `on` + event name).
   * Properties: value, checked, selected, indeterminate, disabled, hidden, open … are set as DOM properties.
   * Everything else is an attribute: true → present, false/null/undefined → omitted.
   */
  [name: string]: unknown;
}

/** Properties that must be set on the element object rather than as attributes. */
const PROPS = new Set(['value', 'checked', 'selected', 'indeterminate', 'defaultValue', 'defaultChecked', 'muted']);
/** Attributes that need literal "true"/"false" (like aria-*), not presence. */
const ENUMERATED = new Set(['spellcheck', 'draggable', 'contenteditable']);
const FORBIDDEN = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'srcdoc']);
const SVG_NS = 'http://www.w3.org/2000/svg';

export function cx(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (v: ClassValue): void => {
    if (!v) return;
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else for (const [k, on] of Object.entries(v)) if (on) out.push(k);
  };
  values.forEach(walk);
  return out.join(' ');
}

function applyStyle(el: HTMLElement | SVGElement, style: StyleValue): void {
  if (typeof style === 'string') {
    el.setAttribute('style', style);
    return;
  }
  for (const [k, v] of Object.entries(style)) {
    if (v === null || v === undefined || v === '') continue;
    if (k.startsWith('--') || k.includes('-')) el.style.setProperty(k, String(v));
    else (el.style as unknown as Record<string, string>)[k] = String(v);
  }
}

function applyProps(el: HTMLElement | SVGElement, props: Props | null | undefined): void {
  if (!props) return;
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (FORBIDDEN.has(name)) throw new Error(`dom.h: "${name}" is not allowed`);
    if (name === 'class' || name === 'className') {
      const c = cx(value as ClassValue);
      if (c) el.setAttribute('class', c);
    } else if (name === 'style') {
      applyStyle(el, value as StyleValue);
    } else if (name === 'dataset') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v !== undefined && v !== null && v !== false) (el as HTMLElement).dataset[k] = String(v);
      }
    } else if (name === 'ref') {
      (value as (e: unknown) => void)(el);
    } else if (name === 'key') {
      (el as HTMLElement).dataset.key = String(value);
    } else if (name === 'text' || name === 'textContent') {
      el.textContent = String(value);
    } else if (name.length > 2 && name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value as Handler);
    } else if (PROPS.has(name)) {
      (el as unknown as Record<string, unknown>)[name] = value;
    } else if (name === 'htmlFor') {
      el.setAttribute('for', String(value));
    } else if (typeof value === 'boolean' && (name.startsWith('aria-') || ENUMERATED.has(name))) {
      el.setAttribute(name, String(value));
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(name, '');
      else el.removeAttribute(name);
      // Keep the reflected property in sync for open/disabled/hidden etc.
      if (name in el && typeof (el as unknown as Record<string, unknown>)[name] === 'boolean') {
        (el as unknown as Record<string, unknown>)[name] = value;
      }
    } else {
      el.setAttribute(name, String(value));
    }
  }
}

function appendChildren(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) appendChildren(parent, c);
    else if (c instanceof Node) parent.appendChild(c);
    else parent.appendChild(document.createTextNode(String(c)));
  }
}

/**
 * Create an element. Children: nodes, strings/numbers (as safe text), arrays, or null/false (skipped).
 *   h('button', { class: 'btn', onClick: () => … }, 'Save')
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement;
export function h(tag: string, props?: Props | null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  // <select value> must be applied after its <option> children exist.
  if (tag === 'select' && props && props.value !== undefined && props.value !== null) {
    (el as HTMLSelectElement).value = String(props.value);
  }
  return el;
}

/** Create an SVG element (for icons, rings). */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** A DocumentFragment of children. */
export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

/** Replace all children of `el`. */
export function mount(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  appendChildren(el, children);
}

/** Set text safely. */
export function setText(el: Element, text: string | number): void {
  el.textContent = String(text);
}

/** True for inputs where the user types (keyboard up on phones). */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    const typing = ['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week'];
    return typing.includes(t) && !el.readOnly && !el.disabled;
  }
  return (el as HTMLElement).isContentEditable === true;
}

/** Visually hidden, screen-reader-only text. */
export function srOnly(text: string): HTMLSpanElement {
  return h('span', { class: 'sr-only' }, text);
}
