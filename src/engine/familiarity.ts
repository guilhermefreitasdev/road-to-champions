/**
 * Map familiarity: teams get better on the maps they keep playing. Every map a team plays in a run or season adds
 * FAMILIARITY_PER_MAP strength points on that map for that team (AI teams too), up to FAMILIARITY_CAP.
 *
 * A design rule, not a measurement: the research found "team X is strong on map Y" to be small and renewed every
 * event (docs/pesquisa-variancia.md §9.1: stability 0.092; picking your map ≈ +1.3 points), so the cap stays
 * near the size of a real map pick and both teams of a series earn it the same way.
 */
import type { MapName } from './types';

export const FAMILIARITY_PER_MAP = 0.5;
export const FAMILIARITY_CAP = 2;

/** Maps played so far in a run or season: entrant id → map → maps played. Plain JSON. */
export type MapsPlayed = Readonly<Record<string, Readonly<Partial<Record<MapName, number>>>>>;

/** Strength points of a team on a map it played `count` times. */
export function familiarityPoints(count: number): number {
  return Math.min(FAMILIARITY_CAP, Math.max(0, count) * FAMILIARITY_PER_MAP);
}

/** A team's familiarity per map, in strength points (maps it never played are left out). */
export function familiarityOf(played: MapsPlayed | undefined, teamId: string): Partial<Record<MapName, number>> {
  const out: Partial<Record<MapName, number>> = {};
  for (const [map, count] of Object.entries(played?.[teamId] ?? {})) {
    const points = familiarityPoints(count ?? 0);
    if (points > 0) out[map] = points;
  }
  return out;
}

/** The table after the teams of a series played `maps` (one count per map played, for each team). */
export function recordMapsPlayed(played: MapsPlayed | undefined, teamIds: readonly string[], maps: readonly MapName[]): MapsPlayed {
  const out: Record<string, Partial<Record<MapName, number>>> = { ...(played ?? {}) };
  for (const id of teamIds) {
    const row: Partial<Record<MapName, number>> = { ...(out[id] ?? {}) };
    for (const map of maps) row[map] = (row[map] ?? 0) + 1;
    out[id] = row;
  }
  return out;
}
