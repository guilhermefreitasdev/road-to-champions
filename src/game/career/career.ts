/**
 * Career mode ("Modo Carreira", docs/design.md): found an org in a region, sign real players, run the finances,
 * sponsors and academy, and play season after season: off-season (contracts, market, sponsors, academy, coach) →
 * regional league (12 teams, src/engine/league.ts) → mid-season window → Masters (8, src/engine/bracket.ts) →
 * Champions (16, src/engine/tournament.ts) → season report. The year advances every season (2026, 2027, …).
 *
 * CareerState is plain JSON and never mutated; every action returns a new state. Everything is deterministic from
 * the seed plus the user's actions (no Math.random). AI-vs-AI matches play in schedule order until the user's next
 * match, as in season.ts; a stage the user is not in plays out on its own.
 *
 * The world: the league's 11 AI teams are the region's current rosters (src/game/career/world.ts) and evolve every
 * off-season (aging, retirements, a swap now and then); the other regions' current rosters age the same way but never
 * change players. Free agents are every other real player (his latest card), frozen while unsigned.
 */
import { REAL_MAP_POOL, REAL_META, realLineup } from '../../data/real';
import { bracketPending, bracketPlaceOf, bracketRanking, createBracket, reportBracketResult, type BracketState } from '../../engine/bracket';
import { SLOTS } from '../../engine/draft';
import { familiarityOf, recordMapsPlayed, type MapsPlayed } from '../../engine/familiarity';
import { applyTournamentForm } from '../../engine/form';
import {
  LEAGUE_TEAMS,
  createLeague,
  leaguePending,
  leaguePlaceOf,
  mastersQualified,
  reportLeagueResult,
  type LMatch,
  type LeagueResult,
  type LeagueState,
} from '../../engine/league';
import { createRng } from '../../engine/rng';
import { findCoach, rosterKey, shuffled } from '../../engine/roster';
import { simulateSeries, type SeriesResult } from '../../engine/series';
import { cardFit, teamStrength } from '../../engine/team';
import { TEAM_COUNT, createTournament, pendingMatches, reportResult, type Entrant, type TMatch, type TournamentState } from '../../engine/tournament';
import { REGIONS, type Card, type Coach, type Lineup, type LineupPlayer, type MapName, type Region, type Slot, type TeamIndex } from '../../engine/types';
import { aiChooseMap, applyVeto, createVeto, isVetoComplete, nextTurn, type VetoState } from '../../engine/veto';
import { ALL_ROSTERS } from '../../data/real';
import { compactSeries, type CompactSeries } from '../boxscore';
import { DEFAULT_DIFFICULTY, aiAdjust, difficultySettings, isDifficulty, type Difficulty } from '../difficulty';
import { playerValue, round5 } from '../market';
import { AGENT_ROLES, USER_ID, cleanTeamName, involvesUser, withFamiliarity } from '../run';
import { championsPlaceOf } from '../season';
import { statRows, type StatRow } from '../stats';
import {
  ACADEMY_CONTRACT_YEARS,
  ACADEMY_SALARY,
  AI_SWAP_CHANCE,
  AI_SWAP_MIN_GAIN,
  BANKRUPTCY_FLOOR,
  CAREER_CHAMPIONS_PRIZE,
  CAREER_DIFFICULTY,
  CAREER_LEAGUE_PRIZE,
  CAREER_MASTERS_PRIZE,
  CAREER_VERSION,
  COACH_OFFERS,
  COACH_REP_PER_POINT,
  COACH_SALARY_BASE,
  COACH_SALARY_PER_POINT,
  CONTRACT_YEARS_MAX,
  CONTRACT_YEARS_MIN,
  CREDIT_LIMIT,
  DEFAULT_CONTRACT_YEARS,
  EVENT_HIGH_RATING,
  EVENT_TOP3_MIN_MAPS,
  FEE_SHARE,
  IMPORT_SALARY,
  MAX_ACADEMY,
  MAX_BENCH,
  MIDSEASON_MAX_SIGNINGS,
  MIDSEASON_OFFERS,
  MIDSEASON_SALARY_SHARE,
  MORALE_BENCHED,
  MORALE_BOOST,
  MORALE_LEAGUE_BAD,
  MORALE_LEAGUE_GOOD,
  MORALE_PLAYED,
  MORALE_RESET,
  MORALE_SCRIM_LOSS,
  MORALE_SCRIM_MVP,
  MORALE_SCRIM_WIN,
  MORALE_SLUMP,
  MORALE_START,
  MORALE_TITLE,
  OFFSEASON_OFFERS,
  ORG_TAG_MAX,
  ORG_TAG_MIN,
  PROSPECT_MAX_EXP,
  PROSPECT_MAX_OVR,
  PROSPECT_OFFERS,
  RANKING_MIN_MAPS,
  RENEW_MIN_MORALE,
  RENEW_REP_SLACK,
  REP_CHAMPIONS,
  REP_CHAMPIONS_ENTRY,
  REP_DRIFT,
  REP_LEAGUE,
  REP_MASTERS,
  REP_MASTERS_ENTRY,
  REP_SEASON_MVP,
  REP_SPONSOR_FAIL,
  RETIRE_EXPERIENCE,
  ROLE_ORDER,
  SALARY_MIN,
  SALARY_SHARE,
  SALE_SHARE,
  SCRIMS_PER_STAGE,
  SIGN_REP_IMPORT,
  SIGN_REP_OVR,
  SIGN_REP_PER_OVR,
  SPONSOR_BONUS,
  SPONSOR_NAMES,
  SPONSOR_OFFERS,
  SPONSOR_SLOTS,
  SPONSOR_SPREAD,
  SPONSOR_TIERS,
  STARTERS,
  TRAINING_FOCUS_SLOTS,
  type SponsorObjective,
} from './constants';
import {
  CAREER_START_YEAR,
  NO_FACTS,
  PLAYERS,
  agingRng,
  agingStep,
  cardAt,
  cardById,
  careerAura,
  currentTeamsOf,
  experience,
  otherRegionsPlayers,
  playerInfo,
  potentialOf,
  rosterByKey,
  sceneShift,
  worldOvr,
  type AgingPart,
  type CareerFacts,
} from './world';

export { USER_ID } from '../run';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type CareerPhase = 'offseason' | 'league' | 'midseason' | 'masters' | 'champions' | 'report' | 'over';
export type CareerStage = 'league' | 'masters' | 'champions';
export const CAREER_STAGES: readonly CareerStage[] = ['league', 'masters', 'champions'];
export const CAREER_STAGE_LABELS: Record<CareerStage, string> = { league: 'Liga', masters: 'Masters', champions: 'Champions' };
export const CAREER_PHASE_TEXT: Record<CareerPhase, string> = {
  offseason: 'Pré-temporada',
  league: 'Liga regional',
  midseason: 'Janela do meio da temporada',
  masters: 'Masters',
  champions: 'Champions',
  report: 'Fim da temporada',
  over: 'Carreira encerrada',
};

export type PlayerStatus = 'starter' | 'bench' | 'academy';
export type OfferKind = 'team' | 'free' | 'import';
export const OFFER_KIND_LABELS: Record<OfferKind, string> = { team: 'Multa rescisória', free: 'Agente livre', import: 'Importação' };

export interface Contract {
  /** Per season, US$ thousand. */
  salary: number;
  /** Seasons left, the current one included; 0 = expired (leaves when the next season starts unless renewed). */
  years: number;
}

/** One season of a player in the org. */
export interface PlayerSeasonLine {
  year: number;
  status: PlayerStatus;
  /** OVR during the season. */
  ovr: number;
  /** Competitive maps (league, Masters, Champions) and the share of the team's maps. */
  maps: number;
  share: number;
  rating: number;
  acs: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Series MVPs. */
  mvps: number;
  /** Played half of the team's maps at a Masters or Champions. */
  international: boolean;
}

/** The last off-season's progression of a player (for "+3 OVR" and its explanation). */
export interface Progress {
  year: number;
  from: number;
  to: number;
  parts: AgingPart[];
}

export interface CareerPlayer {
  /** The real player id (one card per player in the org). */
  id: string;
  /** The card he plays with (attributes shifted to `ovr`). */
  cardId: string;
  ovr: number;
  potential: number;
  status: PlayerStatus;
  /** Starters only. */
  slot?: Slot;
  /** 0–100. */
  morale: number;
  contract: Contract;
  /** Facts earned in the career (aura). */
  facts: CareerFacts;
  joined: { year: number; fee: number; from: OfferKind | 'academy' };
  import?: boolean;
  focus?: boolean;
  history: PlayerSeasonLine[];
  progress?: Progress;
}

export interface AiPlayer {
  id: string;
  cardId: string;
  ovr: number;
}

/** A league AI team: its identity is the roster it started from (`id` = roster key: name, logo, coach, IGL data). */
export interface AiTeam {
  id: string;
  players: AiPlayer[];
}

export interface CareerCoach {
  id: string;
  salary: number;
}

export interface SponsorOffer {
  id: string;
  name: string;
  /** Index into SPONSOR_TIERS. */
  tier: number;
  /** Paid when the season starts. */
  base: number;
  objective: SponsorObjective;
  /** Paid at the season's end when the objective is met (else REP_SPONSOR_FAIL reputation). */
  bonus: number;
}

export interface OfferRef {
  playerId: string;
  kind: OfferKind;
  /** AI team id, for a buyout. */
  from?: string;
}

export interface CareerWindow {
  kind: 'offseason' | 'midseason';
  offers: OfferRef[];
  signings: number;
  /** null = no limit (the off-season). */
  maxSignings: number | null;
  sponsorOffers: SponsorOffer[];
  /** Academy prospects (player ids). */
  prospects: string[];
  /** Coach ids. */
  coaches: string[];
}

export type LedgerKind = 'salaries' | 'coach' | 'fee' | 'sale' | 'sponsor' | 'bonus' | 'prize';
export const LEDGER_LABELS: Record<LedgerKind, string> = {
  salaries: 'Salários',
  coach: 'Coach',
  fee: 'Contratações',
  sale: 'Vendas',
  sponsor: 'Patrocínio',
  bonus: 'Bônus de patrocínio',
  prize: 'Premiação',
};

export interface LedgerEntry {
  kind: LedgerKind;
  /** Positive = income. */
  amount: number;
  label: string;
}

export interface ScrimRecord {
  n: number;
  /** Stage whose scrim budget it used. */
  stage: CareerStage;
  opponent: string;
  map: MapName;
  won: boolean;
  /** Rounds [user, opponent]. */
  score: [number, number];
  box: CompactSeries;
}

export interface Placement {
  rank: number;
  label: string;
}

export interface Award {
  playerId: string;
  cardId: string;
  handle: string;
  entrantId: string;
  teamName: string;
  isUser: boolean;
  rating: number;
  maps: number;
}

export interface SponsorResult {
  name: string;
  objective: SponsorObjective;
  base: number;
  bonus: number;
  met: boolean;
}

