/**
 * Game glue: one run = draft → coach → team name → 16-team Champions.
 * RunState is plain JSON and never mutated; every action returns a new state, so the UI can save it after
 * each step. Everything is deterministic from the seed plus the user's choices (no Math.random here).
 *
 * Match scheduling: matches are played in creation order. AI-vs-AI matches are simulated automatically until
 * the next match in the schedule is the user's, which waits for the user's veto. Once the user is eliminated
 * the rest of the tournament plays out on its own, so the champion is always known at the end.
 */
import { AGENTS } from '../data/game';
import { REAL_MAP_POOL, REAL_META, REAL_ROSTERS, realLineup } from '../data/real';
import type { AgentRoles } from '../engine/agents';
import { familiarityOf, recordMapsPlayed, type MapsPlayed } from '../engine/familiarity';
import { applyTournamentForm, prodigyGrowth } from '../engine/form';
import {
  availableCards,
  createDraft,
  draftLineup,
  pickCoach,
  pickPlayer,
  reroll,
  roll,
  type DraftMode,
  type DraftState,
} from '../engine/draft';
import { createRng } from '../engine/rng';
import { formatDecimal } from './explain';
import { MODE_LABELS } from './labels';
import { findCoach, pickOpponents, rosterKey } from '../engine/roster';
import { simulateSeries, type SeriesOptions, type SeriesResult } from '../engine/series';
import { teamStrength } from '../engine/team';
import {
  GROUP_KEYS,
  PLAYOFF_BRACKET,
  TEAM_COUNT,
  createTournament,
  groupBracket,
  groupOf,
  groupStandings,
  pendingMatches,
  reportResult,
  type BracketSlot,
  type GroupKey,
  type GroupPlace,
  type GroupSlot,
  type GroupStanding,
  type GroupStatus,
  type TMatch,
  type TournamentState,
} from '../engine/tournament';
import type { Card, Coach, Lineup, MapName, RosterEntry, Slot, TeamIndex } from '../engine/types';
import { aiChooseMap, applyVeto, createVeto, isVetoComplete, nextTurn, type VetoState } from '../engine/veto';
import { compactSeries, type CompactSeries } from './boxscore';
import { DEFAULT_DIFFICULTY, DIFFICULTY_SETTINGS, aiAdjust, difficultySettings, isDifficulty, scoutingLevel, type Difficulty } from './difficulty';

export type { DraftMode } from '../engine/draft';
export type { Difficulty } from './difficulty';

/** The roster pool used for the draft and the opponents: real rosters (VLR.gg + Liquipedia), see src/data/real. */
export const RUN_POOL: readonly RosterEntry[] = REAL_ROSTERS;
/** Veto pool of every match: the map pool of the most recent event with exactly 7 maps. */
export const RUN_MAP_POOL: readonly MapName[] = REAL_MAP_POOL;
/** Agent meta the comps are scored against (the veto pool's year), see src/data/real/meta.ts. */
export const RUN_META = REAL_META;
/** Agent → role (valorant-api.com snapshot), for the per-map agent picks (src/engine/agents.ts). */
export const AGENT_ROLES: AgentRoles = Object.fromEntries(AGENTS.map((a) => [a.name, a.role]));
/**
 * Save format version: bumped when saved runs stop making sense (v7 = difficulty and the box scores of every
 * series, `boxScores`; v6 = agents per map in the map results, agent
 * and familiarity edges, `mapsPlayed` in the state; v5 = Modelo v3: per-player form, multikills
 * and MVP in every map result, `presence` instead of `consistency`, aura on the cards; v4 = strength v2: five
 * dimensions and the `decision` attribute, stored in every map result; v3 = GSL groups instead of the Swiss
 * stage; v2 = real pool; v1 saves used fictional cards).
 */
export const RUN_VERSION = 7;

/** Entrant id of the user's team. Opponents use their roster key (`${teamId}-${eventId}`). */
export const USER_ID = 'user';
export const DEFAULT_TEAM_NAME = 'Meu Time';
export const TEAM_NAME_MAX = 24;
export const OPPONENT_COUNT = 15;

export type RunPhase = 'draft' | 'team' | 'tournament' | 'done';

export interface UserVeto {
  matchId: string;
  state: VetoState;
}

