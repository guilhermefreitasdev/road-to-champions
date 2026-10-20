/**
 * The Daily's progress in localStorage (`rtc:daily:v1`): one record per day played (today and the archive). Free
 * of the card pool, so the home page can show today's progress before the game loads. Storage can be missing or
 * full (private mode, quota): every access is guarded and the Daily still plays, it just does not remember.
 */
import { emptyStore, parseDailyStore, type DailyStore } from '../game/daily/play';

export const DAILY_KEY = 'rtc:daily:v1';

export function loadDailyStore(): DailyStore {
  try {
    const raw = window.localStorage.getItem(DAILY_KEY);
    return raw ? parseDailyStore(JSON.parse(raw)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveDailyStore(store: DailyStore): void {
  try {
    window.localStorage.setItem(DAILY_KEY, JSON.stringify(store));
  } catch {
    // Ignore: the day still plays, unsaved.
  }
}
