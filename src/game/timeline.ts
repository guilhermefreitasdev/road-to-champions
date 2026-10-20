/**
 * Real-time playback of a series: the map results turned into an ordered list of events per map (map start, round
 * start, every kill, round end, map end), for the Series screen to animate at 1x/2x/4x or skip to the end. Pure and
 * deterministic: it only reads the SeriesResult, so the playback always matches the scoreboard.
 */
import type { MapResult, Side } from '../engine/match';
import type { SeriesResult } from '../engine/series';
import type { MapName, TeamIndex } from '../engine/types';

export interface TimelinePlayer {
  cardId: string;
  handle: string;
  team: TeamIndex;
  /** Agent he played on this map, when the sim picked one. */
  agent?: string;
}

export interface MapStartEvent {
  type: 'map-start';
  map: MapName;
  /** 1-based position in the series. */
  mapNumber: number;
  /** Series score before this map. */
  seriesScore: [number, number];
  teamAStartsOn: Side;
}

export interface RoundStartEvent {
  type: 'round-start';
  round: number;
  teamASide: Side;
  /** Map score before the round. */
  score: [number, number];
  overtime: boolean;
}

export interface KillTimelineEvent {
  type: 'kill';
  round: number;
  killer: TimelinePlayer;
  victim: TimelinePlayer;
  assister?: TimelinePlayer;
  /** First kill of the round. */
  firstKill: boolean;
  /** Kills of the killer in this round so far, this one included (2 = double kill… 5 = ace). */
  multikill: number;
  /** Players alive on each team after this kill. */
  alive: [number, number];
}

export interface RoundEndEvent {
  type: 'round-end';
  round: number;
  winner: TeamIndex;
  /** Map score after the round. */
  score: [number, number];
  /** A player who killed all five. */
  ace?: TimelinePlayer;
  /** The winner's last player standing, and how many opponents were alive when he was left alone (1vN). */
  clutch?: { player: TimelinePlayer; versus: number };
  /** The winner lost nobody. */
  flawless: boolean;
}

export interface MapEndEvent {
  type: 'map-end';
  map: MapName;
  winner: TeamIndex;
  score: [number, number];
  /** Series score after this map. */
  seriesScore: [number, number];
  /** Best estimated rating of the 10 on the map. */
  mvp?: TimelinePlayer & { rating: number };
}

export type TimelineEvent = MapStartEvent | RoundStartEvent | KillTimelineEvent | RoundEndEvent | MapEndEvent;

export interface MapTimeline {
  map: MapName;
  mapNumber: number;
  events: TimelineEvent[];
}

const TEAM_SIZE = 5;
const REGULATION_ROUNDS = 24;

/** Ordered events of every map of a series. */
export function seriesTimeline(series: Pick<SeriesResult, 'maps'>): MapTimeline[] {
  const seriesScore: [number, number] = [0, 0];
  return series.maps.map((m, i) => {
    const events = mapTimeline(m, i + 1, [...seriesScore]);
    seriesScore[m.winner]++;
    return { map: m.map, mapNumber: i + 1, events };
  });
}

/** Ordered events of one map; `seriesScore` is the score before it (map-end's seriesScore counts this map). */
export function mapTimeline(m: MapResult, mapNumber = 1, seriesScore: [number, number] = [0, 0]): TimelineEvent[] {
  const players = new Map<string, TimelinePlayer>();
  ([0, 1] as const).forEach((team) => {
    for (const line of m.players[team]) {
      const p: TimelinePlayer = { cardId: line.cardId, handle: line.handle, team };
      if (line.agent) p.agent = line.agent;
      players.set(line.cardId, p);
    }
  });
  const who = (cardId: string): TimelinePlayer => players.get(cardId) ?? { cardId, handle: cardId, team: 0 };

  const first = m.rounds[0];
  const events: TimelineEvent[] = [
    { type: 'map-start', map: m.map, mapNumber, seriesScore: [...seriesScore], teamAStartsOn: first?.teamASide ?? 'attack' },
  ];
  const score: [number, number] = [0, 0];
  for (const round of m.rounds) {
    events.push({ type: 'round-start', round: round.number, teamASide: round.teamASide, score: [...score], overtime: round.number > REGULATION_ROUNDS });
    const alive: [number, number] = [TEAM_SIZE, TEAM_SIZE];
    const killsBy = new Map<string, number>();
    const winner = round.winner;
    const loser: TeamIndex = winner === 0 ? 1 : 0;
    let clutch: RoundEndEvent['clutch'];
    const dead = new Set<string>();
    round.kills.forEach((k, idx) => {
      const killer = who(k.killer);
      const victim = who(k.victim);
      alive[victim.team]--;
      dead.add(k.victim);
      const n = (killsBy.get(k.killer) ?? 0) + 1;
      killsBy.set(k.killer, n);
      const event: KillTimelineEvent = { type: 'kill', round: round.number, killer, victim, firstKill: idx === 0, multikill: n, alive: [...alive] };
      if (k.assister) event.assister = who(k.assister);
      events.push(event);
      if (!clutch && victim.team === winner && alive[winner] === 1 && alive[loser] > 0) {
        const last = m.players[winner].find((l) => !dead.has(l.cardId));
        if (last) clutch = { player: who(last.cardId), versus: alive[loser] };
      }
    });
    score[winner]++;
    const end: RoundEndEvent = { type: 'round-end', round: round.number, winner, score: [...score], flawless: alive[winner] === TEAM_SIZE };
    const ace = [...killsBy.entries()].find(([, n]) => n >= TEAM_SIZE);
    if (ace) end.ace = who(ace[0]);
    if (clutch) end.clutch = clutch;
    events.push(end);
  }
  const mvpLine = [...m.players[0], ...m.players[1]].find((l) => l.mvp);
  const end: MapEndEvent = { type: 'map-end', map: m.map, winner: m.winner, score: [...m.score], seriesScore: [...seriesScore] };
  end.seriesScore[m.winner]++;
  if (mvpLine) end.mvp = { ...who(mvpLine.cardId), rating: mvpLine.rating };
  events.push(end);
  return events;
}

/** Number of events of a map timeline: 2 + 2 per round + 1 per kill (what the playback tests check). */
export function timelineLength(m: Pick<MapResult, 'rounds'>): number {
  return 2 + m.rounds.reduce((s, r) => s + 2 + r.kills.length, 0);
}
