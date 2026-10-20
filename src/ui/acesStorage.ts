/**
 * "Acerte o ace" progress in localStorage (`rtc:aces:v1`, ./saveSlots.ts): the game's AcesSave plus `unavailable`,
 * the aces whose video the YouTube player refused to show here (errors 100/101/150/2), so the free mode skips them.
 * Free of the aces data (only the save format), so the home card can read today's status before the game loads.
 * Storage can be missing or full: every access is guarded and the game still plays, it just does not remember.
 */
import { emptyAcesSave, parseAcesSave, type AcesSave } from '../game/aces/play';
import { ACES_KEY } from './saveSlots';

export interface AcesStore {
  save: AcesSave;
  /** Ace id → day key when this browser's player refused its video. */
  unavailable: Record<string, string>;
}

const MAX_UNAVAILABLE = 100;

function parseUnavailable(x: unknown): Record<string, string> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(x).slice(0, MAX_UNAVAILABLE)) if (typeof v === 'string') out[k] = v;
  return out;
}

export function loadAcesStore(): AcesStore {
  try {
    const raw = window.localStorage.getItem(ACES_KEY);
    if (!raw) return { save: emptyAcesSave(), unavailable: {} };
    const json: unknown = JSON.parse(raw);
    const unavailable = typeof json === 'object' && json !== null ? parseUnavailable((json as { unavailable?: unknown }).unavailable) : {};
    return { save: parseAcesSave(json), unavailable };
  } catch {
    return { save: emptyAcesSave(), unavailable: {} };
  }
}

export function saveAcesStore(store: AcesStore): void {
  try {
    window.localStorage.setItem(ACES_KEY, JSON.stringify({ ...store.save, unavailable: store.unavailable }));
  } catch {
    // Ignore: the puzzle still plays, unsaved.
  }
}
