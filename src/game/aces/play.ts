/**
 * Playing "Acerte o ace": the guesses of one puzzle (JSON, kept by the UI in the `rtc:aces:v1` slot), the checks,
 * the feedback of a wrong guess, the points, the share text and the personal stats. Pure: no storage, no clock (the
 * day key of "today" is passed in), no data beyond the puzzle and the facts lookup.
 *
 * Rules (docs/aces.md): up to MAX_TRIES guesses; points by the try that got it (5, 4, 3, 2, 1); a wrong guess shows
 * how the guessed pro compares with the answer (país, região, função, estreia, colega de time) and, after 2 and 4
 * misses, the event hint and the team hint. "Desistir" ends it with 0 points.
 */
import type { Ace } from '../../data/real/aces';
import { dayNumber, isDayKey, keyFromDayNumber } from '../daily/calendar';
import { normalizeName } from '../daily/text';
import { compareGuess, type Comparison, type FactsLookup } from './facts';
import { HINT_AFTER, MAX_TRIES, TRY_POINTS, aceHints, watchUrl, type AceHint, type DailyAcePuzzle } from './puzzle';

export interface AceGuess {
  /** Pool player id when the guess came from the autocomplete; null for a typed handle. */
  playerId: string | null;
  handle: string;
}

export interface AceProgress {
  /** The ace this progress belongs to (set by the UI; a Daily day whose ace changed after a data update starts over). */
  aceId?: string;
  guesses: AceGuess[];
  gaveUp: boolean;
  done: boolean;
  /** Daily only: day key (São Paulo) when it ended; equal to the puzzle's date = played on time. */
  finishedOn?: string;
  result?: AceResult;
}

export interface AceResult {
  solved: boolean;
  /** Try that got it (1-based), null when not solved. */
  tries: number | null;
  points: number;
}

export const emptyAceProgress = (aceId?: string): AceProgress => ({ ...(aceId ? { aceId } : {}), guesses: [], gaveUp: false, done: false });

/** The saved progress of a puzzle, or a fresh one when there is none or it belongs to another ace. */
export function progressFor(saved: AceProgress | undefined, aceId: string): AceProgress {
  return saved && (saved.aceId === undefined || saved.aceId === aceId) ? { ...saved, aceId } : emptyAceProgress(aceId);
}

/** True when a guess names the ace's pro: by id (pool id or VLR id), else by handle or alias (case/accent-insensitive). */
export function isAnswer(ace: Pick<Ace, 'playerId' | 'vlrPlayerId' | 'handle' | 'aliases'>, guess: AceGuess): boolean {
  if (guess.playerId !== null) return guess.playerId === ace.playerId || guess.playerId === String(ace.vlrPlayerId);
  const n = normalizeName(guess.handle);
  return !!n && [ace.handle, ...(ace.aliases ?? [])].some((h) => normalizeName(h) === n);
}

const sameGuess = (a: AceGuess, b: AceGuess): boolean =>
  a.playerId !== null && b.playerId !== null ? a.playerId === b.playerId : normalizeName(a.handle) === normalizeName(b.handle);

export type GuessOutcome = 'hit' | 'miss' | 'repeat' | 'over';

export function guessAce(state: AceProgress, ace: Ace, guess: AceGuess): { state: AceProgress; outcome: GuessOutcome } {
  if (state.done) return { state, outcome: 'over' };
  if (!guess.handle.trim() && guess.playerId === null) return { state, outcome: 'repeat' };
  if (state.guesses.some((g) => sameGuess(g, guess))) return { state, outcome: 'repeat' };
  const hit = isAnswer(ace, guess);
  const guesses = [...state.guesses, guess];
  return { state: { ...state, guesses, done: hit || guesses.length >= MAX_TRIES }, outcome: hit ? 'hit' : 'miss' };
}

export function giveUp(state: AceProgress): AceProgress {
  return state.done ? state : { ...state, gaveUp: true, done: true };
}

export function missCount(state: AceProgress, ace: Ace): number {
  return state.guesses.filter((g) => !isAnswer(ace, g)).length;
}

/** Hints unlocked so far (all of them once it is over). */
export function visibleHints(state: AceProgress, ace: Ace): AceHint[] {
  const misses = missCount(state, ace);
  return aceHints(ace).filter((h) => state.done || misses >= HINT_AFTER[h.kind]);
}