export interface RunState {
  version: typeof RUN_VERSION;
  seed: string;
  mode: DraftMode;
  /** 'draft' covers the picks and the coach; 'team' is naming the team before the Champions. */
  phase: RunPhase;
  draft: DraftState;
  teamName?: string;
  /** Roster keys of the AI opponents (also their entrant ids). */
  opponents?: string[];
  tournament?: TournamentState;
  /** Veto in progress for the user's next match. */
  veto?: UserVeto;
  /** Full series of every match the user played, by match id (AI matches keep only the MatchResult). */
  userSeries: Record<string, SeriesResult>;
  /** Maps every entrant played so far in this Champions (map familiarity, src/engine/familiarity.ts). */
  mapsPlayed: MapsPlayed;
  /** Difficulty of the run (src/game/difficulty.ts). */
  difficulty: Difficulty;
  /** Compact box score of every series played (AI vs AI included), by match id (src/game/boxscore.ts). */
  boxScores: Record<string, CompactSeries>;
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export function createRun(mode: DraftMode, seed: string, difficulty: Difficulty = DEFAULT_DIFFICULTY): RunState {
  if (!isDifficulty(difficulty)) throw new Error(`Unknown difficulty "${String(difficulty)}"`);
  const draft = createDraft(RUN_POOL, mode, seed, DIFFICULTY_SETTINGS[difficulty].rerolls);
  return { version: RUN_VERSION, seed, mode, phase: 'draft', draft, userSeries: {}, mapsPlayed: {}, difficulty, boxScores: {} };
}

export function rollDraft(run: RunState): RunState {
  assertPhase(run, 'draft');
  return { ...run, draft: roll(run.draft, RUN_POOL) };
}

export function rerollDraft(run: RunState): RunState {
  assertPhase(run, 'draft');
  return { ...run, draft: reroll(run.draft, RUN_POOL) };
}

export function pickDraftPlayer(run: RunState, cardId: string, slot: Slot): RunState {
  assertPhase(run, 'draft');
  return { ...run, draft: pickPlayer(run.draft, RUN_POOL, cardId, slot) };
}

/** Choosing the coach ends the draft (phase 'draft' → 'team'). */
export function pickDraftCoach(run: RunState, coachId: string): RunState {
  assertPhase(run, 'draft');
  return { ...run, phase: 'team', draft: pickCoach(run.draft, RUN_POOL, coachId) };
}

/** Cards the user can pick right now. */
export function draftOptions(run: RunState): Card[] {
  return availableCards(run.draft, RUN_POOL);
}

/** The roster rolled by the classic roulette, if any. */
export function rolledRoster(run: RunState): RosterEntry | undefined {
  const cur = run.draft.current;
  return cur && RUN_POOL.find((e) => e.teamId === cur.teamId && e.eventId === cur.eventId);
}

export function coachOptions(run: RunState): Coach[] {
  return (run.draft.coachOptions ?? []).map((id) => findCoach(RUN_POOL, id)).filter((c): c is Coach => !!c);
}

/** Roster (team + event) a card or coach belongs to. */
export function rosterOf(teamId: string, eventId: string): RosterEntry | undefined {
  return RUN_POOL.find((e) => e.teamId === teamId && e.eventId === eventId);
}

/** The drafted lineup so far (also works before the coach is picked, once 5 players are in). */
export function draftedLineup(run: RunState): Lineup {
  return draftLineup(run.draft, RUN_POOL, run.teamName ?? DEFAULT_TEAM_NAME);
}

// ---------------------------------------------------------------------------
// Tournament
// ---------------------------------------------------------------------------

export function cleanTeamName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim().slice(0, TEAM_NAME_MAX);
  return trimmed || DEFAULT_TEAM_NAME;
}

/** Builds the 16-team field (seeded by team strength) and plays the schedule up to the user's first match. */
export function startTournament(run: RunState, teamName: string): RunState {
  assertPhase(run, 'team');
  const name = cleanTeamName(teamName);
  const user = draftLineup(run.draft, RUN_POOL, name);
  const userPlayers = user.players.map((p) => p.card.playerId);
  const opponents = pickField(run.seed, userPlayers, run.difficulty);

  // Seeds by the strength of the lineups as they enter this Champions (tournament form included; the AI with the
  // difficulty's bonus, as it plays the user).
  const named: RunState = { ...run, teamName: name, opponents };
  const bonus = difficultySettings(run.difficulty).aiBonus;
  const field = [
    { id: USER_ID, name, strength: teamStrength(lineupOf(named, USER_ID)).total },
    ...opponents.map((id) => ({ id, name: rosterByKey(id).teamName, strength: teamStrength(lineupOf(named, id)).total + bonus })),
  ].sort((x, y) => y.strength - x.strength || (x.id < y.id ? -1 : 1));

  const tournament = createTournament(field.map((t, i) => ({ id: t.id, name: t.name, seed: i + 1 })));
  return advance({ ...run, phase: 'tournament', teamName: name, opponents, tournament });
}

