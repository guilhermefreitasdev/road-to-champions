import type { BestOf, TeamIndex } from './types';

/**
 * Champions tournament, VCT Champions format: 16 teams drawn into 4 GSL groups of 4 (A–D, double elimination,
 * all Bo3), the top 2 of each group go to an 8-team double-elimination bracket (no bracket reset).
 *
 * Group draw (snake by seed, one team per pot in every group):
 *   pot 1 (seeds 1–4)   → A, B, C, D
 *   pot 2 (seeds 5–8)   → D, C, B, A
 *   pot 3 (seeds 9–12)  → A, B, C, D
 *   pot 4 (seeds 13–16) → D, C, B, A
 * so A = 1, 8, 9, 16 · B = 2, 7, 10, 15 · C = 3, 6, 11, 14 · D = 4, 5, 12, 13 (every group sums to 34).
 *
 * GSL group (group seeds 1–4 in that order): opening matches 1v4 and 2v3; the openers' winners play the
 * winners' match (winner = 1st, qualified) and the losers the elimination match (loser = 4th, out); the
 * winners'-match loser meets the elimination winner in the decider (winner = 2nd, qualified; loser = 3rd).
 *
 * Playoff pairing: group winners meet another group's runner-up in the upper quarter-finals, and every
 * group has one team in each half, so teams from the same group can only meet again in the upper final,
 * the lower bracket from round 2 on, or the grand final:
 *   half 1: A1 v B2, C1 v D2 · half 2: B1 v A2, D1 v C2.
 *
 * Lineup-agnostic and deterministic: it only knows entrant ids and seeds and asks the caller to play matches.
 * The state is plain JSON and never mutated, so the UI can save it and play the user's matches one at a time.
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

export type Stage = 'groups' | 'playoffs';

export const GROUP_KEYS = ['A', 'B', 'C', 'D'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export type GroupRound = 'opening' | 'winners' | 'elimination' | 'decider';

export type PlayoffRound = 'ub-qf' | 'ub-sf' | 'ub-final' | 'lb-r1' | 'lb-r2' | 'lb-r3' | 'lb-final' | 'gf';

export interface TMatch {
  id: string;
  stage: Stage;
  /** Stable machine key: a GroupRound (with `group`) or a PlayoffRound. */
  round: GroupRound | PlayoffRound;
  /** Set on group-stage matches. */
  group?: GroupKey;
  /** pt-BR label for the UI. */
  label: string;
  a: string;
  b: string;
  bestOf: BestOf;
  result?: MatchResult;
}

export type Phase = 'groups' | 'playoffs' | 'done';

export interface TournamentState {
  version: 2;
  /** Sorted by seed (best first). */
  entrants: Entrant[];
  /** Entrant ids of each group, in group-seed order (index 0 = group seed 1). */
  groups: Record<GroupKey, string[]>;
  phase: Phase;
  /** Every match created so far (groups and playoffs), in creation order = play order. */
  matches: TMatch[];
  champion?: string;
}

export type GroupStatus = 'alive' | 'qualified' | 'eliminated';
export type GroupPlace = 1 | 2 | 3 | 4;

export interface GroupStanding {
  id: string;
  group: GroupKey;
  /** 1–4 inside the group (1-based group seed). */
  groupSeed: number;
  wins: number;
  losses: number;
  /** Final place in the group, once it is decided. */
  place?: GroupPlace;
  status: GroupStatus;
}

export const TEAM_COUNT = 16;
export const GROUP_SIZE = 4;
export const GROUP_COUNT = GROUP_KEYS.length;
/** Matches of one GSL group. */
export const GROUP_MATCHES = 5;
export const PLAYOFF_TEAMS = 8;

/**
 * Where a bracket slot's team comes from: a group seed (group stage, inside the slot's group), a group
 * place (playoffs), or the winner/loser of another slot.
 */
export type BracketSource =
  | { groupSeed: number }
  | { group: GroupKey; place: 1 | 2 }
  | { winnerOf: string }
  | { loserOf: string };

export interface BracketSlot {
  id: string;
  round: PlayoffRound;
  label: string;
  bestOf: BestOf;
  a: BracketSource;
  b: BracketSource;
}

export interface GroupSlot {
  id: string;
  group: GroupKey;
  round: GroupRound;
  label: string;
  bestOf: BestOf;
  a: BracketSource;
  b: BracketSource;
}

/** pt-BR labels for each group round. */
export const GROUP_ROUND_LABELS: Record<GroupRound, string> = {
  opening: 'Abertura',
  winners: 'Vencedores',
  elimination: 'Eliminação',
  decider: 'Decisiva',
};

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

const groupSeed = (n: number): BracketSource => ({ groupSeed: n });
const groupPlace = (group: GroupKey, place: 1 | 2): BracketSource => ({ group, place });
const winnerOf = (id: string): BracketSource => ({ winnerOf: id });
const loserOf = (id: string): BracketSource => ({ loserOf: id });

