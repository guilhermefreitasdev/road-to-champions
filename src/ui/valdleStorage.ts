/**
 * The Valdle's progress in localStorage (`rtc:valdle:v1`, ./saveSlots.ts): free of any data, so the home card can
 * read today's status before the game loads. Storage can be missing or full (private mode, quota): every access is
 * guarded and the games still play, they just do not remember.
 */
import { emptyStore, parseValdleStore, type ValdleStore } from '../game/valdle/play';
import { VALDLE_KEY, VALDLE_PREFS_KEY } from './saveSlots';

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

/** Language of the callout names on the Mapa game's "Onde é?" chips (pt-BR by default). */
export type ChipLang = 'pt' | 'en';

export function loadChipLang(): ChipLang {
  try {
    const raw = window.localStorage.getItem(VALDLE_PREFS_KEY);
    const prefs = raw ? (JSON.parse(raw) as { chipLang?: unknown }) : null;
    return prefs?.chipLang === 'en' ? 'en' : 'pt';
  } catch {
    return 'pt';
  }
}

export function saveChipLang(lang: ChipLang): void {
  try {
    window.localStorage.setItem(VALDLE_PREFS_KEY, JSON.stringify({ chipLang: lang }));
  } catch {
    // Ignore: the choice just is not remembered.
  }
}
