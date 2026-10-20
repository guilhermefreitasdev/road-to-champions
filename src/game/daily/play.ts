/**
 * Playing the Daily: the progress of a day (JSON, saved in localStorage by the UI), the moves of each challenge,
 * the scores, the share text and the personal stats (streak, played, average, best). Pure: no storage, no clock
 * (the day key of "today" is passed in), no data beyond the day's puzzle.
 *
 * Scores (docs/design.md, "Modo Diário"): each challenge is worth 5 points, 20 a day.
 * - Linhas Históricas: 1 point per starter named; hints cost points on that starter (country 0.25, role 0.25,
 *   first letter 0.5; a starter never goes below 0). Ends with the five, after 5 misses, or on "Revelar".
 *   Counts as won with 3+ names.
 * - Quem é o Pro: 6 tries; points by the try that got it (5, 4, 3, 2, 1, 1).
 * - O Impostor: one pick; 5 points if right.
 * - Placar Clássico: winner 2 + exact score 2 + last map of the series 1. Counts as won with winner and score.
 */
import { normalizeName } from './text';
import type { DailyPuzzle, PlacarPuzzle } from './generate';
import { CHALLENGES, type ChallengeId } from './challenges';
import { dayNumber, keyFromDayNumber, isDayKey } from './calendar';

export type HintKind = 'country' | 'role' | 'initial';
export const HINT_KINDS: readonly HintKind[] = ['country', 'role', 'initial'];
export const HINT_COST: Record<HintKind, number> = { country: 0.25, role: 0.25, initial: 0.5 };
export const LINHAS_MAX_MISSES = 5;
export const PRO_MAX_TRIES = 6;
const PRO_POINTS = [5, 4, 3, 2, 1, 1] as const;
export const CHALLENGE_MAX_POINTS = 5;
export const DAY_MAX_POINTS = CHALLENGE_MAX_POINTS * 4;

export { CHALLENGE_LABELS } from './challenges';

export interface LinhasState {
  /** Starters named (player ids, in the order found). */
  found: string[];
  /** Wrong guesses (handles as typed/picked). */
  misses: string[];
  /** Hints taken per starter (player id). */
  hints: Record<string, HintKind[]>;
  done: boolean;
}

export interface ProState {
  /** Guessed player ids, in order. */
  guesses: string[];
  done: boolean;
}

export interface ImpostorState {
  pick: string | null;
}

export interface PlacarState {
  /** Display index of the team picked as winner. */
  winner: 0 | 1 | null;
  /** Maps the loser won, as guessed. */
  loserMaps: number | null;
  /** Bonus: last map of the series. */
  map: string | null;
  done: boolean;
}

export interface ChallengeResult {
  done: boolean;
  points: number;
  /** Counts toward "N/4". */
  won: boolean;
}

export interface DayResult {
  points: number;
  wins: number;
  challenges: Record<ChallengeId, ChallengeResult>;
  /** Share text bits per challenge (spoiler-free). */
  summary: Record<ChallengeId, string>;
}

export interface DayProgress {
  linhas: LinhasState;
  pro: ProState;
  impostor: ImpostorState;
  placar: PlacarState;
  /** Day key (São Paulo) when the fourth challenge ended: equal to the puzzle's date = played on time. */
  finishedOn?: string;
  /** Snapshot of the result once finished (the home card and the stats read it without the puzzles). */
  result?: DayResult;
}

export interface DailyStore {
  v: 1;
  days: Record<string, DayProgress>;
}

export const emptyProgress = (): DayProgress => ({
  linhas: { found: [], misses: [], hints: {}, done: false },
  pro: { guesses: [], done: false },
  impostor: { pick: null },
  placar: { winner: null, loserMaps: null, map: null, done: false },
});

export const emptyStore = (): DailyStore => ({ v: 1, days: {} });

// --- Moves ---------------------------------------------------------------------------------------------------------

export type GuessOutcome = 'hit' | 'miss' | 'repeat' | 'over';

