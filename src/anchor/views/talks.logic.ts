// Pure helpers for the Talks view (Mom Test log). No window/document here.

import type { Bet, ID, ISODate, Talk, TalkRole } from '../core/types.ts';
import { TALK_CHANNELS, TALK_ROLES, labelOf } from '../core/constants.ts';
import { addWeeks, formatShortDate, isISODate, isoWeekday, weekKey, weekRange } from '../core/dates.ts';

export const ROLE_FILTER_ALL = 'all';
export type RoleFilter = TalkRole | typeof ROLE_FILTER_ALL;

/** Text limits for the add form. */
export const MAX_SHORT = 200;
export const MAX_LONG = 2000;

/** In-memory form state (view draft). Strings stay raw until save. */
export interface TalkDraft {
  date: ISODate;
  /** True once the user changed the date (otherwise it follows "today"). */
  dateTouched: boolean;
  role: TalkRole | '';
  channel: string;
  who: string;
  did: string;
  story: string;
  opinion: string;
  quote: string;
  nextStep: string;
  betId: string;
}

export interface TalkDraftErrors {
  date?: string;
  role?: string;
  body?: string;
}

export function emptyTalkDraft(today: ISODate): TalkDraft {
  return {
    date: today, dateTouched: false, role: '', channel: '', who: '',
    did: '', story: '', opinion: '', quote: '', nextStep: '', betId: '',
  };
}

export function draftFromTalk(t: Talk): TalkDraft {
  return {
    date: t.date, dateTouched: true, role: t.role, channel: t.channel ?? '', who: t.who ?? '',
    did: t.did ?? '', story: t.story ?? '', opinion: t.opinion ?? '', quote: t.quote ?? '',
    nextStep: t.nextStep ?? '', betId: t.betId ?? '',
  };
}

/** True when the draft has anything the user typed or picked (date alone does not count). */
export function isDraftDirty(d: TalkDraft): boolean {
  return Boolean(d.role || d.channel || [d.who, d.did, d.story, d.opinion, d.quote, d.nextStep, d.betId].some((s) => s.trim()));
}

export function hasErrors(e: TalkDraftErrors): boolean {
  return Boolean(e.date || e.role || e.body);
}

/**
 * Quick mode: only the quick fields are checked (role, and one line: what they did or a quote; a story or
 * opinion from "Add …" also counts). An empty date means today (or the talk's own date when editing).
 * The one extra check is a date that can't be right: a broken one, or a day that hasn't happened yet.
 */
export function validateTalkDraft(d: TalkDraft, today: ISODate): TalkDraftErrors {
  const e: TalkDraftErrors = {};
  const date = d.date.trim();
  if (date && !isISODate(date)) e.date = 'Pick a date, or leave it empty for today.';
  else if (date && date > today) e.date = 'That day hasn’t happened yet.';
  if (!d.role || !TALK_ROLES.some((r) => r.value === d.role)) e.role = 'Pick who it was.';
  if (![d.did, d.story, d.opinion, d.quote].some((s) => s.trim())) {
    e.body = 'Add one line: what they did, or something they said.';
  }
  return e;
}

/** Summary of the expander that holds everything beyond the quick fields. */
export const TALK_MORE_SUMMARY = 'Add story, opinion, channel, name, date, bet';
export const TALK_MORE_SUMMARY_EDIT = 'Story, opinion, channel, name, date, bet';

/** True when anything lives in the "Add …" fields (the date is shown in the edit's subtitle instead). */
export function hasExtraDetails(d: TalkDraft): boolean {
  return Boolean(d.channel || d.betId || [d.story, d.opinion, d.who].some((s) => s.trim()));
}

// ---------------------------------------------------------------------------
// Edit drafts vs. newer data (another tab, an import, a sync pull)
// ---------------------------------------------------------------------------

/** What an edit draft was started from: the talk as JSON, and the dataset generation at that moment. */
export interface TalkSource { id: ID; src: string; gen: number }

export function talkSource(t: Talk, gen: number): TalkSource {
  return { id: t.id, src: JSON.stringify(t), gen };
}

/**
 * 'fresh' = the draft still matches the talk. 'other' = it belongs to another talk.
 * 'stale' = the talk (or the whole dataset) changed since the draft started: saving it would write old
 * values back over newer ones, so the form must start again from the current talk.
 */
export function editDraftState(draft: TalkSource, current: TalkSource): 'fresh' | 'other' | 'stale' {
  if (draft.id !== current.id) return 'other';
  return draft.src === current.src && draft.gen === current.gen ? 'fresh' : 'stale';
}

