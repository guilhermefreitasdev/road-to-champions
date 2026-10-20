/**
 * Playing the Valdle: the progress of one puzzle (JSON, saved in localStorage by the UI under `rtc:valdle:v1`), the
 * moves of each game, the results, the share text and the personal stats (daily win streak, wins, distribution;
 * free-mode counts). Pure: no storage, no clock (the day key of "today" is passed in), no data beyond the puzzle.
 *
 * - Guess games (Agente Clássico, Habilidade, Mapa, Callout, Arma, Pro Clássico, Comp Misteriosa): `guesses` are
 *   ids; won when the answer is guessed within VALDLE_GAMES[game].maxTries. Habilidade adds a bonus question (which
 *   ability: C, Q, E or X) once the agent part is over.
 * - Grade 3x3: `guesses` are "cell:playerId" (cell 0–8, row-major); a pick is right when the player fits the cell
 *   and was not used yet; 12 picks for the 9 cells; won with the 9 cells.
 * - Conexões: `guesses` are four player ids, sorted and joined by ","; won with the 4 groups before the 4th mistake.
 */
import { dayNumber, isDayKey, keyFromDayNumber } from '../daily/calendar';
import type { Mark } from './feedback';
import { VALDLE_GAMES, VALDLE_GAME_IDS, isValdleGame, type ValdleGameId } from './games';
import type { PuzzleMeta } from './planner';
import type { AbilitySlot, AgentePuzzle, ArmaPuzzle, CalloutPuzzle, HabilidadePuzzle, MapaPuzzle } from './classic';
import type { CompPuzzle, ConexoesPuzzle, GradePuzzle, ProPuzzle } from './pro';

export interface PuzzleByGame {
  agente: AgentePuzzle;
  habilidade: HabilidadePuzzle;
  mapa: MapaPuzzle;
  callout: CalloutPuzzle;
  arma: ArmaPuzzle;
  pro: ProPuzzle;
  grade: GradePuzzle;
  conexoes: ConexoesPuzzle;
  comp: CompPuzzle;
}

export type ValdlePuzzle<G extends ValdleGameId = ValdleGameId> = PuzzleByGame[G] & PuzzleMeta & { game: G };

export interface ValdleResult {
  won: boolean;
  /** Guess games: guesses made; Grade: picks; Conexões: mistakes. */
  tries: number;
  /** Guess games: 1 if won; Grade: cells filled; Conexões: groups found. */
  score: number;
  max: number;
  /** Habilidade: the bonus question (null while unanswered). */
  bonus?: boolean | null;
}

export interface ValdleProgress {
  guesses: string[];
  /** Habilidade: the slot picked in the bonus question. */
  bonus?: string | null;
  gaveUp?: boolean;
  /** Day key (São Paulo) when the puzzle ended: equal to the puzzle's date = played on its day. */
  finishedOn?: string;
  /** Snapshot once it ended (stats read it without the puzzle). */
  result?: ValdleResult;
}

export const emptyProgress = (): ValdleProgress => ({ guesses: [] });

export type GuessOutcome = 'hit' | 'miss' | 'repeat' | 'over' | 'filled' | 'used';

/** The id a guess game is looking for. */
export function answerOf(p: ValdlePuzzle): string {
  switch (p.game) {
    case 'agente':
    case 'arma':
    case 'pro':
      return (p as ValdlePuzzle<'agente'>).answer;
    case 'habilidade':
      return (p as ValdlePuzzle<'habilidade'>).agent;
    case 'mapa':
      return (p as ValdlePuzzle<'mapa'>).map;
    case 'callout':
      return (p as ValdlePuzzle<'callout'>).callout;
    case 'comp':
      return (p as ValdlePuzzle<'comp'>).team.key;
    default:
      return '';
  }
}

// --- Grade ---------------------------------------------------------------------------------------------------------

export function gradePick(g: string): { cell: number; id: string } {
  const at = g.indexOf(':');
  return { cell: Number(g.slice(0, at)), id: g.slice(at + 1) };
}

