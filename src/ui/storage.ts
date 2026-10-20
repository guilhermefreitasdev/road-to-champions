import { deserializeRun, deserializeSeason, serializeRun, serializeSeason } from '../game/persist';
import type { RunState } from '../game/run';
import type { SeasonState } from '../game/season';
import { OLD_KEYS, RUN_KEY as KEY, SEASON_KEY, clearRun, clearSeason } from './saveSlots';

export { clearRun, clearSeason };

/** Saved run, or null when there is none, storage is unavailable, or the save is corrupted/outdated. */
export function loadRun(): RunState | null {
  try {
    for (const key of OLD_KEYS) window.localStorage.removeItem(key);
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    // Packed (lossless) save; the deserializer also reads plain JSON saves of the same version.
    const run = deserializeRun(raw);
    if (!run) clearRun();
    return run;
  } catch {
    return null;
  }
}

export function saveRun(run: RunState): void {
  try {
    window.localStorage.setItem(KEY, serializeRun(run));
  } catch {
    // Storage full or blocked: the game keeps working, the run just won't survive a reload.
  }
}

/** Saved Complete Trials season, or null (none, unavailable storage, corrupted or outdated save). */
export function loadSeason(): SeasonState | null {
  try {
    const raw = window.localStorage.getItem(SEASON_KEY);
    if (!raw) return null;
    const season = deserializeSeason(raw);
    if (!season) clearSeason();
    return season;
  } catch {
    return null;
  }
}

export function saveSeason(season: SeasonState): void {
  try {
    window.localStorage.setItem(SEASON_KEY, serializeSeason(season));
  } catch {
    // Same as saveRun.
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
