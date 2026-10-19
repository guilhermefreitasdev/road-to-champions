import { parseRun, type RunState } from '../game/run';
import { parseSeason, type SeasonState } from '../game/season';

const KEY = 'rtc:run:v4';
/** Complete Trials season (its own slot: a season and a run can be saved at the same time). */
const SEASON_KEY = 'rtc:season:v1';
/** Keys of older save formats, removed on load (v1 = fictional sample cards, v2 = Swiss stage, v3 = strength v1). */
const OLD_KEYS = ['rtc:run:v1', 'rtc:run:v2', 'rtc:run:v3'];

/** Saved run, or null when there is none, storage is unavailable, or the save is corrupted/outdated. */
export function loadRun(): RunState | null {
  try {
    for (const key of OLD_KEYS) window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const run = parseRun(JSON.parse(raw));
    if (!run) clearRun();
    return run;
  } catch {
    return null;
  }
}

export function saveRun(run: RunState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    // Storage full or blocked: the game keeps working, the run just won't survive a reload.
  }
}

export function clearRun(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Ignore: nothing to clear.
  }
}

/** Saved Complete Trials season, or null (none, unavailable storage, corrupted or outdated save). */
export function loadSeason(): SeasonState | null {
  try {
    const raw = window.localStorage.getItem(SEASON_KEY);
    if (!raw) return null;
    const season = parseSeason(JSON.parse(raw));
    if (!season) clearSeason();
    return season;
  } catch {
    return null;
  }
}

export function saveSeason(season: SeasonState): void {
  try {
    window.localStorage.setItem(SEASON_KEY, JSON.stringify(season));
  } catch {
    // Same as saveRun.
  }
}

export function clearSeason(): void {
  try {
    window.localStorage.removeItem(SEASON_KEY);
  } catch {
    // Ignore.
  }
}

/** New run seed. The UI is the only place allowed to use non-deterministic sources. */
export function newSeed(): string {
  try {
    const bytes = new Uint32Array(2);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (n) => n.toString(36)).join('');
  } catch {
    return Date.now().toString(36);
  }
}