/** Did the user change anything in an edit draft (compared with the talk it started from)? */
export function talkDraftEdited(d: TalkDraft, src: string): boolean {
  let original: Talk;
  try {
    original = JSON.parse(src) as Talk;
  } catch {
    return true;
  }
  const a = draftFromTalk(original);
  const keys: (keyof TalkDraft)[] = ['date', 'role', 'channel', 'who', 'did', 'story', 'opinion', 'quote', 'nextStep', 'betId'];
  return keys.some((k) => String(a[k]).trim() !== String(d[k]).trim());
}

export const STALE_EDIT_NOTICE = 'This talk changed somewhere else, so you’re seeing the latest version. Make your change again if it’s still needed.';

const opt = (s: string, max: number): string | undefined => {
  const t = s.trim().slice(0, max);
  return t ? t : undefined;
};

/**
 * Build a Talk from a valid draft. Empty optional fields are left out. An empty date becomes
 * `fallbackDate` (today for a new talk, the talk's own date when editing).
 */
export function buildTalk(d: TalkDraft, id: ID, fallbackDate?: ISODate): Talk {
  const date = d.date.trim();
  const t: Talk = {
    id,
    date: isISODate(date) ? date : (fallbackDate ?? date),
    role: (d.role || 'other') as TalkRole,
    channel: d.channel.trim(),
    did: d.did.trim().slice(0, MAX_LONG),
    story: d.story.trim().slice(0, MAX_LONG),
    opinion: d.opinion.trim().slice(0, MAX_LONG),
  };
  const who = opt(d.who, MAX_SHORT);
  const quote = opt(d.quote, MAX_LONG);
  const nextStep = opt(d.nextStep, MAX_SHORT);
  const betId = d.betId.trim() || undefined;
  if (who) t.who = who;
  if (quote) t.quote = quote;
  if (nextStep) t.nextStep = nextStep;
  if (betId) t.betId = betId;
  return t;
}

// ---------------------------------------------------------------------------
// Evidence strength (Mom Test: Did > Story > Opinion)
// ---------------------------------------------------------------------------

export type Evidence = 'did' | 'story' | 'opinion' | 'none';

export function talkEvidence(t: Pick<Talk, 'did' | 'story' | 'opinion'>): Evidence {
  if (t.did?.trim()) return 'did';
  if (t.story?.trim()) return 'story';
  if (t.opinion?.trim()) return 'opinion';
  return 'none';
}

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  did: 'Did',
  story: 'Story',
  opinion: 'Opinion only',
  none: 'Notes',
};

export function evidenceMix(talks: readonly Talk[]): Record<Evidence, number> {
  const mix: Record<Evidence, number> = { did: 0, story: 0, opinion: 0, none: 0 };
  for (const t of talks) mix[talkEvidence(t)] += 1;
  return mix;
}

// ---------------------------------------------------------------------------
// Weekly progress
// ---------------------------------------------------------------------------

export interface WeekProgress {
  count: number;
  target: number;
  remaining: number;
  met: boolean;
  /** Days left in the ISO week including today (Mon = 7 … Sun = 1). */
  daysLeft: number;
  lastWeek: number;
  /** Talks this week with a "Did" line. */
  withDid: number;
}

