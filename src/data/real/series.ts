/**
 * Real series results (VLR.gg match pages), for the Daily mode's "Placar Clássico": vlr-series → series.json,
 * written by scripts/vlr/series.mjs (see docs/data.md, "Resultados de séries"). Each row is resolved here to the
 * pool's team ids (the same resolver as the cards, ./regions.ts) and the event's short name and tier.
 */
import type { VlrEventData } from './cards';
import { teamIdResolver } from './regions';
import seriesJson from './series.json';
import slimJson from './vlr/slim.json';

/** One row of series.json, as written by compactSeries() in scripts/vlr/parse.mjs. */
export interface RawSeries {
  id: number;
  event: string;
  stage: string | null;
  round: string | null;
  date: string | null;
  bo: number | null;
  teams: [number | null, string | null, string | null][];
  score: (number | null)[];
  maps: [string | null, number, number, number | null][];
}

export interface SeriesTeam {
  /** VLR team id. */
  vlrId: number;
  /** Pool team id (as in Card.teamId / RosterEntry.teamId, for logos and rosters). */
  teamId: string;
  /** Name as VLR lists the team at that event (current VLR name). */
  name: string;
}

export interface SeriesMap {
  map: string;
  /** Rounds won, in the order of `SeriesResult.teams`. */
  score: [number, number];
  /** Index of the team that picked the map; null for the decider (remaining) map or when VLR does not say. */
  pickedBy: 0 | 1 | null;
}

export interface SeriesResult {
  /** VLR match id. */
  id: number;
  /** Event slug (e.g. "champions-2022"), as RosterEntry.eventId. */
  eventId: string;
  /** Short event name ("Champions 2022", "Americas Stage 1 2025"). */
  eventName: string;
  /** 'masters' | 'champions' | 'regional'. */
  tier: string;
  year: number;
  /** VLR labels: stage ("Playoffs", "Group Stage"...) and round ("Grand Final", "Upper Semifinals"...). */
  stage: string | null;
  round: string | null;
  /** UTC day the series started (YYYY-MM-DD). */
  date: string | null;
  bestOf: number;
  teams: [SeriesTeam, SeriesTeam];
  /** Maps won, in team order. */
  score: [number, number];
  maps: SeriesMap[];
}

/** Resolves raw rows against the events (pure; rows of events not in `events` and malformed rows are dropped). */
export function buildSeries(rows: readonly RawSeries[], events: readonly VlrEventData[]): SeriesResult[] {
  const resolve = teamIdResolver(events);
  const bySlug = new Map(events.map((e) => [e.slug, e]));
  const out: SeriesResult[] = [];
  for (const r of rows) {
    const event = bySlug.get(r.event);
    if (!event || !r.bo || r.teams.length !== 2 || r.score.length !== 2) continue;
    const teams = r.teams.map(([vlrId, slug, name]) => {
      if (vlrId === null || !name) return null;
      const row = event.teams.find((t) => t.id === vlrId);
      return {
        vlrId,
        teamId: resolve(row ?? { id: vlrId, slug: slug ?? String(vlrId) }),
        name: row?.name ?? name,
      };
    });
    const [a, b] = teams;
    const [sa, sb] = r.score;
    if (!a || !b || sa === null || sa === undefined || sb === null || sb === undefined) continue;
    out.push({
      id: r.id,
      eventId: r.event,
      eventName: event.shortName,
      tier: event.tier,
      year: event.year,
      stage: r.stage,
      round: r.round,
      date: r.date,
      bestOf: r.bo,
      teams: [a, b],
      score: [sa, sb],
      maps: r.maps
        .filter((m): m is [string, number, number, number | null] => m[0] !== null)
        .map(([map, x, y, picked]) => ({ map, score: [x, y], pickedBy: picked === 1 ? 0 : picked === 2 ? 1 : null })),
    });
  }
  return out;
}

/** Every usable series of the snapshot, oldest first. */
export const SERIES: readonly SeriesResult[] = buildSeries(
  (seriesJson as unknown as { series: RawSeries[] }).series,
  slimJson as VlrEventData[],
);
