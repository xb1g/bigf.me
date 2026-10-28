// Date helpers. All "today"/week logic is Asia/Bangkok (UTC+7, no DST).
// Pure module: no window/document access.

import type { ISODate } from './types.ts';

export const TZ = 'Asia/Bangkok';
/** Bangkok has no DST; used only to turn a local date+time input into an instant. */
const BANGKOK_OFFSET = '+07:00';

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_KEY_RE = /^(\d{4})-W(\d{2})$/;

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface BkkParts { year: number; month: number; day: number; hour: number; minute: number; second: number }

function bkkParts(d: Date): BkkParts {
  const out: Record<string, number> = {};
  for (const p of partsFmt.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year, month: out.month, day: out.day,
    hour: out.hour === 24 ? 0 : out.hour, minute: out.minute, second: out.second,
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function toDate(d: Date | string | number): Date {
  return d instanceof Date ? d : new Date(d);
}

/** True for a real calendar date in 'YYYY-MM-DD' form. */
export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** True for a string `Date.parse` understands (ISO datetimes). */
export function isDateTime(s: unknown): s is string {
  return typeof s === 'string' && s.length >= 10 && !Number.isNaN(Date.parse(s));
}

/** The Asia/Bangkok calendar date of an instant. */
export function toISODate(d: Date | string | number): ISODate {
  const p = bkkParts(toDate(d));
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** Today's date in Asia/Bangkok. */
export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Current hour (0–23) in Asia/Bangkok. */
export function bangkokHour(now: Date = new Date()): number {
  return bkkParts(now).hour;
}

/** Current ISO datetime (UTC, `toISOString`). */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

function isoToUtcMs(iso: ISODate): number {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function utcMsToIso(ms: number): ISODate {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Calendar arithmetic: addDays('2026-10-31', 1) → '2026-11-01'. */
export function addDays(iso: ISODate, n: number): ISODate {
  return utcMsToIso(isoToUtcMs(iso) + Math.round(n) * DAY_MS);
}

/** Whole days from `a` to `b` (b − a). daysBetween('2026-10-28','2026-10-30') → 2. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((isoToUtcMs(b) - isoToUtcMs(a)) / DAY_MS);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: ISODate): number {
  const dow = new Date(isoToUtcMs(iso)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** ISO week key 'YYYY-Www' (Monday start; week 1 contains the first Thursday). */
export function weekKey(iso: ISODate): string {
  const ms = isoToUtcMs(iso);
  const thursday = new Date(ms + (4 - isoWeekday(iso)) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return `${year}-W${pad2(week)}`;
}

/** Week key of an instant (its Bangkok date). */
export function weekKeyOf(d: Date | string | number): string {
  return weekKey(toISODate(d));
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: ISODate): ISODate {
  return addDays(iso, 1 - isoWeekday(iso));
}

/** Monday (start) and Sunday (end) of an ISO week key. */
export function weekRange(key: string): { start: ISODate; end: ISODate } {
  const m = WEEK_KEY_RE.exec(key);
  if (!m) throw new RangeError(`Not a week key: ${key}`);
  const year = Number(m[1]), week = Number(m[2]);
  // Jan 4th is always in week 1.
  const jan4 = utcMsToIso(Date.UTC(year, 0, 4));
  const start = addDays(weekStart(jan4), (week - 1) * 7);
  return { start, end: addDays(start, 6) };
}

/** The seven dates (Mon→Sun) of a week key. */
export function weekDates(key: string): ISODate[] {
  const { start } = weekRange(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Week key shifted by n weeks. */
export function addWeeks(key: string, n: number): string {
  return weekKey(addDays(weekRange(key).start, n * 7));
}

/** Instant for a Bangkok local date + 'HH:MM' time (e.g. from <input type=date/time>). */
export function bangkokDateTimeToIso(date: ISODate, time: string): string {
  const t = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
  return new Date(`${date}T${t}${BANGKOK_OFFSET}`).toISOString();
}

/** Split an instant into Bangkok local { date: 'YYYY-MM-DD', time: 'HH:MM' } for form inputs. */
export function isoToBangkokInput(iso: string | Date): { date: ISODate; time: string } {
  const p = bkkParts(toDate(iso));
  return { date: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`, time: `${pad2(p.hour)}:${pad2(p.minute)}` };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** 'Tue 28 Oct' (adds the year when it differs from `refYear`). */
export function formatDate(iso: ISODate, refYear?: number): string {
  if (!isISODate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${WEEKDAYS[isoWeekday(iso) - 1]} ${d} ${MONTHS[m - 1]}`;
  return refYear !== undefined && refYear !== y ? `${base} ${y}` : base;
}

/** '28 Oct' / '28 Oct 2027'. */
export function formatShortDate(iso: ISODate, refYear?: number): string {
  if (!isISODate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  return refYear !== undefined && refYear !== y ? `${base} ${y}` : base;
}

/** 'Tuesday, 28 October'. */
export function formatDateLong(iso: ISODate): string {
  if (!isISODate(iso)) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS_LONG[isoWeekday(iso) - 1]}, ${d} ${MONTHS_LONG[m - 1]}`;
}

/** 'HH:MM' (24h) of an instant in Bangkok. */
export function formatTime(iso: string | Date): string {
  const p = bkkParts(toDate(iso));
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** 'Tue 28 Oct, 14:05' of an instant in Bangkok. */
export function formatDateTime(iso: string | Date): string {
  return `${formatDate(toISODate(iso))}, ${formatTime(iso)}`;
}

/** Human duration: 45 min → '45m', 125 min → '2h 05m', 0 → '0m'. */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const hrs = Math.floor(m / 60);
  const rest = m % 60;
  if (hrs === 0) return `${rest}m`;
  return `${hrs}h ${pad2(rest)}m`;
}

/** Hours with one decimal: 1.25 → '1.3h'. */
export function formatHours(hours: number): string {
  const v = Math.round(hours * 10) / 10;
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}h`;
}

/** Clock-style elapsed: 75s → '01:15', 3725s → '1:02:05'. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

/** 'today' | 'tomorrow' | 'yesterday' | 'in 3 days' | '3 days ago'. */
export function relativeDays(iso: ISODate, today: ISODate): string {
  if (!isISODate(iso) || !isISODate(today)) return '';
  const n = daysBetween(today, iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
