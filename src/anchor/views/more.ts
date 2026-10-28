import type { ViewContext } from '../core/types.ts';
import { h } from '../core/dom.ts';
import { href } from '../core/router.ts';
import { icon, linkButton, listRow, sectionHeader } from '../core/ui.ts';
import type { IconName } from '../core/ui.ts';
import { APP_VERSION } from '../core/constants.ts';

const ITEMS: { route: 'heavy' | 'time' | 'review' | 'settings'; title: string; meta: string; icon: IconName }[] = [
  { route: 'heavy', title: 'Heavy', meta: 'Life admin, worries, a two-minute reset.', icon: 'heavy' },
  { route: 'time', title: 'Time', meta: 'Where this week’s hours went.', icon: 'time' },
  { route: 'review', title: 'Weekly review', meta: 'Two minutes: wins, the bets that are due, next week’s anchor.', icon: 'review' },
  { route: 'settings', title: 'Settings', meta: 'Profile, backups, sync, app lock.', icon: 'settings' },
];

/** The method in plain words: the six screens and what each one is for. */
const METHOD: readonly { name: string; icon: IconName; what: string; why: string }[] = [
  {
    name: 'Today', icon: 'anchor',
    what: 'One anchor: the one thing today that moves a number. Up to three small actions. Close the day at night.',
    why: 'Fewer fronts. One thing done beats five started.',
  },
  {
    name: 'Escape check', icon: 'sparkle',
    what: 'Want to build something new? Six quick questions first: which number, by when, for which bet.',
    why: 'Building can be a way to avoid the hard thing. The check makes that visible, then it’s your call.',
  },
  {
    name: 'Bets', icon: 'bets',
    what: 'Each bet says up front what keeps it alive and what ends it. Three active at most.',
    why: 'Decide with numbers you set before, not with how the week felt.',
  },
  {
    name: 'Talks', icon: 'talks',
    what: 'Short notes on real conversations with the people you serve.',
    why: 'What they actually did matters most. Opinions count least.',
  },
  {
    name: 'Funnel', icon: 'funnel',
    what: 'Where people drop off, and what an hour of your time earns.',
    why: 'Growth and money stay in view, not just the product.',
  },
  {
    name: 'Heavy', icon: 'heavy',
    what: 'Stressful things each get one next step, and a place to dump worries.',
    why: 'Written down, they stop running in the background.',
  },
];

function methodSection(): HTMLElement {
  return h('section', { class: 'stack', id: 'more-how', tabindex: -1, 'aria-labelledby': 'more-how-title' },
    sectionHeader('How Anchor works', {
      id: 'more-how-title',
      subtitle: 'Make the right move the easy one, and make escaping visible. Six screens:',
    }),
    // Utility classes only (the More screen has no stylesheet of its own).
    h('ol', { class: 'card list', role: 'list' },
      METHOD.map((m) => h('li', { class: 'row', style: { alignItems: 'flex-start', gap: 'var(--space-3)' } },
        h('span', { class: 'text-accent shrink-0', style: { paddingTop: '2px' } }, icon(m.icon, { size: 20 })),
        h('div', { class: 'stack-sm' },
          h('h3', null, m.name),
          h('p', { class: 'small' }, m.what),
          h('p', { class: 'small muted' }, m.why),
        ),
      )),
    ),
    h('p', { class: 'small muted' }, 'Once a week, the review closes the loop: your numbers, the bets that are due, and next week’s anchor.'),
  );
}

/** The arrival (route object) whose `section=how` jump already ran: re-renders of it don't jump again. */
let jumpedFor: object | null = null;

export function render(ctx: ViewContext): HTMLElement {
  const how = methodSection();
  // '#/more?section=how' (the first-run card's "How it works"): show the method. The links stay on top
  // because they're what this screen is opened for every day; the method is read once or twice.
  if (ctx.route.params.section === 'how' && jumpedFor !== ctx.route) {
    jumpedFor = ctx.route;
    // After the app's own route-change scroll to the top (it runs right after render).
    requestAnimationFrame(() => {
      if (!how.isConnected) return;
      how.scrollIntoView({ block: 'start' });
      how.focus({ preventScroll: true });
    });
  }
  return h('div', { class: 'view' },
    h('nav', { class: 'list', 'aria-label': 'More' },
      ITEMS.map((it) => listRow({
        href: href(it.route),
        key: `more:${it.route}`,
        leading: icon(it.icon, { size: 22 }),
        title: it.title,
        meta: it.meta,
      })),
    ),
    how,
    h('div', { class: 'stack-sm', style: { alignItems: 'center' } },
      linkButton('Privacy and your data', href('settings', { section: 'how' }), { variant: 'ghost', size: 'sm', key: 'more:how' }),
      h('p', { class: 'tiny muted tnum' }, `Anchor ${APP_VERSION}`),
    ),
  );
}
