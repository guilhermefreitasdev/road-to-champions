import type { BestOf, TeamIndex } from './types';
import type { Entrant, MatchResult } from './tournament';

/**
 * Regional league ("Liga Americas/EMEA/Pacific/China"), the first stage of the Complete Trials mode: 12 teams
 * in 2 groups of 6, single round-robin, every match Bo3; the top 3 of each group go to a 6-team playoff where
 * the group winners skip the quarter-finals. The top 3 of the playoffs qualify for the Masters.
 *
 * Group draw (snake by seed, two per pot): pot 1 (seeds 1–2) → A, B · pot 2 (3–4) → B, A · pot 3 (5–6) → A, B ·
 * pot 4 (7–8) → B, A · pot 5 (9–10) → A, B · pot 6 (11–12) → B, A, so A = 1, 4, 5, 8, 9, 12 and B = 2, 3, 6, 7,
 * 10, 11 (both sum to 39).
 *
 * Standings: match wins, then map difference, then round difference, then group seed. Places are decided when
 * the group's 15 matches are played.
 *
 * Playoffs (single elimination, in play order):
 *   qf-1: A2 v B3 · qf-2: B2 v A3 (Bo3)
 *   sf-1: A1 v winner qf-2 · sf-2: B1 v winner qf-1 (Bo3)
 *   third: loser sf-1 v loser sf-2 (Bo3, decides the last Masters slot)
 *   final: winner sf-1 v winner sf-2 (Bo5)
 * Places: 1º–4º from the final and the third-place match, 5º–6º the quarter-final losers, 7º–8º the group 4ths,
 * 9º–10º the 5ths, 11º–12º the 6ths.
 *
 * Lineup-agnostic and deterministic: it only knows entrant ids and seeds and asks the caller to play matches.
 * The state is plain JSON and never mutated.
 */

export const LEAGUE_TEAMS = 12;
export const LEAGUE_GROUP_SIZE = 6;
/** Matches of one group (single round-robin of 6). */
export const LEAGUE_GROUP_MATCHES = 15;
export const LEAGUE_ROUNDS = 5;
export const LEAGUE_PLAYOFF_TEAMS = 6;
/** How many teams of the league qualify for the Masters. */
export const MASTERS_SLOTS = 3;

export const LEAGUE_GROUPS = ['A', 'B'] as const;
export type LeagueGroup = (typeof LEAGUE_GROUPS)[number];

export type LeagueStage = 'groups' | 'playoffs';
export type LeaguePhase = 'groups' | 'playoffs' | 'done';
export type LeaguePlayoffRound = 'qf' | 'sf' | 'third' | 'final';

/** A league result also carries the rounds won by each side (third tiebreaker). */
export interface LeagueResult extends MatchResult {
  rounds: [number, number];
}

export interface LMatch {
  id: string;
  stage: LeagueStage;
  /** Group stage: the round-robin round (1–5); playoffs: the playoff round. */
  round: number | LeaguePlayoffRound;
  group?: LeagueGroup;
  /** pt-BR label for the UI. */
  label: string;
  a: string;
  b: string;
  bestOf: BestOf;
  result?: LeagueResult;
}

export interface LeagueState {
  version: 1;
  /** Sorted by seed (best first). */
  entrants: Entrant[];
  /** Entrant ids of each group, in group-seed order. */
  groups: Record<LeagueGroup, string[]>;
  phase: LeaguePhase;
  /** Every match created so far, in creation order = play order. */
  matches: LMatch[];
  champion?: string;
}

export type LeagueStatus = 'alive' | 'qualified' | 'eliminated';

export interface LeagueStanding {
  id: string;
  group: LeagueGroup;
  /** 1–6 inside the group. */
  groupSeed: number;
  wins: number;
  losses: number;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
  /** Final place in the group (1–6), once every group match is played. */
  place?: number;
  status: LeagueStatus;
}

export type LeagueSource = { group: LeagueGroup; place: 1 | 2 | 3 } | { winnerOf: string } | { loserOf: string };

export interface LeagueSlot {
  id: string;
  round: LeaguePlayoffRound;
  label: string;
  bestOf: BestOf;
  a: LeagueSource;
  b: LeagueSource;
}

export const LEAGUE_ROUND_LABELS: Record<LeaguePlayoffRound, string> = {
  qf: 'Quartas de final',
  sf: 'Semifinal',
  third: 'Decisão de 3º lugar',
  final: 'Grande final',
};