/** Group (A–D) of each 1-based tournament seed position: the snake draw documented above. */
export function drawGroupIndex(position: number): number {
  const pot = Math.floor((position - 1) / GROUP_COUNT);
  const i = (position - 1) % GROUP_COUNT;
  return pot % 2 === 0 ? i : GROUP_COUNT - 1 - i;
}

/** Slot ids of a group: 'A-opening-1', 'A-opening-2', 'A-winners', 'A-elimination', 'A-decider'. */
export function groupSlotId(group: GroupKey, round: GroupRound, n?: 1 | 2): string {
  return n ? `${group}-${round}-${n}` : `${group}-${round}`;
}

function groupSlot(group: GroupKey, round: GroupRound, n: 1 | 2 | undefined, a: BracketSource, b: BracketSource): GroupSlot {
  return {
    id: groupSlotId(group, round, n),
    group,
    round,
    label: `Grupo ${group} · ${GROUP_ROUND_LABELS[round]}`,
    bestOf: 3,
    a,
    b,
  };
}

/** The 5-match GSL skeleton of one group, in play order. */
export function groupBracket(g: GroupKey): GroupSlot[] {
  const op1 = groupSlotId(g, 'opening', 1);
  const op2 = groupSlotId(g, 'opening', 2);
  return [
    groupSlot(g, 'opening', 1, groupSeed(1), groupSeed(4)),
    groupSlot(g, 'opening', 2, groupSeed(2), groupSeed(3)),
    groupSlot(g, 'winners', undefined, winnerOf(op1), winnerOf(op2)),
    groupSlot(g, 'elimination', undefined, loserOf(op1), loserOf(op2)),
    groupSlot(g, 'decider', undefined, loserOf(groupSlotId(g, 'winners')), winnerOf(groupSlotId(g, 'elimination'))),
  ];
}

/**
 * Every group slot, in schedule order: all opening matches (A, B, C, D), then the winners' and elimination
 * matches, then the deciders. Matches are created (and played) in this order as their teams become known.
 */
export const GROUP_STAGE: readonly GroupSlot[] = (() => {
  const all = GROUP_KEYS.map(groupBracket);
  const byRound = (rounds: GroupRound[]) => all.flatMap((slots) => slots.filter((s) => rounds.includes(s.round)));
  return [...byRound(['opening']), ...byRound(['winners', 'elimination']), ...byRound(['decider'])];
})();

function slot(id: string, round: PlayoffRound, a: BracketSource, b: BracketSource): BracketSlot {
  const bestOf = round === 'lb-final' || round === 'gf' ? 5 : 3;
  return { id, round, label: PLAYOFF_ROUND_LABELS[round], bestOf, a, b };
}

/**
 * The 14-match VCT-style double-elimination bracket, in play order. Each half holds one team of every group
 * (see the pairing above); lower round 2 crosses halves so quarter-final opponents don't meet again straight away.
 */
export const PLAYOFF_BRACKET: readonly BracketSlot[] = [
  slot('ub-qf-1', 'ub-qf', groupPlace('A', 1), groupPlace('B', 2)),
  slot('ub-qf-2', 'ub-qf', groupPlace('C', 1), groupPlace('D', 2)),
  slot('ub-qf-3', 'ub-qf', groupPlace('B', 1), groupPlace('A', 2)),
  slot('ub-qf-4', 'ub-qf', groupPlace('D', 1), groupPlace('C', 2)),
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
  const groups = { A: [], B: [], C: [], D: [] } as Record<GroupKey, string[]>;
  sorted.forEach((e, i) => groups[at(GROUP_KEYS, drawGroupIndex(i + 1))].push(e.id));
  return createReadyMatches({ version: 2, entrants: sorted, groups, phase: 'groups', matches: [] });
}

/** Matches ready to be played now: both sides known and no result yet, in creation order. */
export function pendingMatches(state: TournamentState): TMatch[] {
  return state.matches.filter((m) => !m.result);
}

export function allMatches(state: TournamentState): TMatch[] {
  return state.matches.slice();
}

/** Group-stage matches created so far (see GROUP_STAGE for the full skeleton). */
export function groupMatches(state: TournamentState, group?: GroupKey): TMatch[] {
  return state.matches.filter((m) => m.stage === 'groups' && (!group || m.group === group));
}

/** Playoff matches created so far (see PLAYOFF_BRACKET for the full bracket skeleton). */
export function playoffMatches(state: TournamentState): TMatch[] {
  return state.matches.filter((m) => m.stage === 'playoffs');
}

export function findMatch(state: TournamentState, matchId: string): TMatch | undefined {
  return state.matches.find((m) => m.id === matchId);
}

