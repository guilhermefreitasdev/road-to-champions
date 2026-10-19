/**
 * Real card builder: VLR player-event stats + Liquipedia (IGL, coach) → the roster pool the game plays with.
 *
 * Pure and deterministic: the same input always gives the same cards (no Math.random, no I/O, no clock).
 * Every number on a card is derived here from the committed data; nothing is typed in by hand. A stat the
 * source does not have counts as the neutral 50th percentile (never a guess), and the card keeps `null` in
 * its `stats`. The formulas are summarized in pt-BR in docs/design.md ("Núcleo de simulação").
 */
import type { Attributes, Card, Coach, MapName, Role, RosterEntry } from '../../engine/types';
import type { LiquipediaEvent, LiquipediaPlayer, LiquipediaTeam } from './liquipedia';

// ---------------------------------------------------------------------------
// Input shapes: the subset of the generated JSON the builder reads (see docs/data.md).
// ---------------------------------------------------------------------------

export interface VlrAgentUse {
  agent: string;
  pct: number | null;
}

export interface VlrPlayerRow {
  playerId: number;
  playerSlug: string;
  handle: string;
  country: string | null;
  teamId: number;
  agents: VlrAgentUse[];
  rounds: number | null;
  rating: number | null;
  acs: number | null;
  kast: number | null;
  adr: number | null;
  kpr: number | null;
  apr: number | null;
  fkPct: number | null;
  fdPct: number | null;
  hsPct: number | null;
  clutchesWon: number | null;
  clutchesPlayed: number | null;
}

export interface VlrTeamRow {
  id: number;
  slug: string;
  name: string | null;
  tag: string | null;
  played: boolean;
  placement: { text: string; min: number; max: number } | null;
  players: { playerId: number; main: boolean }[];
}

export interface VlrMatch {
  teams: { id: number | null }[];
  maps: { map: string | null; pickedBy?: number | null }[];
  veto: string[] | null;
}

export interface VlrEventData {
  slug: string;
  shortName: string;
  year: number;
  tier: string;
  startDate: string | null;
  mapPool: { map: string; played: number | null }[];
  teams: VlrTeamRow[];
  players: VlrPlayerRow[];
  matches: VlrMatch[];
}

// ---------------------------------------------------------------------------
// Tunables (documented in docs/design.md)
// ---------------------------------------------------------------------------

/** A roster enters the pool only if each of its 5 main players has at least this many rounds (≈ 1,5 mapa). */
export const MIN_ROUNDS = 30;
/** Sample shrinkage: a percentile keeps rounds / (rounds + SHRINK_ROUNDS) of its distance from 50. */
export const SHRINK_ROUNDS = 60;
/** Attribute scale: percentile 0 → 40, percentile 100 → 99. */
const ATTR_FLOOR = 40;
const ATTR_SPAN = 59;
/** OVR from the (shrunk) performance percentile: 0 → 63, 100 → 92, before the event bonuses. */
const OVR_FLOOR = 63;
const OVR_SPAN = 29;
const OVR_MIN = 50;
const OVR_MAX = 99;
/** Clutch rate is shrunk toward the year's pooled rate as if the player had this many extra attempts at it. */
export const CLUTCH_PRIOR_ATTEMPTS = 10;
/**
 * A roster missing a role may move a player out of a doubled role into it, but only if that player used agents
 * of the missing role in at least this share of their picks at the event (e.g. a Viper player with 30% Killjoy).
 */
export const FLEX_MIN_SHARE = 0.2;
/** Leadership (not a stat: a rule over the Liquipedia IGL data). */
export const LEADERSHIP = { captain: 90, infobox: 80, iglElsewhere: 60, none: 45 } as const;

const ROLES: readonly Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];

export type RoleWeights = Record<Role, number>;

// ---------------------------------------------------------------------------
// Small pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Lowercase ASCII letters and digits only: "KRÜ Esports" → "kruesports", "Less" → "less". */
export function normHandle(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'x'
  );
}

/** Mid-rank percentile of `v` among `sorted` (ascending): 100 × (below + ½·equal) / n. 50 when there is no data. */
export function percentile(sorted: readonly number[], v: number): number {
  const n = sorted.length;
  if (n === 0) return 50;
  let below = 0;
  let equal = 0;
  for (const x of sorted) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (100 * (below + equal / 2)) / n;
}