/** Player placed in each cell (null = empty), replaying the picks in order. */
export function gradeCells(puzzle: GradePuzzle, progress: ValdleProgress): (string | null)[] {
  const cells: (string | null)[] = Array(9).fill(null);
  const used = new Set<string>();
  for (const g of progress.guesses) {
    const { cell, id } = gradePick(g);
    if (cells[cell] !== null || used.has(id)) continue;
    if (puzzle.answers[cell]?.includes(id)) {
      cells[cell] = id;
      used.add(id);
    }
  }
  return cells;
}

export function guessGrade(puzzle: GradePuzzle, progress: ValdleProgress, cell: number, id: string): { progress: ValdleProgress; outcome: GuessOutcome } {
  if (isDone('grade', puzzle as ValdlePuzzle, progress)) return { progress, outcome: 'over' };
  const cells = gradeCells(puzzle, progress);
  if (cells[cell] !== null) return { progress, outcome: 'filled' };
  if (cells.includes(id)) return { progress, outcome: 'used' };
  if (progress.guesses.includes(`${cell}:${id}`)) return { progress, outcome: 'repeat' };
  const next = { ...progress, guesses: [...progress.guesses, `${cell}:${id}`] };
  return { progress: next, outcome: puzzle.answers[cell]?.includes(id) ? 'hit' : 'miss' };
}

// --- Conexões ------------------------------------------------------------------------------------------------------

export const conexoesKey = (ids: readonly string[]): string => [...ids].sort().join(',');

export function conexoesState(puzzle: ConexoesPuzzle, progress: ValdleProgress): { solved: number[]; mistakes: string[] } {
  const keys = puzzle.groups.map((g) => conexoesKey(g.players));
  const solved: number[] = [];
  const mistakes: string[] = [];
  for (const g of progress.guesses) {
    const i = keys.indexOf(g);
    if (i >= 0) {
      if (!solved.includes(i)) solved.push(i);
    } else mistakes.push(g);
  }
  return { solved, mistakes };
}

/** A wrong group with three of one hidden group ("quase"). */
export function isOneAway(puzzle: ConexoesPuzzle, ids: readonly string[]): boolean {
  return puzzle.groups.some((g) => ids.filter((id) => g.players.includes(id)).length === 3);
}

export function guessConexoes(puzzle: ConexoesPuzzle, progress: ValdleProgress, ids: readonly string[]): { progress: ValdleProgress; outcome: GuessOutcome; oneAway: boolean } {
  if (isDone('conexoes', puzzle as ValdlePuzzle, progress)) return { progress, outcome: 'over', oneAway: false };
  if (ids.length !== 4 || new Set(ids).size !== 4) throw new Error('conexoes: pick four players');
  const key = conexoesKey(ids);
  if (progress.guesses.includes(key)) return { progress, outcome: 'repeat', oneAway: false };
  const hit = puzzle.groups.some((g) => conexoesKey(g.players) === key);
  return { progress: { ...progress, guesses: [...progress.guesses, key] }, outcome: hit ? 'hit' : 'miss', oneAway: !hit && isOneAway(puzzle, ids) };
}

// --- Guess games ---------------------------------------------------------------------------------------------------

export function guess(puzzle: ValdlePuzzle, progress: ValdleProgress, id: string): { progress: ValdleProgress; outcome: GuessOutcome } {
  if (isDone(puzzle.game, puzzle, progress)) return { progress, outcome: 'over' };
  if (progress.guesses.includes(id)) return { progress, outcome: 'repeat' };
  return { progress: { ...progress, guesses: [...progress.guesses, id] }, outcome: id === answerOf(puzzle) ? 'hit' : 'miss' };
}

/** Habilidade's bonus: which ability (slot) it is; once, after the agent part ended. */
export function answerBonus(puzzle: ValdlePuzzle<'habilidade'>, progress: ValdleProgress, slot: AbilitySlot): ValdleProgress {
  if (!isDone('habilidade', puzzle, progress) || progress.bonus) return progress;
  return { ...progress, bonus: slot };
}

