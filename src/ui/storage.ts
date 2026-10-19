import { parseRun, type RunState } from '../game/run';

const KEY = 'rtc:run:v3';
/** Keys of older save formats, removed on load (v1 = fictional sample cards, v2 = Swiss stage). */
const OLD_KEYS = ['rtc:run:v1', 'rtc:run:v2'];

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
