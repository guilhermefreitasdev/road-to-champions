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
import { ALL_ROSTERS, REAL_MAP_POOL, REAL_META, realLineup, teamRegion } from '../data/real';
import { familiarityOf, recordMapsPlayed, type MapsPlayed } from '../engine/familiarity';
import { applyTournamentForm, prodigyGrowth } from '../engine/form';
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
import { findCard, findCoach, rosterKey, shuffled } from '../engine/roster';
import { simulateSeries, type SeriesResult } from '../engine/series';
import { cardFit, teamStrength } from '../engine/team';
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
import { compactSeries, type CompactSeries } from './boxscore';
import { LEAGUE_PRIZE, MARKET_MAX_SIGNINGS, MARKET_START_BUDGET, MARKET_TIERS, MASTERS_PRIZE, playerValue, saleValue } from './market';
import { DEFAULT_DIFFICULTY, DIFFICULTY_SETTINGS, aiAdjust, difficultySettings, isDifficulty, scoutingLevel, type Difficulty } from './difficulty';
import {
  AGENT_ROLES,
  DEFAULT_TEAM_NAME,
  USER_ID,
  cleanTeamName,
  involvesUser,
  userOpponent,
  userWon,
  withFamiliarity,
  type BracketCell as RunBracketCell,
  type GroupView,
  type MapFamiliarity,
  type PlayerStat,
  type ScoutHint,
  type StandingRow,
} from './run';

export { USER_ID } from './run';
export {
  LEAGUE_PRIZE,
  MARKET_AURA_PREMIUM,
  MARKET_IGL_PREMIUM,
  MARKET_MAX_SIGNINGS,
  MARKET_MIN_PRICE,
  MARKET_PRICE_BASE,
  MARKET_PRICE_DOUBLING,
  MARKET_SALE_SHARE,
  MARKET_START_BUDGET,
  MARKET_TIERS,
  MASTERS_PRIZE,
  playerValue,
  saleValue,
} from './market';

/**
 * v4 = difficulty, box scores of every series (`boxScores`) and the free-agency market (stage 'market', `market`,
 * `funds`, `transfers`); v3 = agents per map in the map results, agent and familiarity edges, `mapsPlayed` in the state; v2 = Modelo v3
 * (per-player form, multikills and MVP in the map results, aura on the cards).
 */
export const SEASON_VERSION = 4;
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

export type SeasonStage = 'region' | 'draft' | 'team' | 'league' | 'market' | 'masters' | 'champions' | 'done';
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
  /** Maps every entrant played so far in the season, across stages (map familiarity, src/engine/familiarity.ts). */
  mapsPlayed: MapsPlayed;
  /** Difficulty of the season (src/game/difficulty.ts). */
  difficulty: Difficulty;
  /** Compact box score of every series played (AI vs AI included), keyed like userSeries (src/game/boxscore.ts). */
  boxScores: Record<string, CompactSeries>;
  /** Free-agency window in progress (stage 'market'). */
  market?: MarketState;
  /** Money kept between market windows (set when a window closes). */
  funds?: number;
  /** Every signing of the season, in order. */
  transfers?: Transfer[];
}

export type MarketWindow = 'post-league' | 'post-masters';

export interface MarketSigning {
  /** Card signed. */
  in: string;
  /** Card released (its slot goes to the new card). */
  out: string;
  /** Price paid. */
  price: number;
  /** Credit for the released player (MARKET_SALE_SHARE of his value). */
  sale: number;
}

export interface Transfer extends MarketSigning {
  window: MarketWindow;
}

export interface MarketState {
  window: MarketWindow;
  /** Money available now (in US$ thousand): funds carried + the prize of the stage just played ± signings. */
  budget: number;
  /** Card ids on offer (most expensive first). */
  offers: string[];
  signed: MarketSigning[];
  maxSignings: number;
  /** Prize money credited when the window opened (placement in the stage just played). */
  prize: number;
  /** Entrant ids of the next stage (the user included), fixed when the window opens. */
  nextField: string[];
}