export function giveUp(progress: ValdleProgress): ValdleProgress {
  return progress.gaveUp ? progress : { ...progress, gaveUp: true };
}

/** Wrong guesses so far (guess games), for the clues that open one by one. */
export function misses(puzzle: ValdlePuzzle, progress: ValdleProgress): number {
  const answer = answerOf(puzzle);
  return progress.guesses.filter((g) => g !== answer).length;
}

// --- Results -------------------------------------------------------------------------------------------------------

export function isDone(game: ValdleGameId, puzzle: ValdlePuzzle, progress: ValdleProgress): boolean {
  if (progress.gaveUp) return true;
  const max = VALDLE_GAMES[game].maxTries;
  if (game === 'grade') {
    const cells = gradeCells(puzzle as unknown as GradePuzzle, progress);
    return cells.every((c) => c !== null) || progress.guesses.length >= max;
  }
  if (game === 'conexoes') {
    const s = conexoesState(puzzle as unknown as ConexoesPuzzle, progress);
    return s.solved.length === 4 || s.mistakes.length >= max;
  }
  return progress.guesses.includes(answerOf(puzzle)) || progress.guesses.length >= max;
}

export function resultOf(puzzle: ValdlePuzzle, progress: ValdleProgress): ValdleResult {
  const { game } = puzzle;
  if (game === 'grade') {
    const filled = gradeCells(puzzle as unknown as GradePuzzle, progress).filter((c) => c !== null).length;
    return { won: filled === 9, tries: progress.guesses.length, score: filled, max: 9 };
  }
  if (game === 'conexoes') {
    const s = conexoesState(puzzle as unknown as ConexoesPuzzle, progress);
    return { won: s.solved.length === 4, tries: s.mistakes.length, score: s.solved.length, max: 4 };
  }
  const at = progress.guesses.indexOf(answerOf(puzzle));
  const won = at >= 0;
  const out: ValdleResult = { won, tries: won ? at + 1 : progress.guesses.length, score: won ? 1 : 0, max: VALDLE_GAMES[game].maxTries };
  if (game === 'habilidade') out.bonus = progress.bonus ? progress.bonus === (puzzle as ValdlePuzzle<'habilidade'>).slot : null;
  return out;
}

/** After a move: stamps the finishing day and the result snapshot (kept up to date, e.g. by the bonus). */
export function settle(puzzle: ValdlePuzzle, progress: ValdleProgress, today: string): ValdleProgress {
  if (!isDone(puzzle.game, puzzle, progress)) return progress;
  return { ...progress, finishedOn: progress.finishedOn ?? today, result: resultOf(puzzle, progress) };
}

// --- Share text ----------------------------------------------------------------------------------------------------

const MARK_LETTER: Record<Mark, string> = { hit: 'V', partial: 'P', miss: '-' };

/**
 * Spoiler-free share text, no emoji: the game and number, the result and one line per guess. `marks` (games with
 * columns): the feedback of each guess; the legend says V = certo, P = perto, - = errado.
 */