const place = (group: LeagueGroup, p: 1 | 2 | 3): LeagueSource => ({ group, place: p });
const winnerOf = (id: string): LeagueSource => ({ winnerOf: id });
const loserOf = (id: string): LeagueSource => ({ loserOf: id });

/** The 6-match playoff skeleton, in play order. */
export const LEAGUE_PLAYOFFS: readonly LeagueSlot[] = [
  { id: 'qf-1', round: 'qf', label: `${LEAGUE_ROUND_LABELS.qf} 1`, bestOf: 3, a: place('A', 2), b: place('B', 3) },
  { id: 'qf-2', round: 'qf', label: `${LEAGUE_ROUND_LABELS.qf} 2`, bestOf: 3, a: place('B', 2), b: place('A', 3) },
  { id: 'sf-1', round: 'sf', label: `${LEAGUE_ROUND_LABELS.sf} 1`, bestOf: 3, a: place('A', 1), b: winnerOf('qf-2') },
  { id: 'sf-2', round: 'sf', label: `${LEAGUE_ROUND_LABELS.sf} 2`, bestOf: 3, a: place('B', 1), b: winnerOf('qf-1') },
  { id: 'third', round: 'third', label: LEAGUE_ROUND_LABELS.third, bestOf: 3, a: loserOf('sf-1'), b: loserOf('sf-2') },
  { id: 'final', round: 'final', label: LEAGUE_ROUND_LABELS.final, bestOf: 5, a: winnerOf('sf-1'), b: winnerOf('sf-2') },
];

/** Group index (0 = A, 1 = B) of each 1-based league seed position: the snake draw documented above. */
export function drawLeagueGroupIndex(position: number): number {
  const pot = Math.floor((position - 1) / 2);
  const i = (position - 1) % 2;
  return pot % 2 === 0 ? i : 1 - i;
}

/**
 * Round-robin rounds of a 6-team group (circle method): 5 rounds of 3 pairs of group-seed indexes (0-based).
 * Every pair of teams meets exactly once.
 */
export function roundRobinRounds(size = LEAGUE_GROUP_SIZE): [number, number][][] {
  let order = Array.from({ length: size }, (_, i) => i);
  const rounds: [number, number][][] = [];
  for (let r = 0; r < size - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < size / 2; i++) pairs.push([at(order, i), at(order, size - 1 - i)]);
    rounds.push(pairs);
    order = [at(order, 0), at(order, size - 1), ...order.slice(1, size - 1)];
  }
  return rounds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Starts a league. Throws unless there are exactly 12 entrants with unique ids and seeds. */
export function createLeague(entrants: Entrant[]): LeagueState {
  if (entrants.length !== LEAGUE_TEAMS) {
    throw new Error(`A league needs exactly ${LEAGUE_TEAMS} entrants, got ${entrants.length}`);
  }
  if (new Set(entrants.map((e) => e.id)).size !== LEAGUE_TEAMS) throw new Error('Entrant ids must be unique');
  if (entrants.some((e) => !Number.isFinite(e.seed))) throw new Error('Entrant seeds must be finite numbers');
  if (new Set(entrants.map((e) => e.seed)).size !== LEAGUE_TEAMS) throw new Error('Entrant seeds must be unique');

  const sorted = entrants.map((e) => ({ id: e.id, name: e.name, seed: e.seed })).sort((x, y) => x.seed - y.seed);
  const groups: Record<LeagueGroup, string[]> = { A: [], B: [] };
  sorted.forEach((e, i) => groups[at(LEAGUE_GROUPS, drawLeagueGroupIndex(i + 1))].push(e.id));

  // Every group match is known from the start: round 1 of A and B, then round 2, and so on.
  const matches: LMatch[] = [];
  roundRobinRounds().forEach((pairs, r) => {
    for (const g of LEAGUE_GROUPS) {
      pairs.forEach(([x, y], n) => {
        matches.push({
          id: `${g}-r${r + 1}-${n + 1}`,
          stage: 'groups',
          round: r + 1,
          group: g,
          label: `Grupo ${g} · Rodada ${r + 1}`,
          a: at(groups[g], x),
          b: at(groups[g], y),
          bestOf: 3,
        });
      });
    }
  });
  return { version: 1, entrants: sorted, groups, phase: 'groups', matches };
}

/** Matches ready to be played now: both sides known and no result yet, in creation order. */
export function leaguePending(state: LeagueState): LMatch[] {
  return state.matches.filter((m) => !m.result);
}

