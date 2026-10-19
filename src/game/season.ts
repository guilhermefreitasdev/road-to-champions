/**
 * Complete Trials: a season that starts on the user's server. Region pick → draft (roulette limited to the
 * region's rosters, any era) → coach → team name → regional league (12 teams) → Masters (8, double elimination)
 * → Champions (16, the main mode's format). Failing to finish in the league's top 3 ends the run.
 *
 * SeasonState is plain JSON and never mutated; everything is deterministic from the seed plus the user's
 * choices (region, field mode, draft, veto). AI-vs-AI matches are simulated in schedule order until the next
 * match is the user's; once a stage ends, the next one is built and advanced the same way.
 *
 * Opponents (the "field"): one roster per team of a region, chosen by the field mode. `current` = the team's
 * most recent roster in the data (its latest year; the last one in the pool when a year has several: the pool
 * lists the international events in date order, then the regional stages); `prime` = the team's strongest roster
 * ever (highest AI strength). Only the user's draft rolls every era. The field mode is chosen with the region and
 * stored in the state.
 */
import { ALL_ROSTERS, REAL_MAP_POOL, realLineup, teamRegion } from '../data/real';
import {
  bracketCells,
  bracketPending,
  bracketPlaceOf,
  bracketRanking,
  createBracket,
  reportBracketResult,
  BRACKET_LOSER_PLACES,
  type BracketCell,
  type BracketPlace,
  type BracketState,
} from '../engine/bracket';
import {
  availableCards,
  createDraft,
  draftLineup,
  pickCoach,
  pickPlayer,
  reroll,
  roll,
  type DraftState,
} from '../engine/draft';
import {
  LEAGUE_GROUPS,
  LEAGUE_PLAYOFFS,
  LEAGUE_TEAMS,
  createLeague,
  leaguePending,
  leaguePlaceOf,
  leagueStandings,
  mastersQualified,
  reportLeagueResult,
  type LMatch,
  type LeagueGroup,
  type LeagueResult,
  type LeagueSlot,
  type LeagueStanding,
  type LeagueState,
} from '../engine/league';
import { createRng } from '../engine/rng';
import { findCoach, rosterKey, shuffled } from '../engine/roster';
import { simulateSeries, type SeriesResult } from '../engine/series';
import { teamStrength } from '../engine/team';
import {
  GROUP_KEYS,
  PLAYOFF_BRACKET,
  TEAM_COUNT,
  createTournament,
  groupBracket,
  groupStandings,
  pendingMatches,
  reportResult,
  type Entrant,
  type PlayoffRound,
  type TMatch,
  type TournamentState,
} from '../engine/tournament';
import { REGIONS, type Card, type Coach, type Lineup, type MapName, type Region, type RosterEntry, type Slot, type TeamIndex } from '../engine/types';
import { aiChooseMap, applyVeto, createVeto, isVetoComplete, nextTurn, type VetoState } from '../engine/veto';
import { formatDecimal } from './explain';
import {
  DEFAULT_TEAM_NAME,
  USER_ID,
  cleanTeamName,
  involvesUser,
  userOpponent,
  userWon,
  type BracketCell as RunBracketCell,
  type GroupView,
  type PlayerStat,
  type ScoutHint,
  type StandingRow,
} from './run';

export { USER_ID } from './run';

export const SEASON_VERSION = 1;
export const SEASON_MAP_POOL: readonly MapName[] = REAL_MAP_POOL;
export const LEAGUE_OPPONENTS = LEAGUE_TEAMS - 1;
export const MASTERS_TEAMS = 8;
export const CHAMPIONS_PER_REGION = 4;

export type FieldMode = 'current' | 'prime';
export const FIELD_MODES: readonly FieldMode[] = ['current', 'prime'];
export const FIELD_MODE_LABELS: Record<FieldMode, string> = { current: 'Atual', prime: 'Prime' };
export const FIELD_MODE_TEXT: Record<FieldMode, string> = {
  current: 'Cada time entra com o elenco mais recente dos dados.',
  prime: 'Modo Prime: todos os times no auge, cada um com o elenco mais forte que já teve.',
};

export const REGION_LABELS: Record<Region, string> = { americas: 'Americas', emea: 'EMEA', pacific: 'Pacific', china: 'China' };

export type SeasonStage = 'region' | 'draft' | 'team' | 'league' | 'masters' | 'champions' | 'done';
export type CompStage = 'league' | 'masters' | 'champions';
export const COMP_STAGES: readonly CompStage[] = ['league', 'masters', 'champions'];
export const STAGE_LABELS: Record<CompStage, string> = { league: 'Liga', masters: 'Masters', champions: 'Champions' };

export interface SeasonVeto {
  stage: CompStage;
  matchId: string;
  state: VetoState;
}

