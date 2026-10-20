/**
 * Real card builder: VLR player-event stats + Liquipedia (IGL, coach) → the roster pool the game plays with.
 *
 * Pure and deterministic: the same input always gives the same cards (no Math.random, no I/O, no clock).
 * Every number on a card is derived here from the committed data; nothing is typed in by hand. A stat the
 * source does not have counts as the neutral 50th percentile (never a guess), and the card keeps `null` in
 * its `stats`. The formulas are summarized in pt-BR in docs/design.md ("Núcleo de simulação").
 */
import type { Attributes, AuraTier, Card, CardCareer, Coach, EventTier, MapName, Region, Role, RosterEntry } from '../../engine/types';
import type { LiquipediaEvent, LiquipediaPlayer, LiquipediaTeam } from './liquipedia';
import { buildRegionIndex, teamIdResolver } from './regions';

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
  /** Country as VLR prints it in the event standings (e.g. "Brazil", "Europe"); null when VLR has none. */
  countryName?: string | null;
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
  /** 'masters' | 'champions' (international) or 'regional' (a VCT regional league stage). */
  tier: string;
  /** Regional league stages only: the league's region and the stage ('league' | 'kickoff' | 'stage1' | 'stage2'). */
  region?: Region | null;
  stage?: string | null;
  startDate: string | null;
  endDate?: string | null;
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
/**
 * OVR from the (shrunk) performance percentile: 0 → 67, 100 → 96, before the event bonuses. Shifted +4 (was 63)
 * on 2026-10-20 at the owner's request so primes read like primes (top cards 96–98, median ~83). A pure shift:
 * the span, the gaps between cards and therefore the balance are unchanged.
 */
const OVR_FLOOR = 67;
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
/**
 * Decision (not a stat: a rule over the Liquipedia IGL data). The event's IGL: 90 when marked captain, 80 when
 * only the career infobox says so. Everyone else starts at 60 (IGL of another roster in the data) or 45, nudged by
 * up to ±DECISION.swing by the shrunk percentile of APR and KAST (assists and staying alive are the stats where
 * IGLs stand out, docs/pesquisa-taticas.md §2.4); a missing stat nudges nothing.
 */
export const DECISION = { captain: 90, infobox: 80, iglElsewhere: 60, none: 45, swing: 5 } as const;

const ROLES: readonly Role[] = ['duelist', 'initiator', 'controller', 'sentinel'];

/**
 * Aura (docs/design.md "Modelo v3", docs/pesquisa-variancia.md §10.2): tiers from career facts over the
 * international events up to and including the card's. Rating thresholds are VLR Rating 2.0 as published.
 */
export const AURA = {
  /** "High" event: rating at or above this. */
  highRating: 1.1,
  /** Top-N rating of the event's main players. */
  top: 3,
  /** A title counts for 'star' only when the player was in the event's top 8 by rating. */
  titleTop: 8,
  /** Prodigy: debut rating ≥ highRating or in the best quarter of the event. */
  prodigyShare: 0.25,
  /** Anchor: a legend/GOAT leads with at least this decision (when not the IGL). */
  anchorDecision: 60,
  /** Anchor by title: a champion rated at or above the team's median, with at least this many internationals (no debutants). */
  anchorEvents: 2,
} as const;

/** Tier from the career facts (`titleTop8` = titles where the player was top-8 rated). */
export function auraTier(c: CardCareer, titleTop8: number, international: boolean): AuraTier | undefined {
  if (c.titles >= 2 && c.top3 >= 2) return 'goat';
  if ((c.titles >= 1 && c.top3 >= 2) || c.titles >= 2 || c.top3 >= 3) return 'legend';
  if (c.top3 >= 1 || c.high >= 2 || titleTop8 >= 1) return 'star';
  if (international && c.events === 1) return 'rising';
  return undefined;
}

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

/** OVR bonus for the event tier: Champions +2, Masters / LOCK//IN 0, regional league stage −2. */
export function tierBonus(tier: string): number {
  if (tier === 'champions') return 2;
  if (tier === 'regional') return REGIONAL_TIER_BONUS;
  return 0;
}

/** Regional league stages: −2 OVR (its percentiles are taken among regional rows only, see docs/data.md). */
export const REGIONAL_TIER_BONUS = -2;

