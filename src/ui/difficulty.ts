/** The last difficulty picked on the home page, remembered per browser (never throws; default Normal). */
import { DEFAULT_DIFFICULTY, DIFFICULTIES, isDifficulty, type Difficulty } from '../game/difficulty';

export { isDifficulty };

export const DIFFICULTY_KEY = 'rtc:difficulty';

export function loadDifficulty(): Difficulty {
  try {
    const raw = window.localStorage.getItem(DIFFICULTY_KEY);
    return isDifficulty(raw) ? raw : DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

export function saveDifficulty(d: Difficulty): void {
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, d);
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}

/** Difficulty of a saved run or season (saves made before difficulties existed play as Normal). */
export function difficultyOf(state: object | null | undefined): Difficulty {
  const d = (state as { difficulty?: unknown } | null | undefined)?.difficulty;
  return isDifficulty(d) ? d : DEFAULT_DIFFICULTY;
}

/** 1–4: how many pips the badge fills (the level is shown by shape and text, never color alone). */
export function difficultyLevel(d: Difficulty): number {
  return DIFFICULTIES.indexOf(d) + 1;
}