export interface SeasonState {
  version: typeof SEASON_VERSION;
  seed: string;
  stage: SeasonStage;
  field: FieldMode;
  region?: Region;
  draft?: DraftState;
  teamName?: string;
  league?: LeagueState;
  masters?: BracketState;
  champions?: TournamentState;
  /** Veto in progress for the user's next match. */
  veto?: SeasonVeto;
  /** Full series of every match the user played, keyed by `${stage}:${matchId}`. */
  userSeries: Record<string, SeriesResult>;
  /** Set when the run ended before the Champions. */
  eliminatedAt?: 'league';
}

export type SeasonMatch = TMatch | LMatch;

// ---------------------------------------------------------------------------
// Pools and fields
// ---------------------------------------------------------------------------

/** Region of a roster: the data's own field; the team lookup only covers a roster that somehow lacks it. */
export function regionOf(entry: RosterEntry): Region {
  const region = entry.region ?? teamRegion(entry.teamId, entry.year);
  if (!region) throw new Error(`Roster "${rosterKey(entry)}" has no region`);
  return region;
}

const strengthCache = new Map<string, number>();
/** AI strength of a real roster (memoized: the field builders compare many rosters). */
export function aiStrength(entry: RosterEntry): number {
  const key = rosterKey(entry);
  let v = strengthCache.get(key);
  if (v === undefined) {
    v = teamStrength(realLineup(entry)).total;
    strengthCache.set(key, v);
  }
  return v;
}

/** Every roster of a region (internationals and regional leagues, every era): what the draft roulette rolls. */
export function regionPool(region: Region): RosterEntry[] {
  return ALL_ROSTERS.filter((e) => regionOf(e) === region);
}

/** Distinct team ids of a region, in pool order. */
export function regionTeams(region: Region): string[] {
  return [...new Set(regionPool(region).map((e) => e.teamId))];
}

/**
 * The roster a team enters the AI fields with. `current`: its most recent roster (latest year; the last in the
 * pool among the same year). `prime`: its strongest roster ever by AI strength (the first in pool order on a tie).
 */
export function fieldRosterFor(teamId: string, mode: FieldMode, pool: readonly RosterEntry[] = ALL_ROSTERS): RosterEntry | undefined {
  let best: RosterEntry | undefined;
  for (const e of pool) {
    if (e.teamId !== teamId) continue;
    if (!best) best = e;
    else if (mode === 'prime' ? aiStrength(e) > aiStrength(best) : e.year >= best.year) best = e;
  }
  return best;
}

/** One candidate roster per team of the region, by field mode. */
export function fieldCandidates(region: Region, mode: FieldMode): RosterEntry[] {
  return regionTeams(region).map((id) => fieldRosterFor(id, mode)).filter((e): e is RosterEntry => !!e);
}

/**
 * Draws `count` rosters of distinct teams from `candidates`, deterministically. Rosters with one of the user's
 * players are only used when nothing else is left; `excludeTeams` never enter.
 */
function drawRosters(candidates: readonly RosterEntry[], count: number, seed: string, exclude: ReadonlySet<string>, excludeTeams: ReadonlySet<string> = new Set()): RosterEntry[] {
  const rng = createRng(seed);
  const clean: RosterEntry[] = [];
  const fallback: RosterEntry[] = [];
  for (const e of shuffled(candidates, rng)) {
    if (excludeTeams.has(e.teamId)) continue;
    (e.cards.some((c) => exclude.has(c.playerId)) ? fallback : clean).push(e);
  }
  const out = [...clean, ...fallback].slice(0, count);
  if (out.length < count) throw new Error(`Need ${count} teams, only ${out.length} available`);
  return out;
}

/** The strongest `count` of a draw of `2 × count` candidates: a region sends its best to the Masters, with some luck. */
function drawStrongest(candidates: readonly RosterEntry[], count: number, seed: string, exclude: ReadonlySet<string>, excludeTeams?: ReadonlySet<string>): RosterEntry[] {
  const available = candidates.filter((e) => !excludeTeams?.has(e.teamId)).length;
  const drawn = drawRosters(candidates, Math.min(2 * count, available), seed, exclude, excludeTeams);
  return drawn.sort((x, y) => aiStrength(y) - aiStrength(x) || rosterKey(x).localeCompare(rosterKey(y))).slice(0, count);
}

/** Entrant name of a roster: the team, plus its event in Prime mode so the user sees which version they face. */
export function entrantName(entry: RosterEntry, mode: FieldMode): string {
  return mode === 'prime' ? `${entry.teamName} · ${entry.eventName}` : entry.teamName;
}

// ---------------------------------------------------------------------------
// Region, draft and team
// ---------------------------------------------------------------------------

export function createSeason(seed: string, field: FieldMode = 'current'): SeasonState {
  return { version: SEASON_VERSION, seed, stage: 'region', field, userSeries: {} };
}

