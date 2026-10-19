import type { BestOf } from './types';
import {
  PLAYOFF_BRACKET,
  PLAYOFF_TEAMS,
  matchLoser,
  matchWinner,
  type BracketSlot,
  type BracketSource,
  type Entrant,
  type MatchResult,
  type PlayoffRound,
  type TMatch,
} from './tournament';

/**
 * Standalone 8-team double-elimination bracket (the Masters of the Complete Trials mode): the same 14-match
 * skeleton as the Champions playoffs (PLAYOFF_BRACKET), seeded directly instead of fed by groups.
 *
 * The group places of the skeleton map to seeds so that the quarter-finals are 1 v 8, 4 v 5, 2 v 7 and 3 v 6:
 *   A1 → 1 · B2 → 8 · C1 → 4 · D2 → 5 · B1 → 2 · A2 → 7 · D1 → 3 · C2 → 6.
 * Every match is Bo3 except the grand final (Bo5) unless `bestOf` overrides a round.
 *
 * Lineup-agnostic, deterministic, plain JSON, never mutated: the same contract as tournament.ts.
 */

export interface BracketState {
  version: 1;
  /** Sorted by seed (best first). */
  entrants: Entrant[];
  /** Matches created so far, in creation order = play order. */
  matches: TMatch[];
  phase: 'playoffs' | 'done';
  champion?: string;
}

export interface BracketCell {
  slot: BracketSlot;
  match?: TMatch;
}

/** Seed (1–8) that takes each group-place source of the skeleton. */
export const SEED_OF_PLACE: Record<string, number> = { A1: 1, B2: 8, C1: 4, D2: 5, B1: 2, A2: 7, D1: 3, C2: 6 };

/** Seed of a skeleton source, when it is a group place. */
export function seedOfSource(src: BracketSource): number | undefined {
  return 'place' in src ? SEED_OF_PLACE[`${src.group}${src.place}`] : undefined;
}

/** Default best-of per round: Bo3 everywhere, Bo5 grand final. */
export const BRACKET_BEST_OF: Partial<Record<PlayoffRound, BestOf>> = { gf: 5 };

/** The skeleton with the best-of of this bracket applied. */
export function bracketSlots(bestOf: Partial<Record<PlayoffRound, BestOf>> = BRACKET_BEST_OF): BracketSlot[] {
  return PLAYOFF_BRACKET.map((s) => ({ ...s, bestOf: bestOf[s.round] ?? 3 }));
}

/** Starts a bracket. Throws unless there are exactly 8 entrants with unique ids and seeds. */
export function createBracket(entrants: Entrant[], bestOf: Partial<Record<PlayoffRound, BestOf>> = BRACKET_BEST_OF): BracketState {
  if (entrants.length !== PLAYOFF_TEAMS) {
    throw new Error(`A bracket needs exactly ${PLAYOFF_TEAMS} entrants, got ${entrants.length}`);
  }
  if (new Set(entrants.map((e) => e.id)).size !== PLAYOFF_TEAMS) throw new Error('Entrant ids must be unique');
  if (entrants.some((e) => !Number.isFinite(e.seed))) throw new Error('Entrant seeds must be finite numbers');
  if (new Set(entrants.map((e) => e.seed)).size !== PLAYOFF_TEAMS) throw new Error('Entrant seeds must be unique');
  const sorted = entrants.map((e) => ({ id: e.id, name: e.name, seed: e.seed })).sort((x, y) => x.seed - y.seed);
  return createReadyMatches({ version: 1, entrants: sorted, matches: [], phase: 'playoffs' }, bestOf);
}

export function bracketPending(state: BracketState): TMatch[] {
  return state.matches.filter((m) => !m.result);
}

export function findBracketMatch(state: BracketState, matchId: string): TMatch | undefined {
  return state.matches.find((m) => m.id === matchId);
}

/** Resolves a source to an entrant id: a seed (group-place source) or the winner/loser of a played match. */
export function resolveBracketSource(state: BracketState, src: BracketSource): string | undefined {
  if ('place' in src) {
    const seed = seedOfSource(src);
    return seed === undefined ? undefined : state.entrants[seed - 1]?.id;
  }
  if ('groupSeed' in src) return undefined;
  const m = findBracketMatch(state, 'winnerOf' in src ? src.winnerOf : src.loserOf);
  if (!m) return undefined;
  return 'winnerOf' in src ? matchWinner(m) : matchLoser(m);
}

