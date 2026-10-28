// Pure helpers for the Funnel view. No window/document access.

import type { FunnelRow, ISODate } from '../core/types.ts';
import {
  FUNNEL_MONEY, FUNNEL_STAGES, cashBand, cashPerFounderHour, formatPercent, formatThb,
  funnelBottleneck, funnelConversions, referralShare, sortFunnelRows, stageLabel, verifiedTestRate,
} from '../core/metrics.ts';
import type { CashBand, Conversion, FunnelMoneyKey, FunnelStageKey } from '../core/metrics.ts';
import { formatDate, isISODate } from '../core/dates.ts';
import { MENTOR_FLOOR_THB_PER_HOUR, TARGET_THB_PER_HOUR } from '../core/constants.ts';

export type FunnelNumberKey = FunnelStageKey | FunnelMoneyKey;

export const FUNNEL_NUMBER_KEYS: readonly FunnelNumberKey[] = [
  ...FUNNEL_STAGES.map((s) => s.key),
  ...FUNNEL_MONEY.map((m) => m.key),
];

/** Default goal lines for the verified-test rate and the referral share trends. */
export const VERIFIED_TEST_GOAL = 0.6;
export const REFERRAL_GOAL = 0.2;
/** Default kill lines for the same two trends. */
export const VERIFIED_TEST_KILL = 0.3;
export const REFERRAL_KILL = 0.1;

/** Fixed cash scale (฿0 → ฿400/h) so the floor and target ticks never move or overlap. */
export const CASH_SCALE_MAX = 400;

const known = (v: number | undefined | null): v is number => typeof v === 'number' && Number.isFinite(v);

/** 1200 → '1,200'; 12.5 → '12.5'. */
export function formatCount(v: number): string {
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** 'a', 'a and b', 'a, b and c'. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Form (raw strings in, validated row out)
// ---------------------------------------------------------------------------

export interface FunnelForm {
  label: string;
  period: 'cohort' | 'week';
  date: string;
  note: string;
  nums: Record<FunnelNumberKey, string>;
}

export type FunnelFormField = 'label' | 'date' | FunnelNumberKey;
export type FunnelFormErrors = Partial<Record<FunnelFormField, string>>;

export function emptyNums(): Record<FunnelNumberKey, string> {
  const out = {} as Record<FunnelNumberKey, string>;
  for (const k of FUNNEL_NUMBER_KEYS) out[k] = '';
  return out;
}

/** Form values for editing `row`, or a blank form dated `today`. Unknown numbers stay empty. */
export function rowToForm(row: FunnelRow | undefined, today: ISODate): FunnelForm {
  if (!row) return { label: '', period: 'cohort', date: today, note: '', nums: emptyNums() };
  const nums = emptyNums();
  for (const k of FUNNEL_NUMBER_KEYS) {
    const v = row[k];
    nums[k] = known(v) ? String(v) : '';
  }
  return { label: row.label, period: row.period, date: row.date ?? '', note: row.note ?? '', nums };
}

/** Stage counts are whole people; money and hours may have decimals. */
export function isIntegerKey(k: FunnelNumberKey): boolean {
  return k !== 'revenueThb' && k !== 'costThb' && k !== 'founderHours';
}

/** Parse one numeric box. '' → unknown (not zero). Accepts '1,200', '฿9,250', '12.5'. */
export function parseFunnelNumber(raw: string, integer: boolean): { value?: number; error?: string } {
  const t = raw.replace(/[,\s฿]/g, '');
  if (t === '') return {};
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return { error: 'Use a number, or leave it empty.' };
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: 'Use a number, or leave it empty.' };
  if (n < 0) return { error: 'Can’t be below zero.' };
  if (integer && !Number.isInteger(n)) return { error: 'Whole numbers only.' };
  return { value: n };
}

export type FunnelRowInput = Omit<FunnelRow, 'id'>;

