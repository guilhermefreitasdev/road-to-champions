/**
 * The real card pool the game plays with: VLR.gg stats + Liquipedia (CC-BY-SA 3.0) IGLs and coaches,
 * turned into cards by ./cards.ts. Built once at module load, deterministically.
 */
import { rosterKey, rosterToLineup } from '../../engine/roster';
import type { Lineup, MapName, Role, RosterEntry } from '../../engine/types';
import { AGENTS } from '../game';
import { buildRealPool, type VlrEventData } from './cards';
import { LIQUIPEDIA_EVENTS } from './liquipedia';

const files = import.meta.glob<VlrEventData>('./vlr/events/*.json', { eager: true, import: 'default' });

const AGENT_ROLES: Record<string, Role> = Object.fromEntries(AGENTS.map((a) => [a.name, a.role]));

export const REAL_POOL = buildRealPool(Object.values(files), LIQUIPEDIA_EVENTS, AGENT_ROLES);

/** Every real roster (team + event) with 5 cards: what the roulette rolls and where opponents come from. */
export const REAL_ROSTERS: readonly RosterEntry[] = REAL_POOL.rosters;

/** Veto pool: the map pool of the most recent event with exactly 7 maps (see REAL_POOL.mapPoolEventId). */
export const REAL_MAP_POOL: readonly MapName[] = REAL_POOL.mapPool;

/** AI lineup for a real roster, with its map comfort from the stored vetoes (if any). */
export function realLineup(entry: RosterEntry): Lineup {
  return rosterToLineup(entry, REAL_POOL.affinity[rosterKey(entry)]);
}