export function shareText(puzzle: ValdlePuzzle, progress: ValdleProgress, marks?: readonly (readonly Mark[])[]): string {
  const info = VALDLE_GAMES[puzzle.game];
  const r = progress.result ?? resultOf(puzzle, progress);
  const late = puzzle.mode === 'daily' && progress.finishedOn && progress.finishedOn !== puzzle.id ? ' (arquivo)' : '';
  const head = puzzle.mode === 'daily' ? `Road to Champions · Valdle ${info.label} #${puzzle.number}${late}` : `Road to Champions · Valdle ${info.label} · Modo livre`;
  const lines: string[] = [head];
  if (puzzle.game === 'grade') {
    const cells = gradeCells(puzzle as unknown as GradePuzzle, progress);
    lines.push(`${r.score}/9 casas em ${r.tries} palpites`);
    for (let row = 0; row < 3; row++) lines.push(cells.slice(row * 3, row * 3 + 3).map((c) => (c ? 'V' : '-')).join(' '));
  } else if (puzzle.game === 'conexoes') {
    const groups = (puzzle as unknown as ConexoesPuzzle).groups;
    lines.push(`${r.score}/4 grupos · ${r.tries} erro${r.tries === 1 ? '' : 's'}`);
    for (const g of progress.guesses) {
      const ids = g.split(',');
      lines.push(ids.map((id) => String(groups.findIndex((gr) => gr.players.includes(id)) + 1)).sort().join(' '));
    }
  } else {
    lines.push(r.won ? `Acertei em ${r.tries}/${r.max}` : `Não acertei em ${r.max} tentativas`);
    if (puzzle.game === 'habilidade' && r.bonus !== undefined && r.bonus !== null) lines[1] += r.bonus ? ' · bônus certo' : ' · bônus errado';
    if (marks?.length) {
      for (const row of marks) lines.push(row.map((m) => MARK_LETTER[m]).join(' '));
      lines.push('V certo · P perto · - errado');
    } else {
      const answer = answerOf(puzzle);
      lines.push(progress.guesses.map((g) => (g === answer ? 'V' : '-')).join(' '));
    }
  }
  return lines.join('\n');
}

// --- Store and stats -----------------------------------------------------------------------------------------------

export interface FreeSlot {
  seed: string;
  progress: ValdleProgress;
  /** Free puzzles finished and won (all time). */
  played: number;
  won: number;
}

export interface ValdleStore {
  v: 1;
  daily: Partial<Record<ValdleGameId, Record<string, ValdleProgress>>>;
  free: Partial<Record<ValdleGameId, FreeSlot>>;
}

export const emptyStore = (): ValdleStore => ({ v: 1, daily: {}, free: {} });

/** Applies a move to a daily puzzle (and settles it). */
export function updateDaily(store: ValdleStore, puzzle: ValdlePuzzle, fn: (p: ValdleProgress) => ValdleProgress, today: string): ValdleStore {
  const days = store.daily[puzzle.game] ?? {};
  const next = settle(puzzle, fn(days[puzzle.id] ?? emptyProgress()), today);
  return { ...store, daily: { ...store.daily, [puzzle.game]: { ...days, [puzzle.id]: next } } };
}

/** Applies a move to the open free puzzle; counts it once when it ends. */
export function updateFree(store: ValdleStore, puzzle: ValdlePuzzle, fn: (p: ValdleProgress) => ValdleProgress, today: string): ValdleStore {
  const slot = store.free[puzzle.game];
  const base: FreeSlot = slot && slot.seed === puzzle.id ? slot : { seed: puzzle.id, progress: emptyProgress(), played: slot?.played ?? 0, won: slot?.won ?? 0 };
  const progress = settle(puzzle, fn(base.progress), today);
  const ended = !base.progress.result && progress.result;
  const out: FreeSlot = {
    seed: puzzle.id,
    progress,
    played: base.played + (ended ? 1 : 0),
    won: base.won + (ended && progress.result!.won ? 1 : 0),
  };
  return { ...store, free: { ...store.free, [puzzle.game]: out } };
}

/** Starts a new free puzzle (the open one is dropped; counts stay). */
export function newFree(store: ValdleStore, game: ValdleGameId, seed: string): ValdleStore {
  const slot = store.free[game];
  return { ...store, free: { ...store.free, [game]: { seed, progress: emptyProgress(), played: slot?.played ?? 0, won: slot?.won ?? 0 } } };
}

export interface GameStats {
  played: number;
  won: number;
  /** Consecutive daily puzzles won on their own day, ending today (or yesterday while today is open). */
  streak: number;
  bestStreak: number;
  /** Wins by tries (guess games, index = tries - 1); Grade: puzzles by cells filled (0–9); Conexões: wins by mistakes (0–3). */
  dist: number[];
  freePlayed: number;
  freeWon: number;
}