/** Pulls a percentile toward 50 by sample size; a missing percentile (null) is the neutral 50. */
export function shrink(p: number | null, rounds: number): number {
  if (p === null) return 50;
  const w = rounds / (rounds + SHRINK_ROUNDS);
  return 50 + (p - 50) * w;
}

/** Weighted mean of the available values; null when none is available (weights renormalized over the rest). */
export function blend(parts: readonly [number | null, number][]): number | null {
  let sum = 0;
  let weight = 0;
  for (const [v, w] of parts) {
    if (v === null) continue;
    sum += v * w;
    weight += w;
  }
  return weight > 0 ? sum / weight : null;
}

/** Clutch win rate shrunk toward `prior` (the year's pooled rate), in %. Null without attempts data. */
export function shrunkClutchRate(won: number | null, played: number | null, prior: number): number | null {
  if (won === null || played === null) return null;
  return (100 * (won + (CLUTCH_PRIOR_ATTEMPTS * prior) / 100)) / (played + CLUTCH_PRIOR_ATTEMPTS);
}

/**
 * Share of each role in a player's agent usage. Uses the VLR pick % when present, otherwise the order
 * (3, 2, 1 for the top 3). Agents we do not know are ignored.
 */
export function roleWeights(agents: readonly VlrAgentUse[], agentRoles: Readonly<Record<string, Role>>): RoleWeights {
  const w: RoleWeights = { duelist: 0, initiator: 0, controller: 0, sentinel: 0 };
  const usePct = agents.some((a) => a.pct !== null);
  agents.forEach((a, i) => {
    const role = agentRoles[a.agent];
    if (!role) return;
    w[role] += usePct ? a.pct ?? 0 : Math.max(1, 3 - i);
  });
  return w;
}

/**
 * Main role from this event's weights. A tie (or no known agent) is broken by the player's weights over all
 * their events (`career`), then by the fixed order initiator → controller → sentinel → duelist.
 */
export function pickRole(event: RoleWeights, career?: RoleWeights): Role {
  const top = (w: RoleWeights, among: readonly Role[]) => {
    const max = Math.max(...among.map((r) => w[r]));
    return among.filter((r) => w[r] === max);
  };
  let tied = top(event, ROLES);
  if (tied.length > 1 && career) tied = top(career, tied);
  if (tied.length === 1) return tied[0]!;
  return (['initiator', 'controller', 'sentinel', 'duelist'] as const).find((r) => tied.includes(r))!;
}

/**
 * Fills a roster's missing roles from data: while a role is missing, the player with the largest share of that
 * role's agents (≥ FLEX_MIN_SHARE) among those whose role is doubled moves into it. Missing roles are tried in
 * order of their penalty (controller, initiator, sentinel, duelist). Never invents a role nobody played.
 */
export function coverRoles(roles: readonly Role[], weights: readonly RoleWeights[]): Role[] {
  const out = [...roles];
  for (const missing of ['controller', 'initiator', 'sentinel', 'duelist'] as const) {
    if (out.includes(missing)) continue;
    let best = -1;
    let bestShare = 0;
    out.forEach((role, i) => {
      if (out.filter((r) => r === role).length < 2) return;
      const total = ROLES.reduce((s, r) => s + weights[i]![r], 0);
      const share = total > 0 ? weights[i]![missing] / total : 0;
      if (share >= FLEX_MIN_SHARE && share > bestShare) {
        best = i;
        bestShare = share;
      }
    });
    if (best >= 0) out[best] = missing;
  }
  return out;
}

/** Coach's tactic bonus from the team's final placement at the event: 1st 3, 2nd–4th 2, 5th–8th 1, else 0. */
export function tacticFromPlacement(placement: { min: number } | null): number {
  if (!placement) return 0;
  if (placement.min === 1) return 3;
  if (placement.min <= 4) return 2;
  if (placement.min <= 8) return 1;
  return 0;
}

/** Coach's veto bonus from experience: international events coached in the data up to this one (1 → 0 … 6+ → 3). */
export function vetoFromExperience(eventsCoached: number): number {
  return Math.min(3, Math.floor(eventsCoached / 2));
}

