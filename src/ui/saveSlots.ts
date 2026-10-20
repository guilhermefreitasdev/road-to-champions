/**
 * The localStorage slots of the saved games, with no dependency on the game code: the UI shell uses them before the
 * pool loads (to reserve the "Continuar" cards and to clear the saves after a crash). ./storage.ts reads and writes
 * the saves themselves.
 */

export const RUN_KEY = 'rtc:run:v7';
/** Complete Trials season (its own slot: a season and a run can be saved at the same time). */
export const SEASON_KEY = 'rtc:season:v4';
/**
 * Keys of older save formats, removed on load (v1 = fictional sample cards, v2 = Swiss stage, v3 = strength v1,
 * v4 = before Modelo v3, v5 = before agent pools / flex roles / per-map agents, v6 = before difficulty and box scores;
 * season v3 = before difficulty and the transfer market). The history (rtc:history:v1) is
 * a snapshot and survives these bumps.
 */
export const OLD_KEYS = ['rtc:run:v1', 'rtc:run:v2', 'rtc:run:v3', 'rtc:run:v4', 'rtc:run:v5', 'rtc:run:v6', 'rtc:season:v1', 'rtc:season:v2', 'rtc:season:v3'];

function has(key: string): boolean {
  try {
    return !!window.localStorage.getItem(key);
  } catch {
    return false;
  }
}

/** Which saved games (run, season) the home page will offer to continue; read before they are parsed. */
export function savedSlots(): { run: boolean; season: boolean } {
  return { run: has(RUN_KEY), season: has(SEASON_KEY) };
}

export function clearRun(): void {
  try {
    window.localStorage.removeItem(RUN_KEY);
  } catch {
    // Ignore: nothing to clear.
  }
}

export function clearSeason(): void {
  try {
    window.localStorage.removeItem(SEASON_KEY);
  } catch {
    // Ignore.
  }
}