export interface MarketOffer {
  card: Card;
  teamName: string;
  eventName: string;
  price: number;
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

/**
 * A new season. `createSeason(seed, difficulty?, field?)`; the older `createSeason(seed, field)` still works (the
 * two value sets are disjoint).
 */
export function createSeason(seed: string, difficulty?: Difficulty | FieldMode, field?: FieldMode): SeasonState {
  let level: Difficulty = DEFAULT_DIFFICULTY;
  let mode: FieldMode = field ?? 'current';
  if (difficulty !== undefined) {
    if (isDifficulty(difficulty)) level = difficulty;
    else if (FIELD_MODES.includes(difficulty)) mode = field ?? difficulty;
    else throw new Error(`Unknown difficulty "${String(difficulty)}"`);
  }
  if (!FIELD_MODES.includes(mode)) throw new Error(`Unknown field mode "${mode}"`);
  return { version: SEASON_VERSION, seed, stage: 'region', field: mode, userSeries: {}, mapsPlayed: {}, difficulty: level, boxScores: {} };
}

/** Picks the server. The draft then rolls only rosters of that region. */
export function chooseRegion(s: SeasonState, region: Region, field: FieldMode = s.field): SeasonState {
  assertStage(s, 'region');
  if (!REGIONS.includes(region)) throw new Error(`Unknown region "${region}"`);
  if (!FIELD_MODES.includes(field)) throw new Error(`Unknown field mode "${field}"`);
  const pool = regionPool(region);
  if (pool.length === 0) throw new Error(`No rosters for region "${region}"`);
  const draft = createDraft(pool, 'classic', `${s.seed}:${region}`, DIFFICULTY_SETTINGS[s.difficulty].rerolls);
  return { ...s, stage: 'draft', region, field, draft };
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
    // The user's strength as seasonTeamInfo shows it (tournament form included), as in the main mode.
    { id: USER_ID, name, strength: teamStrength(lineupOf({ ...s, teamName: name }, USER_ID)).total },
    ...opponents.map((e) => ({ id: rosterKey(e), name: entrantName(e, s.field), strength: aiStrength(e) + aiBonus(s) })),
  ]);
  return advance({ ...s, stage: 'league', teamName: name, league: createLeague(entrants) });
}

/** The difficulty's AI strength bonus (seeds and shown strength of the AI teams; the user's matches). */
const aiBonus = (s: Pick<SeasonState, 'difficulty'>): number => difficultySettings(s.difficulty).aiBonus;

/**
 * Masters entrants: the league's top 3 (the user among them) + 5 teams of the other regions: 2 from each of two
 * regions and 1 from the third (which one gets 1 is drawn), each region sending the strongest of a draw of twice as many.
 */
function mastersFieldIds(s: SeasonState): string[] {
  const home = mastersQualified(s.league!);
  const others = shuffled(REGIONS.filter((r) => r !== s.region), createRng(`${s.seed}:masters:regions`));
  const slots = [2, 2, 1];
  const exclude = userPlayers(s);
  const away = others.flatMap((region, i) => drawStrongest(fieldCandidates(region, s.field), slots[i]!, `${s.seed}:masters:${region}`, exclude));
  return [...home, ...away.map(rosterKey)];
}

/** Builds the Masters from its entrant ids (fixed when the market window opened), seeded by strength. */
function startMasters(s: SeasonState, ids: readonly string[] = mastersFieldIds(s)): SeasonState {
  const entrants = seedByStrength(ids.map((id) => ({ id, name: nameOf(s, id), strength: strengthOf(s, id) })));
  return { ...s, stage: 'masters', masters: createBracket(entrants), mapsPlayed: withLeagueBaseline(s, entrants.map((e) => e.id)) };
}

/**
 * Teams from other regions enter the Masters and the Champions without a single map in this season, while the
 * user's league has been playing for weeks. They played their own leagues too, so each newcomer starts with the
 * league's median maps per map (the AI teams of the user's league), keeping map familiarity symmetric.
 */