/** OVR bonus for how far the team went: champion +3, finalist +2, top 4 +1. */
export function placementBonus(placement: { min: number } | null): number {
  if (!placement) return 0;
  if (placement.min === 1) return 3;
  if (placement.min === 2) return 2;
  if (placement.min <= 4) return 1;
  return 0;
}

/** OVR bonus for the event tier: Champions +2, Masters / LOCK//IN 0. */
export function tierBonus(tier: string): number {
  return tier === 'champions' ? 2 : 0;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface RealPool {
  rosters: RosterEntry[];
  /** Map comfort per roster key (`${teamId}-${eventId}`), from the vetoes stored for that event. */
  affinity: Record<string, Partial<Record<MapName, number>>>;
  /** Veto pool: the map pool of the most recent event (by start date) that has exactly 7 maps. */
  mapPool: MapName[];
  mapPoolEventId: string;
  /** Map pool of every event, by event id. */
  eventMapPools: Record<string, MapName[]>;
  /** Rosters left out, with the reason (pt-BR). */
  skipped: string[];
  /** Data gaps that fell back to neutral percentiles (pt-BR). */
  notes: string[];
}

interface Row {
  event: VlrEventData;
  team: VlrTeamRow;
  teamId: string;
  vlr: VlrPlayerRow;
  rounds: number;
  role: Role;
  lpTeam: LiquipediaTeam | null;
  lpPlayer: LiquipediaPlayer | null;
}

type StatKey = 'rating' | 'acs' | 'kast' | 'adr' | 'kpr' | 'apr' | 'hs' | 'net' | 'fk' | 'clutch';

/** Builds every real roster. `agentRoles` maps agent name → role (from src/data/game). */
export function buildRealPool(
  vlrEvents: readonly VlrEventData[],
  liquipedia: readonly LiquipediaEvent[],
  agentRoles: Readonly<Record<string, Role>>,
): RealPool {
  const events = [...vlrEvents].sort(
    (a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.slug.localeCompare(b.slug),
  );
  const lpById = new Map(liquipedia.map((e) => [e.id, e]));
  const skipped: string[] = [];
  const notes: string[] = [];

  // Team ids: the VLR slug, plus the VLR id when two different teams share a slug.
  const idsBySlug = new Map<string, Set<number>>();
  for (const e of events) {
    for (const t of e.teams) idsBySlug.set(t.slug, (idsBySlug.get(t.slug) ?? new Set()).add(t.id));
  }
  const teamIdOf = (t: VlrTeamRow) => ((idsBySlug.get(t.slug)?.size ?? 1) > 1 ? `${t.slug}-${t.id}` : t.slug);

  // 1. Main players of every roster that played and has enough rounds.
  type Draft = Omit<Row, 'role'> & { weights: RoleWeights };
  const rosters: { event: VlrEventData; team: VlrTeamRow; rows: Draft[] }[] = [];
  for (const event of events) {
    const byId = new Map(event.players.map((p) => [p.playerId, p]));
    for (const team of event.teams) {
      if (!team.played) continue;
      const mains = team.players.filter((p) => p.main).map((p) => byId.get(p.playerId));
      const key = `${teamIdOf(team)}-${event.slug}`;
      if (mains.length !== 5 || mains.some((p) => !p)) {
        skipped.push(`${key}: sem 5 titulares com stats`);
        continue;
      }
      const small = mains.filter((p) => (p!.rounds ?? 0) < MIN_ROUNDS);
      if (small.length > 0) {
        skipped.push(`${key}: ${small.map((p) => `${p!.handle} (${p!.rounds ?? 0} rounds)`).join(', ')} < ${MIN_ROUNDS} rounds`);
        continue;
      }
      const lpTeam = matchLiquipediaTeam(lpById.get(event.slug), mains as VlrPlayerRow[]);
      rosters.push({
        event,
        team,
        rows: (mains as VlrPlayerRow[]).map((vlr) => ({
          event,
          team,
          teamId: teamIdOf(team),
          vlr,
          rounds: vlr.rounds!,
          lpTeam,
          lpPlayer: lpTeam ? matchLiquipediaPlayer(lpTeam, vlr) : null,
          weights: roleWeights(vlr.agents, agentRoles),
        })),
      });
    }
  }

  // 2. Roles: this event's agents; ties broken by the player's agents over all events (weighted by rounds).
  const career = new Map<number, RoleWeights>();
  for (const r of rosters.flatMap((x) => x.rows)) {
    const total = Object.values(r.weights).reduce((s, v) => s + v, 0) || 1;
    const c = career.get(r.vlr.playerId) ?? { duelist: 0, initiator: 0, controller: 0, sentinel: 0 };
    for (const role of ROLES) c[role] += (r.weights[role] / total) * r.rounds;
    career.set(r.vlr.playerId, c);
  }
  const rows: Row[] = rosters.flatMap((x) => {
    const primary = x.rows.map((r) => pickRole(r.weights, career.get(r.vlr.playerId)));
    const roles = coverRoles(
      primary,
      x.rows.map((r) => r.weights),
    );
    return x.rows.map(({ weights: _w, ...r }, i) => ({ ...r, role: roles[i]! }));
  });

  // 3. Percentiles within the year (and within year + role for the OVR).
  const clutchPrior = new Map<number, number>();
  for (const year of new Set(rows.map((r) => r.event.year))) {
    let won = 0;
    let played = 0;
    for (const r of rows) {
      if (r.event.year !== year || r.vlr.clutchesWon === null || r.vlr.clutchesPlayed === null) continue;
      won += r.vlr.clutchesWon;
      played += r.vlr.clutchesPlayed;
    }
    clutchPrior.set(year, played > 0 ? (100 * won) / played : 0);
  }
  const stat = (r: Row, k: StatKey): number | null => {
    const v = r.vlr;
    switch (k) {
      case 'hs':
        return v.hsPct;
      case 'net':
        return v.fkPct === null || v.fdPct === null ? null : v.fkPct - v.fdPct;
      case 'fk':
        return v.fkPct;
      case 'clutch':
        return shrunkClutchRate(v.clutchesWon, v.clutchesPlayed, clutchPrior.get(r.event.year)!);
      default:
        return v[k];
    }
  };
  const groups = new Map<string, number[]>();
  const add = (key: string, v: number | null) => {
    if (v === null) return;
    const list = groups.get(key) ?? [];
    list.push(v);
    groups.set(key, list);
  };
  const KEYS: StatKey[] = ['rating', 'acs', 'kast', 'adr', 'kpr', 'apr', 'hs', 'net', 'fk', 'clutch'];
  for (const r of rows) {
    for (const k of KEYS) {
      add(`${r.event.year}:${k}`, stat(r, k));
      add(`${r.event.year}:${r.role}:${k}`, stat(r, k));
    }
  }
  for (const list of groups.values()) list.sort((a, b) => a - b);
  const pYear = (r: Row, k: StatKey) => {
    const v = stat(r, k);
    return v === null ? null : percentile(groups.get(`${r.event.year}:${k}`) ?? [], v);
  };
  const pRole = (r: Row, k: StatKey) => {
    const v = stat(r, k);
    return v === null ? null : percentile(groups.get(`${r.event.year}:${r.role}:${k}`) ?? [], v);
  };

  // Data gaps, reported once per event and stat.
  const gaps = new Map<string, number>();
  for (const r of rows) {
    for (const k of ['rating', 'kast', 'hs', 'clutch', 'net'] as const) {
      if (stat(r, k) === null) gaps.set(`${r.event.slug}|${k}`, (gaps.get(`${r.event.slug}|${k}`) ?? 0) + 1);
    }
  }
  for (const [key, n] of gaps) {
    const [ev, k] = key.split('|');
    notes.push(`${ev}: ${n} card(s) sem ${STAT_LABEL[k as StatKey]} no VLR → percentil neutro (50)`);
  }

  // 4. IGL data: who leads each team, and who led any team in the data.
  const iglOf = (r: Row): LiquipediaPlayer | null => {
    const t = r.lpTeam;
    if (!t?.igl) return null;
    return t.players.find((p) => p.handle === t.igl) ?? null;
  };
  const isIglRow = (r: Row) => {
    const igl = iglOf(r);
    return !!igl && !!r.lpPlayer && igl === r.lpPlayer;
  };
  const everIgl = new Set(rows.filter(isIglRow).map((r) => r.vlr.playerId));

  // 5. Coaches: experience counted in event order.
  const coachSeen = new Map<string, number>();
  const coachExperience = new Map<string, number>();
  for (const { event, rows: rr } of rosters) {
    const c = rr[0]!.lpTeam?.coach;
    if (!c) continue;
    const key = c.liquipediaId ?? normHandle(c.name);
    const n = (coachSeen.get(key) ?? 0) + 1;
    coachSeen.set(key, n);
    coachExperience.set(`${rr[0]!.teamId}-${event.slug}`, n);
  }

  // 6. Cards and rosters.
  const rowsByRoster = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.teamId}-${r.event.slug}`;
    rowsByRoster.set(key, [...(rowsByRoster.get(key) ?? []), r]);
  }
  const out: RosterEntry[] = [];
  const affinity: Record<string, Partial<Record<MapName, number>>> = {};
  for (const { event, team } of rosters) {
    const teamId = teamIdOf(team);
    const key = `${teamId}-${event.slug}`;
    const rr = rowsByRoster.get(key)!;
    const cards = rr.map((r) => buildCard(r));
    const entry: RosterEntry = {
      teamId,
      teamName: team.name ?? team.slug,
      eventId: event.slug,
      eventName: event.shortName,
      year: event.year,
      cards,
      iglKnown: cards.some((c) => c.isIGL),
    };
    if (team.placement) entry.placement = team.placement.text;
    const lpCoach = rr[0]!.lpTeam?.coach;
    if (lpCoach) {
      const coach: Coach = {
        id: `${slugify(lpCoach.name)}@${key}`,
        name: lpCoach.name,
        teamId,
        eventId: event.slug,
        vetoBonus: vetoFromExperience(coachExperience.get(key) ?? 1),
        tacticBonus: tacticFromPlacement(team.placement),
      };
      entry.coach = coach;
    }
    out.push(entry);
    const aff = vetoAffinity(event, team);
    if (Object.keys(aff).length > 0) affinity[key] = aff;
  }

  function buildCard(r: Row): Card {
    const n = r.rounds;
    const attr = (p: number | null) => Math.round(ATTR_FLOOR + (ATTR_SPAN * shrink(p, n)) / 100);
    const isDuelist = r.role === 'duelist';
    const netWeight = isDuelist ? 0.7 : 0.4;
    const isIGL = isIglRow(r);
    const igl = isIGL ? r.lpTeam!.iglSource : null;
    const attrs: Attributes = {
      aim: attr(blend([[pYear(r, 'hs'), 1], [pYear(r, 'kpr'), 1], [pYear(r, 'adr'), 1]])),
      entry: attr(blend([[pYear(r, 'net'), netWeight], [pYear(r, 'fk'), 1 - netWeight]])),
      utility: attr(blend([[pYear(r, 'apr'), 1], [pYear(r, 'kast'), 1]])),
      clutch: attr(pYear(r, 'clutch')),
      consistency: attr(blend([[pYear(r, 'kast'), 1], [pYear(r, 'rating'), 1]])),
      leadership:
        igl === 'event-captain' || igl === 'squad-captain'
          ? LEADERSHIP.captain
          : igl
            ? LEADERSHIP.infobox
            : everIgl.has(r.vlr.playerId)
              ? LEADERSHIP.iglElsewhere
              : LEADERSHIP.none,
    };
    const perf = (p: (r: Row, k: StatKey) => number | null) =>
      blend([[p(r, 'rating'), 0.5], [p(r, 'acs'), 0.3], [p(r, 'kast'), 0.2]]);
    const performance = blend([[perf(pYear), 1], [perf(pRole), 1]]);
    const raw = OVR_FLOOR + (OVR_SPAN * shrink(performance, n)) / 100 + placementBonus(r.team.placement) + tierBonus(r.event.tier);
    const ovr = Math.max(OVR_MIN, Math.min(OVR_MAX, Math.round(raw)));

    const lpFlag = r.lpPlayer?.flag;
    const vlrFlag = r.vlr.country && /^[a-z]{2}$/.test(r.vlr.country) ? r.vlr.country.toUpperCase() : '';
    const card: Card = {
      id: `${r.vlr.playerSlug}@${r.teamId}-${r.event.slug}`,
      playerId: String(r.vlr.playerId),
      handle: r.vlr.handle,
      country: lpFlag ?? vlrFlag,
      teamId: r.teamId,
      eventId: r.event.slug,
      role: r.role,
      isIGL,
      agents: r.vlr.agents.map((a) => a.agent).filter((a) => agentRoles[a] !== undefined),
      attrs,
      ovr,
      stats: { rounds: n, rating: r.vlr.rating, acs: r.vlr.acs, kast: r.vlr.kast },
    };
    if (igl) card.iglSource = igl;
    return card;
  }

  // 7. Map pools.
  const eventMapPools: Record<string, MapName[]> = {};
  for (const e of events) eventMapPools[e.slug] = e.mapPool.map((m) => m.map).sort();
  const full = events.filter((e) => eventMapPools[e.slug]!.length === 7);
  const latest = full[full.length - 1];
  if (!latest) throw new Error('No event with a 7-map pool');

  return {
    rosters: out,
    affinity,
    mapPool: eventMapPools[latest.slug]!,
    mapPoolEventId: latest.slug,
    eventMapPools,
    skipped,
    notes,
  };
}

const STAT_LABEL: Record<StatKey, string> = {
  rating: 'Rating',
  acs: 'ACS',
  kast: 'KAST',
  adr: 'ADR',
  kpr: 'KPR',
  apr: 'APR',
  hs: 'HS%',
  net: 'FK/FD',
  fk: 'FK%',
  clutch: 'clutches',
};

/** Liquipedia team with the most players in common (by VLR id or normalized handle); needs ≥ 3. */
function matchLiquipediaTeam(event: LiquipediaEvent | undefined, mains: readonly VlrPlayerRow[]): LiquipediaTeam | null {
  if (!event) return null;
  let best: LiquipediaTeam | null = null;
  let bestShared = 0;
  for (const t of event.teams) {
    const shared = mains.filter((m) => t.players.some((p) => samePlayer(p, m))).length;
    if (shared > bestShared) {
      best = t;
      bestShared = shared;
    }
  }
  return bestShared >= 3 ? best : null;
}

function matchLiquipediaPlayer(team: LiquipediaTeam, vlr: VlrPlayerRow): LiquipediaPlayer | null {
  return (
    team.players.find((p) => p.vlrPlayerId === String(vlr.playerId)) ??
    team.players.find((p) => normHandle(p.handle) === normHandle(vlr.handle)) ??
    null
  );
}

/** Same person: VLR id from the Liquipedia infobox, or the same normalized handle. */
function samePlayer(p: LiquipediaPlayer, vlr: VlrPlayerRow): boolean {
  return p.vlrPlayerId === String(vlr.playerId) || normHandle(p.handle) === normHandle(vlr.handle);
}

/** Affinity cap per map, in strength points. */
const AFFINITY_CAP = 2;

/**
 * Map comfort from the stored vetoes of this event: +1 for each map the team picked, −1 for each map it banned,
 * capped at ±2. Matches without a veto line fall back to the map's `pickedBy`. Teams with no stored match get {}.
 */
export function vetoAffinity(event: VlrEventData, team: VlrTeamRow): Partial<Record<MapName, number>> {
  const score: Record<string, number> = {};
  const bump = (map: string, by: number) => {
    score[map] = (score[map] ?? 0) + by;
  };
  const tags = new Map(event.teams.map((t) => [t.id, t.tag]));
  for (const m of event.matches) {
    const side = m.teams.findIndex((t) => t.id === team.id);
    if (side < 0) continue;
    if (m.veto) {
      for (const step of m.veto) {
        const match = /^(.+?) (ban|pick) (.+)$/.exec(step);
        if (!match || match[1] !== tags.get(team.id)) continue;
        bump(match[3]!.trim(), match[2] === 'pick' ? 1 : -1);
      }
    } else {
      for (const map of m.maps) if (map.map && map.pickedBy === side + 1) bump(map.map, 1);
    }
  }
  const out: Partial<Record<MapName, number>> = {};
  for (const map of Object.keys(score).sort()) {
    const v = Math.max(-AFFINITY_CAP, Math.min(AFFINITY_CAP, score[map]!));
    if (v !== 0) out[map] = v;
  }
  return out;
}