export interface SeasonRecord {
  season: number;
  year: number;
  /** User's strength at the season's end (no tournament form). */
  strength: number;
  league: Placement | null;
  masters: Placement | null;
  champions: Placement | null;
  /** Titles won by the org this season. */
  titles: CareerStage[];
  /** Winner names of each stage. */
  winners: Partial<Record<CareerStage, string>>;
  awards: { mvp?: Award; rookie?: Award; orgBest?: Award };
  sponsors: SponsorResult[];
  money: { start: number; end: number; byKind: Partial<Record<LedgerKind, number>> };
  reputation: { start: number; end: number };
  /** "Liga 2º → Masters 3º → Champions 9º–12º". */
  path: string;
  bankrupt?: boolean;
}

/** The org's emblem (cosmetic, picked when the org is founded): a shield shape and an accent color, by key. */
export interface OrgEmblem {
  shape: string;
  color: string;
}

export interface CareerOrg {
  name: string;
  tag: string;
  region: Region;
  difficulty: Difficulty;
  emblem?: OrgEmblem;
}

export interface CareerVeto {
  stage: CareerStage;
  matchId: string;
  state: VetoState;
}

export interface CareerState {
  version: typeof CAREER_VERSION;
  seed: string;
  org: CareerOrg;
  /** 1-based. */
  season: number;
  year: number;
  phase: CareerPhase;
  /** US$ thousand; can be negative after the payroll (credit line). */
  money: number;
  /** 0–100. */
  reputation: number;
  /** The last season ended in the red: no credit line; another red season is bankruptcy. */
  debtWarning: boolean;
  players: CareerPlayer[];
  coach?: CareerCoach;
  /** Sponsors of the current season. */
  sponsors: SponsorOffer[];
  /** Off-season or mid-season window. */
  window?: CareerWindow;
  aiTeams: AiTeam[];
  /** OVR of free agents whose level differs from their latest card (released by the org or an AI team). */
  freeAgents: Record<string, number>;
  league?: LeagueState;
  masters?: BracketState;
  champions?: TournamentState;
  veto?: CareerVeto;
  /** Full series of the user's matches this season (`${stage}:${matchId}`) and scrims (`scrim:${n}`), for the replay. */
  userSeries: Record<string, SeriesResult>;
  /** Compact box score of every competitive series this season (`${stage}:${matchId}`). */
  boxScores: Record<string, CompactSeries>;
  mapsPlayed: MapsPlayed;
  scrims: ScrimRecord[];
  /** Money moves of the current season. */
  ledger: LedgerEntry[];
  seasonStart: { money: number; reputation: number };
  /** Every player id that has played the league in this career (the rookie award). */
  leaguePlayers: string[];
  history: SeasonRecord[];
  over?: 'bankrupt';
}

export type CareerMatch = TMatch | LMatch;

export interface CreateCareerInput {
  name: string;
  tag?: string;
  region: Region;
  difficulty?: Difficulty;
  seed: string;
  emblem?: OrgEmblem;
}

export const LEAGUE_AI_TEAMS = LEAGUE_TEAMS - 1;
export const CAREER_MAP_POOL: readonly MapName[] = REAL_MAP_POOL;

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Org tag: 2–4 uppercase letters/digits; derived from the name's initials when empty or invalid. */
export function cleanTag(tag: string | undefined, name: string): string {
  const t = (tag ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ORG_TAG_MAX);
  if (t.length >= ORG_TAG_MIN) return t;
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').slice(0, ORG_TAG_MAX);
  if (initials.length >= ORG_TAG_MIN) return initials;
  const letters = words.join('').slice(0, 3);
  return letters.length >= ORG_TAG_MIN ? letters : 'ORG';
}

/** A new career in the first off-season: no players yet, the market, sponsors, academy and coaches open. */
export function createCareer(input: CreateCareerInput): CareerState {
  const difficulty = input.difficulty ?? DEFAULT_DIFFICULTY;
  if (!isDifficulty(difficulty)) throw new Error(`Unknown difficulty "${String(difficulty)}"`);
  if (!REGIONS.includes(input.region)) throw new Error(`Unknown region "${input.region}"`);
  const name = cleanTeamName(input.name);
  const start = CAREER_DIFFICULTY[difficulty];
  const base: CareerState = {
    version: CAREER_VERSION,
    seed: input.seed,
    org: { name, tag: cleanTag(input.tag, name), region: input.region, difficulty, ...(input.emblem ? { emblem: { shape: String(input.emblem.shape), color: String(input.emblem.color) } } : {}) },
    season: 1,
    year: CAREER_START_YEAR,
    phase: 'offseason',
    money: start.money,
    reputation: start.reputation,
    debtWarning: false,
    players: [],
    sponsors: [],
    aiTeams: [],
    freeAgents: {},
    userSeries: {},
    boxScores: {},
    mapsPlayed: {},
    scrims: [],
    ledger: [],
    seasonStart: { money: start.money, reputation: start.reputation },
    leaguePlayers: [],
    history: [],
  };
  return openWindow({ ...base, aiTeams: buildLeagueTeams(base) }, 'offseason');
}

/** The league's 11 AI teams: a seeded draw of the region's current rosters, one player per team (vacancies filled). */
function buildLeagueTeams(c: CareerState): AiTeam[] {
  const drawn = shuffled(currentTeamsOf(c.org.region), createRng(`${c.seed}:league-teams`)).slice(0, LEAGUE_AI_TEAMS);
  if (drawn.length < LEAGUE_AI_TEAMS) throw new Error(`Region "${c.org.region}" has only ${drawn.length} current teams`);
  const taken = new Set<string>();
  const teams: AiTeam[] = [];
  const vacancies: { team: number; card: Card }[] = [];
  drawn.forEach((entry, t) => {
    const players: AiPlayer[] = [];
    for (const card of entry.cards) {
      if (taken.has(card.playerId)) vacancies.push({ team: t, card });
      else {
        taken.add(card.playerId);
        players.push({ id: card.playerId, cardId: card.id, ovr: card.ovr });
      }
    }
    teams.push({ id: rosterKey(entry), players });
  });
  for (const v of vacancies) {
    const fa = bestFreeAgent({ ...c, aiTeams: teams }, v.card.role, v.card.isIGL, taken);
    if (!fa) throw new Error('No free agent to fill a league roster');
    taken.add(fa.playerId);
    teams[v.team]!.players.push({ id: fa.playerId, cardId: playerInfo(fa.playerId).cardId, ovr: fa.ovr });
  }
  return teams;
}

// ---------------------------------------------------------------------------
// The world: who is free, lineups, strength
// ---------------------------------------------------------------------------

/** Player ids the org and the league's AI teams hold. */
function heldPlayers(c: Pick<CareerState, 'players' | 'aiTeams'>): Set<string> {
  const out = new Set<string>();
  for (const p of c.players) out.add(p.id);
  for (const t of c.aiTeams) for (const p of t.players) out.add(p.id);
  return out;
}

/** The AI team holding a player, if any. */
export function aiTeamOf(c: Pick<CareerState, 'aiTeams'>, playerId: string): AiTeam | undefined {
  return c.aiTeams.find((t) => t.players.some((p) => p.id === playerId));
}

/** League AI team ids. */
function leagueTeamIds(c: CareerState): Set<string> {
  return new Set(c.aiTeams.map((t) => t.id));
}

/**
 * Is the player free: not in the org nor in a league team, not on another region's (static) current roster, not
 * retired. Players of the org's region whose current team is not in the league are free (they play Challengers).
 */
export function isFreeAgent(c: CareerState, playerId: string, held: ReadonlySet<string> = heldPlayers(c)): boolean {
  if (held.has(playerId) || !PLAYERS.has(playerId)) return false;
  if (experience(playerId, c.year) >= RETIRE_EXPERIENCE) return false;
  return !otherRegionsPlayers(c.org.region).has(playerId);
}

/**
 * A free agent's OVR now: his latest card aged like everyone else (world.ts worldOvr: he keeps playing somewhere), or
 * the OVR he had when the org or a league team let him go.
 */
export function freeAgentOvr(c: Pick<CareerState, 'freeAgents' | 'seed' | 'year'>, playerId: string): number {
  return c.freeAgents[playerId] ?? worldOvr(c.seed, playerId, playerInfo(playerId).ovr, c.year);
}

interface FreeAgent {
  playerId: string;
  ovr: number;
  card: Card;
  region: Region;
}

/** Every free agent (optionally of one region), best OVR first. */
export function freeAgentPool(c: CareerState, region?: Region, held: ReadonlySet<string> = heldPlayers(c)): FreeAgent[] {
  const out: FreeAgent[] = [];
  for (const info of PLAYERS.values()) {
    if (region && info.region !== region) continue;
    if (!isFreeAgent(c, info.playerId, held)) continue;
    out.push({ playerId: info.playerId, ovr: freeAgentOvr(c, info.playerId), card: cardById(info.cardId), region: info.region });
  }
  return out.sort((x, y) => y.ovr - x.ovr || x.playerId.localeCompare(y.playerId));
}

/** Best free agent of the org's region for a role (an IGL first when `preferIgl`), else of any role. */
function bestFreeAgent(c: CareerState, role: Card['role'], preferIgl: boolean, taken: ReadonlySet<string>, exclude: ReadonlySet<string> = new Set()): FreeAgent | undefined {
  const held = new Set([...heldPlayers(c), ...taken]);
  const pool = freeAgentPool(c, c.org.region, held).filter((f) => !exclude.has(f.playerId));
  const sameRole = pool.filter((f) => f.card.role === role);
  if (preferIgl) {
    const igl = sameRole.find((f) => f.card.isIGL) ?? pool.find((f) => f.card.isIGL);
    if (igl) return igl;
  }
  return sameRole[0] ?? pool[0];
}

/** Stage whose tournament form applies now (the window leads to the next stage; the report keeps the last). */
export function formStage(c: CareerState): CareerStage {
  if (c.phase === 'league' || c.phase === 'masters' || c.phase === 'champions') return c.phase;
  if (c.phase === 'offseason') return 'league';
  if (c.phase === 'midseason') return 'masters';
  return c.champions ? 'champions' : c.masters ? 'masters' : 'league';
}

export function careerFormSeed(c: Pick<CareerState, 'seed' | 'year'>, stage: CareerStage): string {
  return `${c.seed}:${c.year}:${stage}:form`;
}

/** Morale's effect on the effective OVR: +1 at MORALE_BOOST or more, −1 at MORALE_SLUMP or less. */
export function moraleShift(morale: number): number {
  return morale >= MORALE_BOOST ? 1 : morale <= MORALE_SLUMP ? -1 : 0;
}

/** The card a career player plays with: his card at his OVR (+ morale), career aura, '#user' id. */
export function playerCard(p: CareerPlayer, suffix = true): Card {
  const base = cardById(p.cardId);
  return cardAt(base, p.ovr + moraleShift(p.morale), { id: suffix ? `${p.cardId}#user` : p.cardId, aura: careerAura(base, p.facts) ?? null });
}

export function findCareerCoach(id: string | undefined): Coach | undefined {
  return id ? findCoach(ALL_ROSTERS, id) : undefined;
}