/** Group of an entrant. */
export function groupOf(state: TournamentState, id: string): GroupKey | undefined {
  return GROUP_KEYS.find((g) => state.groups[g].includes(id));
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
 * Records a result and returns the new state, creating the group or playoff matches that just became ready.
 * Throws on an unknown or finished match, or a score that doesn't fit the match's best-of and winner.
 */
export function reportResult(state: TournamentState, matchId: string, result: MatchResult): TournamentState {
  const index = state.matches.findIndex((m) => m.id === matchId);
  const match = state.matches[index];
  if (!match) throw new Error(`Unknown match: ${matchId}`);
  if (match.result) throw new Error(`Match already finished: ${matchId}`);
  validateResult(match, result);

  const matches = state.matches.slice();
  matches[index] = { ...match, result: { winner: result.winner, score: [result.score[0], result.score[1]] } };
  let next: TournamentState = { ...state, matches };

  const gf = matches.find((m) => m.id === 'gf');
  const champion = gf && matchWinner(gf);
  if (champion) return { ...next, phase: 'done', champion };

  next = createReadyMatches(next);
  if (next.phase === 'groups' && next.matches.some((m) => m.stage === 'playoffs')) next = { ...next, phase: 'playoffs' };
  return next;
}

/** Final place (1–4) of every team whose place in its group is decided. */
function groupPlaces(state: TournamentState): Map<string, GroupPlace> {
  const byId = new Map(state.matches.map((m) => [m.id, m]));
  const places = new Map<string, GroupPlace>();
  for (const g of GROUP_KEYS) {
    const set = (matchId: string, pick: typeof matchWinner, place: GroupPlace) => {
      const m = byId.get(matchId);
      const id = m && pick(m);
      if (id) places.set(id, place);
    };
    set(groupSlotId(g, 'winners'), matchWinner, 1);
    set(groupSlotId(g, 'decider'), matchWinner, 2);
    set(groupSlotId(g, 'decider'), matchLoser, 3);
    set(groupSlotId(g, 'elimination'), matchLoser, 4);
  }
  return places;
}

/**
 * Group tables: groups A–D in order, each best first: decided places, then teams still alive by record
 * (more wins, then fewer losses), then group seed.
 */
export function groupStandings(state: TournamentState): GroupStanding[] {
  const places = groupPlaces(state);
  const record = new Map(state.entrants.map((e) => [e.id, { wins: 0, losses: 0 }]));
  for (const m of groupMatches(state)) {
    const w = matchWinner(m);
    const l = matchLoser(m);
    if (w) record.get(w)!.wins++;
    if (l) record.get(l)!.losses++;
  }
  return GROUP_KEYS.flatMap((group) =>
    state.groups[group]
      .map((id, i): GroupStanding => {
        const r = record.get(id) ?? { wins: 0, losses: 0 };
        const place = places.get(id);
        const status: GroupStatus = place === undefined ? 'alive' : place <= 2 ? 'qualified' : 'eliminated';
        const row: GroupStanding = { id, group, groupSeed: i + 1, wins: r.wins, losses: r.losses, status };
        if (place !== undefined) row.place = place;
        return row;
      })
      .sort(
        (x, y) =>
          (x.place ?? 2.5) - (y.place ?? 2.5) || y.wins - x.wins || x.losses - y.losses || x.groupSeed - y.groupSeed,
      ),
  );
}

/** Resolves a bracket source to an entrant id, once it is known. `group` is the slot's group (group stage). */
export function resolveSource(state: TournamentState, src: BracketSource, group?: GroupKey): string | undefined {
  if ('groupSeed' in src) return group ? state.groups[group][src.groupSeed - 1] : undefined;
  if ('place' in src) {
    for (const [id, place] of groupPlaces(state)) {
      if (place === src.place && state.groups[src.group].includes(id)) return id;
    }
    return undefined;
  }
  const m = findMatch(state, 'winnerOf' in src ? src.winnerOf : src.loserOf);
  if (!m) return undefined;
  return 'winnerOf' in src ? matchWinner(m) : matchLoser(m);
}

/** Plays every pending match with `play` until the tournament is done. */
export function runTournament(state: TournamentState, play: (m: TMatch) => MatchResult): TournamentState {
  let current = state;
  // 34 matches is the real bound; the guard only stops runaway loops.
  for (let guard = 0; guard < 1000; guard++) {
    const [match] = pendingMatches(current);
    if (!match) return current;
    current = reportResult(current, match.id, play(match));
  }
  throw new Error('Tournament did not finish');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Creates every group or playoff match whose two teams just became known, in skeleton order. The playoffs
 * only start once all 20 group matches are played (as at the real event).
 */
function createReadyMatches(state: TournamentState): TournamentState {
  const existing = new Set(state.matches.map((m) => m.id));
  const added: TMatch[] = [];
  for (const s of GROUP_STAGE) {
    if (existing.has(s.id)) continue;
    const a = resolveSource(state, s.a, s.group);
    const b = resolveSource(state, s.b, s.group);
    if (a === undefined || b === undefined) continue;
    added.push({ id: s.id, stage: 'groups', round: s.round, group: s.group, label: s.label, a, b, bestOf: s.bestOf });
  }
  const groupsDone =
    added.length === 0 && state.matches.filter((m) => m.stage === 'groups' && m.result).length === GROUP_STAGE.length;
  for (const s of groupsDone ? PLAYOFF_BRACKET : []) {
    if (existing.has(s.id)) continue;
    const a = resolveSource(state, s.a);
    const b = resolveSource(state, s.b);
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