function withLeagueBaseline(s: SeasonState, ids: readonly string[]): MapsPlayed {
  const league = (s.league?.entrants ?? []).filter((e) => e.id !== USER_ID).map((e) => s.mapsPlayed[e.id] ?? {});
  if (league.length === 0) return s.mapsPlayed;
  const baseline: Partial<Record<MapName, number>> = {};
  for (const map of SEASON_MAP_POOL) {
    const counts = league.map((row) => row[map] ?? 0).sort((a, b) => a - b);
    const median = counts[Math.floor((counts.length - 1) / 2)]!;
    if (median > 0) baseline[map] = median;
  }
  const out: Record<string, Partial<Record<MapName, number>>> = { ...s.mapsPlayed };
  for (const id of ids) if (!out[id]) out[id] = { ...baseline };
  return out;
}

/**
 * Champions: 4 teams per region. The user's region sends the league's top 4; every other region sends its Masters
 * teams plus draws (distinct teams) to fill 4. Seeded by strength into the main mode's format.
 */
function championsFieldIds(s: SeasonState): string[] {
  const league = s.league!;
  const masters = s.masters!;
  const exclude = userPlayers(s);
  const regionOfId = (id: string) => regionOf(rosterByKey(id));
  const entries: { id: string }[] = [];

  const homeIds = league.entrants
    .map((e) => ({ id: e.id, rank: leaguePlaceOf(league, e.id)?.rank ?? 99, seed: e.seed }))
    .sort((x, y) => x.rank - y.rank || x.seed - y.seed)
    .slice(0, CHAMPIONS_PER_REGION)
    .map((e) => e.id);
  for (const id of homeIds) entries.push({ id });

  for (const region of REGIONS) {
    if (region === s.region) continue;
    const fromMasters = bracketRanking(masters).filter((id) => id !== USER_ID && regionOfId(id) === region);
    const taken = new Set(fromMasters.map((id) => rosterByKey(id).teamId));
    const draws = drawRosters(fieldCandidates(region, s.field), CHAMPIONS_PER_REGION - fromMasters.length, `${s.seed}:champions:${region}`, exclude, taken);
    for (const id of fromMasters) entries.push({ id });
    for (const e of draws) entries.push({ id: rosterKey(e) });
  }
  if (entries.length !== TEAM_COUNT) throw new Error(`Champions field has ${entries.length} teams, needs ${TEAM_COUNT}`);
  return entries.map((e) => e.id);
}

/** Builds the Champions from its entrant ids (fixed when the market window opened), seeded by strength. */
function startChampions(s: SeasonState, ids: readonly string[] = championsFieldIds(s)): SeasonState {
  const entries = ids.map((id) => ({ id, name: nameOf(s, id), strength: strengthOf(s, id) }));
  return { ...s, stage: 'champions', champions: createTournament(seedByStrength(entries)), mapsPlayed: withLeagueBaseline(s, ids) };
}

function seedByStrength(teams: { id: string; name: string; strength: number }[]): Entrant[] {
  return [...teams]
    .sort((x, y) => y.strength - x.strength || (x.id < y.id ? -1 : 1))
    .map((t, i) => ({ id: t.id, name: t.name, seed: i + 1 }));
}

// ---------------------------------------------------------------------------
// Free agency (docs/design.md, "Mercado de transferências")
// ---------------------------------------------------------------------------

/** Prize money of the stage that just ended, by the user's place in it. */
export function marketPrize(s: SeasonState, window: MarketWindow): number {
  if (window === 'post-league') return LEAGUE_PRIZE[s.league ? leaguePlaceOf(s.league, USER_ID)?.rank ?? 0 : 0] ?? 0;
  return MASTERS_PRIZE[s.masters ? bracketPlaceOf(s.masters, USER_ID)?.rank ?? 0 : 0] ?? 0;
}