export function starters(c: Pick<CareerState, 'players'>): CareerPlayer[] {
  return SLOTS.map((slot) => c.players.find((p) => p.status === 'starter' && p.slot === slot)).filter((p): p is CareerPlayer => !!p);
}

/** The org's lineup before the tournament form (needs 5 starters). */
export function baseUserLineup(c: CareerState, suffix = true): Lineup {
  const five = starters(c);
  if (five.length !== STARTERS) throw new Error('Escalação incompleta: são precisos 5 titulares');
  const players: LineupPlayer[] = five.map((p) => ({ card: playerCard(p, suffix), slot: p.slot! }));
  const lineup: Lineup = { name: c.org.name, players };
  const coach = findCareerCoach(c.coach?.id);
  if (coach) lineup.coach = coach;
  return lineup;
}

function aiTeamLineup(team: AiTeam): Lineup {
  const origin = rosterByKey(team.id);
  const cards = team.players.map((p) => cardAt(cardById(p.cardId), p.ovr));
  return realLineup({ ...origin, cards });
}

function worldLineup(c: CareerState, id: string): Lineup {
  const origin = rosterByKey(id);
  const cards = origin.cards.map((card) => cardAt(card, worldOvr(c.seed, card.playerId, card.ovr, c.year)));
  return realLineup({ ...origin, cards });
}

/** Lineup of any entrant before the tournament form: the org, a league AI team, or another region's current roster. */
export function rawLineup(c: CareerState, id: string): Lineup {
  if (id === USER_ID) return baseUserLineup(c);
  const team = c.aiTeams.find((t) => t.id === id);
  return team ? aiTeamLineup(team) : worldLineup(c, id);
}

/** Lineup of any entrant as it plays the stage (tournament form of `stage`, default the current one). */
export function lineupOf(c: CareerState, id: string, stage: CareerStage = formStage(c)): Lineup {
  return applyTournamentForm(rawLineup(c, id), careerFormSeed(c, stage));
}

const aiBonus = (c: CareerState): number => difficultySettings(c.org.difficulty).aiBonus;

/** Strength as seeded and shown: the org's lineup as it plays now; an AI team plus the difficulty's bonus. */
export function strengthOf(c: CareerState, id: string, stage: CareerStage = formStage(c)): number {
  return teamStrength(lineupOf(c, id, stage)).total + (id === USER_ID ? 0 : aiBonus(c));
}

export function nameOf(c: CareerState, id: string): string {
  if (id === USER_ID) return c.org.name;
  return rosterByKey(id).teamName;
}

function seedByStrength(teams: { id: string; name: string; strength: number }[]): Entrant[] {
  return [...teams]
    .sort((x, y) => y.strength - x.strength || (x.id < y.id ? -1 : 1))
    .map((t, i) => ({ id: t.id, name: t.name, seed: i + 1 }));
}

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

export const salaryFor = (value: number, isImport = false): number => Math.max(SALARY_MIN, round5(value * SALARY_SHARE * (isImport ? IMPORT_SALARY : 1)));

/** Reputation a player asks for to sign: (OVR − 83) × 5, + 10 for an import. */
export function requiredReputation(ovr: number, isImport = false): number {
  return Math.max(0, (ovr - SIGN_REP_OVR) * SIGN_REP_PER_OVR) + (isImport ? SIGN_REP_IMPORT : 0);
}

/** Market value of a career player now (his OVR and career aura). */
export function careerPlayerValue(p: CareerPlayer): number {
  return playerValue(playerCard(p, false));
}

export function coachSalary(coach: Coach): number {
  return COACH_SALARY_BASE + COACH_SALARY_PER_POINT * (coach.tacticBonus + coach.vetoBonus);
}

export function coachReputation(coach: Coach): number {
  return Math.max(0, COACH_REP_PER_POINT * (coach.tacticBonus + coach.vetoBonus) - 10);
}

/** Salaries due when the season starts: every player under contract (expired ones leave) + the coach. */
export function payroll(c: CareerState): { players: number; coach: number; total: number } {
  const players = c.players.filter((p) => p.contract.years > 0).reduce((s, p) => s + p.contract.salary, 0);
  const coach = c.coach?.salary ?? 0;
  return { players, coach, total: players + coach };
}

export function sponsorBase(c: Pick<CareerState, 'sponsors'>): number {
  return c.sponsors.reduce((s, x) => s + x.base, 0);
}

export function sponsorSlots(reputation: number): number {
  let slots = 1;
  for (const s of SPONSOR_SLOTS) if (reputation >= s.minRep) slots = s.slots;
  return slots;
}

export function sponsorTier(reputation: number): number {
  let tier = 0;
  SPONSOR_TIERS.forEach((t, i) => {
    if (reputation >= t.minRep) tier = i;
  });
  return tier;
}

function book(c: CareerState, kind: LedgerKind, amount: number, label: string): CareerState {
  if (amount === 0) return c;
  return { ...c, money: c.money + amount, ledger: [...c.ledger, { kind, amount, label }] };
}

// ---------------------------------------------------------------------------
// Windows: market, sponsors, academy, coaches
// ---------------------------------------------------------------------------

function openWindow(c: CareerState, kind: 'offseason' | 'midseason'): CareerState {
  const offers = drawMarketOffers(c, kind);
  const window: CareerWindow = {
    kind,
    offers,
    signings: 0,
    maxSignings: kind === 'midseason' ? MIDSEASON_MAX_SIGNINGS : null,
    sponsorOffers: kind === 'offseason' ? drawSponsorOffers(c) : [],
    prospects: kind === 'offseason' ? drawProspects(c, new Set(offers.map((o) => o.playerId))) : [],
    coaches: kind === 'offseason' ? drawCoaches(c) : [],
  };
  return { ...c, phase: kind, window };
}

/**
 * The window's offers, seeded by the career and the year: buyouts of league players (random), the region's free agents
 * (per role, among the best of each role, so every slot can be filled) and imports (free agents of other regions).
 */
function drawMarketOffers(c: CareerState, kind: 'offseason' | 'midseason'): OfferRef[] {
  const q = kind === 'offseason' ? OFFSEASON_OFFERS : MIDSEASON_OFFERS;
  const rng = createRng(`${c.seed}:${c.year}:market:${kind}`);
  const out: OfferRef[] = [];
  const used = new Set<string>();
  const add = (o: OfferRef) => {
    out.push(o);
    used.add(o.playerId);
  };
  const leaguePlayers = c.aiTeams.flatMap((t) => t.players.map((p) => ({ playerId: p.id, from: t.id })));
  for (const p of shuffled(leaguePlayers, rng).slice(0, q.team)) add({ playerId: p.playerId, kind: 'team', from: p.from });
  const held = heldPlayers(c);
  const home = freeAgentPool(c, c.org.region, held).filter((f) => !isProspect(c, f));
  for (const role of ROLE_ORDER) {
    const best = home.filter((f) => f.card.role === role && !used.has(f.playerId)).slice(0, 4 * q.freePerRole);
    for (const f of shuffled(best, rng).slice(0, q.freePerRole)) add({ playerId: f.playerId, kind: 'free' });
  }
  const rest = home.filter((f) => !used.has(f.playerId)).slice(0, Math.max(10, Math.ceil(home.length / 2)));
  for (const f of shuffled(rest, rng).slice(0, q.freeExtra)) add({ playerId: f.playerId, kind: 'free' });
  const away = freeAgentPool(c, undefined, held).filter((f) => f.region !== c.org.region && !used.has(f.playerId)).slice(0, 30);
  for (const f of shuffled(away, rng).slice(0, q.import)) add({ playerId: f.playerId, kind: 'import' });
  return out
    .map((o) => ({ o, fee: offerTerms(c, o).fee }))
    .sort((x, y) => y.fee - x.fee || x.o.playerId.localeCompare(y.o.playerId))
    .map((x) => x.o);
}

/** A young free agent below PROSPECT_MAX_OVR: an academy prospect, never a market offer. */
const isProspect = (c: CareerState, f: FreeAgent): boolean => experience(f.playerId, c.year) <= PROSPECT_MAX_EXP && f.ovr <= PROSPECT_MAX_OVR;

/** Academy prospects: young free agents of the region (≤ PROSPECT_MAX_EXP seasons), highest potential first among a draw. */
function drawProspects(c: CareerState, exclude: ReadonlySet<string>): string[] {
  const young = freeAgentPool(c, c.org.region).filter((f) => !exclude.has(f.playerId) && isProspect(c, f));
  const ranked = young.sort((x, y) => potentialOf(c.seed, y.playerId) - potentialOf(c.seed, x.playerId) || x.playerId.localeCompare(y.playerId)).slice(0, 3 * PROSPECT_OFFERS);
  return shuffled(ranked, createRng(`${c.seed}:${c.year}:prospects`)).slice(0, PROSPECT_OFFERS).map((f) => f.playerId);
}

/** Coaches on offer: real coaches (latest entry per name) not working for a league team or another region's current team. */
function drawCoaches(c: CareerState): string[] {
  const busy = new Set<string>();
  for (const t of c.aiTeams) {
    const coach = rosterByKey(t.id).coach;
    if (coach) busy.add(coach.name);
  }
  for (const r of REGIONS) if (r !== c.org.region) for (const e of currentTeamsOf(r)) if (e.coach) busy.add(e.coach.name);
  if (c.coach) busy.add(findCareerCoach(c.coach.id)?.name ?? '');
  const latest = new Map<string, Coach>();
  for (const e of ALL_ROSTERS) if (e.coach && !busy.has(e.coach.name)) latest.set(e.coach.name, e.coach);
  const all = [...latest.values()].sort((x, y) => x.id.localeCompare(y.id));
  return shuffled(all, createRng(`${c.seed}:${c.year}:coaches`))
    .slice(0, COACH_OFFERS)
    .sort((x, y) => y.tacticBonus + y.vetoBonus - (x.tacticBonus + x.vetoBonus) || x.id.localeCompare(y.id))
    .map((x) => x.id);
}

/** Sponsor offers: SPONSOR_OFFERS − 1 from the reputation's tier and one from the tier below (or the same). */
function drawSponsorOffers(c: CareerState): SponsorOffer[] {
  const rng = createRng(`${c.seed}:${c.year}:sponsors`);
  const tier = sponsorTier(c.reputation);
  const names = shuffled(SPONSOR_NAMES, rng);
  const out: SponsorOffer[] = [];
  for (let i = 0; i < SPONSOR_OFFERS; i++) {
    const t = i === SPONSOR_OFFERS - 1 ? Math.max(0, tier - 1) : tier;
    const def = SPONSOR_TIERS[t]!;
    const objective = def.objectives[(i + rng.int(0, def.objectives.length - 1)) % def.objectives.length]!;
    const base = round5(def.base * (1 + SPONSOR_SPREAD * (2 * rng.next() - 1)));
    out.push({ id: `${c.year}-${i + 1}`, name: names[i % names.length]!, tier: t, base, objective, bonus: round5(base * SPONSOR_BONUS[objective]) });
  }
  return out;
}