/** A starter guess: a known player (id + handle). Matches by id, or by handle (case/accent-insensitive). */
export function guessLinhas(
  state: LinhasState,
  puzzle: DailyPuzzle['linhas'],
  guess: { playerId: string; handle: string },
): { state: LinhasState; outcome: GuessOutcome; slot?: string } {
  if (state.done) return { state, outcome: 'over' };
  const norm = normalizeName(guess.handle);
  const slot = puzzle.slots.find((s) => s.playerId === guess.playerId) ?? puzzle.slots.find((s) => normalizeName(s.handle) === norm);
  if (slot && state.found.includes(slot.playerId)) return { state, outcome: 'repeat', slot: slot.playerId };
  if (!slot && state.misses.some((m) => normalizeName(m) === norm)) return { state, outcome: 'repeat' };
  const next: LinhasState = slot
    ? { ...state, found: [...state.found, slot.playerId] }
    : { ...state, misses: [...state.misses, guess.handle] };
  next.done = next.found.length === puzzle.slots.length || next.misses.length >= LINHAS_MAX_MISSES;
  return { state: next, outcome: slot ? 'hit' : 'miss', ...(slot ? { slot: slot.playerId } : {}) };
}

export function hintLinhas(state: LinhasState, slotPlayerId: string, kind: HintKind): LinhasState {
  if (state.done || state.found.includes(slotPlayerId)) return state;
  const taken = state.hints[slotPlayerId] ?? [];
  if (taken.includes(kind)) return state;
  return { ...state, hints: { ...state.hints, [slotPlayerId]: [...taken, kind] } };
}

export function revealLinhas(state: LinhasState): LinhasState {
  return state.done ? state : { ...state, done: true };
}

export function guessPro(state: ProState, puzzle: DailyPuzzle['pro'], playerId: string): { state: ProState; outcome: GuessOutcome } {
  if (state.done) return { state, outcome: 'over' };
  if (state.guesses.includes(playerId)) return { state, outcome: 'repeat' };
  const guesses = [...state.guesses, playerId];
  const hit = playerId === puzzle.answer.playerId;
  return { state: { guesses, done: hit || guesses.length >= PRO_MAX_TRIES }, outcome: hit ? 'hit' : 'miss' };
}

/** Clues visible: one at the start, one more after each wrong guess (all six once it is over). */
export function proCluesShown(state: ProState, puzzle: DailyPuzzle['pro']): number {
  if (state.done) return PRO_MAX_TRIES;
  const misses = state.guesses.filter((g) => g !== puzzle.answer.playerId).length;
  return Math.min(PRO_MAX_TRIES, 1 + misses);
}

export function pickImpostor(state: ImpostorState, playerId: string): ImpostorState {
  return state.pick === null ? { pick: playerId } : state;
}

export function answerPlacar(state: PlacarState, puzzle: PlacarPuzzle, winner: 0 | 1, loserMaps: number, map: string | null): PlacarState {
  if (state.done) return state;
  const need = Math.ceil(puzzle.bestOf / 2);
  if (loserMaps < 0 || loserMaps >= need) throw new Error(`invalid score guess: ${need}-${loserMaps}`);
  return { winner, loserMaps, map, done: true };
}

/** Score options of a best-of: "2–0", "2–1" … as maps of the loser. */
export function placarScoreOptions(bestOf: number): number[] {
  const need = Math.ceil(bestOf / 2);
  return Array.from({ length: need }, (_, i) => i);
}

// --- Results -------------------------------------------------------------------------------------------------------

export function linhasSlotPoints(state: LinhasState, slotPlayerId: string): number {
  if (!state.found.includes(slotPlayerId)) return 0;
  const cost = (state.hints[slotPlayerId] ?? []).reduce((s, k) => s + HINT_COST[k], 0);
  return Math.max(0, 1 - cost);
}

export function linhasResult(state: LinhasState, puzzle: DailyPuzzle['linhas']): ChallengeResult & { names: number } {
  const names = state.found.length;
  const points = puzzle.slots.reduce((s, slot) => s + linhasSlotPoints(state, slot.playerId), 0);
  return { done: state.done, points, won: state.done && names >= 3, names };
}

