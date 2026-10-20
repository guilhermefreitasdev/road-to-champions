/**
 * The facts the Daily draws from, indexed once: players (handle, country, main role, cards, fame), every
 * player-team-event membership of the VLR snapshot (subs included, for the Impostor's checks), teams, events and
 * the real series. Pure: built from the data passed in (the real pool in ./index.ts, small fixtures in tests).
 * Nothing here is invented: every clue later shown is a field of these structures.
 */
import type { AgentStatsData, VlrEventData } from '../../data/real/cards';
import { teamIdResolver } from '../../data/real/regions';
import type { SeriesResult } from '../../data/real/series';
import type { AuraTier, Card, Region, Role, RosterEntry } from '../../engine/types';
import { normalizeName } from './text';

export interface DailyEvent {
  id: string;
  name: string;
  /** 'masters' | 'champions' | 'regional'. */
  tier: string;
  year: number;
  startDate: string;
  /** Maps played at the event (its pool), most played first. */
  maps: string[];
}

/** A player was on a team's list at an event (VLR event page); `main` = one of the 5 with the most rounds. */
export interface Membership {
  playerId: string;
  teamId: string;
  eventId: string;
  year: number;
  main: boolean;
}

export interface DailyPlayer {
  playerId: string;
  handle: string;
  /** normalizeName(handle). */
  norm: string;
  /** ISO code from the most recent card with one ('' when none). */
  country: string;
  /** Most played role over the player's cards (weighted by rounds). */
  role: Role;
  /** Every card of the player (one per roster), oldest event first. */
  cards: { card: Card; entry: RosterEntry }[];
  region: Region | undefined;
  firstYear: number;
  lastYear: number;
  intlEvents: number;
  intlTitles: number;
  /** Fame proxy (international events, titles, aura, rating top-3s, best OVR): the difficulty curve's scale. */
  fame: number;
  /** Team of the most recent card (for the autocomplete's second line). */
  lastTeamName: string;
}

export interface DailyTeam {
  teamId: string;
  /** Name at the most recent event. */
  name: string;
  /** normalizeName(name): two pool ids with the same name are one "team" to a reader (the Impostor checks both). */
  norm: string;
  region: Region | undefined;
  /** Rosters of the team in the pool (5 cards each), oldest first. */
  rosters: RosterEntry[];
  fame: number;
}

export interface DailyData {
  players: ReadonlyMap<string, DailyPlayer>;
  /** Every player, sorted by handle (autocomplete). */
  playerList: readonly DailyPlayer[];
  /** Normalized handles shared by two or more players (never an answer, never shown side by side). */
  dupNorms: ReadonlySet<string>;
  teams: ReadonlyMap<string, DailyTeam>;
  events: ReadonlyMap<string, DailyEvent>;
  /** Pool rosters (`${teamId}@${eventId}`). */
  rosters: ReadonlyMap<string, RosterEntry>;
  memberships: readonly Membership[];
  byPlayer: ReadonlyMap<string, readonly Membership[]>;
  /** Pool team ids sharing a normalized name with the key's team (itself included). */
  teamFamily(teamId: string): ReadonlySet<string>;
  /** Name of any team id of the snapshot (most recent event's name), rosters or not. */
  teamName(teamId: string): string;
  series: readonly SeriesResult[];
  /** Most played agents over the player's career (VLR map scoreboards): agent and maps. */
  topAgents(playerId: string, n?: number): { agent: string; maps: number }[];
  /** Fame of a roster (event tier, placement, its players). */
  rosterFame(entry: RosterEntry): number;
}

export const rosterKey = (e: Pick<RosterEntry, 'teamId' | 'eventId'>): string => `${e.teamId}@${e.eventId}`;

const AURA_FAME: Record<AuraTier, number> = { rising: 1, star: 4, legend: 8, goat: 12 };
const ROLE_ORDER: Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];

/** Lowest place in a published placement ("3rd–4th" → 3); null when none. */
export function placementRank(text: string | undefined): number | null {
  const m = /(\d+)/.exec(text ?? '');
  return m ? Number(m[1]) : null;
}

function tierFame(tier: string): number {
  return tier === 'champions' ? 10 : tier === 'masters' ? 7 : 0;
}

function placementFame(text: string | undefined): number {
  const p = placementRank(text);
  return p === 1 ? 8 : p === 2 ? 5 : p !== null && p <= 4 ? 3 : 0;
}