export interface OfferTerms {
  card: Card;
  ovr: number;
  potential: number;
  experience: number;
  value: number;
  fee: number;
  salary: number;
  requiredRep: number;
}

/** Price and level of an offer as things stand. */
export function offerTerms(c: CareerState, o: OfferRef): OfferTerms {
  let cardId: string;
  let ovr: number;
  if (o.kind === 'team') {
    const p = c.aiTeams.find((t) => t.id === o.from)?.players.find((x) => x.id === o.playerId);
    cardId = p?.cardId ?? playerInfo(o.playerId).cardId;
    ovr = p?.ovr ?? freeAgentOvr(c, o.playerId);
  } else {
    cardId = playerInfo(o.playerId).cardId;
    ovr = freeAgentOvr(c, o.playerId);
  }
  const card = cardAt(cardById(cardId), ovr);
  const value = playerValue(card);
  const isImport = o.kind === 'import';
  return {
    card,
    ovr,
    potential: Math.max(ovr, potentialOf(c.seed, o.playerId)),
    experience: experience(o.playerId, c.year),
    value,
    fee: round5(value * FEE_SHARE[o.kind]),
    salary: salaryFor(value, isImport),
    requiredRep: requiredReputation(ovr, isImport),
  };
}

function requireWindow(c: CareerState, kinds: readonly CareerWindow['kind'][] = ['offseason', 'midseason']): CareerWindow {
  if (!c.window || !kinds.includes(c.window.kind) || c.phase !== c.window.kind) {
    throw new Error(kinds.length === 1 && kinds[0] === 'offseason' ? 'Só na pré-temporada' : 'Nenhuma janela de transferências aberta');
  }
  return c.window;
}

const rosterCount = (c: Pick<CareerState, 'players'>): number => c.players.filter((p) => p.status !== 'academy').length;
const academyCount = (c: Pick<CareerState, 'players'>): number => c.players.filter((p) => p.status === 'academy').length;

/** A free starting slot for a card: its role, a role it really played, flex, then any. */
function freeSlotFor(c: Pick<CareerState, 'players'>, card: Card): Slot | undefined {
  const used = new Set(starters(c).map((p) => p.slot));
  const options: Slot[] = [card.role, ...(card.flexRoles ?? []), 'flex', ...SLOTS];
  return options.find((s) => !used.has(s));
}

/** Why the org cannot sign this offer now (pt-BR), or null. */
export function signingBlock(c: CareerState, playerId: string): string | null {
  const w = c.window;
  if (!w || c.phase !== w.kind) return 'Nenhuma janela de transferências aberta';
  const offer = w.offers.find((o) => o.playerId === playerId);
  if (!offer) return 'Jogador fora da lista de ofertas';
  if (c.players.some((p) => p.id === playerId)) return 'Já está no seu elenco';
  if (offer.kind === 'team' && !c.aiTeams.find((t) => t.id === offer.from)?.players.some((p) => p.id === playerId)) return 'Jogador indisponível';
  if (offer.kind !== 'team' && !isFreeAgent(c, playerId)) return 'Jogador indisponível';
  if (w.maxSignings !== null && w.signings >= w.maxSignings) return `Limite de ${w.maxSignings} contratações nesta janela`;
  if (rosterCount(c) >= STARTERS + MAX_BENCH) return `Elenco cheio (${STARTERS} titulares + ${MAX_BENCH} reservas)`;
  const t = offerTerms(c, offer);
  if (c.reputation < t.requiredRep) return `Recusou: pede reputação ${t.requiredRep} (sua org: ${c.reputation})`;
  const cost = t.fee + (w.kind === 'midseason' ? round5(t.salary * MIDSEASON_SALARY_SHARE) : 0);
  if (c.money < cost) return 'Caixa insuficiente';
  return null;
}

/**
 * Signs an offer for `years` seasons (CONTRACT_YEARS_MIN–MAX, default 2). He takes a free starting slot or goes to
 * the bench. Pays the fee now (a buyout: the player's value; a free agent: 25%; an import: 50%) and, mid-season, half
 * the season's salary; off-season salaries are paid when the league starts. A bought league player is replaced on his
 * team by the best free agent of his role.
 */
export function signPlayer(c: CareerState, playerId: string, years: number = DEFAULT_CONTRACT_YEARS): CareerState {
  const w = requireWindow(c);
  const block = signingBlock(c, playerId);
  if (block) throw new Error(block);
  const n = clampYears(years);
  const offer = w.offers.find((o) => o.playerId === playerId)!;
  const t = offerTerms(c, offer);
  const slot = starters(c).length < STARTERS ? freeSlotFor(c, t.card) : undefined;
  const player: CareerPlayer = {
    id: playerId,
    cardId: t.card.id,
    ovr: t.ovr,
    potential: t.potential,
    status: slot ? 'starter' : 'bench',
    morale: MORALE_START,
    contract: { salary: t.salary, years: n },
    facts: { ...NO_FACTS },
    joined: { year: c.year, fee: t.fee, from: offer.kind },
    history: [],
  };
  if (slot) player.slot = slot;
  if (offer.kind === 'import') player.import = true;
  let next: CareerState = { ...c, players: [...c.players, player], window: { ...w, signings: w.signings + 1 } };
  if (offer.kind === 'team') next = replaceOnTeam(next, offer.from!, playerId);
  else {
    const freeAgents = { ...next.freeAgents };
    delete freeAgents[playerId];
    next = { ...next, freeAgents };
  }
  next = book(next, 'fee', -t.fee, `Contratação de ${t.card.handle}`);
  if (w.kind === 'midseason') next = book(next, 'salaries', -round5(t.salary * MIDSEASON_SALARY_SHARE), `Meio salário de ${t.card.handle}`);
  return next;
}

/** A league team loses `playerId` and signs the best free agent of his role (never one on the open window's lists). */
function replaceOnTeam(c: CareerState, teamId: string, playerId: string): CareerState {
  const team = c.aiTeams.find((t) => t.id === teamId)!;
  const leaving = team.players.find((p) => p.id === playerId)!;
  const card = cardById(leaving.cardId);
  const exclude = new Set([...(c.window?.offers.map((o) => o.playerId) ?? []), ...(c.window?.prospects ?? [])]);
  const fa = bestFreeAgent(c, card.role, card.isIGL, new Set(), exclude);
  const players = team.players.filter((p) => p.id !== playerId);
  const freeAgents = { ...c.freeAgents };
  if (fa) {
    players.push({ id: fa.playerId, cardId: playerInfo(fa.playerId).cardId, ovr: fa.ovr });
    delete freeAgents[fa.playerId];
  }
  return { ...c, freeAgents, aiTeams: c.aiTeams.map((t) => (t.id === teamId ? { ...t, players } : t)) };
}

const clampYears = (years: number): number => Math.max(CONTRACT_YEARS_MIN, Math.min(CONTRACT_YEARS_MAX, Math.round(years)));

/** What selling a player credits: SALE_SHARE of his value while under contract, nothing when it expired. */
export function saleCredit(p: CareerPlayer): number {
  return p.contract.years >= 1 ? round5(careerPlayerValue(p) * SALE_SHARE) : 0;
}

/** Sells (or releases) a player in a window: credits saleCredit and frees his salary for the next payroll. */
export function releasePlayer(c: CareerState, playerId: string): CareerState {
  requireWindow(c);
  const p = c.players.find((x) => x.id === playerId);
  if (!p) throw new Error('Jogador não está no seu elenco');
  const credit = saleCredit(p);
  const freeAgents = { ...c.freeAgents, [playerId]: p.ovr };
  const next: CareerState = { ...c, players: c.players.filter((x) => x.id !== playerId), freeAgents };
  return book(next, 'sale', credit, `Venda de ${cardById(p.cardId).handle}`);
}

/** Why a player would refuse a renewal now (pt-BR), or null. */
export function renewalBlock(c: CareerState, playerId: string): string | null {
  if (c.phase !== 'offseason') return 'Renovações só na pré-temporada';
  const p = c.players.find((x) => x.id === playerId);
  if (!p) return 'Jogador não está no seu elenco';
  if (p.contract.years > 1) return 'Contrato ainda não está no último ano';
  if (experience(playerId, c.year) >= RETIRE_EXPERIENCE) return 'Vai se aposentar ao fim do contrato';
  if (p.morale < RENEW_MIN_MORALE) return `Moral baixa (${p.morale}): quer sair`;
  const need = requiredReputation(p.ovr, p.import) - RENEW_REP_SLACK;
  if (c.reputation < need) return `Pede uma org maior: reputação ${need}`;
  return null;
}

/** The salary a renewal would set: his value now (OVR and career aura). Academy players keep the academy salary. */
export function renewalSalary(p: CareerPlayer): number {
  return p.status === 'academy' ? ACADEMY_SALARY : salaryFor(careerPlayerValue(p), p.import);
}

/** Renews a contract in its last year (or expired) for `years` more seasons at today's salary. */
export function renewContract(c: CareerState, playerId: string, years: number = DEFAULT_CONTRACT_YEARS): CareerState {
  const block = renewalBlock(c, playerId);
  if (block) throw new Error(block);
  return mapPlayer(c, playerId, (p) => ({ ...p, contract: { salary: renewalSalary(p), years: Math.max(0, p.contract.years) + clampYears(years) } }));
}

function mapPlayer(c: CareerState, playerId: string, f: (p: CareerPlayer) => CareerPlayer): CareerState {
  if (!c.players.some((p) => p.id === playerId)) throw new Error('Jogador não está no seu elenco');
  return { ...c, players: c.players.map((p) => (p.id === playerId ? f(p) : p)) };
}

function assertLineupEditable(c: CareerState): void {
  if (c.phase === 'over') throw new Error('Carreira encerrada');
  if (c.veto) throw new Error('Veto em andamento');
}

/** Puts a main-roster player in a starting slot; whoever held it takes his old place (slot or bench). */
export function setStarter(c: CareerState, playerId: string, slot: Slot): CareerState {
  assertLineupEditable(c);
  if (!SLOTS.includes(slot)) throw new Error(`Unknown slot "${slot}"`);
  const p = c.players.find((x) => x.id === playerId);
  if (!p) throw new Error('Jogador não está no seu elenco');
  if (p.status === 'academy') throw new Error('Promova o jogador da base antes');
  const holder = c.players.find((x) => x.status === 'starter' && x.slot === slot && x.id !== playerId);
  return {
    ...c,
    players: c.players.map((x) => {
      if (x.id === playerId) return { ...x, status: 'starter', slot };
      if (holder && x.id === holder.id) {
        if (p.status === 'starter' && p.slot) return { ...x, slot: p.slot };
        const out: CareerPlayer = { ...x, status: 'bench' };
        delete out.slot;
        return out;
      }
      return x;
    }),
  };
}

/** Moves a starter to the bench (the slot stays empty until filled). */
export function benchPlayer(c: CareerState, playerId: string): CareerState {
  assertLineupEditable(c);
  return mapPlayer(c, playerId, (p) => {
    if (p.status !== 'starter') throw new Error('Jogador não é titular');
    const out: CareerPlayer = { ...p, status: 'bench' };
    delete out.slot;
    return out;
  });
}