/** Records a result and returns the new state with the matches that just became ready. */
export function reportBracketResult(
  state: BracketState,
  matchId: string,
  result: MatchResult,
  bestOf: Partial<Record<PlayoffRound, BestOf>> = BRACKET_BEST_OF,
): BracketState {
  const index = state.matches.findIndex((m) => m.id === matchId);
  const match = state.matches[index];
  if (!match) throw new Error(`Unknown match: ${matchId}`);
  if (match.result) throw new Error(`Match already finished: ${matchId}`);
  validateResult(match, result);
  const matches = state.matches.slice();
  matches[index] = { ...match, result: { winner: result.winner, score: [result.score[0], result.score[1]] } };
  const next: BracketState = { ...state, matches };
  const gf = matches.find((m) => m.id === 'gf');
  const champion = gf && matchWinner(gf);
  if (champion) return { ...next, phase: 'done', champion };
  return createReadyMatches(next, bestOf);
}

/** The full skeleton with the matches created so far. */
export function bracketCells(state: BracketState, bestOf: Partial<Record<PlayoffRound, BestOf>> = BRACKET_BEST_OF): BracketCell[] {
  const byId = new Map(state.matches.map((m) => [m.id, m]));
  return bracketSlots(bestOf).map((slot) => {
    const match = byId.get(slot.id);
    return match ? { slot, match } : { slot };
  });
}

export type BracketFinishStage = 'playoffs' | 'top4' | 'final' | 'champion';

export interface BracketPlace {
  rank: number;
  /** "1º", "5º–6º"… */
  label: string;
  stage: BracketFinishStage;
}

/** Place of the loser of each round of a double-elimination bracket. */
export const BRACKET_LOSER_PLACES: Partial<Record<PlayoffRound, BracketPlace>> = {
  gf: { rank: 2, label: '2º', stage: 'final' },
  'lb-final': { rank: 3, label: '3º', stage: 'top4' },
  'lb-r3': { rank: 4, label: '4º', stage: 'top4' },
  'lb-r2': { rank: 5, label: '5º–6º', stage: 'playoffs' },
  'lb-r1': { rank: 7, label: '7º–8º', stage: 'playoffs' },
};

/** Final place of a team in the bracket, once decided. */
export function bracketPlaceOf(state: BracketState, id: string): BracketPlace | undefined {
  if (state.champion === id) return { rank: 1, label: '1º', stage: 'champion' };
  for (const m of state.matches) {
    if (matchLoser(m) !== id) continue;
    const place = BRACKET_LOSER_PLACES[m.round as PlayoffRound];
    if (place) return place;
  }
  return undefined;
}

/** Entrant ids ordered by their final place (best first); only complete once the bracket is done. */
export function bracketRanking(state: BracketState): string[] {
  return state.entrants
    .map((e) => ({ id: e.id, place: bracketPlaceOf(state, e.id), seed: e.seed }))
    .filter((e) => e.place)
    .sort((x, y) => x.place!.rank - y.place!.rank || x.seed - y.seed)
    .map((e) => e.id);
}

/** Plays every pending match with `play` until the bracket is done. */
export function runBracket(state: BracketState, play: (m: TMatch) => MatchResult): BracketState {
  let current = state;
  for (let guard = 0; guard < 1000; guard++) {
    const [match] = bracketPending(current);
    if (!match) return current;
    current = reportBracketResult(current, match.id, play(match));
  }
  throw new Error('Bracket did not finish');
}

function createReadyMatches(state: BracketState, bestOf: Partial<Record<PlayoffRound, BestOf>>): BracketState {
  const existing = new Set(state.matches.map((m) => m.id));
  const added: TMatch[] = [];
  for (const s of bracketSlots(bestOf)) {
    if (existing.has(s.id)) continue;
    const a = resolveBracketSource(state, s.a);
    const b = resolveBracketSource(state, s.b);
    if (a === undefined || b === undefined) continue;
    added.push({ id: s.id, stage: 'playoffs', round: s.round, label: s.label, a, b, bestOf: s.bestOf });
  }
  return added.length ? { ...state, matches: [...state.matches, ...added] } : state;
}

function validateResult(match: TMatch, result: MatchResult): void {
  const { winner, score } = result;
  if (winner !== 0 && winner !== 1) throw new Error(`Invalid winner: ${String(winner)}`);
  if (!Array.isArray(score) || score.length !== 2 || !score.every((s) => Number.isInteger(s) && s >= 0)) {
    throw new Error(`Invalid score: ${JSON.stringify(score)}`);
  }
  const needed = Math.ceil(match.bestOf / 2);
  const won = score[winner] ?? 0;
  const lost = score[winner === 0 ? 1 : 0] ?? 0;
  if (won !== needed || lost >= needed) {
    throw new Error(`Score ${score.join('-')} doesn't fit a Bo${match.bestOf} won by side ${winner}`);
  }
}
