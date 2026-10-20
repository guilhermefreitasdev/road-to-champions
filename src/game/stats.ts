/**
 * Player statistics over many series, for the "Estatísticas" tab: K/D/A, ACS, estimated rating, KAST, first
 * kills and deaths, multikills, MVPs and a per-agent breakdown. Pure selectors over SeriesResult (the numbers
 * are the simulator's, never real stats).
 */
import type { PlayerLine } from '../engine/match';
import type { SeriesResult } from '../engine/series';
import { USER_ID, type RunState } from './run';
import { findSeasonMatch, type SeasonState } from './season';

export interface AgentStatLine {
  agent: string;
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  /** Kills / deaths (kills when he never died), 2 decimals. */
  kd: number;
  /** Rounds-weighted estimated rating, 2 decimals. */
  rating: number;
  /** Rounds-weighted ACS. */
  acs: number;
}

export interface PlayerStatsLine {
  cardId: string;
  handle: string;
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Kills / deaths (kills when he never died), 2 decimals. */
  kd: number;
  /** Rounds-weighted ACS. */
  acs: number;
  /** Rounds-weighted estimated rating, 2 decimals. */
  rating: number;
  /** Rounds-weighted KAST, %. */
  kast: number;
  firstKills: number;
  firstDeaths: number;
  k3: number;
  k4: number;
  aces: number;
  /** Map MVPs (best rating of the 10). */
  mvps: number;
  /** Series MVPs. */
  seriesMvps: number;
  /** Per agent, most maps first (maps where the sim picked no agent are left out). */
  agents: AgentStatLine[];
}

interface Acc {
  maps: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  acs: number;
  rating: number;
  kast: number;
}

const zero = (): Acc => ({ maps: 0, rounds: 0, kills: 0, deaths: 0, assists: 0, acs: 0, rating: 0, kast: 0 });

function add(acc: Acc, line: PlayerLine, rounds: number): void {
  acc.maps++;
  acc.rounds += rounds;
  acc.kills += line.kills;
  acc.deaths += line.deaths;
  acc.assists += line.assists;
  acc.acs += line.acs * rounds;
  acc.rating += line.rating * rounds;
  acc.kast += line.kast * rounds;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const kd = (kills: number, deaths: number): number => round2(deaths > 0 ? kills / deaths : kills);
const avg = (sum: number, rounds: number): number => (rounds > 0 ? sum / rounds : 0);

/**
 * Aggregated stats of the players in `results`, keyed by card id. With `ids`, only those card ids (e.g. the user's
 * five); without, every player. Sorted by rating, then ACS, then handle.
 */
export function playerStats(results: readonly SeriesResult[], ids?: Iterable<string>): PlayerStatsLine[] {
  const only = ids ? new Set(ids) : null;
  const totals = new Map<string, { handle: string; acc: Acc; fk: number; fd: number; k3: number; k4: number; aces: number; mvps: number; seriesMvps: number; agents: Map<string, Acc> }>();
  for (const series of results) {
    for (const map of series.maps) {
      const rounds = map.rounds.length;
      for (const line of [...map.players[0], ...map.players[1]]) {
        if (only && !only.has(line.cardId)) continue;
        let t = totals.get(line.cardId);
        if (!t) {
          t = { handle: line.handle, acc: zero(), fk: 0, fd: 0, k3: 0, k4: 0, aces: 0, mvps: 0, seriesMvps: 0, agents: new Map() };
          totals.set(line.cardId, t);
        }
        add(t.acc, line, rounds);
        t.fk += line.firstKills;
        t.fd += line.firstDeaths;
        t.k3 += line.multikills.k3;
        t.k4 += line.multikills.k4;
        t.aces += line.multikills.k5;
        if (line.mvp) t.mvps++;
        if (line.agent) {
          const a = t.agents.get(line.agent) ?? zero();
          add(a, line, rounds);
          t.agents.set(line.agent, a);
        }
      }
    }
    const t = totals.get(series.mvp.cardId);
    if (t && series.maps.length > 0) t.seriesMvps++;
  }
  return [...totals.entries()]
    .map(([cardId, t]): PlayerStatsLine => ({
      cardId,
      handle: t.handle,
      maps: t.acc.maps,
      rounds: t.acc.rounds,
      kills: t.acc.kills,
      deaths: t.acc.deaths,
      assists: t.acc.assists,
      kd: kd(t.acc.kills, t.acc.deaths),
      acs: Math.round(avg(t.acc.acs, t.acc.rounds)),
      rating: round2(avg(t.acc.rating, t.acc.rounds)),
      kast: Math.round(avg(t.acc.kast, t.acc.rounds)),
      firstKills: t.fk,
      firstDeaths: t.fd,
      k3: t.k3,
      k4: t.k4,
      aces: t.aces,
      mvps: t.mvps,
      seriesMvps: t.seriesMvps,
      agents: [...t.agents.entries()]
        .map(([agent, a]) => ({
          agent,
          maps: a.maps,
          rounds: a.rounds,
          kills: a.kills,
          deaths: a.deaths,
          kd: kd(a.kills, a.deaths),
          rating: round2(avg(a.rating, a.rounds)),
          acs: Math.round(avg(a.acs, a.rounds)),
        }))
        .sort((x, y) => y.maps - x.maps || y.rating - x.rating || x.agent.localeCompare(y.agent)),
    }))
    .sort((x, y) => y.rating - x.rating || y.acs - x.acs || x.handle.localeCompare(y.handle));
}

/** The user's side of each series, with the card ids of his five. */
function userSide(entries: { series: SeriesResult; side: 0 | 1 }[]): { results: SeriesResult[]; ids: Set<string> } {
  const ids = new Set<string>();
  for (const { series, side } of entries) for (const m of series.maps) for (const line of m.players[side]) ids.add(line.cardId);
  return { results: entries.map((e) => e.series), ids };
}

/** Stats of the user's players over every series of the run. */
export function runPlayerStats(run: RunState): PlayerStatsLine[] {
  const entries: { series: SeriesResult; side: 0 | 1 }[] = [];
  for (const [matchId, series] of Object.entries(run.userSeries)) {
    const match = run.tournament?.matches.find((m) => m.id === matchId);
    if (match) entries.push({ series, side: match.a === USER_ID ? 0 : 1 });
  }
  const { results, ids } = userSide(entries);
  return playerStats(results, ids);
}

/** Stats of the user's players over every series of the season (league, Masters and Champions). */
export function seasonPlayerStats(s: SeasonState): PlayerStatsLine[] {
  const entries: { series: SeriesResult; side: 0 | 1 }[] = [];
  for (const [key, series] of Object.entries(s.userSeries)) {
    const found = findSeasonMatch(s, key);
    if (found) entries.push({ series, side: found.match.a === USER_ID ? 0 : 1 });
  }
  const { results, ids } = userSide(entries);
  return playerStats(results, ids);
}