const strengthOrNone = (c: CareerState): number => {
  try {
    return teamStrength(baseUserLineup(c, false)).total;
  } catch {
    return -Infinity;
  }
};

/**
 * "Auto-escalar": the strongest lineup from the main roster (empty slots filled from the bench by fit, then greedy
 * swaps — a bench player into a slot, or two starters exchanging slots — while the strength, tournament form left
 * out, goes up).
 */
export function autoLineup(c0: CareerState): CareerState {
  assertLineupEditable(c0);
  let c = c0;
  for (const slot of SLOTS) {
    if (c.players.some((p) => p.status === 'starter' && p.slot === slot)) continue;
    const bench = c.players.filter((p) => p.status === 'bench').sort((x, y) => cardFit(cardById(y.cardId), slot) * y.ovr - cardFit(cardById(x.cardId), slot) * x.ovr)[0];
    if (bench) c = setStarter(c, bench.id, slot);
  }
  for (let guard = 0; guard < 25; guard++) {
    const before = strengthOrNone(c);
    let best: { state: CareerState; s: number } | null = null;
    for (const p of c.players) {
      if (p.status === 'academy') continue;
      for (const slot of SLOTS) {
        if (p.status === 'starter' && p.slot === slot) continue;
        const next = setStarter(c, p.id, slot);
        const s = strengthOrNone(next);
        if (s > before + 0.01 && (!best || s > best.s)) best = { state: next, s };
      }
    }
    if (!best) break;
    c = best.state;
  }
  return c;
}

/** Training focus on up to TRAINING_FOCUS_SLOTS players: +1 growth (or 1 point less of decline) at the next off-season. */
export function setTrainingFocus(c: CareerState, playerId: string, on: boolean): CareerState {
  if (c.phase === 'over') throw new Error('Carreira encerrada');
  if (on && !c.players.find((p) => p.id === playerId)?.focus && c.players.filter((p) => p.focus).length >= TRAINING_FOCUS_SLOTS) {
    throw new Error(`Foco de treino em no máximo ${TRAINING_FOCUS_SLOTS} jogadores`);
  }
  return mapPlayer(c, playerId, (p) => {
    const out: CareerPlayer = { ...p };
    if (on) out.focus = true;
    else delete out.focus;
    return out;
  });
}

/** Signs an academy prospect (off-season): no fee, ACADEMY_SALARY a season, ACADEMY_CONTRACT_YEARS seasons. */
export function signProspect(c: CareerState, playerId: string): CareerState {
  const w = requireWindow(c, ['offseason']);
  if (!w.prospects.includes(playerId)) throw new Error('Jogador fora da lista da base');
  if (academyCount(c) >= MAX_ACADEMY) throw new Error(`A base tem ${MAX_ACADEMY} vagas`);
  if (!isFreeAgent(c, playerId)) throw new Error('Jogador indisponível');
  const ovr = freeAgentOvr(c, playerId);
  const player: CareerPlayer = {
    id: playerId,
    cardId: playerInfo(playerId).cardId,
    ovr,
    potential: Math.max(ovr, potentialOf(c.seed, playerId)),
    status: 'academy',
    morale: MORALE_START,
    contract: { salary: ACADEMY_SALARY, years: ACADEMY_CONTRACT_YEARS },
    facts: { ...NO_FACTS },
    joined: { year: c.year, fee: 0, from: 'academy' },
    history: [],
  };
  const freeAgents = { ...c.freeAgents };
  delete freeAgents[playerId];
  return { ...c, freeAgents, players: [...c.players, player] };
}

/**
 * Promotes an academy player to the main roster (in a window): a free starting slot or the bench, a new contract at his
 * value (DEFAULT_CONTRACT_YEARS seasons); mid-season pays half of the new salary now.
 */
export function promoteAcademy(c: CareerState, playerId: string): CareerState {
  const w = requireWindow(c);
  const p = c.players.find((x) => x.id === playerId);
  if (!p || p.status !== 'academy') throw new Error('Jogador não está na base');
  if (rosterCount(c) >= STARTERS + MAX_BENCH) throw new Error(`Elenco cheio (${STARTERS} titulares + ${MAX_BENCH} reservas)`);
  const slot = starters(c).length < STARTERS ? freeSlotFor(c, cardById(p.cardId)) : undefined;
  const promoted: CareerPlayer = { ...p, status: slot ? 'starter' : 'bench' };
  if (slot) promoted.slot = slot;
  promoted.contract = { salary: salaryFor(careerPlayerValue(promoted)), years: DEFAULT_CONTRACT_YEARS };
  const next = mapPlayer(c, playerId, () => promoted);
  if (w.kind !== 'midseason') return next;
  const extra = round5(Math.max(0, promoted.contract.salary - p.contract.salary) * MIDSEASON_SALARY_SHARE);
  return book(next, 'salaries', -extra, `Promoção de ${cardById(p.cardId).handle}`);
}

/** Hires a coach from the off-season list (replaces the current one; paid when the league starts). */
export function hireCoach(c: CareerState, coachId: string): CareerState {
  const w = requireWindow(c, ['offseason']);
  if (!w.coaches.includes(coachId)) throw new Error('Coach fora da lista');
  const coach = findCareerCoach(coachId);
  if (!coach) throw new Error(`Unknown coach "${coachId}"`);
  const need = coachReputation(coach);
  if (c.reputation < need) throw new Error(`Recusou: pede reputação ${need}`);
  return { ...c, coach: { id: coachId, salary: coachSalary(coach) }, window: { ...w, coaches: w.coaches.filter((id) => id !== coachId) } };
}

/** Lets the coach go (off-season; no cost, no refund). */
export function releaseCoach(c: CareerState): CareerState {
  requireWindow(c, ['offseason']);
  const next = { ...c };
  delete next.coach;
  return next;
}

/** Accepts a sponsor offer for the season (slots by reputation: sponsorSlots). */
export function acceptSponsor(c: CareerState, offerId: string): CareerState {
  const w = requireWindow(c, ['offseason']);
  const offer = w.sponsorOffers.find((o) => o.id === offerId);
  if (!offer) throw new Error('Patrocínio fora da lista');
  if (c.sponsors.some((s) => s.id === offerId)) throw new Error('Patrocínio já aceito');
  if (c.sponsors.length >= sponsorSlots(c.reputation)) throw new Error(`Só ${sponsorSlots(c.reputation)} patrocinador(es) com a sua reputação`);
  return { ...c, sponsors: [...c.sponsors, offer] };
}

/** Gives up an accepted sponsor before the season starts. */
export function dropSponsor(c: CareerState, offerId: string): CareerState {
  requireWindow(c, ['offseason']);
  return { ...c, sponsors: c.sponsors.filter((s) => s.id !== offerId) };
}

// ---------------------------------------------------------------------------
// Scrims
// ---------------------------------------------------------------------------

/** Stage whose scrim budget applies now: the off-season and the league share the league's, and so on. */
export function scrimStage(c: CareerState): CareerStage | null {
  if (c.phase === 'offseason' || c.phase === 'league') return 'league';
  if (c.phase === 'midseason' || c.phase === 'masters') return 'masters';
  if (c.phase === 'champions') return 'champions';
  return null;
}

export function scrimsLeft(c: CareerState): number {
  const stage = scrimStage(c);
  if (!stage) return 0;
  return Math.max(0, SCRIMS_PER_STAGE[stage] - c.scrims.filter((s) => s.stage === stage).length);
}

/** Scrim partners: the league's AI teams, then the other regions' current teams. */
export function scrimOpponents(c: CareerState): string[] {
  const others = REGIONS.filter((r) => r !== c.org.region).flatMap((r) => currentTeamsOf(r).map(rosterKey));
  return [...c.aiTeams.map((t) => t.id), ...others];
}

/**
 * Plays an MD1 scrim against `opponentId` on `map` (or an AI veto when omitted). Never touches the standings or the
 * season's box scores; it adds the map to the org's familiarity (src/engine/familiarity.ts) and moves morale (win +2,
 * loss −1, the scrim's MVP +2 more). Limited per stage (SCRIMS_PER_STAGE).
 */