export function weekProgress(talks: readonly Talk[], today: ISODate, target: number): WeekProgress {
  const wk = weekKey(today);
  const prev = addWeeks(wk, -1);
  const tgt = Math.max(1, Math.round(target) || 1);
  let count = 0, lastWeek = 0, withDid = 0;
  for (const t of talks) {
    if (!isISODate(t.date)) continue;
    const k = weekKey(t.date);
    if (k === wk) {
      count += 1;
      if (talkEvidence(t) === 'did') withDid += 1;
    } else if (k === prev) lastWeek += 1;
  }
  return {
    count, target: tgt, remaining: Math.max(0, tgt - count), met: count >= tgt,
    daysLeft: 8 - isoWeekday(today), lastWeek, withDid,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One calm line about this week's talks. Never shaming. */
export function progressHeadline(p: WeekProgress): string {
  if (p.met) return p.count > p.target ? `Target met, plus ${p.count - p.target}. Nice listening.` : 'Target met. Anything more is a bonus.';
  if (p.count === 0) return 'None yet this week. One honest talk is a good start.';
  return `${p.remaining} to go, ${plural(p.daysLeft, 'day')} left.`;
}

/** Secondary line: last week + how many had real behaviour. */
export function progressDetail(p: WeekProgress): string {
  const parts = [`Last week: ${p.lastWeek}`];
  if (p.count > 0) parts.push(`${p.withDid} of ${p.count} with a Did`);
  return parts.join(' · ');
}

/** Toast after saving a new talk. `count` = talks this week including the new one. */
export function savedMessage(count: number, target: number, sameWeek: boolean): string {
  if (!sameWeek) return 'Talk saved.';
  if (count === target) return `Saved. That’s ${count} — target met.`;
  if (count > target) return `Saved. ${count} this week.`;
  return `Saved. ${count} of ${target} this week.`;
}

// ---------------------------------------------------------------------------
// List: filter + group by week
// ---------------------------------------------------------------------------

export function filterTalksByRole(talks: readonly Talk[], role: RoleFilter | string): Talk[] {
  if (!role || role === ROLE_FILTER_ALL) return talks.slice();
  return talks.filter((t) => t.role === role);
}

/** Roles that appear in the log, in TALK_ROLES order, with counts. */
export function rolesPresent(talks: readonly Talk[]): { role: TalkRole; label: string; count: number }[] {
  const counts = new Map<TalkRole, number>();
  for (const t of talks) counts.set(t.role, (counts.get(t.role) ?? 0) + 1);
  return TALK_ROLES.filter((r) => counts.has(r.value)).map((r) => ({ role: r.value, label: r.label, count: counts.get(r.value) ?? 0 }));
}

/** Filter options: All + roles present (+ the current filter even if it has no talks left). */
export function roleFilterOptions(talks: readonly Talk[], current: RoleFilter | string): { value: RoleFilter; label: string; ariaLabel: string }[] {
  const present = rolesPresent(talks);
  if (current && current !== ROLE_FILTER_ALL && !present.some((p) => p.role === current) && TALK_ROLES.some((r) => r.value === current)) {
    present.push({ role: current as TalkRole, label: roleLabel(current), count: 0 });
    present.sort((a, b) => roleIndex(a.role) - roleIndex(b.role));
  }
  return [
    { value: ROLE_FILTER_ALL, label: `All ${talks.length}`, ariaLabel: `All roles, ${plural(talks.length, 'talk')}` },
    ...present.map((p) => ({ value: p.role, label: `${p.label} ${p.count}`, ariaLabel: `${p.label}, ${plural(p.count, 'talk')}` })),
  ];
}

const roleIndex = (r: string) => TALK_ROLES.findIndex((x) => x.value === r);

export interface TalkWeekGroup {
  weekKey: string;
  start: ISODate;
  end: ISODate;
  talks: Talk[];
}

/**
 * Newest week first; inside a week newest date first. Same date: the one logged later first
 * (talks are appended, so a higher array index means added later).
 * Talks with a broken date are left out.
 */
export function groupTalksByWeek(talks: readonly Talk[]): TalkWeekGroup[] {
  const indexed = talks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => isISODate(t.date))
    .sort((a, b) => (a.t.date === b.t.date ? b.i - a.i : a.t.date < b.t.date ? 1 : -1));
  const groups: TalkWeekGroup[] = [];
  for (const { t } of indexed) {
    const wk = weekKey(t.date);
    let g = groups[groups.length - 1];
    if (!g || g.weekKey !== wk) {
      const r = weekRange(wk);
      g = { weekKey: wk, start: r.start, end: r.end, talks: [] };
      groups.push(g);
    }
    g.talks.push(t);
  }
  return groups;
}

/** 'This week' · 'Last week' · 'Week of 13 Oct'. */
export function weekHeading(wk: string, today: ISODate): string {
  const current = weekKey(today);
  if (wk === current) return 'This week';
  if (wk === addWeeks(current, -1)) return 'Last week';
  const refYear = Number(today.slice(0, 4));
  return `Week of ${formatShortDate(weekRange(wk).start, refYear)}`;
}

/** '27 Oct – 2 Nov · 3 talks'. */
export function weekSubheading(g: TalkWeekGroup, today: ISODate): string {
  const refYear = Number(today.slice(0, 4));
  return `${formatShortDate(g.start, refYear)} – ${formatShortDate(g.end, refYear)} · ${plural(g.talks.length, 'talk')}`;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function roleLabel(role: string): string {
  return labelOf(TALK_ROLES, role);
}

export function channelLabel(channel: string): string {
  return channel ? labelOf(TALK_CHANNELS, channel) : '';
}

/** A talk whose linked bet no longer exists (e.g. after an import) is saved without the link. */
export function withExistingBet(t: Talk, bets: readonly Pick<Bet, 'id'>[]): Talk {
  if (!t.betId || bets.some((b) => b.id === t.betId)) return t;
  const { betId: _gone, ...rest } = t;
  return rest;
}

/** Bets the form can link: active ones, plus the currently linked bet whatever its status. */
export function linkableBets(bets: readonly Bet[], currentId?: string): { value: string; label: string }[] {
  return bets
    .filter((b) => b.status === 'active' || (currentId && b.id === currentId))
    .map((b) => ({ value: b.id, label: b.status === 'active' ? (b.name || 'Untitled bet') : `${b.name || 'Untitled bet'} (${b.status})` }));
}
