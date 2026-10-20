/**
 * The Daily calendar: one puzzle per calendar day in America/Sao_Paulo (midnight BRT resets it), numbered from the
 * launch day (#1). Day keys are "YYYY-MM-DD" strings; arithmetic on them goes through whole UTC day numbers, so it
 * never depends on the machine's time zone or on DST. Pure: "now" is always passed in.
 */

export const DAILY_TIME_ZONE = 'America/Sao_Paulo';
/** Puzzle #1. A few days before the public launch, so the archive has days to replay from the start. */
export const DAILY_LAUNCH = '2026-10-01';

const DAY_MS = 86_400_000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(key: string): boolean {
  const m = KEY_RE.exec(key);
  if (!m) return false;
  return keyFromDayNumber(dayNumber(key)) === key;
}

/** Whole days since 1970-01-01 for a day key. */
export function dayNumber(key: string): number {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`invalid day key: ${key}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function keyFromDayNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function addDays(key: string, days: number): string {
  return keyFromDayNumber(dayNumber(key) + days);
}

/** Wall-clock parts of an instant in a time zone. */
function wallParts(now: Date, timeZone: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: get('second') };
}

/** The Daily's day key at an instant (the calendar date in São Paulo). */
export function dayKeyAt(now: Date, timeZone: string = DAILY_TIME_ZONE): string {
  const p = wallParts(now, timeZone);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Milliseconds until the next puzzle (next midnight in São Paulo). */
export function msUntilNextDay(now: Date, timeZone: string = DAILY_TIME_ZONE): number {
  const p = wallParts(now, timeZone);
  const elapsed = ((p.h * 60 + p.mi) * 60 + p.s) * 1000 + now.getUTCMilliseconds();
  return Math.max(1000, DAY_MS - elapsed);
}

/** "#N": 1 on the launch day; 0 or less before it. */
export function puzzleNumber(key: string): number {
  return dayNumber(key) - dayNumber(DAILY_LAUNCH) + 1;
}

/** Day index from launch (0-based). */
export function dayIndex(key: string): number {
  return dayNumber(key) - dayNumber(DAILY_LAUNCH);
}

/** Monday = 0 … Sunday = 6. The difficulty curve: Monday easy, Sunday hard. */
export function weekdayIndex(key: string): number {
  // 1970-01-01 was a Thursday (Monday-based index 3).
  return (((dayNumber(key) + 3) % 7) + 7) % 7;
}

export const WEEKDAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const;
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;

/** "12h 05min" / "4min 09s": the countdown to the next puzzle. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  return `${m}min ${String(s).padStart(2, '0')}s`;
}

/** "20/10/2026". */
export function formatDayKey(key: string): string {
  const m = KEY_RE.exec(key);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : key;
}