export function buildDailyData(
  rosters: readonly RosterEntry[],
  events: readonly VlrEventData[],
  series: readonly SeriesResult[],
  agentStats: AgentStatsData,
): DailyData {
  const eventList: DailyEvent[] = events
    .map((e) => ({
      id: e.slug,
      name: e.shortName,
      tier: e.tier,
      year: e.year,
      startDate: e.startDate ?? `${e.year}-01-01`,
      maps: [...e.mapPool].sort((a, b) => (b.played ?? 0) - (a.played ?? 0)).map((m) => m.map),
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
  const eventsById = new Map(eventList.map((e) => [e.id, e]));
  const eventOrder = new Map(eventList.map((e, i) => [e.id, i]));
  const orderOf = (eventId: string) => eventOrder.get(eventId) ?? -1;

  // Memberships (subs included) and the names of every pool team id.
  const resolve = teamIdResolver(events);
  const memberships: Membership[] = [];
  const teamNameAt = new Map<string, { name: string; order: number }>();
  for (const e of events) {
    for (const t of e.teams) {
      const teamId = resolve(t);
      const order = orderOf(e.slug);
      const prev = teamNameAt.get(teamId);
      if (t.name && (!prev || prev.order <= order)) teamNameAt.set(teamId, { name: t.name, order });
      if (t.played === false) continue;
      for (const p of t.players) memberships.push({ playerId: String(p.playerId), teamId, eventId: e.slug, year: e.year, main: p.main });
    }
  }
  const byPlayer = new Map<string, Membership[]>();
  for (const m of memberships) {
    const list = byPlayer.get(m.playerId) ?? [];
    list.push(m);
    byPlayer.set(m.playerId, list);
  }

  // Players from the cards.
  const sortedRosters = [...rosters].sort((a, b) => orderOf(a.eventId) - orderOf(b.eventId) || a.teamId.localeCompare(b.teamId));
  const cardsOf = new Map<string, { card: Card; entry: RosterEntry }[]>();
  for (const entry of sortedRosters) {
    for (const card of entry.cards) {
      const list = cardsOf.get(card.playerId) ?? [];
      list.push({ card, entry });
      cardsOf.set(card.playerId, list);
    }
  }
  const players = new Map<string, DailyPlayer>();
  for (const [playerId, cards] of cardsOf) {
    const last = cards[cards.length - 1]!;
    const roleRounds = new Map<Role, number>();
    for (const { card } of cards) roleRounds.set(card.role, (roleRounds.get(card.role) ?? 0) + (card.stats?.rounds ?? 1));
    const role = [...ROLE_ORDER].sort((a, b) => (roleRounds.get(b) ?? 0) - (roleRounds.get(a) ?? 0))[0]!;
    const intl = cards.filter((c) => (c.entry.tier ?? 'international') === 'international');
    const titles = intl.filter((c) => placementRank(c.entry.placement) === 1).length;
    const aura = cards.reduce((best, c) => Math.max(best, c.card.aura ? AURA_FAME[c.card.aura] : 0), 0);
    const top3 = cards.reduce((best, c) => Math.max(best, c.card.career?.top3 ?? 0), 0);
    const maxOvr = cards.reduce((best, c) => Math.max(best, c.card.ovr), 0);
    const country = [...cards].reverse().find((c) => c.card.country)?.card.country ?? '';
    players.set(playerId, {
      playerId,
      handle: last.card.handle,
      norm: normalizeName(last.card.handle),
      country,
      role,
      cards,
      region: last.entry.region,
      firstYear: cards[0]!.entry.year,
      lastYear: last.entry.year,
      intlEvents: intl.length,
      intlTitles: titles,
      fame: 4 * intl.length + 6 * titles + aura + 3 * top3 + Math.max(0, maxOvr - 75) + 0.5 * (cards.length - intl.length),
      lastTeamName: last.entry.teamName,
    });
  }
  const normCount = new Map<string, number>();
  for (const p of players.values()) normCount.set(p.norm, (normCount.get(p.norm) ?? 0) + 1);
  const dupNorms = new Set([...normCount].filter(([, n]) => n > 1).map(([k]) => k));
  const playerList = [...players.values()].sort((a, b) => a.norm.localeCompare(b.norm) || a.playerId.localeCompare(b.playerId));

  const rosterFame = (entry: RosterEntry): number => {
    const ps = entry.cards.map((c) => players.get(c.playerId)?.fame ?? 0);
    return tierFame(eventsById.get(entry.eventId)?.tier ?? '') + placementFame(entry.placement) + ps.reduce((s, f) => s + f, 0) / 15;
  };

  // Teams.
  const teams = new Map<string, DailyTeam>();
  for (const entry of sortedRosters) {
    const t = teams.get(entry.teamId);
    if (t) t.rosters.push(entry);
    else {
      const name = teamNameAt.get(entry.teamId)?.name ?? entry.teamName;
      teams.set(entry.teamId, { teamId: entry.teamId, name, norm: normalizeName(name), region: entry.region, rosters: [entry], fame: 0 });
    }
  }
  for (const t of teams.values()) {
    t.region = t.rosters[t.rosters.length - 1]!.region;
    t.fame = t.rosters.reduce((s, r) => s + tierFame(eventsById.get(r.eventId)?.tier ?? '') / 2 + placementFame(r.placement), 0);
  }
  const familyByNorm = new Map<string, Set<string>>();
  for (const [teamId, { name }] of teamNameAt) {
    const n = normalizeName(name);
    familyByNorm.set(n, (familyByNorm.get(n) ?? new Set()).add(teamId));
  }
  const teamFamily = (teamId: string): ReadonlySet<string> => {
    const name = teamNameAt.get(teamId)?.name ?? teams.get(teamId)?.name;
    const fam = new Set(name ? (familyByNorm.get(normalizeName(name)) ?? []) : []);
    fam.add(teamId);
    return fam;
  };

  const topAgents = (playerId: string, n = 3): { agent: string; maps: number }[] => {
    const years = agentStats[playerId];
    if (!years) return [];
    const maps = new Map<string, number>();
    for (const agents of Object.values(years)) {
      for (const [agent, cell] of Object.entries(agents)) maps.set(agent, (maps.get(agent) ?? 0) + cell.maps);
    }
    return [...maps]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([agent, m]) => ({ agent, maps: m }));
  };

  return {
    players,
    playerList,
    dupNorms,
    teams,
    events: eventsById,
    rosters: new Map(sortedRosters.map((r) => [rosterKey(r), r])),
    memberships,
    byPlayer,
    teamFamily,
    teamName: (teamId) => teamNameAt.get(teamId)?.name ?? teams.get(teamId)?.name ?? teamId,
    series: [...series],
    topAgents,
    rosterFame,
  };
}
