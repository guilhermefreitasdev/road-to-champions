/**
 * Box scores: a compact per-player line for every series played in a run or season (AI vs AI included), so the
 * stats tab can compare every player of the championship. No kill events, no rounds: only the totals the stats
 * need. Plain JSON, deterministic (it is a projection of the SeriesResult). Size: ~1.4 KB per series, see
 * docs/design.md ("Estatísticas de todos os jogadores").
 */
import type { MapResult } from '../engine/match';
import type { SeriesResult } from '../engine/series';
import type { MapName, TeamIndex } from '../engine/types';

/**
 * One player on one map: [kills, deaths, assists, firstKills, firstDeaths, 2K, 3K, 4K, aces, rating × 100, ACS,
 * KAST %, map MVP (1/0), agent ('' when none)].
 */
export type CompactLine = [number, number, number, number, number, number, number, number, number, number, number, number, 0 | 1, string];

export interface CompactMap {
  map: MapName;
  score: [number, number];
  /** Rounds played (the weight of rating, ACS and KAST). */
  rounds: number;
  /** Lines in the order of CompactSeries.ids. */
  lines: [CompactLine[], CompactLine[]];
}

export interface CompactSeries {
  /** Entrant ids of side 0 and side 1 (USER_ID for the user, roster keys for the AI). */
  teams: [string, string];
  /** Card ids of each side as they played (the user's carry the '#user' suffix). */
  ids: [string[], string[]];
  /** Series MVP: side and index into `ids`. */
  mvp: [TeamIndex, number];
  maps: CompactMap[];
}

/** Field positions of a CompactLine. */
export const L = { k: 0, d: 1, a: 2, fk: 3, fd: 4, k2: 5, k3: 6, k4: 7, k5: 8, rating: 9, acs: 10, kast: 11, mvp: 12, agent: 13 } as const;

function compactMap(m: MapResult, ids: [string[], string[]]): CompactMap {
  const side = (t: TeamIndex): CompactLine[] =>
    ids[t].map((id) => {
      const p = m.players[t].find((x) => x.cardId === id);
      if (!p) throw new Error(`Card "${id}" missing on ${m.map}`);
      const mk = p.multikills;
      return [p.kills, p.deaths, p.assists, p.firstKills, p.firstDeaths, mk.k2, mk.k3, mk.k4, mk.k5, Math.round(p.rating * 100), p.acs, p.kast, p.mvp ? 1 : 0, p.agent ?? ''];
    });
  return { map: m.map, score: [m.score[0], m.score[1]], rounds: m.rounds.length, lines: [side(0), side(1)] };
}

/** The compact box score of a series between entrants `a` (side 0) and `b` (side 1). */
export function compactSeries(series: SeriesResult, a: string, b: string): CompactSeries {
  const first = series.maps[0];
  if (!first) throw new Error('A series needs at least one map');
  const ids: [string[], string[]] = [first.players[0].map((p) => p.cardId), first.players[1].map((p) => p.cardId)];
  const idx = ids[series.mvp.team].indexOf(series.mvp.cardId);
  return { teams: [a, b], ids, mvp: [series.mvp.team, Math.max(0, idx)], maps: series.maps.map((m) => compactMap(m, ids)) };
}
