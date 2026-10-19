import type { BestOf, TeamIndex } from './types';

/**
 * Champions tournament: 16-team Swiss stage (3 wins advance, 3 losses out)
 * followed by an 8-team double-elimination bracket (no bracket reset).
 *
 * Lineup-agnostic and deterministic: it only knows entrant ids and seeds and
 * asks the caller to play matches. The state is plain JSON and never mutated,
 * so the UI can save it and play the user's matches one at a time.
 */

export interface Entrant {
  id: string;
  name: string;
  /** 1 = best. Any unique finite numbers work; lower is better. */
  seed: number;
}

export interface MatchResult {
  winner: TeamIndex;
  /** Maps won by [a, b]. */
  score: [number, number];
}

export type Stage = 'swiss' | 'playoffs';

export type PlayoffRound = 'ub-qf' | 'ub-sf' | 'ub-final' | 'lb-r1' | 'lb-r2' | 'lb-r3' | 'lb-final' | 'gf';

export interface TMatch {
  id: string;
  stage: Stage;
  /** Stable machine key: 'swiss-r1'…'swiss-r5', or a PlayoffRound. */
  round: string;
  /** pt-BR label for the UI. */
  label: string;
  a: string;
  b: string;
  bestOf: BestOf;
  result?: MatchResult;
}

export type Phase = 'swiss' | 'playoffs' | 'done';

export interface TournamentState {
  version: 1;
  /** Sorted by seed (best first). */
  entrants: Entrant[];
  phase: Phase;
  /** Every match created so far (Swiss and playoffs), in creation order. */
  matches: TMatch[];
  /** Entrant ids by playoff seed (index 0 = playoff seed 1), set when the Swiss stage ends. */
  playoffSeeds?: string[];
  champion?: string;
}

export type SwissStatus = 'alive' | 'advanced' | 'eliminated';

export interface SwissStanding {
  id: string;
  wins: number;
  losses: number;
  /** Sum of the current (wins − losses) of every opponent already played. */
  buchholz: number;
  status: SwissStatus;
}

export const TEAM_COUNT = 16;
export const SWISS_WINS = 3;
export const SWISS_LOSSES = 3;
export const PLAYOFF_TEAMS = 8;

/** Where a playoff slot's team comes from. Seeds are 1-based playoff seeds. */
export type BracketSource = { seed: number } | { winnerOf: string } | { loserOf: string };

export interface BracketSlot {
  id: string;
  round: PlayoffRound;
  label: string;
  bestOf: BestOf;
  a: BracketSource;
  b: BracketSource;
}

/** pt-BR labels for each playoff round. */
export const PLAYOFF_ROUND_LABELS: Record<PlayoffRound, string> = {
  'ub-qf': 'Quartas · Chave superior',
  'ub-sf': 'Semifinal · Chave superior',
  'ub-final': 'Final · Chave superior',
  'lb-r1': 'Rodada 1 · Chave inferior',
  'lb-r2': 'Rodada 2 · Chave inferior',
  'lb-r3': 'Rodada 3 · Chave inferior',
  'lb-final': 'Final · Chave inferior',
  gf: 'Grande final',
};

const seed = (n: number): BracketSource => ({ seed: n });
const winnerOf = (id: string): BracketSource => ({ winnerOf: id });
const loserOf = (id: string): BracketSource => ({ loserOf: id });

function slot(id: string, round: PlayoffRound, a: BracketSource, b: BracketSource): BracketSlot {
  const bestOf = round === 'lb-final' || round === 'gf' ? 5 : 3;
  return { id, round, label: PLAYOFF_ROUND_LABELS[round], bestOf, a, b };
}

/**
 * The 14-match VCT-style double-elimination bracket, in play order. Seeds 1
 * and 2 are in opposite halves; lower round 2 crosses halves so quarter-final
 * opponents don't meet again straight away.
 */
