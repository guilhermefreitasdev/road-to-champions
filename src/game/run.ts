/**
 * Game glue: one run = draft → coach → team name → 16-team Champions.
 * RunState is plain JSON and never mutated; every action returns a new state, so the UI can save it after
 * each step. Everything is deterministic from the seed plus the user's choices (no Math.random here).
 *
 * Match scheduling: matches are played in creation order. AI-vs-AI matches are simulated automatically until
 * the next match in the schedule is the user's, which waits for the user's veto. Once the user is eliminated
 * the rest of the tournament plays out on its own, so the champion is always known at the end.
 */
import { SAMPLE_MAP_POOL } from '../data/mapPools';
import { SAMPLE_ROSTERS, sampleLineup } from '../data/sample';
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
import { findCoach, pickOpponents, rosterKey } from '../engine/roster';
import { simulateSeries, type SeriesResult } from '../engine/series';
import { teamStrength } from '../engine/team';
import {
  PLAYOFF_BRACKET,
  createTournament,
  pendingMatches,
  reportResult,
  swissStandings,
  type BracketSlot,
  type SwissStanding,
  type SwissStatus,
  type TMatch,
  type TournamentState,
} from '../engine/tournament';
import type { Card, Coach, Lineup, MapName, RosterEntry, Slot, TeamIndex } from '../engine/types';
import { aiChooseMap, applyVeto, createVeto, isVetoComplete, nextTurn, type VetoState } from '../engine/veto';

export type { DraftMode } from '../engine/draft';

/** The roster pool used for the draft and the opponents. Fictional until the real data pipeline exists. */
export const RUN_POOL: readonly RosterEntry[] = SAMPLE_ROSTERS;
export const RUN_MAP_POOL: readonly MapName[] = SAMPLE_MAP_POOL;

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
  version: 1;
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
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export function createRun(mode: DraftMode, seed: string): RunState {
  return { version: 1, seed, mode, phase: 'draft', draft: createDraft(RUN_POOL, mode, seed), userSeries: {} };
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
  const opponents = pickOpponents(RUN_POOL, OPPONENT_COUNT, run.seed, userPlayers).map(rosterKey);

  const field = [
    { id: USER_ID, name, strength: teamStrength(user).total },
    ...opponents.map((id) => {
      const entry = rosterByKey(id);
      return { id, name: entry.teamName, strength: teamStrength(sampleLineup(entry)).total };
    }),
  ].sort((x, y) => y.strength - x.strength || (x.id < y.id ? -1 : 1));

  const tournament = createTournament(field.map((t, i) => ({ id: t.id, name: t.name, seed: i + 1 })));
  return advance({ ...run, phase: 'tournament', teamName: name, opponents, tournament });
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
    bestOf: match.bestOf,
    pool: RUN_MAP_POOL,
    veto: veto.state,
  });
  const tournament = reportResult(requireTournament(run), match.id, { winner: series.winner, score: series.score });
  const next: RunState = { ...run, tournament, userSeries: { ...run.userSeries, [match.id]: series } };
  delete next.veto;
  return advance(next);
}

/** Lineup of any entrant. The user's card ids get a suffix so they never clash with an opponent's copy. */
export function lineupOf(run: RunState, id: string): Lineup {
  if (id === USER_ID) {
    const lineup = draftLineup(run.draft, RUN_POOL, run.teamName ?? DEFAULT_TEAM_NAME);
    return { ...lineup, players: lineup.players.map((p) => ({ ...p, card: { ...p.card, id: `${p.card.id}#user` } })) };
  }
  return sampleLineup(rosterByKey(id));
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export interface TeamInfo {
  id: string;
  name: string;
  /** Event of the roster ("Champions Exemplo 2024"), or "Seu time". */
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
    strength: teamStrength(lineupOf(run, id)).total,
  };
}

export interface StandingRow extends SwissStanding {
  name: string;
  isUser: boolean;
}