export function playScrim(c: CareerState, opponentId: string, map?: MapName): CareerState {
  const stage = scrimStage(c);
  if (!stage || scrimsLeft(c) <= 0) throw new Error('Sem scrims disponíveis nesta etapa');
  if (c.veto) throw new Error('Veto em andamento');
  if (!scrimOpponents(c).includes(opponentId)) throw new Error('Adversário indisponível para scrim');
  const n = c.scrims.length + 1;
  const user = lineupOf(c, USER_ID, stage);
  const opp = lineupOf(c, opponentId, stage);
  let veto: VetoState | undefined;
  if (map !== undefined) {
    if (!CAREER_MAP_POOL.includes(map)) throw new Error(`Map "${map}" is not in the pool`);
    veto = createVeto(CAREER_MAP_POOL, 1, 0);
    for (const m of CAREER_MAP_POOL) if (m !== map) veto = applyVeto(veto, m);
  }
  const opts: Parameters<typeof simulateSeries>[3] = {
    bestOf: 1,
    pool: CAREER_MAP_POOL,
    formSeed: `${c.seed}:${c.year}:scrim:${n}`,
    familiarity: [familiarityOf(c.mapsPlayed, USER_ID), familiarityOf(c.mapsPlayed, opponentId)],
    agentRoles: AGENT_ROLES,
  };
  if (REAL_META) opts.meta = REAL_META;
  if (veto) opts.veto = veto;
  const adjust = aiAdjust(USER_ID, opponentId, USER_ID, c.org.difficulty);
  if (adjust) opts.adjust = adjust;
  const series = simulateSeries(user, opp, createRng(`${c.seed}:${c.year}:scrim:${n}`), opts);
  const played = series.maps[0]!;
  const won = series.winner === 0;
  const record: ScrimRecord = { n, stage, opponent: opponentId, map: played.map, won, score: [played.score[0], played.score[1]], box: compactSeries(series, USER_ID, opponentId) };
  const mvpCard = series.mvp.team === 0 ? series.mvp.cardId.replace(/#user$/, '') : undefined;
  const five = new Set(starters(c).map((p) => p.id));
  const players = c.players.map((p) => {
    if (!five.has(p.id)) return p;
    const delta = (won ? MORALE_SCRIM_WIN : MORALE_SCRIM_LOSS) + (mvpCard === p.cardId ? MORALE_SCRIM_MVP : 0);
    return { ...p, morale: clampMorale(p.morale + delta) };
  });
  return {
    ...c,
    players,
    scrims: [...c.scrims, record],
    userSeries: { ...c.userSeries, [`scrim:${n}`]: series },
    mapsPlayed: recordMapsPlayed(c.mapsPlayed, [USER_ID], [played.map]),
  };
}

const clampMorale = (m: number): number => Math.max(0, Math.min(100, Math.round(m)));

// ---------------------------------------------------------------------------
// Season flow
// ---------------------------------------------------------------------------

/** What blocks starting the next stage (pt-BR), empty when it can start. */
export function startBlocks(c: CareerState): string[] {
  const out: string[] = [];
  if (c.phase === 'offseason') {
    const staying = c.players.filter((p) => p.contract.years > 0);
    const five = starters({ players: staying });
    if (five.length < STARTERS) out.push(`Escale ${STARTERS} titulares com contrato (faltam ${STARTERS - five.length})`);
    const after = c.money + sponsorBase(c) - payroll(c).total;
    const floor = c.debtWarning ? 0 : -CREDIT_LIMIT;
    if (after < floor) out.push(c.debtWarning ? 'Alerta de dívida: o caixa precisa ficar positivo depois da folha salarial' : `Folha salarial acima do limite de crédito (US$ ${CREDIT_LIMIT} mil)`);
  } else if (c.phase === 'midseason') {
    if (starters(c).length < STARTERS) out.push(`Escale ${STARTERS} titulares`);
  } else {
    out.push('Nada a iniciar agora');
  }
  return out;
}

/**
 * Starts the next stage. Off-season → league: expired contracts leave, the payroll is paid, the sponsors' base pay
 * credited and the league built (the org + its 11 AI teams, seeded by strength). Mid-season → Masters: the window
 * closes and the Masters (with or without the org) and then the Champions are built and played up to the org's
 * next match (the season ends on its own when the org is in neither).
 */
export function startStage(c: CareerState): CareerState {
  const blocks = startBlocks(c);
  if (blocks.length > 0) throw new Error(blocks[0]);
  if (c.phase === 'offseason') return startLeague(c);
  return startMasters(c);
}

function startLeague(c0: CareerState): CareerState {
  const leaving = c0.players.filter((p) => p.contract.years <= 0);
  const freeAgents = { ...c0.freeAgents };
  for (const p of leaving) freeAgents[p.id] = p.ovr;
  let c: CareerState = { ...c0, players: c0.players.filter((p) => p.contract.years > 0), freeAgents };
  delete c.window;
  const pay = payroll(c);
  c = book(c, 'salaries', -pay.players, 'Folha salarial da temporada');
  if (c.coach) c = book(c, 'coach', -pay.coach, 'Salário do coach');
  for (const s of c.sponsors) c = book(c, 'sponsor', s.base, `Patrocínio: ${s.name}`);
  const entrants = seedByStrength([
    { id: USER_ID, name: c.org.name, strength: strengthOf({ ...c, phase: 'league' }, USER_ID, 'league') },
    ...c.aiTeams.map((t) => ({ id: t.id, name: nameOf(c, t.id), strength: strengthOf(c, t.id, 'league') })),
  ]);
  return advance({ ...c, phase: 'league', league: createLeague(entrants) });
}

/** The strongest `count` of a seeded draw of 2 × count of a region's current teams (by strength this year). */
function drawStrongest(c: CareerState, region: Region, count: number, seed: string, excludeTeams: ReadonlySet<string> = new Set()): string[] {
  const candidates = currentTeamsOf(region).filter((e) => !excludeTeams.has(e.teamId));
  const drawn = shuffled(candidates, createRng(seed)).slice(0, Math.min(2 * count, candidates.length));
  return drawn
    .map((e) => ({ id: rosterKey(e), s: strengthOf(c, rosterKey(e), 'masters') }))
    .sort((x, y) => y.s - x.s || x.id.localeCompare(y.id))
    .slice(0, count)
    .map((x) => x.id);
}

function startMasters(c0: CareerState): CareerState {
  const c: CareerState = { ...c0 };
  delete c.window;
  const home = mastersQualified(c.league!);
  const others = shuffled(REGIONS.filter((r) => r !== c.org.region), createRng(`${c.seed}:${c.year}:masters:regions`));
  const slots = [2, 2, 1];
  const away = others.flatMap((region, i) => drawStrongest(c, region, slots[i]!, `${c.seed}:${c.year}:masters:${region}`));
  const ids = [...home, ...away];
  const entrants = seedByStrength(ids.map((id) => ({ id, name: nameOf(c, id), strength: strengthOf(c, id, 'masters') })));
  return advance({ ...c, phase: 'masters', masters: createBracket(entrants), mapsPlayed: withLeagueBaseline(c, ids) });
}

function startChampions(c: CareerState): CareerState {
  const league = c.league!;
  const homeIds = league.entrants
    .map((e) => ({ id: e.id, rank: leaguePlaceOf(league, e.id)?.rank ?? 99, seed: e.seed }))
    .sort((x, y) => x.rank - y.rank || x.seed - y.seed)
    .slice(0, 4)
    .map((e) => e.id);
  const ids = [...homeIds];
  for (const region of REGIONS) {
    if (region === c.org.region) continue;
    const fromMasters = bracketRanking(c.masters!).filter((id) => id !== USER_ID && !leagueTeamIds(c).has(id) && rosterRegion(id) === region);
    const taken = new Set(fromMasters.map((id) => rosterByKey(id).teamId));
    const candidates = shuffled(currentTeamsOf(region).filter((e) => !taken.has(e.teamId)), createRng(`${c.seed}:${c.year}:champions:${region}`));
    ids.push(...fromMasters, ...candidates.slice(0, 4 - fromMasters.length).map(rosterKey));
  }
  if (ids.length !== TEAM_COUNT) throw new Error(`Champions field has ${ids.length} teams, needs ${TEAM_COUNT}`);
  const entrants = seedByStrength(ids.map((id) => ({ id, name: nameOf(c, id), strength: strengthOf(c, id, 'champions') })));
  return { ...c, phase: 'champions', champions: createTournament(entrants), mapsPlayed: withLeagueBaseline(c, ids) };
}

const rosterRegion = (id: string): Region => {
  const e = rosterByKey(id);
  return e.region ?? playerInfo(e.cards[0]!.playerId).region;
};

/** Newcomers from other regions start with the league's median maps per map (as season.ts does). */
function withLeagueBaseline(c: CareerState, ids: readonly string[]): MapsPlayed {
  const league = (c.league?.entrants ?? []).filter((e) => e.id !== USER_ID).map((e) => c.mapsPlayed[e.id] ?? {});
  if (league.length === 0) return c.mapsPlayed;
  const baseline: Partial<Record<MapName, number>> = {};
  for (const map of CAREER_MAP_POOL) {
    const counts = league.map((row) => row[map] ?? 0).sort((a, b) => a - b);
    const median = counts[Math.floor((counts.length - 1) / 2)]!;
    if (median > 0) baseline[map] = median;
  }
  const out: Record<string, Partial<Record<MapName, number>>> = { ...c.mapsPlayed };
  for (const id of ids) if (!out[id]) out[id] = { ...baseline };
  return out;
}

function stagePending(c: CareerState, stage: CareerStage): CareerMatch[] {
  if (stage === 'league') return c.league ? leaguePending(c.league) : [];
  if (stage === 'masters') return c.masters ? bracketPending(c.masters) : [];
  return c.champions ? pendingMatches(c.champions) : [];
}

function stageDone(c: CareerState, stage: CareerStage): boolean {
  if (stage === 'league') return c.league?.phase === 'done';
  if (stage === 'masters') return c.masters?.phase === 'done';
  return c.champions?.phase === 'done';
}

export function stageMatches(c: CareerState, stage: CareerStage): CareerMatch[] {
  if (stage === 'league') return c.league?.matches ?? [];
  if (stage === 'masters') return c.masters?.matches ?? [];
  return c.champions?.matches ?? [];
}

export const seriesKey = (stage: CareerStage, matchId: string): string => `${stage}:${matchId}`;

function playSeries(c: CareerState, stage: CareerStage, match: CareerMatch, veto?: VetoState): { series: SeriesResult; result: LeagueResult } {
  const base = `${c.seed}:${c.year}:${stage}:${match.id}`;
  const opts: Parameters<typeof simulateSeries>[3] = {
    bestOf: match.bestOf,
    pool: CAREER_MAP_POOL,
    formSeed: base,
    familiarity: [familiarityOf(c.mapsPlayed, match.a), familiarityOf(c.mapsPlayed, match.b)],
    agentRoles: AGENT_ROLES,
  };
  if (REAL_META) opts.meta = REAL_META;
  if (veto) opts.veto = veto;
  const adjust = aiAdjust(match.a, match.b, USER_ID, c.org.difficulty);
  if (adjust) opts.adjust = adjust;
  const series = simulateSeries(lineupOf(c, match.a, stage), lineupOf(c, match.b, stage), createRng(base), opts);
  const rounds: [number, number] = [0, 0];
  for (const m of series.maps) {
    rounds[0] += m.score[0];
    rounds[1] += m.score[1];
  }
  return { series, result: { winner: series.winner, score: series.score, rounds } };
}

function stageReport(c: CareerState, stage: CareerStage, match: CareerMatch, played: { series: SeriesResult; result: LeagueResult }): CareerState {
  const mapsPlayed = recordMapsPlayed(c.mapsPlayed, [match.a, match.b], played.series.maps.map((m) => m.map));
  const boxScores = { ...c.boxScores, [seriesKey(stage, match.id)]: compactSeries(played.series, match.a, match.b) };
  if (stage === 'league') return { ...c, mapsPlayed, boxScores, league: reportLeagueResult(c.league!, match.id, played.result) };
  if (stage === 'masters') return { ...c, mapsPlayed, boxScores, masters: reportBracketResult(c.masters!, match.id, played.result) };
  return { ...c, mapsPlayed, boxScores, champions: reportResult(c.champions!, match.id, played.result) };
}

/** Plays AI matches until the org's next one; closes stages as they end (prizes, morale, facts) and moves on. */
function advance(c0: CareerState): CareerState {
  let c = c0;
  for (let guard = 0; guard < 10; guard++) {
    const stage = c.phase;
    if (stage !== 'league' && stage !== 'masters' && stage !== 'champions') return c;
    for (let inner = 0; inner < 1000; inner++) {
      const [next] = stagePending(c, stage);
      if (!next || involvesUser(next)) break;
      c = stageReport(c, stage, next, playSeries(c, stage, next));
    }
    if (!stageDone(c, stage)) return c;
    c = closeStage(c, stage);
    if (stage === 'league') return openWindow(c, 'midseason');
    if (stage === 'masters') c = startChampions(c);
    else return finishSeason(c);
  }
  throw new Error('Career did not advance');
}

/** The org's place in a stage, once decided (null when it did not take part). */
export function userPlacement(c: CareerState, stage: CareerStage): Placement | null {
  const place =
    stage === 'league' ? c.league && leaguePlaceOf(c.league, USER_ID)
    : stage === 'masters' ? c.masters && bracketPlaceOf(c.masters, USER_ID)
    : c.champions && championsPlaceOf(c.champions, USER_ID);
  return place ? { rank: place.rank, label: place.label } : null;
}

function inStage(c: CareerState, stage: CareerStage): boolean {
  const entrants = stage === 'league' ? c.league?.entrants : stage === 'masters' ? c.masters?.entrants : c.champions?.entrants;
  return !!entrants?.some((e) => e.id === USER_ID);
}

const PRIZES: Record<CareerStage, Record<number, number>> = { league: CAREER_LEAGUE_PRIZE, masters: CAREER_MASTERS_PRIZE, champions: CAREER_CHAMPIONS_PRIZE };

const baseCardId = (id: string): string => id.replace(/#user$/, '');

/** The org's maps per card id in a set of box scores, and the team's maps. */
function userMaps(boxes: readonly CompactSeries[]): { team: number; byCard: Map<string, number> } {
  const byCard = new Map<string, number>();
  let team = 0;
  for (const b of boxes) {
    const side = b.teams[0] === USER_ID ? 0 : b.teams[1] === USER_ID ? 1 : null;
    if (side === null) continue;
    team += b.maps.length;
    for (const id of b.ids[side]) byCard.set(baseCardId(id), (byCard.get(baseCardId(id)) ?? 0) + b.maps.length);
  }
  return { team, byCard };
}

export function stageBoxes(c: Pick<CareerState, 'boxScores'>, stage?: CareerStage): CompactSeries[] {
  return Object.entries(c.boxScores)
    .filter(([key]) => !stage || key.startsWith(`${stage}:`))
    .map(([, b]) => b);
}

/** Stat rows of a set of box scores, with the names and OVRs of this career (cheap OVR: the box's lineup as now). */
export function careerRows(c: CareerState, boxes: readonly CompactSeries[], onlyUser = false, stage: CareerStage = formStage(c)): StatRow[] {
  const lineups = new Map<string, Map<string, number>>();
  const ovrOf = (entrant: string, cardId: string): number => {
    let m = lineups.get(entrant);
    if (!m) {
      m = new Map();
      try {
        for (const p of lineupOf(c, entrant, stage).players) m.set(p.card.id, p.card.ovr);
      } catch {
        // The org's lineup can be incomplete between stages; the OVR falls back to the card's.
      }
      lineups.set(entrant, m);
    }
    const own = c.players.find((p) => p.cardId === baseCardId(cardId));
    return m.get(cardId) ?? (entrant === USER_ID && own ? own.ovr : cardById(baseCardId(cardId)).ovr);
  };
  return statRows(boxes, {
    teamName: (id) => nameOf(c, id),
    ovr: ovrOf,
    teamId: (entrant) => (entrant === USER_ID ? USER_ID : rosterByKey(entrant).teamId),
  }, onlyUser);
}

/** Prize, morale and (Masters/Champions) aura facts when a stage ends. */
function closeStage(c0: CareerState, stage: CareerStage): CareerState {
  let c = c0;
  const place = userPlacement(c, stage);
  if (inStage(c, stage) && place) {
    const prize = PRIZES[stage][place.rank] ?? 0;
    c = book(c, 'prize', prize, `Premiação: ${CAREER_STAGE_LABELS[stage]} ${place.label}`);
  }
  if (!inStage(c, stage)) return c;
  const boxes = stageBoxes(c, stage);
  const maps = userMaps(boxes);
  const champion = place?.rank === 1;
  let rows: StatRow[] = [];
  if (stage !== 'league') rows = careerRows(c, boxes, false, stage);
  const ranked = rows.filter((r) => r.maps >= EVENT_TOP3_MIN_MAPS).sort((x, y) => y.rating - x.rating || y.acs - x.acs);
  const players = c.players.map((p) => {
    if (p.status === 'academy') return p;
    const played = maps.byCard.get(p.cardId) ?? 0;
    const share = maps.team > 0 ? played / maps.team : 0;
    let morale = p.morale + (share >= 0.5 ? MORALE_PLAYED : share < 0.25 ? MORALE_BENCHED : 0);
    if (stage === 'league' && place) morale += place.rank <= 3 ? MORALE_LEAGUE_GOOD : place.rank >= 9 ? MORALE_LEAGUE_BAD : 0;
    if (champion) morale += MORALE_TITLE;
    const out: CareerPlayer = { ...p, morale: clampMorale(morale) };
    if (stage !== 'league' && played > 0) {
      const row = rows.find((r) => r.isUser && baseCardId(r.cardId) === p.cardId);
      const rank = ranked.findIndex((r) => r.isUser && baseCardId(r.cardId) === p.cardId);
      out.facts = {
        ...p.facts,
        events: p.facts.events + 1,
        titles: p.facts.titles + (champion ? 1 : 0),
        top3: p.facts.top3 + (rank >= 0 && rank < 3 ? 1 : 0),
        high: p.facts.high + (row && row.rating >= EVENT_HIGH_RATING ? 1 : 0),
      };
    }
    return out;
  });
  return { ...c, players };
}

/** Season ranking: every player with RANKING_MIN_MAPS competitive maps, best rating first. */
export function seasonRanking(c: CareerState): StatRow[] {
  return careerRows(c, stageBoxes(c))
    .filter((r) => r.maps >= RANKING_MIN_MAPS)
    .sort((x, y) => y.rating - x.rating || y.acs - x.acs || x.handle.localeCompare(y.handle));
}

const toAward = (r: StatRow): Award => ({
  playerId: cardById(baseCardId(r.cardId)).playerId,
  cardId: baseCardId(r.cardId),
  handle: r.handle,
  entrantId: r.entrantId,
  teamName: r.teamName,
  isUser: r.isUser,
  rating: r.rating,
  maps: r.maps,
});

function objectiveMet(c: CareerState, objective: SponsorObjective, ranking: readonly StatRow[]): boolean {
  const league = userPlacement(c, 'league');
  switch (objective) {
    case 'league-top6':
      return !!league && league.rank <= 6;
    case 'league-top4':
      return !!league && league.rank <= 4;
    case 'masters':
      return inStage(c, 'masters');
    case 'champions':
      return inStage(c, 'champions');
    case 'title':
      return league?.rank === 1 || c.masters?.champion === USER_ID || c.champions?.champion === USER_ID;
    case 'top5-rating':
      return ranking.slice(0, 5).some((r) => r.isUser);
  }
}

/** "Liga 2º → Masters 3º → Champions 9º–12º" (stages the org did not play are left out). */
function seasonPath(c: CareerState): string {
  const parts: string[] = [];
  for (const stage of CAREER_STAGES) {
    const p = userPlacement(c, stage);
    if (p) parts.push(`${CAREER_STAGE_LABELS[stage]} ${p.rank === 1 ? 'campeão' : p.label}`);
  }
  return parts.join(' → ');
}

/**
 * Season's end: awards (MVP and the rookie among every player of the season), sponsor objectives (bonus or −3
 * reputation), reputation by results, each player's season line (OVR, maps, share, rating) and the history record.
 * Cash ≤ BANKRUPTCY_FLOOR, or in the red for a second season in a row, ends the career (bankruptcy).
 */
function finishSeason(c0: CareerState): CareerState {
  let c = c0;
  const ranking = seasonRanking(c);
  const awards: SeasonRecord['awards'] = {};
  if (ranking[0]) awards.mvp = toAward(ranking[0]);
  const veterans = new Set(c.leaguePlayers);
  const rookie = ranking.find((r) => {
    const pid = cardById(baseCardId(r.cardId)).playerId;
    return c.season === 1 ? experience(pid, c.year) <= 1 : !veterans.has(pid);
  });
  if (rookie) awards.rookie = toAward(rookie);
  const userRows = ranking.filter((r) => r.isUser);
  if (userRows[0]) awards.orgBest = toAward(userRows[0]);

  // Sponsors.
  const sponsors: SponsorResult[] = [];
  let rep = c.reputation;
  for (const s of c.sponsors) {
    const met = objectiveMet(c, s.objective, ranking);
    sponsors.push({ name: s.name, objective: s.objective, base: s.base, bonus: met ? s.bonus : 0, met });
    if (met) c = book(c, 'bonus', s.bonus, `Bônus: ${s.name}`);
    else rep += REP_SPONSOR_FAIL;
  }

  // Reputation by results.
  const league = userPlacement(c, 'league');
  const masters = inStage(c, 'masters') ? userPlacement(c, 'masters') : null;
  const champions = inStage(c, 'champions') ? userPlacement(c, 'champions') : null;
  rep += (league && REP_LEAGUE[league.rank]) ?? 0;
  if (masters) rep += REP_MASTERS_ENTRY + (REP_MASTERS[masters.rank] ?? 0);
  if (champions) rep += REP_CHAMPIONS_ENTRY + (REP_CHAMPIONS[champions.rank] ?? 0);
  if (awards.mvp?.isUser) rep += REP_SEASON_MVP;
  rep += REP_DRIFT;
  const reputation = Math.max(0, Math.min(100, Math.round(rep)));

  // Player season lines and the MVP fact.
  const all = stageBoxes(c);
  const maps = userMaps(all);
  const intl = userMaps([...stageBoxes(c, 'masters'), ...stageBoxes(c, 'champions')]);
  const userStats = careerRows(c, all, true);
  const players = c.players.map((p) => {
    const row = userStats.find((r) => baseCardId(r.cardId) === p.cardId);
    const played = maps.byCard.get(p.cardId) ?? 0;
    const intlPlayed = intl.byCard.get(p.cardId) ?? 0;
    const line: PlayerSeasonLine = {
      year: c.year,
      status: p.status,
      ovr: p.ovr,
      maps: played,
      share: maps.team > 0 ? Math.round((played / maps.team) * 100) / 100 : 0,
      rating: row?.rating ?? 0,
      acs: row?.acs ?? 0,
      kills: row?.kills ?? 0,
      deaths: row?.deaths ?? 0,
      assists: row?.assists ?? 0,
      mvps: row?.seriesMvps ?? 0,
      international: intl.team > 0 && intlPlayed / intl.team >= 0.5,
    };
    const facts = awards.mvp?.isUser && awards.mvp.playerId === p.id ? { ...p.facts, mvpAwards: p.facts.mvpAwards + 1 } : p.facts;
    return { ...p, facts, history: [...p.history, line] };
  });

  const titles = CAREER_STAGES.filter((s) => userPlacement(c, s)?.rank === 1);
  const winners: SeasonRecord['winners'] = {};
  const leagueWinner = c.league?.champion;
  if (leagueWinner) winners.league = nameOf(c, leagueWinner);
  if (c.masters?.champion) winners.masters = nameOf(c, c.masters.champion);
  if (c.champions?.champion) winners.champions = nameOf(c, c.champions.champion);
  const byKind: Partial<Record<LedgerKind, number>> = {};
  for (const e of c.ledger) byKind[e.kind] = (byKind[e.kind] ?? 0) + e.amount;

  const bankrupt = c.money <= BANKRUPTCY_FLOOR || (c.money < 0 && c.debtWarning);
  let strength = 0;
  try {
    strength = Math.round(teamStrength(baseUserLineup({ ...c, players })).total * 10) / 10;
  } catch {
    // An incomplete lineup (sold starters) has no strength to report.
  }
  const record: SeasonRecord = {
    season: c.season,
    year: c.year,
    strength,
    league,
    masters,
    champions,
    titles,
    winners,
    awards,
    sponsors,
    money: { start: c.seasonStart.money, end: c.money, byKind },
    reputation: { start: c.seasonStart.reputation, end: reputation },
    path: seasonPath(c),
  };
  if (bankrupt) record.bankrupt = true;
  const leaguePlayers = new Set(c.leaguePlayers);
  for (const b of stageBoxes(c, 'league')) for (const side of b.ids) for (const id of side) leaguePlayers.add(cardById(baseCardId(id)).playerId);
  const next: CareerState = {
    ...c,
    players,
    reputation,
    phase: bankrupt ? 'over' : 'report',
    debtWarning: c.money < 0,
    leaguePlayers: [...leaguePlayers].sort(),
    history: [...c.history, record],
  };
  if (bankrupt) next.over = 'bankrupt';
  return next;
}

/**
 * From the season report to the next off-season: the year advances; every player ages (world.ts agingStep: the
 * org's with playing time, morale, focus, academy and big stages; the AI's as starters); contracts lose a season
 * (0 = expiring: renew or he leaves when the league starts); morale moves halfway back to MORALE_START; the league's
 * AI teams retire players at RETIRE_EXPERIENCE and sometimes swap their weakest; the season's competitions, scrims,
 * sponsors and ledger are cleared and the off-season window opens.
 */
export function advanceToNextSeason(c: CareerState): CareerState {
  if (c.phase === 'over') throw new Error('Carreira encerrada');
  if (c.phase !== 'report') throw new Error('A temporada ainda não terminou');
  const year = c.year + 1;
  const players = c.players.map((p) => {
    const line = p.history.find((h) => h.year === c.year);
    const step = agingStep(agingRng(c.seed, year, p.id), {
      ovr: p.ovr,
      potential: p.potential,
      experience: experience(p.id, year),
      prodigy: playerInfo(p.id).prodigy,
      share: line?.share ?? 0,
      morale: p.morale,
      focus: !!p.focus,
      academy: p.status === 'academy',
      international: !!line?.international,
      scene: sceneShift(c.seed, year),
    });
    return {
      ...p,
      ovr: step.ovr,
      potential: Math.max(p.potential, step.ovr),
      morale: clampMorale(p.morale + (MORALE_START - p.morale) * MORALE_RESET),
      contract: { ...p.contract, years: Math.max(0, p.contract.years - 1) },
      progress: { year, from: p.ovr, to: step.ovr, parts: step.parts },
    };
  });
  const aged: CareerState = { ...c, year, season: c.season + 1, players };
  const world = evolveAiTeams(aged);
  const next: CareerState = {
    ...aged,
    ...world,
    phase: 'offseason',
    sponsors: [],
    userSeries: {},
    boxScores: {},
    mapsPlayed: {},
    scrims: [],
    ledger: [],
    seasonStart: { money: c.money, reputation: c.reputation },
  };
  delete next.league;
  delete next.masters;
  delete next.champions;
  delete next.veto;
  return openWindow(next, 'offseason');
}

/** The league's AI teams one season later: aging, retirements and (AI_SWAP_CHANCE) the weakest non-IGL swapped. */
function evolveAiTeams(c: CareerState): Pick<CareerState, 'aiTeams' | 'freeAgents'> {
  const freeAgents = { ...c.freeAgents };
  let teams = c.aiTeams.map((t) => ({
    ...t,
    players: t.players.map((p) => ({
      ...p,
      ovr: agingStep(agingRng(c.seed, c.year, p.id), {
        ovr: p.ovr,
        potential: Math.max(p.ovr, potentialOf(c.seed, p.id)),
        experience: experience(p.id, c.year),
        prodigy: playerInfo(p.id).prodigy,
        share: 1,
        scene: sceneShift(c.seed, c.year),
      }).ovr,
    })),
  }));
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i]!;
    const rng = createRng(`${c.seed}:${c.year}:ai:${team.id}`);
    let players = [...team.players];
    const world = (): CareerState => ({ ...c, freeAgents, aiTeams: teams.map((t, j) => (j === i ? { ...t, players } : t)) });
    const fill = (out: AiPlayer, minOvr: number): boolean => {
      const card = cardById(out.cardId);
      const fa = bestFreeAgent(world(), card.role, card.isIGL, new Set());
      if (!fa || fa.ovr < minOvr) return false;
      players = players.filter((p) => p.id !== out.id);
      players.push({ id: fa.playerId, cardId: playerInfo(fa.playerId).cardId, ovr: fa.ovr });
      delete freeAgents[fa.playerId];
      return true;
    };
    for (const p of team.players) {
      if (experience(p.id, c.year) >= RETIRE_EXPERIENCE) fill(p, -Infinity);
    }
    if (rng.next() < AI_SWAP_CHANCE) {
      const weakest = players.filter((p) => !cardById(p.cardId).isIGL).sort((x, y) => x.ovr - y.ovr || x.id.localeCompare(y.id))[0];
      if (weakest && fill(weakest, weakest.ovr + AI_SWAP_MIN_GAIN)) freeAgents[weakest.id] = weakest.ovr;
    }
    teams = teams.map((t, j) => (j === i ? { ...t, players } : t));
  }
  return { aiTeams: teams, freeAgents };
}