/**
 * Field composition (balance lever): a real Champions has a few favourites, never none and never many. Every field
 * has between FIELD_ELITE_MIN and FIELD_ELITE_CAP "elite" rosters, i.e. in the top FIELD_ELITE_SHARE of the pool by
 * AI strength. Teams are drawn in the seeded order of pickOpponents (one roster per team, avoiding the user's
 * players); an elite roster past the cap is skipped and the next team takes its place, and when the draw falls
 * short of the floor the next elite rosters in that order replace the last non-elite ones.
 */
export const FIELD_ELITE_SHARE = 0.2;
/**
 * Elite cap and floor of the Normal difficulty; every level has its own (DIFFICULTY_SETTINGS, src/game/difficulty.ts).
 * History: cap 3 since strength v2 (was 2), floor 3 since the real flex data (2026-10-20); the difficulty ladder
 * (2026-10-20) made Normal harder (docs/design.md, "Dificuldade").
 */
export const FIELD_ELITE_CAP = DIFFICULTY_SETTINGS.normal.eliteCap;
export const FIELD_ELITE_MIN = DIFFICULTY_SETTINGS.normal.eliteMin;

const aiStrength = (entry: RosterEntry): number => teamStrength(realLineup(entry)).total;
const ELITE_FLOOR = (() => {
  const all = RUN_POOL.map(aiStrength).sort((a, b) => b - a);
  return all[Math.floor(all.length * FIELD_ELITE_SHARE)]!;
})();
const TEAM_TOTAL = new Set(RUN_POOL.map((e) => e.teamId)).size;

/** Roster keys of the 15 opponents for a run (deterministic from the seed), with the difficulty's elite floor and cap. */
export function pickField(seed: string, exclude: readonly string[], difficulty: Difficulty = DEFAULT_DIFFICULTY): string[] {
  const { eliteMin: FIELD_ELITE_MIN, eliteCap: FIELD_ELITE_CAP } = DIFFICULTY_SETTINGS[difficulty];
  const order = pickOpponents(RUN_POOL, TEAM_TOTAL, seed, exclude);
  const isElite = order.map((e) => aiStrength(e) >= ELITE_FLOOR);
  const chosen = new Set<number>();
  let elite = 0;
  for (let i = 0; i < order.length && chosen.size < OPPONENT_COUNT; i++) {
    if (isElite[i]) {
      if (elite >= FIELD_ELITE_CAP) continue;
      elite++;
    }
    chosen.add(i);
  }
  // Floor: the next elite rosters in the draw order replace the last non-elite ones.
  for (let i = 0; i < order.length && elite < FIELD_ELITE_MIN; i++) {
    if (!isElite[i] || chosen.has(i)) continue;
    const last = [...chosen].filter((j) => !isElite[j]).pop();
    if (last === undefined) break;
    chosen.delete(last);
    chosen.add(i);
    elite++;
  }
  const out = [...chosen].sort((x, y) => x - y).map((i) => rosterKey(order[i]!));
  if (out.length < OPPONENT_COUNT) throw new Error(`Field has ${out.length} opponents, needs ${OPPONENT_COUNT}`);
  return out;
}

/** True when a roster counts as elite for the field cap. */
export function isEliteRoster(entry: RosterEntry): boolean {
  return aiStrength(entry) >= ELITE_FLOOR;
}

/** The user's next match and which side (0 = a, 1 = b) the user is on; null when there is none. */
export function userPendingMatch(run: RunState): { match: TMatch; side: TeamIndex } | null {
  if (!run.tournament) return null;
  const match = pendingMatches(run.tournament).find(involvesUser);
  return match ? { match, side: match.a === USER_ID ? 0 : 1 } : null;
}

/** Opens the veto for the user's next match (team `a` bans first). Opponent turns are resolved right away. */
export function beginUserVeto(run: RunState): RunState {
  const pending = requirePending(run);
  if (run.veto?.matchId === pending.match.id) return run;
  const state = createVeto(RUN_MAP_POOL, pending.match.bestOf, 0);
  return { ...run, veto: { matchId: pending.match.id, state: resolveOpponentTurns(run, pending.match, pending.side, state) } };
}

/** The user bans or picks `map`; the opponent answers automatically until it is the user's turn again. */
export function applyUserVeto(run: RunState, map: MapName): RunState {
  const pending = requirePending(run);
  const veto = run.veto;
  if (!veto || veto.matchId !== pending.match.id) throw new Error('No veto in progress for the user match');
  const turn = nextTurn(veto.state);
  if (!turn) throw new Error('Veto is already complete');
  if (turn.team !== pending.side) throw new Error('It is not the user turn in the veto');
  const state = resolveOpponentTurns(run, pending.match, pending.side, applyVeto(veto.state, map));
  return { ...run, veto: { matchId: veto.matchId, state } };
}