/** Validate the form. `row` has only known numbers; empty boxes are left out (unknown). */
export function parseFunnelForm(form: FunnelForm): { ok: boolean; row: FunnelRowInput; errors: FunnelFormErrors } {
  const errors: FunnelFormErrors = {};
  const label = form.label.trim();
  if (!label) errors.label = 'Give it a name, like SHIFT[3] or Week 44.';
  const date = form.date.trim();
  if (date && !isISODate(date)) errors.date = 'Pick a date, or leave it empty.';
  const row: FunnelRowInput = { label, period: form.period === 'week' ? 'week' : 'cohort' };
  if (date && !errors.date) row.date = date;
  const note = form.note.trim();
  if (note) row.note = note;
  for (const k of FUNNEL_NUMBER_KEYS) {
    const r = parseFunnelNumber(form.nums[k] ?? '', isIntegerKey(k));
    if (r.error) errors[k] = r.error;
    else if (r.value !== undefined) row[k] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, row, errors };
}

/** First field with an error, in form order (for focus). */
export function firstErrorField(errors: FunnelFormErrors): FunnelFormField | null {
  const order: FunnelFormField[] = ['label', 'date', ...FUNNEL_NUMBER_KEYS];
  return order.find((f) => errors[f]) ?? null;
}

// ---------------------------------------------------------------------------
// Row card model
// ---------------------------------------------------------------------------

export type StageItem =
  | { kind: 'stage'; key: FunnelStageKey; label: string; value: number }
  | { kind: 'step'; from: FunnelStageKey; to: FunnelStageKey; rate: number | null; bottleneck: boolean; text: string; srText: string };

/** Known stages in order, with the conversion step between each consecutive pair. */
export function stageItems(row: FunnelRow): StageItem[] {
  const convs = funnelConversions(row);
  const worst = funnelBottleneck(row);
  const items: StageItem[] = [];
  const present = FUNNEL_STAGES.filter((s) => known(row[s.key]));
  present.forEach((s, i) => {
    items.push({ kind: 'stage', key: s.key, label: s.label, value: row[s.key] as number });
    const c = convs[i];
    if (c && i < present.length - 1) items.push(stepItem(c, worst));
  });
  return items;
}

function stepItem(c: Conversion, worst: Conversion | null): StageItem {
  const bottleneck = worst !== null && worst.from === c.from && worst.to === c.to;
  const from = stageLabel(c.from), to = stageLabel(c.to);
  return {
    kind: 'step',
    from: c.from,
    to: c.to,
    rate: c.rate,
    bottleneck,
    text: c.rate === null ? '—' : formatPercent(c.rate),
    srText: c.rate === null
      ? `${from} is 0, so there’s no rate to ${to}.`
      : `${formatPercent(c.rate)} from ${from} to ${to}${bottleneck ? ', the bottleneck' : ''}.`,
  };
}

/** Labels of stages with no number yet. */
export function missingStages(row: FunnelRow): string[] {
  return FUNNEL_STAGES.filter((s) => !known(row[s.key])).map((s) => s.label);
}

/** One calm line about the lowest conversion, or a hint when there is none. */
export function bottleneckLine(row: FunnelRow): string {
  const b = funnelBottleneck(row);
  if (b && b.rate !== null) return `Biggest drop: ${stageLabel(b.from)} → ${stageLabel(b.to)}, ${formatPercent(b.rate)}.`;
  const knownCount = FUNNEL_STAGES.filter((s) => known(row[s.key])).length;
  if (knownCount === 0) return 'No stage numbers yet.';
  if (knownCount === 1) return 'Add one more stage to see a conversion.';
  // Two or more known stages but no rate: every step starts from a 0 (typed, so known, not missing).
  const zero = funnelConversions(row).find((c) => c.rate === null);
  if (zero) return `${stageLabel(zero.from)} is 0, so there’s no rate after it.`;
  return 'No conversion to compare yet.';
}