const ovrQuantiles = new Map<Region, { p50: number; p90: number }>();
function regionQuantiles(region: Region): { p50: number; p90: number } {
  let q = ovrQuantiles.get(region);
  if (!q) {
    const ovr = regionPool(region).flatMap((e) => e.cards.map((c) => c.ovr)).sort((a, b) => a - b);
    q = { p50: ovr[Math.floor(0.5 * (ovr.length - 1))]!, p90: ovr[Math.floor(0.9 * (ovr.length - 1))]! };
    ovrQuantiles.set(region, q);
  }
  return q;
}

/**
 * The window's offers, deterministic from the seed: cards of the user's region (every era, like the draft), one per
 * player, never a player of the user's lineup or of the next stage's field. Tier quotas MARKET_TIERS; one value
 * slot goes to an IGL when the draw has one. Most expensive first.
 */
function drawOffers(s: SeasonState, window: MarketWindow, nextField: readonly string[]): string[] {
  const pool = seasonPool(s);
  const banned = new Set(userPlayers(s));
  for (const id of nextField) if (id !== USER_ID) for (const c of rosterByKey(id).cards) banned.add(c.playerId);
  const { p50, p90 } = regionQuantiles(s.region!);
  const tierOf = (c: Card): keyof typeof MARKET_TIERS => (c.ovr >= p90 ? 'star' : c.ovr >= p50 ? 'mid' : 'value');
  const quota: Record<keyof typeof MARKET_TIERS, number> = { ...MARKET_TIERS };
  const cards = shuffled(pool.flatMap((e) => e.cards), createRng(`${s.seed}:market:${window}`));
  const out: Card[] = [];
  const take = (c: Card) => {
    out.push(c);
    banned.add(c.playerId);
    quota[tierOf(c)]--;
  };
  const igl = cards.find((c) => c.isIGL && tierOf(c) === 'value' && !banned.has(c.playerId));
  if (igl) take(igl);
  for (const c of cards) {
    if (banned.has(c.playerId) || quota[tierOf(c)] <= 0) continue;
    take(c);
  }
  return out.sort((x, y) => playerValue(y) - playerValue(x) || y.ovr - x.ovr || x.id.localeCompare(y.id)).map((c) => c.id);
}

/** Opens a market window after the league or the Masters: the next stage's field is fixed now. */
function openMarket(s: SeasonState, window: MarketWindow): SeasonState {
  const nextField = window === 'post-league' ? mastersFieldIds(s) : championsFieldIds(s);
  const prize = marketPrize(s, window);
  const market: MarketState = {
    window,
    budget: (s.funds ?? MARKET_START_BUDGET) + prize,
    offers: drawOffers(s, window, nextField),
    signed: [],
    maxSignings: MARKET_MAX_SIGNINGS,
    prize,
    nextField,
  };
  return { ...s, stage: 'market', market };
}

function requireMarket(s: SeasonState): MarketState {
  if (s.stage !== 'market' || !s.market) throw new Error('No market window is open');
  return s.market;
}

/** The offers still available in the open window (signed ones leave the list), most expensive first. */
export function marketOffers(s: SeasonState): MarketOffer[] {
  const m = requireMarket(s);
  const pool = seasonPool(s);
  const signed = new Set(m.signed.map((x) => x.in));
  return m.offers
    .filter((id) => !signed.has(id))
    .map((id) => {
      const card = findCard(pool, id);
      if (!card) throw new Error(`Unknown card "${id}"`);
      const entry = pool.find((e) => e.teamId === card.teamId && e.eventId === card.eventId)!;
      return { card, teamName: entry.teamName, eventName: entry.eventName, price: playerValue(card) };
    });
}

