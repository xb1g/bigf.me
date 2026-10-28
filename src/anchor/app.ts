// Anchor boot: store → lock gate → shell (top bar + tabs) → route → view.
// Re-renders the current view on state change, but never while the user is typing
// in a text field of the view or has a pointer pressed (deferred until blur / pointerup).

import type { ActiveTimer, ISODate, PinnedDraft, Route, RouteName, UpdateOptions, ViewContext, ViewModule } from './core/types.ts';
import {
  eraseAll, extendTimebox, getState, initStore, onErase, onExternalChange, onPersistError, subscribe, update,
} from './core/store.ts';
import { h, isTextEntry } from './core/dom.ts';
import { currentRoute, href, navigate, normalizeHash, onRouteChange, ROUTE_META } from './core/router.ts';
import type { RouteMeta } from './core/router.ts';
import { bangkokHour, formatDate, formatDateTime, todayISO } from './core/dates.ts';
import { verifyPin } from './core/crypto.ts';
import { EVENING_HOUR, labelOf, SHUTDOWN_GRACE_HOUR, TIMEBOX_SNOOZE_MIN, TIME_CATEGORIES } from './core/constants.ts';
import { msUntilTimebox, timerCapMs, timerElapsedMs, timerOverCap, timerPastTimebox } from './core/metrics.ts';
import { button, clearToasts, confirmDialog, emptyState, form, icon, liveElapsed, textField, toast } from './core/ui.ts';
import type { IconName } from './core/ui.ts';
import { timeboxBannerText } from './views/time.logic.ts';
import { stopRunningTimer } from './views/timer-stop.ts';

import * as todayView from './views/today.ts';
import * as escapeView from './views/escape.ts';
import * as betsView from './views/bets.ts';
import * as funnelView from './views/funnel.ts';
import * as talksView from './views/talks.ts';
import * as heavyView from './views/heavy.ts';
import * as timeView from './views/time.ts';
import * as reviewView from './views/review.ts';
import * as settingsView from './views/settings.ts';
import * as moreView from './views/more.ts';

const VIEWS: Record<RouteName, ViewModule> = {
  today: todayView,
  escape: escapeView,
  bets: betsView,
  funnel: funnelView,
  talks: talksView,
  heavy: heavyView,
  time: timeView,
  review: reviewView,
  settings: settingsView,
  more: moreView,
};