export function standings(run: RunState): StandingRow[] {
  const t = run.tournament;
  if (!t) return [];
  const names = new Map(t.entrants.map((e) => [e.id, e.name]));
  return swissStandings(t).map((s) => ({ ...s, name: names.get(s.id) ?? s.id, isUser: s.id === USER_ID }));
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

export function involvesUser(m: TMatch): boolean {
  return m.a === USER_ID || m.b === USER_ID;
}

/** Every match of the user (played or pending), in schedule order. */
export function userMatches(run: RunState): TMatch[] {
  return (run.tournament?.matches ?? []).filter(involvesUser);
}

/** Did the user win this (played) match? */
export function userWon(m: TMatch): boolean {
  return !!m.result && (m.result.winner === 0) === (m.a === USER_ID);
}

export function userOpponent(m: TMatch): string {
  return m.a === USER_ID ? m.b : m.a;
}

export interface UserRecord {
  swiss: { wins: number; losses: number; status: SwissStatus };
  playoffs: { wins: number; losses: number };
  mapsWon: number;
  mapsLost: number;
  /** W/L of every played match in order. */
  results: { match: TMatch; won: boolean }[];
}

export function userRecord(run: RunState): UserRecord {
  const swissRow = standings(run).find((s) => s.isUser);
  const record: UserRecord = {
    swiss: { wins: swissRow?.wins ?? 0, losses: swissRow?.losses ?? 0, status: swissRow?.status ?? 'alive' },
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
  /** "Campeão", "Vice-campeão", "Eliminado na Suíça (1-3)"… */
  label: string;
  champion: boolean;
}

/** Where the user's run ended; null while the user is still alive. */
export function userFinish(run: RunState): UserFinish | null {
  const t = run.tournament;
  if (!t) return null;
  if (t.champion === USER_ID) return { place: '1º', label: 'Campeão', champion: true };
  const rec = userRecord(run);
  if (rec.swiss.status === 'eliminated') {
    const place = rec.swiss.wins === 2 ? '9º–12º' : rec.swiss.wins === 1 ? '13º–14º' : '15º–16º';
    return { place, label: `Eliminado na Suíça (${rec.swiss.wins}-${rec.swiss.losses})`, champion: false };
  }
  const fatal = rec.results.find((r) => !r.won && (r.match.round.startsWith('lb-') || r.match.round === 'gf'));
  if (!fatal) return null;
  const places: Record<string, string> = { gf: '2º', 'lb-final': '3º', 'lb-r3': '4º', 'lb-r2': '5º–6º', 'lb-r1': '7º–8º' };
  const place = places[fatal.match.round] ?? '—';
  const label = fatal.match.round === 'gf' ? 'Vice-campeão' : `Eliminado em ${fatal.match.label}`;
  return { place, label, champion: false };
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

export const MODE_LABELS: Record<DraftMode, string> = { classic: 'Draft clássico', ultimate: 'Ultimate Draft' };

/** Spoiler-free result to share: no team or player names, only how far the run went. */
export function shareText(run: RunState): string {
  const s = runSummary(run);
  const finish = s.finish;
  const head = finish?.champion ? '🏆 Campeão' : finish ? `${finish.place} · ${finish.label}` : 'Em andamento';
  const dots = (stage: 'swiss' | 'playoffs') =>
    s.record.results
      .filter((r) => r.match.stage === stage)
      .map((r) => (r.won ? '🟩' : '🟥'))
      .join('');
  const lines = [
    `Road to Champions ${head}`,
    `${MODE_LABELS[s.mode]} · Força ${formatDecimal(s.strength)}`,
    `Suíça ${s.record.swiss.wins}-${s.record.swiss.losses} ${dots('swiss')}`,
  ];
  if (s.record.playoffs.wins + s.record.playoffs.losses > 0) {
    lines.push(`Playoffs ${s.record.playoffs.wins}-${s.record.playoffs.losses} ${dots('playoffs')}`);
  }
  lines.push(`Mapas ${s.record.mapsWon}-${s.record.mapsLost}`);
  return lines.join('\n');
}

/** Opponent map comfort revealed by the user's coach in the veto: more vetoBonus, more information. */
export interface ScoutHint {
  map: MapName;
  /** Opponent's comfort on this map, in strength points. */
  value: number;
}

export function vetoScouting(run: RunState, opponentId: string): { level: number; hints: ScoutHint[] } {
  const level = run.draft.coachId ? findCoach(RUN_POOL, run.draft.coachId)?.vetoBonus ?? 0 : 0;
  const affinity = lineupOf(run, opponentId).mapAffinity ?? {};
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
    if (run.version !== 1 || typeof run.seed !== 'string') return null;
    if (run.mode !== 'classic' && run.mode !== 'ultimate') return null;
    if (!['draft', 'team', 'tournament', 'done'].includes(run.phase)) return null;
    if (!run.draft || typeof run.draft !== 'object' || !Array.isArray(run.draft.picks)) return null;
    if (!run.userSeries || typeof run.userSeries !== 'object') return null;
    // Every referenced card, coach and opponent must still exist in the pool.
    if (run.draft.picks.length === 5) draftedLineup(run);
    if (run.phase === 'tournament' || run.phase === 'done') {
      if (!run.tournament || !Array.isArray(run.opponents)) return null;
      for (const e of run.tournament.entrants) teamInfo(run, e.id);
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
  const lineups: [Lineup, Lineup] = [lineupOf(run, match.a), lineupOf(run, match.b)];
  let state = start;
  for (let turn = nextTurn(state); turn && turn.team !== userSide; turn = nextTurn(state)) {
    const rng = createRng(`${run.seed}:${match.id}:veto:${state.steps.length}`);
    state = applyVeto(state, aiChooseMap(state, lineups, rng));
  }
  return state;
}

/** Plays AI-vs-AI matches in schedule order until the next match is the user's or the tournament ends. */
function advance(run: RunState): RunState {
  let tournament = requireTournament(run);
  for (let guard = 0; guard < 1000 && tournament.phase !== 'done'; guard++) {
    const [next] = pendingMatches(tournament);
    if (!next || involvesUser(next)) break;
    const series = simulateSeries(lineupOf(run, next.a), lineupOf(run, next.b), createRng(`${run.seed}:${next.id}`), {
      bestOf: next.bestOf,
      pool: RUN_MAP_POOL,
    });
    tournament = reportResult(tournament, next.id, { winner: series.winner, score: series.score });
  }
  return { ...run, tournament, phase: tournament.phase === 'done' ? 'done' : 'tournament' };
}