const baseId = (cardId: string): string => cardId.replace(/#user$/, '');

/** Checks a signing and returns the new draft picks and money; throws with the reason when it is not allowed. */
function planSigning(s: SeasonState, cardId: string, replaceCardId: string) {
  const m = requireMarket(s);
  const pool = seasonPool(s);
  if (!m.offers.includes(cardId)) throw new Error(`Card "${cardId}" is not on offer`);
  if (m.signed.some((x) => x.in === cardId)) throw new Error(`Card "${cardId}" was already signed`);
  if (m.signed.length >= m.maxSignings) throw new Error(`Only ${m.maxSignings} signings per window`);
  const draft = requireDraft(s);
  const out = baseId(replaceCardId);
  const index = draft.picks.findIndex((p) => p.cardId === out);
  if (index < 0) throw new Error(`Card "${replaceCardId}" is not in the lineup`);
  const card = findCard(pool, cardId)!;
  const released = findCard(pool, out)!;
  const others = draft.picks.filter((_, i) => i !== index).map((p) => findCard(pool, p.cardId)?.playerId);
  if (others.includes(card.playerId)) throw new Error(`Player "${card.handle}" is already in the lineup`);
  const price = playerValue(card);
  const sale = saleValue(released);
  if (m.budget + sale < price) throw new Error(`Not enough budget: ${m.budget} + ${sale} < ${price}`);
  const picks = draft.picks.map((p, i) => (i === index ? { cardId, slot: p.slot } : p));
  return { m, draft, picks, slot: draft.picks[index]!.slot, card, released, price, sale };
}

/**
 * Signs `cardId` in place of `replaceCardId` (same slot). Validates the window, the offer, MARKET_MAX_SIGNINGS,
 * duplicate players and the budget; the released player's sale value (MARKET_SALE_SHARE) is credited first.
 */
export function signFreeAgent(s: SeasonState, cardId: string, replaceCardId: string): SeasonState {
  const { m, draft, picks, price, sale } = planSigning(s, cardId, replaceCardId);
  const out = baseId(replaceCardId);
  return {
    ...s,
    draft: { ...draft, picks },
    market: { ...m, budget: m.budget + sale - price, signed: [...m.signed, { in: cardId, out, price, sale }] },
  };
}

export interface SigningPreview {
  slot: Slot;
  /** cardFit of the new card in that slot (1, 0.9 flex, 0.75 off-role; natural flexes 1). */
  fit: number;
  price: number;
  sale: number;
  /** Budget after the signing. */
  budgetAfter: number;
  /** Team strength now and with the signing (the next stage's tournament form included). */
  strengthBefore: number;
  strengthAfter: number;
  /** null when allowed, else the reason (pt-BR). */
  blocked: string | null;
}

/** What a signing would do, for the market screen (never throws for a listed offer and a lineup card). */
export function signingPreview(s: SeasonState, cardId: string, replaceCardId: string): SigningPreview {
  const m = requireMarket(s);
  const pool = seasonPool(s);
  const card = findCard(pool, cardId);
  const out = baseId(replaceCardId);
  const pick = requireDraft(s).picks.find((p) => p.cardId === out);
  if (!card || !pick) throw new Error('Unknown card');
  const price = playerValue(card);
  const sale = saleValue(findCard(pool, out)!);
  const before = teamStrength(userLineup(s)).total;
  let blocked: string | null = null;
  let after = before;
  try {
    after = teamStrength(userLineup(signFreeAgent(s, cardId, replaceCardId))).total;
  } catch (e) {
    const msg = (e as Error).message;
    blocked = msg.startsWith('Not enough budget') ? 'Orçamento insuficiente'
      : msg.startsWith('Only') ? `Limite de ${m.maxSignings} contratações nesta janela`
      : msg.includes('already in the lineup') ? 'Jogador já está no elenco'
      : msg.includes('already signed') ? 'Já contratado'
      : 'Contratação indisponível';
  }
  return { slot: pick.slot, fit: cardFit(card, pick.slot), price, sale, budgetAfter: m.budget + sale - price, strengthBefore: before, strengthAfter: after, blocked };
}

/** Closes the window: keeps the money for the next one and starts the next stage with the field fixed at opening. */
export function closeMarket(s: SeasonState): SeasonState {
  const m = requireMarket(s);
  const next: SeasonState = { ...s, funds: m.budget, transfers: [...(s.transfers ?? []), ...m.signed.map((x) => ({ ...x, window: m.window }))] };
  delete next.market;
  return advance(m.window === 'post-league' ? startMasters(next, m.nextField) : startChampions(next, m.nextField));
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

/** Reports a played series: the stage's result and both teams' maps played (map familiarity). */
function stageReport(s: SeasonState, stage: CompStage, match: SeasonMatch, played: { series: SeriesResult; result: LeagueResult }): SeasonState {
  const { result } = played;
  const mapsPlayed = recordMapsPlayed(s.mapsPlayed, [match.a, match.b], played.series.maps.map((m) => m.map));
  const boxScores = { ...s.boxScores, [seriesKey(stage, match.id)]: compactSeries(played.series, match.a, match.b) };
  if (stage === 'league') return { ...s, mapsPlayed, boxScores, league: reportLeagueResult(s.league!, match.id, result) };
  if (stage === 'masters') return { ...s, mapsPlayed, boxScores, masters: reportBracketResult(s.masters!, match.id, result) };
  return { ...s, mapsPlayed, boxScores, champions: reportResult(s.champions!, match.id, result) };
}

/** Runs a series and turns it into a result with map and round totals. */
function playSeries(s: SeasonState, stage: CompStage, match: SeasonMatch, veto?: VetoState): { series: SeriesResult; result: LeagueResult } {
  const opts: Parameters<typeof simulateSeries>[3] = {
    bestOf: match.bestOf,
    pool: SEASON_MAP_POOL,
    formSeed: `${s.seed}:${stage}:${match.id}`,
    familiarity: [familiarityOf(s.mapsPlayed, match.a), familiarityOf(s.mapsPlayed, match.b)],
    agentRoles: AGENT_ROLES,
  };
  if (REAL_META) opts.meta = REAL_META;
  if (veto) opts.veto = veto;
  const adjust = aiAdjust(match.a, match.b, USER_ID, s.difficulty);
  if (adjust) opts.adjust = adjust;
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
      cur = stageReport(cur, stage, next, playSeries(cur, stage, next));
    }
    if (!stageDone(cur, stage)) return cur;
    if (stage === 'league') {
      if (!mastersQualified(cur.league!).includes(USER_ID)) return { ...cur, stage: 'done', eliminatedAt: 'league' };
      return openMarket(cur, 'post-league');
    } else if (stage === 'masters') {
      return openMarket(cur, 'post-masters');
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
  const played = playSeries(s, pending.stage, pending.match, veto.state);
  const { series } = played;
  const next: SeasonState = {
    ...stageReport(s, pending.stage, pending.match, played),
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

/**
 * Lineup of any entrant in the current stage: cards shifted by their tournament form (one draw per stage,
 * src/engine/form.ts) and, for the user's prodigies, by the growth of the stages reached. The user's card ids
 * get a suffix so they never clash with an opponent's copy.
 */
export function lineupOf(s: SeasonState, id: string): Lineup {
  const formSeed = stageFormSeed(s, formStage(s));
  if (id === USER_ID) {
    const lineup = seasonLineup(s);
    const suffixed = { ...lineup, players: lineup.players.map((p) => ({ ...p, card: { ...p.card, id: `${p.card.id}#user` } })) };
    return applyTournamentForm(suffixed, formSeed, prodigyGrowth(userStagesReached(s)));
  }
  return applyTournamentForm(realLineup(rosterByKey(id)), formSeed);
}

/** The user's lineup as the Team screen shows it (same cards and form as lineupOf, without the id suffix). */
export function userLineup(s: SeasonState): Lineup {
  return applyTournamentForm(seasonLineup(s), stageFormSeed(s, formStage(s)), prodigyGrowth(userStagesReached(s)));
}

/** Seed base of a stage's tournament form (applyTournamentForm). */
export function stageFormSeed(s: Pick<SeasonState, 'seed'>, stage: CompStage): string {
  return `${s.seed}:${stage}:form`;
}

/**
 * Stage whose tournament form applies now ('league' before the league starts and after the run ends in it; in a
 * market window, the stage it leads to).
 */
export function formStage(s: SeasonState): CompStage {
  if (isCompStage(s.stage)) return s.stage;
  if (s.stage === 'market') return s.market?.window === 'post-masters' ? 'champions' : 'masters';
  if (s.stage === 'done') return s.champions ? 'champions' : s.masters ? 'masters' : 'league';
  return 'league';
}

/**
 * Stages the user reached in this season (prodigy growth): 0 league groups, 1 league playoffs, 2 Masters,
 * 3 Champions, 4 Champions playoffs.
 */
export function userStagesReached(s: SeasonState): number {
  if (s.stage === 'market') return s.market?.window === 'post-masters' ? 3 : 2;
  if (s.champions) return s.champions.matches.some((m) => involvesUser(m) && m.stage === 'playoffs') ? 4 : 3;
  if (s.masters) return 2;
  return s.league?.matches.some((m) => involvesUser(m) && m.stage === 'playoffs') ? 1 : 0;
}

function userPlayers(s: SeasonState): Set<string> {
  return new Set(seasonLineup(s).players.map((p) => p.card.playerId));
}

/** Lineup the AI vetoes with: lineupOf plus the team's map familiarity in this season added to its map comfort. */
export function seasonVetoLineup(s: SeasonState, id: string): Lineup {
  return withFamiliarity(lineupOf(s, id), familiarityOf(s.mapsPlayed, id));
}

/** A team's familiarity with every map of the veto pool (pool order), across the season's stages. */
export function seasonMapFamiliarity(s: Pick<SeasonState, 'mapsPlayed'>, teamId: string): MapFamiliarity[] {
  const points = familiarityOf(s.mapsPlayed, teamId);
  return SEASON_MAP_POOL.map((map) => ({ map, played: s.mapsPlayed?.[teamId]?.[map] ?? 0, points: points[map] ?? 0 }));
}

/** Scouting of the opponent's veto preferences: map comfort plus the familiarity it gained this season. */
export function seasonVetoScouting(s: SeasonState, opponentId: string): { level: number; hints: ScoutHint[] } {
  const level = scoutingLevel(s.draft?.coachId ? findCoach(seasonPool(s), s.draft.coachId)?.vetoBonus ?? 0 : 0, s.difficulty);
  const affinity = seasonVetoLineup(s, opponentId).mapAffinity ?? {};
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
  return entrantName(rosterByKey(id), s.field);
}

/** Strength as seeded and shown: the user's lineup as it plays now; an AI roster plus the difficulty's bonus. */
function strengthOf(s: SeasonState, id: string): number {
  return id === USER_ID ? teamStrength(lineupOf(s, id)).total : aiStrength(rosterByKey(id)) + aiBonus(s);
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
    if (!['region', 'draft', 'team', 'league', 'market', 'masters', 'champions', 'done'].includes(s.stage)) return null;
    if (!s.userSeries || typeof s.userSeries !== 'object') return null;
    if (!s.mapsPlayed || typeof s.mapsPlayed !== 'object') return null;
    if (!isDifficulty(s.difficulty)) return null;
    if (!s.boxScores || typeof s.boxScores !== 'object') return null;
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
    if (s.stage === 'market') {
      const m = s.market;
      if (!m || !Array.isArray(m.offers) || !Array.isArray(m.signed) || !Array.isArray(m.nextField) || typeof m.budget !== 'number') return null;
      if (m.window === 'post-masters' ? !s.masters : m.window !== 'post-league') return null;
      for (const id of m.nextField) if (id !== USER_ID) rosterByKey(id);
      marketOffers(s);
    }
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
  const lineups: [Lineup, Lineup] = [seasonVetoLineup(s, pending.match.a), seasonVetoLineup(s, pending.match.b)];
  let state = start;
  for (let turn = nextTurn(state); turn && turn.team !== pending.side; turn = nextTurn(state)) {
    const rng = createRng(`${s.seed}:${pending.stage}:${pending.match.id}:veto:${state.steps.length}`);
    state = applyVeto(state, aiChooseMap(state, lineups, rng, difficultySettings(s.difficulty).vetoNoise));
  }
  return state;
}

export { userOpponent, userWon, involvesUser };
export type { LeagueSlot, LMatch, Region };