/** 'Cohort · Mon 5 Oct' / 'Week'. */
export function rowSubtitle(row: FunnelRow, refYear?: number): string {
  const kind = row.period === 'week' ? 'Week' : 'Cohort';
  return row.date && isISODate(row.date) ? `${kind} · ${formatDate(row.date, refYear)}` : kind;
}

/** Revenue, costs, hours for display ('—' when unknown). */
export function moneyFacts(row: FunnelRow): { key: FunnelMoneyKey; label: string; value: string }[] {
  return [
    { key: 'revenueThb', label: 'Revenue', value: formatThb(row.revenueThb) },
    { key: 'costThb', label: 'Costs', value: formatThb(row.costThb) },
    { key: 'founderHours', label: 'Hours', value: known(row.founderHours) ? `${formatCount(row.founderHours)}h` : '—' },
  ];
}

// ---------------------------------------------------------------------------
// Cash per founder hour
// ---------------------------------------------------------------------------

export interface CashView {
  perHour: number | null;
  band: CashBand | null;
  tone: 'warn' | 'data' | 'good' | 'muted';
  value: string;
  copy: string;
  /** 0..1 positions on the fixed ฿0–400 scale. */
  fill: number;
  floorAt: number;
  targetAt: number;
  ariaLabel: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** What's missing before cash per hour can be computed (empty when computable). */
export function cashMissing(row: FunnelRow): string[] {
  const out: string[] = [];
  if (!known(row.revenueThb)) out.push('revenue');
  if (!known(row.costThb)) out.push('costs');
  if (!known(row.founderHours)) out.push('founder hours');
  return out;
}

export function cashView(row: FunnelRow): CashView {
  const perHour = cashPerFounderHour(row);
  const band = cashBand(perHour);
  const floorAt = MENTOR_FLOOR_THB_PER_HOUR / CASH_SCALE_MAX;
  const targetAt = TARGET_THB_PER_HOUR / CASH_SCALE_MAX;
  const floor = formatThb(MENTOR_FLOOR_THB_PER_HOUR), target = formatThb(TARGET_THB_PER_HOUR);
  if (perHour === null || band === null) {
    const miss = cashMissing(row);
    const copy = miss.length
      ? `Add ${joinList(miss)} to see this.`
      : 'Founder hours is 0, so there’s nothing to divide by.';
    return { perHour: null, band: null, tone: 'muted', value: '—', copy, fill: 0, floorAt, targetAt, ariaLabel: `Cash per founder hour unknown. Floor ${floor}, target ${target}.` };
  }
  const value = `${formatThb(perHour)}/h`;
  const copy = band === 'below-floor'
    ? `Below the ${floor}/h mentor floor.`
    : band === 'above-floor'
      ? `Above the ${floor} floor. Target is ${target}/h.`
      : `At or above the ${target}/h target.`;
  const tone = band === 'below-floor' ? 'warn' : band === 'above-floor' ? 'data' : 'good';
  return {
    perHour, band, tone, value, copy,
    fill: clamp01(perHour / CASH_SCALE_MAX), floorAt, targetAt,
    ariaLabel: `Cash per founder hour ${formatThb(perHour)}. Floor ${floor}, target ${target}.`,
  };
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type TrendKind = 'verified' | 'referral';

/**
 * `gap` says why a rate is missing: 'unknown' = a number isn't filled in yet ("Add …");
 * 'zero' = the number it divides by was typed as 0, so there is no rate (not missing data).
 */
export interface TrendPoint { id: string; label: string; value: number | null; missing: string | null; gap: 'unknown' | 'zero' | null }

const TREND_PARTS: Record<TrendKind, { top: FunnelStageKey; topAdd: string; denoms: [FunnelStageKey, string][]; denomAdd: string }> = {
  verified: { top: 'verifiedTest', topAdd: 'Add verified tests.', denoms: [['finished', 'Finished'], ['paid', 'Paid']], denomAdd: 'Add finished or paid.' },
  referral: { top: 'referralApplied', topAdd: 'Add referral applies.', denoms: [['applied', 'Applied'], ['paid', 'Paid']], denomAdd: 'Add applied or paid.' },
};

/**
 * Why a row has no rate. The rate divides by the first known of its denominators (finished, else paid;
 * applied, else paid), same as metrics. A typed 0 there is a fact, not a gap: "Finished is 0, so there’s
 * no rate." "Add …" only when the numbers really are unknown.
 */
export function trendGap(row: FunnelRow, kind: TrendKind): { gap: 'unknown' | 'zero'; text: string } {
  const p = TREND_PARTS[kind];
  const denom = p.denoms.find(([k]) => known(row[k]));
  if (denom && (row[denom[0]] as number) <= 0) return { gap: 'zero', text: `${denom[1]} is 0, so there’s no rate.` };
  if (!known(row[p.top])) return { gap: 'unknown', text: p.topAdd };
  return { gap: 'unknown', text: p.denomAdd };
}

/** One point per row, oldest → newest. */
export function trendSeries(rows: FunnelRow[], kind: TrendKind): TrendPoint[] {
  return sortFunnelRows(rows).map((r) => {
    const value = kind === 'verified' ? verifiedTestRate(r) : referralShare(r);
    const why = value === null ? trendGap(r, kind) : null;
    return { id: r.id, label: r.label || 'Untitled', value, missing: why?.text ?? null, gap: why?.gap ?? null };
  });
}

/** Every row lacks the numbers for this rate (none is a 0): say it once instead of a column of dashes. */
export function trendUntracked(points: TrendPoint[]): boolean {
  return points.length > 0 && points.every((p) => p.value === null && p.gap !== 'zero');
}

/** Bar tone for a trend value: good at/above the goal, warn under the kill line, data in between. */
export function trendTone(value: number, goal: number, kill: number): 'good' | 'warn' | 'data' {
  if (value >= goal) return 'good';
  if (value < kill) return 'warn';
  return 'data';
}

/**
 * One calm line when the growth engine is invisible: referral share isn't tracked on any row, or the
 * latest known share is under the kill line. null when there's nothing to flag.
 */
export function referralNotice(rows: FunnelRow[]): string | null {
  if (!rows.length) return null;
  const knownPoints = trendSeries(rows, 'referral').filter((p) => p.value !== null) as (TrendPoint & { value: number })[];
  if (!knownPoints.length) {
    // Tracked somewhere but not computable (e.g. applied is 0): the Trend card says why per row.
    if (rows.some((r) => known(r.referralApplied))) return null;
    return 'Referral share isn’t tracked on any row yet. Add friend/referral applies to see if graduates bring the next students.';
  }
  const last = knownPoints[knownPoints.length - 1];
  if (last.value < REFERRAL_KILL) {
    return `Referral share on ${last.label} is ${formatPercent(last.value)}, under the ${formatPercent(REFERRAL_KILL)} kill line. Growth still depends on new reach.`;
  }
  return null;
}

/** Compare the last two known points: 'Up from 6% to 25%.' (null with fewer than two). */
export function trendSummary(points: TrendPoint[]): string | null {
  const vals = points.filter((p) => p.value !== null) as (TrendPoint & { value: number })[];
  if (vals.length < 2) return null;
  const a = vals[vals.length - 2].value, b = vals[vals.length - 1].value;
  const fa = formatPercent(a), fb = formatPercent(b);
  if (fa === fb) return `Steady at ${fb}.`;
  return b > a ? `Up from ${fa} to ${fb}.` : `Down from ${fa} to ${fb}.`;
}

/** Rows newest first (for the card list). */
export function rowsNewestFirst(rows: FunnelRow[]): FunnelRow[] {
  return sortFunnelRows(rows).reverse();
}

/** Short live summary for the form preview. */
export function previewLine(row: FunnelRowInput): string {
  const r = { id: '', ...row } as FunnelRow;
  const parts = [bottleneckLine(r)];
  const cash = cashView(r);
  if (cash.perHour !== null) parts.push(`Cash per founder hour: ${cash.value}.`);
  return parts.join(' ');
}