export function gameStats(store: ValdleStore, game: ValdleGameId, today: string): GameStats {
  const days = store.daily[game] ?? {};
  const results = Object.entries(days).filter(([, p]) => p.result);
  const max = VALDLE_GAMES[game].maxTries;
  const dist = Array<number>(game === 'grade' ? 10 : game === 'conexoes' ? max : max).fill(0);
  for (const [, p] of results) {
    const r = p.result!;
    if (game === 'grade') dist[Math.max(0, Math.min(9, r.score))]!++;
    else if (r.won) dist[Math.max(0, Math.min(dist.length - 1, game === 'conexoes' ? r.tries : r.tries - 1))]!++;
  }
  const wonOnTime = (date: string) => {
    const p = days[date];
    return !!p?.result?.won && p.finishedOn === date;
  };
  let streak = 0;
  if (isDayKey(today)) {
    let n = dayNumber(today);
    if (!days[today]?.result) n -= 1;
    while (wonOnTime(keyFromDayNumber(n))) {
      streak++;
      n--;
    }
  }
  let bestStreak = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of Object.keys(days).filter((d) => isDayKey(d) && wonOnTime(d)).map(dayNumber).sort((a, b) => a - b)) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = n;
  }
  const free = store.free[game];
  return {
    played: results.length,
    won: results.filter(([, p]) => p.result!.won).length,
    streak,
    bestStreak: Math.max(bestStreak, streak),
    dist,
    freePlayed: free?.played ?? 0,
    freeWon: free?.won ?? 0,
  };
}

// --- Storage format ------------------------------------------------------------------------------------------------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strArr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

function parseProgress(x: unknown): ValdleProgress | null {
  if (!isObj(x)) return null;
  const out: ValdleProgress = { guesses: strArr(x.guesses).slice(0, 64) };
  if (typeof x.bonus === 'string') out.bonus = x.bonus;
  if (x.gaveUp === true) out.gaveUp = true;
  if (typeof x.finishedOn === 'string' && isDayKey(x.finishedOn)) out.finishedOn = x.finishedOn;
  const r = x.result;
  if (isObj(r) && typeof r.won === 'boolean') {
    out.result = { won: r.won, tries: num(r.tries), score: num(r.score), max: num(r.max) };
    if (typeof r.bonus === 'boolean' || r.bonus === null) out.result.bonus = r.bonus;
  }
  return out;
}

/** Reads a saved store (anything malformed is dropped, never thrown). */
export function parseValdleStore(json: unknown): ValdleStore {
  const out = emptyStore();
  if (!isObj(json) || json.v !== 1) return out;
  if (isObj(json.daily)) {
    for (const [game, days] of Object.entries(json.daily)) {
      if (!isValdleGame(game) || !isObj(days)) continue;
      const parsed: Record<string, ValdleProgress> = {};
      for (const [d, p] of Object.entries(days)) {
        const pp = isDayKey(d) ? parseProgress(p) : null;
        if (pp) parsed[d] = pp;
      }
      out.daily[game] = parsed;
    }
  }
  if (isObj(json.free)) {
    for (const [game, slot] of Object.entries(json.free)) {
      if (!isValdleGame(game) || !isObj(slot) || typeof slot.seed !== 'string') continue;
      const progress = parseProgress(slot.progress) ?? emptyProgress();
      out.free[game] = { seed: slot.seed, progress, played: num(slot.played), won: num(slot.won) };
    }
  }
  return out;
}

/** Daily puzzles of a day already ended, per game (the home card and the hubs read it without any data). */
export function doneToday(store: ValdleStore, today: string): Record<ValdleGameId, boolean> {
  return Object.fromEntries(VALDLE_GAME_IDS.map((g) => [g, !!store.daily[g]?.[today]?.result])) as Record<ValdleGameId, boolean>;
}
