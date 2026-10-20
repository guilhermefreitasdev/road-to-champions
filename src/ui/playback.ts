/**
 * Real-time playback of an already simulated series: the engine's timeline (src/game/timeline.ts) flattened into
 * one list of timed events, and the view state at any point of it. Presentation only: nothing here changes the
 * result, and skipping just jumps to the last event.
 */
import type { SeriesResult } from '../engine/series';
import type { TeamIndex } from '../engine/types';
import { seriesTimeline } from '../game/timeline';

export type PlaybackEvent =
  | { kind: 'map-start'; map: number }
  | { kind: 'round-start'; map: number; round: number }
  | { kind: 'kill'; map: number; round: number; killer: string; victim: string; team: TeamIndex; streak: number; alive: [number, number] }
  | { kind: 'round-end'; map: number; round: number; winner: TeamIndex; clutch?: { player: string; versus: number } }
  | { kind: 'map-end'; map: number };

export type Speed = 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [1, 2, 4];

/** Milliseconds each event holds the screen at 1x. */
export const EVENT_MS: Record<PlaybackEvent['kind'], number> = {
  'map-start': 1400,
  'round-start': 250,
  kill: 380,
  'round-end': 700,
  'map-end': 3200,
};

export function eventDelay(event: PlaybackEvent, speed: Speed): number {
  return EVENT_MS[event.kind] / speed;
}

/** Every event of the series, in order (rounds 0-based here; the timeline numbers them from 1). */
export function buildEvents(series: SeriesResult): PlaybackEvent[] {
  const events: PlaybackEvent[] = [];
  seriesTimeline(series).forEach((t, m) => {
    for (const e of t.events) {
      switch (e.type) {
        case 'map-start':
          events.push({ kind: 'map-start', map: m });
          break;
        case 'round-start':
          events.push({ kind: 'round-start', map: m, round: e.round - 1 });
          break;
        case 'kill':
          events.push({
            kind: 'kill', map: m, round: e.round - 1, killer: e.killer.cardId, victim: e.victim.cardId, team: e.killer.team, streak: e.multikill, alive: [...e.alive],
          });
          break;
        case 'round-end': {
          const end: PlaybackEvent = { kind: 'round-end', map: m, round: e.round - 1, winner: e.winner };
          if (e.clutch && e.clutch.versus >= 2) end.clutch = { player: e.clutch.player.cardId, versus: e.clutch.versus };
          events.push(end);
          break;
        }
        case 'map-end':
          events.push({ kind: 'map-end', map: m });
          break;
      }
    }
  });
  return events;
}

export interface FeedKill {
  /** Index of the event (stable React key). */
  id: number;
  killer: string;
  victim: string;
  team: TeamIndex;
  streak: number;
}

export interface PlaybackView {
  /** Map on screen (0-based). */
  map: number;
  /** Rounds finished on that map. */
  roundsDone: number;
  /** Round being played (0-based), or null between rounds. */
  round: number | null;
  score: [number, number];
  /** Maps won by each team, counting only finished maps. */
  seriesScore: [number, number];
  /** Maps whose scoreboard is revealed. */
  mapsDone: number;
  /** Kills of the current (or just finished) round, newest last. */
  feed: FeedKill[];
  /** Players alive on each team in the current round. */
  alive: [number, number];
  /** 3K / 4K / ACE of the round (the latest), or a 1vN clutch once the round ends. */
  callout: { killer: string; streak: number } | { clutch: string; versus: number } | null;
  /** Winner of the round that just ended (between round-end and the next round-start). */
  lastWinner: TeamIndex | null;
  finished: boolean;
}

/** View state after the first `cursor` events have played. */
export function viewAt(series: SeriesResult, events: readonly PlaybackEvent[], cursor: number): PlaybackView {
  const v: PlaybackView = {
    map: 0, roundsDone: 0, round: null, score: [0, 0], seriesScore: [0, 0], mapsDone: 0,
    feed: [], alive: [5, 5], callout: null, lastWinner: null, finished: false,
  };
  const end = Math.min(cursor, events.length);
  for (let i = 0; i < end; i++) {
    const e = events[i]!;
    switch (e.kind) {
      case 'map-start':
        v.map = e.map;
        v.roundsDone = 0;
        v.round = null;
        v.score = [0, 0];
        v.feed = [];
        v.callout = null;
        v.lastWinner = null;
        v.alive = [5, 5];
        break;
      case 'round-start':
        v.round = e.round;
        v.feed = [];
        v.callout = null;
        v.lastWinner = null;
        v.alive = [5, 5];
        break;
      case 'kill': {
        v.feed.push({ id: i, killer: e.killer, victim: e.victim, team: e.team, streak: e.streak });
        v.alive = [...e.alive];
        if (e.streak >= 3) v.callout = { killer: e.killer, streak: e.streak };
        break;
      }
      case 'round-end':
        v.score[e.winner]++;
        v.roundsDone = e.round + 1;
        v.round = null;
        v.lastWinner = e.winner;
        if (e.clutch && !(v.callout && 'killer' in v.callout && v.callout.streak === 5)) v.callout = { clutch: e.clutch.player, versus: e.clutch.versus };
        break;
      case 'map-end': {
        const winner = series.maps[e.map]!.winner;
        v.seriesScore[winner]++;
        v.mapsDone = e.map + 1;
        break;
      }
    }
  }
  v.finished = end >= events.length;
  return v;
}

const SPEED_KEY = 'rtc:playback-speed';

/** Last chosen playback speed (1x by default; storage failures fall back to it). */
export function loadSpeed(): Speed {
  try {
    const n = Number(window.localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(n) ? (n as Speed) : 1;
  } catch {
    return 1;
  }
}

export function saveSpeed(speed: Speed): void {
  try {
    window.localStorage.setItem(SPEED_KEY, String(speed));
  } catch {
    // Ignore: the speed just isn't remembered.
  }
}
