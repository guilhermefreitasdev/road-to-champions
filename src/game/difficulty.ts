/**
 * Difficulty levels, for both modes. Every lever is a kind that already existed in the game (docs/design.md,
 * "Dificuldade"): the field's elite rosters (main mode), a small strength bonus for the AI in the user's matches,
 * the classic draft's rerolls, the AI's veto noise against the user and how much the coach's scouting reveals.
 * Calibrated with the balance drafter in src/game/balance.test.ts (BALANCE_REPORT=1 BT=30).
 */
import { formatDecimal } from './explain';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'legend';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard', 'legend'];
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export interface DifficultySettings {
  /** Main mode: at least / at most this many elite rosters (top 20% of the pool) among the 15 opponents. */
  eliteMin: number;
  eliteCap: number;
  /** Strength points every AI team gets on every map against the user (never in AI-vs-AI matches). */
  aiBonus: number;
  /** Rerolls of the classic draft (the ultimate draft has none). */
  rerolls: number;
  /** Base noise of the AI's veto against the user, in strength points (AI_NOISE = 2; lower = smarter). */
  vetoNoise: number;
  /** Shift of the coach's scouting level (0–3); null = the scouting reveals nothing. */
  scouting: number | null;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  easy: { eliteMin: 2, eliteCap: 2, aiBonus: -0.5, rerolls: 4, vetoNoise: 3, scouting: 1 },
  normal: { eliteMin: 3, eliteCap: 4, aiBonus: 2.5, rerolls: 3, vetoNoise: 1.5, scouting: 0 },
  hard: { eliteMin: 4, eliteCap: 5, aiBonus: 4, rerolls: 2, vetoNoise: 1, scouting: -1 },
  legend: { eliteMin: 6, eliteCap: 8, aiBonus: 4.5, rerolls: 1, vetoNoise: 0.5, scouting: null },
};

const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatDecimal(Math.abs(n), Number.isInteger(n) ? 0 : 1)}`;

function blurb(d: DifficultySettings): string {
  const ai = d.aiBonus === 0 ? 'IA sem bônus' : `IA ${signed(d.aiBonus)} de força contra você`;
  const scout = d.scouting === null ? 'scouting do coach desligado' : d.scouting > 0 ? 'scouting do coach ampliado' : d.scouting < 0 ? 'scouting do coach reduzido' : 'scouting normal';
  return `${d.rerolls} reroll${d.rerolls === 1 ? '' : 's'}, ${ai}, ${d.eliteMin === d.eliteCap ? d.eliteMin : `${d.eliteMin}–${d.eliteCap}`} favoritos no Champions, ${scout}.`;
}

export const DIFFICULTY_LABELS: Record<Difficulty, { name: string; blurb: string }> = {
  easy: { name: 'Fácil', blurb: blurb(DIFFICULTY_SETTINGS.easy) },
  normal: { name: 'Normal', blurb: blurb(DIFFICULTY_SETTINGS.normal) },
  hard: { name: 'Difícil', blurb: blurb(DIFFICULTY_SETTINGS.hard) },
  legend: { name: 'Lendário', blurb: blurb(DIFFICULTY_SETTINGS.legend) },
};

export function isDifficulty(x: unknown): x is Difficulty {
  return typeof x === 'string' && (DIFFICULTIES as readonly string[]).includes(x);
}

export function difficultySettings(d: Difficulty | undefined): DifficultySettings {
  return DIFFICULTY_SETTINGS[d ?? DEFAULT_DIFFICULTY];
}

/** Scouting level the user's coach gets at this difficulty (coach vetoBonus 0–3 shifted, clamped; 0 = nothing). */
export function scoutingLevel(vetoBonus: number, d: Difficulty | undefined): number {
  const shift = difficultySettings(d).scouting;
  if (shift === null) return 0;
  return Math.max(0, Math.min(3, vetoBonus + shift));
}

/** The AI bonus as `adjust` for a series: the AI side(s) facing the user get it; AI-vs-AI matches get nothing. */
export function aiAdjust(a: string, b: string, userId: string, d: Difficulty | undefined): [number, number] | undefined {
  const bonus = difficultySettings(d).aiBonus;
  if (bonus === 0 || (a !== userId && b !== userId)) return undefined;
  return [a === userId ? 0 : bonus, b === userId ? 0 : bonus];
}