export function leagueGroupMatches(state: LeagueState, group?: LeagueGroup): LMatch[] {
  return state.matches.filter((m) => m.stage === 'groups' && (!group || m.group === group));
}

export function leaguePlayoffMatches(state: LeagueState): LMatch[] {
  return state.matches.filter((m) => m.stage === 'playoffs');
}

export function findLeagueMatch(state: LeagueState, matchId: string): LMatch | undefined {
  return state.matches.find((m) => m.id === matchId);
}

export function leagueGroupOf(state: LeagueState, id: string): LeagueGroup | undefined {
  return LEAGUE_GROUPS.find((g) => state.groups[g].includes(id));
}

export function lmatchWinner(m: LMatch): string | undefined {
  if (!m.result) return undefined;
  return m.result.winner === 0 ? m.a : m.b;
}

export function lmatchLoser(m: LMatch): string | undefined {
  if (!m.result) return undefined;
  return m.result.winner === 0 ? m.b : m.a;
}

/**
 * Records a result and returns the new state, creating the playoff matches that just became ready. Throws on an
 * unknown or finished match, or a result that doesn't fit the match's best-of and winner.
 */
export function reportLeagueResult(state: LeagueState, matchId: string, result: LeagueResult): LeagueState {
  const index = state.matches.findIndex((m) => m.id === matchId);
  const match = state.matches[index];
  if (!match) throw new Error(`Unknown match: ${matchId}`);
  if (match.result) throw new Error(`Match already finished: ${matchId}`);
  validateResult(match, result);

  const matches = state.matches.slice();
  matches[index] = {
    ...match,
    result: { winner: result.winner, score: [result.score[0], result.score[1]], rounds: [result.rounds[0], result.rounds[1]] },
  };
  let next: LeagueState = { ...state, matches };

  const final = matches.find((m) => m.id === 'final');
  const third = matches.find((m) => m.id === 'third');
  const champion = final && lmatchWinner(final);
  if (champion && third?.result) return { ...next, phase: 'done', champion };

  next = createReadyMatches(next);
  if (next.phase === 'groups' && next.matches.some((m) => m.stage === 'playoffs')) next = { ...next, phase: 'playoffs' };
  return next;
}

/**
 * Group tables (A then B, each best first): wins, then map difference, then round difference, then group seed.
 * Places (1–6) are set once the group's 15 matches are played; the top 3 are `qualified`, the rest `eliminated`.
 */
export function leagueStandings(state: LeagueState): LeagueStanding[] {
  const rows = new Map<string, LeagueStanding>();
  LEAGUE_GROUPS.forEach((group) =>
    state.groups[group].forEach((id, i) =>
      rows.set(id, {
        id, group, groupSeed: i + 1, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, roundsWon: 0, roundsLost: 0, status: 'alive',
      }),
    ),
  );
  const played: Record<LeagueGroup, number> = { A: 0, B: 0 };
  for (const m of leagueGroupMatches(state)) {
    if (!m.result || !m.group) continue;
    played[m.group]++;
    const a = rows.get(m.a);
    const b = rows.get(m.b);
    if (!a || !b) continue;
    const { score, rounds, winner } = m.result;
    a.mapsWon += score[0];
    a.mapsLost += score[1];
    b.mapsWon += score[1];
    b.mapsLost += score[0];
    a.roundsWon += rounds[0];
    a.roundsLost += rounds[1];
    b.roundsWon += rounds[1];
    b.roundsLost += rounds[0];
    (winner === 0 ? a : b).wins++;
    (winner === 0 ? b : a).losses++;
  }
  return LEAGUE_GROUPS.flatMap((group) => {
    const table = state.groups[group]
      .map((id) => rows.get(id)!)
      .sort(
        (x, y) =>
          y.wins - x.wins ||
          y.mapsWon - y.mapsLost - (x.mapsWon - x.mapsLost) ||
          y.roundsWon - y.roundsLost - (x.roundsWon - x.roundsLost) ||
          x.groupSeed - y.groupSeed,
      );
    if (played[group] === LEAGUE_GROUP_MATCHES) {
      table.forEach((row, i) => {
        row.place = i + 1;
        row.status = i < MASTERS_SLOTS ? 'qualified' : 'eliminated';
      });
    }
    return table;
  });
}

/** Resolves a playoff source to an entrant id, once it is known. */
export function resolveLeagueSource(state: LeagueState, src: LeagueSource): string | undefined {
  if ('place' in src) {
    return leagueStandings(state).find((r) => r.group === src.group && r.place === src.place)?.id;
  }
  const m = findLeagueMatch(state, 'winnerOf' in src ? src.winnerOf : src.loserOf);
  if (!m) return undefined;
  return 'winnerOf' in src ? lmatchWinner(m) : lmatchLoser(m);
}