const TABS: { tab: RouteMeta['tab']; label: string; icon: IconName }[] = [
  { tab: 'today', label: 'Today', icon: 'anchor' },
  { tab: 'bets', label: 'Bets', icon: 'bets' },
  { tab: 'funnel', label: 'Funnel', icon: 'funnel' },
  { tab: 'talks', label: 'Talks', icon: 'talks' },
  { tab: 'more', label: 'More', icon: 'more' },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let root: HTMLElement;
let shell: {
  app: HTMLElement; title: HTMLElement; sub: HTMLElement; right: HTMLElement; host: HTMLElement;
  banner: HTMLElement; tabs: Map<string, HTMLAnchorElement>;
} | null = null;
/** Wakes the shell when the running timer reaches its timebox or its cap (no state change happens then). */
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
let route: Route = { name: 'today', params: {} };
let currentView: ViewModule | null = null;
let locked = false;
let hiddenAt = 0;
let pointerDown = false;
let rafId = 0;
let forceNext = false;
let deferred = false;
let clockKey = '';
const drafts = new Map<string, object>();

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function makeCtx(r: Route): ViewContext {
  const now = new Date();
  const ns = r.name;
  const today = todayISO(now);
  return {
    state: getState(),
    today,
    freshToday: () => todayISO(),
    now,
    route: r,
    update: (mutator, opts?: UpdateOptions) => update(mutator, opts),
    navigate: (name, params) => navigate(name, params),
    replaceParams: (params) => {
      if (route.name !== ns) return;
      try { history.replaceState(history.state, '', href(ns, params)); } catch { return; }
      route = { name: ns, params: { ...params } };
    },
    rerender: () => requestRender(true),
    draft: <T extends object>(key: string, init: () => T): T => {
      const k = `${ns}:${key}`;
      let d = drafts.get(k) as T | undefined;
      if (!d) {
        d = init();
        drafts.set(k, d);
      }
      return d;
    },
    pinnedDraft: <T extends PinnedDraft>(key: string, init: (date: ISODate) => T, day: ISODate = today): T => {
      const k = `${ns}:${key}`;
      let d = drafts.get(k) as T | undefined;
      // Keep a dirty draft on its own date across midnight / 04:00; a clean one moves to the new day.
      if (!d || (d.date !== day && !d.dirty)) {
        d = init(day);
        drafts.set(k, d);
      }
      return d;
    },
    clearDraft: (key: string) => { drafts.delete(`${ns}:${key}`); },
    lockNow,
  };
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function buildShell(): NonNullable<typeof shell> {
  const title = h('h1', { class: 'topbar__title', id: 'page-title', tabindex: -1 });
  const sub = h('p', { class: 'topbar__sub' });
  const right = h('div', { class: 'topbar__right' });
  const host = h('div', { class: 'view-host', id: 'view' });
  const banner = h('div', { class: 'timebox-banner', role: 'status', 'aria-live': 'polite', hidden: true });
  const tabs = new Map<string, HTMLAnchorElement>();
  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Main' },
    h('div', { class: 'tabbar__inner' },
      TABS.map((t) => {
        const a = h('a', { class: 'tab', href: href(t.tab), key: `tab:${t.tab}` },
          icon(t.icon, { size: 22, class: 'tab__icon' }),
          h('span', { class: 'tab__label' }, t.label));
        tabs.set(t.tab, a);
        return a;
      }),
    ),
  );
  const app = h('div', { class: 'app' },
    h('a', { class: 'skip-link', href: '#view', onClick: (e: MouseEvent) => { e.preventDefault(); focusFirstIn(host); } }, 'Skip to content'),
    h('header', { class: 'topbar' },
      h('div', { class: 'topbar__inner' },
        h('div', { class: 'topbar__titles' }, title, sub),
        right,
      ),
      banner,
    ),
    h('main', { class: 'main', id: 'main' }, host),
    nav,
  );
  return { app, title, sub, right, host, banner, tabs };
}

function focusFirstIn(el: HTMLElement): void {
  const f = el.querySelector<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
  f?.focus();
}

function updateShell(): void {
  if (!shell) return;
  const meta = ROUTE_META[route.name];
  const state = getState();
  const today = todayISO();
  if (shell.title.textContent !== meta.title) shell.title.textContent = meta.title;
  const sub = route.name === 'today' ? formatDate(today) : '';
  if (shell.sub.textContent !== sub) shell.sub.textContent = sub;
  shell.sub.hidden = !sub;
  document.title = route.name === 'today' ? 'Anchor' : `${meta.title} · Anchor`;
  for (const [tab, a] of shell.tabs) {
    if (tab === meta.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  // Running timer chip (shared by every screen).
  const t = state.activeTimer;
  const key = t ? `${t.category}|${t.startedAt}|${t.timeboxMin ?? ''}` : '';
  if (shell.right.dataset.timer !== key) {
    shell.right.dataset.timer = key;
    shell.right.replaceChildren(
      t
        ? h('a', {
            class: 'timer-chip', href: href('today'), 'data-category': t.category,
            'aria-label': `${labelOf(TIME_CATEGORIES, t.category)} timer running. Open Today.`,
          },
          h('span', { class: 'timer-chip__dot', 'aria-hidden': 'true' }),
          h('span', { class: 'timer-chip__cat' }, labelOf(TIME_CATEGORIES, t.category)),
          liveElapsed(t.startedAt, { timeboxMin: t.timeboxMin }))
        : '',
    );
  }
  updateBanner(t);
}

/**
 * "Your 90 minutes are up. What moved?" on every screen once a time-boxed timer passes its box (and a
 * calm "still running" line for a timer past its cap). Stop asks "What moved?" (and when it stopped).
 */
function updateBanner(t: ActiveTimer | undefined): void {
  if (!shell) return;
  if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
  const now = new Date();
  const forgotten = Boolean(t && timerOverCap(t, now));
  const past = Boolean(t && timerPastTimebox(t, now));
  const show = Boolean(t) && (past || forgotten);
  if (t && !forgotten) {
    // Wake up at the next boundary: the end of the box, else the cap.
    const toBox = past ? null : msUntilTimebox(t, now);
    const toCap = timerCapMs(t) - timerElapsedMs(t, now);
    const wait = Math.max(0, Math.min(toBox ?? Infinity, toCap)) + 500;
    if (Number.isFinite(wait) && wait < 2 ** 31 - 1) bannerTimer = setTimeout(() => updateShell(), wait);
  }
  const key = show && t ? `${t.startedAt}|${t.timeboxMin ?? ''}|${forgotten}` : '';
  const el = shell.banner;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.hidden = !show;
  document.documentElement.classList.toggle('has-banner', show);
  if (!show || !t) { el.replaceChildren(); return; }
  const snooze = Boolean(t.timeboxMin) && !forgotten;
  el.replaceChildren(
    h('div', { class: 'timebox-banner__inner' },
      h('p', { class: 'timebox-banner__text' },
        t.timeboxMin && !forgotten
          ? timeboxBannerText(t)
          : `Your ${labelOf(TIME_CATEGORIES, t.category)} timer is still running from ${formatDateTime(t.startedAt)}.`),
      h('div', { class: 'timebox-banner__actions' },
        snooze
          ? button(`+${TIMEBOX_SNOOZE_MIN} min`, {
              variant: 'ghost', size: 'sm', key: 'banner-snooze',
              ariaLabel: `Keep going for ${TIMEBOX_SNOOZE_MIN} more minutes`,
              onClick: () => extendTimebox(TIMEBOX_SNOOZE_MIN),
            })
          : null,
        // Secondary: the screen below keeps its one primary action.
        button('Stop', { variant: 'secondary', size: 'sm', icon: 'stop', key: 'banner-stop', onClick: () => { void stopRunningTimer(); } }),
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function keyOf(el: Element): string | null {
  const he = el as HTMLElement;
  if (he.dataset?.key) return `[data-key="${CSS.escape(he.dataset.key)}"]`;
  if (he.id) return `#${CSS.escape(he.id)}`;
  const name = el.getAttribute('name');
  return name ? `[name="${CSS.escape(name)}"]` : null;
}

function errorView(err: unknown): HTMLElement {
  console.error('[anchor] view failed to render', err);
  return h('div', { class: 'view' },
    emptyState({
      icon: 'alert',
      text: 'This screen hit a snag. Your data is safe on this device.',
      action: { label: 'Reload', onClick: () => location.reload() },
    }));
}

function renderView(opts: { routeChanged?: boolean; initial?: boolean } = {}): void {
  if (!shell || locked) return;
  const host = shell.host;
  const active = document.activeElement;
  const focusSel = !opts.routeChanged && active && host.contains(active) ? keyOf(active) : null;
  let selection: [number | null, number | null] | null = null;
  if (focusSel && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
    try { selection = [active.selectionStart, active.selectionEnd]; } catch { selection = null; }
  }
  const y = window.scrollY;

  try { currentView?.cleanup?.(); } catch (err) { console.error('[anchor] cleanup failed', err); }
  const view = VIEWS[route.name];
  let el: HTMLElement;
  try {
    el = view.render(makeCtx(route));
  } catch (err) {
    el = errorView(err);
  }
  host.replaceChildren(el);
  currentView = view;
  updateShell();

  if (opts.routeChanged) {
    window.scrollTo(0, 0);
    // Move focus to the new page title so screen readers announce it (not on first paint).
    if (!opts.initial) shell.title.focus({ preventScroll: true });
    return;
  }
  if (window.scrollY !== y) window.scrollTo(0, y);
  if (focusSel) {
    const next = host.querySelector<HTMLElement>(focusSel);
    if (next) {
      next.focus({ preventScroll: true });
      if (selection && (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement)) {
        try { next.setSelectionRange(selection[0], selection[1]); } catch { /* type without selection API */ }
      }
    }
  }
}

function isEditingInView(): boolean {
  const a = document.activeElement;
  return Boolean(shell && a && shell.host.contains(a) && isTextEntry(a));
}

/** Coalesce to one render per frame; defer while typing/pressing unless forced. */
function requestRender(force = false): void {
  if (force) forceNext = true;
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (!shell || locked) return;
    updateShell();
    if (!forceNext && (pointerDown || isEditingInView())) {
      deferred = true;
      return;
    }
    forceNext = false;
    deferred = false;
    renderView();
  });
}

function resumeDeferred(): void {
  if (deferred) setTimeout(() => requestRender(), 0);
}

/** A toast younger than this survives a route change (it was fired by the action that navigated). */
const TOAST_CARRY_MS = 1000;

function closeOpenDialogs(): void {
  document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
}

/** Drop every draft of one view (keys are namespaced `${view}:…`). */
function clearViewDrafts(view: RouteName): void {
  for (const k of Array.from(drafts.keys())) if (k.startsWith(`${view}:`)) drafts.delete(k);
}

function onRoute(r: Route): void {
  const changed = r.name !== route.name || JSON.stringify(r.params) !== JSON.stringify(route.params);
  // Leaving the escape check only drops its in-memory copy. The answers are mirrored to this device
  // ('anchor:escape:draft', kept up to 12 h), so coming back resumes where he left off. The escape view
  // itself makes sure a plain '#/escape' never continues a re-opened parked idea's check.
  if (route.name === 'escape' && r.name !== 'escape') clearViewDrafts('escape');
  route = r;
  // Toasts belong to the screen they came from (a toast fired right before navigating still shows).
  if (changed) clearToasts({ olderThanMs: TOAST_CARRY_MS });
  if (!shell || locked) return;
  // Back/swipe-back with a sheet open: the sheet belongs to the screen being left, so close it
  // (like its Close button: drafts are kept; confirm dialogs resolve as "no").
  if (changed) closeOpenDialogs();
  forceNext = false;
  deferred = false;
  renderView({ routeChanged: changed });
}

function mountShell(): void {
  shell = buildShell();
  root.replaceChildren(shell.app);
  route = currentRoute();
  renderView({ routeChanged: true, initial: true });
}

// ---------------------------------------------------------------------------
// App lock (privacy screen — hides the UI; it does not encrypt local data)
// ---------------------------------------------------------------------------

function pinIsSet(): boolean {
  const l = getState().lock;
  return Boolean(l.pinHash && l.pinSalt);
}

function lockNow(): void {
  if (!pinIsSet() || locked) return;
  locked = true;
  try { currentView?.cleanup?.(); } catch { /* ignore */ }
  currentView = null;
  shell = null;
  document.querySelectorAll('dialog[open]').forEach((d) => (d as HTMLDialogElement).close());
  root.replaceChildren(lockScreen());
  document.documentElement.classList.remove('is-hidden');
}

function unlock(): void {
  locked = false;
  mountShell();
}

function lockScreen(): HTMLElement {
  let pin = '';
  let attempts = 0;
  let busy = false;
  const msg = h('p', { class: 'lock__msg', role: 'status', 'aria-live': 'polite' });
  const submit = button('Unlock', { variant: 'primary', type: 'submit', block: true, size: 'lg' });
  const pinField = textField({
    id: 'lock-pin', label: 'PIN', type: 'password', inputmode: 'numeric', autocomplete: 'off', maxLength: 8,
    enterkeyhint: 'go', attrs: { pattern: '[0-9]*', autofocus: true },
    onInput: (v) => { pin = v; },
  });
  const input = pinField.querySelector('input') as HTMLInputElement;
  const f = form({
    ariaLabel: 'Unlock Anchor',
    onSubmit: async () => {
      if (busy || !pin) return;
      const { pinHash, pinSalt } = getState().lock;
      if (!pinHash || !pinSalt) { unlock(); return; }
      busy = true;
      submit.disabled = true;
      msg.textContent = 'Checking…';
      const ok = await verifyPin(pin, pinSalt, pinHash).catch(() => false);
      busy = false;
      if (ok) { unlock(); return; }
      attempts++;
      pin = '';
      input.value = '';
      if (attempts >= 5) {
        msg.textContent = 'That didn’t match. Take a breath — try again in 30 seconds.';
        setTimeout(() => { attempts = 0; submit.disabled = false; msg.textContent = ''; }, 30_000);
      } else {
        submit.disabled = false;
        msg.textContent = 'That didn’t match. Try again.';
        input.focus();
      }
    },
  }, pinField, msg, submit);

  const forgot = h('details', { class: 'lock__forgot' },
    h('summary', null, 'Forgot your PIN?'),
    h('p', { class: 'small muted' },
      'The PIN only hides the screen. To remove it you have to erase Anchor’s data on this device. If sync is on, you can pull your data back afterwards.'),
    button('Erase this device', {
      variant: 'danger', size: 'sm',
      onClick: async () => {
        const ok = await confirmDialog({
          title: 'Erase this device?',
          body: 'Everything Anchor stored on this device is deleted. This can’t be undone.',
          confirmLabel: 'Erase', danger: true, requireText: 'ERASE',
        });
        if (!ok) return;
        eraseAll(); // also forgets the in-memory sync session and drafts (onErase hook in boot)
        unlock();
      },
    }),
  );

  return h('div', { class: 'lock' },
    h('div', { class: 'lock__panel' },
      h('img', { class: 'lock__mark', src: '/anchor/icon.svg', alt: '', width: 72, height: 72 }),
      h('h1', { class: 'lock__title' }, 'Anchor is locked'),
      h('p', { class: 'lock__sub muted' }, 'Enter your PIN to continue.'),
      f,
      forgot,
    ),
  );
}

function onVisibility(): void {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    // On <html>, so open sheets/dialogs and toasts (outside .app) are hidden from the app switcher too.
    if (pinIsSet()) document.documentElement.classList.add('is-hidden');
    return;
  }
  document.documentElement.classList.remove('is-hidden');
  maybeRelock();
  requestRender();
}

function maybeRelock(): void {
  if (!hiddenAt || locked || !pinIsSet()) { hiddenAt = 0; return; }
  const away = Date.now() - hiddenAt;
  hiddenAt = 0;
  if (away >= getState().lock.lockAfterMin * 60_000) lockNow();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const reg = () => navigator.serviceWorker.register('/anchor/sw.js', { scope: '/anchor/' }).catch(() => { /* offline install is best effort */ });
  if (document.readyState === 'complete') reg();
  else window.addEventListener('load', reg, { once: true });
}

function bindGlobalEvents(): void {
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  const release = () => { pointerDown = false; resumeDeferred(); };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  document.addEventListener('focusout', (ev) => {
    if (shell && ev.target instanceof Node && shell.host.contains(ev.target)) resumeDeferred();
  }, true);
  // Hide the tab bar while the on-screen keyboard is likely up.
  document.addEventListener('focusin', (ev) => {
    document.documentElement.classList.toggle('is-typing', isTextEntry(ev.target as Element));
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => document.documentElement.classList.toggle('is-typing', isTextEntry(document.activeElement)), 0);
  });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', (e) => { if (e.persisted) maybeRelock(); });
  // Day rollover, the 18:00 evening switch and the 04:00 end of late shutdowns re-render without a state change.
  const clock = () => `${todayISO()}|${bangkokHour() >= EVENING_HOUR}|${bangkokHour() < SHUTDOWN_GRACE_HOUR}`;
  clockKey = clock();
  setInterval(() => {
    const k = clock();
    if (k !== clockKey) {
      clockKey = k;
      requestRender();
    }
  }, 30_000);
}

function boot(): void {
  const el = document.getElementById('anchor-root');
  if (!el) return;
  root = el;
  // Registered before initStore: a first-run write that fails (storage blocked or full) must speak up too.
  onPersistError(() => {
    toast('Anchor can’t save on this device right now. Download a backup from Settings to keep your changes.', { tone: 'danger', durationMs: 0 });
  });
  const { recovered } = initStore();
  onExternalChange(({ dropped }) => {
    // Edits made here are re-applied on top of the other tab's copy; this only speaks when one couldn't be.
    if (dropped) toast('Anchor changed in another tab. Your last edit here couldn’t be kept — check it.', { tone: 'warn', durationMs: 6000 });
  });
  // Erasing (Settings, the lock screen, or another tab) must also forget secrets, unsaved text, open
  // sheets and Undo toasts held in memory here; in-flight sync checks datasetGeneration() and stops.
  onErase(({ remote }) => {
    settingsView.clearSyncSession();
    drafts.clear();
    closeOpenDialogs();
    clearToasts();
    if (remote) {
      toast('Anchor was erased in another tab. Starting fresh here too.', { tone: 'warn', durationMs: 6000 });
      requestRender(true);
    }
  });
  normalizeHash();
  subscribe((_s, _p, opts) => requestRender(Boolean(opts.force)));
  onRouteChange(onRoute);
  bindGlobalEvents();
  registerServiceWorker();
  if (pinIsSet()) {
    locked = true;
    root.replaceChildren(lockScreen());
  } else {
    mountShell();
  }
  root.removeAttribute('aria-busy');
  if (recovered) toast('Saved data couldn’t be read, so Anchor started fresh. A copy was kept on this device.', { tone: 'warn', durationMs: 0 });
}

boot();