export interface GuessFeedback {
  guess: AceGuess;
  correct: boolean;
  /** Null for the right guess. */
  comparison: Comparison | null;
}

/** Feedback of every guess so far, in order. */
export function guessFeedback(state: AceProgress, ace: Ace, facts: FactsLookup): GuessFeedback[] {
  const answer = ace.playerId ? facts(ace.playerId) : undefined;
  return state.guesses.map((guess) => {
    const correct = isAnswer(ace, guess);
    return {
      guess,
      correct,
      comparison: correct ? null : compareGuess(ace, guess.playerId ? facts(guess.playerId) : undefined, answer),
    };
  });
}

export function aceResult(state: AceProgress, ace: Ace): AceResult {
  const at = state.guesses.findIndex((g) => isAnswer(ace, g));
  const tries = at >= 0 ? at + 1 : null;
  return { solved: tries !== null, tries, points: tries ? TRY_POINTS[tries - 1]! : 0 };
}

/** After a move: stamps the finishing day and the result the first time the puzzle is over. */
export function settleAce(state: AceProgress, ace: Ace, today: string): AceProgress {
  if (!state.done) return state;
  return { ...state, finishedOn: state.finishedOn ?? today, result: state.result ?? aceResult(state, ace) };
}

/** Everything about the ace, for the screen after the round: null while the round is open (nothing leaks before). */
export interface AceReveal {
  ace: Ace;
  /** The original video on YouTube (with t= when verified), its title and channel: the credit under the player. */
  video: { url: string; title: string; channel: string | null; channelUrl: string | null };
  description: string;
  sources: string[];
  /** The VLR match page (Performance tab) where the 5K was checked. */
  vlrUrl: string;
}

export function revealAce(state: AceProgress, ace: Ace): AceReveal | null {
  if (!state.done || !ace.youtube) return null;
  const y = ace.youtube;
  return {
    ace,
    video: { url: watchUrl(y), title: y.title, channel: y.channel, channelUrl: y.channelUrl },
    description: ace.description,
    sources: ace.sources,
    vlrUrl: ace.match.url,
  };
}

/** "na 2ª tentativa" / "não acertou". */
export function resultWords(r: AceResult): string {
  return r.solved ? `acertei na ${r.tries}ª tentativa` : 'não acertei';
}

/**
 * Spoiler-free share text, no emoji:
 * "Road to Champions · Acerte o ace #12 · 4/5 pts" + "acertei na 2ª tentativa · erro, acerto".
 */
export function shareText(puzzle: Pick<DailyAcePuzzle, 'number' | 'date'>, state: AceProgress, ace: Ace): string {
  const r = state.result ?? aceResult(state, ace);
  const archive = state.finishedOn && state.finishedOn !== puzzle.date ? ' (arquivo)' : '';
  const marks: string[] = state.guesses.map((g) => (isAnswer(ace, g) ? 'acerto' : 'erro'));
  if (state.gaveUp) marks.push('desisti');
  return [
    `Road to Champions · Acerte o ace #${puzzle.number}${archive} · ${r.points}/${TRY_POINTS[0]} pts`,
    [resultWords(r), marks.join(', ')].filter(Boolean).join(' · '),
  ].join('\n');
}

// --- Save ----------------------------------------------------------------------------------------------------------

export const ACES_SAVE_VERSION = 1;
/** How many recent free-mode ace ids are kept (pickFreeAce avoids them). */
export const FREE_RECENT = 30;

export interface AcesSave {
  v: typeof ACES_SAVE_VERSION;
  /** Daily progress by day key. */
  days: Record<string, AceProgress>;
  free: {
    played: number;
    solved: number;
    points: number;
    /** Most recent first. */
    recent: string[];
    /** The puzzle in progress, if any. */
    current: { aceId: string; progress: AceProgress } | null;
  };
}

export const emptyAcesSave = (): AcesSave => ({ v: ACES_SAVE_VERSION, days: {}, free: { played: 0, solved: 0, points: 0, recent: [], current: null } });