export function proResult(state: ProState, puzzle: DailyPuzzle['pro']): ChallengeResult & { tries: number | null } {
  const at = state.guesses.indexOf(puzzle.answer.playerId);
  const tries = at >= 0 ? at + 1 : null;
  return { done: state.done, points: tries ? PRO_POINTS[tries - 1]! : 0, won: tries !== null, tries };
}

export function impostorResult(state: ImpostorState, puzzle: DailyPuzzle['impostor']): ChallengeResult {
  const right = state.pick === puzzle.impostorId;
  return { done: state.pick !== null, points: right ? CHALLENGE_MAX_POINTS : 0, won: right };
}

export function placarTruth(puzzle: PlacarPuzzle): { winner: 0 | 1; loserMaps: number; lastMap: string } {
  const winner: 0 | 1 = puzzle.score[0] > puzzle.score[1] ? 0 : 1;
  return { winner, loserMaps: Math.min(...puzzle.score), lastMap: puzzle.maps[puzzle.maps.length - 1]!.map };
}

export function placarResult(
  state: PlacarState,
  puzzle: PlacarPuzzle,
): ChallengeResult & { winnerOk: boolean; scoreOk: boolean; mapOk: boolean } {
  const t = placarTruth(puzzle);
  const winnerOk = state.done && state.winner === t.winner;
  const scoreOk = winnerOk && state.loserMaps === t.loserMaps;
  const mapOk = state.done && state.map === t.lastMap;
  return { done: state.done, points: (winnerOk ? 2 : 0) + (scoreOk ? 2 : 0) + (mapOk ? 1 : 0), won: scoreOk, winnerOk, scoreOk, mapOk };
}

/** "4,25" (pt-BR, up to two decimals). */
export function formatPoints(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

export function dayResult(progress: DayProgress, puzzle: DailyPuzzle): DayResult {
  const l = linhasResult(progress.linhas, puzzle.linhas);
  const p = proResult(progress.pro, puzzle.pro);
  const i = impostorResult(progress.impostor, puzzle.impostor);
  const c = placarResult(progress.placar, puzzle.placar);
  const challenges = { linhas: l, pro: p, impostor: i, placar: c };
  const strip = ({ done, points, won }: ChallengeResult): ChallengeResult => ({ done, points, won });
  return {
    points: l.points + p.points + i.points + c.points,
    wins: [l, p, i, c].filter((x) => x.won).length,
    challenges: { linhas: strip(challenges.linhas), pro: strip(p), impostor: strip(i), placar: strip(c) },
    summary: {
      linhas: `Linhas ${l.names}/5`,
      pro: p.tries ? `Pro em ${p.tries}` : 'Pro não saiu',
      impostor: i.won ? 'Impostor certo' : 'Impostor errado',
      placar: c.scoreOk ? 'Placar certo' : c.winnerOk ? 'Placar: só o vencedor' : 'Placar errado',
    },
  };
}

export function isDayComplete(progress: DayProgress): boolean {
  return progress.linhas.done && progress.pro.done && progress.impostor.pick !== null && progress.placar.done;
}

/** Challenges ended in a progress (no puzzle needed). */
export function challengesDone(progress: DayProgress | undefined): Record<ChallengeId, boolean> {
  return {
    linhas: !!progress?.linhas.done,
    pro: !!progress?.pro.done,
    impostor: progress?.impostor.pick !== null && progress?.impostor.pick !== undefined,
    placar: !!progress?.placar.done,
  };
}

/** After a move: stamps the finishing day and the result snapshot the first time all four are over. */
export function settleDay(progress: DayProgress, puzzle: DailyPuzzle, today: string): DayProgress {
  if (!isDayComplete(progress)) return progress;
  return { ...progress, finishedOn: progress.finishedOn ?? today, result: dayResult(progress, puzzle) };
}

/** Spoiler-free share text (no emoji): "Road to Champions · Diário #42 · 3/4 · 16,5/20" + the four lines. */
export function shareText(puzzle: DailyPuzzle, progress: DayProgress): string {
  const r = progress.result ?? dayResult(progress, puzzle);
  const archive = progress.finishedOn && progress.finishedOn !== puzzle.date ? ' (arquivo)' : '';
  return [
    `Road to Champions · Diário #${puzzle.number}${archive} · ${r.wins}/4 · ${formatPoints(r.points)}/${DAY_MAX_POINTS} pts`,
    CHALLENGES.map((c) => r.summary[c]).join(' · '),
  ].join('\n');
}

// --- Stats and streak ----------------------------------------------------------------------------------------------

export interface DailyStats {
  /** Days finished (on time or from the archive). */
  played: number;
  /** Average points of the finished days. */
  average: number;
  best: number;
  /** Consecutive days finished on their own day, ending today (or yesterday while today is still open). */
  streak: number;
  bestStreak: number;
  /** How many finished days had 0…4 challenges won. */
  wins: [number, number, number, number, number];
}

const onTime = (date: string, p: DayProgress | undefined): boolean => !!p?.result && p.finishedOn === date;

export function dailyStats(store: DailyStore, today: string): DailyStats {
  const finished = Object.entries(store.days).filter(([, p]) => p.result);
  const wins: DailyStats['wins'] = [0, 0, 0, 0, 0];
  for (const [, p] of finished) wins[Math.max(0, Math.min(4, p.result!.wins))]!++;
  const points = finished.map(([, p]) => p.result!.points);
  let streak = 0;
  if (isDayKey(today)) {
    let n = dayNumber(today);
    if (!onTime(today, store.days[today])) n -= 1;
    while (onTime(keyFromDayNumber(n), store.days[keyFromDayNumber(n)])) {
      streak++;
      n--;
    }
  }
  let bestStreak = 0;
  let run = 0;
  let prev: number | null = null;
  const days = Object.keys(store.days)
    .filter((d) => isDayKey(d) && onTime(d, store.days[d]))
    .map(dayNumber)
    .sort((a, b) => a - b);
  for (const n of days) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = n;
  }
  return {
    played: finished.length,
    average: points.length ? points.reduce((s, x) => s + x, 0) / points.length : 0,
    best: points.length ? Math.max(...points) : 0,
    streak,
    bestStreak: Math.max(bestStreak, streak),
    wins,
  };
}

