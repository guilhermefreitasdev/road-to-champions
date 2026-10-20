import { describe, expect, it } from 'vitest';
import { SAMPLE_AURORA, SAMPLE_TEMPESTADE } from '../data/sample';
import { createRng } from '../engine/rng';
import { simulateSeries, type SeriesResult } from '../engine/series';
import { mapTimeline, seriesTimeline, timelineLength, type KillTimelineEvent, type RoundEndEvent, type TimelineEvent } from './timeline';

const POOL = ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset', 'Abyss'];
const series = (seed: string, bestOf: 1 | 3 | 5 = 3): SeriesResult =>
  simulateSeries(SAMPLE_AURORA, SAMPLE_TEMPESTADE, createRng(seed), { bestOf, pool: POOL, formSeed: seed });

const ofType = <T extends TimelineEvent['type']>(events: TimelineEvent[], type: T) =>
  events.filter((e): e is Extract<TimelineEvent, { type: T }> => e.type === type);

describe('seriesTimeline', () => {
  it('has one timeline per map, with event counts matching the map result', () => {
    for (let i = 0; i < 20; i++) {
      const s = series(`tl-${i}`, i % 2 ? 3 : 5);
      const timeline = seriesTimeline(s);
      expect(timeline).toHaveLength(s.maps.length);
      timeline.forEach((t, k) => {
        const m = s.maps[k]!;
        expect(t.map).toBe(m.map);
        expect(t.mapNumber).toBe(k + 1);
        expect(t.events).toHaveLength(timelineLength(m));
        expect(ofType(t.events, 'map-start')).toHaveLength(1);
        expect(ofType(t.events, 'map-end')).toHaveLength(1);
        expect(ofType(t.events, 'round-start')).toHaveLength(m.rounds.length);
        expect(ofType(t.events, 'round-end')).toHaveLength(m.rounds.length);
        expect(ofType(t.events, 'kill')).toHaveLength(m.rounds.reduce((n, r) => n + r.kills.length, 0));
        expect(t.events[0]!.type).toBe('map-start');
        expect(t.events[t.events.length - 1]!.type).toBe('map-end');
      });
    }
  });

  it('is deterministic and does not touch the series', () => {
    const s = series('det');
    const before = JSON.stringify(s);
    expect(seriesTimeline(s)).toEqual(seriesTimeline(series('det')));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('keeps the scores, kills and stats consistent with the scoreboard', () => {
    const s = series('consistent', 5);
    const timeline = seriesTimeline(s);
    timeline.forEach((t, k) => {
      const m = s.maps[k]!;
      const ends = ofType(t.events, 'round-end');
      expect(ends[ends.length - 1]!.score).toEqual(m.score);
      const mapEnd = ofType(t.events, 'map-end')[0]!;
      expect(mapEnd.score).toEqual(m.score);
      expect(mapEnd.winner).toBe(m.winner);
      const mvp = [...m.players[0], ...m.players[1]].find((l) => l.mvp)!;
      expect(mapEnd.mvp?.cardId).toBe(mvp.cardId);
      // Each round-start carries the score before the round.
      const starts = ofType(t.events, 'round-start');
      starts.forEach((st, r) => expect(st.score).toEqual(r === 0 ? [0, 0] : ends[r - 1]!.score));
      // Kills per player add up to the scoreboard.
      const kills = new Map<string, number>();
      for (const e of ofType(t.events, 'kill')) kills.set(e.killer.cardId, (kills.get(e.killer.cardId) ?? 0) + 1);
      for (const line of [...m.players[0], ...m.players[1]]) expect(kills.get(line.cardId) ?? 0).toBe(line.kills);
      // First kills too.
      const fk = ofType(t.events, 'kill').filter((e) => e.firstKill);
      expect(fk).toHaveLength(m.rounds.length - m.rounds.filter((r) => r.kills.length === 0).length);
    });
    // Series score: map-start before, map-end after.
    const last = timeline[timeline.length - 1]!;
    expect((last.events[last.events.length - 1] as { seriesScore: [number, number] }).seriesScore).toEqual(s.score);
    expect((timeline[0]!.events[0] as { seriesScore: [number, number] }).seriesScore).toEqual([0, 0]);
  });

  it('flags multikills, aces, clutches and flawless rounds from the kill order', () => {
    let aces = 0;
    let clutches = 0;
    for (let i = 0; i < 30; i++) {
      for (const t of seriesTimeline(series(`flags-${i}`))) {
        let roundKills: KillTimelineEvent[] = [];
        for (const e of t.events) {
          if (e.type === 'round-start') roundKills = [];
          if (e.type === 'kill') {
            roundKills.push(e);
            expect(e.multikill).toBe(roundKills.filter((k) => k.killer.cardId === e.killer.cardId).length);
            expect(e.killer.team).not.toBe(e.victim.team);
            expect(e.alive[0]).toBeGreaterThanOrEqual(0);
          }
          if (e.type === 'round-end') {
            const end: RoundEndEvent = e;
            const lost = roundKills.filter((k) => k.victim.team === end.winner).length;
            expect(end.flawless).toBe(lost === 0);
            if (end.ace) {
              aces++;
              expect(roundKills.filter((k) => k.killer.cardId === end.ace!.cardId)).toHaveLength(5);
            }
            if (end.clutch) {
              clutches++;
              expect(end.clutch.player.team).toBe(end.winner);
              expect(end.clutch.versus).toBeGreaterThanOrEqual(1);
              expect(roundKills.some((k) => k.victim.cardId === end.clutch!.player.cardId)).toBe(false);
              expect(lost).toBe(4);
            }
          }
        }
      }
    }
    expect(clutches).toBeGreaterThan(0);
    expect(aces).toBeGreaterThanOrEqual(0);
  });

  it('carries the agent each player used on the map', () => {
    const s = series('agents');
    const m = s.maps[0]!;
    const events = mapTimeline(m);
    const kill = ofType(events, 'kill')[0]!;
    const line = [...m.players[0], ...m.players[1]].find((l) => l.cardId === kill.killer.cardId)!;
    expect(kill.killer.agent).toBe(line.agent);
    expect(kill.killer.handle).toBe(line.handle);
  });
});
