/**
 * The Valdle's progress in localStorage (`rtc:valdle:v1`, ./saveSlots.ts): free of any data, so the home card can
 * read today's status before the game loads. Storage can be missing or full (private mode, quota): every access is
 * guarded and the games still play, they just do not remember.
 */
import { emptyStore, parseValdleStore, type ValdleStore } from '../game/valdle/play';
import { VALDLE_KEY } from './saveSlots';

export function loadValdleStore(): ValdleStore {
  try {
    const raw = window.localStorage.getItem(VALDLE_KEY);
    return raw ? parseValdleStore(JSON.parse(raw)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveValdleStore(store: ValdleStore): void {
  try {
    window.localStorage.setItem(VALDLE_KEY, JSON.stringify(store));
  } catch {
    // Ignore: the puzzle still plays, unsaved.
  }
}
