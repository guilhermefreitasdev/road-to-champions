/**
 * Per-player stats of the user's five over a run or a season, for the Stats screen and the history snapshot: a thin
 * adapter over src/game/stats.ts (the source of truth) to the shape the UI and the stored history use.
 */
import type { SeriesResult } from '../engine/series';
import type { TeamIndex } from '../engine/types';
import { USER_ID, type RunState } from '../game/run';
import type { SeasonState } from '../game/season';
import { runPlayerStats, seasonPlayerStats, type AgentStatLine, type PlayerStatsLine } from '../game/stats';

export type AgentLine = AgentStatLine;

export interface PlayerStatsRow {
  cardId: string;
  handle: string;
  /**
   * OVR the player played at (card OVR + tournament form + prodigy growth), from the sim. Absent in history entries
   * recorded before it existed.
   */
  ovr?: number;
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  acs: number;
  rating: number;
  /** % of rounds with a kill, assist, survival or trade. */
  kast: number;
  fk: number;
  fd: number;
  k3: number;
  k4: number;
  aces: number;
  /** Maps where the player was the MVP (best rating of the 10). */
  mvps: number;
  seriesMvps: number;
  agents: AgentLine[];
}

export function toRow(p: PlayerStatsLine & { ovr?: number }): PlayerStatsRow {
  return {
    cardId: p.cardId,
    handle: p.handle,
    ...(typeof p.ovr === 'number' ? { ovr: p.ovr } : {}),
    maps: p.maps,
    rounds: p.rounds,
    kills: p.kills,
    deaths: p.deaths,
    assists: p.assists,
    kd: p.kd,
    acs: p.acs,
    rating: p.rating,
    kast: p.kast,
    fk: p.firstKills,
    fd: p.firstDeaths,
    k3: p.k3,
    k4: p.k4,
    aces: p.aces,
    mvps: p.mvps,
    seriesMvps: p.seriesMvps,
    agents: p.agents,
  };
}

export function runStats(run: RunState): PlayerStatsRow[] {
  return runPlayerStats(run).map(toRow);
}

export function seasonStats(s: SeasonState): PlayerStatsRow[] {
  return seasonPlayerStats(s).map(toRow);
}

/** One played series and the user's side in it. */
export interface UserSeries {
  series: SeriesResult;
  side: TeamIndex;
}

/** The user's series of a main-mode run, in play order. */
export function runUserSeries(run: RunState): UserSeries[] {
  const out: UserSeries[] = [];
  for (const match of run.tournament?.matches ?? []) {
    const series = run.userSeries[match.id];
    if (series) out.push({ series, side: match.a === USER_ID ? 0 : 1 });
  }
  return out;
}
