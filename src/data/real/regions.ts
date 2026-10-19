/**
 * Region (competitive "server") of every real team at every event, from the committed VLR data only.
 *
 * Rules, in order (see docs/data.md, "Regiões"):
 *   1. A regional league stage says its own region (the event's `region`, from the VLR listing title).
 *   2. Franchising era (2023+): the league the team played in that year — the team's VLR id appears in one
 *      of that year's regional league stages. Chinese teams at 2023 internationals (before the China league
 *      existed) fall through to rule 3 and get 'china'.
 *   3. Otherwise (2021–22, or a team with no league data) the team's country as VLR shows it in the event
 *      standings, mapped to the sub-region it qualified from: NA/BR/LATAM → americas; EU/CIS/TR → emea;
 *      KR/JP/SEA/OCE/SA → pacific; CN → china. "Europe" is what VLR prints for multinational EU teams.
 *   4. REGION_OVERRIDES, for the rare team with no country on VLR (empty today; add with a source comment).
 *
 * Team ids are the pool's (VLR slug, plus the VLR id when two different teams share a slug); the resolver
 * lives here so the pool builder (cards.ts) and the lookup use the same ids.
 */
import type { Region } from '../../engine/types';
import type { VlrEventData, VlrTeamRow } from './cards';
import slimJson from './vlr/slim.json';

/** VLR standings country name → region. Only names that occur in the data; a new name must be added here. */
export const COUNTRY_REGION: Readonly<Record<string, Region>> = {
  // Americas (NA, Brazil, LATAM)
  Argentina: 'americas',
  Brazil: 'americas',
  Canada: 'americas',
  Chile: 'americas',
  Colombia: 'americas',
  Mexico: 'americas',
  Peru: 'americas',
  'United States': 'americas',
  // EMEA (Europe, CIS, Türkiye, MENA)
  'Czech Republic': 'emea',
  Europe: 'emea',
  France: 'emea',
  Germany: 'emea',
  Poland: 'emea',
  Russia: 'emea',
  'Saudi Arabia': 'emea',
  Spain: 'emea',
  Sweden: 'emea',
  Türkiye: 'emea',
  Ukraine: 'emea',
  'United Kingdom': 'emea',
  // Pacific (Korea, Japan, SEA, South Asia, Oceania)
  Australia: 'pacific',
  'Hong Kong': 'pacific',
  India: 'pacific',
  Indonesia: 'pacific',
  Japan: 'pacific',
  Malaysia: 'pacific',
  Philippines: 'pacific',
  Singapore: 'pacific',
  'South Korea': 'pacific',
  Taiwan: 'pacific',
  Thailand: 'pacific',
  Vietnam: 'pacific',
  // China
  China: 'china',
};

/**
 * Manual region per `${teamId}-${eventId}` for teams VLR shows without a country. Each entry must cite its
 * source in a comment. Empty: every roster in the data resolves by the rules above (checked by regions.test.ts).
 */
export const REGION_OVERRIDES: Readonly<Record<string, Region>> = {};

export function regionFromCountry(countryName: string | null | undefined): Region | undefined {
  return countryName ? COUNTRY_REGION[countryName] : undefined;
}

const isRegional = (e: Pick<VlrEventData, 'tier'>) => e.tier === 'regional';

/**
 * Pool team id of a VLR team: its slug, plus its VLR id when another team shares the slug. Ids of the
 * international pool never change because a regional team shares a slug: among internationals the rule is
 * the original one (two ids → both suffixed); a regional-only team gets the suffix when its slug is taken.
 */
export function teamIdResolver(events: readonly VlrEventData[]): (team: Pick<VlrTeamRow, 'id' | 'slug'>) => string {
  const intl = new Map<string, Set<number>>();
  const all = new Map<string, Set<number>>();
  for (const e of events) {
    for (const t of e.teams) {
      all.set(t.slug, (all.get(t.slug) ?? new Set()).add(t.id));
      if (!isRegional(e)) intl.set(t.slug, (intl.get(t.slug) ?? new Set()).add(t.id));
    }
  }
  return (t) => {
    const ids = intl.get(t.slug);
    if (ids) return ids.size === 1 && ids.has(t.id) ? t.slug : `${t.slug}-${t.id}`;
    return (all.get(t.slug)?.size ?? 1) > 1 ? `${t.slug}-${t.id}` : t.slug;
  };
}

export interface RegionIndex {
  /** Region of a team (by VLR team row) at an event, by the rules above; undefined when nothing applies. */
  regionOf(team: Pick<VlrTeamRow, 'id' | 'slug' | 'countryName'>, event: VlrEventData): Region | undefined;
  /** Region of a pool team id at an event (id) or in a year (league membership first). */
  teamRegion(teamId: string, eventIdOrYear: string | number): Region | undefined;
}

/** Builds the lookups over the committed events (pure; the same input always gives the same answers). */
export function buildRegionIndex(events: readonly VlrEventData[]): RegionIndex {
  const teamId = teamIdResolver(events);
  // Rule 2: VLR team id + year → league region.
  const league = new Map<string, Region>();
  for (const e of events) {
    if (!isRegional(e) || !e.region) continue;
    for (const t of e.teams) league.set(`${t.id}:${e.year}`, e.region);
  }
  const regionOf: RegionIndex['regionOf'] = (team, event) => {
    if (isRegional(event) && event.region) return event.region;
    return (
      league.get(`${team.id}:${event.year}`) ??
      regionFromCountry(team.countryName) ??
      REGION_OVERRIDES[`${teamId(team)}-${event.slug}`]
    );
  };
  const byRoster = new Map<string, Region>();
  const byYear = new Map<string, Region>();
  for (const e of events) {
    for (const t of e.teams) {
      const region = regionOf(t, e);
      if (!region) continue;
      const id = teamId(t);
      byRoster.set(`${id}-${e.slug}`, region);
      const key = `${id}:${e.year}`;
      if (isRegional(e) || !byYear.has(key)) byYear.set(key, region);
    }
  }
  return {
    regionOf,
    teamRegion: (id, eventIdOrYear) =>
      typeof eventIdOrYear === 'number' ? byYear.get(`${id}:${eventIdOrYear}`) : byRoster.get(`${id}-${eventIdOrYear}`),
  };
}

let index: RegionIndex | undefined;

/**
 * Region of a pool team (`RosterEntry.teamId`) at an event (`RosterEntry.eventId`) or in a year
 * (the league it played that year, else the region of any of its events that year). Built lazily from the
 * committed VLR snapshot, so every roster in REAL_ROSTERS / REGIONAL_ROSTERS resolves.
 */
export function teamRegion(teamId: string, eventIdOrYear: string | number): Region | undefined {
  index ??= buildRegionIndex(slimJson as VlrEventData[]);
  return index.teamRegion(teamId, eventIdOrYear);
}
