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
export function classifyEventTitle(title: string): 'masters' | 'champions' | null;
export function shortEventName(title: string, tier: 'masters' | 'champions', year: number | null): string;
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
  teams: { id: number | null; name: string | null }[];
  score: (number | null)[];
  maps: { gameId: number; map: string | null; score: (number | null)[]; pickedBy: 1 | 2 | null }[];
  vetoRaw: string | null;
  veto: string[] | null;
}
export function parseMatchPage(html: string): MatchPage;
