/**
 * The real card pool the game plays with: VLR.gg stats + Liquipedia (CC-BY-SA 3.0) IGLs and coaches,
 * turned into cards by ./cards.ts. Built once at module load, deterministically.
 *
 * Two pools from the same builder: REAL_ROSTERS (international events: Masters, LOCK//IN, Champions) and
 * REGIONAL_ROSTERS (VCT regional league stages, 2023+). Every entry carries its region (./regions.ts).
 */
import { rosterKey, rosterToLineup } from '../../engine/roster';
import type { Lineup, MapName, Region, Role, RosterEntry } from '../../engine/types';
import { AGENTS } from '../game';
import { buildRealPool, type VlrEventData } from './cards';
import { LIQUIPEDIA_EVENTS } from './liquipedia';
import slimJson from './vlr/slim.json';

export { teamRegion } from './regions';

/** vlr/slim.json: the subset of vlr/events/*.json the builder reads, written by scripts/vlr/run.mjs (keeps the bundle small). */
const EVENTS = slimJson as VlrEventData[];

const AGENT_ROLES: Record<string, Role> = Object.fromEntries(AGENTS.map((a) => [a.name, a.role]));

export const REAL_POOL = buildRealPool(EVENTS, LIQUIPEDIA_EVENTS, AGENT_ROLES);

/** Every international roster (team + event) with 5 cards: what the roulette rolls and where opponents come from. */
export const REAL_ROSTERS: readonly RosterEntry[] = REAL_POOL.rosters;

/** Every regional league stage roster (tier 'regional'), with region; no Liquipedia coach, IGL only when inferable. */
export const REGIONAL_ROSTERS: readonly RosterEntry[] = REAL_POOL.regionalRosters;

/** International + regional rosters. */
export const ALL_ROSTERS: readonly RosterEntry[] = [...REAL_ROSTERS, ...REGIONAL_ROSTERS];

/** Stage of a regional league event within its season. */
export type RegionalStage = 'league' | 'kickoff' | 'stage1' | 'stage2';

export interface RegionalEvent {
  /** Event id used by RosterEntry.eventId (e.g. "americas-kickoff-2024"). */
  id: string;
  name: string;
  year: number;
  region: Region;
  stage: RegionalStage;
  startDate: string | null;
  endDate: string | null;
  /** Map pool of the stage. */
  maps: MapName[];
}

/** The regional league stages in the data, in date order. */
export const REGIONAL_EVENTS: readonly RegionalEvent[] = EVENTS
  .filter((e) => e.tier === 'regional' && e.region && e.stage)
  .map((e) => ({
    id: e.slug,
    name: e.shortName,
    year: e.year,
    region: e.region as Region,
    stage: e.stage as RegionalStage,
    startDate: e.startDate,
    endDate: e.endDate ?? null,
    maps: [...REAL_POOL.eventMapPools[e.slug]!],
  }))
  .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '') || a.id.localeCompare(b.id));

/** Veto pool: the map pool of the most recent international event with exactly 7 maps (see REAL_POOL.mapPoolEventId). */
export const REAL_MAP_POOL: readonly MapName[] = REAL_POOL.mapPool;

/** AI lineup for a real roster (international or regional), with its map comfort from the stored vetoes (if any). */
export function realLineup(entry: RosterEntry): Lineup {
  return rosterToLineup(entry, REAL_POOL.affinity[rosterKey(entry)]);
}