// ---------------------------------------------------------------------------
// The org's matches (mirrors season.ts)
// ---------------------------------------------------------------------------

export interface CareerPendingMatch {
  stage: CareerStage;
  match: CareerMatch;
  side: TeamIndex;
}

export function userPendingMatch(c: CareerState): CareerPendingMatch | null {
  const stage = c.phase;
  if (stage !== 'league' && stage !== 'masters' && stage !== 'champions') return null;
  const match = stagePending(c, stage).find(involvesUser);
  return match ? { stage, match, side: match.a === USER_ID ? 0 : 1 } : null;
}

function requirePending(c: CareerState): CareerPendingMatch {
  const pending = userPendingMatch(c);
  if (!pending) throw new Error('The user has no pending match');
  return pending;
}

/** Lineup the AI vetoes with: the lineup plus its map familiarity this season. */
export function careerVetoLineup(c: CareerState, id: string): Lineup {
  return withFamiliarity(lineupOf(c, id), familiarityOf(c.mapsPlayed, id));
}

function resolveOpponentTurns(c: CareerState, pending: CareerPendingMatch, start: VetoState): VetoState {
  const lineups: [Lineup, Lineup] = [careerVetoLineup(c, pending.match.a), careerVetoLineup(c, pending.match.b)];
  let state = start;
  for (let turn = nextTurn(state); turn && turn.team !== pending.side; turn = nextTurn(state)) {
    const rng = createRng(`${c.seed}:${c.year}:${pending.stage}:${pending.match.id}:veto:${state.steps.length}`);
    state = applyVeto(state, aiChooseMap(state, lineups, rng, difficultySettings(c.org.difficulty).vetoNoise));
  }
  return state;
}