export const PLAYOFF_BRACKET: readonly BracketSlot[] = [
  slot('ub-qf-1', 'ub-qf', seed(1), seed(8)),
  slot('ub-qf-2', 'ub-qf', seed(4), seed(5)),
  slot('ub-qf-3', 'ub-qf', seed(2), seed(7)),
  slot('ub-qf-4', 'ub-qf', seed(3), seed(6)),
  slot('ub-sf-1', 'ub-sf', winnerOf('ub-qf-1'), winnerOf('ub-qf-2')),
  slot('ub-sf-2', 'ub-sf', winnerOf('ub-qf-3'), winnerOf('ub-qf-4')),
  slot('lb-r1-1', 'lb-r1', loserOf('ub-qf-1'), loserOf('ub-qf-2')),
  slot('lb-r1-2', 'lb-r1', loserOf('ub-qf-3'), loserOf('ub-qf-4')),
  slot('ub-final', 'ub-final', winnerOf('ub-sf-1'), winnerOf('ub-sf-2')),
  slot('lb-r2-1', 'lb-r2', loserOf('ub-sf-2'), winnerOf('lb-r1-1')),
  slot('lb-r2-2', 'lb-r2', loserOf('ub-sf-1'), winnerOf('lb-r1-2')),
  slot('lb-r3', 'lb-r3', winnerOf('lb-r2-1'), winnerOf('lb-r2-2')),
  slot('lb-final', 'lb-final', loserOf('ub-final'), winnerOf('lb-r3')),
  slot('gf', 'gf', winnerOf('ub-final'), winnerOf('lb-final')),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Starts a tournament. Throws unless there are exactly 16 entrants with unique ids and seeds. */
export function createTournament(entrants: Entrant[]): TournamentState {
  if (entrants.length !== TEAM_COUNT) {
    throw new Error(`A tournament needs exactly ${TEAM_COUNT} entrants, got ${entrants.length}`);
  }
  if (new Set(entrants.map((e) => e.id)).size !== TEAM_COUNT) throw new Error('Entrant ids must be unique');
  if (entrants.some((e) => !Number.isFinite(e.seed))) throw new Error('Entrant seeds must be finite numbers');
  if (new Set(entrants.map((e) => e.seed)).size !== TEAM_COUNT) throw new Error('Entrant seeds must be unique');

  const sorted = entrants.map((e) => ({ id: e.id, name: e.name, seed: e.seed })).sort((x, y) => x.seed - y.seed);
  const half = TEAM_COUNT / 2;
  const matches: TMatch[] = [];
  for (let i = 0; i < half; i++) {
    matches.push(
      swissMatch(1, i + 1, at(sorted, i).id, at(sorted, TEAM_COUNT - 1 - i).id, 0, 0),
    );
  }
  return { version: 1, entrants: sorted, phase: 'swiss', matches };
}

/** Matches ready to be played now: both sides known and no result yet, in creation order. */
export function pendingMatches(state: TournamentState): TMatch[] {
  return state.matches.filter((m) => !m.result);
}

export function allMatches(state: TournamentState): TMatch[] {
  return state.matches.slice();
}

/** Playoff matches created so far (see PLAYOFF_BRACKET for the full bracket skeleton). */
export function playoffMatches(state: TournamentState): TMatch[] {
  return state.matches.filter((m) => m.stage === 'playoffs');
}

export function findMatch(state: TournamentState, matchId: string): TMatch | undefined {
  return state.matches.find((m) => m.id === matchId);
}

/** Id of the match winner, if it has been played. */
export function matchWinner(m: TMatch): string | undefined {
  if (!m.result) return undefined;
  return m.result.winner === 0 ? m.a : m.b;
}

/** Id of the match loser, if it has been played. */
export function matchLoser(m: TMatch): string | undefined {
  if (!m.result) return undefined;
  return m.result.winner === 0 ? m.b : m.a;
}

/**
 * Records a result and returns the new state, creating the next Swiss round
 * or the playoff matches that just became ready. Throws on an unknown or
 * finished match, or a score that doesn't fit the match's best-of and winner.
 */
export function reportResult(state: TournamentState, matchId: string, result: MatchResult): TournamentState {
  const index = state.matches.findIndex((m) => m.id === matchId);
  const match = state.matches[index];
  if (!match) throw new Error(`Unknown match: ${matchId}`);
  if (match.result) throw new Error(`Match already finished: ${matchId}`);
  validateResult(match, result);

  const matches = state.matches.slice();
  matches[index] = { ...match, result: { winner: result.winner, score: [result.score[0], result.score[1]] } };
  const next: TournamentState = { ...state, matches };

  return match.stage === 'swiss' ? advanceSwiss(next) : advancePlayoffs(next);
}

/** Swiss table, best first: wins, then fewer losses, then Buchholz, then seed. */
export function swissStandings(state: TournamentState): SwissStanding[] {
  const records = swissRecords(state);
  const seedOf = seedLookup(state);
  return state.entrants
    .map((e) => {
      const r = recordOf(records, e.id);
      return { id: e.id, wins: r.wins, losses: r.losses, buchholz: buchholz(records, e.id), status: statusOf(r) };
    })
    .sort((x, y) => y.wins - x.wins || x.losses - y.losses || y.buchholz - x.buchholz || seedOf(x.id) - seedOf(y.id));
}

/** Plays every pending match with `play` until the tournament is done. */
export function runTournament(state: TournamentState, play: (m: TMatch) => MatchResult): TournamentState {
  let current = state;
  // 5 Swiss rounds + 6 playoff waves is the real bound; the guard only stops runaway loops.
  for (let guard = 0; guard < 1000; guard++) {
    const [match] = pendingMatches(current);
    if (!match) return current;
    current = reportResult(current, match.id, play(match));
  }
  throw new Error('Tournament did not finish');
}

// ---------------------------------------------------------------------------
// Swiss stage
// ---------------------------------------------------------------------------

interface SwissRecord {
  wins: number;
  losses: number;
  opponents: string[];
}

function swissRecords(state: TournamentState): Map<string, SwissRecord> {
  const records = new Map<string, SwissRecord>();
  for (const e of state.entrants) records.set(e.id, { wins: 0, losses: 0, opponents: [] });
  for (const m of state.matches) {
    if (m.stage !== 'swiss') continue;
    const ra = recordOf(records, m.a);
    const rb = recordOf(records, m.b);
    if (!m.result) continue;
    ra.opponents.push(m.b);
    rb.opponents.push(m.a);
    const [winner, loser] = m.result.winner === 0 ? [ra, rb] : [rb, ra];
    winner.wins++;
    loser.losses++;
  }
  return records;
}

function recordOf(records: Map<string, SwissRecord>, id: string): SwissRecord {
  const r = records.get(id);
  if (!r) throw new Error(`Unknown entrant: ${id}`);
  return r;
}

function buchholz(records: Map<string, SwissRecord>, id: string): number {
  return recordOf(records, id).opponents.reduce((sum, opp) => {
    const r = recordOf(records, opp);
    return sum + r.wins - r.losses;
  }, 0);
}

function statusOf(r: { wins: number; losses: number }): SwissStatus {
  if (r.wins >= SWISS_WINS) return 'advanced';
  if (r.losses >= SWISS_LOSSES) return 'eliminated';
  return 'alive';
}

function swissMatch(round: number, n: number, a: string, b: string, wins: number, losses: number): TMatch {
  const decisive = wins === SWISS_WINS - 1 || losses === SWISS_LOSSES - 1;
  return {
    id: `swiss-r${round}-m${n}`,
    stage: 'swiss',
    round: `swiss-r${round}`,
    label: `Suíça · Rodada ${round} (${wins}-${losses})`,
    a,
    b,
    bestOf: decisive ? 3 : 1,
  };
}

/** After a Swiss result: start the next round once the current one is complete, or the playoffs once 8 advanced. */
function advanceSwiss(state: TournamentState): TournamentState {
  if (state.matches.some((m) => m.stage === 'swiss' && !m.result)) return state;

  const records = swissRecords(state);
  const seedOf = seedLookup(state);
  const alive = state.entrants.filter((e) => statusOf(recordOf(records, e.id)) === 'alive');

  if (alive.length === 0) return startPlayoffs(state);

  const round = Math.max(...state.matches.filter((m) => m.stage === 'swiss').map((m) => swissRoundOf(m))) + 1;

  // Groups of equal record, best record first (more wins, then fewer losses).
  const groups = new Map<string, string[]>();
  for (const e of alive) {
    const r = recordOf(records, e.id);
    const key = `${r.wins}-${r.losses}`;
    groups.set(key, [...(groups.get(key) ?? []), e.id]);
  }
  const keys = [...groups.keys()].sort((x, y) => {
    const [xw = 0, xl = 0] = x.split('-').map(Number);
    const [yw = 0, yl = 0] = y.split('-').map(Number);
    return yw - xw || xl - yl;
  });

  const matches = state.matches.slice();
  let n = 0;
  for (const key of keys) {
    const ids = groups.get(key) ?? [];
    const ranked = ids
      .map((id) => ({ id, bh: buchholz(records, id) }))
      .sort((x, y) => y.bh - x.bh || seedOf(x.id) - seedOf(y.id))
      .map((t) => t.id);
    const { wins, losses } = recordOf(records, at(ranked, 0));
    const pairs = pairSwissGroup(ranked, (x, y) => recordOf(records, x).opponents.includes(y));
    for (const [a, b] of pairs) matches.push(swissMatch(round, ++n, a, b, wins, losses));
  }
  return { ...state, matches };
}

function swissRoundOf(m: TMatch): number {
  return Number(m.round.slice('swiss-r'.length));
}

/**
 * Pairs a Swiss group ranked best-first: the highest-ranked team plays the
 * lowest-ranked available one, and so on. Among all pairings it picks the one
 * with the fewest rematches, preferring that top-vs-bottom order on ties, so
 * a rematch only happens when no rematch-free pairing of the group exists.
 */
export function pairSwissGroup(ranked: readonly string[], played: (a: string, b: string) => boolean): [string, string][] {
  if (ranked.length % 2 !== 0) throw new Error(`Swiss group must have an even size, got ${ranked.length}`);

  const search = (pool: string[], budget: number): [string, string][] | undefined => {
    const [top, ...rest] = pool;
    if (top === undefined) return [];
    for (let i = rest.length - 1; i >= 0; i--) {
      const opp = at(rest, i);
      const cost = played(top, opp) ? 1 : 0;
      if (cost > budget) continue;
      const tail = search(
        rest.filter((_, j) => j !== i),
        budget - cost,
      );
      if (tail) return [[top, opp], ...tail];
    }
    return undefined;
  };

  for (let budget = 0; budget <= ranked.length / 2; budget++) {
    const pairs = search(ranked.slice(), budget);
    if (pairs) return pairs;
  }
  throw new Error('Unreachable: a pairing always exists');
}

// ---------------------------------------------------------------------------
// Playoffs
// ---------------------------------------------------------------------------

/** Seeds the bracket from the Swiss table (3-0, then 3-1, then 3-2; Buchholz, then seed) and creates the quarter-finals. */
function startPlayoffs(state: TournamentState): TournamentState {
  const playoffSeeds = swissStandings(state)
    .filter((s) => s.status === 'advanced')
    .map((s) => s.id);
  if (playoffSeeds.length !== PLAYOFF_TEAMS) {
    throw new Error(`Expected ${PLAYOFF_TEAMS} teams to advance, got ${playoffSeeds.length}`);
  }
  return createReadyPlayoffMatches({ ...state, phase: 'playoffs', playoffSeeds });
}

function advancePlayoffs(state: TournamentState): TournamentState {
  const gf = state.matches.find((m) => m.id === 'gf');
  const champion = gf && matchWinner(gf);
  if (champion) return { ...state, phase: 'done', champion };
  return createReadyPlayoffMatches(state);
}

function createReadyPlayoffMatches(state: TournamentState): TournamentState {
  const byId = new Map(state.matches.map((m) => [m.id, m]));
  const resolve = (src: BracketSource): string | undefined => {
    if ('seed' in src) return state.playoffSeeds?.[src.seed - 1];
    const m = byId.get('winnerOf' in src ? src.winnerOf : src.loserOf);
    if (!m) return undefined;
    return 'winnerOf' in src ? matchWinner(m) : matchLoser(m);
  };

  const added: TMatch[] = [];
  for (const slot of PLAYOFF_BRACKET) {
    if (byId.has(slot.id)) continue;
    const a = resolve(slot.a);
    const b = resolve(slot.b);
    if (a === undefined || b === undefined) continue;
    added.push({ id: slot.id, stage: 'playoffs', round: slot.round, label: slot.label, a, b, bestOf: slot.bestOf });
  }
  return added.length ? { ...state, matches: [...state.matches, ...added] } : state;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateResult(match: TMatch, result: MatchResult): void {
  const { winner, score } = result;
  if (winner !== 0 && winner !== 1) throw new Error(`Invalid winner: ${String(winner)}`);
  if (!Array.isArray(score) || score.length !== 2 || !score.every((s) => Number.isInteger(s) && s >= 0)) {
    throw new Error(`Invalid score: ${JSON.stringify(score)}`);
  }
  const needed = Math.ceil(match.bestOf / 2);
  const won = at(score, winner);
  const lost = at(score, winner === 0 ? 1 : 0);
  if (won !== needed || lost >= needed) {
    throw new Error(`Score ${score.join('-')} doesn't fit a Bo${match.bestOf} won by side ${winner}`);
  }
}

function seedLookup(state: TournamentState): (id: string) => number {
  const seeds = new Map(state.entrants.map((e) => [e.id, e.seed]));
  return (id) => seeds.get(id) ?? Number.POSITIVE_INFINITY;
}

function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`Index out of range: ${i}`);
  return v;
}