export interface LeaguePlace {
  /** Best rank of the range (1 for the champion, 5 for "5º–6º"). */
  rank: number;
  /** "1º", "5º–6º"… */
  label: string;
  /** Where the team's league ended. */
  stage: 'groups' | 'playoffs' | 'top4' | 'final' | 'champion';
}

/** Final league place of a team, once decided. */
export function leaguePlaceOf(state: LeagueState, id: string): LeaguePlace | undefined {
  const by = (matchId: string, pick: typeof lmatchWinner) => {
    const m = findLeagueMatch(state, matchId);
    return !!m && pick(m) === id;
  };
  if (by('final', lmatchWinner)) return { rank: 1, label: '1º', stage: 'champion' };
  if (by('final', lmatchLoser)) return { rank: 2, label: '2º', stage: 'final' };
  if (by('third', lmatchWinner)) return { rank: 3, label: '3º', stage: 'top4' };
  if (by('third', lmatchLoser)) return { rank: 4, label: '4º', stage: 'top4' };
  if (by('qf-1', lmatchLoser) || by('qf-2', lmatchLoser)) return { rank: 5, label: '5º–6º', stage: 'playoffs' };
  const row = leagueStandings(state).find((r) => r.id === id);
  if (!row?.place || row.place <= MASTERS_SLOTS) return undefined;
  const rank = 7 + (row.place - 4) * 2;
  return { rank, label: `${rank}º–${rank + 1}º`, stage: 'groups' };
}

/** Ids of the teams qualified for the Masters (1st, 2nd, 3rd), as far as they are decided. */
export function mastersQualified(state: LeagueState): string[] {
  const final = findLeagueMatch(state, 'final');
  const third = findLeagueMatch(state, 'third');
  const out: string[] = [];
  for (const id of [final && lmatchWinner(final), final && lmatchLoser(final), third && lmatchWinner(third)]) {
    if (id) out.push(id);
  }
  return out;
}

/** Plays every pending match with `play` until the league is done. */
export function runLeague(state: LeagueState, play: (m: LMatch) => LeagueResult): LeagueState {
  let current = state;
  for (let guard = 0; guard < 1000; guard++) {
    const [match] = leaguePending(current);
    if (!match) return current;
    current = reportLeagueResult(current, match.id, play(match));
  }
  throw new Error('League did not finish');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Creates every playoff match whose two teams just became known; the playoffs only start when both groups are done. */
function createReadyMatches(state: LeagueState): LeagueState {
  const groupsDone = state.matches.filter((m) => m.stage === 'groups' && m.result).length === 2 * LEAGUE_GROUP_MATCHES;
  if (!groupsDone) return state;
  const existing = new Set(state.matches.map((m) => m.id));
  const added: LMatch[] = [];
  for (const s of LEAGUE_PLAYOFFS) {
    if (existing.has(s.id)) continue;
    const a = resolveLeagueSource(state, s.a);
    const b = resolveLeagueSource(state, s.b);
    if (a === undefined || b === undefined) continue;
    added.push({ id: s.id, stage: 'playoffs', round: s.round, label: s.label, a, b, bestOf: s.bestOf });
  }
  return added.length ? { ...state, matches: [...state.matches, ...added] } : state;
}

function validateResult(match: LMatch, result: LeagueResult): void {
  const { winner, score, rounds } = result;
  if (winner !== 0 && winner !== 1) throw new Error(`Invalid winner: ${String(winner)}`);
  const okPair = (p: unknown): p is [number, number] =>
    Array.isArray(p) && p.length === 2 && p.every((s) => Number.isInteger(s) && s >= 0);
  if (!okPair(score)) throw new Error(`Invalid score: ${JSON.stringify(score)}`);
  if (!okPair(rounds)) throw new Error(`Invalid rounds: ${JSON.stringify(rounds)}`);
  const needed = Math.ceil(match.bestOf / 2);
  const won = at(score, winner);
  const lost = at(score, winner === 0 ? 1 : 0);
  if (won !== needed || lost >= needed) {
    throw new Error(`Score ${score.join('-')} doesn't fit a Bo${match.bestOf} won by side ${winner}`);
  }
}

function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`Index out of range: ${i}`);
  return v;
}

export type { TeamIndex };