/** Plays the user's match with the finished veto, then the AI matches scheduled before the user's next one. */
export function playUserMatch(run: RunState): RunState {
  const pending = requirePending(run);
  const { match } = pending;
  const veto = run.veto;
  if (!veto || veto.matchId !== match.id || !isVetoComplete(veto.state)) {
    throw new Error('The user match needs a complete veto');
  }
  const series = simulateSeries(lineupOf(run, match.a), lineupOf(run, match.b), createRng(`${run.seed}:${match.id}`), {
    ...seriesOptions(run, match),
    bestOf: match.bestOf,
    veto: veto.state,
  });
  const tournament = reportResult(requireTournament(run), match.id, { winner: series.winner, score: series.score });
  const next: RunState = {
    ...run,
    tournament,
    userSeries: { ...run.userSeries, [match.id]: series },
    boxScores: { ...run.boxScores, [match.id]: compactSeries(series, match.a, match.b) },
    mapsPlayed: recordSeriesMaps(run.mapsPlayed, match, series),
  };
  delete next.veto;
  return advance(next);
}

type SharedSeriesOptions = Pick<SeriesOptions, 'pool' | 'formSeed' | 'meta' | 'familiarity' | 'agentRoles' | 'adjust'>;

/**
 * Series options shared by the user's and the AI's matches: map pool, per-player form seeds, the agent meta and
 * roles, and both teams' map familiarity so far.
 */
function seriesOptions(run: RunState, match: Pick<TMatch, 'id' | 'a' | 'b'>): SharedSeriesOptions {
  const opts: SharedSeriesOptions = {
    pool: RUN_MAP_POOL,
    formSeed: `${run.seed}:${match.id}`,
    familiarity: [familiarityOf(run.mapsPlayed, match.a), familiarityOf(run.mapsPlayed, match.b)],
    agentRoles: AGENT_ROLES,
  };
  if (RUN_META) opts.meta = RUN_META;
  const adjust = aiAdjust(match.a, match.b, USER_ID, run.difficulty);
  if (adjust) opts.adjust = adjust;
  return opts;
}

/** The maps-played table after a series: both teams count every map they played. */
export function recordSeriesMaps(played: MapsPlayed, match: Pick<TMatch, 'a' | 'b'>, series: Pick<SeriesResult, 'maps'>): MapsPlayed {
  return recordMapsPlayed(played, [match.a, match.b], series.maps.map((m) => m.map));
}

/**
 * Lineup the AI vetoes with: lineupOf plus the team's map familiarity added to its map comfort, so teams lean
 * toward the maps they have been playing.
 */
export function vetoLineup(run: RunState, id: string): Lineup {
  return withFamiliarity(lineupOf(run, id), familiarityOf(run.mapsPlayed, id));
}

/** A lineup whose map comfort includes `familiarity` (strength points per map). */
export function withFamiliarity(lineup: Lineup, familiarity: Partial<Record<MapName, number>>): Lineup {
  const maps = Object.keys(familiarity);
  if (maps.length === 0) return lineup;
  const mapAffinity: Partial<Record<MapName, number>> = { ...(lineup.mapAffinity ?? {}) };
  for (const map of maps) mapAffinity[map] = (mapAffinity[map] ?? 0) + (familiarity[map] ?? 0);
  return { ...lineup, mapAffinity };
}

export interface MapFamiliarity {
  map: MapName;
  /** Maps the team played on it so far. */
  played: number;
  /** Strength points it gives (FAMILIARITY_PER_MAP each, up to FAMILIARITY_CAP). */
  points: number;
}

/** A team's familiarity with every map of the veto pool (pool order), for the hub and the veto. */
export function mapFamiliarity(run: Pick<RunState, 'mapsPlayed'>, teamId: string): MapFamiliarity[] {
  const points = familiarityOf(run.mapsPlayed, teamId);
  return RUN_MAP_POOL.map((map) => ({ map, played: run.mapsPlayed?.[teamId]?.[map] ?? 0, points: points[map] ?? 0 }));
}

/**
 * Lineup of any entrant as it plays this Champions: the cards shifted by their tournament form (seeded by the
 * run, src/engine/form.ts) and, for the user's prodigies, by the growth of the stages reached. The user's card
 * ids get a suffix so they never clash with an opponent's copy.
 */