/** Records a finished free-mode puzzle (counts, recent ids) and clears `current`. */
export function recordFree(save: AcesSave, aceId: string, result: AceResult): AcesSave {
  const f = save.free;
  return {
    ...save,
    free: {
      played: f.played + 1,
      solved: f.solved + (result.solved ? 1 : 0),
      points: f.points + result.points,
      recent: [aceId, ...f.recent.filter((id) => id !== aceId)].slice(0, FREE_RECENT),
      current: null,
    },
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);

function parseGuess(x: unknown): AceGuess | null {
  if (!isObj(x) || typeof x.handle !== 'string') return null;
  return { playerId: typeof x.playerId === 'string' ? x.playerId : null, handle: x.handle };
}

function parseResult(x: unknown): AceResult | undefined {
  if (!isObj(x) || typeof x.solved !== 'boolean') return undefined;
  const tries = typeof x.tries === 'number' && x.tries >= 1 && x.tries <= MAX_TRIES ? x.tries : null;
  return { solved: x.solved && tries !== null, tries, points: num(x.points) };
}

function parseProgress(x: unknown): AceProgress | null {
  if (!isObj(x)) return null;
  const guesses = (Array.isArray(x.guesses) ? x.guesses : []).map(parseGuess).filter((g): g is AceGuess => g !== null).slice(0, MAX_TRIES);
  const out: AceProgress = { guesses, gaveUp: x.gaveUp === true, done: x.done === true };
  if (typeof x.aceId === 'string') out.aceId = x.aceId;
  if (typeof x.finishedOn === 'string' && isDayKey(x.finishedOn)) out.finishedOn = x.finishedOn;
  const result = parseResult(x.result);
  if (result) out.result = result;
  return out;
}

/** Reads a saved store (anything malformed is dropped, never thrown; another version starts empty). */
export function parseAcesSave(json: unknown): AcesSave {
  const save = emptyAcesSave();
  if (!isObj(json) || json.v !== ACES_SAVE_VERSION) return save;
  if (isObj(json.days)) {
    for (const [k, v] of Object.entries(json.days)) {
      const p = isDayKey(k) ? parseProgress(v) : null;
      if (p) save.days[k] = p;
    }
  }
  const f = isObj(json.free) ? json.free : {};
  const cur = isObj(f.current) && typeof f.current.aceId === 'string' ? parseProgress(f.current.progress) : null;
  save.free = {
    played: num(f.played),
    solved: Math.min(num(f.solved), num(f.played)),
    points: num(f.points),
    recent: (Array.isArray(f.recent) ? f.recent : []).filter((s): s is string => typeof s === 'string').slice(0, FREE_RECENT),
    current: cur && isObj(f.current) ? { aceId: f.current.aceId as string, progress: cur } : null,
  };
  return save;
}

// --- Stats ---------------------------------------------------------------------------------------------------------

export interface AcesStats {
  /** Daily puzzles finished (on time or from the archive). */
  played: number;
  solved: number;
  average: number;
  /** Consecutive days solved on their own day, ending today (or yesterday while today is still open; 0 once today is lost). */
  streak: number;
  bestStreak: number;
  /** Finished days by the try that got it: index 0…4 = 1st…5th, index 5 = not solved. */
  byTry: [number, number, number, number, number, number];
}

const solvedOnTime = (date: string, p: AceProgress | undefined): boolean => !!p?.result?.solved && p.finishedOn === date;

export function acesStats(save: AcesSave, today: string): AcesStats {
  const finished = Object.values(save.days).filter((p) => p.result);
  const byTry: AcesStats['byTry'] = [0, 0, 0, 0, 0, 0];
  for (const p of finished) byTry[p.result!.tries ? Math.min(MAX_TRIES, p.result!.tries) - 1 : 5]!++;
  let streak = 0;
  // A day lost (or given up) today ends the streak at once; a day still open keeps yesterday's.
  if (isDayKey(today) && !(save.days[today]?.result && !save.days[today]!.result!.solved)) {
    let n = dayNumber(today);
    if (!solvedOnTime(today, save.days[today])) n -= 1;
    while (solvedOnTime(keyFromDayNumber(n), save.days[keyFromDayNumber(n)])) {
      streak++;
      n--;
    }
  }
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of Object.keys(save.days)
    .filter((d) => isDayKey(d) && solvedOnTime(d, save.days[d]))
    .map(dayNumber)
    .sort((a, b) => a - b)) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  const points = finished.map((p) => p.result!.points);
  return {
    played: finished.length,
    solved: finished.filter((p) => p.result!.solved).length,
    average: points.length ? points.reduce((s, x) => s + x, 0) / points.length : 0,
    streak,
    bestStreak: Math.max(best, streak),
    byTry,
  };
}