// --- Storage format ------------------------------------------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strArr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);

function parseProgress(x: unknown): DayProgress | null {
  if (!isObj(x)) return null;
  const base = emptyProgress();
  const l = isObj(x.linhas) ? x.linhas : {};
  const hints: Record<string, HintKind[]> = {};
  if (isObj(l.hints)) {
    for (const [k, v] of Object.entries(l.hints)) hints[k] = strArr(v).filter((h): h is HintKind => (HINT_KINDS as string[]).includes(h));
  }
  const pr = isObj(x.pro) ? x.pro : {};
  const im = isObj(x.impostor) ? x.impostor : {};
  const pl = isObj(x.placar) ? x.placar : {};
  const out: DayProgress = {
    linhas: { found: strArr(l.found), misses: strArr(l.misses), hints, done: l.done === true },
    pro: { guesses: strArr(pr.guesses), done: pr.done === true },
    impostor: { pick: typeof im.pick === 'string' ? im.pick : base.impostor.pick },
    placar: {
      winner: pl.winner === 0 || pl.winner === 1 ? pl.winner : null,
      loserMaps: typeof pl.loserMaps === 'number' ? pl.loserMaps : null,
      map: typeof pl.map === 'string' ? pl.map : null,
      done: pl.done === true,
    },
  };
  if (typeof x.finishedOn === 'string' && isDayKey(x.finishedOn)) out.finishedOn = x.finishedOn;
  if (isObj(x.result) && typeof x.result.points === 'number' && typeof x.result.wins === 'number' && isObj(x.result.challenges) && isObj(x.result.summary)) {
    out.result = x.result as unknown as DayResult;
  }
  return out;
}

/** Reads a saved store (anything malformed is dropped, never thrown). */
export function parseDailyStore(json: unknown): DailyStore {
  if (!isObj(json) || json.v !== 1 || !isObj(json.days)) return emptyStore();
  const days: Record<string, DayProgress> = {};
  for (const [k, v] of Object.entries(json.days)) {
    if (!isDayKey(k)) continue;
    const p = parseProgress(v);
    if (p) days[k] = p;
  }
  return { v: 1, days };
}