/** Picks the server. The draft then rolls only rosters of that region. */
export function chooseRegion(s: SeasonState, region: Region, field: FieldMode = s.field): SeasonState {
  assertStage(s, 'region');
  if (!REGIONS.includes(region)) throw new Error(`Unknown region "${region}"`);
  if (!FIELD_MODES.includes(field)) throw new Error(`Unknown field mode "${field}"`);
  const pool = regionPool(region);
  if (pool.length === 0) throw new Error(`No rosters for region "${region}"`);
  return { ...s, stage: 'draft', region, field, draft: createDraft(pool, 'classic', `${s.seed}:${region}`) };
}

/** Changes the field mode; only before the league starts. */
export function setFieldMode(s: SeasonState, field: FieldMode): SeasonState {
  if (!FIELD_MODES.includes(field)) throw new Error(`Unknown field mode "${field}"`);
  if (!['region', 'draft', 'team'].includes(s.stage)) throw new Error('The field mode is locked once the league starts');
  return { ...s, field };
}

/** The region's pool, once a region is chosen. */
export function seasonPool(s: SeasonState): RosterEntry[] {
  if (!s.region) throw new Error('No region chosen');
  return regionPool(s.region);
}

export function rollSeasonDraft(s: SeasonState): SeasonState {
  assertStage(s, 'draft');
  return { ...s, draft: roll(requireDraft(s), seasonPool(s)) };
}

export function rerollSeasonDraft(s: SeasonState): SeasonState {
  assertStage(s, 'draft');
  return { ...s, draft: reroll(requireDraft(s), seasonPool(s)) };
}

export function pickSeasonPlayer(s: SeasonState, cardId: string, slot: Slot): SeasonState {
  assertStage(s, 'draft');
  return { ...s, draft: pickPlayer(requireDraft(s), seasonPool(s), cardId, slot) };
}

/** Choosing the coach ends the draft (stage 'draft' → 'team'). */
export function pickSeasonCoach(s: SeasonState, coachId: string): SeasonState {
  assertStage(s, 'draft');
  return { ...s, stage: 'team', draft: pickCoach(requireDraft(s), seasonPool(s), coachId) };
}

export function seasonDraftOptions(s: SeasonState): Card[] {
  return s.draft ? availableCards(s.draft, seasonPool(s)) : [];
}

export function seasonRolledRoster(s: SeasonState): RosterEntry | undefined {
  const cur = s.draft?.current;
  return cur && seasonPool(s).find((e) => e.teamId === cur.teamId && e.eventId === cur.eventId);
}

export function seasonCoachOptions(s: SeasonState): Coach[] {
  const pool = seasonPool(s);
  return (s.draft?.coachOptions ?? []).map((id) => findCoach(pool, id)).filter((c): c is Coach => !!c);
}