export function lineupOf(run: RunState, id: string): Lineup {
  const formSeed = runFormSeed(run);
  if (id === USER_ID) {
    const lineup = draftLineup(run.draft, RUN_POOL, run.teamName ?? DEFAULT_TEAM_NAME);
    const suffixed = { ...lineup, players: lineup.players.map((p) => ({ ...p, card: { ...p.card, id: `${p.card.id}#user` } })) };
    return applyTournamentForm(suffixed, formSeed, prodigyGrowth(userStagesReached(run)));
  }
  return applyTournamentForm(realLineup(rosterByKey(id)), formSeed);
}

/** The user's lineup as the Team screen shows it (same cards and form as lineupOf, without the id suffix). */
export function userLineup(run: RunState): Lineup {
  return applyTournamentForm(draftedLineup(run), runFormSeed(run), prodigyGrowth(userStagesReached(run)));
}

/** Seed base of the run's tournament form (applyTournamentForm). */
export function runFormSeed(run: Pick<RunState, 'seed'>): string {
  return `${run.seed}:form`;
}

/** Stages the user reached in this run (prodigy growth): 0 groups, 1 playoffs, 2 top 4, 3 grand final. */
export function userStagesReached(run: RunState): number {
  const t = run.tournament;
  if (!t) return 0;
  const rounds = new Set(t.matches.filter(involvesUser).map((m) => m.round));
  if (rounds.has('gf')) return 3;
  if (rounds.has('ub-final') || rounds.has('lb-r3') || rounds.has('lb-final')) return 2;
  return t.matches.some((m) => involvesUser(m) && m.stage === 'playoffs') ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export interface TeamInfo {
  id: string;
  name: string;
  /** Event of the roster ("Champions 2022"), or "Seu time". */
  subtitle: string;
  isUser: boolean;
  seed: number;
  strength: number;
}

export function teamInfo(run: RunState, id: string): TeamInfo {
  const entrant = run.tournament?.entrants.find((e) => e.id === id);
  const isUser = id === USER_ID;
  return {
    id,
    name: entrant?.name ?? (isUser ? run.teamName ?? DEFAULT_TEAM_NAME : rosterByKey(id).teamName),
    subtitle: isUser ? 'Seu time' : rosterByKey(id).eventName,
    isUser,
    seed: entrant?.seed ?? 0,
    strength: teamStrength(lineupOf(run, id)).total + (isUser ? 0 : difficultySettings(run.difficulty).aiBonus),
  };
}

export interface StandingRow extends GroupStanding {
  name: string;
  isUser: boolean;
}

/** Group tables (A–D, each best first), with names. */
export function standings(run: RunState): StandingRow[] {
  const t = run.tournament;
  if (!t) return [];
  const names = new Map(t.entrants.map((e) => [e.id, e.name]));
  return groupStandings(t).map((s) => ({ ...s, name: names.get(s.id) ?? s.id, isUser: s.id === USER_ID }));
}

/** Team and event of an entrant, for its logo (the user's team has no real team id). */
export function entrantTeam(run: RunState, id: string): { teamId: string; eventId?: string; name: string } {
  const name = run.tournament?.entrants.find((e) => e.id === id)?.name ?? id;
  if (id === USER_ID) return { teamId: USER_ID, name };
  const entry = RUN_POOL.find((e) => rosterKey(e) === id);
  return entry ? { teamId: entry.teamId, eventId: entry.eventId, name } : { teamId: id, name };
}

export interface BracketCell {
  slot: BracketSlot;
  /** Created once both teams are known. */
  match?: TMatch;
}

/** The full playoff skeleton with the matches created so far. */
export function bracket(run: RunState): BracketCell[] {
  const byId = new Map((run.tournament?.matches ?? []).map((m) => [m.id, m]));
  return PLAYOFF_BRACKET.map((slot) => {
    const match = byId.get(slot.id);
    return match ? { slot, match } : { slot };
  });
}

export interface GroupCell {
  slot: GroupSlot;
  /** Created once both teams are known. */
  match?: TMatch;
}

export interface GroupView {
  group: GroupKey;
  /** The 5 GSL slots (opening 1, opening 2, winners, elimination, decider) with their matches so far. */
  cells: GroupCell[];
  /** The group's table, best first. */
  rows: StandingRow[];
  hasUser: boolean;
}

/** Every group's bracket and table: the user's group first, then the others in A–D order. */
export function groupViews(run: RunState): GroupView[] {
  const t = run.tournament;
  if (!t) return [];
  const byId = new Map(t.matches.map((m) => [m.id, m]));
  const table = standings(run);
  const views = GROUP_KEYS.map((group): GroupView => {
    const rows = table.filter((r) => r.group === group);
    return {
      group,
      cells: groupBracket(group).map((slot) => {
        const match = byId.get(slot.id);
        return match ? { slot, match } : { slot };
      }),
      rows,
      hasUser: rows.some((r) => r.isUser),
    };
  });
  return [...views.filter((v) => v.hasUser), ...views.filter((v) => !v.hasUser)];
}

/** The user's group, once the tournament has started. */
export function userGroup(run: RunState): GroupKey | undefined {
  return run.tournament && groupOf(run.tournament, USER_ID);
}

/** The parts of a match the user helpers need (also satisfied by league matches). */
export type MatchLike = Pick<TMatch, 'a' | 'b' | 'result'>;

export function involvesUser(m: MatchLike): boolean {
  return m.a === USER_ID || m.b === USER_ID;
}

/** Every match of the user (played or pending), in schedule order. */
export function userMatches(run: RunState): TMatch[] {
  return (run.tournament?.matches ?? []).filter(involvesUser);
}

/** Did the user win this (played) match? */
export function userWon(m: MatchLike): boolean {
  return !!m.result && (m.result.winner === 0) === (m.a === USER_ID);
}

export function userOpponent(m: MatchLike): string {
  return m.a === USER_ID ? m.b : m.a;
}

export interface UserRecord {
  /** Group-stage record ("Grupos 2-1"), the user's group and final place in it (once decided). */
  groups: { group?: GroupKey; wins: number; losses: number; place?: GroupPlace; status: GroupStatus };
  playoffs: { wins: number; losses: number };
  mapsWon: number;
  mapsLost: number;
  /** W/L of every played match in order. */
  results: { match: TMatch; won: boolean }[];
}

export function userRecord(run: RunState): UserRecord {
  const row = standings(run).find((s) => s.isUser);
  const groups: UserRecord['groups'] = { wins: row?.wins ?? 0, losses: row?.losses ?? 0, status: row?.status ?? 'alive' };
  if (row) groups.group = row.group;
  if (row?.place !== undefined) groups.place = row.place;
  const record: UserRecord = {
    groups,
    playoffs: { wins: 0, losses: 0 },
    mapsWon: 0,
    mapsLost: 0,
    results: [],
  };
  for (const m of userMatches(run)) {
    if (!m.result) continue;
    const side = m.a === USER_ID ? 0 : 1;
    const won = userWon(m);
    record.mapsWon += m.result.score[side];
    record.mapsLost += m.result.score[side === 0 ? 1 : 0];
    if (m.stage === 'playoffs') record.playoffs[won ? 'wins' : 'losses']++;
    record.results.push({ match: m, won });
  }
  return record;
}

export interface UserFinish {
  /** "1º", "2º", "5º–6º"… */
  place: string;
  /** "Campeão", "Vice-campeão", "Eliminado no Grupo A (1-2)"… */
  label: string;
  champion: boolean;
  /** Furthest stage reached, for the end screen's path: groups → playoffs → top 4 → final → title. */
  stage: FinishStage;
}

export type FinishStage = 'groups' | 'playoffs' | 'top4' | 'final' | 'champion';

/** Stages of the run's path, in order. */
export const FINISH_STAGES: readonly FinishStage[] = ['groups', 'playoffs', 'top4', 'final', 'champion'];

/** Where the user's run ended; null while the user is still alive. */
export function userFinish(run: RunState): UserFinish | null {
  const t = run.tournament;
  if (!t) return null;
  if (t.champion === USER_ID) return { place: '1º', label: 'Campeão', champion: true, stage: 'champion' };
  const rec = userRecord(run);
  const g = rec.groups;
  if (g.status === 'eliminated') {
    // 8 teams go out of the groups: the four 3rd places (decider losers) and the four 4th places.
    const place = g.place === 3 ? '9º–12º' : '13º–16º';
    const label = `Eliminado no Grupo ${g.group ?? '?'} (${g.wins}-${g.losses})`;
    return { place, label, champion: false, stage: 'groups' };
  }
  const fatal = rec.results.find((r) => !r.won && (r.match.round.startsWith('lb-') || r.match.round === 'gf'));
  if (!fatal) return null;
  const places: Record<string, string> = { gf: '2º', 'lb-final': '3º', 'lb-r3': '4º', 'lb-r2': '5º–6º', 'lb-r1': '7º–8º' };
  const place = places[fatal.match.round] ?? '—';
  const label = fatal.match.round === 'gf' ? 'Vice-campeão' : `Eliminado em ${fatal.match.label}`;
  const stages: Record<string, FinishStage> = { gf: 'final', 'lb-final': 'top4', 'lb-r3': 'top4' };
  return { place, label, champion: false, stage: stages[fatal.match.round] ?? 'playoffs' };
}

export interface PlayerStat {
  handle: string;
  maps: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Average ACS weighted by rounds played. */
  acs: number;
}

/** Aggregated stats of the user's players over every series they played. */
export function userPlayerStats(run: RunState): PlayerStat[] {
  const totals = new Map<string, PlayerStat & { acsRounds: number; rounds: number }>();
  for (const [matchId, series] of Object.entries(run.userSeries)) {
    const match = run.tournament?.matches.find((m) => m.id === matchId);
    if (!match) continue;
    const side = match.a === USER_ID ? 0 : 1;
    for (const map of series.maps) {
      for (const line of map.players[side]) {
        const t = totals.get(line.handle) ?? {
          handle: line.handle, maps: 0, kills: 0, deaths: 0, assists: 0, acs: 0, acsRounds: 0, rounds: 0,
        };
        t.maps++;
        t.kills += line.kills;
        t.deaths += line.deaths;
        t.assists += line.assists;
        t.acsRounds += line.acs * map.rounds.length;
        t.rounds += map.rounds.length;
        totals.set(line.handle, t);
      }
    }
  }
  return [...totals.values()]
    .map(({ acsRounds, rounds, ...s }) => ({ ...s, acs: rounds ? Math.round(acsRounds / rounds) : 0 }))
    .sort((x, y) => y.acs - x.acs || (x.handle < y.handle ? -1 : 1));
}

export interface RunSummary {
  mode: DraftMode;
  teamName: string;
  strength: number;
  finish: UserFinish | null;
  record: UserRecord;
  championName?: string;
  mvp?: PlayerStat;
}

export function runSummary(run: RunState): RunSummary {
  const champion = run.tournament?.champion;
  const summary: RunSummary = {
    mode: run.mode,
    teamName: run.teamName ?? DEFAULT_TEAM_NAME,
    strength: teamStrength(lineupOf(run, USER_ID)).total,
    finish: userFinish(run),
    record: userRecord(run),
  };
  if (champion) summary.championName = teamInfo(run, champion).name;
  const [mvp] = userPlayerStats(run);
  if (mvp) summary.mvp = mvp;
  return summary;
}

export { MODE_LABELS };

/**
 * Series results as plain letters, V (vitória) and D (derrota), in play order: share texts carry no emoji, so they
 * read the same in WhatsApp, X and anywhere else.
 */
export function resultLetters(wins: readonly boolean[]): string {
  return wins.map((won) => (won ? 'V' : 'D')).join(' ');
}

/** Spoiler-free result to share: no team or player names, only how far the run went. Plain text, no emoji. */
export function shareText(run: RunState): string {
  const s = runSummary(run);
  const finish = s.finish;
  const head = finish?.champion ? 'Campeão' : finish ? `${finish.place} · ${finish.label}` : 'Em andamento';
  const record = (label: string, rec: { wins: number; losses: number }, stage: 'groups' | 'playoffs') => {
    const letters = resultLetters(s.record.results.filter((r) => r.match.stage === stage).map((r) => r.won));
    return `${label} ${rec.wins}-${rec.losses}${letters ? ` · ${letters}` : ''}`;
  };
  const lines = [
    `Road to Champions | ${head}`,
    `${MODE_LABELS[s.mode]} · Força ${formatDecimal(s.strength)}`,
    record('Grupos', s.record.groups, 'groups'),
  ];
  if (s.record.playoffs.wins + s.record.playoffs.losses > 0) lines.push(record('Playoffs', s.record.playoffs, 'playoffs'));
  lines.push(`Mapas ${s.record.mapsWon}-${s.record.mapsLost}`);
  return lines.join('\n');
}

/** Opponent map comfort revealed by the user's coach in the veto: more vetoBonus, more information. */
export interface ScoutHint {
  map: MapName;
  /** Opponent's comfort on this map, in strength points. */
  value: number;
}

/** Scouting of the opponent's veto preferences: map comfort plus the familiarity it gained in this run. */
export function vetoScouting(run: RunState, opponentId: string): { level: number; hints: ScoutHint[] } {
  const level = scoutingLevel(run.draft.coachId ? findCoach(RUN_POOL, run.draft.coachId)?.vetoBonus ?? 0 : 0, run.difficulty);
  const affinity = vetoLineup(run, opponentId).mapAffinity ?? {};
  const all = RUN_MAP_POOL.map((map) => ({ map, value: affinity[map] ?? 0 })).sort(
    (x, y) => y.value - x.value || (x.map < y.map ? -1 : 1),
  );
  if (level <= 0) return { level, hints: [] };
  if (level >= 3) return { level, hints: all };
  const best = all[0]!;
  const worst = all[all.length - 1]!;
  return { level, hints: level === 1 ? [best] : [best, worst] };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Validates a parsed save. Returns null for anything that is not a usable RunState (corrupted or outdated). */
export function parseRun(data: unknown): RunState | null {
  try {
    if (!data || typeof data !== 'object') return null;
    const run = data as RunState;
    if (run.version !== RUN_VERSION || typeof run.seed !== 'string') return null;
    if (run.mode !== 'classic' && run.mode !== 'ultimate') return null;
    if (!['draft', 'team', 'tournament', 'done'].includes(run.phase)) return null;
    if (!run.draft || typeof run.draft !== 'object' || !Array.isArray(run.draft.picks)) return null;
    if (!run.userSeries || typeof run.userSeries !== 'object') return null;
    if (!run.mapsPlayed || typeof run.mapsPlayed !== 'object') return null;
    if (!isDifficulty(run.difficulty)) return null;
    if (!run.boxScores || typeof run.boxScores !== 'object') return null;
    // Past the draft, the lineup and the coach must be complete.
    if (run.phase !== 'draft' && (run.draft.picks.length !== 5 || run.draft.phase !== 'done')) return null;
    // Every referenced card, coach and opponent must still exist in the pool.
    if (run.draft.picks.length === 5) draftedLineup(run);
    if (run.phase === 'tournament' || run.phase === 'done') {
      const t = run.tournament;
      if (!t || !Array.isArray(run.opponents) || !Array.isArray(t.matches)) return null;
      if (t.version !== 2 || !t.groups || typeof t.groups !== 'object') return null;
      if (!Array.isArray(t.entrants) || t.entrants.length !== TEAM_COUNT) return null;
      for (const e of t.entrants) teamInfo(run, e.id);
      // Smoke-test the selectors the screens rely on: they throw on a broken tournament.
      standings(run);
      userPendingMatch(run);
    }
    return run;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertPhase(run: RunState, phase: RunPhase): void {
  if (run.phase !== phase) throw new Error(`Expected run phase "${phase}", run is in "${run.phase}"`);
}

function requireTournament(run: RunState): TournamentState {
  if (!run.tournament) throw new Error('The tournament has not started');
  return run.tournament;
}

function requirePending(run: RunState): { match: TMatch; side: TeamIndex } {
  const pending = userPendingMatch(run);
  if (!pending) throw new Error('The user has no pending match');
  return pending;
}

function rosterByKey(key: string): RosterEntry {
  const entry = RUN_POOL.find((e) => rosterKey(e) === key);
  if (!entry) throw new Error(`Unknown roster "${key}"`);
  return entry;
}

function resolveOpponentTurns(run: RunState, match: TMatch, userSide: TeamIndex, start: VetoState): VetoState {
  const lineups: [Lineup, Lineup] = [vetoLineup(run, match.a), vetoLineup(run, match.b)];
  let state = start;
  for (let turn = nextTurn(state); turn && turn.team !== userSide; turn = nextTurn(state)) {
    const rng = createRng(`${run.seed}:${match.id}:veto:${state.steps.length}`);
    state = applyVeto(state, aiChooseMap(state, lineups, rng, difficultySettings(run.difficulty).vetoNoise));
  }
  return state;
}

/** Plays AI-vs-AI matches in schedule order until the next match is the user's or the tournament ends. */
function advance(run: RunState): RunState {
  let tournament = requireTournament(run);
  let mapsPlayed = run.mapsPlayed;
  const boxScores = { ...run.boxScores };
  for (let guard = 0; guard < 1000 && tournament.phase !== 'done'; guard++) {
    const [next] = pendingMatches(tournament);
    if (!next || involvesUser(next)) break;
    const series = simulateSeries(lineupOf(run, next.a), lineupOf(run, next.b), createRng(`${run.seed}:${next.id}`), {
      ...seriesOptions({ ...run, mapsPlayed }, next),
      bestOf: next.bestOf,
    });
    tournament = reportResult(tournament, next.id, { winner: series.winner, score: series.score });
    mapsPlayed = recordSeriesMaps(mapsPlayed, next, series);
    boxScores[next.id] = compactSeries(series, next.a, next.b);
  }
  return { ...run, tournament, mapsPlayed, boxScores, phase: tournament.phase === 'done' ? 'done' : 'tournament' };
}