/** OVR bonus for a regional league placement: league stage champion +2, finalist +1 (top 4 nothing). */
export function regionalPlacementBonus(placement: { min: number } | null): number {
  if (!placement) return 0;
  if (placement.min === 1) return 2;
  if (placement.min === 2) return 1;
  return 0;
}

/** International or regional? Rows of the two groups are ranked separately (percentiles within year + group). */
export const tierGroup = (tier: string): EventTier => (tier === 'regional' ? 'regional' : 'international');

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface RealPool {
  /** International rosters (Masters, LOCK//IN, Champions): the original pool. */
  rosters: RosterEntry[];
  /** Regional league stage rosters (tier 'regional'), same card builder, ranked among themselves. */
  regionalRosters: RosterEntry[];
  /** Map comfort per roster key (`${teamId}-${eventId}`), from the vetoes stored for that event. */
  affinity: Record<string, Partial<Record<MapName, number>>>;
  /** Veto pool: the map pool of the most recent international event (by start date) that has exactly 7 maps. */
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

  // Team ids: the VLR slug, plus the VLR id when two different teams share a slug (regions.ts, so that
  // international ids never change when a regional team shares a slug). Regions come from the same data.
  const teamIdOf = teamIdResolver(events);
  const regions = buildRegionIndex(events);

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
  //    International rows look only at international events (their cards do not move when regional data is
  //    added); regional rows use everything.
  const careerIntl = new Map<number, RoleWeights>();
  const careerAll = new Map<number, RoleWeights>();
  for (const r of rosters.flatMap((x) => x.rows)) {
    const total = Object.values(r.weights).reduce((s, v) => s + v, 0) || 1;
    for (const career of tierGroup(r.event.tier) === 'regional' ? [careerAll] : [careerIntl, careerAll]) {
      const c = career.get(r.vlr.playerId) ?? { duelist: 0, initiator: 0, controller: 0, sentinel: 0 };
      for (const role of ROLES) c[role] += (r.weights[role] / total) * r.rounds;
      career.set(r.vlr.playerId, c);
    }
  }
  const rows: Row[] = rosters.flatMap((x) => {
    const career = tierGroup(x.event.tier) === 'regional' ? careerAll : careerIntl;
    const primary = x.rows.map((r) => pickRole(r.weights, career.get(r.vlr.playerId)));
    const roles = coverRoles(
      primary,
      x.rows.map((r) => r.weights),
    );
    return x.rows.map(({ weights: _w, ...r }, i) => ({ ...r, role: roles[i]! }));
  });

  // 3. Percentiles within the year and tier group (international / regional), and within year + group +
  //    role for the OVR. The two groups never share a ranking: a regional star is the 100th percentile of the
  //    regional rows of that year, and the international pool keeps the numbers it had before regional data.
  const groupOf = (r: Row) => `${r.event.year}:${tierGroup(r.event.tier)}`;
  const clutchPrior = new Map<string, number>();
  for (const g of new Set(rows.map(groupOf))) {
    let won = 0;
    let played = 0;
    for (const r of rows) {
      if (groupOf(r) !== g || r.vlr.clutchesWon === null || r.vlr.clutchesPlayed === null) continue;
      won += r.vlr.clutchesWon;
      played += r.vlr.clutchesPlayed;
    }
    clutchPrior.set(g, played > 0 ? (100 * won) / played : 0);
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
        return shrunkClutchRate(v.clutchesWon, v.clutchesPlayed, clutchPrior.get(groupOf(r))!);
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
      add(`${groupOf(r)}:${k}`, stat(r, k));
      add(`${groupOf(r)}:${r.role}:${k}`, stat(r, k));
    }
  }
  for (const list of groups.values()) list.sort((a, b) => a - b);
  const pYear = (r: Row, k: StatKey) => {
    const v = stat(r, k);
    return v === null ? null : percentile(groups.get(`${groupOf(r)}:${k}`) ?? [], v);
  };
  const pRole = (r: Row, k: StatKey) => {
    const v = stat(r, k);
    return v === null ? null : percentile(groups.get(`${groupOf(r)}:${r.role}:${k}`) ?? [], v);
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
  const isLiquipediaIgl = (r: Row) => {
    const igl = iglOf(r);
    return !!igl && !!r.lpPlayer && igl === r.lpPlayer;
  };
  // Regional rosters have no Liquipedia page in the data. Their IGL is taken only from the same team's
  // international rosters of the same year (Liquipedia-backed): one and the same player there, and among
  // the regional roster's 5 → IGL with source 'same-year-international'. Two different names → unknown.
  const intlIglByTeamYear = new Map<string, Set<number>>();
  for (const r of rows) {
    if (tierGroup(r.event.tier) === 'regional' || !isLiquipediaIgl(r)) continue;
    const key = `${r.team.id}:${r.event.year}`;
    intlIglByTeamYear.set(key, (intlIglByTeamYear.get(key) ?? new Set()).add(r.vlr.playerId));
  }
  const isInferredIgl = (r: Row) => {
    if (tierGroup(r.event.tier) !== 'regional') return false;
    const ids = intlIglByTeamYear.get(`${r.team.id}:${r.event.year}`);
    return ids?.size === 1 && ids.has(r.vlr.playerId);
  };
  const isIglRow = (r: Row) => isLiquipediaIgl(r) || isInferredIgl(r);
  const everIgl = new Set(rows.filter(isLiquipediaIgl).map((r) => r.vlr.playerId));

  // 4b. Career facts for the aura (international events only, in date order): titles, top-3 / top-8 ratings,
  //     events with rating ≥ 1.10, and the rank of each row inside its event.
  type Facts = CardCareer & { titleTop8: number };
  const blank = (): Facts => ({ events: 0, titles: 0, top3: 0, high: 0, titleTop8: 0 });
  /** Facts of a player after each international event (by event slug), cumulative. */
  const factsAfter = new Map<string, Facts>();
  const running = new Map<number, Facts>();
  /** Rank of a row's rating among the main players of its event (1 = best; rows without rating rank last). */
  const ratingRank = new Map<Row, { rank: number; of: number }>();
  const intlEvents = events.filter((e) => tierGroup(e.tier) === 'international');
  for (const event of intlEvents) {
    const eventRows = rows.filter((r) => r.event === event);
    const rated = eventRows.filter((r) => r.vlr.rating !== null).sort((x, y) => y.vlr.rating! - x.vlr.rating!);
    rated.forEach((r, i) => ratingRank.set(r, { rank: i + 1, of: rated.length }));
    for (const r of eventRows) {
      const f = { ...(running.get(r.vlr.playerId) ?? blank()) };
      const rank = ratingRank.get(r)?.rank ?? Infinity;
      const title = r.team.placement?.min === 1;
      f.events++;
      if (title) f.titles++;
      if (rank <= AURA.top) f.top3++;
      if ((r.vlr.rating ?? 0) >= AURA.highRating) f.high++;
      if (title && rank <= AURA.titleTop) f.titleTop8++;
      running.set(r.vlr.playerId, f);
      factsAfter.set(`${r.vlr.playerId}@${event.slug}`, f);
    }
  }
  /** Facts a card carries: up to and including its event (international), or up to its date (regional). */
  const careerOf = (r: Row): Facts => {
    if (tierGroup(r.event.tier) === 'international') return factsAfter.get(`${r.vlr.playerId}@${r.event.slug}`) ?? blank();
    let last = blank();
    for (const e of intlEvents) {
      if ((e.startDate ?? '') > (r.event.startDate ?? '')) break;
      last = factsAfter.get(`${r.vlr.playerId}@${e.slug}`) ?? last;
    }
    return last;
  };
  const teamMedianRating = new Map<string, number | null>();
  for (const [key, rr] of (() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = `${r.teamId}-${r.event.slug}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  })()) {
    const ratings = rr.map((r) => r.vlr.rating).filter((x): x is number => x !== null).sort((a, b) => a - b);
    teamMedianRating.set(key, ratings.length ? ratings[Math.floor(ratings.length / 2)]! : null);
  }

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
  const regionalOut: RosterEntry[] = [];
  const affinity: Record<string, Partial<Record<MapName, number>>> = {};
  for (const { event, team } of rosters) {
    const teamId = teamIdOf(team);
    const key = `${teamId}-${event.slug}`;
    const rr = rowsByRoster.get(key)!;
    const cards = rr.map((r) => buildCard(r));
    const tier = tierGroup(event.tier);
    const entry: RosterEntry = {
      teamId,
      teamName: team.name ?? team.slug,
      eventId: event.slug,
      eventName: event.shortName,
      year: event.year,
      cards,
      iglKnown: cards.some((c) => c.isIGL),
      tier,
    };
    const region = regions.regionOf(team, event);
    if (region) entry.region = region;
    else notes.push(`${key}: sem região (país "${team.countryName ?? '—'}" não mapeado em regions.ts)`);
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
    (tier === 'regional' ? regionalOut : out).push(entry);
    const aff = vetoAffinity(event, team);
    if (Object.keys(aff).length > 0) affinity[key] = aff;
  }

  /** ±DECISION.swing from the shrunk APR + KAST percentile (0 when both stats are missing). */
  function decisionSwing(r: Row): number {
    const p = blend([[pYear(r, 'apr'), 1], [pYear(r, 'kast'), 1]]);
    if (p === null) return 0;
    return Math.round((DECISION.swing * (shrink(p, r.rounds) - 50)) / 50);
  }

  function buildCard(r: Row): Card {
    const n = r.rounds;
    const attr = (p: number | null) => Math.round(ATTR_FLOOR + (ATTR_SPAN * shrink(p, n)) / 100);
    const isDuelist = r.role === 'duelist';
    const netWeight = isDuelist ? 0.7 : 0.4;
    const isIGL = isIglRow(r);
    const igl = !isIGL ? null : isLiquipediaIgl(r) ? r.lpTeam!.iglSource : 'same-year-international';
    const attrs: Attributes = {
      aim: attr(blend([[pYear(r, 'hs'), 1], [pYear(r, 'kpr'), 1], [pYear(r, 'adr'), 1]])),
      entry: attr(blend([[pYear(r, 'net'), netWeight], [pYear(r, 'fk'), 1 - netWeight]])),
      utility: attr(blend([[pYear(r, 'apr'), 1], [pYear(r, 'kast'), 1]])),
      clutch: attr(pYear(r, 'clutch')),
      presence: attr(pYear(r, 'kast')),
      decision:
        igl === 'event-captain' || igl === 'squad-captain'
          ? DECISION.captain
          : igl
            ? DECISION.infobox
            : (everIgl.has(r.vlr.playerId) ? DECISION.iglElsewhere : DECISION.none) + decisionSwing(r),
    };
    const perf = (p: (r: Row, k: StatKey) => number | null) =>
      blend([[p(r, 'rating'), 0.5], [p(r, 'acs'), 0.3], [p(r, 'kast'), 0.2]]);
    const performance = blend([[perf(pYear), 1], [perf(pRole), 1]]);
    const bonus =
      tierGroup(r.event.tier) === 'regional' ? regionalPlacementBonus(r.team.placement) : placementBonus(r.team.placement);
    const raw = OVR_FLOOR + (OVR_SPAN * shrink(performance, n)) / 100 + bonus + tierBonus(r.event.tier);
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

    // Aura, anchor and prodigy: facts only (titles, event ratings, debut), never a guess.
    const international = tierGroup(r.event.tier) === 'international';
    const { titleTop8, ...career } = careerOf(r);
    const tier = auraTier(career, titleTop8, international);
    if (tier) card.aura = tier;
    card.career = career;
    const rank = ratingRank.get(r);
    const champion = r.team.placement?.min === 1;
    const median = teamMedianRating.get(`${r.teamId}-${r.event.slug}`) ?? null;
    const leads = isIGL || attrs.decision >= AURA.anchorDecision;
    if (
      ((tier === 'legend' || tier === 'goat') && leads) ||
      (international && champion && career.events >= AURA.anchorEvents && r.vlr.rating !== null && median !== null && r.vlr.rating >= median)
    ) {
      card.anchor = true;
    }
    if (
      tier === 'rising' &&
      rank &&
      ((r.vlr.rating ?? 0) >= AURA.highRating || rank.rank <= Math.ceil(rank.of * AURA.prodigyShare))
    ) {
      card.prodigy = true;
    }
    return card;
  }

  // 7. Map pools.
  const eventMapPools: Record<string, MapName[]> = {};
  for (const e of events) eventMapPools[e.slug] = e.mapPool.map((m) => m.map).sort();
  const full = events.filter((e) => tierGroup(e.tier) === 'international' && eventMapPools[e.slug]!.length === 7);
  const latest = full[full.length - 1];
  if (!latest) throw new Error('No event with a 7-map pool');

  return {
    rosters: out,
    regionalRosters: regionalOut,
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