/** The drafted lineup (needs the 5 picks). */
export function seasonLineup(s: SeasonState): Lineup {
  return draftLineup(requireDraft(s), seasonPool(s), s.teamName ?? DEFAULT_TEAM_NAME);
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** Names the team and builds the regional league: the user + 11 teams of the region, seeded by strength. */
export function startLeague(s: SeasonState, teamName: string): SeasonState {
  assertStage(s, 'team');
  const name = cleanTeamName(teamName);
  const region = s.region!;
  const user = draftLineup(requireDraft(s), seasonPool(s), name);
  const exclude = new Set(user.players.map((p) => p.card.playerId));
  const opponents = drawRosters(fieldCandidates(region, s.field), LEAGUE_OPPONENTS, `${s.seed}:league`, exclude);
  const entrants = seedByStrength([
    { id: USER_ID, name, strength: teamStrength(user).total },
    ...opponents.map((e) => ({ id: rosterKey(e), name: entrantName(e, s.field), strength: aiStrength(e) })),
  ]);
  return advance({ ...s, stage: 'league', teamName: name, league: createLeague(entrants) });
}

/**
 * Masters: the league's top 3 (the user among them) + 5 teams of the other regions: 2 from each of two regions
 * and 1 from the third (which one gets 1 is drawn), each region sending the strongest of a draw of twice as many.
 */
function startMasters(s: SeasonState): SeasonState {
  const league = s.league!;
  const home = mastersQualified(league);
  const others = shuffled(REGIONS.filter((r) => r !== s.region), createRng(`${s.seed}:masters:regions`));
  const slots = [2, 2, 1];
  const exclude = userPlayers(s);
  const away = others.flatMap((region, i) => drawStrongest(fieldCandidates(region, s.field), slots[i]!, `${s.seed}:masters:${region}`, exclude));
  const entrants = seedByStrength([
    ...home.map((id) => ({ id, name: nameOf(s, id), strength: strengthOf(s, id) })),
    ...away.map((e) => ({ id: rosterKey(e), name: entrantName(e, s.field), strength: aiStrength(e) })),
  ]);
  return { ...s, stage: 'masters', masters: createBracket(entrants) };
}

/**
 * Champions: 4 teams per region. The user's region sends the league's top 4; every other region sends its Masters
 * teams plus draws (distinct teams) to fill 4. Seeded by strength into the main mode's format.
 */
function startChampions(s: SeasonState): SeasonState {
  const league = s.league!;
  const masters = s.masters!;
  const exclude = userPlayers(s);
  const regionOfId = (id: string) => regionOf(rosterByKey(id));
  const entries: { id: string; name: string; strength: number }[] = [];

  const homeIds = league.entrants
    .map((e) => ({ id: e.id, rank: leaguePlaceOf(league, e.id)?.rank ?? 99, seed: e.seed }))
    .sort((x, y) => x.rank - y.rank || x.seed - y.seed)
    .slice(0, CHAMPIONS_PER_REGION)
    .map((e) => e.id);
  for (const id of homeIds) entries.push({ id, name: nameOf(s, id), strength: strengthOf(s, id) });

  for (const region of REGIONS) {
    if (region === s.region) continue;
    const fromMasters = bracketRanking(masters).filter((id) => id !== USER_ID && regionOfId(id) === region);
    const taken = new Set(fromMasters.map((id) => rosterByKey(id).teamId));
    const draws = drawRosters(fieldCandidates(region, s.field), CHAMPIONS_PER_REGION - fromMasters.length, `${s.seed}:champions:${region}`, exclude, taken);
    for (const id of fromMasters) entries.push({ id, name: nameOf(s, id), strength: strengthOf(s, id) });
    for (const e of draws) entries.push({ id: rosterKey(e), name: entrantName(e, s.field), strength: aiStrength(e) });
  }
  if (entries.length !== TEAM_COUNT) throw new Error(`Champions field has ${entries.length} teams, needs ${TEAM_COUNT}`);
  return { ...s, stage: 'champions', champions: createTournament(seedByStrength(entries)) };
}

function seedByStrength(teams: { id: string; name: string; strength: number }[]): Entrant[] {
  return [...teams]
    .sort((x, y) => y.strength - x.strength || (x.id < y.id ? -1 : 1))
    .map((t, i) => ({ id: t.id, name: t.name, seed: i + 1 }));
}

export function isCompStage(stage: SeasonStage): stage is CompStage {
  return (COMP_STAGES as readonly string[]).includes(stage);
}

/** Matches of a stage created so far, in play order. */
export function stageMatches(s: SeasonState, stage: CompStage): SeasonMatch[] {
  if (stage === 'league') return s.league?.matches ?? [];
  if (stage === 'masters') return s.masters?.matches ?? [];
  return s.champions?.matches ?? [];
}

function stagePending(s: SeasonState, stage: CompStage): SeasonMatch[] {
  if (stage === 'league') return s.league ? leaguePending(s.league) : [];
  if (stage === 'masters') return s.masters ? bracketPending(s.masters) : [];
  return s.champions ? pendingMatches(s.champions) : [];
}

function stageDone(s: SeasonState, stage: CompStage): boolean {
  if (stage === 'league') return s.league?.phase === 'done';
  if (stage === 'masters') return s.masters?.phase === 'done';
  return s.champions?.phase === 'done';
}

function stageReport(s: SeasonState, stage: CompStage, matchId: string, result: LeagueResult): SeasonState {
  if (stage === 'league') return { ...s, league: reportLeagueResult(s.league!, matchId, result) };
  if (stage === 'masters') return { ...s, masters: reportBracketResult(s.masters!, matchId, result) };
  return { ...s, champions: reportResult(s.champions!, matchId, result) };
}

/** Runs a series and turns it into a result with map and round totals. */
function playSeries(s: SeasonState, stage: CompStage, match: SeasonMatch, veto?: VetoState): { series: SeriesResult; result: LeagueResult } {
  const opts: Parameters<typeof simulateSeries>[3] = { bestOf: match.bestOf, pool: SEASON_MAP_POOL };
  if (veto) opts.veto = veto;
  const series = simulateSeries(lineupOf(s, match.a), lineupOf(s, match.b), createRng(`${s.seed}:${stage}:${match.id}`), opts);
  const rounds: [number, number] = [0, 0];
  for (const m of series.maps) {
    rounds[0] += m.score[0];
    rounds[1] += m.score[1];
  }
  return { series, result: { winner: series.winner, score: series.score, rounds } };
}

/** Plays AI matches of the current stage until the user's next match; moves on to the next stage when one ends. */
function advance(s: SeasonState): SeasonState {
  let cur = s;
  for (let guard = 0; guard < 10; guard++) {
    const stage = cur.stage;
    if (!isCompStage(stage)) return cur;
    for (let inner = 0; inner < 1000; inner++) {
      const [next] = stagePending(cur, stage);
      if (!next || involvesUser(next)) break;
      cur = stageReport(cur, stage, next.id, playSeries(cur, stage, next).result);
    }
    if (!stageDone(cur, stage)) return cur;
    if (stage === 'league') {
      if (!mastersQualified(cur.league!).includes(USER_ID)) return { ...cur, stage: 'done', eliminatedAt: 'league' };
      cur = startMasters(cur);
    } else if (stage === 'masters') {
      cur = startChampions(cur);
    } else {
      return { ...cur, stage: 'done' };
    }
  }
  throw new Error('Season did not advance');
}

// ---------------------------------------------------------------------------
// The user's matches
// ---------------------------------------------------------------------------

export interface PendingMatch {
  stage: CompStage;
  match: SeasonMatch;
  side: TeamIndex;
}

/** The user's next match in the current stage; null when there is none. */
export function userPendingMatch(s: SeasonState): PendingMatch | null {
  if (!isCompStage(s.stage)) return null;
  const match = stagePending(s, s.stage).find(involvesUser);
  return match ? { stage: s.stage, match, side: match.a === USER_ID ? 0 : 1 } : null;
}

/** Opens the veto for the user's next match (team `a` bans first). Opponent turns are resolved right away. */
export function beginUserVeto(s: SeasonState): SeasonState {
  const pending = requirePending(s);
  if (s.veto?.stage === pending.stage && s.veto.matchId === pending.match.id) return s;
  const state = createVeto(SEASON_MAP_POOL, pending.match.bestOf, 0);
  return { ...s, veto: { stage: pending.stage, matchId: pending.match.id, state: resolveOpponentTurns(s, pending, state) } };
}

/** The user bans or picks `map`; the opponent answers automatically until it is the user's turn again. */
export function applyUserVeto(s: SeasonState, map: MapName): SeasonState {
  const pending = requirePending(s);
  const veto = s.veto;
  if (!veto || veto.stage !== pending.stage || veto.matchId !== pending.match.id) throw new Error('No veto in progress for the user match');
  const turn = nextTurn(veto.state);
  if (!turn) throw new Error('Veto is already complete');
  if (turn.team !== pending.side) throw new Error('It is not the user turn in the veto');
  return { ...s, veto: { ...veto, state: resolveOpponentTurns(s, pending, applyVeto(veto.state, map)) } };
}

/** Plays the user's match with the finished veto, then everything scheduled before the user's next one. */
export function playUserMatch(s: SeasonState): SeasonState {
  const pending = requirePending(s);
  const veto = s.veto;
  if (!veto || veto.stage !== pending.stage || veto.matchId !== pending.match.id || !isVetoComplete(veto.state)) {
    throw new Error('The user match needs a complete veto');
  }
  const { series, result } = playSeries(s, pending.stage, pending.match, veto.state);
  const next: SeasonState = {
    ...stageReport(s, pending.stage, pending.match.id, result),
    userSeries: { ...s.userSeries, [seriesKey(pending.stage, pending.match.id)]: series },
  };
  delete next.veto;
  return advance(next);
}

export function seriesKey(stage: CompStage, matchId: string): string {
  return `${stage}:${matchId}`;
}

/** The stage and match behind a series key. */
export function findSeasonMatch(s: SeasonState, key: string): { stage: CompStage; match: SeasonMatch } | undefined {
  const i = key.indexOf(':');
  const stage = key.slice(0, i) as CompStage;
  if (!isCompStage(stage)) return undefined;
  const match = stageMatches(s, stage).find((m) => m.id === key.slice(i + 1));
  return match ? { stage, match } : undefined;
}

/** Lineup of any entrant. The user's card ids get a suffix so they never clash with an opponent's copy. */
export function lineupOf(s: SeasonState, id: string): Lineup {
  if (id === USER_ID) {
    const lineup = seasonLineup(s);
    return { ...lineup, players: lineup.players.map((p) => ({ ...p, card: { ...p.card, id: `${p.card.id}#user` } })) };
  }
  return realLineup(rosterByKey(id));
}

function userPlayers(s: SeasonState): Set<string> {
  return new Set(seasonLineup(s).players.map((p) => p.card.playerId));
}

export function seasonVetoScouting(s: SeasonState, opponentId: string): { level: number; hints: ScoutHint[] } {
  const level = s.draft?.coachId ? findCoach(seasonPool(s), s.draft.coachId)?.vetoBonus ?? 0 : 0;
  const affinity = lineupOf(s, opponentId).mapAffinity ?? {};
  const all = SEASON_MAP_POOL.map((map) => ({ map, value: affinity[map] ?? 0 })).sort((x, y) => y.value - x.value || (x.map < y.map ? -1 : 1));
  if (level <= 0) return { level, hints: [] };
  if (level >= 3) return { level, hints: all };
  return { level, hints: level === 1 ? [all[0]!] : [all[0]!, all[all.length - 1]!] };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export interface SeasonTeamInfo {
  id: string;
  name: string;
  /** "Champions 2022", or "Seu time". */
  subtitle: string;
  isUser: boolean;
  region: Region;
  strength: number;
  /** Seed in the current stage (0 before it starts). */
  seed: number;
}

function nameOf(s: SeasonState, id: string): string {
  if (id === USER_ID) return s.teamName ?? DEFAULT_TEAM_NAME;
  for (const stage of COMP_STAGES) {
    const e = stageEntrants(s, stage).find((x) => x.id === id);
    if (e) return e.name;
  }
  return rosterByKey(id).teamName;
}

function strengthOf(s: SeasonState, id: string): number {
  return id === USER_ID ? teamStrength(lineupOf(s, id)).total : aiStrength(rosterByKey(id));
}

function stageEntrants(s: SeasonState, stage: CompStage): Entrant[] {
  if (stage === 'league') return s.league?.entrants ?? [];
  if (stage === 'masters') return s.masters?.entrants ?? [];
  return s.champions?.entrants ?? [];
}

export function seasonTeamInfo(s: SeasonState, id: string): SeasonTeamInfo {
  const isUser = id === USER_ID;
  const entrant = isCompStage(s.stage) ? stageEntrants(s, s.stage).find((e) => e.id === id) : undefined;
  return {
    id,
    name: nameOf(s, id),
    subtitle: isUser ? 'Seu time' : rosterByKey(id).eventName,
    isUser,
    region: isUser ? s.region! : regionOf(rosterByKey(id)),
    strength: strengthOf(s, id),
    seed: entrant?.seed ?? 0,
  };
}

/** Team and event of an entrant, for its logo. */
export function seasonEntrantTeam(s: SeasonState, id: string): { teamId: string; eventId?: string; name: string } {
  const name = nameOf(s, id);
  if (id === USER_ID) return { teamId: USER_ID, name };
  const entry = rosterByKey(id);
  return { teamId: entry.teamId, eventId: entry.eventId, name };
}

export interface LeagueRow extends LeagueStanding {
  name: string;
  isUser: boolean;
}

export interface LeagueGroupView {
  group: LeagueGroup;
  rows: LeagueRow[];
  hasUser: boolean;
}

/** League tables: the user's group first. */
export function leagueViews(s: SeasonState): LeagueGroupView[] {
  const l = s.league;
  if (!l) return [];
  const table = leagueStandings(l).map((r): LeagueRow => ({ ...r, name: nameOf(s, r.id), isUser: r.id === USER_ID }));
  const views = LEAGUE_GROUPS.map((group): LeagueGroupView => {
    const rows = table.filter((r) => r.group === group);
    return { group, rows, hasUser: rows.some((r) => r.isUser) };
  });
  return [...views.filter((v) => v.hasUser), ...views.filter((v) => !v.hasUser)];
}

export interface LeagueCell {
  slot: LeagueSlot;
  match?: LMatch;
}

/** The league playoff skeleton with the matches created so far. */
export function leaguePlayoffCells(s: SeasonState): LeagueCell[] {
  const byId = new Map((s.league?.matches ?? []).filter((m) => m.stage === 'playoffs').map((m) => [m.id, m]));
  return LEAGUE_PLAYOFFS.map((slot) => {
    const match = byId.get(slot.id);
    return match ? { slot, match } : { slot };
  });
}

export function mastersCells(s: SeasonState): BracketCell[] {
  return s.masters ? bracketCells(s.masters) : [];
}

/** Champions group views (the user's group first), as in the main mode. */
export function championsGroupViews(s: SeasonState): GroupView[] {
  const t = s.champions;
  if (!t) return [];
  const byId = new Map(t.matches.map((m) => [m.id, m]));
  const table = groupStandings(t).map((r): StandingRow => ({ ...r, name: nameOf(s, r.id), isUser: r.id === USER_ID }));
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

export function championsBracket(s: SeasonState): RunBracketCell[] {
  const byId = new Map((s.champions?.matches ?? []).map((m) => [m.id, m]));
  return PLAYOFF_BRACKET.map((slot) => {
    const match = byId.get(slot.id);
    return match ? { slot, match } : { slot };
  });
}

export interface UserSeasonResult {
  key: string;
  stage: CompStage;
  match: SeasonMatch;
  won: boolean;
}

/** Every match the user played, in order (league, then Masters, then Champions). */
export function userSeasonResults(s: SeasonState): UserSeasonResult[] {
  return COMP_STAGES.flatMap((stage) =>
    stageMatches(s, stage)
      .filter((m) => involvesUser(m) && m.result)
      .map((match) => ({ key: seriesKey(stage, match.id), stage, match, won: userWon(match) })),
  );
}

export interface StageOutcome {
  stage: CompStage;
  wins: number;
  losses: number;
  /** Final place, once decided ("3º", "5º–6º"). */
  place?: string;
  /** Rank for the share text: 1 = champion. */
  rank?: number;
  /** Ongoing stage (the user still plays) or not started yet. */
  status: 'pending' | 'playing' | 'done';
}

/** Place of a team in the Champions once decided: champion, groups elimination or playoff round. */
export function championsPlaceOf(t: TournamentState, id: string): BracketPlace | undefined {
  if (t.champion === id) return { rank: 1, label: '1º', stage: 'champion' };
  const row = groupStandings(t).find((r) => r.id === id);
  if (row?.status === 'eliminated') {
    return row.place === 3 ? { rank: 9, label: '9º–12º', stage: 'playoffs' } : { rank: 13, label: '13º–16º', stage: 'playoffs' };
  }
  for (const m of t.matches) {
    if (!m.result || m.stage !== 'playoffs') continue;
    const loser = m.result.winner === 0 ? m.b : m.a;
    const place = loser === id ? BRACKET_LOSER_PLACES[m.round as PlayoffRound] : undefined;
    if (place) return place;
  }
  return undefined;
}

export function stageOutcome(s: SeasonState, stage: CompStage): StageOutcome {
  const matches = stageMatches(s, stage).filter(involvesUser);
  const wins = matches.filter((m) => m.result && userWon(m)).length;
  const losses = matches.filter((m) => m.result && !userWon(m)).length;
  const out: StageOutcome = { stage, wins, losses, status: 'pending' };
  const place =
    stage === 'league' && s.league ? leaguePlaceOf(s.league, USER_ID)
    : stage === 'masters' && s.masters ? bracketPlaceOf(s.masters, USER_ID)
    : stage === 'champions' && s.champions ? championsPlaceOf(s.champions, USER_ID)
    : undefined;
  if (place) {
    out.place = place.label;
    out.rank = place.rank;
  }
  const started = stage === 'league' ? !!s.league : stage === 'masters' ? !!s.masters : !!s.champions;
  out.status = !started ? 'pending' : stageDone(s, stage) || (s.stage === 'done' && stage === 'league') ? 'done' : 'playing';
  return out;
}

export interface SeasonSummary {
  region: Region;
  field: FieldMode;
  teamName: string;
  strength: number;
  /** Furthest competition stage the user entered. */
  reached: CompStage;
  champion: boolean;
  outcomes: StageOutcome[];
  mapsWon: number;
  mapsLost: number;
  championName?: string;
  mvp?: PlayerStat;
  /** "Americas → Liga 2º → Masters 3º → Champions 🏆". */
  path: string;
}

/** The furthest stage the user entered. */
export function reachedStage(s: SeasonState): CompStage {
  if (s.champions) return 'champions';
  if (s.masters) return 'masters';
  return 'league';
}

export function seasonPath(s: SeasonState): string {
  const parts = [REGION_LABELS[s.region ?? 'americas']];
  for (const stage of COMP_STAGES) {
    const o = stageOutcome(s, stage);
    if (o.status === 'pending') break;
    const tail = o.rank === 1 ? '🏆' : o.place ?? (o.status === 'playing' ? '…' : '');
    parts.push(`${STAGE_LABELS[stage]} ${tail}`.trim());
  }
  return parts.join(' → ');
}

export function seasonSummary(s: SeasonState): SeasonSummary {
  const outcomes = COMP_STAGES.map((stage) => stageOutcome(s, stage)).filter((o) => o.status !== 'pending');
  let mapsWon = 0;
  let mapsLost = 0;
  for (const r of userSeasonResults(s)) {
    const side = r.match.a === USER_ID ? 0 : 1;
    mapsWon += r.match.result!.score[side];
    mapsLost += r.match.result!.score[side === 0 ? 1 : 0];
  }
  const summary: SeasonSummary = {
    region: s.region ?? 'americas',
    field: s.field,
    teamName: s.teamName ?? DEFAULT_TEAM_NAME,
    strength: s.draft?.picks.length === 5 ? teamStrength(lineupOf(s, USER_ID)).total : 0,
    reached: reachedStage(s),
    champion: s.champions?.champion === USER_ID,
    outcomes,
    mapsWon,
    mapsLost,
    path: seasonPath(s),
  };
  const champion = s.champions?.champion;
  if (champion) summary.championName = nameOf(s, champion);
  const [mvp] = userSeasonPlayerStats(s);
  if (mvp) summary.mvp = mvp;
  return summary;
}

/** Aggregated stats of the user's players over every series of the season. */
export function userSeasonPlayerStats(s: SeasonState): PlayerStat[] {
  const totals = new Map<string, PlayerStat & { acsRounds: number; rounds: number }>();
  for (const [key, series] of Object.entries(s.userSeries)) {
    const found = findSeasonMatch(s, key);
    if (!found) continue;
    const side = found.match.a === USER_ID ? 0 : 1;
    for (const map of series.maps) {
      for (const line of map.players[side]) {
        const t = totals.get(line.handle) ?? { handle: line.handle, maps: 0, kills: 0, deaths: 0, assists: 0, acs: 0, acsRounds: 0, rounds: 0 };
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
    .map(({ acsRounds, rounds, ...p }) => ({ ...p, acs: rounds ? Math.round(acsRounds / rounds) : 0 }))
    .sort((x, y) => y.acs - x.acs || (x.handle < y.handle ? -1 : 1));
}

/** Spoiler-free result to share: the path through the season, no team or player names. */
export function seasonShareText(s: SeasonState): string {
  const sum = seasonSummary(s);
  const lines = [`Road to Champions · Complete Trials`, sum.path, `Força ${formatDecimal(sum.strength)} · campo ${FIELD_MODE_LABELS[sum.field]}`];
  for (const o of sum.outcomes) {
    const dots = userSeasonResults(s)
      .filter((r) => r.stage === o.stage)
      .map((r) => (r.won ? '🟩' : '🟥'))
      .join('');
    lines.push(`${STAGE_LABELS[o.stage]} ${o.wins}-${o.losses} ${dots}`.trim());
  }
  lines.push(`Mapas ${sum.mapsWon}-${sum.mapsLost}`);
  return lines.join('\n');
}

export interface RegionPreview {
  region: Region;
  label: string;
  /** Teams with the most rosters in the data, with their latest event (for the logo). */
  teams: { teamId: string; eventId: string; name: string }[];
  rosters: number;
  teamCount: number;
}

/** What the region screen shows: the best-represented teams of each region. */
export function regionPreview(region: Region, limit = 6): RegionPreview {
  const pool = regionPool(region);
  const count = new Map<string, number>();
  for (const e of pool) count.set(e.teamId, (count.get(e.teamId) ?? 0) + 1);
  const teams = [...count.entries()]
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, limit)
    .map(([teamId]) => {
      const latest = fieldRosterFor(teamId, 'current', pool)!;
      return { teamId, eventId: latest.eventId, name: latest.teamName };
    });
  return { region, label: REGION_LABELS[region], teams, rosters: pool.length, teamCount: count.size };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Validates a parsed save. Returns null for anything that is not a usable SeasonState. */
export function parseSeason(data: unknown): SeasonState | null {
  try {
    if (!data || typeof data !== 'object') return null;
    const s = data as SeasonState;
    if (s.version !== SEASON_VERSION || typeof s.seed !== 'string') return null;
    if (!FIELD_MODES.includes(s.field)) return null;
    if (!['region', 'draft', 'team', 'league', 'masters', 'champions', 'done'].includes(s.stage)) return null;
    if (!s.userSeries || typeof s.userSeries !== 'object') return null;
    if (s.stage === 'region') return s;
    if (!s.region || !REGIONS.includes(s.region)) return null;
    if (!s.draft || typeof s.draft !== 'object' || !Array.isArray(s.draft.picks)) return null;
    if (s.stage !== 'draft' && (s.draft.picks.length !== 5 || s.draft.phase !== 'done')) return null;
    if (s.draft.picks.length === 5) seasonLineup(s);
    if (s.stage === 'draft' || s.stage === 'team') return s;
    if (!s.league || !Array.isArray(s.league.matches) || s.league.entrants?.length !== LEAGUE_TEAMS) return null;
    if (s.masters && s.masters.entrants?.length !== MASTERS_TEAMS) return null;
    if (s.champions && s.champions.entrants?.length !== TEAM_COUNT) return null;
    if (s.stage === 'masters' && !s.masters) return null;
    if (s.stage === 'champions' && (!s.masters || !s.champions)) return null;
    for (const stage of COMP_STAGES) for (const e of stageEntrants(s, stage)) seasonTeamInfo(s, e.id);
    // Smoke-test the selectors the screens rely on.
    leagueViews(s);
    mastersCells(s);
    championsGroupViews(s);
    userPendingMatch(s);
    seasonSummary(s);
    return s;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function assertStage(s: SeasonState, stage: SeasonStage): void {
  if (s.stage !== stage) throw new Error(`Expected season stage "${stage}", season is in "${s.stage}"`);
}

function requireDraft(s: SeasonState): DraftState {
  if (!s.draft) throw new Error('The draft has not started');
  return s.draft;
}

function requirePending(s: SeasonState): PendingMatch {
  const pending = userPendingMatch(s);
  if (!pending) throw new Error('The user has no pending match');
  return pending;
}

const ROSTER_BY_KEY = new Map(ALL_ROSTERS.map((e) => [rosterKey(e), e]));

function rosterByKey(key: string): RosterEntry {
  const entry = ROSTER_BY_KEY.get(key);
  if (!entry) throw new Error(`Unknown roster "${key}"`);
  return entry;
}

function resolveOpponentTurns(s: SeasonState, pending: PendingMatch, start: VetoState): VetoState {
  const lineups: [Lineup, Lineup] = [lineupOf(s, pending.match.a), lineupOf(s, pending.match.b)];
  let state = start;
  for (let turn = nextTurn(state); turn && turn.team !== pending.side; turn = nextTurn(state)) {
    const rng = createRng(`${s.seed}:${pending.stage}:${pending.match.id}:veto:${state.steps.length}`);
    state = applyVeto(state, aiChooseMap(state, lineups, rng));
  }
  return state;
}

export { userOpponent, userWon, involvesUser };
export type { LeagueSlot, LMatch, Region };