/** Opens the veto of the org's next match (team `a` bans first); the opponent's turns resolve right away. */
export function beginUserVeto(c: CareerState): CareerState {
  const pending = requirePending(c);
  if (starters(c).length < STARTERS) throw new Error('Escalação incompleta: são precisos 5 titulares');
  if (c.veto?.stage === pending.stage && c.veto.matchId === pending.match.id) return c;
  const state = createVeto(CAREER_MAP_POOL, pending.match.bestOf, 0);
  return { ...c, veto: { stage: pending.stage, matchId: pending.match.id, state: resolveOpponentTurns(c, pending, state) } };
}

export function applyUserVeto(c: CareerState, map: MapName): CareerState {
  const pending = requirePending(c);
  const veto = c.veto;
  if (!veto || veto.stage !== pending.stage || veto.matchId !== pending.match.id) throw new Error('No veto in progress for the user match');
  const turn = nextTurn(veto.state);
  if (!turn) throw new Error('Veto is already complete');
  if (turn.team !== pending.side) throw new Error('It is not the user turn in the veto');
  return { ...c, veto: { ...veto, state: resolveOpponentTurns(c, pending, applyVeto(veto.state, map)) } };
}

/** Plays the org's match with the finished veto, then everything scheduled before its next one. */
export function playUserMatch(c: CareerState): CareerState {
  const pending = requirePending(c);
  const veto = c.veto;
  if (!veto || veto.stage !== pending.stage || veto.matchId !== pending.match.id || !isVetoComplete(veto.state)) {
    throw new Error('The user match needs a complete veto');
  }
  const played = playSeries(c, pending.stage, pending.match, veto.state);
  const next: CareerState = {
    ...stageReport(c, pending.stage, pending.match, played),
    userSeries: { ...c.userSeries, [seriesKey(pending.stage, pending.match.id)]: played.series },
  };
  delete next.veto;
  return advance(next);
}

/** The stage and match behind a series key (scrims are not matches). */
export function findCareerMatch(c: CareerState, key: string): { stage: CareerStage; match: CareerMatch } | undefined {
  const i = key.indexOf(':');
  const stage = key.slice(0, i) as CareerStage;
  if (!CAREER_STAGES.includes(stage)) return undefined;
  const match = stageMatches(c, stage).find((m) => m.id === key.slice(i + 1));
  return match ? { stage, match } : undefined;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const PHASES: readonly CareerPhase[] = ['offseason', 'league', 'midseason', 'masters', 'champions', 'report', 'over'];

/** Validates a parsed save. Returns null for anything that is not a usable CareerState. */
export function parseCareer(data: unknown): CareerState | null {
  try {
    if (!data || typeof data !== 'object') return null;
    const c = data as CareerState;
    if (c.version !== CAREER_VERSION || typeof c.seed !== 'string') return null;
    if (!PHASES.includes(c.phase)) return null;
    if (!c.org || !REGIONS.includes(c.org.region) || !isDifficulty(c.org.difficulty) || typeof c.org.name !== 'string') return null;
    if (typeof c.money !== 'number' || typeof c.reputation !== 'number' || typeof c.year !== 'number') return null;
    if (!Array.isArray(c.players) || !Array.isArray(c.aiTeams) || c.aiTeams.length !== LEAGUE_AI_TEAMS) return null;
    for (const key of ['userSeries', 'boxScores', 'mapsPlayed', 'freeAgents'] as const) if (!c[key] || typeof c[key] !== 'object') return null;
    if (!Array.isArray(c.history) || !Array.isArray(c.ledger) || !Array.isArray(c.scrims) || !Array.isArray(c.sponsors)) return null;
    for (const p of c.players) {
      cardById(p.cardId);
      if (!p.contract || typeof p.contract.salary !== 'number') return null;
    }
    for (const t of c.aiTeams) {
      rosterByKey(t.id);
      for (const p of t.players) cardById(p.cardId);
      if (t.players.length !== 5) return null;
    }
    if ((c.phase === 'offseason' || c.phase === 'midseason') && (!c.window || c.window.kind !== c.phase)) return null;
    if (['league', 'masters', 'champions'].includes(c.phase) && !c.league) return null;
    if (c.phase === 'masters' && !c.masters) return null;
    if (c.phase === 'champions' && !c.champions) return null;
    if (starters(c).length === STARTERS) baseUserLineup(c);
    userPendingMatch(c);
    return c;
  } catch {
    return null;
  }
}

