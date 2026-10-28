// Inline SVG icons (24×24, stroke-based). Built with DOM APIs — no innerHTML.

import { s } from './dom.ts';
import type { ClassValue } from './dom.ts';

type Shape =
  | ['path', string]
  | ['circle', number, number, number]
  | ['rect', number, number, number, number, number?];

const ICONS = {
  today: [['circle', 12, 12, 4], ['path', 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41']],
  anchor: [['circle', 12, 5, 3], ['path', 'M12 22V8M5 12H2a10 10 0 0 0 20 0h-3']],
  bets: [['circle', 12, 12, 10], ['circle', 12, 12, 6], ['circle', 12, 12, 2]],
  funnel: [['path', 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z']],
  talks: [['path', 'M7.9 20A9 9 0 1 0 4 16.1L2 22z']],
  more: [['circle', 5, 12, 1], ['circle', 12, 12, 1], ['circle', 19, 12, 1]],
  heavy: [['circle', 12, 5, 3], ['path', 'M6.5 8a2 2 0 0 0-1.9 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.93-2.54L19.4 9.5A2 2 0 0 0 17.48 8z']],
  time: [['circle', 12, 12, 10], ['path', 'M12 6v6l4 2']],
  review: [['rect', 3, 4, 18, 18, 2], ['path', 'M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4']],
  settings: [['path', 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4']],
  plus: [['path', 'M12 5v14M5 12h14']],
  minus: [['path', 'M5 12h14']],
  check: [['path', 'M20 6 9 17l-5-5']],
  x: [['path', 'M18 6 6 18M6 6l12 12']],
  'chevron-right': [['path', 'm9 18 6-6-6-6']],
  'chevron-left': [['path', 'm15 18-6-6 6-6']],
  'chevron-down': [['path', 'm6 9 6 6 6-6']],
  'arrow-right': [['path', 'M5 12h14M12 5l7 7-7 7']],
  play: [['path', 'M6 3l14 9-14 9V3z']],
  stop: [['rect', 6, 6, 12, 12, 2]],
  lock: [['rect', 3, 11, 18, 11, 2], ['path', 'M7 11V7a5 5 0 0 1 10 0v4']],
  trash: [['path', 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2']],
  edit: [['path', 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z']],
  alert: [['circle', 12, 12, 10], ['path', 'M12 8v4M12 16h.01']],
  info: [['circle', 12, 12, 10], ['path', 'M12 16v-4M12 8h.01']],
  download: [['path', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3']],
  upload: [['path', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12']],
  sync: [['path', 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5']],
  sparkle: [['path', 'M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.5l-1.9-5.9L4 10.7l6.1-1.9z'], ['path', 'M19 17v4M17 19h4']],
  park: [['circle', 12, 12, 10], ['path', 'M10 15V9M14 15V9']],
  flag: [['path', 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7']],
  wind: [['path', 'M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2']],
  moon: [['path', 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z']],
  calendar: [['rect', 3, 4, 18, 18, 2], ['path', 'M16 2v4M8 2v4M3 10h18']],
  eye: [['path', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'], ['circle', 12, 12, 3]],
  'eye-off': [['path', 'M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20']],
  heart: [['path', 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z']],
  bolt: [['path', 'M13 2 3 14h9l-1 8 10-12h-9l1-8z']],
  target: [['circle', 12, 12, 10], ['circle', 12, 12, 6], ['circle', 12, 12, 2]],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

/** Decorative by default (aria-hidden). Pass `label` to make it meaningful. */
export function icon(name: IconName, opts: { size?: number; class?: ClassValue; label?: string } = {}): SVGSVGElement {
  const size = opts.size ?? 20;
  const shapes = (ICONS[name] ?? ICONS.info) as Shape[];
  const svg = s('svg', {
    class: ['icon', opts.class],
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': opts.label ? undefined : 'true',
    role: opts.label ? 'img' : undefined,
    'aria-label': opts.label,
    focusable: 'false',
  });
  for (const sh of shapes) {
    if (sh[0] === 'path') svg.appendChild(s('path', { d: sh[1] }));
    else if (sh[0] === 'circle') svg.appendChild(s('circle', { cx: sh[1], cy: sh[2], r: sh[3] }));
    else svg.appendChild(s('rect', { x: sh[1], y: sh[2], width: sh[3], height: sh[4], rx: sh[5] ?? 0 }));
  }
  return svg;
}
