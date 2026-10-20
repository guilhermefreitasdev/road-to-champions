/**
 * Daily puzzles of the Valdle games: one per game and day (São Paulo calendar), the same for everyone, planned in
 * order from the launch so a day can look back at the days before it and not repeat a recent answer. Every draw
 * comes from createRng (`valdle:<game>:<date>`), never Math.random. The free mode ("Modo livre") uses the same
 * makers with a seed chosen by the UI and no look-back.
 */
import { createRng, type Rng } from '../../engine/rng';
import { addDays, dayIndex, weekdayIndex } from '../daily/calendar';
import { VALDLE_LAUNCH, valdleNumber, type ValdleGameId } from './games';

export interface MakeContext {
  rng: Rng;
  /** Monday 0 … Sunday 6 (daily: the difficulty curve; free mode: a seeded level). */
  level: number;
  /** Keys (answers, teams…) used by this game within the last `days` days (always empty in the free mode). */
  recent: (days: number) => ReadonlySet<string>;
}

export interface Planned<P> {
  puzzle: P;
  /** What later days must not repeat (e.g. "answer:<id>", "team:<id>"). */
  keys: readonly string[];
}

export interface PuzzleMeta {
  game: ValdleGameId;
  mode: 'daily' | 'free';
  /** Daily: the date (YYYY-MM-DD); free: the seed. */
  id: string;
  /** Daily: #N since the launch; free: 0. */
  number: number;
}

export type Maker<P> = (ctx: MakeContext) => Planned<P>;

export interface Planner<P> {
  daily(date: string): P & PuzzleMeta;
  free(seed: string): P & PuzzleMeta;
}

export function createPlanner<P>(game: ValdleGameId, make: Maker<P>): Planner<P> {
  const days: Planned<P>[] = [];
  const recentAt = (i: number) => {
    const cache = new Map<number, Set<string>>();
    return (n: number): ReadonlySet<string> => {
      let set = cache.get(n);
      if (!set) {
        set = new Set<string>();
        for (let k = Math.max(0, i - Math.round(n)); k < i; k++) for (const key of days[k]!.keys) set.add(key);
        cache.set(n, set);
      }
      return set;
    };
  };
  return {
    daily(date) {
      const i = dayIndex(date) - dayIndex(VALDLE_LAUNCH);
      if (i < 0) throw new Error(`valdle ${game}: ${date} is before the launch (${VALDLE_LAUNCH})`);
      while (days.length <= i) {
        const d = addDays(VALDLE_LAUNCH, days.length);
        days.push(make({ rng: createRng(`valdle:${game}:${d}`), level: weekdayIndex(d), recent: recentAt(days.length) }));
      }
      return { ...days[i]!.puzzle, game, mode: 'daily', id: date, number: valdleNumber(date) };
    },
    free(seed) {
      const rng = createRng(`valdle:free:${game}:${seed}`);
      const level = rng.int(0, 6);
      const empty: ReadonlySet<string> = new Set();
      return { ...make({ rng, level, recent: () => empty }).puzzle, game, mode: 'free', id: seed, number: 0 };
    },
  };
}

// --- Picking helpers ------------------------------------------------------------------------------------------------

export function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function pickOne<T>(rng: Rng, xs: readonly T[]): T | undefined {
  return xs.length ? xs[rng.int(0, xs.length - 1)] : undefined;
}

/**
 * A seeded pick from a pool sorted easiest (most famous) first: the level's band (Monday the top of the pool,
 * Sunday deeper), among the items that pass `ok`. The band widens when nothing in it passes; the look-back gap is
 * relaxed (halved down to 0) only when the whole pool fails.
 */
export function pickBand<T>(rng: Rng, pool: readonly T[], level: number, ok: (t: T, gapScale: number) => boolean, spread = 1): T | undefined {
  const n = pool.length;
  if (!n) return undefined;
  for (const gapScale of [1, 0.5, 0.25, 0]) {
    for (let half = 0.12 * spread; half <= 1.01; half += 0.15) {
      const c = (0.08 + 0.12 * level) * spread;
      const lo = Math.floor(Math.max(0, c - half) * n);
      const hi = Math.min(n, Math.ceil(Math.min(1, c + half) * n));
      const candidates = pool.slice(lo, Math.max(hi, lo + 1)).filter((t) => ok(t, gapScale));
      if (candidates.length) return candidates[rng.int(0, candidates.length - 1)];
    }
  }
  return undefined;
}
