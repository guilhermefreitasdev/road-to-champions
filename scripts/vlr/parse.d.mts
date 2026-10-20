// Type declarations for parse.mjs (used by the Vitest suite in src/data/real/vlr/).

export function num(text: string | null | undefined): number | null;
export function idFromHref(href: string | null | undefined, kind: string): { id: number; slug: string | null } | null;
export function agentSlug(name: string): string;

export interface ListedEvent {
  id: number;
  path: string;
  title: string;
  status: string | null;
}
export function parseEventListing(html: string): { events: ListedEvent[]; pages: number[] };
export type VlrRegion = 'americas' | 'emea' | 'pacific' | 'china';
export type VlrStage = 'league' | 'kickoff' | 'stage1' | 'stage2';
export function classifyEventTitle(title: string): 'masters' | 'champions' | null;
export function classifyRegionalTitle(title: string): { year: number; region: VlrRegion; stage: VlrStage } | null;
export function classifyEvent(
  title: string,
): { tier: 'masters' | 'champions' | 'regional'; region: VlrRegion | null; stage: VlrStage | null } | null;
export function shortEventName(
  title: string,
  tier: 'masters' | 'champions' | 'regional',
  year: number | null,
  regional?: { region: VlrRegion; stage: VlrStage } | null,
): string;
export function slugify(s: string): string;
export function parseDateRange(text: string | null | undefined): { start: string | null; end: string | null };
export function parsePlacement(text: string | null | undefined): { min: number; max: number } | null;

export interface EventPage {
  title: string | null;
  datesText: string | null;
  prize: string | null;
  location: string | null;
  locationCountry: string | null;
  stages: { path: string | undefined; title: string; active: boolean }[];
  standings: {
    placeText: string;
    place: { min: number; max: number } | null;
    teamId: number;
    teamSlug: string | null;
    name: string;
    country: string | null;
  }[];
  rosters: {
    teamId: number | null;
    teamSlug: string | null;
    name: string | null;
    players: { id: number; handle: string; country: string | null }[];
  }[];
}
export function parseEventPage(html: string): EventPage;

export interface StatsRow {
  playerId: number;
  playerSlug: string | null;
  handle: string;
  teamTag: string | null;
  country: string | null;
  agents: { agent: string; pct: number | null }[];
  agentsHidden: number;
  maps: number | null;
  rounds: number | null;
  rating: number | null;
  acs: number | null;
  kd: number | null;
  kast: number | null;
  adr: number | null;
  kpr: number | null;
  apr: number | null;
  fkfd: number | null;
  fkPct: number | null;
  fdPct: number | null;
  hsPct: number | null;
  clutchPct: number | null;
  clutches: string | null;
  clutchesWon: number | null;
  clutchesPlayed: number | null;
  kmax: number | null;
  k: number | null;
  d: number | null;
  a: number | null;
  fk: number | null;
  fd: number | null;
}
export function parseStatsPage(html: string, agentNameBySlug?: Record<string, string>): StatsRow[];
export function parseStatsStageGroups(html: string): { label: string; values: string[] }[];
export function isShowmatch(text: string | null | undefined): boolean;
export function parseAgentsPageMaps(html: string): { map: string; played: number | null }[];
export function parseMatchList(
  html: string,
): { id: number; path: string; teams: string[]; status: string | null; series: string | null }[];
export function splitVeto(note: string | null | undefined): string[] | null;

export interface MatchPage {
  date: string | null;
  patch: string | null;
  teams: { id: number | null; name: string | null; players: { id: number; handle: string; tag: string | null }[] }[];
  score: (number | null)[];
  maps: { gameId: number; map: string | null; score: (number | null)[]; pickedBy: 1 | 2 | null }[];
  vetoRaw: string | null;
  veto: string[] | null;
}
export function parseMatchPage(html: string): MatchPage;

export interface MapPlayerStats {
  playerId: number;
  handle: string;
  side: 1 | 2;
  agent: string | null;
  rating: number | null;
  acs: number | null;
  k: number | null;
  d: number | null;
  a: number | null;
}
export interface MatchMapStats {
  eventId: number | null;
  date: string | null;
  maps: { gameId: number; map: string | null; rounds: number | null; players: MapPlayerStats[] }[];
}
export function parseMatchMapStats(html: string, agentNameBySlug?: Record<string, string>): MatchMapStats;

export interface AgentCell {
  maps: number;
  rounds: number;
  rating: number | null;
  acs: number | null;
  k: number | null;
  d: number | null;
}
/** playerId → year → agent → cell. */
export type AgentStatsByPlayer = Record<string, Record<string, Record<string, AgentCell>>>;
export function aggregateAgentStats(
  matches: { year: number; maps: MatchMapStats['maps'] }[],
  keep?: (playerId: number) => boolean,
): AgentStatsByPlayer;

/** The subset of a full event file that src/data/real/cards.ts reads (vlr/slim.json). */
export function slimEvent(event: unknown): unknown;

export interface SeriesPage {
  eventId: number | null;
  eventPath: string | null;
  stage: string | null;
  round: string | null;
  date: string | null;
  bestOf: number | null;
  teams: { id: number | null; slug: string | null; name: string | null }[];
  score: (number | null)[];
  maps: { map: string | null; score: number[]; pickedBy: 1 | 2 | null }[];
}
export function parseSeriesPage(html: string): SeriesPage;
export function seriesProblem(s: SeriesPage): string | null;
export interface CompactSeries {
  id: number;
  event: string;
  stage: string | null;
  round: string | null;
  date: string | null;
  bo: number | null;
  teams: [number | null, string | null, string | null][];
  score: (number | null)[];
  maps: [string | null, number, number, 1 | 2 | null][];
}
export function compactSeries(matchId: number, eventSlug: string, s: SeriesPage): CompactSeries;
