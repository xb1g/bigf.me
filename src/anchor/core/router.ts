// Hash router: '#/today', '#/bets?id=abc'. parseHash/href are pure; navigate/onRouteChange use window.

import type { Route, RouteName } from './types.ts';

export const ROUTES: readonly RouteName[] = [
  'today', 'escape', 'bets', 'funnel', 'talks', 'heavy', 'time', 'review', 'settings', 'more',
];

export const DEFAULT_ROUTE: RouteName = 'today';

export interface RouteMeta {
  title: string;
  /** Which bottom tab is highlighted. */
  tab: 'today' | 'bets' | 'funnel' | 'talks' | 'more';
}

export const ROUTE_META: Record<RouteName, RouteMeta> = {
  today: { title: 'Today', tab: 'today' },
  escape: { title: 'Before you build', tab: 'today' },
  bets: { title: 'Bets', tab: 'bets' },
  funnel: { title: 'Funnel', tab: 'funnel' },
  talks: { title: 'Talks', tab: 'talks' },
  heavy: { title: 'Heavy', tab: 'more' },
  time: { title: 'Time', tab: 'more' },
  review: { title: 'Weekly review', tab: 'more' },
  settings: { title: 'Settings', tab: 'more' },
  more: { title: 'More', tab: 'more' },
};

export function isRouteName(x: string): x is RouteName {
  return (ROUTES as readonly string[]).includes(x);
}

/** '#/bets?id=1' → { name: 'bets', params: { id: '1' } }. Unknown/empty → today. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '').replace(/^\/+/, '');
  const q = raw.indexOf('?');
  const path = (q >= 0 ? raw.slice(0, q) : raw).replace(/\/+$/, '').toLowerCase();
  const params: Record<string, string> = {};
  if (q >= 0) {
    for (const [k, v] of new URLSearchParams(raw.slice(q + 1))) params[k] = v;
  }
  return isRouteName(path) ? { name: path, params } : { name: DEFAULT_ROUTE, params: {} };
}

/** Build a hash href: href('bets', { id }) → '#/bets?id=…'. */
export function href(name: RouteName, params?: Record<string, string>): string {
  const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : '';
  return `#/${name}${qs}`;
}

/** Current route from location.hash. */
export function currentRoute(): Route {
  return parseHash(window.location.hash);
}

/** Navigate. `replace: true` swaps the history entry instead of pushing. */
export function navigate(name: RouteName, params?: Record<string, string>, opts: { replace?: boolean } = {}): void {
  const target = href(name, params);
  if (window.location.hash === target) {
    // Same hash: still notify so the view re-renders (e.g. tapping the active tab).
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (opts.replace) {
    history.replaceState(history.state, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = target;
  }
}

/** Ensure the URL has a valid route (defaults to #/today without adding history). */
export function normalizeHash(): void {
  const r = parseHash(window.location.hash);
  const want = href(r.name, r.params);
  if (window.location.hash !== want) history.replaceState(history.state, '', want);
}

/** Listen for route changes. Returns an unsubscribe function. */
export function onRouteChange(fn: (route: Route) => void): () => void {
  const handler = () => fn(currentRoute());
  window.addEventListener('hashchange', handler);
  return () => window.removeEventListener('hashchange', handler);
}
